"""Enhanced JSON-LD extraction and microdata/OG fallback detection."""

from __future__ import annotations

import json
import re
from typing import Any

from bs4 import BeautifulSoup


PRODUCT_TYPES = {"Product", "ProductGroup"}


def extract_json_ld_blocks(html: str) -> list[Any]:
    """Parse all application/ld+json scripts — extruct misses some Shopify layouts."""
    soup = BeautifulSoup(html, "lxml")
    blocks: list[Any] = []

    for script in soup.find_all("script", type=lambda t: t and "ld+json" in t):
        raw = script.string or script.get_text()
        if not raw:
            continue
        raw = raw.strip()
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            # Try fixing trailing commas or multiple objects
            for chunk in re.split(r"\n\s*\n", raw):
                chunk = chunk.strip()
                if not chunk:
                    continue
                try:
                    blocks.append(json.loads(chunk))
                except json.JSONDecodeError:
                    continue
    return blocks


def merge_json_ld(extruct_blocks: list[Any], manual_blocks: list[Any]) -> list[Any]:
    seen = set()
    merged: list[Any] = []
    for block in extruct_blocks + manual_blocks:
        key = json.dumps(block, sort_keys=True, default=str)[:500]
        if key not in seen:
            seen.add(key)
            merged.append(block)
    return merged


def find_microdata_products(microdata: list[dict]) -> list[dict]:
    products = []
    for item in microdata:
        types = item.get("type", "") or item.get("@type", "")
        if isinstance(types, list):
            type_set = {str(t).split("/")[-1] for t in types}
        else:
            type_set = {str(types).split("/")[-1]}
        if type_set & PRODUCT_TYPES:
            products.append(item)
    return products


def og_as_product_hints(og: dict[str, str]) -> dict[str, str]:
  hints = {}
  mapping = {
      "og:title": "name",
      "og:description": "description",
      "og:image": "image",
      "product:price:amount": "price",
      "product:price:currency": "priceCurrency",
      "product:availability": "availability",
      "product:brand": "brand",
  }
  for og_key, field in mapping.items():
      if og.get(og_key):
          hints[field] = og[og_key]
  return hints
