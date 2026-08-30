"""Image URL helpers for crawlers and galleries."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin


def normalize_image_url(url: str, base: str = "") -> str:
    url = (url or "").strip()
    if not url or url.startswith("data:"):
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/") and base:
        return urljoin(base, url)
    return url


def _pick_srcset_url(srcset: str) -> str:
    """Return the widest image URL from a srcset attribute."""
    best_url = ""
    best_w = 0
    for part in srcset.split(","):
        part = part.strip()
        if not part:
            continue
        bits = part.split()
        url = bits[0]
        width = 0
        if len(bits) > 1 and bits[1].endswith("w"):
            try:
                width = int(bits[1][:-1])
            except ValueError:
                width = 0
        if width >= best_w:
            best_w = width
            best_url = url
    return best_url or srcset.split(",")[0].strip().split()[0]


def extract_image_src(img, base: str) -> str:
    """Best-effort product image URL from an img tag."""
    candidates: list[str] = []
    for attr in ("src", "data-src", "data-lazy-src", "data-original"):
        val = img.get(attr)
        if val and not str(val).startswith("data:"):
            candidates.append(str(val))

    srcset = img.get("srcset") or img.get("data-srcset")
    if srcset:
        candidates.append(_pick_srcset_url(srcset))

    for raw in candidates:
        url = normalize_image_url(raw, base)
        if url and not _is_junk_image(url):
            return url
    return ""


def _is_junk_image(url: str) -> bool:
    lower = url.lower()
    junk = (
        "pixel", "tracking", "spacer", "blank.", "1x1", "badge", "icon",
        "logo.svg", "payment", "trust", "sprite", "placeholder",
    )
    if any(j in lower for j in junk):
        return True
    if lower.endswith(".svg") and "product" not in lower:
        return True
    return False


def merge_image_lists(*sources: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    """Deduplicate images by normalized path, preserving order."""
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []

    def key(url: str) -> str:
        return re.sub(r"[?&]width=\d+", "", url.lower().split("?")[0])

    for source in sources:
        for img in source:
            src = img.get("src") or img.get("src_full") or ""
            src = normalize_image_url(src)
            if not src:
                continue
            k = key(src)
            if k in seen:
                continue
            seen.add(k)
            merged.append({**img, "src": src})
            if len(merged) >= limit:
                return merged
    return merged


def build_gallery(crawl_images: list[dict], shopify_images: list[dict], vision_results: list[dict], limit: int = 10) -> list[dict[str, Any]]:
    """Merge crawl, Shopify, and vision data into a unified image lab gallery."""
    vision_by_key: dict[str, dict] = {}
    for v in vision_results:
        src = normalize_image_url(v.get("src", ""))
        if src:
            vision_by_key[re.sub(r"[?&]width=\d+", "", src.lower().split("?")[0])] = v

    base_images = merge_image_lists(shopify_images, crawl_images, limit=limit)
    gallery: list[dict[str, Any]] = []

    for i, img in enumerate(base_images):
        src = normalize_image_url(img.get("src", ""))
        vkey = re.sub(r"[?&]width=\d+", "", src.lower().split("?")[0])
        vision = vision_by_key.get(vkey, {})
        alt = img.get("alt") or vision.get("alt", "")
        issues = list(vision.get("issues") or [])
        if not alt:
            issues.append("Missing alt text")
        status = "good" if not issues else "warn" if len(issues) == 1 else "bad"
        if not alt and not vision:
            status = "bad"

        gallery.append({
            "index": i + 1,
            "src": src,
            "src_display": _display_url(src),
            "alt": alt,
            "caption": vision.get("caption", ""),
            "ocr": vision.get("ocr_snippet", ""),
            "issues": issues,
            "status": status,
            "fix": issues[0] if issues else None,
            "has_vision": bool(vision),
        })
    return gallery


def _display_url(url: str) -> str:
    """Ensure Shopify/CDN URLs load well in browser img tags."""
    url = normalize_image_url(url)
    if not url:
        return ""
    if "cdn.shopify.com" in url or "/cdn/shop/" in url:
        sep = "&" if "?" in url else "?"
        if "width=" not in url:
            return f"{url}{sep}width=480"
    return url
