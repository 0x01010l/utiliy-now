# Utiliy — AI Product Page Auditor

SEO-first SaaS for auditing ecommerce product pages.

- **Site:** https://utiliy.com (GitHub Pages)
- **API:** https://utiliy-audit-api.azurewebsites.net/api
- **Docs:** [docs/DELIVERABLES.md](docs/DELIVERABLES.md)

## Local dev

```bash
bundle install
bundle exec jekyll serve
```

## API deploy

```bash
cd api && zip -r ../api-deploy.zip . && az functionapp deployment source config-zip -g utiliy-prod -n utiliy-audit-api --src ../api-deploy.zip --build-remote true
```
