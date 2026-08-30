"""Unified product enrichment: Shopify .js, JSON-LD, OG, and HTML gallery."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import httpx

from .crawler import CrawlResult
from .image_utils import normalize_image_url
from .jsonld_extractor import extract_from_json_ld
from .shopify_extractor import fetch_shopify_product, product_js_url, store_origin


def _product_handle(url: str) -> str | None:
    m = re.search(r"/products/([^/?#]+)", urlparse(url).path, re.I)
    return m.group(1) if m else None


def _shopify_js_candidates(page_url: str) -> list[str]:
    """Try .js/.json with and without locale prefix (e.g. /en-ma/)."""
    parsed = urlparse(page_url)
    m = re.search(r"/products/([^/?#]+)", parsed.path, re.I)
    if not m:
        return []
    handle = m.group(1)
    base = f"{parsed.scheme}://{parsed.netloc}"
    urls = [
        f"{base}/products/{handle}.js",
        f"{base}/products/{handle}.json",
    ]
    # Strip locale prefix: /en-ma/products/... -> /products/...
    stripped = re.sub(r"^/[a-z]{2}-[a-z]{2}(?=/)", "", parsed.path, flags=re.I)
    if stripped != parsed.path:
        urls.append(f"{base}{stripped.rstrip('/')}.js")
        urls.append(f"{base}{stripped.rstrip('/')}.json")
    return urls


async def _try_shopify_endpoints(page_url: str, client: httpx.AsyncClient) -> dict[str, Any] | None:
    for url in _shopify_js_candidates(page_url):
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if isinstance(data, dict) and data.get("id"):
                return _shopify_from_json(data, page_url)
        except Exception:
            continue
    return None


def _shopify_from_json(data: dict, page_url: str) -> dict[str, Any] | None:
    """Parse Shopify .json response (same shape as .js)."""
    from .shopify_extractor import _availability_label, _format_price, _format_weight, _strip_html, normalize_shopify_url

    variants = data.get("variants") or []
    primary = variants[0] if variants else {}
    origin = store_origin(page_url)

    raw_images: list[str] = []
    if data.get("featured_image"):
        raw_images.append(data["featured_image"])
    for img in data.get("images") or []:
        if isinstance(img, str) and img not in raw_images:
            raw_images.append(img)

    images = []
    for src in raw_images[:12]:
        normalized = normalize_shopify_url(src)
        if normalized.startswith("/"):
            normalized = origin + normalized
        sep = "&" if "?" in normalized else "?"
        images.append({"src": f"{normalized}{sep}width=480", "src_full": normalized, "alt": data.get("title", "")})

    price_cents = data.get("price") or primary.get("price")
    extracted = {
        "name": data.get("title"),
        "brand": data.get("vendor"),
        "price": _format_price(price_cents),
        "sku": primary.get("sku"),
        "availability": _availability_label(data.get("available"), variants),
        "weight": _format_weight(primary.get("weight")),
        "category": data.get("type"),
    }

    return {
        "source": "shopify_product_json",
        "extracted": extracted,
        "images": images,
        "description_text": _strip_html(data.get("description", ""))[:2000],
        "is_product_page": True,
    }


def extract_html_gallery(html: str, seed_images: list[str], handle: str | None = None) -> list[dict[str, Any]]:
    """Pull product gallery images from Shopify CDN URLs in page HTML."""
    urls = re.findall(r'https://cdn\.shopify\.com/s/files/[^"\'\s<>\\]+', html)
    urls += ["https:" + u for u in re.findall(r'//cdn\.shopify\.com/s/files/[^"\'\s<>\\]+', html)]

    # Build filter tokens from seed JSON-LD images (e.g. AP-TSH-0647-DHG)
    tokens: list[str] = []
    for seed in seed_images[:3]:
        for m in re.finditer(r"([A-Z]{2,}-[A-Z0-9-]{4,})", seed):
            tokens.append(m.group(1))
        parts = seed.split("/files/")[-1].split("-")
        if len(parts) >= 3:
            tokens.append("-".join(parts[:4]))

    tokens = list(dict.fromkeys(t for t in tokens if len(t) >= 6))
    if handle:
        for part in handle.split("-"):
            if len(part) > 3:
                tokens.append(part.upper())

    filtered = urls
    if tokens:
        scored: list[tuple[int, str]] = []
        for u in urls:
            upper = u.upper()
            score = sum(1 for t in tokens if t.upper() in upper)
            if score > 0:
                scored.append((score, u))
        if scored:
            scored.sort(key=lambda x: (-x[0], x[1]))
            filtered = [u for _, u in scored]

    # Exclude obvious non-product assets
    skip = ("HEADER", "COLLECTION", "NAV", "BANNER", "LOGO", "ICON", "PAYMENT")
    gallery: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in filtered:
        if any(s in raw.upper() for s in skip):
            continue
        src = normalize_image_url(raw)
        key = src.split("?")[0].lower()
        if key in seen:
            continue
        seen.add(key)
        sep = "&" if "?" in src else "?"
        display = f"{src}{sep}width=600" if "width=" not in src else src
        gallery.append({"src": display, "src_full": src, "alt": ""})
        if len(gallery) >= 12:
            break
    return gallery


async def enrich_product_data(crawl: CrawlResult) -> dict[str, Any] | None:
    """Best-effort product enrichment from all available sources."""
    data: dict[str, Any] | None = None

    if crawl.platform == "shopify":
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
            data = await _try_shopify_endpoints(crawl.final_url, client)
            if not data:
                data = await fetch_shopify_product(crawl.final_url, client=client)

    if not data:
        data = extract_from_json_ld(crawl.json_ld)

    if not data and crawl.og_product_hints:
        hints = crawl.og_product_hints
        extracted = {k: v for k, v in {
            "name": hints.get("name"),
            "price": f"{hints.get('priceCurrency', '')} {hints.get('price', '')}".strip(),
            "brand": hints.get("brand"),
            "availability": hints.get("availability"),
        }.items() if v}
        if extracted:
            imgs = []
            if hints.get("image"):
                imgs.append({"src": hints["image"], "src_full": hints["image"], "alt": extracted.get("name", "")})
            data = {"source": "open_graph", "extracted": extracted, "images": imgs, "description_text": "", "is_product_page": True}

    if not data:
        return None

    # Supplement images from HTML gallery (critical for headless Shopify like SKIMS)
    seed = [i.get("src_full") or i.get("src", "") for i in data.get("images", [])]
    seed += [crawl.og_product_hints.get("image", "")] if crawl.og_product_hints else []
    html_gallery = extract_html_gallery(crawl.html, [s for s in seed if s], _product_handle(crawl.final_url))

    if html_gallery:
        existing = {normalize_image_url(i.get("src", "")).split("?")[0] for i in data.get("images", [])}
        merged = list(data.get("images") or [])
        for img in html_gallery:
            key = normalize_image_url(img["src"]).split("?")[0]
            if key not in existing:
                existing.add(key)
                merged.append(img)
        data["images"] = merged[:12]

    # Visible price fallback (e.g. "MAD 583")
    extracted = data.setdefault("extracted", {})
    if not extracted.get("price"):
        m = re.search(r"(MAD|USD|EUR|GBP|\$|£|€)\s*([\d,]+(?:\.\d{2})?)", crawl.visible_text)
        if m:
            extracted["price"] = f"{m.group(1)} {m.group(2)}".replace("  ", " ")

    return data
