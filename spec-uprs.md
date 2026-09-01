---
layout: research
title: Utiliy Product Readiness Specification (UPRS)
description: Open rule IDs and pillar definitions for auditing ecommerce product detail pages — the standard behind the Utiliy PDP Index and AI lab.
permalink: /spec/uprs/
eyebrow: Open specification
research_back: /pdp-index/
research_back_label: "← PDP Index"
---

**UPRS** is Utiliy’s open, versioned rule set for scoring live product detail pages across six visibility pillars. It is the measurement standard behind the [PDP Index]({{ '/pdp-index/' | relative_url }}) and every Utiliy audit.

- **Version:** {{ site.data.pdp_index.uprs_version | default: "1.0.0" }}
- **Machine-readable:** [uprs.json]({{ '/assets/data/pdp-index/uprs.json' | relative_url }})
- **Reference implementation:** [Utiliy AI lab]({{ '/#audit' | relative_url }})

## Pillars

| ID | Pillar | Description |
|----|--------|-------------|
| `google_seo` | Google SEO | Title, meta, headings, canonical, indexability, thin content |
| `ai_visibility` | AI visibility | Facts shopping agents need — brand, SKU, price, availability, specs |
| `content` | Content | Product copy depth and decision evidence |
| `keywords` | Keywords | Title/H1/body alignment |
| `images` | Images | Gallery coverage and alt text |
| `schema` | Schema | Product JSON-LD and Offer completeness |

## Rule registry (v{{ site.data.pdp_index.uprs_version | default: "1.0.0" }})

<div class="pdp-table-wrap">
<table class="pdp-table uprs-table">
<thead>
<tr><th>Rule ID</th><th>Pillar</th><th>Severity</th><th>Title</th></tr>
</thead>
<tbody>
{% assign rules = site.data.pdp_index.uprs_rules %}
{% if rules == nil %}
<!-- Fallback: render from static list in page if rules not in data file -->
{% endif %}
<tr><td class="uprs-id">U-SCH-001</td><td>schema</td><td>critical</td><td>Product JSON-LD missing</td></tr>
<tr><td class="uprs-id">U-SCH-002</td><td>schema</td><td>high</td><td>Open Graph only — no Product JSON-LD</td></tr>
<tr><td class="uprs-id">U-SCH-011</td><td>schema</td><td>high</td><td>Offer block missing</td></tr>
<tr><td class="uprs-id">U-SCH-012</td><td>schema</td><td>high</td><td>Incomplete Offer (price, currency, availability)</td></tr>
<tr><td class="uprs-id">U-SEO-010</td><td>google_seo</td><td>critical</td><td>Missing title tag</td></tr>
<tr><td class="uprs-id">U-SEO-020</td><td>google_seo</td><td>high</td><td>Missing meta description</td></tr>
<tr><td class="uprs-id">U-SEO-030</td><td>google_seo</td><td>high</td><td>Missing H1</td></tr>
<tr><td class="uprs-id">U-SEO-050</td><td>google_seo</td><td>high</td><td>Thin product content</td></tr>
<tr><td class="uprs-id">U-TEC-010</td><td>google_seo</td><td>critical</td><td>Bot-blocked storefront</td></tr>
<tr><td class="uprs-id">U-CNT-010</td><td>content</td><td>high</td><td>Missing core product fact</td></tr>
<tr><td class="uprs-id">U-CNT-020</td><td>content</td><td>medium</td><td>Missing decision evidence (specs, shipping, returns)</td></tr>
<tr><td class="uprs-id">U-IMG-001</td><td>images</td><td>high</td><td>Image accessibility or quality issue</td></tr>
<tr><td class="uprs-id">U-AI-001</td><td>ai_visibility</td><td>high</td><td>Low AI shopping readiness composite</td></tr>
</tbody>
</table>
</div>

<p>Full rule list with analyzer code mappings: <a href="{{ '/assets/data/pdp-index/uprs.json' | relative_url }}">uprs.json</a> ({{ site.data.pdp_index.uprs_version | default: "1.0.0" }}).</p>

## Implementing UPRS

Third-party tools may implement UPRS rules and cite the spec URL. The canonical reference implementation is Utiliy’s audit engine. When publishing comparative benchmarks, disclose UPRS version and link to this page.

## Changelog

### 1.0.0 (2026-03-01)

- Initial public release aligned with Utiliy six-pillar visibility model.
- Stable rule IDs for schema, SEO, content, images, technical, and AI readiness checks.
