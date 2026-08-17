---
layout: post
title: "DNS Explained Without the Computer Science Degree"
subtitle: "What happens in the 40 milliseconds between typing gmail.com and seeing your inbox."
date: 2025-08-17
categories: [Networking]
description: "A plain-language guide to DNS: resolvers, records, caching, and why changing DNS fixes weird problems."
read_time: "9 min"
toc: true
hero_tone: cool
---

Every networking article assumes you already know DNS. You don't — and that's fine. I didn't really get it until my third year on the job, when a misconfigured CNAME took down email for a dental office.

Here's the version I wish someone sent me before I touched Pi-hole.

## The phone book analogy (accurate enough)

Your browser doesn't know where `gmail.com` lives. It asks DNS: **"What's the IP address?"**

DNS responds: `142.250.80.46` (simplified — Google uses many IPs).

Browser connects to that number. You see Gmail.

## The cast of characters

| Piece | Role | Example in my house |
|-------|------|---------------------|
| **Stub resolver** | App asking the question | Chrome on laptop |
| **Recursive resolver** | Does the legwork | Pi-hole → Unbound |
| **Authoritative server** | Source of truth for a domain | Google's nameservers |
| **Cache** | Remembers recent answers | Pi-hole FTL database |

When I type `amazon.com`, my laptop asks Pi-hole. Pi-hole asks Unbound. Unbound walks the DNS tree from root servers down. Answer cached for the TTL (time-to-live).

## Record types you'll actually see

- **A / AAAA** — name → IPv4 / IPv6
- **CNAME** — alias pointing to another name
- **MX** — mail server for a domain
- **TXT** — verification strings (SPF, DKIM, Google Search Console)
- **PTR** — reverse lookup (IP → name), mostly diagnostics

Home users break things with **CNAME chasing** when blocklists block the wrong target.

## Why "change DNS to 1.1.1.1" fixes stuff

Your ISP's resolver might be:

- Slow
- Logging queries for ads (historically true in some markets)
- Broken during outages

Switching to Cloudflare or Quad9 changes **who answers** — not magic, just a different resolver with different policies and uptime.

Pi-hole adds: **"And I'll block answers I don't like."**

## TTL: why changes take time

TTL tells resolvers how long to cache. Set `300` (5 minutes) before migrating services; lower TTL days ahead of cutover.

I've seen people panic when email moved but TTL was 86400 (24 hours). Patience or flush local cache — not both help instantly.

## Debugging commands (copy these)

```bash
# What does my system think?
dig example.com +short

# Trace full resolution path
dig example.com +trace

# Which DNS server answered?
dig example.com @192.168.1.53

# Reverse lookup
dig -x 8.8.8.8 +short
```

On Windows: `nslookup example.com`.

## Common "DNS broke my life" symptoms

| Symptom | Often actually |
|---------|----------------|
| "Wi-Fi works but internet doesn't" on phone | Captive portal / blocked connectivity check domain |
| Site loads on LTE, not home Wi-Fi | Pi-hole blocklist or parental control |
| Email works, website doesn't | Unrelated — stop blaming MX records |
| Everything slow | Usually not DNS — check Wi-Fi or ISP |

## When to stop tweaking DNS

If pages load, streaming works, and Pi-hole query log isn't red with your own devices failing — **leave it alone**. DNS rabbit holes are deep.

## Update log

- **Aug 17, 2025:** Published for Start Here networking path
