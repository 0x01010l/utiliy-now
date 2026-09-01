"""Keyword extraction and on-page keyword signals."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .crawler import CrawlResult

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "as", "is", "was", "are", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
    "shall", "can", "this", "that", "these", "those", "it", "its", "you", "your", "we", "our",
    "they", "their", "he", "she", "his", "her", "not", "no", "yes", "all", "any", "each",
    "more", "most", "other", "some", "such", "than", "too", "very", "just", "also", "about",
    "into", "over", "after", "before", "between", "out", "up", "down", "off", "only", "own",
    "same", "so", "if", "then", "when", "where", "how", "what", "which", "who", "whom", "why",
    "buy", "shop", "add", "cart", "free", "shipping", "sale", "price", "new", "best",
}

AMAZON_STOPWORDS = {
    "amazon", "amazoncom", "skip", "main", "content", "item", "keyboard", "shortcuts",
    "search", "orders", "account", "delivering", "update", "location", "departments",
    "loading", "videos", "reviews", "options", "compare", "similar", "shift", "alt",
    "move", "arrows", "hello", "sign", "returns", "gift", "registry", "sell", "help",
    "subscribe", "save", "today", "deals", "whole", "foods", "pharmacy", "music",
    "prime", "video", "audible", "devices", "games", "toys", "automotive", "beauty",
    "personal", "care", "books", "clothing", "shoes", "jewelry", "women", "men", "kids",
    "baby", "home", "kitchen", "improvement", "sports", "outdoors", "tools", "pet",
    "supplies", "grocery", "gourmet", "food", "industrial", "scientific", "handmade",
    "collectibles", "fine", "art", "apps", "digital", "magazine", "subscriptions",
    "movies", "tv", "musical", "instruments", "office", "products", "premium",
    "smart", "software", "luggage", "travel", "gear", "luxury", "stores", "credit",
    "payment", "cards", "marketplace", "reload", "balance", "currency", "converter",
    "list", "wish", "unavailable", "image", "color", "make", "selection", "size",
    "chart", "visit", "store", "page", "previous", "next",
    "com", "continue", "shopping", "click", "button", "below", "conditions", "use",
    "robot", "captcha", "automated", "sorry",
}

SHOPIFY_STOPWORDS = {
    "gymshark", "skip", "content", "women", "men", "accessories", "trending",
    "leggings", "products", "explore", "sign", "account", "help", "blog",
    "stores", "refer", "student", "discount", "pause", "rotation", "emails",
    "shipping", "orders", "checkout", "klarna", "afterpay", "sezzle", "loading",
    "expand", "featured", "select", "department", "search", "delivering", "update",
    "carousel", "zoom", "image", "view", "keyboard", "shortcuts",
}


def _tokenize(text: str, extra_stop: set[str] | None = None) -> list[str]:
    stop = STOPWORDS | (extra_stop or set())
    words = re.findall(r"[a-z0-9][a-z0-9'-]{1,}", text.lower())
    return [w for w in words if len(w) > 2 and w not in stop and not w.isdigit()]


def _ngrams(words: list[str], n: int) -> list[str]:
    return [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]


def analyze_keywords(crawl: CrawlResult) -> dict[str, Any]:
    if crawl.platform == "amazon":
        extra_stop = AMAZON_STOPWORDS
    elif crawl.platform == "shopify":
        extra_stop = SHOPIFY_STOPWORDS
    else:
        extra_stop = None
    body_source = (crawl.product_text or crawl.visible_text)[:8000]
    effective_title = crawl.title or ""
    if crawl.platform in {"amazon", "shopify"} and crawl.h1s:
        effective_title = crawl.h1s[0]
    title_words = _tokenize(effective_title, extra_stop)
    h1_words = _tokenize(crawl.h1s[0] if crawl.h1s else "", extra_stop)
    meta_words = _tokenize(crawl.meta_description or "", extra_stop)
    body_words = _tokenize(body_source, extra_stop)

    all_words = title_words + h1_words * 3 + meta_words * 2 + body_words
    unigrams = Counter(all_words)
    bigrams = Counter(_ngrams(body_words, 2))
    trigrams = Counter(_ngrams(body_words, 3))

    top_keywords = [
        {"term": term, "score": count, "in_title": term in title_words, "in_h1": term in h1_words, "in_meta": term in meta_words}
        for term, count in unigrams.most_common(15)
    ]

    top_phrases = [{"phrase": p, "count": c} for p, c in bigrams.most_common(8)]
    long_tail = [{"phrase": p, "count": c} for p, c in trigrams.most_common(5)]

    primary = title_words[0] if title_words else (h1_words[0] if h1_words else "")
    title_alignment: list[dict[str, Any]] = []
    for kw in top_keywords[:8]:
        term = kw["term"]
        in_title = kw["in_title"]
        in_h1 = kw["in_h1"]
        in_body = term in body_words and kw["score"] >= 2
        if crawl.platform == "amazon":
            if in_title and in_h1:
                status = "good"
            elif in_body:
                status = "body"
            else:
                status = "missing"
        elif crawl.platform == "shopify":
            if in_title and in_h1:
                status = "good"
            elif in_body:
                status = "body"
            else:
                status = "missing"
        else:
            status = "good" if in_title and in_h1 else "warn" if in_title or in_h1 else "missing"
        title_alignment.append({
            "term": term,
            "status": status,
            "in_title": in_title,
            "in_h1": in_h1,
            "in_body": in_body,
        })

    opportunities: list[str] = []
    if primary and primary not in meta_words:
        opportunities.append(f"Add primary keyword \"{primary}\" to meta description")
    for kw in top_keywords[:5]:
        if not kw["in_title"] and kw["score"] >= 3:
            opportunities.append(f"Top body term \"{kw['term']}\" is missing from title tag")
    if not h1_words:
        opportunities.append("Add H1 with primary product keyword")
    elif primary and primary not in h1_words:
        opportunities.append(f"Align H1 with title keyword \"{primary}\"")

    word_count = len(body_words)
    density = round((unigrams.most_common(1)[0][1] / max(word_count, 1)) * 100, 2) if unigrams else 0

    return {
        "primary_keyword": primary or None,
        "word_count": word_count,
        "top_density_percent": density,
        "top_keywords": top_keywords,
        "top_phrases": top_phrases,
        "long_tail": long_tail,
        "title_alignment": title_alignment,
        "opportunities": opportunities[:6],
        "summary": _keyword_summary(top_keywords, primary, opportunities),
    }


def _keyword_summary(top: list[dict], primary: str, opportunities: list[str]) -> str:
    if not top:
        return "Not enough text to extract meaningful keywords. Add descriptive product copy."
    terms = ", ".join(k["term"] for k in top[:5])
    parts = [f"Primary signals: {terms}."]
    if primary:
        parts.append(f"Likely focus keyword: \"{primary}\".")
    if opportunities:
        parts.append(f"{len(opportunities)} keyword alignment opportunities found.")
    return " ".join(parts)
