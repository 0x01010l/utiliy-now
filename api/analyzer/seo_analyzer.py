"""Deterministic on-page SEO checks."""

from __future__ import annotations

from dataclasses import dataclass, field

from .crawler import CrawlResult


@dataclass
class SeoIssue:
    severity: str
    code: str
    message: str


@dataclass
class SeoAnalysis:
    score: int = 0
    issues: list[SeoIssue] = field(default_factory=list)
    signals: dict[str, str | int | bool] = field(default_factory=dict)


def analyze_seo(crawl: CrawlResult) -> SeoAnalysis:
    analysis = SeoAnalysis()
    issues: list[SeoIssue] = []

    title = crawl.title or ""
    meta = crawl.meta_description or ""
    h1_count = len(crawl.h1s)

    analysis.signals = {
        "title_length": len(title),
        "meta_description_length": len(meta),
        "h1_count": h1_count,
        "has_canonical": bool(crawl.canonical),
        "image_count": len(crawl.images),
        "status_code": crawl.status_code,
    }

    if crawl.status_code >= 400:
        issues.append(SeoIssue("critical", "http_error", f"Page returned HTTP {crawl.status_code}."))

    if not title:
        issues.append(SeoIssue("critical", "missing_title", "Missing <title> tag."))
    elif len(title) < 25:
        issues.append(SeoIssue("high", "title_too_short", "Title tag is very short. Product pages usually need a descriptive title."))
    elif len(title) > 70:
        issues.append(SeoIssue("medium", "title_too_long", "Title tag may truncate in search results (over ~60 characters)."))

    if not meta:
        issues.append(SeoIssue("high", "missing_meta_description", "Missing meta description."))
    elif len(meta) < 70:
        issues.append(SeoIssue("medium", "meta_too_short", "Meta description is short. Use it to summarize the product for search snippets."))
    elif len(meta) > 165:
        issues.append(SeoIssue("low", "meta_too_long", "Meta description may truncate in search results."))

    if h1_count == 0:
        issues.append(SeoIssue("high", "missing_h1", "No H1 heading found."))
    elif h1_count > 1:
        issues.append(SeoIssue("medium", "multiple_h1", f"Found {h1_count} H1 tags. One clear H1 is easier for parsers to trust."))

    if not crawl.canonical:
        issues.append(SeoIssue("medium", "missing_canonical", "No canonical URL declared. Duplicate URLs can dilute signals."))
    elif crawl.canonical and crawl.final_url.split("?")[0] != crawl.canonical.split("?")[0]:
        issues.append(SeoIssue("low", "canonical_mismatch", "Canonical URL differs from the fetched URL. Verify this is intentional."))

    imgs_without_alt = [i for i in crawl.images if not i.get("alt")]
    if crawl.images and len(imgs_without_alt) / len(crawl.images) > 0.5:
        issues.append(
            SeoIssue(
                "high",
                "missing_alt_text",
                f"{len(imgs_without_alt)} of {len(crawl.images)} images lack alt text.",
            )
        )

    if len(crawl.visible_text) < 200:
        issues.append(
            SeoIssue(
                "high",
                "thin_content",
                "Very little visible text on the page. Product pages need enough detail for buyers and parsers.",
            )
        )

    analysis.issues = issues
    penalty = sum({"critical": 20, "high": 10, "medium": 5, "low": 2}[i.severity] for i in issues)
    analysis.score = max(0, min(100, 100 - penalty))
    return analysis
