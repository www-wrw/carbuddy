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

## D8 — Onboarding home + hamburger nav + checkable playbook timeline
Home is an onboarding screen (hero, four principles, Start CTA) with the 7-step
playbook rendered as a checkable timeline whose completion state persists in
`progress.steps` (additive field, defaulted via the migration gate). The fixed bottom
tab bar was replaced by a right-side hamburger drawer plus per-section prev/next
flow-nav, so the process reads as a guided flow rather than a set of tabs.

## D9 — "Import a quote" prefills a dealer, parsed 100% in-browser
Add-dealer now accepts an uploaded/pasted quote (email text, `.txt`, `.eml`, `.csv`,
or a CarBuddy JSON) and prefills a new dealer card. Parsing runs entirely client-side
(`parse.js`, no dependencies), upholding the locked privacy decision — the file never
leaves the browser. Heuristic extraction covers dealership, contact, vehicle
(year/make/model/trim/VIN/stock/color), sale price, and common fees (mapped to the
fixed/negotiable/fake taxonomy). **PDF and scanned-image OCR were deliberately excluded:**
reliable extraction from those would require either an external service (violates the
privacy pitch) or bundling a large library like pdf.js / Tesseract (violates the
no-dependency, no-build architecture). The UI states parsing is local and best-effort,
and every imported field lands in an editable card for the user to verify. Imported
dealers default to status "quoted".

## D10 — Photo & PDF quote import via on-device OCR (self-contained)
Resolves the D9 caveat. The human confirmed the audience sends a mix of photos and
PDFs, and chose the "on-device, self-contained" option. Implementation:
- `ocr.js` lazily loads vendored **pdf.js** (PDF text extraction + page rasterization)
  and **Tesseract.js** (OCR for photos and scanned PDFs). Text-based PDFs use pdf.js's
  text layer; if a PDF has no real text (scanned), pages are rendered to a canvas and
  OCR'd. Images always go through OCR. Output feeds the existing `parse.js` heuristics.
- Libraries are **vendored** under `/vendor` (~12 MB total) and loaded **only on first
  photo/PDF import** — zero bytes on initial page load (verified). This keeps the locked
  privacy promise: nothing is uploaded, and it works offline. No CDN, no build step —
  files were obtained with `npm pack` (jsDelivr is blocked by the sandbox proxy anyway).
- Tesseract core: both SIMD and non-SIMD LSTM cores are vendored so `getCore` auto-picks
  by browser capability; the `.wasm.js` cores embed their wasm as base64 (no sibling
  `.wasm` fetch). Language: `eng` tessdata_best (4.0.0), gz-compressed.
- Web workers require an http(s) origin, so OCR won't run from `file://`; that's fine for
  GitHub Pages. Import UI shows live progress ("Reading text… 45%") and states plainly
  that reading happens on-device. Every field still lands editable for review.
- Footprint (~12 MB of binaries in-repo) is the accepted cost of the self-contained
  choice; well under GitHub's per-file/repo limits and lazy-loaded so it never taxes
  first paint.

## D11 — GitHub Pages Jekyll fix (`.nojekyll`)
Symptom reported: "parsing feature is running into errors." All import paths (text,
photo, text-PDF, scanned-PDF) passed locally over HTTP with zero console errors, which
pointed to a deploy-time issue. GitHub Pages runs Jekyll by default, which can skip or
mangle asset folders and unusual extensions (`.wasm.js`, `.gz`) — exactly the vendored
OCR files. Added an empty `.nojekyll` at the repo root so Pages serves every file
verbatim. Also hardened `handleParse` (never throws; on failure it surfaces a friendly
message and still gives an editable card) and made the OCR failure message detect
`file://` (workers can't run there) so a local-file user gets an accurate hint.

## D12 — "Find a car" = prefilled-search launcher, not a live in-app feed
Requested: find dealerships in a ZIP with an exact make/model/trim/mileage. A true
in-app inventory feed is impossible under the locked architecture — it needs a backend
and a paid/licensed dealer-inventory data source, and no free, CORS-enabled nationwide
inventory API exists for a static site. The privacy-preserving, no-backend design that
fits: a form (year/make/model/trim/ZIP/radius/max price/max mileage/condition) that
builds **prefilled deep links** to Google, Cars.com, Autotrader, TrueCar, Edmunds, and
CarMax. Nothing is sent anywhere until the user clicks through to a marketplace (stated
in the UI). Deep-link formats are best-effort and may drift; the Google link is the
reliable anchor and always carries the full query. Inputs persist in `ui.find`.
A genuine in-app results feed remains a parked option that would require an explicit
decision to add a backend + data license (out of the current locked scope).

## D13 — Add a dealer from a listing URL (parsed client-side)
Requested: paste a listing URL and have the car parsed in as a potential dealer to
contact. Fetching the listing page to read price/mileage/dealer would require a
CORS proxy or backend — both send the page/URL off-device and break the privacy pitch —
so we don't fetch. Instead:
- `parse.js` gains `parseListingUrl(url)`, which reads only what the URL string itself
  encodes. Dealer-site listing URLs (DealerOn/Dealer.com/DealerInspire, etc.) almost
  always carry `year-make-model-trim` plus the VIN in the path; we de-slug the path,
  reuse the vehicle finder, recase model/trim, strip VIN/listing-id noise from trim, and
  read `price`/`mileage` from query params where present. Aggregator URLs (Cars.com,
  Autotrader) are often opaque IDs, so they yield less — that's expected.
- The import box now detects a URL in the pasted text: it runs the normal text parser
  AND the URL parser, merging them (paste the listing's page text alongside the URL to
  also capture price, dealer, and fees — the visible text carries those, and pasted HTML
  source is mined for JSON-LD Vehicle schema as a bonus).
- New per-dealer fields: `listingUrl` (shown as a "View listing ↗" link + editable field)
  and `vehicle.mileage`. Both additive; existing dealers default them empty on load.
- URL-only imports (no price/fees) land as status "contacted" (a lead to contact), vs.
  "quoted" when a price/fees were found.
This is also the honest answer to the deep-link limitation the user hit: marketplaces
can't reliably take trim/model in a URL, so pasting the exact listing is the accurate
path to the specific car. The Google search link remains the reliable outbound anchor.

## D14 — OCR preprocessing + parser hardening (from a real quote)
A real dealer quote photo (Atlantic Coast Honda) exposed weak spots. Fixes:
- **Image preprocessing before OCR** (`ocr.js` `preprocess()`): upscale small images to
  ~1600px, grayscale, then Otsu binarize; set Tesseract `user_defined_dpi=300` and
  `preserve_interword_spaces`. This turned garbled amounts (`$1,199` → `51,1900`) into
  accurate reads. Applied to both photos and rasterized PDF pages.
- **Strip boilerplate** (`parse.js` `stripBoilerplate()`): dealer disclaimers contain
  prose like "electronic title registration fee and $1199 dealer delivery fee" that was
  being mined as phantom title/registration fees. We now cut everything from the first
  signature/disclaimer marker before fee extraction.
- **Name capture** no longer crosses line breaks (`[ \t]+` instead of `\s+`), so
  "Salesperson: Jacobi Green\nPhone:" yields "Jacobi Green", not "Jacobi Green Phone".
- New fee specs: private tag agency / e-filing (fake), tire fee, battery fee (fixed).
Known residual limits (user reviews every field): split-logo dealership names aren't
captured; OCR may miss a character in a VIN; the flat tax-rate model differs slightly
from FL's capped county surtax, so a computed OTD can be ~$100 off the quote's own total.

---

## Open questions still parked for the human
- Custom domain later? (D2 chose github.io subpath for now.)
- Any monetization in v2? (D4 says no for v1.)
- Additional state tax/registration presets beyond the seed set — add as users request.
- OCR language is English only (D10). Add more tessdata files if non-English quotes matter.
