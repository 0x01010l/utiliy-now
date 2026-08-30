"""Image and product-information heuristics (deterministic)."""

from __future__ import annotations

from dataclasses import dataclass, field

from .crawler import CrawlResult


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
    ("availability", ["in stock", "out of stock", "available", "sold out"]),
    ("sku", ["sku", "model", "item #"]),
    ("dimensions", ["dimension", "size", "width", "height", "length"]),
    ("weight", ["weight", " lbs", " kg", " oz"]),
    ("material", ["material", "fabric", "made of"]),
    ("warranty", ["warranty", "guarantee"]),
    ("shipping", ["shipping", "delivery", "ships"]),
    ("returns", ["return", "refund"]),
]


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


def analyze_product_info(crawl: CrawlResult, schema_product: dict | None) -> ProductInfoAnalysis:
    result = ProductInfoAnalysis()
    text = crawl.visible_text.lower()
    title = (crawl.title or "").strip()
    h1 = crawl.h1s[0] if crawl.h1s else ""

    extracted: dict[str, str | list[str] | None] = {
        "name": schema_product.get("name") if schema_product else (h1 or title or None),
        "brand": None,
        "price": None,
        "availability": None,
        "category": schema_product.get("category") if schema_product else None,
    }

    if schema_product:
        brand = schema_product.get("brand")
        if isinstance(brand, dict):
            extracted["brand"] = brand.get("name")
        elif isinstance(brand, str):
            extracted["brand"] = brand
        offers = schema_product.get("offers")
        if isinstance(offers, dict):
            extracted["price"] = offers.get("price")
            extracted["availability"] = offers.get("availability")
        for og_key in ("product:price:amount", "og:price:amount"):
            if crawl.open_graph.get(og_key):
                extracted["price"] = crawl.open_graph.get(og_key)

    missing: list[str] = []
    for field_name, hints in INFO_FIELDS:
        present = False
        if field_name in extracted and extracted[field_name]:
            present = True
        elif _text_contains_any(text, hints):
            present = True
        if not present:
            missing.append(field_name)
            result.issues.append(
                {
                    "severity": "medium" if field_name in {"dimensions", "weight", "warranty"} else "high",
                    "code": f"missing_{field_name}",
                    "message": f"Could not find clear {field_name.replace('_', ' ')} information.",
                }
            )

    result.extracted = extracted
    result.missing = missing
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
