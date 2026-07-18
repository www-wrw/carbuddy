# SPEC — CarBuddy (Phase 2 output) — **the source of truth for the build**

Conflict resolution: SPEC wins over PLAN and BRIEF; DECISIONS.md overrides SPEC.

---

## 1. localStorage schema (`carledger_v1`) — final

Single namespaced key `carledger_v1`, one JSON blob. Types:

```
Root {
  version: number            // integer, currently 1
  financing: Financing
  dealers: Dealer[]
  ui: { activeSection: string }   // e.g. "playbook" | "dashboard" | ...
}

Financing {
  downPayment: number   // dollars, >= 0
  apr: number           // annual %, e.g. 6.9  (>= 0)
  term: number          // months, integer > 0 (e.g. 60/72/84)
  state: string         // 2-letter code or "" ; drives taxRate preset
  taxRate: number       // decimal fraction, e.g. 0.07 for 7%
  rollInFees: boolean   // if true, finance OTD (minus down); if false, finance price+tax, pay fees cash
  tradeInValue: number  // dollars, >= 0 ; reduces taxable base and OTD
}

Dealer {
  id: string            // uuid-ish
  dealership: string
  contact: string
  status: "contacted"|"quoted"|"negotiating"|"pending"|"declined"|"crossed_off"
  vehicle: { year:string, make:string, model:string, trim:string, color:string, vin:string, stock:string }
  quote: { salePrice: number, fees: Fee[] }
  notes: string
  tactics: string[]     // red-flag ids observed at this dealer
  createdAt: number     // epoch ms
  updatedAt: number
}

Fee {
  id: string
  label: string
  amount: number        // dollars
  category: "fixed"|"negotiable"|"fake"
  taxable: boolean
}
```

**Migration:** `migrate(blob)` switches on `blob.version`. v1 is current; the stub is a
no-op that returns the blob unchanged for version 1 and throws a clear console warning
for unknown/newer versions (then falls back to a fresh default rather than corrupting).
Schema version is NEVER bumped without adding a migration branch.

### Example populated blob (abbreviated)
```json
{
  "version": 1,
  "financing": { "downPayment": 4000, "apr": 6.49, "term": 72, "state": "FL",
                 "taxRate": 0.07, "rollInFees": true, "tradeInValue": 0 },
  "dealers": [{
    "id": "d_ab12", "dealership": "Coastal Toyota", "contact": "Sam R.",
    "status": "negotiating",
    "vehicle": { "year":"2026","make":"Toyota","model":"RAV4","trim":"XLE",
                 "color":"Silver","vin":"","stock":"T4821" },
    "quote": { "salePrice": 31500, "fees": [
      { "id":"f1","label":"Doc fee","amount":899,"category":"negotiable","taxable":true },
      { "id":"f2","label":"Electronic filing","amount":389,"category":"fake","taxable":true },
      { "id":"f3","label":"Title & registration","amount":420,"category":"fixed","taxable":false }
    ]},
    "notes": "Pushed for a phone call twice.", "tactics": ["phone_push"],
    "createdAt": 1752800000000, "updatedAt": 1752800000000
  }],
  "ui": { "activeSection": "dashboard" }
}
```

---

## 2. Formulas (written out explicitly)

**Taxable base (per dealer):**
```
taxableFees = Σ fee.amount  for fees where fee.taxable === true
taxableBase = max(0, salePrice + taxableFees − tradeInValue)
tax         = round(taxableBase × taxRate)              // rounded to the cent
```

**Out-the-door (per dealer):**
```
feesTotal = Σ fee.amount   (all fees, all categories)
OTD       = salePrice + feesTotal + tax
```

**Amount financed:**
```
if rollInFees:  financed = max(0, OTD − downPayment − tradeInValue)
else:           financed = max(0, salePrice + tax − downPayment − tradeInValue)
                (non-rolled fees are assumed paid in cash and excluded from the loan)
```

**Monthly payment (standard amortization):**
```
r = (apr / 100) / 12                 // monthly rate
n = term                             // months
if r === 0:  M = financed / n
else:        M = financed × r × (1+r)^n / ((1+r)^n − 1)
totalPaid     = M × n
totalInterest = totalPaid − financed
totalCost     = downPayment + tradeInApplied + totalPaid   // cash out of pocket over life
```

**Term comparison strip:** compute M, totalInterest for terms [60, 72, 84] (or the
selected term plus the two nearest standard terms), holding financed/APR fixed.

**Lump-sum principal modeler:** given a one-time extra principal `L` applied after month
`k`, amortize month-by-month at rate `r`: each month interest = balance×r, principal =
M − interest, balance −= principal; at month `k` subtract `L` from balance. Report new
payoff month and total interest saved vs. baseline. Guard against negative/last-payment
overshoot.

---

## 3. Per-feature functional specs

### A. Dealer Comparison Dashboard (`#dashboard`)
- **Add dealer** button → inline card form. Fields: dealership (required), contact,
  vehicle sub-fields, status (select, default "contacted").
- **Fee ledger** inside each card: rows of {label, amount, category select, taxable
  checkbox}. Default rows seeded on first fee add? No — start empty with an "Add fee"
  and a "Quick-add common fees" helper that inserts doc/e-filing/title-reg templates.
- **Computed per card:** taxableBase, tax, OTD, monthly payment (using global
  financing). Displayed with tabular numerals.
- **Highlighting:** the card(s) with the lowest OTD get a "Lowest OTD" badge; lowest
  monthly payment gets a "Lowest payment" badge. Ties → all tied cards badged.
- **Status pipeline** shown as a colored pill; editable via the select.
- **Notes** textarea + **tactics** multi-select (from red-flag list) per card.
- **Validation:** amounts coerce to numbers ≥ 0; blank = 0. salePrice blank ⇒ OTD
  shows "—" and card is excluded from lowest-OTD comparison.
- **Empty state:** friendly prompt to add the first dealer, with a one-line pitch of the
  method and a link to the Playbook.
- **Edge cases:** 0 quotes → no badges, empty state. 1 dealer → it gets both badges
  only if it has a numeric OTD. Deleting a dealer referenced by the Templates merge
  selection → template selector falls back to "no dealer / manual".

### B. Payment Calculator (`#calculator`)
- Inputs bound to global `financing` (down, APR, term, state preset → taxRate,
  roll-in, trade-in) plus a local **price** and optional **fees** field for a quick
  standalone estimate independent of any dealer.
- Outputs: monthly payment, total interest, total cost, amount financed, tax.
- **Term strip:** 60/72/84 side-by-side with monthly + total-interest delta vs. the
  shortest.
- **Lump-sum modeler:** inputs extra-principal amount + "after month N" → new payoff
  month + interest saved.
- State preset dropdown updates taxRate; manual taxRate entry allowed (switches state to
  "custom").
- **Validation:** APR ≥ 0; term integer 1–120; price ≥ 0. Divide-by-zero guarded
  (term 0 blocked; r=0 handled).

### C. Email Template Library (`#templates`)
- **Dealer selector** (choose a saved dealer to source merge fields, or "manual").
- **Merge fields:** `{dealer}`, `{contact}`, `{vehicle}`, `{competing_OTD}`,
  `{target_OTD}`, `{my_name}`. `{vehicle}` = "year make model trim". `{competing_OTD}`
  = lowest OTD among *other* dealers; `{target_OTD}` = user-entered goal. Unfilled
  fields render as an obvious placeholder like `[competing OTD]` rather than breaking.
- Each template card: title, category, rendered body (post-merge), **Copy** button,
  **Open in email** (mailto:) button, and a "why it works" note.
- Search/filter by category.

### D. Fee Decoder (`#fees`)
- Search box filters glossary by name/keyword.
- Each entry: name, what it is, typical legit range, negotiable?, the exact sentence to
  say, optional state note. Category color chip (fixed/negotiable/fake) mirrors the
  dashboard tags.

### E/F/G supporting
- **Playbook (`#playbook`):** ordered steps, each with a short how-to and a link to the
  relevant section. Front page / default section.
- **Red Flags (`#guide`):** each tactic + counter-move; ids match dealer `tactics`.
- **Info-Sharing (`#guide`):** staged table of what's safe to share when.
- **Data (`#data`):** export JSON download, import via paste/textarea + file, clear-all
  with confirm. Privacy statement prominent.

---

## 4. Seed content — **drafted in `data/content.js` (source of truth for exact wording)**

Inventory delivered (counts verified against the file):
- **Email templates: 8** — `initial_otd`, `email_only`, `competing_disclose`,
  `competing_vague`, `fee_challenge`, `written_confirm`, `walk_away`, `deposit_hold`.
- **Fee glossary: 17** — doc fee, electronic/e-filing, predelivery service charge,
  dealer prep, dealer add-on bundle, nitrogen tires, VIN etching, paint & fabric
  protection, GAP insurance, extended warranty (VSC), market adjustment (ADM),
  destination/freight, title fee, registration/tag, sales tax, tire & battery fee,
  advertising fee.
- **Red flags: 12** — `phone_push`, `come_in`, `payment_anchor`, `four_square`,
  `name_number_first`, `spot_delivery`, `fee_obfuscation`, `today_only`,
  `trade_lowball`, `no_written_otd`, `payment_packing`, `credit_before_price`.
- **Playbook steps: 7** — pre-approval, shortlist, email blast, collect quotes,
  competitive bidding, verify in writing, close.
- **Info-sharing stages: 4** — inquiry, quote, agreed-on-price, paperwork.
- **State presets:** FL + ~8 common states + custom.

---

## 5. Acceptance criteria per milestone ("done means…")

**M1 (storage):** Reload preserves all data. Export downloads a valid JSON file that
re-imports to an identical state. Corrupt/blank storage loads defaults without a crash.
Bumping version without a migration branch is impossible by construction (single
`migrate()` gate).

**M2 (calculator):** Entering price=30000, down=4000, APR=6.49, term=72, tax=7% yields a
monthly payment matching a hand-computed amortization to the cent. Term strip shows
60/72/84. Lump-sum of $5,000 after month 12 reduces payoff and reports interest saved.
r=0 (0% APR) gives price/term with no NaN.

**M3 (dashboard):** Add two dealers with different fee ledgers; the lower OTD gets the
"Lowest OTD" badge and its payment tracks the global financing inputs. Editing APR
updates every card's payment live. Deleting a dealer removes its card and updates badges.

**M4 (templates):** Selecting a dealer fills `{dealer}/{contact}/{vehicle}`;
`{competing_OTD}` shows the lowest OTD among the *other* dealers. Copy places the merged
text on the clipboard; "Open in email" launches a prefilled mailto.

**M5 (fees):** Searching "efiling" or "electronic" surfaces the e-filing entry with its
"fake" chip and the exact challenge sentence.

**M6 (playbook/guide):** Playbook renders 7 ordered steps that deep-link to sections.
Red-flag ids match the dashboard tactics selector. Info-sharing table renders 4 stages.

**All milestones:** usable one-handed on a 375px-wide viewport; no horizontal page
scroll; money shown with tabular numerals.
