"""Orchestrates a full product page audit."""

from __future__ import annotations

from typing import Any

from .ai_analyzer import analyze_with_llm
from .content_analyzer import analyze_ai_readiness, analyze_product_info
from .crawler import fetch_page
from .fixes import build_fixes
from .image_utils import build_gallery
from .keyword_analyzer import analyze_keywords
from .page_code_analyzer import analyze_page_code
from .schema_analyzer import analyze_schema, _collect_products
from .scoring import bucket_issues, compute_overall
from .seo_analyzer import analyze_seo
from .shopify_extractor import fetch_shopify_product, is_likely_collection_redirect
from .vision_analyzer import analyze_product_images


def _issue_dict(severity: str, code: str, message: str, category: str, field: str | None = None) -> dict[str, str]:
    d: dict[str, str] = {"severity": severity, "code": code, "message": message, "category": category}
    if field:
        d["field"] = field
    return d


def _build_lab(
    scores: dict[str, int],
    all_issues: list[dict[str, str]],
    seo,
    keywords: dict,
    page_code: dict,
    schema,
    product_info,
    vision: dict,
) -> dict[str, Any]:
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for issue in all_issues:
        sev = issue.get("severity", "medium")
        if sev in severity_counts:
            severity_counts[sev] += 1

    zone_defs = [
        ("seo", "SEO & Meta", scores.get("seo", 0)),
        ("structured_data", "Schema", scores.get("structured_data", 0)),
        ("product_information", "Product Info", scores.get("product_information", 0)),
        ("images", "Images", scores.get("images", 0)),
        ("ai_readiness", "AI Shopping", scores.get("ai_readiness", 0)),
        ("content_quality", "Content", scores.get("content_quality", 0)),
        ("technical", "Technical", scores.get("technical", 0)),
    ]

    zones = []
    for zone_id, label, score in zone_defs:
        zone_issues = [i for i in all_issues if i.get("category") == zone_id]
        for i in page_code.get("issues", []):
            if zone_id == "technical":
                zone_issues.append({**i, "category": "technical"})
        status = "good" if score >= 80 else "warn" if score >= 60 else "bad"
        zones.append({
            "id": zone_id,
            "label": label,
            "score": score,
            "error_count": len(zone_issues),
            "status": status,
            "issues": zone_issues[:8],
        })

    return {
        "severity_counts": severity_counts,
        "total_issues": len(all_issues),
        "zones": zones,
        "keywords": keywords,
        "page_code": page_code,
        "title_meta": seo.title_meta,
        "product_fields": {
            "found": [k for k, v in product_info.extracted.items() if v],
            "missing": product_info.missing,
            "extracted": product_info.extracted,
        },
        "schema_checklist": _schema_checklist(schema),
        "image_gallery": _image_gallery(vision, []),
    }


def _schema_checklist(schema) -> list[dict[str, Any]]:
    props = ["name", "description", "image", "sku", "brand", "offers", "price", "availability", "gtin", "aggregateRating"]
    found_set = set(schema.properties_found)
    missing_set = set(schema.properties_missing)
    checklist = []
    for p in props:
        if p in found_set or any(p in f for f in found_set):
            checklist.append({"property": p, "status": "found"})
        elif p in missing_set:
            checklist.append({"property": p, "status": "missing"})
        else:
            checklist.append({"property": p, "status": "optional"})
    return checklist


def _image_gallery(vision: dict, crawl_images: list, shopify_images: list | None = None) -> list[dict[str, Any]]:
    return build_gallery(crawl_images, shopify_images or [], vision.get("results", []))


async def run_audit(url: str, use_ai: bool = True) -> dict[str, Any]:
    crawl = await fetch_page(url)

    shopify_data = None
    shopify_images: list[dict] = []
    if crawl.platform == "shopify":
        shopify_data = await fetch_shopify_product(crawl.final_url)
        if shopify_data:
            shopify_images = shopify_data.get("images") or []

    collection_redirect = (
        crawl.platform == "shopify"
        and is_likely_collection_redirect(crawl.final_url, crawl.canonical, crawl.h1s[0] if crawl.h1s else "")
    )
    schema = analyze_schema(
        crawl.json_ld,
        {"title": crawl.title or ""},
        microdata=crawl.microdata,
        og_hints=crawl.og_product_hints,
    )
    seo = analyze_seo(crawl)
    page_code = analyze_page_code(crawl)
    keywords = analyze_keywords(crawl)
    products = _collect_products(crawl.json_ld)
    schema_product = products[0] if products else None
    product_info = analyze_product_info(crawl, schema_product, shopify_data)
    audit_images = shopify_images if shopify_images else crawl.images
    vision = await analyze_product_images(audit_images)
    ai_ready = analyze_ai_readiness(product_info, schema.score)

    technical_score = 100
    if crawl.status_code >= 400:
        technical_score -= 40
    if not crawl.headers.get("content-type", "").startswith("text/html"):
        technical_score -= 20
    for issue in page_code.get("issues", []):
        if issue["severity"] == "critical":
            technical_score -= 25
        elif issue["severity"] == "high":
            technical_score -= 10
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
            "keywords": keywords.get("top_keywords", [])[:8],
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
        all_issues.append(_issue_dict(i.severity, i.code, i.message, "seo", i.field))
    for i in schema.issues:
        all_issues.append(_issue_dict(i.severity, i.code, i.message, "structured_data", i.field))
    for i in product_info.issues:
        all_issues.append(_issue_dict(i["severity"], i["code"], i["message"], "product_information"))
    for issue in page_code.get("issues", []):
        all_issues.append(_issue_dict(issue["severity"], issue["code"], issue["message"], "technical"))
    for img in vision.get("results", []):
        for msg in img.get("issues", []):
            all_issues.append(_issue_dict("medium", "image_issue", msg, "images"))

    if collection_redirect:
        all_issues.append(
            _issue_dict(
                "high",
                "shopify_collection_redirect",
                "This URL redirected to a collection page, not a single product. Use a direct /products/handle URL for accurate price and specs.",
                "product_information",
            )
        )

    buckets = bucket_issues(all_issues)
    fixes = build_fixes(crawl, seo, schema, vision, product_info, llm_notes)

    lab = _build_lab(category_scores, all_issues, seo, keywords, page_code, schema, product_info, vision)
    lab["image_gallery"] = _image_gallery(vision, crawl.images, shopify_images)
    if shopify_data:
        lab["shopify"] = {
            "handle": shopify_data.get("handle"),
            "variant_count": shopify_data.get("extracted", {}).get("variant_count"),
            "tags": shopify_data.get("extracted", {}).get("tags", [])[:8],
        }
    if collection_redirect:
        lab["warnings"] = ["URL appears to be a collection page — product data may be incomplete. Paste a direct product URL."]

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
        "lab": lab,
        "ai_shopping_readiness": ai_ready,
        "product_information": {
            "extracted": product_info.extracted,
            "missing": product_info.missing,
            "shopify_enriched": bool(shopify_data),
        },
        "structured_data": {
            "has_product_schema": schema.has_product_schema,
            "properties_found": schema.properties_found,
            "properties_missing": schema.properties_missing,
            "json_ld_blocks_found": len(crawl.json_ld),
            "snippets": page_code.get("json_ld_snippets", []),
        },
        "seo": {
            "signals": seo.signals,
            "title_meta": seo.title_meta,
            "analysis": llm_notes.get("seo_analysis") if llm_notes else _seo_narrative(seo, crawl),
            "issues": [{"severity": i.severity, "message": i.message, "code": i.code, "field": i.field} for i in seo.issues],
        },
        "keywords": keywords,
        "page_code": page_code,
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
