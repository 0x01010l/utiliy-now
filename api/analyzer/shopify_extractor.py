"""Extract product data from Shopify stores via the public product.json endpoint."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

SHOPIFY_UA = "Mozilla/5.0 (compatible; UtiliyBot/1.0; +https://utiliy.com)"


def normalize_shopify_url(url: str) -> str:
    """Ensure protocol-relative and path-only URLs are absolute HTTPS."""
    url = (url or "").strip()
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return url  # caller must join with store origin
    if not url.startswith("http"):
        return "https://" + url.lstrip("/")
    return url


def product_js_url(page_url: str) -> str | None:
    parsed = urlparse(page_url)
    path = parsed.path.rstrip("/")
    match = re.search(r"/products/([^/?#]+)", path, re.I)
    if not match:
        return None
    handle = match.group(1)
    base = f"{parsed.scheme}://{parsed.netloc}"
    return f"{base}/products/{handle}.js"


def store_origin(page_url: str) -> str:
    parsed = urlparse(page_url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _format_price(cents: int | float | None, currency: str = "USD") -> str | None:
    if cents is None:
        return None
    try:
        amount = float(cents) / 100.0
    except (TypeError, ValueError):
        return str(cents)
    symbol = {"$": "USD", "£": "GBP", "€": "EUR"}.get(currency, currency)
    if symbol == "USD" or currency == "USD":
        return f"${amount:,.2f}"
    return f"{amount:,.2f} {currency}"


def _format_weight(grams: int | float | None) -> str | None:
    if grams is None:
        return None
    try:
        g = float(grams)
    except (TypeError, ValueError):
        return None
    if g >= 1000:
        return f"{g / 1000:.2f} kg ({int(g)} g)"
    return f"{int(g)} g"


def _availability_label(available: bool | None, variants: list[dict]) -> str:
    if available is True:
        return "In stock"
    if available is False:
        return "Out of stock"
    if variants:
        any_avail = any(v.get("available") for v in variants)
        return "In stock" if any_avail else "Out of stock"
    return "Unknown"


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _find_in_text(text: str, patterns: list[str]) -> bool:
    lower = text.lower()
    return any(p in lower for p in patterns)


async def fetch_shopify_product(page_url: str, client: httpx.AsyncClient | None = None) -> dict[str, Any] | None:
    js_url = product_js_url(page_url)
    if not js_url:
        return None

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"User-Agent": SHOPIFY_UA})

    try:
        resp = await client.get(js_url)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception:
        return None
    finally:
        if owns_client:
            await client.aclose()

    if not isinstance(data, dict) or not data.get("id"):
        return None

    variants = data.get("variants") or []
    primary = variants[0] if variants else {}
    origin = store_origin(page_url)

    raw_images: list[str] = []
    if data.get("featured_image"):
        raw_images.append(data["featured_image"])
    for img in data.get("images") or []:
        if isinstance(img, str) and img not in raw_images:
            raw_images.append(img)
    for m in data.get("media") or []:
        if isinstance(m, dict):
            src = m.get("src") or m.get("preview_image", {}).get("src")
            if src and src not in raw_images:
                raw_images.append(src)

    images = []
    for src in raw_images[:12]:
        normalized = normalize_shopify_url(src)
        if normalized.startswith("/"):
            normalized = origin + normalized
        # Display-friendly size for lab thumbnails
        sep = "&" if "?" in normalized else "?"
        display = f"{normalized}{sep}width=480"
        images.append({"src": display, "src_full": normalized, "alt": data.get("title", "")})

    price_cents = data.get("price") or primary.get("price")
    compare_cents = data.get("compare_at_price") or primary.get("compare_at_price")
    description_text = _strip_html(data.get("description", ""))

    extracted: dict[str, Any] = {
        "name": data.get("title"),
        "brand": data.get("vendor"),
        "price": _format_price(price_cents),
        "price_raw": price_cents,
        "compare_at_price": _format_price(compare_cents) if compare_cents else None,
        "sku": primary.get("sku"),
        "availability": _availability_label(data.get("available"), variants),
        "weight": _format_weight(primary.get("weight")),
        "weight_grams": primary.get("weight"),
        "category": data.get("type"),
        "tags": data.get("tags") or [],
        "variant_count": len(variants),
        "barcode": primary.get("barcode"),
    }

    if _find_in_text(description_text, ["warranty", "guarantee", "lifetime guarantee", "year warranty"]):
        extracted["warranty"] = "Mentioned in product description"
    elif _find_in_text(" ".join(data.get("tags") or []), ["warranty", "guarantee"]):
        extracted["warranty"] = "Listed in product tags"

    if _find_in_text(description_text, ["free shipping", "ships in", "delivery", "shipping"]):
        extracted["shipping"] = "Mentioned in description"
    if _find_in_text(description_text, ["return", "refund", "money back"]):
        extracted["returns"] = "Mentioned in description"
    if _find_in_text(description_text, ["material", "fabric", "made from", "100%"]):
        # grab a short material snippet
        for word in ["material", "fabric", "made from"]:
            idx = description_text.lower().find(word)
            if idx >= 0:
                extracted["material"] = description_text[idx : idx + 80].strip()
                break

    return {
        "source": "shopify_product_js",
        "handle": data.get("handle"),
        "product_id": data.get("id"),
        "extracted": extracted,
        "images": images,
        "description_text": description_text[:2000],
        "is_product_page": True,
    }


def is_likely_collection_redirect(page_url: str, canonical: str | None, h1: str) -> bool:
    """Detect when a product-looking URL lands on a collection page."""
    path = urlparse(page_url).path.lower()
    if "/products/" not in path:
        return True
    if canonical and "/collections/" in canonical and "/products/" not in canonical:
        return True
    return False
