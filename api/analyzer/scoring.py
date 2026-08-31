"""Deterministic scoring engine — visibility pillars for product page optimization."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Internal analyzer weights (sum = 100) — used by individual analyzers
WEIGHTS = {
    "seo": 15,
    "structured_data": 15,
    "product_information": 15,
    "images": 10,
    "ai_readiness": 15,
    "content_quality": 10,
    "conversion_clarity": 5,
    "technical": 15,
}

# User-facing visibility pillars (sum = 100)
VISIBILITY_WEIGHTS = {
    "google_seo": 20,
    "ai_visibility": 20,
    "content": 15,
    "keywords": 15,
    "images": 15,
    "schema": 15,
}


@dataclass
class AuditScores:
    overall: int = 0
    categories: dict[str, int] = field(default_factory=dict)
    weights: dict[str, int] = field(default_factory=lambda: dict(WEIGHTS))


def keyword_alignment_score(keywords: dict[str, Any] | None) -> int:
    rows = (keywords or {}).get("title_alignment") or []
    if not rows:
        return 55
    good = sum(1 for r in rows if r.get("status") in {"good", "body"})
    return max(0, min(100, round((good / len(rows)) * 100)))


def compute_visibility_pillars(category_scores: dict[str, int], keywords: dict[str, Any] | None) -> dict[str, int]:
    """Map internal analyzer scores → six product visibility pillars."""
    google_seo = round((category_scores.get("seo", 0) + category_scores.get("technical", 0)) / 2)
    ai_visibility = round(
        (category_scores.get("ai_readiness", 0) + category_scores.get("conversion_clarity", 0)) / 2
    )
    content = round(
        (category_scores.get("content_quality", 0) + category_scores.get("product_information", 0)) / 2
    )
    return {
        "google_seo": google_seo,
        "ai_visibility": ai_visibility,
        "content": content,
        "keywords": keyword_alignment_score(keywords),
        "images": category_scores.get("images", 0),
        "schema": category_scores.get("structured_data", 0),
    }


def compute_visibility_overall(pillars: dict[str, int]) -> int:
    total = 0
    for key, weight in VISIBILITY_WEIGHTS.items():
        total += round(pillars.get(key, 0) * weight / 100)
    return min(100, total)


def compute_overall(category_scores: dict[str, int], keywords: dict[str, Any] | None = None) -> AuditScores:
    pillars = compute_visibility_pillars(category_scores, keywords)
    overall = compute_visibility_overall(pillars)
    merged = dict(category_scores)
    merged.update(pillars)
    return AuditScores(overall=overall, categories=merged, weights=dict(VISIBILITY_WEIGHTS))


def bucket_issues(all_issues: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    critical: list[dict[str, Any]] = []
    high: list[dict[str, Any]] = []
    quick: list[dict[str, Any]] = []

    for issue in all_issues:
        sev = issue.get("severity", "medium")
        if sev == "critical":
            critical.append(issue)
        elif sev == "high":
            high.append(issue)
        elif sev in {"medium", "low"}:
            quick.append(issue)
    return {"critical": critical, "high_priority": high, "quick_wins": quick[:8]}
