# Utiliy

Measurement-first shop for [utiliy.com](https://utiliy.com). Product pages, structured data, `llms.txt`, and `/feeds/products.json` publish the span, gap, load, surface, availability, shipping, and return facts needed to choose a product. WooCommerce and Stripe handle secure checkout.

```bash
npm run verify
```

GitHub Pages publishes `dist` from `.github/workflows/pages.yml`, then runs the live URL, canonical, and 404 audit.
