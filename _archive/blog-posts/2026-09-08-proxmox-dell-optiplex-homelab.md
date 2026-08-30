---
layout: post
title: "Proxmox on a $90 Used Dell OptiPlex: What Runs, What Struggles"
subtitle: "Homelab virtualization without burning electricity or buying a NUC."
date: 2026-09-08
categories: [Home Lab]
description: "An honest review of running Proxmox VE on a Dell OptiPlex 7040 — specs, VM inventory, power draw, and when to buy real server gear instead."
read_time: "13 min"
toc: true
hero_tone: cool
tldr_label: "Buy this used?"
tldr: "A $90 OptiPlex Micro is enough to learn Proxmox. It is not enough if you need 32 GB of RAM or quiet transcoding."
---

Everyone on r/homelab buys a rack mount and regrets the noise. I bought a **Dell OptiPlex 7040 Micro** off Facebook Marketplace for **$90** — i5-6500T, 16 GB RAM, 256 GB SSD — and installed **Proxmox VE 8.2**.

Eight months later, it hosts six workloads. Two surprise reboots. One lesson about USB stick installs.

## Why this box (and not a Pi cluster)

Raspberry Pis excel at low-power always-on tasks. Proxmox needs **x86**, proper NICs, and RAM headroom for multiple VMs.

The 7040 Micro:

- **19W idle** measured at the wall (Kill A Watt)
- **38W peak** during Windows VM updates + ZFS scrub (no ZFS mirror — single SSD)
- Whisper quiet — lives on a shelf, WAF approved

## Current VM/LXC inventory

| ID | Name | Type | RAM | vCPU | Purpose |
|----|------|------|-----|------|---------|
| 100 | omada | LXC | 1 GB | 1 | TP-Link controller |
| 101 | tailscale-exit | LXC | 512 MB | 1 | Exit node experiments |
| 102 | uptime-kuma | LXC | 512 MB | 1 | Internal monitoring |
| 103 | dev-ubuntu | VM | 4 GB | 2 | Throwaway dev |
| 104 | win11-ltsc | VM | 4 GB | 2 | Rare Windows-only tools |
| 105 | homeassistant | VM | 2 GB | 2 | USB passthrough Zigbee coordinator |

Total allocated: **12 GB** — overcommit works until Windows Update Wednesday.

## Install notes that aren't in the official video

1. **Disable Secure Boot** in BIOS or Proxmox installer fails obscurely
2. **Flash the ISO to USB with Ventoy** — Balena Etcher bricked two sticks for me (YMMV)
3. **Set static IP via CLI** after install — `nano /etc/network/interfaces` old-school
4. **Enable IOMMU** only if you need passthrough — costs idle power on some boards

Post-install:

```bash
apt update && apt full-upgrade -y
pveam update
```

## Backups (learned hard way)

Proxmox Backup Server is overkill here. I use **vzdump nightly to Synology NFS**:

```bash
# /etc/pve/vzdump.cron — 2 AM daily, keep 3
0 2 * * * root vzdump --all --mode snapshot --storage nas-backup --compress zstd
```

When I killed the HA VM experimenting with USB mapping, I restored in **4 minutes**. Worth more than any benchmark score.

## What struggles

- **RAM ceiling:** 16 GB max on this board — VM 103 + 104 can't run simultaneously without swapping
- **No ECC:** fine for homelab, wouldn't host paying customers
- **Single NIC:** VLAN trunking works but one cable failure kills everything
- **Transcoding:** useless for Plex — no QuickSync on this SKU in practice

## When to upgrade

Buy a real server if you need:

- **32 GB+ RAM** for parallel Windows VMs
- **Multiple NICs** for OPNsense inline
- **ECC + IPMI** for anything family-critical

Stay on OptiPlex if you're learning Linux, networking, and virtualization on a **sub-$100 budget**.

## Shopping checklist (used office PCs)

- **CPU:** i5/i7 with **T** suffix (low power) or newer Ryzen mini PCs
- **RAM:** 16 GB minimum installed
- **Storage:** SSD, not 5400 RPM HDD
- **Size:** Micro/Mini form factor — SFF towers are louder

Avoid: anything without AES-NI if you care about VPN throughput (older Core 2 Duo).

## Update log

- **Sep 8, 2026:** Published from the `pve-home` node export
- **Sep 8, 2026:** Idle wattage after meter recalibration
