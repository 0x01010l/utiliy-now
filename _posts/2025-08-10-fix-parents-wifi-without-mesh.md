---
layout: post
title: "How I Fixed My Parents' Wi-Fi Without Buying a $400 Mesh System"
subtitle: "Three afternoons, zero new hardware, and a 4x speed improvement in the back bedroom."
date: 2025-08-10
categories: [Networking]
description: "A step-by-step case study of diagnosing slow Wi-Fi in a 1980s ranch house — channel overlap, bad placement, and ISP double NAT included."
read_time: "11 min"
toc: true
hero_tone: warm
featured: true
---

My mom called on a Sunday. "The internet works in the kitchen but Netflix buffers in the bedroom. Should we buy one of those Eero things?"

I drove to Eugene the following weekend with a laptop, WiFi Explorer on my phone, and strong opinions about consumer mesh marketing. Four hours later, download speeds in the back bedroom went from **8 Mbps to 34 Mbps** — without opening Amazon.

This is exactly what I did, in the order I'd do it again.

## The house and the complaint

- **House:** Single-story ranch, ~1,650 sq ft, lathe-and-plaster interior walls
- **Router:** ISP-provided Arris combo unit (modem + router + Wi-Fi)
- **Symptom:** 5 GHz visible everywhere, but throughput collapses two rooms away
- **Goal:** Stable streaming and video calls for my parents — not perfect geek-lab coverage

## Step 1: Measure before buying anything

I used **fast.com** and **iperf3** (to a Raspberry Pi I plugged into Ethernet in the living room). Results:

| Location | Before | After fixes |
|----------|--------|-------------|
| Next to router | 142 Mbps | 148 Mbps |
| Guest bedroom | 8 Mbps | 34 Mbps |
| Garage (dad's workbench) | 3 Mbps | 19 Mbps |

The router wasn't slow. Distance and interference were.

## Step 2: Get the router out of the corner

It lived on a shelf inside the TV cabinet. Closed front, HDMI cables, sound bar underneath.

I moved it to an **open shelf at chest height** in the central hallway. Cost: $0. Improvement in guest bedroom: **8 → 19 Mbps** before touching any settings.

> **Rule I repeat constantly:** Wi-Fi can't go through metal, mirrors, and aquariums. It also hates being inside furniture.

## Step 3: Fix channel overlap on 2.4 GHz

The neighborhood scan showed **six networks on channel 6**. The Arris defaulted to… channel 6.

I switched 2.4 GHz to **channel 1** (only two neighbors there) and reduced channel width from 40 MHz to **20 MHz**. Old devices (doorbell cam, thermostat) became more stable.

5 GHz I left on **UNII-1 channel 36** with 80 MHz width — only one competing network visible.

## Step 4: Kill double NAT (the silent killer)

The Arris was routing internally. A older Netgear router (from 2016) was still plugged in downstream for "extra Wi-Fi," also routing.

Two DHCP servers. Two NAT tables. Traceroutes that looked like a pretzel.

Fix:

1. Logged into the Netgear
2. Disabled DHCP
3. Set its LAN IP to `192.168.0.2` (primary gateway `192.168.0.1`)
4. Connected **LAN → LAN** (not WAN) so it acted as an access point

If you only have one router, skip this. If someone "plugged the old router in for better signal," check this first.

## Step 5: Separate IoT instead of banning it

They had 11 smart devices on the main SSID. I enabled the **guest network** on the Arris, renamed it `Chen-IoT`, and moved doorbell, thermostat, and two cheap smart plugs.

Guest isolation stopped the doorbell from broadcasting mDNS storms that confused my mom's iPad.

## What I deliberately did NOT do

- **Mesh system:** Not yet justified. One AP might still help the garage later.
- **Custom firmware:** ISP combo unit — not worth the fight.
- **Pi-hole:** Added later on my own Pi; not part of this weekend.

## When mesh actually makes sense

Buy mesh if, after placement and channel fixes, you still have dead zones **and** you can't run Ethernet to a second access point. Mesh is expensive pretty cable. If you can pull Cat6 to a central closet, a $70 AP beats a $350 three-pack.

## Update log

- **Aug 10, 2025:** Initial publish after on-site visit
- **Aug 12, 2025:** Added iperf3 numbers; corrected guest SSID isolation note for Arris firmware 9.1.103
