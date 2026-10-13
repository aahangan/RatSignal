"""Daily batch scorer: rank every active NYC restaurant by pest-violation risk and upload it to RatSignal.

    uv run python -m riskmodel.score [--date YYYY-MM-DD] [--out forecast.json] [--no-upload]

Uploads to $RATSIGNAL_URL/api/admin/risk with $RATSIGNAL_ADMIN_SECRET.
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests

from . import data
from . import features as F
from .train import MODEL_PATH

PER_ZIP = 10
TOP_CITYWIDE = 500
GRADE_NAMES = {"B": "B", "C": "C", "Z": "pending", "P": "pending"}
TYPE_NAMES = {"cycle_initial": "routine inspection", "prepermit_initial": "pre-permit inspection"}


def load_bundle(path=MODEL_PATH) -> dict:
    with open(path, "rb") as fh:
        return pickle.load(fh)


def reasons(row: pd.Series, zip_hot: dict[str, float]) -> list[str]:
    """Plain-language drivers a pest company can use on the phone."""
    out: list[str] = []
    if row["pending_reinspection"]:
        out.append(f"Re-inspection due: scored {int(row['last_score'])} at its last {TYPE_NAMES.get(row['last_type'], 'inspection')}")
    if row["last_pest"]:
        out.append("Pests found at its last inspection")
    if row["n_pest_insp_365"] >= 2:
        out.append(f"Cited for pests {int(row['n_pest_insp_365'])} times in the past year")
    elif row["has_pest_history"] and not row["last_pest"]:
        out.append(f"Cited for pests {int(row['days_since_last_pest'] // 30)} months ago")
    if row["last_grade"] in GRADE_NAMES and not row["pending_reinspection"]:
        out.append(f"Last grade: {GRADE_NAMES[row['last_grade']]}")
    if row["days_since_last_insp"] >= 300:
        out.append(f"{int(row['days_since_last_insp'] // 30)} months since its last inspection")
    if row["zip_rat_fail_3m"] >= zip_hot["rat_fail"]:
        out.append("Heavy rat activity in the zip code (city rat inspections)")
    elif row["zip_rodent_311_3m"] >= zip_hot["rodent_311"]:
        out.append("Many 311 rodent complaints in the zip code")
    return out[:4]


def score(t: pd.Timestamp, bundle: dict, refresh: bool = True) -> tuple[pd.DataFrame, pd.DataFrame]:
    violations = data.load_violations(refresh=refresh)
    insp, info = F.build_inspections(violations), F.restaurant_info(violations)
    feats = F.features_at(t, insp, info, data.load_rodent_311(refresh=refresh), data.load_rat_failures(refresh=refresh),
                          bundle["top_cuisines"])
    feats["prob"] = bundle["model"].predict_proba(feats[bundle["features"]])[:, 1]
    return feats, info


def build_payload(t: pd.Timestamp, feats: pd.DataFrame, info: pd.DataFrame, bundle: dict) -> dict:
    zip_hot = {"rat_fail": feats["zip_rat_fail_3m"].quantile(0.8), "rodent_311": feats["zip_rodent_311_3m"].quantile(0.8)}
    feats = feats[feats["zip"].str.fullmatch(r"\d{5}")]
    zips: dict[str, list[dict]] = {}
    for zip_code, group in feats.groupby("zip"):
        entries = []
        for camis, row in group.nlargest(PER_ZIP, "prob").iterrows():
            meta = info.loc[camis]
            entries.append({
                "id": f"nyc:{camis}", "name": str(meta["dba"]).strip() or "Unknown", "address": str(meta["address"]),
                "zip": zip_code, "phone": str(meta["phone"] or "") or None, "cuisine": str(meta["cuisine_description"] or "") or None,
                "prob": round(float(row["prob"]), 4), "reasons": reasons(row, zip_hot),
            })
        zips[str(zip_code)] = [{k: v for k, v in e.items() if v is not None} for e in entries]
    top = feats.nlargest(TOP_CITYWIDE, "prob")
    metrics = {"model": bundle["test_metrics"], **bundle["baseline_test_metrics"]}
    return {
        "date": str(t.date()), "version": bundle["version"], "horizonDays": bundle["horizon_days"],
        "cityRate": round(float(feats["prob"].mean()), 5), "scored": int(len(feats)),
        "metrics": {name: {k: round(float(v), 4) for k, v in m.items()} for name, m in metrics.items()},
        "zips": zips, "top": [[f"nyc:{c}", round(float(p), 4)] for c, p in top["prob"].items()],
    }


def upload(path: str, body: dict) -> dict:
    url, secret = os.environ.get("RATSIGNAL_URL", "").rstrip("/"), os.environ.get("RATSIGNAL_ADMIN_SECRET", "")
    if not url or not secret:
        raise SystemExit("RATSIGNAL_URL and RATSIGNAL_ADMIN_SECRET must be set to upload (use --no-upload to skip)")
    res = requests.post(f"{url}{path}", json=body, headers={"Authorization": f"Bearer {secret}"}, timeout=120)
    res.raise_for_status()
    return res.json()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="score as of this date (default: today in New York)")
    parser.add_argument("--out", help="also write the payload to this JSON file")
    parser.add_argument("--no-upload", action="store_true")
    parser.add_argument("--cached", action="store_true", help="use cached data instead of re-downloading")
    args = parser.parse_args()

    t = pd.Timestamp(args.date or datetime.now(ZoneInfo("America/New_York")).date())
    bundle = load_bundle()
    feats, info = score(t, bundle, refresh=not args.cached)
    payload = build_payload(t, feats, info, bundle)
    print(f"scored {payload['scored']} restaurants in {len(payload['zips'])} zips for {payload['date']} "
          f"(model {payload['version']}, mean risk {payload['cityRate']:.3f}, top risk {payload['top'][0][1]:.3f})")
    if args.out:
        with open(args.out, "w") as fh:
            json.dump(payload, fh)
    if not args.no_upload:
        print(upload("/api/admin/risk", payload))
    assert np.isfinite(feats["prob"]).all()


if __name__ == "__main__":
    main()
