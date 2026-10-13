"""Point-in-time features and labels.

For a snapshot date `t` we describe every active restaurant using only records that would have been
published before `t` (inspection dates before `t - LAG_DAYS`, and zip aggregates from months that ended
before `t`), then label it 1 if it gets a pest violation in [t, t + horizon).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .data import CONDITIONS_CODE, PEST_CODES

# Inspections reach the open-data portal a few days after they happen.
LAG_DAYS = 4
HORIZON_DAYS = 60
# A restaurant counts as active at `t` if it was inspected in this many days before the cutoff.
ACTIVE_DAYS = 548
INITIAL_TYPES = {"Cycle Inspection / Initial Inspection", "Pre-permit (Operational) / Initial Inspection"}

CATEGORICAL = ["last_type", "last_grade", "cuisine", "boro"]
NUMERIC = [
    "days_since_last_insp", "last_score", "last_closed", "last_pest", "last_conditions", "last_n_critical",
    "pending_reinspection", "days_since_last_pest", "has_pest_history",
    "n_insp_365", "n_pest_insp_365", "n_pest_insp_730", "n_rats_365", "n_mice_365", "n_roaches_365", "n_flies_365",
    "n_conditions_365", "mean_score_365", "max_score_365", "n_closed_730", "days_since_first_insp",
    "zip_pest_rate_365", "zip_rodent_311_3m", "zip_rodent_311_12m", "zip_rat_fail_3m", "zip_rat_fail_12m", "month",
]
FEATURES = NUMERIC + CATEGORICAL
NO_PEST_DAYS = 1000.0  # stand-in for "never cited for pests" in days_since_last_pest


def _type_bucket(t: str) -> str:
    kind, _, stage = t.partition(" / ")
    if not t:
        return "unknown"
    stage = {"Initial Inspection": "initial", "Re-inspection": "reinspection"}.get(stage, "other")
    kind = {"Cycle Inspection": "cycle", "Pre-permit (Operational)": "prepermit"}.get(kind, "other")
    return f"{kind}_{stage}"


def build_inspections(violations: pd.DataFrame) -> pd.DataFrame:
    """Collapses violation rows into one row per inspection (restaurant, date, type)."""
    v = violations
    code = v["violation_code"]
    flags = pd.DataFrame({
        "camis": v["camis"], "inspection_date": v["inspection_date"], "inspection_type": v["inspection_type"],
        "pest": code.isin(PEST_CODES.keys()),
        **{name: code == c for c, name in PEST_CODES.items()},
        "conditions": code == CONDITIONS_CODE,
        "critical": v["critical_flag"].eq("Critical"),
        "closed": v["action"].str.contains("closed by DOHMH", case=False, na=False),
        "score": v["score"],
    })
    keys = ["camis", "inspection_date", "inspection_type"]
    insp = flags.groupby(keys, as_index=False).agg(
        pest=("pest", "any"), rats=("rats", "any"), mice=("mice", "any"), roaches=("roaches", "any"), flies=("flies", "any"),
        conditions=("conditions", "any"), n_critical=("critical", "sum"), closed=("closed", "any"), score=("score", "max"),
    )
    grade = v.groupby(keys, as_index=False)["grade"].agg(lambda g: next((x for x in g if x), ""))
    insp = insp.merge(grade, on=keys, how="left")
    insp["type_bucket"] = insp["inspection_type"].map(_type_bucket)
    insp["is_initial"] = insp["inspection_type"].isin(INITIAL_TYPES)
    return insp.sort_values(["camis", "inspection_date", "inspection_type"]).reset_index(drop=True)


def restaurant_info(violations: pd.DataFrame) -> pd.DataFrame:
    """Latest descriptive fields per restaurant (name, address, phone, zip, cuisine, borough)."""
    latest = violations.sort_values("inspection_date").groupby("camis").tail(1)
    out = latest[["camis", "dba", "building", "street", "boro", "zipcode", "phone", "cuisine_description"]].copy()
    out["address"] = (out["building"].fillna("") + " " + out["street"].fillna("")).str.strip()
    return out.drop(columns=["building", "street"]).set_index("camis")


def _zip_window(counts: pd.DataFrame, t: pd.Timestamp, months: int) -> pd.Series:
    """Sum per zip over the `months` complete calendar months before t's month."""
    end = t.to_period("M").to_timestamp()
    start = end - pd.DateOffset(months=months)
    w = counts[(counts["month"] >= start) & (counts["month"] < end)]
    return w.groupby("zip")["n"].sum()


def features_at(
    t: pd.Timestamp,
    insp: pd.DataFrame,
    info: pd.DataFrame,
    rodent_311: pd.DataFrame,
    rat_failures: pd.DataFrame,
    top_cuisines: list[str] | None = None,
) -> pd.DataFrame:
    """One row per restaurant active at `t`, indexed by camis, using only data available before `t`."""
    t = pd.Timestamp(t).normalize()
    cutoff = t - pd.Timedelta(days=LAG_DAYS)
    past = insp[insp["inspection_date"] < cutoff]
    active = past.loc[past["inspection_date"] >= cutoff - pd.Timedelta(days=ACTIVE_DAYS), "camis"].unique()
    past = past[past["camis"].isin(active)]
    days_ago = (t - past["inspection_date"]).dt.days
    p365, p730 = past[days_ago <= 365], past[days_ago <= 730]

    g = past.groupby("camis")
    last = g.tail(1).set_index("camis")
    f = pd.DataFrame(index=pd.Index(active, name="camis"))
    f["days_since_last_insp"] = (t - last["inspection_date"]).dt.days
    f["last_score"] = last["score"]
    f["last_type"] = last["type_bucket"]
    f["last_grade"] = last["grade"].replace("", "none")
    f["last_closed"] = last["closed"].astype(int)
    f["last_pest"] = last["pest"].astype(int)
    f["last_conditions"] = last["conditions"].astype(int)
    f["last_n_critical"] = last["n_critical"]
    # Initial inspections scoring 14+ (not an A) are followed by a re-inspection within weeks.
    f["pending_reinspection"] = (last["is_initial"] & (last["score"] >= 14)).astype(int)

    pest_dates = past[past["pest"]].groupby("camis")["inspection_date"].max()
    f["days_since_last_pest"] = (t - pest_dates).dt.days.reindex(f.index).fillna(NO_PEST_DAYS).clip(upper=NO_PEST_DAYS)
    f["has_pest_history"] = f.index.isin(pest_dates.index).astype(int)

    def count(df: pd.DataFrame, col: str | None = None) -> pd.Series:
        s = df.groupby("camis").size() if col is None else df.groupby("camis")[col].sum()
        return s.reindex(f.index).fillna(0)

    f["n_insp_365"] = count(p365)
    f["n_pest_insp_365"] = count(p365, "pest")
    f["n_pest_insp_730"] = count(p730, "pest")
    for name in PEST_CODES.values():
        f[f"n_{name}_365"] = count(p365, name)
    f["n_conditions_365"] = count(p365, "conditions")
    f["mean_score_365"] = p365.groupby("camis")["score"].mean().reindex(f.index)
    f["max_score_365"] = p365.groupby("camis")["score"].max().reindex(f.index)
    f["n_closed_730"] = count(p730, "closed")
    f["days_since_first_insp"] = (t - g["inspection_date"].min()).dt.days

    meta = info.reindex(f.index)
    zips = meta["zipcode"].fillna("")
    cuisine = meta["cuisine_description"].fillna("Unknown").replace("", "Unknown")
    if top_cuisines is not None:
        cuisine = cuisine.where(cuisine.isin(top_cuisines), "Other")
    f["cuisine"] = cuisine
    f["boro"] = meta["boro"].fillna("").replace({"": "Unknown", "0": "Unknown"})

    # Share of inspections in the zip that found pests over the past year, shrunk toward the city rate.
    zp = p365.assign(zip=info["zipcode"].reindex(p365["camis"]).to_numpy()).groupby("zip")["pest"].agg(["sum", "count"])
    city_rate = zp["sum"].sum() / max(zp["count"].sum(), 1)
    zip_rate = (zp["sum"] + 20 * city_rate) / (zp["count"] + 20)
    f["zip_pest_rate_365"] = zips.map(zip_rate).fillna(city_rate).to_numpy()
    for name, counts in (("rodent_311", rodent_311), ("rat_fail", rat_failures)):
        for months in (3, 12):
            f[f"zip_{name}_{months}m"] = zips.map(_zip_window(counts, t, months)).fillna(0).to_numpy()
    f["month"] = t.month
    f["zip"] = zips.to_numpy()
    f["heuristic"] = heuristic_score(past, t).reindex(f.index).fillna(0)
    return f


# RatSignal's existing lead heat score (src/engine/normalize.ts scoreLead), applied to each restaurant's most
# recent pest citation in the past year. This is the baseline the model has to beat.
CATEGORY_WEIGHTS = {"rats": 35, "mice": 30, "roaches": 30, "flies": 15}


def heuristic_score(past: pd.DataFrame, t: pd.Timestamp) -> pd.Series:
    pest = past[past["pest"] & (past["inspection_date"] >= t - pd.Timedelta(days=365))]
    if pest.empty:
        return pd.Series(dtype=float)
    last = pest.groupby("camis").tail(1).set_index("camis")
    weights = pd.DataFrame({c: last[c] * w for c, w in CATEGORY_WEIGHTS.items()})
    n_cats = last[list(CATEGORY_WEIGHTS)].sum(axis=1)
    heat = weights.max(axis=1) + 5 * (n_cats - 1).clip(lower=0)
    heat += 25 * last["closed"] + 10 * (last["score"] >= 14)
    prior = pest.groupby("camis").size().reindex(last.index) - 1
    heat += (prior * 8).clip(upper=24)
    age = (t - last["inspection_date"]).dt.days
    heat += np.select([age <= 3, age <= 7, age <= 30], [15, 8, 3], 0)
    # Break ties toward the most recent citation.
    return heat.clip(upper=100) - age / 10_000


def labels_at(t: pd.Timestamp, insp: pd.DataFrame, index: pd.Index, horizon_days: int = HORIZON_DAYS) -> pd.DataFrame:
    """`y`: pest violation in [t, t + horizon). `inspected`: any inspection in that window (for bias analysis)."""
    t = pd.Timestamp(t).normalize()
    window = insp[(insp["inspection_date"] >= t) & (insp["inspection_date"] < t + pd.Timedelta(days=horizon_days))]
    out = pd.DataFrame(index=index)
    out["y"] = index.isin(window.loc[window["pest"], "camis"]).astype(int)
    out["inspected"] = index.isin(window["camis"]).astype(int)
    return out


def snapshot_dates(start: str, end: str) -> list[pd.Timestamp]:
    """1st and 16th of each month between start and end inclusive."""
    months = pd.date_range(pd.Timestamp(start).to_period("M").to_timestamp(), end, freq="MS")
    days = [d for m in months for d in (m, m + pd.Timedelta(days=15))]
    return [d for d in days if pd.Timestamp(start) <= d <= pd.Timestamp(end)]


def build_dataset(
    dates: list[pd.Timestamp],
    insp: pd.DataFrame,
    info: pd.DataFrame,
    rodent_311: pd.DataFrame,
    rat_failures: pd.DataFrame,
    top_cuisines: list[str],
) -> pd.DataFrame:
    frames = []
    for t in dates:
        f = features_at(t, insp, info, rodent_311, rat_failures, top_cuisines)
        f = f.join(labels_at(t, insp, f.index))
        f["snapshot"] = t
        frames.append(f.reset_index())
    return pd.concat(frames, ignore_index=True)


def top_cuisines(info: pd.DataFrame, n: int = 40) -> list[str]:
    return info["cuisine_description"].replace("", np.nan).dropna().value_counts().head(n).index.tolist()
