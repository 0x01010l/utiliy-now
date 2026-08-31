"""Unified product enrichment: Shopify .js, JSON-LD, OG, and HTML gallery."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import httpx

from .amazon_extractor import extract_amazon_from_jina, extract_amazon_product
from .crawler import CrawlResult, is_likely_shopify_product_url
from .image_utils import normalize_image_url
from .jsonld_extractor import extract_from_json_ld
from .headless_shopify_extractor import (
    extract_embedded_product_json,
    extract_from_next_data,
    extract_shopify_from_jina,
)
from .page_fetcher import (
    amazon_extraction_is_thin,
    fetch_jina_markdown,
    is_amazon_blocked,
    is_bot_blocked_page,
    is_shopify_blocked,
    shopify_extraction_is_thin,
)
from .shopify_extractor import fetch_shopify_product, product_js_url, store_origin


def _merge_platform_data(primary: dict[str, Any] | None, secondary: dict[str, Any]) -> dict[str, Any]:
    """Prefer secondary (e.g. Jina) and fill gaps from primary HTML."""
    merged = dict(secondary)
    if not primary:
        return merged
    ext = dict(merged.get("extracted") or {})
    for key, val in (primary.get("extracted") or {}).items():
        if val and not ext.get(key):
            ext[key] = val
    merged["extracted"] = ext
    if not merged.get("images") and primary.get("images"):
        merged["images"] = primary["images"]
    return merged


def _product_handle(url: str) -> str | None:
    m = re.search(r"/products/([^/?#]+)", urlparse(url).path, re.I)
    return m.group(1) if m else None


def _shopify_js_candidates(page_url: str) -> list[str]:
    """Try .js/.json on the exact path (incl. locale) and without locale prefix."""
    parsed = urlparse(page_url)
    m = re.search(r"/products/([^/?#]+)", parsed.path, re.I)
    if not m:
        return []
    handle = m.group(1)
    base = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.rstrip("/")
    urls = [
        f"{base}{path}.js",
        f"{base}{path}.json",
        f"{base}/products/{handle}.js",
        f"{base}/products/{handle}.json",
    ]
    stripped = re.sub(r"^/[a-z]{2}-[a-z]{2}(?=/)", "", path, flags=re.I)
    if stripped != path:
        urls.append(f"{base}{stripped}.js")
        urls.append(f"{base}{stripped}.json")
    return list(dict.fromkeys(urls))


SHOPIFY_SOURCE_PRIORITY = (
    "shopify_product_js",
    "shopify_product_json",
    "json_ld",
    "shopify_next_data",
    "shopify_embedded_json",
    "open_graph",
    "shopify_jina",
)


def _source_rank(source: str | None) -> int:
    try:
        return SHOPIFY_SOURCE_PRIORITY.index(source or "")
    except ValueError:
        return len(SHOPIFY_SOURCE_PRIORITY)


def _merge_shopify_layers(layers: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Merge Shopify sources; higher-priority sources win field conflicts."""
    if not layers:
        return None
    ordered = sorted(layers, key=lambda layer: _source_rank(layer.get("source")))

    extracted: dict[str, Any] = {}
    for layer in sorted(layers, key=lambda l: _source_rank(l.get("source"))):
        for key, val in (layer.get("extracted") or {}).items():
            if val and not extracted.get(key):
                extracted[key] = val

    images: list[dict[str, Any]] = []
    seen: set[str] = set()
    for layer in reversed(ordered):
        for img in layer.get("images") or []:
            key = normalize_image_url(img.get("src", "")).split("?")[0]
            if key and key not in seen:
                seen.add(key)
                images.append(img)

    description = ""
    product_text = ""
    for layer in reversed(ordered):
        if not description and layer.get("description_text"):
            description = layer["description_text"]
        if not product_text and layer.get("product_text"):
            product_text = layer["product_text"]

    best = min(layers, key=lambda layer: _source_rank(layer.get("source")))
    return {
        "source": best.get("source"),
        "handle": best.get("handle"),
        "extracted": extracted,
        "images": images[:12],
        "description_text": description,
        "product_text": product_text,
        "is_product_page": True,
    }


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


async def _enrich_shopify(crawl: CrawlResult) -> dict[str, Any] | None:
    """Universal Shopify enrichment: .js → JSON-LD → embedded → Jina (last)."""
    layers: list[dict[str, Any]] = []

    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"},
    ) as client:
        endpoint_data = await _try_shopify_endpoints(crawl.final_url, client)
        if endpoint_data:
            layers.append(endpoint_data)
        if not endpoint_data:
            js_data = await fetch_shopify_product(crawl.final_url, client=client)
            if js_data:
                layers.append(js_data)

    json_ld_data = extract_from_json_ld(crawl.json_ld)
    if json_ld_data:
        layers.append(json_ld_data)

    next_data = extract_from_next_data(crawl.html, crawl.final_url)
    if next_data:
        layers.append(next_data)

    embedded = extract_embedded_product_json(crawl.html, crawl.final_url)
    if embedded:
        if embedded.get("source") == "shopify_product_json":
            embedded["source"] = "shopify_embedded_json"
        layers.append(embedded)

    if crawl.og_product_hints:
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
            layers.append({
                "source": "open_graph",
                "extracted": extracted,
                "images": imgs,
                "description_text": "",
                "is_product_page": True,
            })

    data = _merge_shopify_layers(layers)

    # Jina supplements blocked/thin pages and fills gallery gaps on headless stores.
    thin = shopify_extraction_is_thin(
        (data or {}).get("extracted"),
        len((data or {}).get("images") or []),
    )
    if is_shopify_blocked(crawl.html) or thin:
        markdown = await fetch_jina_markdown(crawl.final_url)
        if markdown:
            jina_data = extract_shopify_from_jina(markdown, crawl.final_url)
            if jina_data:
                data = _merge_shopify_layers([data, jina_data] if data else [jina_data])

    return data


def extract_html_gallery(html: str, seed_images: list[str], handle: str | None = None) -> list[dict[str, Any]]:
    """Pull product gallery images from Shopify CDN and common image CDNs in page HTML."""
    urls = re.findall(r'https://cdn\.shopify\.com/s/files/[^"\'\s<>\\]+', html)
    urls += ["https:" + u for u in re.findall(r'//cdn\.shopify\.com/s/files/[^"\'\s<>\\]+', html)]
    urls += re.findall(r'https://[^"\'\s<>\\]*imgix\.net/s/files/[^"\'\s<>\\]+', html)

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


def _sanitize_price(price: str | None) -> str | None:
    if not price:
        return None
    cleaned = price.strip()
    if not re.search(r"[0-9]", cleaned):
        return None
    if any(ord(ch) > 127 for ch in cleaned if ch.isdigit()):
        return None
    return cleaned


async def enrich_product_data(crawl: CrawlResult) -> dict[str, Any] | None:
    """Best-effort product enrichment from all available sources."""
    data: dict[str, Any] | None = None

    if crawl.platform == "amazon":
        data = extract_amazon_product(crawl.html, crawl.final_url)
        need_jina = is_amazon_blocked(crawl.html) or amazon_extraction_is_thin(
            (data or {}).get("extracted"),
            len((data or {}).get("images") or []),
        )
        if need_jina:
            markdown = await fetch_jina_markdown(crawl.final_url)
            if markdown:
                jina_data = extract_amazon_from_jina(markdown, crawl.final_url)
                if jina_data:
                    data = _merge_platform_data(data, jina_data)
                    data["source"] = "amazon_jina"

    shopify_candidate = crawl.platform == "shopify" or is_likely_shopify_product_url(crawl.final_url)

    if shopify_candidate:
        data = await _enrich_shopify(crawl)

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

    # Supplement images from HTML gallery (critical for headless Shopify stores)
    if crawl.platform != "amazon":
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
            extracted["price"] = _sanitize_price(f"{m.group(1)} {m.group(2)}".replace("  ", " "))
    elif extracted.get("price"):
        extracted["price"] = _sanitize_price(extracted["price"])

    return data
