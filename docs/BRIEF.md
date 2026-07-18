# Stress-Free Car Buying — Product Brief & Claude Code Build Plan

**Product name (locked in Phase 1):** CarBuddy — *email-only, out-the-door car buying.*

**Origin:** Everything in this brief was battle-tested during a real 2026 multi-dealer
purchase run in Jacksonville, FL — 12+ dealers contacted, email-only negotiation,
NFCU pre-approval, OTD-only comparison. The tool productizes that playbook.

**Thesis:** Dealers win because buyers negotiate one dealer at a time, on monthly
payment, by phone, without knowing which fees are fake. This tool inverts all four:
many dealers at once, OTD-only, in writing, with every fee decoded.

---

## 1. Feature Map

### Core Loop (MVP — must ship)

**A. Dealer Comparison Dashboard**
- Add/edit dealer cards: dealership, contact person, vehicle
  (year/make/model/trim/color/VIN/stock #), status
- Status pipeline: Contacted → Quoted → Negotiating → Pending → Declined / Crossed Off
- Itemized fee ledger per quote: sale price, doc fee, e-filing, dealer add-ons, tax,
  title/reg → computed OTD
- Negotiable-fee flags: each line item tagged Fixed / Negotiable / Fake
- Live monthly payment per dealer, driven by shared financing inputs (APR, term, down)
- Lowest-OTD and lowest-payment highlighting
- Dealer notes + tactics log

**B. Payment Calculator**
- Inputs: price, down payment, APR, term, tax rate (state presets), fees, roll-in toggle
- Outputs: monthly payment, total interest, total cost
- Term comparison strip (60 vs 72 vs 84)
- Lump-sum principal payment modeler

**C. Email Template Library**
- Categories: initial OTD request · email-only boundary · competing-quote leverage ·
  fee challenge · trim/VIN written confirmation · polite walk-away · deposit/hold
- Merge fields auto-filled from the dashboard
- Copy-to-clipboard + mailto: launch
- Each template annotated with *why it works*

**D. Fee Decoder**
- Searchable glossary of every fee, with legit range, negotiability, and the exact
  sentence to say. State notes where relevant.

### Supporting Features (ship if time allows) — E. Playbook · F. Red Flag Tracker · G. Info-Sharing Guide

### v2 (parking lot) — old-car sale, out-of-state, test-drive worksheet, budget, PDF export

---

## 2. Architecture Decisions (locked)

- Static site, no backend. GitHub Pages.
- Vanilla HTML/CSS/JS. No build step, no framework, no npm.
- All user data in localStorage under `carledger_v1`, single versioned JSON blob + migration stub.
- Privacy is the pitch: nothing leaves the browser. Say so prominently.
- Export/import: JSON download + paste-to-restore.
- Mobile-first.
- Design: clean, calm, trustworthy. Warm neutrals, generous whitespace, tabular numerals.
- Seed content ships as data, not code (`data/content.js`).

---

*Full three-phase Plan → Spec → Build methodology preserved in the original brief.
See PLAN.md, SPEC.md, and DECISIONS.md for how this build executed it.*
