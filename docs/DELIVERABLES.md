# Utiliy SaaS — Architecture & Launch Deliverable

## 1. Architecture overview

```
utiliy.com (GitHub Pages — Jekyll static site)
  ├── Marketing homepage + SEO landing pages
  ├── Guides / resources hub
  └── auditor.js → POST /api/audit

utiliy-audit-api.azurewebsites.net (Azure Functions Python)
  ├── SSRF-safe crawler (httpx + BeautifulSoup + extruct)
  ├── Deterministic analyzers (SEO, schema, images, product info)
  ├── Weighted scoring engine (100 points)
  └── Optional Azure OpenAI (gpt-4o) for content/conversion reasoning

Azure utiliy-prod resource group
  ├── Function App: utiliy-audit-api
  ├── Storage: utiliy1868ab
  ├── Cognitive Services: utiliy-ai (gpt-4o deployment)
  └── Application Insights (auto-created)
```

**Why hybrid:** GitHub Pages cannot run crawlers, store secrets, or handle Stripe webhooks. The static site owns SEO; Azure owns compute.

## 2. Azure resources created/used

| Resource | Name | Purpose |
|----------|------|---------|
| Resource group | `utiliy-prod` | Scoped container |
| Storage account | `utiliy1868ab` | Functions runtime |
| Function App | `utiliy-audit-api` | Audit API |
| AI Services | `utiliy-ai` | Azure OpenAI gpt-4o |
| App Insights | `utiliy-audit-api` | Monitoring |

## 3. API architecture

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Liveness |
| `/api/audit` | POST | `{ "url": "...", "use_ai": true }` → full audit JSON |

CORS: `https://utiliy.com`, `https://www.utiliy.com`

## 4. Scoring weights (deterministic)

| Category | Weight |
|----------|--------|
| Technical SEO | 15 |
| On-page SEO | 15 |
| Structured data | 15 |
| Product information | 15 |
| Images | 10 |
| AI readiness | 15 |
| Content quality | 10 |
| Conversion clarity | 5 |

LLM adjusts content_quality and conversion_clarity only when Azure OpenAI is configured.

## 5. Estimated cost per audit

| Component | Est. cost |
|-----------|-----------|
| Azure Functions (consumption) | ~$0.0001–0.001 |
| gpt-4o (~1k tokens) | ~$0.01–0.03 |
| **Total** | **~$0.01–0.04/audit** |

Deterministic-only audits (no AI): fractions of a cent.

## 6. Stripe pricing (recommended)

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0 | 3 audits/mo, basic issues |
| Pro | $24/mo | 80 audits, AI analysis, history, PDF |
| Business | $49/mo | 250 audits, multi-store, reports |

**Phase 2** — Stripe Checkout + webhooks (not in Phase 1 deploy).

## 7. SEO architecture

**Live pages:**
- `/` — homepage + tool
- `/product-page-auditor/`
- `/product-page-seo-checker/`
- `/product-schema-checker/`
- `/ai-shopping-readiness/`
- `/shopify-product-page-seo/`
- `/woocommerce-product-page-seo/`
- `/pricing/`
- `/guides/`
- `/guides/product-page-seo-checklist/`

**Target keyword clusters:**
1. Product page audit / checker (high intent)
2. Product schema / structured data
3. AI shopping readiness / agentic commerce
4. Platform-specific (Shopify, WooCommerce)
5. Educational guides (checklists, how-to)

## 8. Competitor positioning

| Competitor | Gap Utiliy fills |
|------------|------------------|
| Ahrefs/Semrush | Site-wide, expensive — not PDP-focused |
| BetterPDP | AI-only angle; Utiliy adds schema + deterministic scoring |
| eCommerceInsights | Enterprise; Utiliy is self-serve URL paste |
| Aergos | Store sync/rewrite — Utiliy diagnoses without platform lock-in |

## 9. Environment variables (Function App)

```
AZURE_OPENAI_ENDPOINT=https://westus.api.cognitive.microsoft.com/
AZURE_OPENAI_KEY=<from Key Vault or portal>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview
CORS_ORIGIN=https://utiliy.com
```

## 10. Remaining work (Phase 2+)

- [ ] Stripe billing + usage limits
- [ ] User accounts + audit history
- [ ] Azure Vision image analysis
- [ ] PDF export
- [ ] `api.utiliy.com` custom domain + CNAME
- [ ] Google Search Console verification meta tag
- [ ] Analytics (Plausible or GA4)
- [ ] Rate limiting per IP (Azure API Management or Functions middleware)

## 11. Deployment

**Frontend:** push to `main` → GitHub Actions builds Jekyll → utiliy.com

**API:** `cd api && zip -r ../api-deploy.zip . && az functionapp deployment source config-zip -g utiliy-prod -n utiliy-audit-api --src ../api-deploy.zip --build-remote true`
