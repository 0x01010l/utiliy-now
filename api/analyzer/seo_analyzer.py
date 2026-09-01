"""Deterministic on-page SEO checks."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .crawler import CrawlResult


@dataclass
class SeoIssue:
    severity: str
    code: str
    message: str
    field: str | None = None


@dataclass
class SeoAnalysis:
    score: int = 0
    issues: list[SeoIssue] = field(default_factory=list)
    signals: dict[str, str | int | bool] = field(default_factory=dict)
    title_meta: dict[str, Any] = field(default_factory=dict)


def _length_status(length: int, ideal_min: int, ideal_max: int) -> str:
    if length == 0:
        return "missing"
    if ideal_min <= length <= ideal_max:
        return "good"
    if length < ideal_min:
        return "short"
    return "long"


def analyze_seo(crawl: CrawlResult) -> SeoAnalysis:
    analysis = SeoAnalysis()
    issues: list[SeoIssue] = []

    title = crawl.title or ""
    meta = crawl.meta_description or ""
    h1_count = len(crawl.h1s)
    h1 = crawl.h1s[0] if crawl.h1s else ""
    product_h1 = h1

    if crawl.platform == "amazon":
        # Amazon templates add nav/detail H1s; the first H1 is the product name.
        h1_count = 1 if h1 else 0
        if title.lower().startswith("amazon.com |"):
            title = title.split("|", 1)[-1].strip()
            if title.count("|") >= 1:
                title = title.rsplit("|", 1)[0].strip()

    og_title = crawl.open_graph.get("og:title", "")
    og_desc = crawl.open_graph.get("og:description", "")
    og_image = crawl.open_graph.get("og:image", "")

    analysis.signals = {
        "title_length": len(title),
        "meta_description_length": len(meta),
        "h1_count": h1_count,
        "has_canonical": bool(crawl.canonical),
        "image_count": len(crawl.images),
        "status_code": crawl.status_code,
        "has_og_title": bool(og_title),
        "has_og_description": bool(og_desc),
        "has_og_image": bool(og_image),
        "word_count": len(crawl.visible_text.split()),
    }

    analysis.title_meta = {
        "title": title,
        "title_length": len(title),
        "title_status": _length_status(len(title), 30, 60),
        "title_ideal": "30–60 characters",
        "meta_description": meta,
        "meta_length": len(meta),
        "meta_status": _length_status(len(meta), 120, 155),
        "meta_ideal": "120–155 characters",
        "h1": h1,
        "h1_count": h1_count,
        "canonical": crawl.canonical,
        "og": {"title": og_title, "description": og_desc, "image": og_image},
    }

    if crawl.status_code >= 400:
        issues.append(SeoIssue("critical", "http_error", f"Page returned HTTP {crawl.status_code}.", "http"))

    if not title:
        issues.append(SeoIssue("critical", "missing_title", "Missing <title> tag.", "title"))
    elif len(title) < 25:
        issues.append(SeoIssue("high", "title_too_short", "Title tag is very short. Product pages need a descriptive, keyword-rich title.", "title"))
    elif len(title) > 70:
        issues.append(SeoIssue("medium", "title_too_long", "Title may truncate in search results (over ~60 characters).", "title"))

    if not meta:
        issues.append(SeoIssue("high", "missing_meta_description", "Missing meta description — search engines will auto-generate snippets.", "meta"))
    elif len(meta) < 70:
        issues.append(SeoIssue("medium", "meta_too_short", "Meta description is short. Expand it with benefits and keywords.", "meta"))
    elif len(meta) > 165:
        issues.append(SeoIssue("low", "meta_too_long", "Meta description may truncate in search results.", "meta"))

    if h1_count == 0:
        issues.append(SeoIssue("high", "missing_h1", "No H1 heading found.", "h1"))
    elif h1_count > 1:
        issues.append(SeoIssue("medium", "multiple_h1", f"Found {h1_count} H1 tags. One clear H1 is best for SEO.", "h1"))

    if title and product_h1 and title.lower()[:30] not in product_h1.lower() and product_h1.lower()[:30] not in title.lower():
        issues.append(SeoIssue("medium", "title_h1_mismatch", "Title and H1 don't align — keep them consistent for clarity.", "h1"))

    if not crawl.canonical:
        issues.append(SeoIssue("medium", "missing_canonical", "No canonical URL declared. Duplicate URLs can dilute ranking signals.", "canonical"))
    elif crawl.canonical and crawl.final_url.split("?")[0] != crawl.canonical.split("?")[0]:
        issues.append(SeoIssue("low", "canonical_mismatch", "Canonical URL differs from fetched URL.", "canonical"))

    if not og_title:
        issues.append(SeoIssue("medium", "missing_og_title", "Missing og:title for social sharing.", "og"))
    if not og_image:
        issues.append(SeoIssue("medium", "missing_og_image", "Missing og:image — social previews won't show a product image.", "og"))

    imgs_without_alt = [i for i in crawl.images if not i.get("alt")]
    if crawl.images and len(imgs_without_alt) / len(crawl.images) > 0.5:
        issues.append(
            SeoIssue(
                "high",
                "missing_alt_text",
                f"{len(imgs_without_alt)} of {len(crawl.images)} images lack alt text.",
                "images",
            )
        )

    if len(crawl.visible_text) < 200:
        issues.append(
            SeoIssue(
                "high",
                "thin_content",
                "Very little visible text. Product pages need detail for buyers and search engines.",
                "content",
            )
        )
    elif len(crawl.visible_text.split()) < 150:
        issues.append(
            SeoIssue(
                "medium",
                "light_content",
                "Content is light. Consider adding specs, benefits, and FAQs.",
                "content",
            )
        )

    analysis.issues = issues
    penalty = sum({"critical": 20, "high": 10, "medium": 5, "low": 2}[i.severity] for i in issues)
    analysis.score = max(0, min(100, 100 - penalty))
    return analysis
