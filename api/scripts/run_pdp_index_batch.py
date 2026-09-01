#!/usr/bin/env python3
"""Batch audit public PDPs for the Utiliy PDP Index. Run from repo root:

  cd api && python scripts/run_pdp_index_batch.py

Outputs:
  - ../_data/pdp_index.json (Jekyll site.data)
  - ../assets/data/pdp-index/report.json
  - ../assets/data/pdp-index/report.csv
"""

from __future__ import annotations

import asyncio
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyzer.engine import run_audit  # noqa: E402
from analyzer.uprs_rules import export_spec, uprs_id_for_code, UPRS_VERSION  # noqa: E402
from scripts.pdp_index_urls import SAMPLE_URLS  # noqa: E402


def _platform_from_url(url: str, crawl_platform: str | None) -> str:
    if crawl_platform and crawl_platform not in ("unknown", "generic"):
        return crawl_platform
    host = urlparse(url).netloc.lower()
    if "amazon." in host:
        return "amazon"
    if "ebay." in host:
        return "ebay"
    if "etsy." in host:
        return "etsy"
    if "bestbuy." in host:
        return "bestbuy"
    if "shopify" in host or crawl_platform == "shopify":
        return "shopify"
    return crawl_platform or "generic"


def _summarize_row(item: dict, result: dict | None, error: str | None) -> dict:
    base = {
        "url": item["url"],
        "retailer": item["retailer"],
        "category": item["category"],
        "status": "error",
        "error": error or "audit_failed",
    }
    if not result or result.get("scores", {}).get("overall") is None:
        return base

    pillars = result.get("scores", {}).get("pillars") or result.get("visibility", {}).get("pillars", {})
    if not pillars:
        pillars = {
            "google_seo": result.get("scores", {}).get("categories", {}).get("seo", 0),
            "ai_visibility": result.get("scores", {}).get("categories", {}).get("ai_readiness", 0),
            "content": result.get("scores", {}).get("categories", {}).get("content_quality", 0),
            "keywords": result.get("scores", {}).get("categories", {}).get("keywords", 0),
            "images": result.get("scores", {}).get("categories", {}).get("images", 0),
            "schema": result.get("scores", {}).get("categories", {}).get("structured_data", 0),
        }

    issues = []
    buckets = result.get("issues", {})
    for key in ("critical", "high_priority", "quick_wins"):
        issues.extend(buckets.get(key, []))
    uprs_hits: list[str] = []
    for issue in issues:
        code = issue.get("code", "")
        rid = uprs_id_for_code(code)
        if rid and rid not in uprs_hits:
            uprs_hits.append(rid)

    platform = _platform_from_url(item["url"], result.get("platform"))

    has_jsonld = result.get("structured_data", {}).get("has_product_schema", False)
    if not has_jsonld:
        has_jsonld = not any(i.get("code") == "missing_product_schema" for i in issues)

    return {
        **base,
        "status": "ok",
        "platform": platform,
        "title": result.get("meta", {}).get("title") or result.get("seo", {}).get("title_meta", {}).get("title", ""),
        "overall": result.get("scores", {}).get("overall", result.get("overall_score", 0)),
        "google_seo": pillars.get("google_seo", 0),
        "ai_visibility": pillars.get("ai_visibility", 0),
        "content": pillars.get("content", 0),
        "keywords": pillars.get("keywords", 0),
        "images": pillars.get("images", 0),
        "schema": pillars.get("schema", 0),
        "has_product_jsonld": has_jsonld,
        "issue_count": len(issues),
        "uprs_rules_triggered": uprs_hits,
        "top_issues": [i.get("code") for i in issues[:5]],
    }


async def _audit_one(item: dict) -> dict:
    try:
        result = await run_audit(item["url"], use_ai=False)
        return _summarize_row(item, result, None)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).strip() or type(exc).__name__
        return _summarize_row(item, None, msg[:200])


def _aggregate(rows: list[dict]) -> dict:
    ok = [r for r in rows if r.get("status") == "ok"]
    if not ok:
        return {"sample_size": 0}

    def avg(key: str) -> float:
        vals = [r[key] for r in ok if isinstance(r.get(key), (int, float))]
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    by_retailer: dict[str, list[dict]] = {}
    for r in ok:
        by_retailer.setdefault(r["retailer"], []).append(r)

    retailer_avgs = {}
    for name, group in by_retailer.items():
        retailer_avgs[name] = {
            "count": len(group),
            "overall": avg_key(group, "overall"),
            "ai_visibility": avg_key(group, "ai_visibility"),
            "schema": avg_key(group, "schema"),
            "google_seo": avg_key(group, "google_seo"),
            "jsonld_rate": round(100 * sum(1 for g in group if g.get("has_product_jsonld")) / len(group), 1),
        }

    jsonld_rate = round(100 * sum(1 for r in ok if r.get("has_product_jsonld")) / len(ok), 1)

    # Top UPRS rule frequency
    rule_freq: dict[str, int] = {}
    for r in ok:
        for rid in r.get("uprs_rules_triggered", []):
            rule_freq[rid] = rule_freq.get(rid, 0) + 1
    top_rules = sorted(rule_freq.items(), key=lambda x: -x[1])[:10]

    return {
        "sample_size": len(ok),
        "error_count": len(rows) - len(ok),
        "overall_avg": avg("overall"),
        "google_seo_avg": avg("google_seo"),
        "ai_visibility_avg": avg("ai_visibility"),
        "content_avg": avg("content"),
        "keywords_avg": avg("keywords"),
        "images_avg": avg("images"),
        "schema_avg": avg("schema"),
        "product_jsonld_rate_pct": jsonld_rate,
        "by_retailer": retailer_avgs,
        "top_uprs_rules": [{"id": k, "count": v} for k, v in top_rules],
    }


def avg_key(group: list[dict], key: str) -> float:
    vals = [g[key] for g in group if isinstance(g.get(key), (int, float))]
    return round(sum(vals) / len(vals), 1) if vals else 0.0


async def main() -> None:
    print(f"UPRS {UPRS_VERSION} — auditing {len(SAMPLE_URLS)} public PDPs (use_ai=False)...")
    rows: list[dict] = []
    for i, item in enumerate(SAMPLE_URLS, 1):
        print(f"  [{i}/{len(SAMPLE_URLS)}] {item['retailer']}: {item['url'][:70]}...")
        row = await _audit_one(item)
        rows.append(row)
        await asyncio.sleep(0.5)

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report = {
        "title": "Utiliy Product Page Index",
        "edition": "Q1 2026",
        "generated_at": generated,
        "methodology_url": "https://utiliy.com/pdp-index/methodology/",
        "spec_url": "https://utiliy.com/spec/uprs/",
        "uprs_version": UPRS_VERSION,
        "aggregate": _aggregate(rows),
        "samples": rows,
    }

    data_dir = ROOT / "_data"
    assets_dir = ROOT / "assets" / "data" / "pdp-index"
    data_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    jekyll_path = data_dir / "pdp_index.json"
    json_path = assets_dir / "report.json"
    csv_path = assets_dir / "report.csv"

    jekyll_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    (assets_dir / "uprs.json").write_text(json.dumps(export_spec(), indent=2), encoding="utf-8")

    fieldnames = [
        "retailer", "category", "platform", "url", "title", "overall",
        "google_seo", "ai_visibility", "content", "keywords", "images", "schema",
        "has_product_jsonld", "issue_count", "status",
    ]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)

    agg = report["aggregate"]
    print(f"\nDone. {agg.get('sample_size', 0)} ok, {agg.get('error_count', 0)} errors.")
    print(f"  Overall avg: {agg.get('overall_avg')} | AI visibility avg: {agg.get('ai_visibility_avg')} | JSON-LD rate: {agg.get('product_jsonld_rate_pct')}%")
    print(f"  Wrote {jekyll_path}, {json_path}, {csv_path}")


if __name__ == "__main__":
    asyncio.run(main())
