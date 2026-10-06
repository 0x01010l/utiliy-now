# Utiliy

Measurement-first shop for [utiliy.com](https://utiliy.com). Product pages, FAQ schema, `llms.txt`, and `/feeds/products.json` publish the span, gap, load, or surface. Stripe Payment Links take the order. Supplier ids for AutoDS fulfillment are in `/feeds/fulfillment.json`.

```bash
node scripts/build.mjs
```

GitHub Pages publishes the `dist` folder from `.github/workflows/pages.yml`.
