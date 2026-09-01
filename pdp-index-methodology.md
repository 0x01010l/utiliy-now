---
layout: research
title: PDP Index Methodology
description: How Utiliy collects, scores, and publishes the Product Page Index — sample selection, UPRS rules, exclusions, and limitations.
permalink: /pdp-index/methodology/
eyebrow: Methodology
research_back: /pdp-index/
research_back_label: "← PDP Index"
---

{% assign idx = site.data.pdp_index %}

## Overview

The **Utiliy Product Page Index** is a recurring benchmark of live ecommerce product detail pages (PDPs). Each row is a single public URL audited with the same deterministic engine that powers [Utiliy]({{ '/' | relative_url }}), scored against the [Utiliy Product Readiness Specification (UPRS)]({{ '/spec/uprs/' | relative_url }}).

This is **primary research** — not a survey, not synthetic data, and not republished third-party statistics.

## Sample selection ({{ idx.edition }})

| Parameter | Value |
|-----------|-------|
| Edition | {{ idx.edition }} |
| URLs attempted | {{ idx.samples \| size }} |
| URLs fully scored | {{ idx.aggregate.sample_size }} |
| Blocked / failed | {{ idx.aggregate.error_count }} |
| UPRS version | {{ idx.uprs_version }} |
| AI scoring in batch | Off (`use_ai=False`) — deterministic pillars only |
| Generated | {{ idx.generated_at }} |

**Retailers included:** Amazon, Best Buy, eBay, Etsy, and Shopify direct-to-consumer (DTC) brands across electronics, apparel, home, beauty, toys, and accessories.

**Inclusion criteria:**

1. Public HTTPS product URL (no login).
2. English-language storefront (US URLs in this edition).
3. One SKU / listing per row — no collection or search URLs.

**Exclusions:**

- URLs that return HTTP errors, bot challenges, or read timeouts.
- Collection redirects (Shopify `/collections/` without product handle).
- Pages where zero product fields could be extracted.

## Scoring model

Six visibility pillars (0–100 each), weighted into an overall score:

| Pillar | Weight | What it measures |
|--------|--------|------------------|
| Google SEO | 20% | Title, meta, H1, canonical, thin content, technical |
| AI visibility | 20% | Product facts machines need to recommend the listing |
| Content | 15% | Description depth and product information completeness |
| Keywords | 15% | Title/H1/body keyword alignment |
| Images | 15% | Gallery size, alt text, vision signals |
| Schema | 15% | Product JSON-LD presence and Offer completeness |

Marketplace fairness: Amazon, Shopify, and WooCommerce listings receive **platform-aware scoring** when public JSON-LD is absent but listing data is extractable from platform-specific HTML/JSON.

## UPRS rule mapping

Every analyzer issue maps to a stable [UPRS rule ID]({{ '/spec/uprs/' | relative_url }}) (e.g. `U-SCH-001` missing Product JSON-LD, `U-SEO-050` thin content). Rule IDs are versioned so year-over-year comparisons stay valid.

## Known limitations

1. **Bot protection** — Best Buy, eBay, and Etsy often block or throttle automated fetches. Failed audits are reported explicitly; they are not scored as zero-quality pages.
2. **Listing churn** — eBay and Etsy listing IDs expire; error-page rows indicate an invalid or removed listing.
3. **No user traffic data** — Scores reflect page quality signals, not conversion or revenue.
4. **Single point in time** — Each edition is a snapshot; re-run the [batch script](https://github.com/utiliy-now/utiliy) (`api/scripts/run_pdp_index_batch.py`) to refresh.

## Reproducibility

- Raw data: [report.json]({{ '/assets/data/pdp-index/report.json' | relative_url }}) · [report.csv]({{ '/assets/data/pdp-index/report.csv' | relative_url }})
- Machine spec: [uprs.json]({{ '/assets/data/pdp-index/uprs.json' | relative_url }})
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — attribute Utiliy and link to this methodology page.

## Contact

Questions about the index or press inquiries: [{{ site.company.email }}](mailto:{{ site.company.email }})
