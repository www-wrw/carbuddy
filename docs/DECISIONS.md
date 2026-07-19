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

## D15 — Reply helper: paste a dealer's message, get a suggested response
Requested: a place to hold dealers' responses and see how to reply, with minimal effort.
Since nothing leaves the browser (no LLM API), the advisor is heuristic, not generative:
- `advise.js` `suggestReply(message, {hasLowerCompeting})` scans the dealer's message for
  intent/tactic signals (phone push, come-in, name-a-number/monthly-payment anchoring,
  fee itemization, "only good today", refusing to put it in writing, agreement, or a
  given OTD) and returns the best-fit template id + detected red-flag ids + a one-line
  reason. Priority order resolves multi-signal messages (holding the email boundary wins
  over everything).
- Per dealer card: a collapsible "Dealer replied?" box with a `lastReply` textarea
  (persisted). On input it renders the detected tactics (with their counter-moves from
  the red-flags list) and a ready-to-send reply — the mapped template pre-filled with the
  dealer's merge fields (incl. competing OTD) — plus Copy / Open-in-email and "why it
  works". `lastReply` is an additive field, default-empty for existing dealers.
This reuses the existing template library + red-flags content, so the whole loop
(their message → what to send back) is one paste and one click.

## D16 — App-flow restructure from the user's UI sketch (2026-07-19)
The user sketched a new flow (notebook wireframes) and confirmed the interpretation
via four decisions: Saved Cars = cars being eyed (no price) vs. Offers = real quotes,
derived from one underlying dealer record (graduates automatically when a price
arrives); Home becomes a dashboard with the playbook as a progress widget + its own
page; full onboarding as sketched; add/import become modals with a per-dealer detail
view. Implementation:
- **Onboarding overlay** (first run, skippable, replayable via menu "Intro & setup"):
  splash → 4 swipeable how-it-works cards (scroll-snap carousel, dots) → financing
  details + first name → Home. Sets `ui.onboarded` (additive field).
- **Home** (`#home`, new default): greeting, tappable playbook progress card with
  next-step hint, quick actions (Add / Import / Find), Your Offers and Your Saved Cars
  as compact cards with lowest-OTD/payment badges.
- **Playbook** (`#playbook`) is its own page: the checkable timeline, minus the old hero
  (its content moved into onboarding).
- **Compare dealers** (`#dashboard`): shared financing + compact cards (offers first,
  saved cars grouped below). Financing edits re-render only the list, preserving focus.
- **Dealer detail** (`#dealer/<id>`): the full editor (fields, fee ledger, reply
  helper) with a back bar. All editing lives here now.
- **Modals**: Add a dealer (basics only → saves → opens detail) and Import a quote
  (same importer, now modal; parsed imports land directly on the new dealer's detail).
- **Find a car** gains "Save this car to my list" → creates a Saved Car and opens it.
- Test suite rewritten for the new flow (64 checks) + OCR suite updated (15 checks).

## D17 — Bug fixes + second sketch page (head-to-head, guide hub, insurance)
Bugs from device testing:
- **Carousel dots drifted** (wrong dot lit on later cards): index assumed full-width
  cards; now computed from actual card centers vs. viewport center.
- **Delete dealer did nothing** in the in-app browser: `window.confirm()` is silently
  suppressed in some webviews. Replaced with an in-app confirm modal (`confirmAction`),
  also used for Clear-all-data.
- **CarMax link imported an empty card**: aggregator listing URLs are opaque IDs. A
  bare URL that yields no car info no longer silently adds; the import modal explains
  (paste the page text for car/price/mileage) and offers "Add with just the link".
Second notebook page:
- **Head-to-head compare** on the Compare screen: pick two cars → side-by-side
  numbers (mileage, sale price, fees, junk-fee total, tax, OTD, monthly, interest over
  the term) with the winning cell checked, plus per-car research links (reviews /
  owner threads / known issues — the "netizen thoughts" ask, served as curated
  searches since fetching reviews would need a backend) and each car's notes, ending
  in a plain-language verdict. Defaults to the two lowest-OTD offers.
- **Field Guide is a tile hub**: Red flags · Safe to share · Fee decoder (link) ·
  **Car insurance** (new 7-step guide to shopping coverage, incl. GAP-not-from-dealer)
  · **Full playbook** (the method in prose — per the note "full playbook, not the
  checklist"; the checklist stays on its own page for progress tracking).

## D18 — Bottom tab bar returns; menu slimmed; compact header off Home
Per user feedback after using the guide hub:
- **Bottom tab bar** (the user asked for one with "the playbook checklist, active OTD
  pricing, your financing info and preferred cars"): Home 🏠 · Playbook ✅ (checklist)
  · OTD 🏷️ (`#dashboard`, now offers-only, renamed "OTD pricing") · Financing 💵
  (`#calculator`, retitled "Your financing") · Cars 🚗 (new `#cars` section listing
  saved/preferred cars with Find/Add/Import actions). The dealer detail view highlights
  the OTD tab. D8's earlier "no bottom nav" choice is superseded — with more surface
  area, the four working screens deserve one-tap access; the drawer remains for the rest.
- **Menu slimmed** to Home · Find a car · Emails · Field guide · Your data · Intro &
  setup (Fee decoder/Playbook/Compare/Calculator now reachable via the field-guide hub
  and the tab bar).
- **Compact header** everywhere except Home: inner pages (e.g. Field guide) show only
  the small wordmark + hamburger; the tagline and privacy line stay on Home, which
  remains the branded surface.

## D19 — Frosted-glass restyle (warm glassmorphism)
User shared reference shots (modern health-app UI + frosted/clear/blur comparison) and
asked for "more modern with frosted buttons but still warm." Implementation, CSS-only:
- Warm ambient glow: fixed radial-gradient layer (peach/sage/apricot) behind the page
  and onboarding, so translucent surfaces have something to frost over.
- Frosted chrome via `backdrop-filter`: topbar, drawer, modals, scrims (light blur),
  toast, hamburger, and secondary buttons (now pill-shaped, translucent white).
  Primary buttons stay solid sage for contrast, now with a soft colored shadow.
- Bottom nav became a floating frosted pill (detached, rounded-full, active tab on a
  white pill) matching the reference.
- Cards/inputs switched to translucent surfaces with light glass edges
  (`--glass-edge`), radii bumped (20/13), shadows softened. `backdrop-filter` is
  deliberately NOT applied to every card — long dealer lists would jank on low-end
  phones; translucency over the fixed glow gives the effect at no per-card cost.
- Palette unchanged (warm neutrals + sage); soft tints converted to rgba so they sit
  on glass.

---

## Open questions still parked for the human
- Custom domain later? (D2 chose github.io subpath for now.)
- Any monetization in v2? (D4 says no for v1.)
- Additional state tax/registration presets beyond the seed set — add as users request.
- OCR language is English only (D10). Add more tessdata files if non-English quotes matter.
