# CarBuddy

**Email-only, out-the-door car buying.** A calm, private toolkit that inverts the four
things dealers rely on: it lets you negotiate *many dealers at once*, on *out-the-door
price only*, *in writing*, with *every fee decoded*.

Battle-tested during a real 2026 multi-dealer purchase run (Jacksonville, FL — 12+
dealers, email-only, credit-union pre-approval, OTD-only comparison).

## What's inside

- **👋 Onboarding** — a splash + swipeable "how it works" intro that collects your
  financing details once, then drops you on Home. Replayable from the menu.
- **🏠 Home** — your dashboard: playbook progress with the next step, **Your Offers**
  (dealers with real OTD quotes) and **Your Saved Cars** (cars you're eyeing — they
  graduate to Offers when a price comes in), plus quick add/import/find actions.
- **🧭 Playbook** — the 7-step process as a checkable timeline, each step linking to
  the right tool.
- **🚗 Find a car** — enter the exact make/model/trim + ZIP/radius/max mileage/price and
  open prefilled searches on Google, Cars.com, Autotrader, TrueCar, Edmunds, and CarMax.
  Your search stays in your browser until you click through to a marketplace.
- **📋 Dealer dashboard** — itemized OTD ledger per dealer, fees tagged
  Fixed / Negotiable / Fake, live monthly payment, lowest-OTD & lowest-payment
  highlighting, notes + tactics log. **Import a quote or listing** — paste a
  listing URL (the car is pulled from it), or drop in a photo, PDF, email, or
  `.txt`/`.csv`/`.json`, and the dealer/vehicle/price/fees/mileage are prefilled,
  read entirely on-device (OCR for photos & scanned PDFs; nothing is uploaded).
- **🧮 Payment calculator** — amortization, 60/72/84 term comparison, and a lump-sum
  payoff modeler (the "sell the old car later" scenario).
- **✉️ Email templates** — 8 negotiation emails with merge fields auto-filled from your
  dashboard, plus a "why it works" note on each. Copy or open in your mail app.
- **💬 Reply helper** — paste a dealer's response on their card and CarBuddy flags the
  tactics it spots and hands you a ready-to-send reply (the right template, pre-filled),
  so answering is one paste and one click.
- **🔍 Fee decoder** — 17-entry glossary: what each fee is, the honest range, whether
  it's negotiable, and the exact sentence to send back.
- **🚩 Field guide** — 12 dealer tactics with counter-moves, and a stage-by-stage
  guide to what personal info is safe to share (so no premature credit pulls).

## Privacy

Everything lives in your browser's `localStorage` (key `carledger_v1`). There is no
server, no account, and nothing is ever uploaded. Back up or move between devices with
the JSON export/import on the **Data** tab.

## Tech

Vanilla HTML/CSS/JS. No build step, no framework, no dependencies. Seed content
(templates, glossary, red flags, playbook) lives in `data/content.js` so copy can be
edited without touching logic.

```
index.html        app shell + hamburger nav
styles.css        calm/warm design system, mobile-first
app.js            storage, finance math, all rendering
parse.js          heuristic quote-text → dealer-fields parser
ocr.js            on-demand photo/PDF text extraction (lazy-loads vendor libs)
data/content.js   seed content (editable copy)
vendor/           pdf.js + Tesseract.js, vendored & loaded only on photo/PDF import
docs/             BRIEF · PLAN · SPEC · DECISIONS (the build methodology)
```

## Run it

Open `index.html` in a browser, or serve the folder statically:

```
python3 -m http.server
```

## Deploy (GitHub Pages)

Enable Pages for this repo with the source set to this branch's root. The site is fully
static; the `docs/` markdown is ignored by the app.

## Docs

The product was built through an explicit Plan → Spec → Build loop:
`docs/BRIEF.md` (intent) → `docs/PLAN.md` (order) → `docs/SPEC.md` (the source of truth,
including formulas and acceptance criteria) → `docs/DECISIONS.md` (running log of choices).
