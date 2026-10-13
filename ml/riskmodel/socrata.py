"""Minimal Socrata (SODA 2.1) client: paging, retries with backoff, app token.

Python counterpart of the socrata-fetch package the TypeScript app uses.
"""

from __future__ import annotations

import os
import random
import time
from collections.abc import Iterator
from typing import Any

import requests

NYC = "data.cityofnewyork.us"


class SocrataError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _retryable(err: Exception) -> bool:
    if isinstance(err, SocrataError):
        return err.status == 429 or err.status >= 500
    return isinstance(err, requests.RequestException)


def query(domain: str, dataset: str, params: dict[str, Any], *, retries: int = 4, timeout: float = 120) -> list[dict[str, str]]:
    """One request, retrying 429s, 5xx and network errors with exponential backoff and jitter."""
    headers = {"Accept": "application/json"}
    if token := os.environ.get("SOCRATA_APP_TOKEN"):
        headers["X-App-Token"] = token
    url = f"https://{domain}/resource/{dataset}.json"
    for attempt in range(retries + 1):
        try:
            res = requests.get(url, params=params, headers=headers, timeout=timeout)
            if not res.ok:
                raise SocrataError(res.status_code, f"{domain}/{dataset} returned {res.status_code}: {res.text[:200]}")
            body = res.json()
            if not isinstance(body, list):
                raise SocrataError(502, f"{domain}/{dataset} returned a non-array body")
            return body
        except Exception as err:  # noqa: BLE001 - classified below
            if attempt >= retries or not _retryable(err):
                raise
            time.sleep(min(8.0, 0.5 * 2**attempt) * random.uniform(0.75, 1.25))
    raise AssertionError("unreachable")


def pages(domain: str, dataset: str, params: dict[str, Any], *, page_size: int = 50_000) -> Iterator[list[dict[str, str]]]:
    """Yields every matching row in pages. Orders by row id unless `$order` is given, so offsets are stable."""
    params = {"$order": ":id", **params}
    offset = 0
    while True:
        page = query(domain, dataset, {**params, "$limit": page_size, "$offset": offset})
        if page:
            yield page
        if len(page) < page_size:
            return
        offset += page_size


def query_all(domain: str, dataset: str, params: dict[str, Any], *, page_size: int = 50_000) -> list[dict[str, str]]:
    return [row for page in pages(domain, dataset, params, page_size=page_size) for row in page]
