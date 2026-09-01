"""Platform-specific audit helpers (Amazon, Shopify, WooCommerce)."""

from __future__ import annotations

from typing import Any


def platform_label(platform: str) -> str:
    return {
        "amazon": "Amazon",
        "shopify": "Shopify",
        "woocommerce": "WooCommerce",
        "etsy": "Etsy",
        "bigcommerce": "BigCommerce",
    }.get(platform, platform.title() or "Generic")


def build_schema_checklist(
    platform: str,
    schema,
    extracted: dict[str, Any],
    images: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Schema checklist — marketplaces use extracted listing data, not JSON-LD."""
    props = [
        "name",
        "description",
        "image",
        "sku",
        "brand",
        "offers",
        "price",
        "availability",
        "gtin",
        "aggregateRating",
    ]

    if platform in {"amazon", "shopify", "woocommerce"}:
        description = extracted.get("features") or extracted.get("description_text") or extracted.get("description")
        has_images = bool(images)
        field_map = {
            "name": extracted.get("name"),
            "description": description,
            "image": has_images,
            "sku": extracted.get("sku") or extracted.get("asin"),
            "brand": extracted.get("brand"),
            "offers": extracted.get("price") or extracted.get("availability"),
            "price": extracted.get("price"),
            "availability": extracted.get("availability"),
            "gtin": extracted.get("upc") or extracted.get("barcode"),
            "aggregateRating": extracted.get("rating"),
        }
        checklist = []
        for prop in props:
            val = field_map.get(prop)
            if val:
                checklist.append({"property": prop, "status": "found", "source": platform})
            elif prop in {"gtin", "aggregateRating"}:
                checklist.append({"property": prop, "status": "optional", "source": platform})
            else:
                checklist.append({"property": prop, "status": "missing", "source": platform})
        return checklist

    found_set = set(schema.properties_found)
    missing_set = set(schema.properties_missing)
    checklist = []
    for prop in props:
        if prop in found_set or any(prop in f for f in found_set):
            checklist.append({"property": prop, "status": "found", "source": "json-ld"})
        elif prop in missing_set:
            checklist.append({"property": prop, "status": "missing", "source": "json-ld"})
        else:
            checklist.append({"property": prop, "status": "optional", "source": "json-ld"})
    return checklist


def marketplace_structured_score(platform: str, extracted: dict[str, Any], images: list[dict]) -> int:
    if platform not in {"amazon", "shopify", "woocommerce"}:
        return 0
    core = ("name", "brand", "sku", "price", "availability", "material")
    found = sum(1 for key in core if extracted.get(key))
    score = 50 + found * 7
    if images:
        score += min(15, len(images) * 2)
    if extracted.get("description") or extracted.get("features"):
        score += 5
    return min(95, score)
