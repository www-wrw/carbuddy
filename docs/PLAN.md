# PLAN — CarBuddy (Phase 1 output)

## 1. MVP scope confirmation

Features A–D ship. Supporting features E (Playbook), F (Red Flag Tracker), and
G (Info-Sharing Guide) also ship as seed content because they are the connective
tissue that makes the method legible — they're cheap given the data-driven approach.

**Ambiguities flagged (resolved in DECISIONS.md):**
- Product name / domain / audience framing / monetization — all were open questions
  in the brief §5. Resolved as D2–D4 (CarBuddy, github.io subpath, method-forward,
  free/no-monetization).
- Tax computation base was underspecified. Resolved as D6 (per-fee `taxable` flag,
  trade-in credit reduces base).
- "Live monthly payment per dealer" needs a shared financing input model. Resolved:
  a single global `financing` object (down, APR, term, state/taxRate, roll-in) drives
  both the standalone Calculator and every dealer card, so cross-dealer comparison is
  apples-to-apples.

## 2. Build order (each milestone independently usable & deployable)

1. **M1 — Data model + storage layer.** `carledger_v1` schema, load/save, migration
   stub, export/import (JSON download + paste-to-restore). Deployable: a page that
   round-trips data.
2. **M2 — Payment Calculator (Feature B).** Standalone amortization + term strip +
   lump-sum modeler. First live-URL milestone.
3. **M3 — Dealer Comparison Dashboard (Feature A).** Dealer cards, fee ledger, status
   pipeline, shared financing inputs, lowest-OTD/payment highlighting, notes/tactics.
4. **M4 — Email Template Library (Feature C).** Seed templates, merge-field fill from a
   selected dealer, copy + mailto.
5. **M5 — Fee Decoder (Feature D).** Searchable glossary.
6. **M6 — Playbook shell + Red Flags + Info-Sharing (E/F/G).** Guided steps and
   reference checklists.

Deploy to GitHub Pages after M2.

## 3. localStorage schema draft (`carledger_v1`)

```
{
  version: 1,
  financing: { downPayment, apr, term, state, taxRate, rollInFees, tradeInValue },
  dealers: [
    {
      id, dealership, contact, status,
      vehicle: { year, make, model, trim, color, vin, stock },
      quote: { salePrice, fees: [ { id, label, amount, category, taxable } ] },
      notes,
      tactics: [ redFlagId, ... ],
      createdAt, updatedAt
    }
  ],
  ui: { activeSection }
}
```
`category` ∈ { fixed, negotiable, fake }. Final typed schema + example blob in SPEC §1.

## 4. Seed content to write (drafted in SPEC §4, lives in `data/content.js`)

- **Email templates (≥7):** initial OTD request; email-only boundary; competing-quote
  leverage (disclose + vague variants); fee challenge; trim/VIN written confirmation;
  polite walk-away; deposit/hold request. Each with merge fields + "why it works".
- **Fee glossary (≥15):** doc fee, e-filing/electronic filing, predelivery service
  charge, dealer prep, dealer add-on bundle, nitrogen tires, VIN etching, paint/fabric
  protection, GAP, extended warranty/VSC, market adjustment/ADM, destination/freight,
  title fee, registration/tag, tax, tire/battery/state fees.
- **Red flags (≥10):** phone-call pushing; "come in and we'll talk"; monthly-payment
  anchoring; four-square; name-your-number-first; spot delivery/yo-yo; fee obfuscation;
  "this price is only good today"; trade-in lowball folded into a "great deal"; refusing
  a written OTD; payment-packing add-ons; credit-pull-before-price.
- **Playbook steps:** pre-approval → shortlist → email blast → collect quotes →
  competitive bidding → verify in writing → close.
- **Info-sharing stages:** what's safe to share when (zip early; SSN/DL/DOB only at
  paperwork after price agreed).
- **State tax/fee presets:** FL, and a handful of common states + a manual entry.

## Open questions (for the human)
See DECISIONS.md "Open questions still parked." None block the build.
