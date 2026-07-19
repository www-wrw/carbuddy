/* CarBuddy seed content — templates, fee glossary, red flags, playbook, info-sharing,
   and state tax presets. Edit copy here without touching app logic (app.js). */
window.CARBUDDY_CONTENT = (function () {
  "use strict";

  /* --- A. Email templates -------------------------------------------------
     Merge fields: {dealer} {contact} {vehicle} {competing_OTD} {target_OTD} {my_name} */
  const templates = [
    {
      id: "initial_otd",
      title: "Initial out-the-door request",
      category: "Open the conversation",
      body:
        "Hi {contact},\n\n" +
        "I'm ready to buy a {vehicle} this week and I'm comparing a few dealers by " +
        "total out-the-door price. Could you send me a full OTD quote in writing, " +
        "itemized, including sale price, doc fee, any dealer add-ons, tax, and " +
        "title/registration? I'd like to keep everything by email so I have it all " +
        "in one place.\n\n" +
        "If you have the exact VIN/stock number for the {vehicle}, please include it.\n\n" +
        "Thanks,\n{my_name}",
      why:
        "Anchors on out-the-door and in writing from the first message, so the dealer " +
        "can't later reframe the deal around monthly payment or verbal promises. Asking " +
        "for the itemized breakdown surfaces the junk fees up front."
    },
    {
      id: "email_only",
      title: "Hold the email-only boundary",
      category: "Set the terms",
      body:
        "Hi {contact},\n\n" +
        "Thanks for reaching out. I do all of my car shopping by email — it lets me " +
        "compare offers side by side and keep clear records. I'm not able to take " +
        "calls or come in until we've agreed on an out-the-door number in writing.\n\n" +
        "If you can send that OTD quote for the {vehicle}, I'll respond quickly.\n\n" +
        "Best,\n{my_name}",
      why:
        "The phone is the dealer's home turf — improvisation, pressure, and no paper " +
        "trail. Politely refusing calls keeps you in a medium where you control the " +
        "pace and everything is documented."
    },
    {
      id: "competing_disclose",
      title: "Competing quote — disclose the number",
      category: "Create competition",
      body:
        "Hi {contact},\n\n" +
        "I have a written out-the-door offer of {competing_OTD} on a comparable " +
        "{vehicle} from another dealer. I'd rather buy from you if you can beat it. " +
        "Can you send me your best OTD number in writing?\n\n" +
        "Thanks,\n{my_name}",
      why:
        "Sharing the number (but never the source) forces a concrete target and makes " +
        "the dealer bid against a real figure. Withholding which dealer prevents them " +
        "from colluding or calling your bluff."
    },
    {
      id: "competing_vague",
      title: "Competing quote — stay vague",
      category: "Create competition",
      body:
        "Hi {contact},\n\n" +
        "I'm getting out-the-door quotes from several dealers on the {vehicle} and " +
        "yours isn't the lowest yet. I'd like to give you a chance to sharpen your " +
        "number. What's your best OTD price in writing?\n\n" +
        "Thanks,\n{my_name}",
      why:
        "When your real competing number isn't strong, don't reveal it. Signaling that " +
        "you have better offers keeps the pressure on without handing the dealer a floor " +
        "to inch just under."
    },
    {
      id: "fee_challenge",
      title: "Challenge a junk fee",
      category: "Cut the fees",
      body:
        "Hi {contact},\n\n" +
        "Looking at the quote for the {vehicle}, a few line items stand out. The " +
        "electronic filing / dealer add-on charges aren't government fees and I'm not " +
        "willing to pay them. Please remove them or reduce the sale price by the same " +
        "amount so the out-the-door number reflects the actual car.\n\n" +
        "Can you send a revised OTD quote?\n\n" +
        "Thanks,\n{my_name}",
      why:
        "Names the fake fees specifically and gives the dealer an easy out (drop the fee " +
        "OR cut price by the same amount) — what matters is the OTD total, and this " +
        "keeps the focus there instead of arguing line by line."
    },
    {
      id: "written_confirm",
      title: "Confirm trim / VIN in writing",
      category: "Lock it down",
      body:
        "Hi {contact},\n\n" +
        "Before we go further, please confirm in writing the exact vehicle: " +
        "{vehicle}, including trim, color, VIN, and stock number, along with the " +
        "out-the-door price we discussed. I want to make sure the car I'm quoting is " +
        "the car I'm buying.\n\n" +
        "Thanks,\n{my_name}",
      why:
        "Bait-and-switch on trim or options is common. Pinning the exact VIN and OTD in " +
        "writing means the number can't quietly change when you arrive to sign."
    },
    {
      id: "walk_away",
      title: "Polite walk-away",
      category: "Lock it down",
      body:
        "Hi {contact},\n\n" +
        "Thanks for your time on the {vehicle}. Another dealer came in lower out-the-door " +
        "and I'm moving forward with them. If anything changes on your end and you can " +
        "beat {competing_OTD} out-the-door, feel free to email me — otherwise I " +
        "appreciate the help.\n\nBest,\n{my_name}",
      why:
        "A calm, no-drama exit that leaves the door open. Dealers often come back with a " +
        "better number after you walk, because a walked deal is a lost commission."
    },
    {
      id: "deposit_hold",
      title: "Deposit / hold request",
      category: "Lock it down",
      body:
        "Hi {contact},\n\n" +
        "We have a deal at {target_OTD} out-the-door on the {vehicle} (VIN as confirmed). " +
        "I can place a refundable deposit to hold it while I finalize my financing. " +
        "Please email me the deposit terms in writing, including that it's fully " +
        "refundable, and the agreed OTD price on the same message.\n\n" +
        "Thanks,\n{my_name}",
      why:
        "Ties the deposit to the written OTD in one message, and insists the deposit be " +
        "refundable — so a hold never becomes leverage to change the price later."
    }
  ];

  /* --- D. Fee glossary ---------------------------------------------------- */
  const fees = [
    { id: "doc_fee", name: "Documentation (doc) fee", category: "negotiable",
      what: "A charge for the dealer preparing paperwork. It's dealer profit, not a government fee.",
      range: "$75–$500 is defensible; some states cap it. FL and several others do not.",
      negotiable: "Sometimes. Often capped by state; where uncapped, push back or ask for an offsetting price cut.",
      say: "\"The doc fee is dealer profit, not a state fee. Either drop it or take the same amount off the sale price — I'm comparing out-the-door.\"",
      state: "FL: uncapped, often $799–$999. Many states cap it ($55–$500)." },
    { id: "efiling", name: "Electronic filing / e-filing fee", category: "fake",
      what: "A charge for electronically submitting title/registration — usually already covered by the real title fee.",
      range: "$0–$30 of actual cost, often marked up to $200–$400.",
      negotiable: "Yes — challenge it. It's frequently pure padding on top of the real title/reg fee.",
      say: "\"Electronic filing isn't a government charge. Remove it or reduce the price by the same amount.\"",
      state: "" },
    { id: "predelivery", name: "Predelivery service charge (PDI)", category: "fake",
      what: "A fee for prepping the car for delivery — work the manufacturer already reimburses the dealer for.",
      range: "$0 legitimately; commonly $300–$1,000 as padding.",
      negotiable: "Yes. This is one of the most challengeable add-ons.",
      say: "\"Predelivery prep is covered by the manufacturer. I'm not paying it on top — please remove it.\"",
      state: "FL: dealers must disclose it, but disclosure doesn't make it mandatory to accept in your OTD." },
    { id: "dealer_prep", name: "Dealer prep fee", category: "fake",
      what: "Charge for washing, fueling, and readying the car — overlaps with predelivery and destination.",
      range: "$0 legitimately; $200–$700 as padding.",
      negotiable: "Yes. Overlaps with fees you're already paying.",
      say: "\"Dealer prep overlaps with the destination charge I'm already paying. Please remove it.\"",
      state: "" },
    { id: "addon_bundle", name: "Dealer add-on bundle (protection package)", category: "fake",
      what: "Pre-installed packages — nitrogen, etching, protectants, 'appearance' or 'protection' bundles — added to the sticker.",
      range: "Cost to dealer is small; marked up $500–$2,500.",
      negotiable: "Yes. Refuse the whole bundle; you didn't order it.",
      say: "\"I didn't order any add-on packages. Please quote the car without them.\"",
      state: "" },
    { id: "nitrogen", name: "Nitrogen-filled tires", category: "fake",
      what: "Tires filled with nitrogen instead of air. Negligible real benefit for the price.",
      range: "Real value near $0; charged $100–$300.",
      negotiable: "Yes. Decline it.",
      say: "\"I don't want the nitrogen package — please remove it.\"",
      state: "" },
    { id: "vin_etching", name: "VIN etching", category: "fake",
      what: "Etching the VIN on glass, sold as theft deterrence. You can do it yourself for a few dollars.",
      range: "$5–$20 DIY; charged $200–$400.",
      negotiable: "Yes. Decline it.",
      say: "\"I'll skip VIN etching — please take it off the quote.\"",
      state: "" },
    { id: "paint_fabric", name: "Paint & fabric protection", category: "fake",
      what: "Sealants/coatings sold as long-term protection; modern clear coats rarely need them.",
      range: "Low cost; charged $300–$1,500.",
      negotiable: "Yes. Decline it.",
      say: "\"No paint or fabric protection package for me, thanks — please remove it.\"",
      state: "" },
    { id: "gap", name: "GAP insurance", category: "negotiable",
      what: "Covers the gap between what you owe and the car's value if it's totaled. Sometimes useful, but dealer GAP is marked up.",
      range: "Dealer: $500–$900. Credit unions often sell it for $200–$400.",
      negotiable: "Yes, and shop it. Buy from your lender/credit union instead if you want it.",
      say: "\"I'll get GAP through my credit union if I want it. Please leave it off the quote.\"",
      state: "" },
    { id: "vsc", name: "Extended warranty (vehicle service contract)", category: "negotiable",
      what: "A service contract beyond the factory warranty. Optional, heavily marked up, and always negotiable.",
      range: "Priced $1,500–$4,000; often negotiable by 30–50%.",
      negotiable: "Yes. Never required for financing. Decide separately from the car price.",
      say: "\"I'm not adding a service contract right now. Please quote the car by itself.\"",
      state: "" },
    { id: "adm", name: "Market adjustment / ADM / addendum", category: "negotiable",
      what: "A markup above MSRP on in-demand cars ('additional dealer markup'). Pure margin.",
      range: "$0 in a normal market; $1,000–$10,000+ on hot models.",
      negotiable: "Yes — or walk. Plenty of dealers sell at or below MSRP.",
      say: "\"I won't pay over MSRP. If there's a market adjustment, I'll buy elsewhere.\"",
      state: "" },
    { id: "destination", name: "Destination / freight charge", category: "fixed",
      what: "Manufacturer's charge to ship the car to the dealer. Set by the automaker, same at every dealer.",
      range: "$900–$1,800 depending on brand/model. Printed on the Monroney sticker.",
      negotiable: "No — it's fixed by the manufacturer. But verify it matches the window sticker.",
      say: "\"I understand destination is fixed — just confirming it matches the Monroney sticker.\"",
      state: "" },
    { id: "title_fee", name: "Title fee", category: "fixed",
      what: "Government charge to transfer the vehicle title into your name.",
      range: "$15–$200 depending on state.",
      negotiable: "No — set by the state. But it should be the state amount, not padded.",
      say: "\"Please confirm the title fee matches the state's actual charge.\"",
      state: "" },
    { id: "registration", name: "Registration / tag fee", category: "fixed",
      what: "Government charge to register the vehicle and issue plates.",
      range: "$50–$700+ depending on state and vehicle.",
      negotiable: "No — set by the state.",
      say: "\"Registration is a state fee — just confirming it's the actual amount.\"",
      state: "AZ: based on the Vehicle License Tax (VLT), tied to value. Varies widely by state." },
    { id: "sales_tax", name: "Sales tax", category: "fixed",
      what: "State/local tax on the purchase. In many states, a trade-in reduces the taxable amount.",
      range: "Typically 0%–10% of the taxable base.",
      negotiable: "No — the rate is fixed. But the base can shrink with a trade-in credit.",
      say: "\"Please confirm the tax is calculated after my trade-in credit, where my state allows it.\"",
      state: "FL: 6% state + local surtax; trade-in reduces the taxable base." },
    { id: "tire_battery", name: "Tire & battery / state environmental fee", category: "fixed",
      what: "Small state-mandated disposal/recycling fees.",
      range: "$1–$25 total, typically.",
      negotiable: "No — but it should be a few dollars, not padded.",
      say: "\"Just confirming the tire/battery fee is the small state amount.\"",
      state: "" },
    { id: "advertising", name: "Advertising / regional ad fee", category: "negotiable",
      what: "A charge passing the dealer's advertising cost to you. Sometimes baked into invoice, sometimes added.",
      range: "$200–$800 when added separately.",
      negotiable: "Sometimes. If it appears as a separate add-on line, challenge it.",
      say: "\"Advertising is a cost of doing business, not my line item. Please remove it or offset the price.\"",
      state: "" }
  ];

  /* --- F. Red flags / dealer tactics -------------------------------------- */
  const redFlags = [
    { id: "phone_push", tactic: "Pushing for a phone call",
      counter: "Keep it in email. \"I do everything by email so I have clear records — happy to continue here.\"" },
    { id: "come_in", tactic: "\"Just come in and we'll talk numbers\"",
      counter: "Refuse until there's a written OTD. Your time on the lot is their leverage, not yours." },
    { id: "payment_anchor", tactic: "Anchoring on monthly payment",
      counter: "Redirect to OTD. \"Let's agree on the out-the-door price first, then I'll handle financing.\"" },
    { id: "four_square", tactic: "The four-square worksheet",
      counter: "Ignore the grid. It splits price, trade, down, and payment so each can be manipulated. Only OTD matters." },
    { id: "name_number_first", tactic: "\"What payment are you looking for?\" / name your number first",
      counter: "Don't. \"Send me your best out-the-door price and I'll compare it.\" Make them commit first." },
    { id: "spot_delivery", tactic: "Spot delivery / yo-yo financing",
      counter: "Don't drive off until financing is fully finalized. \"Call me back to sign\" is a re-negotiation trap." },
    { id: "fee_obfuscation", tactic: "Burying junk fees in the total",
      counter: "Demand the itemized OTD. Decode each line with the Fee Decoder; challenge the fakes." },
    { id: "today_only", tactic: "\"This price is only good today\"",
      counter: "Call the bluff. A real deal is still real tomorrow. Artificial urgency is a pressure tactic." },
    { id: "trade_lowball", tactic: "Lowballing your trade inside a \"great deal\"",
      counter: "Negotiate the purchase and the trade separately. Get a written CarMax/Carvana offer as your floor." },
    { id: "no_written_otd", tactic: "Refusing to put the OTD in writing",
      counter: "Walk. If they won't commit the number in writing, the number isn't real." },
    { id: "payment_packing", tactic: "Payment packing (padding add-ons into the payment)",
      counter: "Compare OTD, not payment. A \"$12/mo\" add-on is hundreds of dollars hidden in the term." },
    { id: "credit_before_price", tactic: "Running your credit before a price is agreed",
      counter: "Don't give SSN/DL until you've agreed on OTD in writing. Use your own pre-approval to shop." }
  ];

  /* --- E. Playbook steps -------------------------------------------------- */
  const playbook = [
    { n: 1, title: "Get pre-approved first", link: "calculator",
      body: "Secure financing from your bank or credit union before you talk to any dealer. A pre-approval is your walking-around money and your APR benchmark — it turns the dealer's finance office from a trap into just another quote to beat." },
    { n: 2, title: "Shortlist by your priorities", link: "find",
      body: "Decide the year/make/model/trim you actually want, and the must-haves. A tight shortlist keeps you from being upsold into a different car than the one you researched. Use Find a car to see what's in stock near you." },
    { n: 3, title: "Send the email blast", link: "templates",
      body: "Email every dealer within range the same initial OTD request. Many at once, in writing — this is the core inversion. Use the 'Initial out-the-door request' template." },
    { n: 4, title: "Collect quotes into the ledger", link: "dashboard",
      body: "Log every dealer's itemized quote on the dashboard. Decode each fee. The dashboard highlights the lowest OTD and lowest payment automatically." },
    { n: 5, title: "Run the competitive bidding round", link: "templates",
      body: "Share your lowest OTD number with the other dealers — never the source — and invite them to beat it. Repeat. The 'Competing quote' templates do this cleanly." },
    { n: 6, title: "Verify everything in writing", link: "templates",
      body: "Before you commit, confirm the exact VIN, trim, and OTD in writing. Use the 'Confirm trim / VIN' template. The number you sign must equal the number you were quoted." },
    { n: 7, title: "Close", link: "guide",
      body: "Place a refundable deposit tied to the written OTD, finalize your own financing, and sign only what matches. Share SSN/DL only now, after the price is locked. See the Info-Sharing guide." }
  ];

  /* --- G. Info-sharing guide ---------------------------------------------- */
  const infoSharing = [
    { stage: "Initial inquiry", safe: "Name, email, the vehicle you want.",
      hold: "Phone number (optional — invites calls), address, any ID.",
      note: "You need almost nothing to request an OTD quote." },
    { stage: "Quote stage", safe: "ZIP code (for accurate tax/registration), general timeframe.",
      hold: "SSN, driver's license, date of birth, income details.",
      note: "ZIP is enough to compute an accurate out-the-door number. Nothing that enables a credit pull." },
    { stage: "Price agreed (in writing)", safe: "Confirmation you'll proceed, refundable deposit.",
      hold: "SSN/DL still not needed unless you're using dealer financing you've chosen to compare.",
      note: "A deposit should be refundable and tied to the written OTD." },
    { stage: "Paperwork / signing", safe: "SSN, driver's license, date of birth, proof of insurance.",
      hold: "Nothing further — and only after the OTD and VIN are locked in writing.",
      note: "This is the only stage where identity documents are appropriate." }
  ];

  /* --- State tax presets (approximate combined rates for estimation) ------ */
  const states = [
    { code: "", name: "Select state…", rate: 0 },
    { code: "FL", name: "Florida", rate: 0.07 },
    { code: "GA", name: "Georgia", rate: 0.07 },
    { code: "TX", name: "Texas", rate: 0.0625 },
    { code: "CA", name: "California", rate: 0.0825 },
    { code: "NY", name: "New York", rate: 0.08 },
    { code: "NC", name: "North Carolina", rate: 0.03 },
    { code: "AZ", name: "Arizona", rate: 0.086 },
    { code: "WA", name: "Washington", rate: 0.098 },
    { code: "OH", name: "Ohio", rate: 0.0725 },
    { code: "custom", name: "Custom rate…", rate: null }
  ];

  /* --- Onboarding intro cards (the swipeable "what it does" carousel) --- */
  const onboarding = [
    { icon: "📨", title: "Contact many dealers at once",
      body: "Email every dealer in range the same request — instead of negotiating one at a time on their turf. They compete for you." },
    { icon: "🏷️", title: "Compare out-the-door only",
      body: "One number that includes every fee and tax. Never monthly payment — that’s where the games hide." },
    { icon: "✍️", title: "Keep everything in writing",
      body: "No phone calls, no “just come in.” Email means a paper trail and a pace you control." },
    { icon: "🔍", title: "Decode every fee",
      body: "See which line items are real, which are negotiable, and which are pure junk — with the exact words to push back." }
  ];

  return { templates, fees, redFlags, playbook, infoSharing, states, onboarding };
})();
