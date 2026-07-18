# DECISIONS — running log of choices + open questions

Format: each entry is a decision, its rationale, and (where relevant) the SPEC section it affects.
Per the loop rules: any deviation from SPEC.md requires an entry here *before* the code change.

---

## D1 — Autonomous execution of the three-phase loop (2026-07-18)
The brief specifies Phase 1 (PLAN) → checkpoint → Phase 2 (SPEC) → checkpoint →
Phase 3 (BUILD, looped) with a human review between each. This build ran as a single
autonomous Claude Code session with no live human in the loop. To honor the *intent*
of the checkpoints (deliberate, reviewable decisions) while still shipping, the session:
- Produced PLAN.md and SPEC.md as written artifacts before any code.
- Answered the brief's open questions using the brief's own stated recommendations
  (logged below as D2–D4) rather than blocking.
- Built the full MVP (features A–D) plus supporting content (E/F/G) in one pass, since
  the stack is vanilla/no-build and every milestone is small.
The human can still review each artifact and file issues; the phase structure is
preserved in the repo even though the checkpoints ran unattended.

## D2 — Name & domain: "CarBuddy" (Open Question §5, resolved)
Matches the existing repo/domain (`carbuddy`), keeps deployment a simple github.io
subpath: `https://www-wrw.github.io/carbuddy/`. Product copy leads with the method
("email-only, out-the-door") so the name stays friendly while the positioning owns
the method. No custom domain for v1.

## D3 — Audience framing: the method IS the product (Open Question §5, resolved)
Per the brief's own recommendation. The UI leads with the email-only / OTD-only method
as *the* way to buy, not as one option among many. The Playbook is front-and-center,
not buried.

## D4 — Free portfolio tool, no monetization (Open Question §5, resolved)
No affiliate links, no lender referrals, no paid template packs in v1. This keeps the
privacy pitch honest ("nothing leaves the browser, and we have no incentive to send you
anywhere") and removes disclosure obligations from the content. Revisit in v2 if desired.

## D5 — App files live at repo root (not /src)
GitHub Pages serves the project site from the branch root. `index.html`, `app.js`,
`styles.css` at root; seed content in `data/content.js`. The `/docs` folder holds only
markdown and is ignored by the served app. This avoids a Pages "source = /docs" config
that would collide with our markdown docs.

## D6 — Tax base includes taxable fees; each fee line carries a `taxable` flag
Rather than taxing only the sale price, the schema tags each fee line `taxable: true|false`.
Tax = (salePrice + sum of taxable fees) × taxRate. Doc fees default taxable (FL treats them
as taxable); title/registration and government fees default non-taxable. Trade-in credit
reduces the taxable base (FL allows trade tax credit). This is more accurate than a flat
salePrice×rate and keeps OTD numbers comparable across dealers. See SPEC §Formulas.

## D7 — Single-page app with hash-routed tabs
One `index.html`, client-side tab switching via `location.hash`. Sections: Playbook,
Dashboard, Calculator, Templates, Fee Decoder, Guide (red flags + info-sharing), Data
(export/import). No router library. Keeps it mobile-first and framework-free.

---

## Open questions still parked for the human
- Custom domain later? (D2 chose github.io subpath for now.)
- Any monetization in v2? (D4 says no for v1.)
- Additional state tax/registration presets beyond the seed set — add as users request.
