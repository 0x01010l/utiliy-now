"""Extract product data from Amazon listing pages."""

from __future__ import annotations

import html as html_lib
import re
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

AMAZON_PRODUCT_IMAGE = re.compile(
    r"https://m\.media-amazon\.com/images/I/[A-Za-z0-9+._%-]+\.(?:jpg|jpeg|png|webp)",
    re.I,
)
AMAZON_JUNK_IMAGE = re.compile(
    r"(_AC_US\d+_|_RC\||\.css|\.js\?|/icons/|amazon-logo|sprites|/G/01/|aui-|AUIClients)",
    re.I,
)


def asin_from_url(url: str) -> str | None:
    path = urlparse(url).path
    for pat in (
        r"/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})",
        r"/ASIN/([A-Z0-9]{10})",
    ):
        m = re.search(pat, path, re.I)
        if m:
            return m.group(1).upper()
    return None


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _normalize_html(html: str) -> str:
    """Decode escaped JSON/strings Amazon embeds in script tags."""
    decoded = html_lib.unescape(html)
    return decoded.replace("\\\"", '"').replace("\\'", "'")


def _brand_from_html(html: str, soup: BeautifulSoup) -> str | None:
    byline = soup.select_one("#bylineInfo")
    if byline:
        text = _clean_text(byline.get_text(" ", strip=True))
        m = re.match(r"Visit the (.+?) Store", text, re.I)
        if m:
            return m.group(1).strip()
        m = re.match(r"Brand:\s*(.+)", text, re.I)
        if m:
            return m.group(1).strip()
        if text and "store" not in text.lower():
            return text
    m = re.search(r'"brand"\s*:\s*"([^"]+)"', html)
    return m.group(1) if m else None


def _title_from_soup(soup: BeautifulSoup) -> str | None:
    el = soup.select_one("#productTitle")
    if el:
        return _clean_text(el.get_text(" ", strip=True))
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return _clean_text(og["content"])
    return None


def _feature_bullets(soup: BeautifulSoup, html: str) -> str:
    bullets = soup.select_one("#feature-bullets")
    if bullets:
        return _clean_text(bullets.get_text(" ", strip=True))
    for ul in soup.select("ul.a-unordered-list.a-vertical"):
        text = _clean_text(ul.get_text(" ", strip=True))
        if len(text) > 80 and any(k in text.lower() for k in ("size", "comfort", "material", "sole", "fit")):
            return text
    m = re.search(r"About this item\s*</[^>]+>\s*<[^>]+>(.*?)</div>", html, re.S | re.I)
    if m:
        return _clean_text(re.sub(r"<[^>]+>", " ", m.group(1)))
    return ""


def _description(soup: BeautifulSoup) -> str:
    el = soup.select_one("#productDescription, #aplus_feature_div")
    if el:
        return _clean_text(el.get_text(" ", strip=True))[:2000]
    return ""


def _parse_detail_map(soup: BeautifulSoup) -> dict[str, str]:
    """Parse Amazon product detail tables and bullet lists into a flat map."""
    details: dict[str, str] = {}

    for row in soup.select(
        "table.prodDetTable tr, #productDetails_techSpec_section_1 tr, "
        "#productDetails_detailBullets_sections1 tr, .pdTab tr"
    ):
        cells = [_clean_text(c.get_text(" ", strip=True)) for c in row.find_all(["th", "td"])]
        if len(cells) >= 2 and cells[0] and cells[1]:
            details[cells[0].rstrip(":")] = cells[1]

    for li in soup.select("#detailBullets_feature_div li"):
        text = _clean_text(li.get_text(" ", strip=True))
        if ":" in text:
            label, value = text.split(":", 1)
            details[label.strip()] = value.strip()
        elif text:
            details[text] = text

    # Compact spec chips (newer Amazon layout)
    for block in soup.select("[data-feature-name='productOverview'] tr, .po-brand td, .po-material_type td"):
        cells = [_clean_text(c.get_text(" ", strip=True)) for c in block.find_all(["th", "td", "span"])]
        cells = [c for c in cells if c]
        if len(cells) >= 2:
            details[cells[0].rstrip(":")] = cells[-1]

    return details


def _detail_value(details: dict[str, str], *labels: str) -> str | None:
    lower_map = {k.lower(): v for k, v in details.items()}
    for label in labels:
        val = lower_map.get(label.lower())
        if val:
            return val
    for key, val in details.items():
        for label in labels:
            if label.lower() in key.lower() and val:
                return val
    return None


def _material_from_context(details: dict[str, str], bullets: str, description: str) -> str | None:
    for label in ("Outer Material", "Material", "Fabric Type", "Sole Material", "Inner material"):
        val = _detail_value(details, label)
        if val:
            return val
    combined = f"{bullets} {description}".lower()
    for word in ("croslite", "leather", "rubber", "cotton", "polyester", "nylon", "foam", "synthetic"):
        if word in combined:
            m = re.search(rf"[^.]*{word}[^.]*", combined, re.I)
            if m:
                return m.group(0).strip().capitalize()
    return None


def _weight_from_details(details: dict[str, str]) -> str | None:
    return _detail_value(details, "Item Weight", "Weight", "Product Weight")


def _dimensions_from_details(details: dict[str, str]) -> str | None:
    return _detail_value(details, "Product Dimensions", "Package Dimensions", "Dimensions")


def _category_from_details(details: dict[str, str]) -> str | None:
    rank = _detail_value(details, "Best Sellers Rank")
    if rank:
        m = re.search(r"#\d+ in ([^(]+)", rank)
        if m:
            return _clean_text(m.group(1))
    return _detail_value(details, "Department")


def _availability(html: str, soup: BeautifulSoup, asin: str | None) -> str:
    for sel in ("#availability", "#outOfStock", "#availabilityInsideBuyBox_feature_div"):
        el = soup.select_one(sel)
        if el:
            text = _clean_text(el.get_text(" ", strip=True))
            if text:
                return text

    normalized = _normalize_html(html)
    for pat in (
        r"(Currently unavailable\.?)",
        r"(In Stock\.?)",
        r"(Only \d+ left in stock[^.<]*)",
        r"(Temporarily out of stock\.?)",
        r"(Available to ship in[^.<]*)",
    ):
        m = re.search(pat, normalized, re.I)
        if m:
            return _clean_text(m.group(1))

    if asin and re.search(rf'data-asin="{asin}"[^>]*unqualifiedBuyBox', html):
        return "Not available in your region"

    if re.search(r"Add to Cart|Buy Now", html, re.I):
        return "In stock"

    return "Unknown"


def _price_for_asin(html: str, asin: str | None) -> str | None:
    if not asin:
        return None

    sources = [html, _normalize_html(html)]

    for body in sources:
        patterns = [
            rf'"currentAsin"\s*:\s*"{asin}"[\s\S]{{0,1500}}?"priceAmount"\s*:\s*([\d.]+)',
            rf'"asin"\s*:\s*"{asin}"[\s\S]{{0,600}}?"priceAmount"\s*:\s*([\d.]+)',
            rf'"asin"\s*:\s*"{asin}"[\s\S]{{0,600}}?"price"\s*:\s*"\$?([\d,.]+)"',
            rf'"displayPrice"\s*:\s*"\$?([\d,.]+)"[\s\S]{{0,400}}?"asin"\s*:\s*"{asin}"',
            rf'data-asin="{asin}"[\s\S]{{0,3000}}?class="a-price-whole"[^>]*>([\d,]+)<',
            rf'desktop_buybox_group[\s\S]{{0,800}}?"displayPrice"\s*:\s*"\$?([\d,.]+)"',
            rf'"priceToPay"[\s\S]{{0,400}}?"amount"\s*:\s*([\d.]+)',
        ]
        for pat in patterns:
            m = re.search(pat, body, re.I)
            if m:
                amount = m.group(1).replace(",", "")
                try:
                    value = float(amount)
                except ValueError:
                    continue
                if 1 <= value < 100000:
                    return f"${value:,.2f}"

        buybox = re.search(r'id="qualifiedBuyBox"[\s\S]{0,8000}', body)
        if buybox:
            chunk = buybox.group(0)
            whole = re.search(r'class="a-price-whole"[^>]*>([\d,]+)', chunk)
            frac = re.search(r'class="a-price-fraction"[^>]*>(\d+)', chunk)
            if whole:
                amount = whole.group(1).replace(",", "")
                if frac:
                    amount = f"{amount}.{frac.group(1)}"
                try:
                    value = float(amount)
                    if 1 <= value < 100000:
                        return f"${value:,.2f}"
                except ValueError:
                    pass

        # a-offscreen in buybox area only (avoid carousel MAD prices)
        buybox_chunk = re.search(r'id="buybox"[\s\S]{0,12000}', body, re.I)
        if buybox_chunk:
            prices = re.findall(r'class="a-offscreen"[^>]*>\s*\$([\d,.]+)', buybox_chunk.group(0))
            for p in prices:
                try:
                    value = float(p.replace(",", ""))
                    if 1 <= value < 100000:
                        return f"${value:,.2f}"
                except ValueError:
                    continue

    return None


def _list_price(html: str) -> str | None:
    body = _normalize_html(html)
    for pat in (
        r'List Price:\s*</[^>]+>.*?\$([\d,.]+)',
        r'"listPrice"\s*:\s*"\$?([\d,.]+)"',
        r'class="basisPrice"[^>]*>.*?\$([\d,.]+)',
        r'a-text-price[^>]*data-a-strike="true"[^>]*>.*?\$([\d,.]+)',
    ):
        m = re.search(pat, body, re.I | re.S)
        if m:
            try:
                value = float(m.group(1).replace(",", ""))
                if 5 <= value < 100000:
                    return f"${value:,.2f}"
            except ValueError:
                continue
    return None


def _shipping_returns(html: str) -> tuple[str | None, str | None]:
    body = _normalize_html(html).lower()
    shipping = None
    returns = None
    if re.search(r"free delivery|free shipping|ships from amazon|prime delivery", body):
        shipping = "Free delivery available"
    if re.search(r"free return|free \d+-day refund|free \d+-day return", body):
        returns = "Free returns available"
    return shipping, returns


def _normalize_amazon_image(url: str) -> str:
    url = url.strip()
    if not url or AMAZON_JUNK_IMAGE.search(url):
        return ""
    if not AMAZON_PRODUCT_IMAGE.match(url):
        return ""
    url = re.sub(r"_AC_[A-Z0-9]+_\.(jpg|jpeg|png|webp)$", r"_AC_SL800_.\1", url, flags=re.I)
    return url


def _images_from_html(html: str, title: str) -> list[dict[str, Any]]:
    candidates: list[str] = []
    normalized = _normalize_html(html)

    for body in (html, normalized):
        for key in ("hiRes", "large", "mainUrl"):
            for m in re.finditer(rf'"{key}"\s*:\s*"(https://[^"]+)"', body):
                candidates.append(m.group(1))

        for m in re.finditer(r'data-old-hires="(https://[^"]+)"', body):
            candidates.append(m.group(1))

        for m in re.finditer(r'id="landingImage"[^>]+(?:data-old-hires|src)="(https://[^"]+)"', body):
            candidates.append(m.group(1))

    for m in AMAZON_PRODUCT_IMAGE.findall(html):
        candidates.append(m)

    gallery: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in candidates:
        src = _normalize_amazon_image(raw)
        if not src:
            continue
        key = re.sub(r"_AC_[A-Z0-9]+_", "_", src.lower())
        if key in seen:
            continue
        seen.add(key)
        gallery.append({"src": src, "src_full": src, "alt": title or ""})
        if len(gallery) >= 12:
            break
    return gallery


def extract_amazon_product_text(html: str) -> str:
    """Product-focused text for SEO/keyword analysis (excludes Amazon chrome)."""
    soup = BeautifulSoup(html, "lxml")
    parts: list[str] = []
    title = _title_from_soup(soup)
    if title:
        parts.append(title)
    brand = _brand_from_html(html, soup)
    if brand:
        parts.append(f"Brand: {brand}")
    bullets = _feature_bullets(soup, html)
    if bullets:
        parts.append(bullets)
    desc = _description(soup)
    if desc:
        parts.append(desc)
    details = _parse_detail_map(soup)
    if details:
        parts.append(" ".join(f"{k}: {v}" for k, v in list(details.items())[:20]))
    return _clean_text(" ".join(parts))[:8000]


def _images_from_jina_markdown(markdown: str, title: str) -> list[dict[str, Any]]:
    gallery: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url in re.findall(r"!\[[^\]]*\]\((https://m\.media-amazon\.com/images/I/[^)]+)\)", markdown):
        src = _normalize_amazon_image(url)
        if not src:
            continue
        key = re.sub(r"_AC_[A-Z0-9]+_", "_", src.lower())
        if key in seen:
            continue
        seen.add(key)
        gallery.append({"src": src, "src_full": src, "alt": title or ""})
        if len(gallery) >= 12:
            break
    return gallery


def extract_amazon_from_jina(markdown: str, page_url: str) -> dict[str, Any] | None:
    """Parse Amazon listing data from Jina Reader markdown (Azure/bot fallback)."""
    if not markdown or len(markdown) < 400:
        return None

    asin = asin_from_url(page_url)
    body = _normalize_html(markdown)

    title = None
    for pat in (
        r"^#\s+(Crocs[^\n]+)$",
        r"^#\s+([A-Z][^\n]{12,120})$",
    ):
        m = re.search(pat, markdown, re.M | re.I)
        if m and "product summary" not in m.group(1).lower():
            title = _clean_text(m.group(1))
            break
    if not title:
        m = re.search(r"!\[[^\]]*:\s*([^\]]+)\]\(https://m\.media-amazon\.com/images/I/", markdown)
        if m:
            title = _clean_text(m.group(1))
    if not title:
        m = re.search(r"^Title:\s*(.+)$", markdown, re.M)
        if m:
            title = _clean_text(m.group(1).split("|")[-1].strip())

    brand = None
    m = re.search(r"\[Visit the (.+?) Store\]", markdown)
    if m:
        brand = m.group(1).strip()

    price = _price_for_asin(body, asin)
    if not price:
        m = re.search(r'"priceAmount"\s*:\s*([\d.]+)', body)
        if m:
            price = f"${float(m.group(1)):,.2f}"
    if not price:
        m = re.search(r"\$\s*([\d,]+\.\d{2})\s+with\s+\d+\s+percent", body, re.I)
        if m:
            price = f"${m.group(1).replace(',', '')}"

    list_price = _list_price(body)
    availability = "Unknown"
    if re.search(r"\bIn Stock\b", markdown, re.I):
        availability = "In stock"
    elif re.search(r"Currently unavailable", markdown, re.I):
        availability = "Currently unavailable"
    elif re.search(r"Out of Stock", markdown, re.I):
        availability = "Out of stock"

    rating = None
    m = re.search(r"(\d\.\d)\s+out of 5 stars", markdown, re.I)
    if m:
        rating = f"{m.group(1)} / 5"

    material = None
    for pat in (r"Outer Material\s*\n+\s*(.+)", r"Foam \(Croslite\)", r"Sole Material\s*\n+\s*(.+)"):
        m = re.search(pat, markdown, re.I)
        if m:
            material = _clean_text(m.group(1) if m.lastindex else m.group(0))
            break

    bullets = ""
    m = re.search(r"### About this item\s+([\s\S]{0,2500}?)(?:\n#|\n\*\*\*|$)", markdown, re.I)
    if m:
        bullets = _clean_text(re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", m.group(1)))

    images = _images_from_jina_markdown(markdown, title or "")
    if not title and not images:
        return None

    shipping, returns = _shipping_returns(body)

    extracted: dict[str, Any] = {
        "name": title,
        "brand": brand,
        "price": price,
        "compare_at_price": list_price if list_price and list_price != price else None,
        "sku": asin,
        "asin": asin,
        "availability": availability,
        "material": material,
        "shipping": shipping,
        "returns": returns,
        "rating": rating,
    }
    if bullets:
        extracted["features"] = bullets[:500]

    product_text = _clean_text(" ".join(v for v in [title, f"Brand: {brand}" if brand else "", bullets] if v))

    return {
        "source": "amazon_jina",
        "asin": asin,
        "requested_asin": asin,
        "extracted": {k: v for k, v in extracted.items() if v},
        "images": images,
        "description_text": bullets[:2000],
        "product_text": product_text[:8000],
        "is_product_page": True,
    }


def extract_amazon_product(html: str, page_url: str) -> dict[str, Any] | None:
    soup = BeautifulSoup(html, "lxml")
    requested_asin = asin_from_url(page_url)
    page_asin = None
    m = re.search(r'"currentAsin"\s*:\s*"([A-Z0-9]{10})"', html)
    if m:
        page_asin = m.group(1).upper()
    if not page_asin:
        page_asin = requested_asin

    title = _title_from_soup(soup)
    if not title:
        return None

    details = _parse_detail_map(soup)
    brand = _brand_from_html(html, soup) or _detail_value(details, "Brand", "Brand Name", "Manufacturer")
    asin = page_asin or requested_asin
    price = _price_for_asin(html, asin)
    list_price = _list_price(html)
    availability = _availability(html, soup, asin)
    bullets = _feature_bullets(soup, html)
    description = _description(soup)
    images = _images_from_html(html, title)
    material = _material_from_context(details, bullets, description)
    weight = _weight_from_details(details)
    dimensions = _dimensions_from_details(details)
    category = _category_from_details(details)
    shipping, returns = _shipping_returns(html)
    model = _detail_value(details, "Item model number", "Model Name", "Style Number", "Manufacturer Part Number")

    extracted: dict[str, Any] = {
        "name": title,
        "brand": brand,
        "price": price,
        "compare_at_price": list_price if list_price and list_price != price else None,
        "sku": asin,
        "asin": asin,
        "availability": availability,
        "material": material,
        "weight": weight,
        "dimensions": dimensions,
        "category": category,
        "shipping": shipping,
        "returns": returns,
    }
    if model and model != asin:
        extracted["model"] = model
    if bullets:
        extracted["features"] = bullets[:500]

    return {
        "source": "amazon_html",
        "asin": asin,
        "requested_asin": requested_asin,
        "extracted": {k: v for k, v in extracted.items() if v},
        "images": images,
        "description_text": (bullets + " " + description).strip()[:2000],
        "product_text": extract_amazon_product_text(html),
        "is_product_page": True,
    }
