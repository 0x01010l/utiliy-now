"""Image and product-information heuristics (deterministic)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .crawler import CrawlResult
from .page_fetcher import is_bot_blocked_page


@dataclass
class ImageAnalysis:
    score: int = 0
    issues: list[dict[str, str]] = field(default_factory=list)
    image_count: int = 0
    with_alt: int = 0


@dataclass
class ProductInfoAnalysis:
    score: int = 0
    extracted: dict[str, str | list[str] | None] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    issues: list[dict[str, str]] = field(default_factory=list)


INFO_FIELDS = [
    ("name", ["product", "item", "title"]),
    ("price", ["price", "$", "€", "£"]),
    ("brand", ["brand"]),
    ("availability", ["in stock", "out of stock", "available", "sold out", "unavailable"]),
    ("sku", ["sku", "model", "item #", "asin"]),
    ("dimensions", ["dimension", "size", "width", "height", "length"]),
    ("weight", ["weight", " lbs", " kg", " oz"]),
    ("material", ["material", "fabric", "made of", "croslite", "leather", "rubber"]),
    ("warranty", ["warranty", "guarantee"]),
    ("shipping", ["shipping", "delivery", "ships"]),
    ("returns", ["return", "refund"]),
]

AMAZON_OPTIONAL_FIELDS = {"warranty", "dimensions", "weight"}


def analyze_images(crawl: CrawlResult) -> ImageAnalysis:
    result = ImageAnalysis(image_count=len(crawl.images))
    if not crawl.images:
        result.issues.append(
            {"severity": "critical", "code": "no_images", "message": "No product images detected."}
        )
        result.score = 20
        return result

    result.with_alt = sum(1 for i in crawl.images if i.get("alt"))
    if result.with_alt < min(2, len(crawl.images)):
        result.issues.append(
            {
                "severity": "high",
                "code": "few_alt_images",
                "message": "Most images lack descriptive alt text.",
            }
        )

    if len(crawl.images) < 2:
        result.issues.append(
            {
                "severity": "medium",
                "code": "few_images",
                "message": "Only one product image found. Multiple angles help buyers and AI systems.",
            }
        )

    penalty = sum({"critical": 30, "high": 15, "medium": 8, "low": 3}[i["severity"]] for i in result.issues)
    result.score = max(0, min(100, 100 - penalty))
    return result


def _text_contains_any(text: str, needles: list[str]) -> bool:
    lower = text.lower()
    return any(n in lower for n in needles)


def _platform_extracted(crawl: CrawlResult, platform_data: dict[str, Any] | None) -> dict[str, Any]:
    extracted = dict((platform_data or {}).get("extracted") or {})

    if crawl.platform == "shopify" and len(extracted) < 3:
        from .headless_shopify_extractor import extract_from_next_data

        next_data = extract_from_next_data(crawl.html, crawl.final_url)
        if next_data:
            for key, value in (next_data.get("extracted") or {}).items():
                if value and not extracted.get(key):
                    extracted[key] = value

    if crawl.platform == "amazon":
        from .amazon_extractor import extract_amazon_product

        amazon = extract_amazon_product(crawl.html, crawl.final_url)
        if amazon:
            for key, value in (amazon.get("extracted") or {}).items():
                if value and not extracted.get(key):
                    extracted[key] = value

    return extracted


def analyze_product_info(
    crawl: CrawlResult,
    schema_product: dict | None,
    platform_data: dict[str, Any] | None = None,
) -> ProductInfoAnalysis:
    result = ProductInfoAnalysis()
    platform_extracted = _platform_extracted(crawl, platform_data)

    text = (crawl.product_text or crawl.visible_text).lower()
    if platform_data and platform_data.get("description_text"):
        text = text + " " + platform_data["description_text"].lower()
    elif platform_extracted.get("features"):
        text = text + " " + str(platform_extracted["features"]).lower()

    title = (crawl.h1s[0] if crawl.h1s else "") or (crawl.title or "").strip()
    if is_bot_blocked_page(crawl.html, crawl.title, crawl.status_code):
        title = crawl.h1s[0] if crawl.h1s else ""
    if crawl.platform == "shopify" and crawl.h1s:
        title = crawl.h1s[0]

    extracted: dict[str, str | list[str] | None] = {
        "name": platform_extracted.get("name") or (schema_product.get("name") if schema_product else None) or title or None,
        "brand": platform_extracted.get("brand"),
        "price": platform_extracted.get("price"),
        "compare_at_price": platform_extracted.get("compare_at_price"),
        "availability": platform_extracted.get("availability"),
        "sku": platform_extracted.get("sku") or platform_extracted.get("asin"),
        "weight": platform_extracted.get("weight"),
        "dimensions": platform_extracted.get("dimensions"),
        "category": platform_extracted.get("category") or (schema_product.get("category") if schema_product else None),
        "warranty": platform_extracted.get("warranty"),
        "shipping": platform_extracted.get("shipping"),
        "returns": platform_extracted.get("returns"),
        "material": platform_extracted.get("material"),
    }

    if schema_product:
        brand = schema_product.get("brand")
        if not extracted["brand"]:
            if isinstance(brand, dict):
                extracted["brand"] = brand.get("name")
            elif isinstance(brand, str):
                extracted["brand"] = brand
        offers = schema_product.get("offers")
        if isinstance(offers, dict) and not extracted["price"]:
            price = offers.get("price")
            currency = offers.get("priceCurrency", "USD")
            if price:
                extracted["price"] = f"{currency} {price}" if not str(price).startswith("$") else str(price)
            avail = offers.get("availability", "")
            if avail and not extracted["availability"]:
                extracted["availability"] = "In stock" if "InStock" in str(avail) else "Out of stock" if "OutOfStock" in str(avail) else str(avail)

    for og_key, field in (
        ("product:price:amount", "price"),
        ("og:price:amount", "price"),
        ("product:brand", "brand"),
    ):
        if not extracted.get(field) and crawl.open_graph.get(og_key):
            val = crawl.open_graph.get(og_key)
            if field == "price":
                extracted["price"] = f"${val}" if val and not str(val).startswith("$") else val
            else:
                extracted[field] = val

    if not extracted["price"]:
        m = re.search(r"[\$£€]\s?\d{1,4}(?:[.,]\d{2})?", crawl.product_text or crawl.visible_text)
        if m:
            extracted["price"] = m.group(0).strip()

    missing: list[str] = []
    for field_name, hints in INFO_FIELDS:
        present = bool(extracted.get(field_name))
        if not present and _text_contains_any(text, hints):
            present = True
        if not present:
            missing.append(field_name)
            if crawl.platform == "amazon" and field_name in AMAZON_OPTIONAL_FIELDS:
                continue
            sev = "medium" if field_name in {"dimensions", "weight", "warranty", "material"} else "high"
            if crawl.platform == "amazon" and field_name == "price" and extracted.get("availability"):
                sev = "medium"
            result.issues.append(
                {
                    "severity": sev,
                    "code": f"missing_{field_name}",
                    "message": f"Could not find clear {field_name.replace('_', ' ')} information.",
                }
            )

    result.extracted = {k: v for k, v in extracted.items() if v is not None}
    result.missing = missing

    if crawl.platform == "amazon":
        found_core = sum(1 for f in ("name", "brand", "sku", "availability", "material") if extracted.get(f))
        result.score = max(35, min(100, 40 + found_core * 12 - len(missing) * 3))
    else:
        penalty = min(80, len(missing) * 8)
        result.score = max(0, 100 - penalty)

    return result


def analyze_ai_readiness(product_info: ProductInfoAnalysis, schema_score: int) -> dict:
    """AI shopping readiness from deterministic signals."""
    critical_for_ai = ["name", "price", "brand", "availability", "sku"]
    missing_critical = [f for f in critical_for_ai if f in product_info.missing]
    score = 100
    score -= len(missing_critical) * 12
    score -= len([f for f in product_info.missing if f not in missing_critical]) * 5
    if schema_score < 60:
        score -= 15
    score = max(0, min(100, score))
    return {
        "score": score,
        "missing": product_info.missing,
        "summary": (
            "An AI shopping assistant could likely understand the core product."
            if score >= 70
            else "Important product facts are missing or ambiguous for AI shopping systems."
        ),
    }
