"""Page structure, code snippets, and technical markup analysis."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

from .crawler import CrawlResult


def analyze_page_code(crawl: CrawlResult) -> dict[str, Any]:
    soup = crawl.soup
    base_host = urlparse(crawl.final_url).netloc.lower()

    headings: list[dict[str, Any]] = []
    for tag in soup.find_all(re.compile(r"^h[1-6]$", re.I)):
        level = int(tag.name[1])
        text = tag.get_text(" ", strip=True)
        if text:
            headings.append({"level": level, "text": text[:120], "length": len(text)})

    meta_tags: list[dict[str, str]] = []
    for meta in soup.find_all("meta"):
        name = meta.get("name") or meta.get("property") or meta.get("http-equiv") or ""
        content = (meta.get("content") or "")[:200]
        if name and content:
            meta_tags.append({"name": name, "content": content})

    links_internal = 0
    links_external = 0
    links_nofollow = 0
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#") or href.startswith("javascript:"):
            continue
        host = urlparse(href if "://" in href else f"https://{base_host}{href}").netloc.lower()
        if host and host != base_host:
            links_external += 1
        else:
            links_internal += 1
        rel = " ".join(a.get("rel", [])).lower()
        if "nofollow" in rel:
            links_nofollow += 1

    robots = next((m["content"] for m in meta_tags if m["name"].lower() == "robots"), None)
    viewport = next((m["content"] for m in meta_tags if m["name"].lower() == "viewport"), None)
    lang = soup.html.get("lang") if soup.html else None

    json_ld_snippets: list[str] = []
    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text()
        if raw:
            try:
                parsed = json.loads(raw)
                json_ld_snippets.append(json.dumps(parsed, indent=2)[:1200])
            except json.JSONDecodeError:
                json_ld_snippets.append(raw.strip()[:800])

    head_lines: list[str] = []
    if crawl.title:
        head_lines.append(f"<title>{crawl.title}</title>")
    if crawl.meta_description:
        head_lines.append(f'<meta name="description" content="{crawl.meta_description}">')
    if crawl.canonical:
        head_lines.append(f'<link rel="canonical" href="{crawl.canonical}">')
    for m in meta_tags[:12]:
        if m["name"].lower() not in ("description",):
            head_lines.append(f'<meta name="{m["name"]}" content="{m["content"][:80]}...">')

    issues: list[dict[str, str]] = []
    if not viewport:
        issues.append({"severity": "high", "code": "no_viewport", "message": "Missing viewport meta — mobile rendering may break."})
    if not lang:
        issues.append({"severity": "medium", "code": "no_lang", "message": "HTML lang attribute missing."})
    if robots and "noindex" in robots.lower():
        issues.append({"severity": "critical", "code": "noindex", "message": "Page has noindex — it won't rank in search."})
    levels = [h["level"] for h in headings]
    for i in range(1, len(levels)):
        if levels[i] - levels[i - 1] > 1:
            issues.append({"severity": "low", "code": "heading_skip", "message": "Heading hierarchy skips levels (e.g. H2 → H4)."})
            break

    return {
        "headings": headings,
        "heading_outline": _outline(headings),
        "meta_tags": meta_tags[:20],
        "links": {"internal": links_internal, "external": links_external, "nofollow": links_nofollow},
        "robots": robots,
        "viewport": viewport,
        "lang": lang,
        "script_count": len(soup.find_all("script")),
        "json_ld_snippets": json_ld_snippets[:3],
        "head_preview": "\n".join(head_lines),
        "issues": issues,
        "html_size_kb": round(len(crawl.html) / 1024, 1),
    }


def _outline(headings: list[dict]) -> str:
    if not headings:
        return "No headings found"
    lines = []
    for h in headings[:12]:
        indent = "  " * (h["level"] - 1)
        lines.append(f"{indent}H{h['level']}: {h['text']}")
    return "\n".join(lines)
