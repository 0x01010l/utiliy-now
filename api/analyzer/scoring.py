"""Deterministic scoring engine — weights sum to 100."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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


@dataclass
class AuditScores:
    overall: int = 0
    categories: dict[str, int] = field(default_factory=dict)
    weights: dict[str, int] = field(default_factory=lambda: dict(WEIGHTS))


def compute_overall(category_scores: dict[str, int]) -> AuditScores:
    total = 0
    for key, weight in WEIGHTS.items():
        score = category_scores.get(key, 0)
        total += round(score * weight / 100)
    return AuditScores(overall=min(100, total), categories=category_scores)


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
