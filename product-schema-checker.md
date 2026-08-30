---
layout: landing
title: Product Schema Checker
subtitle: Validate Product and Offer JSON-LD — price, availability, brand, SKU, GTIN, and conflicts with visible page content.
description: Free Product schema checker for ecommerce product pages. Find missing JSON-LD properties, invalid Offer data, and schema-content mismatches.
permalink: /product-schema-checker/
---

## What Product schema actually does

Structured data helps search engines and AI shopping systems understand **what you are selling, for how much, and whether it is in stock** — without guessing from layout alone.

Utiliy parses JSON-LD on the page and checks:

| Property | Why it matters |
|----------|----------------|
| `name` | Product identity for rich results and AI answers |
| `image` | Primary visual for listings |
| `offers.price` | Price clarity |
| `offers.priceCurrency` | Currency for international catalogs |
| `offers.availability` | In stock vs pre-order |
| `brand` | Brand entity recognition |
| `sku` / `gtin` / `mpn` | Catalog matching |

## Invalid vs missing vs recommended

We distinguish:

- **Missing** — property absent; may limit rich result eligibility
- **Invalid** — malformed JSON-LD or Offer block
- **Inconsistent** — schema says one price, visible page shows another
- **Recommended** — helpful but not always required (e.g. aggregateRating when you have real reviews)

We do not claim guaranteed ranking improvements from schema alone. We show what parsers can and cannot read reliably.
