"""Orchestrates a full product page audit."""

from __future__ import annotations

from typing import Any

from .ai_analyzer import analyze_with_llm
from .content_analyzer import analyze_ai_readiness, analyze_product_info
from .crawler import fetch_page
from .fixes import build_fixes
from .schema_analyzer import analyze_schema, _collect_products
from .scoring import bucket_issues, compute_overall
from .seo_analyzer import analyze_seo
from .vision_analyzer import analyze_product_images


def _issue_dict(severity: str, code: str, message: str, category: str) -> dict[str, str]:
    return {"severity": severity, "code": code, "message": message, "category": category}


async def run_audit(url: str, use_ai: bool = True) -> dict[str, Any]:
    crawl = await fetch_page(url)
    schema = analyze_schema(
        crawl.json_ld,
        {"title": crawl.title or ""},
        microdata=crawl.microdata,
        og_hints=crawl.og_product_hints,
    )
    seo = analyze_seo(crawl)
    products = _collect_products(crawl.json_ld)
    schema_product = products[0] if products else None
    product_info = analyze_product_info(crawl, schema_product)
    vision = await analyze_product_images(crawl.images)
    ai_ready = analyze_ai_readiness(product_info, schema.score)

    technical_score = 100
    if crawl.status_code >= 400:
        technical_score -= 40
    if not crawl.headers.get("content-type", "").startswith("text/html"):
        technical_score -= 20
    technical_score = max(0, technical_score)

    content_score = 70
    conversion_score = 70
    llm_notes: dict[str, Any] | None = None

    if use_ai:
        summary = {
            "url": crawl.final_url,
            "platform": crawl.platform,
            "title": crawl.title,
            "meta_description": crawl.meta_description,
            "h1s": crawl.h1s,
            "canonical": crawl.canonical,
            "visible_text_excerpt": crawl.visible_text[:5000],
            "schema_issues": [i.message for i in schema.issues],
            "seo_issues": [i.message for i in seo.issues],
            "missing_product_fields": product_info.missing,
            "og_hints": crawl.og_product_hints,
            "image_count": len(crawl.images),
        }
        llm_notes = await analyze_with_llm(summary)
        if llm_notes:
            content_score = int(llm_notes.get("content_quality_score", content_score))
            conversion_score = int(llm_notes.get("conversion_clarity_score", conversion_score))

    image_score = vision.get("score", 70)

    category_scores = {
        "seo": seo.score,
        "structured_data": schema.score,
        "product_information": product_info.score,
        "images": image_score,
        "ai_readiness": ai_ready["score"],
        "content_quality": content_score,
        "conversion_clarity": conversion_score,
        "technical": technical_score,
    }
    scores = compute_overall(category_scores)

    all_issues: list[dict[str, str]] = []
    for i in seo.issues:
        all_issues.append(_issue_dict(i.severity, i.code, i.message, "seo"))
    for i in schema.issues:
        all_issues.append(_issue_dict(i.severity, i.code, i.message, "structured_data"))
    for i in product_info.issues:
        all_issues.append(_issue_dict(i["severity"], i["code"], i["message"], "product_information"))
    for img in vision.get("results", []):
        for msg in img.get("issues", []):
            all_issues.append(_issue_dict("medium", "image_issue", msg, "images"))

    buckets = bucket_issues(all_issues)
    fixes = build_fixes(crawl, seo, schema, vision, product_info, llm_notes)

    return {
        "url": crawl.url,
        "final_url": crawl.final_url,
        "platform": crawl.platform,
        "status_code": crawl.status_code,
        "canonical": crawl.canonical,
        "scores": {
            "overall": scores.overall,
            "categories": scores.categories,
            "weights": scores.weights,
        },
        "ai_shopping_readiness": ai_ready,
        "product_information": {
            "extracted": product_info.extracted,
            "missing": product_info.missing,
        },
        "structured_data": {
            "has_product_schema": schema.has_product_schema,
            "properties_found": schema.properties_found,
            "properties_missing": schema.properties_missing,
            "json_ld_blocks_found": len(crawl.json_ld),
        },
        "seo": {
            "signals": seo.signals,
            "analysis": llm_notes.get("seo_analysis") if llm_notes else _seo_narrative(seo, crawl),
            "issues": [{"severity": i.severity, "message": i.message, "code": i.code} for i in seo.issues],
        },
        "content": {
            "analysis": llm_notes.get("content_analysis") if llm_notes else "Review product description depth, benefits, and differentiation above the fold.",
            "word_count_estimate": len(crawl.visible_text.split()),
        },
        "images": vision,
        "conversion": {
            "score": conversion_score,
            "analysis": llm_notes.get("ai_shopping_notes") if llm_notes else ai_ready.get("summary"),
        },
        "issues": buckets,
        "fixes": fixes,
        "llm_analysis": llm_notes,
        "meta": {
            "title": crawl.title,
            "description": crawl.meta_description,
            "h1": crawl.h1s[0] if crawl.h1s else None,
        },
    }


def _seo_narrative(seo, crawl) -> str:
    parts = []
    if crawl.title:
        parts.append(f"Title ({len(crawl.title)} chars): \"{crawl.title[:80]}\"")
    if crawl.meta_description:
        parts.append(f"Meta description ({len(crawl.meta_description)} chars) is present.")
    else:
        parts.append("Meta description is missing — write one for better search snippets.")
    if crawl.h1s:
        parts.append(f"H1: \"{crawl.h1s[0][:80]}\"")
    if seo.issues:
        parts.append(f"Found {len(seo.issues)} SEO issues to address.")
    return " ".join(parts)
