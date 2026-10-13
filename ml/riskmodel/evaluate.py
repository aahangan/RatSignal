"""Metrics that match how RatSignal uses the scores: a ranked list of restaurants per day and per zip code."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score


def precision_at_k(df: pd.DataFrame, score: str, k: int) -> float:
    """Mean over snapshots of: share of the top-k scored restaurants that got a pest violation."""
    def one(g: pd.DataFrame) -> float:
        return g.nlargest(k, score)["y"].mean()
    return float(df.groupby("snapshot").apply(one, include_groups=False).mean())


def zip_precision_at_k(df: pd.DataFrame, score: str, k: int, min_active: int = 30) -> float:
    """Mean over (snapshot, zip) of top-k precision: what a customer covering one zip would see."""
    def one(g: pd.DataFrame) -> float:
        return g.nlargest(k, score)["y"].mean()
    eligible = df.groupby(["snapshot", "zip"]).filter(lambda g: len(g) >= min_active)
    return float(eligible.groupby(["snapshot", "zip"]).apply(one, include_groups=False).mean())


def summarize(df: pd.DataFrame, score: str) -> dict[str, float]:
    inspected = df[df["inspected"] == 1]
    return {
        "precision_at_100": precision_at_k(df, score, 100),
        "precision_at_500": precision_at_k(df, score, 500),
        "zip_precision_at_5": zip_precision_at_k(df, score, 5),
        "average_precision": float(average_precision_score(df["y"], df[score])),
        "roc_auc": float(roc_auc_score(df["y"], df[score])),
        # Among restaurants that were actually inspected: does the score find pests, not just inspection timing?
        "average_precision_if_inspected": float(average_precision_score(inspected["y"], inspected[score])),
    }


def calibration_table(df: pd.DataFrame, prob: str = "prob", bins: int = 10) -> pd.DataFrame:
    q = pd.qcut(df[prob].rank(method="first"), bins, labels=False)
    return df.groupby(q).agg(mean_predicted=(prob, "mean"), observed_rate=("y", "mean"), n=("y", "size"))


def base_rate(df: pd.DataFrame) -> float:
    return float(np.mean(df["y"]))
