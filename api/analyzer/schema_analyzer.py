"""Structured data (JSON-LD / Product schema) analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


PRODUCT_TYPES = {"Product", "ProductGroup"}
OFFER_TYPES = {"Offer", "AggregateOffer"}
RATING_TYPES = {"AggregateRating", "Review"}


@dataclass
class SchemaIssue:
    severity: str  # critical | high | medium | low
    code: str
    message: str
    field: str | None = None


@dataclass
class SchemaAnalysis:
    products: list[dict[str, Any]] = field(default_factory=list)
    issues: list[SchemaIssue] = field(default_factory=list)
    score: int = 0
    has_product_schema: bool = False
    properties_found: list[str] = field(default_factory=list)
    properties_missing: list[str] = field(default_factory=list)


def _flatten_types(node: dict[str, Any]) -> set[str]:
    t = node.get("@type")
    if isinstance(t, list):
        return {str(x) for x in t}
    if t:
        return {str(t)}
    return set()


def _collect_products(json_ld: list[Any]) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        types = _flatten_types(node)
        if types & PRODUCT_TYPES:
            products.append(node)
        for value in node.values():
            if isinstance(value, (dict, list)):
                walk(value)

    for block in json_ld:
        if isinstance(block, dict) and "@graph" in block:
            walk(block["@graph"])
        else:
            walk(block)
    return products


def _get_offers(product: dict[str, Any]) -> list[dict[str, Any]]:
    offers = product.get("offers")
    if not offers:
        return []
    if isinstance(offers, list):
        return [o for o in offers if isinstance(o, dict)]
    if isinstance(offers, dict):
        return [offers]
    return []


def analyze_schema(json_ld: list[Any], visible: dict[str, Any]) -> SchemaAnalysis:
    analysis = SchemaAnalysis()
    analysis.products = _collect_products(json_ld)
    analysis.has_product_schema = len(analysis.products) > 0

    recommended = [
        "name",
        "description",
        "image",
        "sku",
        "brand",
        "offers",
    ]
    optional_high_value = ["gtin", "mpn", "aggregateRating", "review", "category"]

    if not analysis.has_product_schema:
        analysis.issues.append(
            SchemaIssue(
                severity="critical",
                code="missing_product_schema",
                message="No Product JSON-LD found. Search engines and AI shopping systems rely on structured product data.",
            )
        )
        analysis.properties_missing = recommended + optional_high_value
        analysis.score = 15
        return analysis

    product = analysis.products[0]
    found: list[str] = []
    missing: list[str] = []

    for prop in recommended:
        val = product.get(prop)
        if val:
            found.append(prop)
        else:
            missing.append(prop)
            analysis.issues.append(
                SchemaIssue(
                    severity="high" if prop in {"name", "offers", "image"} else "medium",
                    code=f"missing_{prop}",
                    message=f"Product schema is missing recommended property: {prop}",
                    field=prop,
                )
            )

    for prop in optional_high_value:
        if product.get(prop):
            found.append(prop)
        else:
            missing.append(prop)

    offers = _get_offers(product)
    if not offers:
        analysis.issues.append(
            SchemaIssue(
                severity="high",
                code="missing_offer",
                message="Product schema has no Offer block with price and availability.",
                field="offers",
            )
        )
    else:
        offer = offers[0]
        for field_name in ("price", "priceCurrency", "availability"):
            if not offer.get(field_name):
                analysis.issues.append(
                    SchemaIssue(
                        severity="high",
                        code=f"offer_missing_{field_name}",
                        message=f"Offer is missing {field_name}.",
                        field=field_name,
                    )
                )
            else:
                found.append(f"offers.{field_name}")

    # Cross-check visible vs schema
    if visible.get("title") and product.get("name"):
        if visible["title"].lower()[:40] not in str(product.get("name", "")).lower() and str(product.get("name", "")).lower()[:40] not in visible["title"].lower():
            analysis.issues.append(
                SchemaIssue(
                    severity="medium",
                    code="title_schema_mismatch",
                    message="Page title and Product schema name may not align. Consistency helps parsers trust the page.",
                )
            )

    analysis.properties_found = found
    analysis.properties_missing = missing

    penalty = sum(
        {"critical": 25, "high": 12, "medium": 6, "low": 3}[i.severity]
        for i in analysis.issues
    )
    analysis.score = max(0, min(100, 100 - penalty))
    return analysis
