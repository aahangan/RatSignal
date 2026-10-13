"""Measures how the forecasts RatSignal actually served turned out, once their horizon has passed.

    uv run python -m riskmodel.monitor [--cached] [--dry-run]

For every served forecast date whose 60-day window has closed (plus publication lag) and that hasn't been
evaluated, compares the restaurants we ranked highest with who actually got a pest violation, alongside the
two baselines recomputed for that same date. A falling precision is the signal to retrain.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone

import pandas as pd
import requests

from . import data
from . import features as F
from .score import api_config, report_errors
from .train import add_rule_baseline


def _get(path: str) -> dict:
    url, secret = api_config()
    res = requests.get(f"{url}{path}", headers={"Authorization": f"Bearer {secret}"}, timeout=60)
    res.raise_for_status()
    return res.json()


def evaluate_served(date: pd.Timestamp, served: dict, insp: pd.DataFrame, info: pd.DataFrame, rodents, rat_fail) -> dict:
    feats = add_rule_baseline(F.features_at(date, insp, info, rodents, rat_fail))
    labels = F.labels_at(date, insp, feats.index)
    hit = labels["y"]
    top_ids = [i.removeprefix("nyc:") for i, _ in served["top"]]

    def precision(ids: list[str]) -> float:
        known = [i for i in ids if i in hit.index]
        return float(hit.loc[known].mean()) if known else float("nan")

    zip_prec = [precision([i.removeprefix("nyc:") for i in ids[:5]]) for ids in served["zips"].values() if len(ids) >= 5]
    out = {
        "precision_at_100": precision(top_ids[:100]),
        "precision_at_500": precision(top_ids[:500]),
        "zip_precision_at_5": float(pd.Series(zip_prec).mean()),
        "base_rate": float(hit.mean()),
    }
    for baseline in ("heuristic", "rule"):
        out[f"{baseline}_precision_at_100"] = float(hit.loc[feats.nlargest(100, baseline).index].mean())
    return {k: round(v, 4) for k, v in out.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cached", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    status = _get("/api/admin/risk")
    violations = data.load_violations(refresh=not args.cached)
    insp, info = F.build_inspections(violations), F.restaurant_info(violations)
    rodents, rat_fail = data.load_rodent_311(refresh=not args.cached), data.load_rat_failures(refresh=not args.cached)
    complete_before = insp["inspection_date"].max() - pd.Timedelta(days=F.LAG_DAYS)

    due = [r["date"] for r in status["runs"]
           if not r["evaluation"] and pd.Timestamp(r["date"]) + pd.Timedelta(days=F.HORIZON_DAYS) <= complete_before]
    print(f"{len(due)} served forecasts ready to evaluate")
    for d in sorted(due):
        metrics = evaluate_served(pd.Timestamp(d), _get(f"/api/admin/risk?date={d}"), insp, info, rodents, rat_fail)
        print(d, metrics)
        if not args.dry_run:
            body = {"date": d, "evaluatedAt": datetime.now(timezone.utc).isoformat(), "metrics": metrics}
            url, secret = api_config()
            requests.post(f"{url}/api/admin/risk?kind=evaluation", json=body,
                          headers={"Authorization": f"Bearer {secret}"}, timeout=60).raise_for_status()


if __name__ == "__main__":
    report_errors(main)
