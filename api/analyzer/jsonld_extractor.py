"""Extract product facts from JSON-LD when Shopify .js endpoints are unavailable."""

from __future__ import annotations

import re
from typing import Any


def _walk_json_ld(node: Any, products: list[dict]) -> None:
    if isinstance(node, list):
        for item in node:
            _walk_json_ld(item, products)
        return
    if not isinstance(node, dict):
        return
    t = node.get("@type")
    types: set[str] = set()
    if isinstance(t, str):
        types.add(t)
    elif isinstance(t, list):
        types.update(str(x) for x in t)
    if types & {"Product", "ProductGroup"}:
        products.append(node)
    for value in node.values():
        if isinstance(value, (dict, list)):
            _walk_json_ld(value, products)


def _base_product_name(name: str) -> str:
    if " | " in name:
        left, right = name.rsplit(" | ", 1)
        if len(right.strip()) <= 4 or right.strip().upper() in {
            "XXS", "XS", "S", "M", "L", "XL", "2X", "3X", "4X", "5X",
        }:
            return left.strip()
    return name.strip()


def _offer_from_product(product: dict) -> dict | None:
    offers = product.get("offers")
    if isinstance(offers, dict):
        return offers
    if isinstance(offers, list) and offers:
        return offers[0] if isinstance(offers[0], dict) else None
    return None


def _format_price_major(price: Any, currency: str = "USD") -> str | None:
    if price is None:
        return None
    try:
        amount = float(price)
    except (TypeError, ValueError):
        return str(price)
    currency = (currency or "USD").upper()
    if currency == "USD":
        return f"${amount:,.2f}"
    if currency == "GBP":
        return f"£{amount:,.2f}"
    if currency == "EUR":
        return f"€{amount:,.2f}"
    return f"{currency} {amount:,.0f}" if amount == int(amount) else f"{currency} {amount:,.2f}"


def _availability_text(avail: Any) -> str | None:
    if not avail:
        return None
    s = str(avail)
    if "InStock" in s:
        return "In stock"
    if "OutOfStock" in s:
        return "Out of stock"
    if "PreOrder" in s:
        return "Pre-order"
    return s


def _images_from_product(product: dict) -> list[str]:
    imgs: list[str] = []
    raw = product.get("image")
    if isinstance(raw, str):
        imgs.append(raw)
    elif isinstance(raw, list):
        for i in raw:
            if isinstance(i, str):
                imgs.append(i)
            elif isinstance(i, dict) and i.get("url"):
                imgs.append(i["url"])
    return imgs


def extract_from_json_ld(json_ld: list[Any]) -> dict[str, Any] | None:
    products: list[dict] = []
    for block in json_ld:
        _walk_json_ld(block, products)
    if not products:
        return None

    # Group by base name — headless Shopify often emits one Product per variant
    groups: dict[str, list[dict]] = {}
    for p in products:
        name = p.get("name") or ""
        base = _base_product_name(str(name))
        groups.setdefault(base, []).append(p)

    # Pick the largest group (main product + variants)
    base_name, group = max(groups.items(), key=lambda x: len(x[1]))
    primary = group[0]

    # Merge offers, images, sku from variants
    offer = None
    for p in group:
        o = _offer_from_product(p)
        if o and o.get("price") is not None:
            offer = o
            break

    all_images: list[str] = []
    sku = None
    brand = None
    for p in group:
        all_images.extend(_images_from_product(p))
        if not sku and p.get("sku"):
            sku = p.get("sku")
        b = p.get("brand")
        if isinstance(b, dict):
            brand = brand or b.get("name")
        elif isinstance(b, str):
            brand = brand or b

    description = primary.get("description") or ""
    if isinstance(description, str):
        description = re.sub(r"<[^>]+>", " ", description).strip()

    currency = (offer or {}).get("priceCurrency", "USD")
    price_val = (offer or {}).get("price")

    extracted: dict[str, Any] = {
        "name": base_name,
        "brand": brand,
        "price": _format_price_major(price_val, currency),
        "availability": _availability_text((offer or {}).get("availability")),
        "sku": sku or primary.get("sku"),
        "category": primary.get("category"),
    }

    if primary.get("material"):
        extracted["material"] = primary.get("material")
    if primary.get("weight"):
        extracted["weight"] = str(primary.get("weight"))

    desc_lower = description.lower()
    if any(w in desc_lower for w in ("warranty", "guarantee")):
        extracted["warranty"] = "Mentioned in product description"
    if any(w in desc_lower for w in ("shipping", "delivery")):
        extracted["shipping"] = "Mentioned in description"
    if any(w in desc_lower for w in ("return", "refund")):
        extracted["returns"] = "Mentioned in description"

    images = []
    seen: set[str] = set()
    for src in all_images:
        if src and src not in seen:
            seen.add(src)
            images.append({"src": src, "src_full": src, "alt": base_name})

    return {
        "source": "json_ld",
        "extracted": extracted,
        "images": images[:12],
        "description_text": description[:2000],
        "is_product_page": True,
    }
