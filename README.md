# Utiliy — utiliy.com

Jekyll site on GitHub Pages.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```

Future-dated posts stay unpublished until their date (`future: false`). A daily GitHub Action rebuilds the site so scheduled posts go live without another push.

## After AdSense / Search Console (you have to click these)

1. **Email for the contact form** — create `hello@utiliy.com` (or forwarding) at your domain host. The first FormSubmit message sends a confirmation to that inbox. Click it.
2. **Search Console** — add `https://utiliy.com`, verify (DNS TXT is easiest on Azure DNS), submit `https://utiliy.com/sitemap.xml`. Then paste the verification code into `_config.yml` as `google_site_verification`.
3. **AdSense** — apply after a few weeks of the site being live. When approved, put your publisher id in `_config.yml` as `adsense_client` (example `ca-pub-xxxxxxxx`).
4. **Optional Analytics** — put `G-XXXXXXXX` in `google_analytics`.

Do not add a fake `ads.txt` until AdSense gives you the real line.
