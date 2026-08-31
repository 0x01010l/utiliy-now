"""Headless Shopify stores — __NEXT_DATA__, embedded JSON, and Jina markdown."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

from .page_fetcher import is_bot_blocked_page
from .shopify_extractor import _format_price, _strip_html, normalize_shopify_url


def _product_handle(url: str) -> str | None:
    m = re.search(r"/products/([^/?#]+)", urlparse(url).path, re.I)
    return m.group(1) if m else None


def _brand_from_page(page_url: str, markdown: str, product_name: str | None = None) -> str | None:
    host = urlparse(page_url).netloc.lower().replace("www.", "")
    slug = host.split(".")[0]

    m = re.search(r"^Title:\s*(.+)$", markdown, re.M)
    if m:
        parts = [p.strip() for p in m.group(1).split("|") if p.strip()]
        if len(parts) >= 2:
            tail = parts[-1]
            if tail.lower() not in {"shop", "store", "home"} and len(tail) <= 32:
                return tail

    if slug and slug not in {"myshopify", "shop"}:
        return slug.upper() if len(slug) <= 5 else slug.title()
    return None


def _format_major_price(amount: Any, currency: str = "USD") -> str | None:
    if amount is None:
        return None
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return str(amount)
    if value > 1000:
        return _format_price(value, currency)
    currency = (currency or "USD").upper()
    if currency == "USD":
        return f"${value:,.2f}"
    if currency == "GBP":
        return f"£{value:,.2f}"
    if currency == "EUR":
        return f"€{value:,.2f}"
    return f"{currency} {value:,.0f}" if value == int(value) else f"{currency} {value:,.2f}"


def _images_from_media(media: list, title: str) -> list[dict[str, Any]]:
    gallery: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in media:
        if not isinstance(item, dict):
            continue
        src = item.get("src") or item.get("url") or ""
        src = normalize_shopify_url(src)
        if not src:
            continue
        key = src.split("?")[0].lower()
        if key in seen:
            continue
        seen.add(key)
        gallery.append({"src": src, "src_full": src, "alt": item.get("altText") or title or ""})
        if len(gallery) >= 12:
            break
    return gallery


def extract_from_next_data(html: str, page_url: str) -> dict[str, Any] | None:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        payload = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None

    page_props = payload.get("props", {}).get("pageProps", {})
    product_data = page_props.get("productData") or {}
    product = product_data.get("product")
    if not isinstance(product, dict) or not product.get("title"):
        return None

    title = product.get("title", "")
    media = product.get("media") or []
    if not media and product.get("featuredMedia"):
        media = [product["featuredMedia"]]

    description = _strip_html(product.get("description", ""))
    material = None
    for pat in (r"100%\s+[A-Za-z]+", r"MATERIALS[^.]*?(\d+%\s+[A-Za-z]+)"):
        m2 = re.search(pat, description, re.I)
        if m2:
            material = m2.group(1) if m2.lastindex else m2.group(0)
            break

    sku = product.get("sku")
    if product_data.get("variants"):
        for v in product_data["variants"]:
            if isinstance(v, dict) and v.get("sku"):
                sku = v.get("sku")
                break

    brand = product.get("vendor") or _brand_from_page(page_url, "", title)

    extracted: dict[str, Any] = {
        "name": title,
        "brand": brand,
        "price": _format_major_price(product.get("price") or product.get("lowestPrice")),
        "compare_at_price": _format_major_price(product.get("compareAtPrice")) if product.get("compareAtPrice") else None,
        "sku": sku,
        "availability": "In stock" if product.get("inStock", True) else "Out of stock",
        "category": product.get("category") or product.get("type"),
        "material": material,
    }
    if product.get("fit"):
        extracted["fit"] = product.get("fit")

    desc_lower = description.lower()
    if "free" in desc_lower and ("return" in desc_lower or "delivery" in desc_lower):
        extracted["returns"] = "Free returns mentioned"
    if "delivery" in desc_lower or "shipping" in desc_lower:
        extracted["shipping"] = "Delivery info in description"

    return {
        "source": "shopify_next_data",
        "handle": product.get("handle") or _product_handle(page_url),
        "extracted": {k: v for k, v in extracted.items() if v},
        "images": _images_from_media(media, title),
        "description_text": description[:2000],
        "product_text": f"{title} {description}"[:8000],
        "is_product_page": True,
    }


def _is_product_image_url(url: str, handle: str | None) -> bool:
    lower = url.lower()
    if any(skip in lower for skip in ("logo", "icon", "flag", "payment", "sprite", "avatar", "gepi.global-e")):
        return False
    if any(sig in lower for sig in ("cdn.shopify.com", "imgix.net", "/files/", "shopify", "product", "cdn/shop")):
        return True
    if handle and handle.replace("-", "")[:10] in lower.replace("-", ""):
        return True
    return bool(re.search(r"\.(jpg|jpeg|png|webp)(\?|$)", lower, re.I))


def _images_from_jina(markdown: str, handle: str | None, title: str) -> list[dict[str, Any]]:
    gallery: list[dict[str, Any]] = []
    seen: set[str] = set()

    for alt, url in re.findall(r"!\[([^\]]*)\]\((https?://[^)]+)\)", markdown):
        if not _is_product_image_url(url, handle):
            continue
        src = normalize_shopify_url(url)
        key = src.split("?")[0].lower()
        if key in seen:
            continue
        seen.add(key)
        gallery.append({"src": src, "src_full": src, "alt": alt or title})
        if len(gallery) >= 12:
            break
    return gallery


def _price_after_heading(markdown: str) -> str | None:
    """Many headless Shopify themes put price on the line after the product H1."""
    amount_re = r"(?:\d{1,3}(?:,\d{3})+|\d+)"
    m = re.search(
        rf"^#{{1,2}}\s+[^\n]+\n+(?:[^\n#][^\n]*\n){{0,4}}?(MAD|USD|EUR|GBP|CAD|AUD)\s+({amount_re})\b",
        markdown,
        re.M | re.I,
    )
    if not m:
        return None
    currency, amount_raw = m.group(1), m.group(2)
    try:
        amount = float(amount_raw.replace(",", ""))
    except ValueError:
        return None
    if currency.upper() == "USD":
        return f"${amount:,.2f}"
    return f"{currency.upper()} {amount:,.0f}" if amount == int(amount) else f"{currency.upper()} {amount:,.2f}"


def _extract_price_from_markdown(markdown: str, title: str | None) -> str | None:
    heading_price = _price_after_heading(markdown)
    if heading_price:
        return heading_price
    blocks: list[str] = []
    if title:
        m = re.search(rf"(?:^#\s+{re.escape(title)}|^##\s+{re.escape(title)})[\s\S]{{0,600}}", markdown, re.M | re.I)
        if m:
            blocks.append(m.group(0))
    m = re.search(r"^Title:\s*.+$[\s\S]{0,800}", markdown, re.M)
    if m:
        blocks.append(m.group(0))
    blocks.append(markdown[:4000])

    amount_re = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?"
    patterns = (
        rf"\b(MAD|USD|EUR|GBP|CAD|AUD)\s+({amount_re})\b",
        rf"([\$£€])\s*({amount_re})",
        r"Regular Price:\s*([\$£€]?)([\d,.]+)",
    )
    candidates: list[tuple[float, str]] = []
    for block in blocks:
        for pat in patterns:
            for m in re.finditer(pat, block, re.I):
                groups = m.groups()
                currency = groups[0] if groups else "$"
                amount_raw = groups[1] if len(groups) > 1 else groups[0]
                try:
                    amount = float(str(amount_raw).replace(",", ""))
                except ValueError:
                    continue
                if currency in {"$", "£", "€"} and amount < 5:
                    continue
                if str(currency).upper() in {"MAD", "GBP", "EUR"} and amount < 20:
                    continue
                if amount > 50000:
                    continue
                if currency in {"$", "£", "€"}:
                    label = f"{currency}{amount:,.2f}"
                else:
                    label = f"{currency.upper()} {amount:,.0f}" if amount == int(amount) else f"{currency.upper()} {amount:,.2f}"
                candidates.append((amount, label))
        if candidates:
            break

    if not candidates:
        return None
    return candidates[0][1]


def extract_shopify_from_jina(markdown: str, page_url: str) -> dict[str, Any] | None:
    if not markdown or len(markdown) < 400:
        return None
    if is_bot_blocked_page(markdown):
        return None

    handle = _product_handle(page_url)
    title = None

    m = re.search(r"^Title:\s*(.+)$", markdown, re.M)
    if m:
        parts = [p.strip() for p in m.group(1).split("|") if p.strip()]
        if len(parts) >= 3:
            title = f"{parts[0]} | {parts[1]}"
        elif parts:
            title = parts[0]
    if not title:
        m = re.search(r"^#\s+(.+)$", markdown, re.M)
        if m:
            title = m.group(1).strip()
    if not title:
        m = re.search(r"^##\s+(.+)$", markdown, re.M)
        if m:
            title = m.group(1).strip()

    if title and is_bot_blocked_page("", title):
        return None

    price = _extract_price_from_markdown(markdown, title)

    sku = None
    m = re.search(r"(?:SKU|MPN|Style)[:\s]+([A-Z0-9-]+)", markdown, re.I)
    if m:
        sku = m.group(1).strip()

    description = ""
    for pat in (
        r"##### Description\s+([\s\S]{0,3000}?)(?:\n#####|\Z)",
        r"## Description\s+([\s\S]{0,3000}?)(?:\n##|\Z)",
    ):
        m = re.search(pat, markdown, re.I)
        if m:
            description = _strip_html(re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", m.group(1)))
            break

    material = None
    m = re.search(r"(\d+%\s+[A-Za-z]+(?:\s+[A-Za-z]+)?)", description or markdown)
    if m:
        material = m.group(1)

    availability = "In stock" if re.search(r"add to (cart|bag)|in stock|select a size", markdown, re.I) else "Unknown"
    images = _images_from_jina(markdown, handle, title or "")
    brand = _brand_from_page(page_url, markdown, title)

    if not title and not images and not price:
        return None

    extracted: dict[str, Any] = {
        "name": title,
        "brand": brand,
        "price": price,
        "sku": sku,
        "availability": availability,
        "material": material,
    }
    if "free return" in markdown.lower():
        extracted["returns"] = "Free returns mentioned"
    if "delivery" in markdown.lower() or "shipping" in markdown.lower():
        extracted["shipping"] = "Delivery info on page"

    product_text = " ".join(v for v in [title, description, f"SKU: {sku}" if sku else ""] if v)

    return {
        "source": "shopify_jina",
        "handle": handle,
        "extracted": {k: v for k, v in extracted.items() if v},
        "images": images,
        "description_text": description[:2000],
        "product_text": product_text[:8000],
        "is_product_page": True,
    }


def extract_embedded_product_json(html: str, page_url: str) -> dict[str, Any] | None:
    """Some themes embed product JSON in script tags."""
    for m in re.finditer(r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>', html, re.S):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("title") and (data.get("variants") or data.get("media")):
            from .product_extractor import _shopify_from_json
            return _shopify_from_json(data, page_url)
    return None
