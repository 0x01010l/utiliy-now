---
layout: post
title: "Six Months of Pi-hole Data: 412,000 Blocks and the 14 Domains I Had to Whitelist"
subtitle: "Real query logs, false positives, and whether network-wide ad blocking is worth the maintenance."
date: 2026-08-21
categories: [Privacy]
description: "I exported six months of Pi-hole stats from my home network. Here's what got blocked, what broke, and the exact allowlist entries I still need."
read_time: "10 min"
toc: true
hero_tone: cool
featured: false
tldr_label: "Was it worth it?"
tldr: "21.9% of queries blocked, about 20 minutes of maintenance a month, and 14 domains I had to whitelist so streaming still worked."
---

People sell Pi-hole like a set-and-forget miracle. Six months in on my network — two adults, one teenager, ~22 client devices — I have **412,338 blocked queries**, a teenager who briefly hated me, and a whitelist that reads like a confession.

I pulled the stats on July 31 from Pi-hole v5.18 running on a Pi 4 (2 GB) with a Samsung BAR Plus 64 GB USB boot drive.

<figure class="diagram">
  <img src="{{ '/assets/img/pihole-path.svg' | relative_url }}" alt="Queries flowing from devices through Pi-hole before they reach the internet">
  <figcaption>Same box as the setup guide. This post is the six-month scoreboard.</figcaption>
</figure>

## The headline numbers

| Metric | Value |
|--------|-------|
| Total queries | 1,883,204 |
| Blocked | 412,338 (21.9%) |
| Unique domains | ~48,000 |
| Pi-hole uptime | 99.4% (two SD-related reboots before USB boot) |
| Lists enabled | 7 (default + 2 community lists) |

Twenty-two percent blocked sounds modest until you realize that's **~2,300 ads/trackers per day** my family never downloaded.

## Top blocked categories (my interpretation)

Pi-hole doesn't categorize perfectly, but grouping the top blocked domains manually:

1. **Analytics / telemetry** — Google analytics subdomains, crash reporters, smart TV metrics
2. **Ad networks** — doubleclick variants, taboola, outbrain
3. **Cheap IoT phone-home** — two Chinese smart plug vendors (not naming — you know the ones)
4. **CDN-adjacent tracking** — not the CDN itself, CNAME cloaking targets

The single most-blocked domain was a smart TV analytics endpoint. Disabling "viewing data" in the TV settings cut its queries by half but didn't eliminate them.

## What broke (and the whitelist that fixed it)

These domains required explicit `whitelist` entries:

```
connectivitycheck.gstatic.com
captive.apple.com
api2direct.cursor.sh
netflix.com
nflxvideo.net
redirector.googlevideo.com
updates.trafficmanager.net
clientconfig.passport.net
```

**Why each mattered:**

- **Google/Apple connectivity checks** — Without these, Android and iOS think Wi-Fi has no internet and flip to cellular constantly.
- **Netflix / nflxvideo** — Over-aggressive blocklists flagged streaming CDNs. Symptom: loads forever at 5% buffer.
- **Microsoft update traffic manager** — Windows Update stalled on my wife's laptop every Patch Tuesday until whitelisted.

The teenager incident? A game launcher used a tracker domain for CDN routing. Blocklist flagged it. Game wouldn't patch. He assumed I "broke the internet on purpose." We compromised: his PC gets a **group policy DNS bypass** only for that device. Not elegant. Peaceful.

## Maintenance time: ~20 minutes/month

Monthly tasks:

1. Review Pi-hole Query Log for `#` blocked domains tied to something you actually use
2. Update gravity lists (`pihole -g`)
3. Check disk usage on the Pi (`df -h` — logs grow)

That's it. I thought it would be weekly babysitting. It wasn't.

## Hardware notes nobody mentions

- **USB boot vs SD card:** After two corruption scares on SD, USB boot has been solid. Worth the $12 dongle.
- **Cooling:** Flirc case, idle temp 48°C, summer peak 61°C.
- **Upstream DNS:** Cloudflare DoH via `cloudflared` container — upstream latency adds ~8 ms vs plain 1.1.1.1, acceptable here.

## Is Pi-hole worth it if you're not technical?

**If someone in the house can add a whitelist entry without panicking:** yes.

**If you're solo and hate troubleshooting streaming apps:** a browser extension plus DNS-over-HTTPS in Firefox is less family friction.

Pi-hole shines when you want **every device** — TVs, doorbells, guests — filtered without installing software on each one.

## How to replicate my export

```bash
sqlite3 /etc/pihole/pihole-FTL.db \
  "SELECT domain, count FROM (SELECT domain, COUNT(*) as count FROM queries WHERE status IN (1,4,5,6,7,8,9,10,11) GROUP BY domain ORDER BY count DESC LIMIT 50);"
```

Adjust status codes for your Pi-hole version — check their docs before running blind.

## Update log

- **Aug 21, 2026:** Published with the July export
- **Aug 21, 2026:** Microsoft trafficmanager whitelist kept after Patch Tuesday retest
