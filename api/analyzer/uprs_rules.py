"""Utiliy Product Readiness Specification (UPRS) — stable rule IDs for PDP audits."""

from __future__ import annotations

from typing import Any

UPRS_VERSION = "1.0.0"

# Maps internal analyzer codes → UPRS rule definitions
UPRS_RULES: list[dict[str, Any]] = [
    # Schema (U-SCH)
    {"id": "U-SCH-001", "pillar": "schema", "severity": "critical", "codes": ["missing_product_schema"], "title": "Product JSON-LD missing", "description": "No schema.org Product type in JSON-LD on the page."},
    {"id": "U-SCH-002", "pillar": "schema", "severity": "high", "codes": ["og_only_no_jsonld"], "title": "Open Graph only — no Product JSON-LD", "description": "Product signals exist in OG tags but not in machine-readable Product schema."},
    {"id": "U-SCH-003", "pillar": "schema", "severity": "medium", "codes": ["microdata_only"], "title": "Microdata only", "description": "Product found via microdata without JSON-LD."},
    {"id": "U-SCH-010", "pillar": "schema", "severity": "high", "codes": ["missing_name", "missing_description", "missing_image", "missing_sku", "missing_brand", "missing_offers"], "title": "Missing recommended Product property", "description": "A recommended schema.org Product property is absent."},
    {"id": "U-SCH-011", "pillar": "schema", "severity": "high", "codes": ["missing_offer"], "title": "Offer block missing", "description": "Product schema lacks an Offer or AggregateOffer."},
    {"id": "U-SCH-012", "pillar": "schema", "severity": "high", "codes": ["offer_missing_price", "offer_missing_priceCurrency", "offer_missing_availability"], "title": "Incomplete Offer", "description": "Offer block missing price, currency, or availability."},
    {"id": "U-SCH-020", "pillar": "schema", "severity": "medium", "codes": ["title_schema_mismatch"], "title": "Title vs schema name mismatch", "description": "HTML title and schema product name are misaligned."},
    {"id": "U-SCH-030", "pillar": "schema", "severity": "high", "codes": ["amazon_no_public_jsonld"], "title": "Marketplace: no public Product JSON-LD", "description": "Amazon listing without merchant-style public Product JSON-LD."},
    # Google SEO (U-SEO)
    {"id": "U-SEO-001", "pillar": "google_seo", "severity": "critical", "codes": ["http_error"], "title": "HTTP error", "description": "Page returned HTTP 4xx/5xx."},
    {"id": "U-SEO-010", "pillar": "google_seo", "severity": "critical", "codes": ["missing_title"], "title": "Missing title tag", "description": "No <title> element."},
    {"id": "U-SEO-011", "pillar": "google_seo", "severity": "high", "codes": ["title_too_short"], "title": "Title too short", "description": "Title under recommended length for commercial queries."},
    {"id": "U-SEO-012", "pillar": "google_seo", "severity": "medium", "codes": ["title_too_long"], "title": "Title too long", "description": "Title may truncate in SERPs."},
    {"id": "U-SEO-020", "pillar": "google_seo", "severity": "high", "codes": ["missing_meta_description"], "title": "Missing meta description", "description": "No meta description tag."},
    {"id": "U-SEO-030", "pillar": "google_seo", "severity": "high", "codes": ["missing_h1"], "title": "Missing H1", "description": "No primary H1 heading."},
    {"id": "U-SEO-031", "pillar": "google_seo", "severity": "medium", "codes": ["multiple_h1", "title_h1_mismatch"], "title": "Heading structure issue", "description": "Multiple H1s or title/H1 mismatch."},
    {"id": "U-SEO-040", "pillar": "google_seo", "severity": "medium", "codes": ["missing_canonical", "canonical_mismatch"], "title": "Canonical issue", "description": "Missing or mismatched canonical URL."},
    {"id": "U-SEO-050", "pillar": "google_seo", "severity": "high", "codes": ["thin_content", "light_content"], "title": "Thin product content", "description": "Insufficient visible product copy for ranking and AI extraction."},
    {"id": "U-SEO-060", "pillar": "google_seo", "severity": "high", "codes": ["missing_alt_text"], "title": "Images missing alt text", "description": "Product images lack descriptive alt attributes."},
    # Technical (U-TEC)
    {"id": "U-TEC-001", "pillar": "google_seo", "severity": "critical", "codes": ["noindex"], "title": "Page blocked from indexing", "description": "noindex directive present."},
    {"id": "U-TEC-002", "pillar": "google_seo", "severity": "high", "codes": ["no_viewport"], "title": "Missing viewport", "description": "No mobile viewport meta tag."},
    {"id": "U-TEC-010", "pillar": "google_seo", "severity": "critical", "codes": ["storefront_bot_block"], "title": "Bot-blocked storefront", "description": "Store blocked automated access (Vercel/Cloudflare)."},
    # Content / product facts (U-CNT)
    {"id": "U-CNT-010", "pillar": "content", "severity": "high", "codes": ["missing_name", "missing_price", "missing_brand", "missing_availability", "missing_sku"], "title": "Missing core product fact", "description": "A core product field machines need is absent from the page."},
    {"id": "U-CNT-020", "pillar": "content", "severity": "medium", "codes": ["missing_dimensions", "missing_weight", "missing_material", "missing_warranty", "missing_shipping", "missing_returns"], "title": "Missing decision evidence", "description": "Specs, shipping, returns, or warranty not visible."},
    {"id": "U-CNT-030", "pillar": "content", "severity": "medium", "codes": ["shopify_collection_redirect"], "title": "Collection redirect", "description": "URL redirected to collection instead of product."},
    # Images (U-IMG)
    {"id": "U-IMG-001", "pillar": "images", "severity": "high", "codes": ["image_issue"], "title": "Image accessibility or quality issue", "description": "Missing alt text or vision-detected image problems."},
    # AI visibility — derived from ai_readiness scoring (U-AI)
    {"id": "U-AI-001", "pillar": "ai_visibility", "severity": "high", "codes": [], "title": "Low AI shopping readiness", "description": "Composite score below 60: missing facts machines need to recommend the product."},
    {"id": "U-AI-010", "pillar": "ai_visibility", "severity": "high", "codes": [], "title": "Schema-dependent AI penalty", "description": "AI readiness penalized when structured data score is below 60."},
]

_CODE_TO_UPRS: dict[str, str] = {}
for rule in UPRS_RULES:
    for code in rule.get("codes", []):
        _CODE_TO_UPRS[code] = rule["id"]


def uprs_id_for_code(code: str) -> str | None:
    if code in _CODE_TO_UPRS:
        return _CODE_TO_UPRS[code]
    if code.startswith("missing_"):
        return "U-CNT-010" if code.replace("missing_", "") in {"name", "price", "brand", "availability", "sku"} else "U-CNT-020"
    if code.startswith("offer_missing_"):
        return "U-SCH-012"
    if code.startswith("missing_") and code in _CODE_TO_UPRS:
        return _CODE_TO_UPRS[code]
    return None


def export_spec() -> dict[str, Any]:
    return {
        "name": "Utiliy Product Readiness Specification",
        "short_name": "UPRS",
        "version": UPRS_VERSION,
        "url": "https://utiliy.com/spec/uprs/",
        "pillars": ["google_seo", "ai_visibility", "content", "keywords", "images", "schema"],
        "rules": UPRS_RULES,
    }
