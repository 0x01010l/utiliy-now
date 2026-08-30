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


def _tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9][a-z0-9'-]{1,}", text.lower())
    return [w for w in words if len(w) > 2 and w not in STOPWORDS and not w.isdigit()]


def _ngrams(words: list[str], n: int) -> list[str]:
    return [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]


def analyze_keywords(crawl: CrawlResult) -> dict[str, Any]:
    title_words = _tokenize(crawl.title or "")
    h1_words = _tokenize(crawl.h1s[0] if crawl.h1s else "")
    meta_words = _tokenize(crawl.meta_description or "")
    body_words = _tokenize(crawl.visible_text[:8000])

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
        status = "good" if in_title and in_h1 else "warn" if in_title or in_h1 else "missing"
        title_alignment.append({"term": term, "status": status, "in_title": in_title, "in_h1": in_h1})

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
