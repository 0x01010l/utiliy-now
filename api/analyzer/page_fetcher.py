"""Alternate fetch paths for bot-protected storefronts (Jina Reader)."""

from __future__ import annotations

import re

import httpx

JINA_READER = "https://r.jina.ai/"
TIMEOUT = 45.0

AMAZON_BLOCK_SIGNALS = (
    "continue shopping",
    "click the button below",
    "conditions of use",
    "opfcaptcha",
    "automated access",
    "not a robot",
    "sorry, something went wrong",
    "api-services-support@amazon.com",
)

SHOPIFY_BLOCK_SIGNALS = (
    "access denied",
    "please enable cookies",
    "checking your browser",
    "just a moment",
    "cf-browser-verification",
    "attention required",
    "vercel security checkpoint",
    "security checkpoint",
)

BOT_BLOCK_SIGNALS = SHOPIFY_BLOCK_SIGNALS + (
    "too many requests",
    "enable javascript",
    "perimeterx",
    "datadome",
    "captcha",
)


def is_bot_blocked_page(html: str, title: str | None = None, status_code: int = 200) -> bool:
    blob = f"{title or ''} {html or ''}".lower()
    if status_code in (403, 429, 503):
        return True
    return any(sig in blob for sig in BOT_BLOCK_SIGNALS)


def is_amazon_blocked(html: str) -> bool:
    lower = (html or "").lower()
    if any(sig in lower for sig in AMAZON_BLOCK_SIGNALS):
        return True
    if 'id="producttitle"' not in lower and '"currentasin"' not in lower and "producttitle" not in lower:
        return True
    if 'id="productTitle"' not in html and '"currentAsin"' not in html:
        return True
    return False


def is_shopify_blocked(html: str) -> bool:
    if is_bot_blocked_page(html):
        return True
    lower = (html or "").lower()
    if any(sig in lower for sig in SHOPIFY_BLOCK_SIGNALS):
        return True
    if 'id="__next_data__"' not in lower and "application/ld+json" not in lower:
        if "/products/" in lower and len(html) < 50000:
            return True
    return False


def shopify_extraction_is_thin(extracted: dict | None, image_count: int = 0) -> bool:
    extracted = extracted or {}
    core = sum(1 for key in ("name", "price", "sku") if extracted.get(key))
    return core < 2 or image_count == 0


def amazon_extraction_is_thin(extracted: dict | None, image_count: int = 0) -> bool:
    extracted = extracted or {}
    core = sum(1 for key in ("name", "brand", "sku", "price") if extracted.get(key))
    return core < 2 or (image_count == 0 and not extracted.get("name"))


async def fetch_jina_markdown(url: str) -> str | None:
    """Fetch readable page content via Jina Reader (used by Agent Reach for web)."""
    target = f"{JINA_READER}{url}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                target,
                headers={
                    "Accept": "text/plain",
                    "User-Agent": "UtiliyBot/1.0 (+https://utiliy.com)",
                },
            )
            if resp.status_code != 200:
                return None
            text = resp.text
            if len(text) < 500:
                return None
            if is_bot_blocked_page(text):
                return None
            return text
    except Exception:
        return None


def jina_title(markdown: str) -> str | None:
    m = re.search(r"^Title:\s*(.+)$", markdown, re.M)
    return m.group(1).strip() if m else None
