import numpy as np
import pandas as pd
import pandas.testing as pdt
import pytest

from riskmodel import features as F


def _violations(rows):
    cols = ["camis", "dba", "boro", "building", "street", "zipcode", "phone", "cuisine_description",
            "inspection_date", "action", "violation_code", "critical_flag", "score", "grade", "inspection_type"]
    df = pd.DataFrame([{c: r.get(c, "") for c in cols} for r in rows])
    df["inspection_date"] = pd.to_datetime(df["inspection_date"])
    df["score"] = pd.to_numeric(df["score"])
    return df


def row(camis, date, code="10F", score=10, itype="Cycle Inspection / Initial Inspection", zipcode="11222", **kw):
    return {"camis": camis, "inspection_date": date, "violation_code": code, "score": score, "inspection_type": itype,
            "zipcode": zipcode, "boro": "Brooklyn", "cuisine_description": "Pizza", "critical_flag": "Critical", **kw}


@pytest.fixture
def world():
    v = _violations([
        row("A", "2025-01-10", "04L", 28),
        row("A", "2025-02-05", "10F", 9, "Cycle Inspection / Re-inspection"),
        row("A", "2025-06-20", "04K", 40),           # future relative to t below: must not leak
        row("B", "2025-08-15", "10F", 20),          # first inspected after t (and after the horizon): unknown at t
        row("C", "2024-12-01", "04N", 30, action="Establishment Closed by DOHMH. Violations were cited."),
        row("C", "2025-05-30", "08A", 12),          # within LAG_DAYS of t: not yet published
        row("D", "2023-01-05", "10F", 5),           # inactive: last seen > ACTIVE_DAYS before t
    ])
    rodents = pd.DataFrame({"zip": ["11222"] * 3, "month": pd.to_datetime(["2025-03-01", "2025-05-01", "2025-06-01"]), "n": [5, 7, 100]})
    return v, rodents


T = pd.Timestamp("2025-06-01")


def test_only_past_data_is_used(world):
    v, rodents = world
    insp, info = F.build_inspections(v), F.restaurant_info(v)
    f = F.features_at(T, insp, info, rodents, rodents)
    assert sorted(f.index) == ["A", "C"]
    a = f.loc["A"]
    assert a["n_pest_insp_365"] == 1 and a["n_rats_365"] == 0      # the June rats citation is in the future
    assert a["days_since_last_insp"] == (T - pd.Timestamp("2025-02-05")).days
    assert a["last_type"] == "cycle_reinspection" and a["pending_reinspection"] == 0
    assert f.loc["C", "n_conditions_365"] == 0                        # May 30 is inside the publication lag
    assert f.loc["C", "n_closed_730"] == 1
    assert a["zip_rodent_311_3m"] == 12                               # March + May; June hasn't finished


def test_features_do_not_change_when_future_data_is_removed(world):
    v, rodents = world
    insp, info = F.build_inspections(v), F.restaurant_info(v)
    full = F.features_at(T, insp, info, rodents, rodents)
    cutoff = T - pd.Timedelta(days=F.LAG_DAYS)
    past_insp = insp[insp["inspection_date"] < cutoff]
    past_counts = rodents[rodents["month"] < T.to_period("M").to_timestamp()]
    truncated = F.features_at(T, past_insp, info, past_counts, past_counts)
    pdt.assert_frame_equal(full.sort_index(), truncated.sort_index())


def test_labels_cover_the_horizon_only(world):
    v, _ = world
    insp = F.build_inspections(v)
    labels = F.labels_at(T, insp, pd.Index(["A", "B", "C"]))
    assert labels.loc["A", "y"] == 1 and labels.loc["A", "inspected"] == 1
    assert labels.loc["B", "y"] == 0 and labels.loc["B", "inspected"] == 0
    assert F.labels_at(T, insp, pd.Index(["A"]), horizon_days=10).loc["A", "y"] == 0


def test_pending_reinspection_after_failing_initial(world):
    v, rodents = world
    insp, info = F.build_inspections(v), F.restaurant_info(v)
    f = F.features_at(pd.Timestamp("2025-01-20"), insp, info, rodents, rodents)
    assert f.loc["A", "pending_reinspection"] == 1 and f.loc["A", "last_pest"] == 1


def test_snapshot_dates():
    assert F.snapshot_dates("2025-01-01", "2025-02-10") == [pd.Timestamp(d) for d in ["2025-01-01", "2025-01-16", "2025-02-01"]]
    assert np.isfinite(F.NO_PEST_DAYS)
