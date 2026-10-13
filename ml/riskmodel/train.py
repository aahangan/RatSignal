"""Train and evaluate the pest-violation risk model.

    uv run python -m riskmodel.train [--refresh]

Builds twice-monthly snapshots, splits them by time (train -> validation -> test, with a gap of one label
horizon between them so no training label overlaps a later period), compares the current heuristic,
logistic regression and gradient-boosted trees, then refits the chosen model on every labeled snapshot
and saves it with a report.
"""

from __future__ import annotations

import argparse
import json
import pickle
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder, StandardScaler

from . import data, evaluate
from . import features as F

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "risk_model.pkl"
REPORT_DIR = ROOT / "reports"

FIRST_SNAPSHOT = "2025-01-01"  # earlier snapshots lack a full year of reliable history
VALID_START = pd.Timestamp("2025-11-01")
TEST_START = pd.Timestamp("2026-04-01")
GAP = pd.Timedelta(days=F.HORIZON_DAYS)
SEED = 7


def logistic(C: float) -> Pipeline:
    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("log", FunctionTransformer(lambda x: __import__("numpy").log1p(x.clip(min=0)), feature_names_out="one-to-one")),
        ("scale", StandardScaler()),
    ])
    pre = ColumnTransformer([
        ("num", numeric, F.NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=50), F.CATEGORICAL),
    ])
    return Pipeline([("pre", pre), ("model", LogisticRegression(C=C, max_iter=3000))])


def boosted(learning_rate: float, max_leaf_nodes: int, min_samples_leaf: int, max_iter: int) -> Pipeline:
    pre = ColumnTransformer(
        [("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1, encoded_missing_value=-1), F.CATEGORICAL)],
        remainder="passthrough", verbose_feature_names_out=False,
    )
    model = HistGradientBoostingClassifier(
        learning_rate=learning_rate, max_leaf_nodes=max_leaf_nodes, min_samples_leaf=min_samples_leaf,
        # No built-in early stopping: its random holdout shares restaurants with the training snapshots, which
        # leaks and overfits. The number of rounds is tuned on the time-based validation period instead.
        max_iter=max_iter, early_stopping=False,
        categorical_features=list(range(len(F.CATEGORICAL))), l2_regularization=1.0, random_state=SEED,
    )
    return Pipeline([("pre", pre.set_output(transform="pandas")), ("model", model)])


CANDIDATES = {
    **{f"logistic_C{c}": (lambda c=c: logistic(c)) for c in (0.1, 1.0)},
    **{f"gbt_lr0.05_leaves{l}_min{m}_iter{n}": (lambda l=l, m=m, n=n: boosted(0.05, l, m, n))
       for l in (7, 15, 31) for m in (400, 1000) for n in (100, 200, 400)},
}


def build(refresh: bool) -> tuple[pd.DataFrame, dict]:
    violations = data.load_violations(refresh=refresh)
    insp, info = F.build_inspections(violations), F.restaurant_info(violations)
    rodents, rat_fail = data.load_rodent_311(refresh=refresh), data.load_rat_failures(refresh=refresh)
    data_end = insp["inspection_date"].max()
    last = data_end - pd.Timedelta(days=F.LAG_DAYS + F.HORIZON_DAYS)
    cuisines = F.top_cuisines(info)
    ds = F.build_dataset(F.snapshot_dates(FIRST_SNAPSHOT, str(last.date())), insp, info, rodents, rat_fail, cuisines)
    meta = {"data_end": str(data_end.date()), "last_labeled_snapshot": str(ds["snapshot"].max().date()),
            "violation_rows": int(len(violations)), "inspections": int(len(insp)), "top_cuisines": cuisines}
    return ds, meta


def add_rule_baseline(ds: pd.DataFrame) -> pd.DataFrame:
    """A hand-written rule an analyst might try: re-inspection pending, pests last time, worst score first."""
    ds["rule"] = ds["pending_reinspection"] * 1000 + ds["last_pest"] * 300 + ds["last_score"].fillna(0) \
        + ds["n_pest_insp_365"] * 10 - ds["days_since_last_insp"] / 1000
    return ds


def split(ds: pd.DataFrame) -> dict[str, pd.DataFrame]:
    s = ds["snapshot"]
    return {
        "train": ds[s <= VALID_START - GAP],
        "valid": ds[(s >= VALID_START) & (s <= TEST_START - GAP)],
        "test": ds[s >= TEST_START],
    }


def describe(name: str, df: pd.DataFrame) -> dict:
    return {"snapshots": int(df["snapshot"].nunique()), "rows": int(len(df)), "first": str(df["snapshot"].min().date()),
            "last": str(df["snapshot"].max().date()), "base_rate": round(evaluate.base_rate(df), 4)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="re-download the source data")
    args = parser.parse_args()

    ds, meta = build(args.refresh)
    ds = add_rule_baseline(ds)
    parts = split(ds)
    for name, df in parts.items():
        print(f"{name}: {describe(name, df)}")
    X = lambda df: df[F.FEATURES]  # noqa: E731

    # 1. Model selection on the validation period.
    valid = parts["valid"].copy()
    results: dict[str, dict] = {b: evaluate.summarize(valid, b) for b in ("heuristic", "rule")}
    for name, make in CANDIDATES.items():
        model = make().fit(X(parts["train"]), parts["train"]["y"])
        valid["prob"] = model.predict_proba(X(valid))[:, 1]
        results[name] = evaluate.summarize(valid, "prob")
        print(f"  {name}: AP {results[name]['average_precision']:.4f}  p@100 {results[name]['precision_at_100']:.3f}")
    best_logistic = max((n for n in CANDIDATES if n.startswith("logistic")), key=lambda n: results[n]["average_precision"])
    best_gbt = max((n for n in CANDIDATES if n.startswith("gbt")), key=lambda n: results[n]["average_precision"])

    # 2. Final comparison on the untouched test period, training on train + validation.
    fit_df = pd.concat([parts["train"], parts["valid"][parts["valid"]["snapshot"] <= TEST_START - GAP]])
    test = parts["test"].copy()
    test_results = {b: evaluate.summarize(test, b) for b in ("heuristic", "rule")}
    models = {}
    for name in (best_logistic, best_gbt):
        models[name] = CANDIDATES[name]().fit(X(fit_df), fit_df["y"])
        test[name] = models[name].predict_proba(X(test))[:, 1]
        test_results[name] = evaluate.summarize(test, name)
    test["prob"] = test[best_gbt]
    calibration = evaluate.calibration_table(test).round(4)
    per_snapshot = test.groupby("snapshot").apply(lambda g: pd.Series({
        "heuristic": g.nlargest(100, "heuristic")["y"].mean(), "rule": g.nlargest(100, "rule")["y"].mean(), "model": g.nlargest(100, "prob")["y"].mean(),
        "base_rate": g["y"].mean()}), include_groups=False)

    sample = test.sample(n=min(40_000, len(test)), random_state=SEED)
    imp = permutation_importance(models[best_gbt], X(sample), sample["y"], scoring="average_precision",
                                 n_repeats=3, random_state=SEED, n_jobs=-1)
    importance = pd.Series(imp.importances_mean, index=F.FEATURES).sort_values(ascending=False)

    # 3. Production model: refit the chosen configuration on every labeled snapshot.
    final = CANDIDATES[best_gbt]().fit(X(ds), ds["y"])
    MODEL_PATH.parent.mkdir(exist_ok=True)
    version = datetime.now(timezone.utc).strftime("%Y%m%d")
    bundle = {"model": final, "features": F.FEATURES, "config": best_gbt, "version": version,
              "top_cuisines": meta["top_cuisines"], "horizon_days": F.HORIZON_DAYS, "lag_days": F.LAG_DAYS,
              "trained_through": meta["last_labeled_snapshot"], "test_metrics": test_results[best_gbt],
              "baseline_test_metrics": {b: test_results[b] for b in ("heuristic", "rule")}}
    with MODEL_PATH.open("wb") as fh:
        pickle.dump(bundle, fh)

    report = {
        "version": version, "data": {k: v for k, v in meta.items() if k != "top_cuisines"},
        "splits": {n: describe(n, df) for n, df in parts.items()},
        "validation": results, "chosen": {"logistic": best_logistic, "gbt": best_gbt},
        "test": test_results, "calibration": calibration.reset_index(drop=True).to_dict("records"),
        "test_precision_at_100_by_snapshot": {str(k.date()): v for k, v in per_snapshot.round(3).to_dict("index").items()},
        "permutation_importance": importance.round(5).head(15).to_dict(),
    }
    REPORT_DIR.mkdir(exist_ok=True)
    (REPORT_DIR / "metrics.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"test": test_results, "importance": report["permutation_importance"]}, indent=2))
    print(calibration.to_string())


if __name__ == "__main__":
    main()
