"""Fetch and parse product pages with timeouts and size limits."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

import extruct
import httpx
from bs4 import BeautifulSoup
from w3lib.html import get_base_url

from .security import validate_public_url

USER_AGENT = "UtiliyBot/1.0 (+https://utiliy.com; product-page-auditor)"
MAX_BYTES = 2_500_000
TIMEOUT = 20.0


@dataclass
class CrawlResult:
    url: str
    final_url: str
    status_code: int
    html: str
    soup: BeautifulSoup
    headers: dict[str, str]
    canonical: str | None
    title: str | None
    meta_description: str | None
    h1s: list[str]
    images: list[dict[str, Any]]
    json_ld: list[dict[str, Any]]
    microdata: list[dict[str, Any]]
    open_graph: dict[str, str]
    visible_text: str
    platform: str
    errors: list[str] = field(default_factory=list)


def detect_platform(url: str, html: str) -> str:
    lower = html.lower()
    host = urlparse(url).netloc.lower()
    if "myshopify.com" in host or "cdn.shopify.com" in lower or "shopify" in lower:
        return "shopify"
    if "woocommerce" in lower or "wp-content" in lower:
        return "woocommerce"
    if "etsy.com" in host:
        return "etsy"
    if "amazon." in host:
        return "amazon"
    if "bigcommerce" in lower:
        return "bigcommerce"
    return "generic"


async def fetch_page(url: str) -> CrawlResult:
    normalized, sec_errors = validate_public_url(url)
    if sec_errors:
        raise ValueError("; ".join(sec_errors))

    errors: list[str] = []
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=TIMEOUT,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    ) as client:
        response = await client.get(normalized)
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            errors.append(f"Unexpected content type: {content_type or 'unknown'}")

        raw = response.content[:MAX_BYTES]
        html = raw.decode(response.encoding or "utf-8", errors="replace")

    soup = BeautifulSoup(html, "lxml")
    base = get_base_url(html, normalized)

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else None

    meta_desc_tag = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    meta_description = meta_desc_tag.get("content", "").strip() if meta_desc_tag else None

    canonical_tag = soup.find("link", rel=lambda v: v and "canonical" in v)
    canonical = canonical_tag.get("href") if canonical_tag else None
    if canonical:
        canonical = urljoin(base, canonical)

    h1s = [h.get_text(" ", strip=True) for h in soup.find_all("h1") if h.get_text(strip=True)]

    images: list[dict[str, Any]] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if not src:
            continue
        images.append(
            {
                "src": urljoin(base, src),
                "alt": (img.get("alt") or "").strip(),
                "width": img.get("width"),
                "height": img.get("height"),
            }
        )

    structured = extruct.extract(html, base_url=base, syntaxes=["json-ld", "microdata", "opengraph"])
    json_ld = structured.get("json-ld", []) or []
    microdata = structured.get("microdata", []) or []
    og_list = structured.get("opengraph", []) or []
    open_graph = {item.get("property", ""): item.get("content", "") for item in og_list if item.get("property")}

    for script in soup(["script", "style", "noscript"]):
        script.decompose()
    visible_text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:12000]

    return CrawlResult(
        url=normalized,
        final_url=str(response.url),
        status_code=response.status_code,
        html=html,
        soup=soup,
        headers=dict(response.headers),
        canonical=canonical,
        title=title,
        meta_description=meta_description,
        h1s=h1s,
        images=images,
        json_ld=json_ld,
        microdata=microdata,
        open_graph=open_graph,
        visible_text=visible_text,
        platform=detect_platform(str(response.url), html),
        errors=errors,
    )
