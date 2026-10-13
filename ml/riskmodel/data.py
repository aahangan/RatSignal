"""Downloads and tidies the three NYC open-data sources the model uses.

- Restaurant inspections (DOHMH, 43nn-pn8j): one row per violation cited at an inspection.
- 311 rodent complaints (erm2-nwe9), aggregated to zip x month.
- City rat inspections that failed for rat activity (p937-wjvj), aggregated to zip x month.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import socrata

INSPECTIONS = "43nn-pn8j"
SERVICE_REQUESTS_311 = "erm2-nwe9"
RAT_INSPECTIONS = "p937-wjvj"

# Violation codes for pests seen by the inspector (the target), and conditions that invite them.
PEST_CODES = {"04K": "rats", "04L": "mice", "04M": "roaches", "04N": "flies"}
CONDITIONS_CODE = "08A"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HISTORY_START = "2023-01-01"

_INSPECTION_COLUMNS = [
    "camis", "dba", "boro", "building", "street", "zipcode", "phone", "cuisine_description",
    "inspection_date", "action", "violation_code", "critical_flag", "score", "grade", "inspection_type",
]


def _cached(name: str, refresh: bool, load) -> pd.DataFrame:
    path = DATA_DIR / f"{name}.parquet"
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    df = load()
    DATA_DIR.mkdir(exist_ok=True)
    df.to_parquet(path, index=False)
    return df


def load_violations(refresh: bool = False, since: str = HISTORY_START) -> pd.DataFrame:
    """Violation-level inspection rows since `since` (placeholder 1900 dates for uninspected places dropped)."""

    def load() -> pd.DataFrame:
        rows = socrata.query_all(socrata.NYC, INSPECTIONS, {
            "$select": ",".join(_INSPECTION_COLUMNS),
            "$where": f"inspection_date >= '{since}'",
        })
        return tidy_violations(pd.DataFrame(rows, columns=_INSPECTION_COLUMNS))

    return _cached("violations", refresh, load)


def tidy_violations(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["inspection_date"] = pd.to_datetime(df["inspection_date"]).dt.tz_localize(None).dt.normalize()
    df = df[df["inspection_date"] > "2000-01-01"]
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df["zipcode"] = df["zipcode"].fillna("").astype(str).str[:5]
    for col in ["violation_code", "action", "inspection_type", "grade", "critical_flag", "cuisine_description", "boro", "dba"]:
        df[col] = df[col].fillna("")
    return df.reset_index(drop=True)


def _zip_month_counts(dataset: str, zip_col: str, date_col: str, where: str, since: str) -> pd.DataFrame:
    rows = socrata.query_all(socrata.NYC, dataset, {
        "$select": f"{zip_col} as zip, date_trunc_ym({date_col}) as month, count(*) as n",
        "$where": f"{where} AND {date_col} >= '{since}' AND {date_col} < '2100-01-01'",
        "$group": f"{zip_col}, month",
        "$order": f"{zip_col}, month",
    })
    df = pd.DataFrame(rows, columns=["zip", "month", "n"])
    df["zip"] = df["zip"].fillna("").astype(str).str[:5]
    df["month"] = pd.to_datetime(df["month"])
    df["n"] = pd.to_numeric(df["n"]).astype(int)
    return df[df["zip"].str.fullmatch(r"\d{5}")].groupby(["zip", "month"], as_index=False)["n"].sum()


def load_rodent_311(refresh: bool = False, since: str = "2022-01-01") -> pd.DataFrame:
    return _cached("rodent_311", refresh, lambda: _zip_month_counts(
        SERVICE_REQUESTS_311, "incident_zip", "created_date", "complaint_type = 'Rodent'", since))


def load_rat_failures(refresh: bool = False, since: str = "2022-01-01") -> pd.DataFrame:
    return _cached("rat_failures", refresh, lambda: _zip_month_counts(
        RAT_INSPECTIONS, "zip_code", "inspection_date", "result like 'Failed for Rat%'", since))
