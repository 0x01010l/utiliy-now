# Tech Pulse Daily

Production-ready Jekyll site for GitHub Pages, custom domain, and Google AdSense.

## What's included

- **12 long-form articles** — unique structure, real numbers, update logs
- **8 static pages** — Home, Start Here, Blog, About, Contact, Privacy, Disclaimer, Editorial Policy
- **AdSense-ready** — cookie banner, ad placeholder slots, legal pages
- **Custom editorial design** — not a stock GitHub theme

## Local preview

```bash
bundle install
bundle exec jekyll serve
# http://localhost:4000
```

## Before going live

1. Domain configured: `utiliy.com` in `_config.yml`, `CNAME`, `robots.txt`
2. Add Formspree ID in `contact.md`
3. After AdSense approval, replace sidebar ad placeholder with your ad unit code
4. Optional: add Google Analytics tag in `_includes/head.html`

## Deploy

Push to GitHub → Settings → Pages → Source: **GitHub Actions**

DNS: A records to GitHub Pages IPs + CNAME `www` → `username.github.io`

## AdSense timeline

Publish 2–3 posts/week for 3–4 weeks, verify Search Console, then apply. See articles for content quality bar.
