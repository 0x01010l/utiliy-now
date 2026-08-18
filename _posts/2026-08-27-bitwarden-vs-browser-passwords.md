---
layout: post
title: "I Moved My Mom to Bitwarden in One Afternoon (She Still Uses Chrome)"
subtitle: "Browser password managers vs dedicated vaults — what changed and what didn't."
date: 2026-08-27
categories: [Privacy, Security]
description: "A practical comparison of browser-built password saving versus Bitwarden, based on migrating a non-technical parent without breaking her workflow."
read_time: "10 min"
toc: true
hero_tone: warm
tldr_label: "For parents"
tldr: "Chrome is fine until you need sharing, TOTP, or a second browser. Bitwarden Families was the migration that stuck."
---

My mom had **214 saved passwords in Chrome**. Sixty were duplicates. Fourteen were "Sign in with Google" with no independent password at all. When I suggested Bitwarden, she heard "another app to break."

One afternoon later, she's on **Bitwarden Families** ($40/year for five users — I pay it). Chrome still autofill on desktop. Phone uses the Bitwarden app. Here's what actually mattered.

## Browser password managers: the real pros

Chrome, Safari, and Firefox built-in managers are **good enough for many people**:

- Zero extra install
- Sync across same-ecosystem devices
- Phishing-resistant when tied to platform auth (Apple, Google)

For my mom's iPad-only sister? Safari Keychain wins. Don't overcomplicate.

## Where browsers fall short

| Gap | Why it hurt my mom |
|-----|-------------------|
| No secure sharing | I couldn't emergency-access router creds |
| Weak breach monitoring | Chrome warns, but vault reporting is thinner |
| Cross-platform friction | Android phone + Windows laptop + iPad — Chrome helps but not for non-browser apps |
| Account recovery | Google account compromise = all passwords |

The trigger event: she reused her email password on a quilting forum that got breached. Have I Been Pwned email arrived. That opened the conversation.

## Why Bitwarden (and not 1Password or LastPass)

I use **1Password** at work. For family, Bitwarden because:

- **Families plan is cheap**
- **Open source core** — matters to me, meaningless to her
- **Self-host option** if I ever want (I don't yet)
- **Works on her old Android** without bloat

LastPass's 2022 incident disqualified them in my house permanently.

## Migration steps that didn't cause a revolt

1. Installed Bitwarden extension on her Windows laptop
2. Exported Chrome passwords to CSV (Settings → Password Manager → Export)
3. Imported CSV into Bitwarden web vault
4. **Deleted the CSV immediately** — it's plaintext gold
5. Enabled **2FA on Bitwarden** with Authy on her phone — practice together twice
6. Left Chrome autofill enabled temporarily while she learned the extension icon

Critical: **did not disable Chrome passwords day one.** Parallel run for two weeks.

## What she notices day-to-day

- Extension pops up on new logins — she clicks save
- Phone app copies TOTP codes for her bank (replaced SMS 2FA where supported)
- Emergency access: I can request vault access with 7-day timeout she configured

What she doesn't notice: breach reports, duplicate cleanup I did once in the vault admin view.

## Comparison table (honest)

| Feature | Chrome | Bitwarden Families |
|---------|--------|-------------------|
| Cost | Free | ~$40/year |
| Cross-browser | Weak | Strong |
| Secure notes | Basic | Yes |
| TOTP built-in | No | Yes |
| Family sharing | No | Yes |
| Setup friction | None | One afternoon |

## If you're migrating a parent

- Do it **in person** or on video — not a forwarded link
- Pick **one device** to master first (phone OR laptop)
- Write the master password on paper in the fire safe — yes, really, for non-technical users who will forget
- Schedule a **30-day follow-up** to disable old Chrome saves

## Update log

- **Aug 27, 2026:** Published after the Eugene migration
