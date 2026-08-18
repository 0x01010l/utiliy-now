---
layout: page
title: Privacy Policy
permalink: /privacy/
description: How Utiliy collects, uses, and protects visitor information.
---

*Last updated: August 18, 2026*

Utiliy ("we", "us", "our") is operated by Mike Chen at {{ site.url }}. This policy explains what happens when you visit the site.

## Information we collect

### Automatically collected data

GitHub Pages and its CDN may record standard web logs:

- IP address
- Browser type and version
- Pages visited and timestamps
- Referring URL
- Device type

We use this to keep the site working, not to sell profiles.

### Information you provide

If you use the contact form, FormSubmit delivers your name, email, and message to [{{ site.author.email }}](mailto:{{ site.author.email }}). We use that only to reply.

## Cookies

The site uses local storage to remember a cookie-banner choice **if advertising is enabled**.

{% if site.google_analytics and site.google_analytics != "" %}
We use **Google Analytics** (`{{ site.google_analytics }}`) to measure traffic. Google's policy: [policies.google.com/privacy](https://policies.google.com/privacy).
{% else %}
We do **not** currently load Google Analytics. If that changes, this page will be updated with the measurement ID.
{% endif %}

{% if site.adsense_client and site.adsense_client != "" %}
We display ads through **Google AdSense**. Personalized ads can be controlled at [adssettings.google.com](https://adssettings.google.com).
{% else %}
We do **not** currently display Google AdSense ads. After approval, ads and a consent banner will appear, and this section will name the publisher ID.
{% endif %}

You can also block cookies in your browser.

## How we use information

- Operate and fix the website
- Reply to messages
- Understand which guides are useful
- Show ads, if and when AdSense is approved
- Detect abuse

We do not sell personal information.

## Third-party services

| Service | Why |
|---------|-----|
| GitHub Pages | Hosting |
| FormSubmit | Contact form delivery ([privacy](https://formsubmit.co/privacy.pdf)) |
| Google Fonts | Typefaces |

Each provider has its own policy.

## Retention

Hosting logs follow GitHub's defaults. Contact emails are kept until the conversation is done, then deleted or archived.

## Your rights

Depending on where you live (including GDPR and CCPA), you may ask to access, correct, or delete personal data. Email [{{ site.author.email }}](mailto:{{ site.author.email }}) with the subject **Privacy Request**.

## Children

This site is not directed at children under 13. We do not knowingly collect their information.

## International visitors

Hosting is in the United States. Using the site means data may be processed there.

## Changes

Updates will be posted here with a new date.

## Contact

[{{ site.author.email }}](mailto:{{ site.author.email }})
