/* CarBuddy — app logic. Vanilla JS, no build step. All state in localStorage. */
(function () {
  "use strict";
  var C = window.CARBUDDY_CONTENT;
  var KEY = "carledger_v1";
  var SCHEMA_VERSION = 1;

  /* ---------------------------------------------------------------- storage */
  function defaultData() {
    return {
      version: SCHEMA_VERSION,
      financing: {
        downPayment: 0, apr: 7, term: 72, state: "",
        taxRate: 0, rollInFees: true, tradeInValue: 0
      },
      dealers: [],
      progress: { steps: {} },  // playbook checklist: { [stepNumber]: true }
      ui: {
        activeSection: "home", myName: "", targetOtd: "", tplDealer: "", onboarded: false,
        find: { year: "", make: "", model: "", trim: "", zip: "", radius: "50", priceMax: "", mileageMax: "", condition: "all" }
      }
    };
  }
  function defaultFind() {
    return { year: "", make: "", model: "", trim: "", zip: "", radius: "50", priceMax: "", mileageMax: "", condition: "all" };
  }

  // Migration gate. Version is NEVER bumped without adding a branch here.
  function migrate(blob) {
    if (!blob || typeof blob !== "object") return defaultData();
    var v = blob.version;
    if (v === 1) return blob;                 // current schema, no migration needed
    if (v == null) { blob.version = 1; return blob; } // pre-versioned → treat as v1
    console.warn("CarBuddy: unknown schema version " + v + " — starting fresh to avoid corruption.");
    return defaultData();
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultData();
      var blob = migrate(JSON.parse(raw));
      // fill any missing top-level keys defensively
      var d = defaultData();
      blob.financing = Object.assign(d.financing, blob.financing || {});
      blob.ui = Object.assign(d.ui, blob.ui || {});
      blob.ui.find = Object.assign(defaultFind(), blob.ui.find || {});
      blob.progress = Object.assign(d.progress, blob.progress || {});
      if (!blob.progress.steps || typeof blob.progress.steps !== "object") blob.progress.steps = {};
      if (!Array.isArray(blob.dealers)) blob.dealers = [];
      return blob;
    } catch (e) {
      console.warn("CarBuddy: could not read saved data, starting fresh.", e);
      return defaultData();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast("Couldn't save — storage may be full."); }
  }

  var data = load();

  /* ---------------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function uid(p) { return (p || "id_") + Math.random().toString(36).slice(2, 8); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function clamp0(n) { return n < 0 ? 0 : n; }

  function money(n, dec) {
    if (n == null || !isFinite(n)) return "—";
    return "$" + Number(n).toLocaleString("en-US", {
      minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0
    });
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1900);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast("Copied to clipboard"); },
        function () { fallbackCopy(text); }
      );
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied to clipboard"); }
    catch (e) { toast("Copy failed — select and copy manually"); }
    document.body.removeChild(ta);
  }

  var STATUS = [
    ["contacted", "Contacted"], ["quoted", "Quoted"], ["negotiating", "Negotiating"],
    ["pending", "Pending"], ["declined", "Declined"], ["crossed_off", "Crossed off"]
  ];
  function statusLabel(v) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i][0] === v) return STATUS[i][1]; return v; }

  /* ------------------------------------------------------------ finance math */
  function monthlyPayment(financed, apr, term) {
    financed = clamp0(financed);
    if (term <= 0) return 0;
    var r = (apr / 100) / 12;
    if (r === 0) return financed / term;
    var f = Math.pow(1 + r, term);
    return financed * r * f / (f - 1);
  }

  function dealerCalc(d) {
    var f = data.financing;
    var fees = (d.quote.fees || []);
    var feesTotal = 0, taxableFees = 0;
    for (var i = 0; i < fees.length; i++) {
      var amt = num(fees[i].amount);
      feesTotal += amt;
      if (fees[i].taxable) taxableFees += amt;
    }
    var salePrice = num(d.quote.salePrice);
    var hasPrice = salePrice > 0;
    var taxableBase = clamp0(salePrice + taxableFees - num(f.tradeInValue));
    var tax = Math.round(taxableBase * num(f.taxRate) * 100) / 100;
    var otd = salePrice + feesTotal + tax;
    var financed = f.rollInFees
      ? clamp0(otd - num(f.downPayment) - num(f.tradeInValue))
      : clamp0(salePrice + tax - num(f.downPayment) - num(f.tradeInValue));
    var monthly = monthlyPayment(financed, num(f.apr), Math.round(num(f.term)));
    return { hasPrice: hasPrice, feesTotal: feesTotal, tax: tax, taxableBase: taxableBase,
             otd: otd, financed: financed, monthly: monthly };
  }

  // month-by-month amortization for the lump-sum modeler
  function amortizeWithLump(financed, apr, term, extra, afterMonth) {
    var r = (apr / 100) / 12;
    var M = monthlyPayment(financed, apr, term);
    function run(lump, at) {
      var bal = clamp0(financed), interest = 0, months = 0;
      for (var m = 1; bal > 0.005 && m <= 1200; m++) {
        var iPart = bal * r; interest += iPart;
        var pPart = M - iPart; if (pPart > bal) pPart = bal;
        bal -= pPart;
        if (lump && m === at) bal = clamp0(bal - lump);
        months = m;
        if (bal <= 0.005) break;
      }
      return { months: months, interest: interest };
    }
    var base = run(0, 0);
    var withL = run(clamp0(extra), Math.max(1, Math.round(afterMonth)));
    return {
      baseMonths: base.months, newMonths: withL.months,
      monthsSaved: base.months - withL.months,
      interestSaved: base.interest - withL.interest
    };
  }

  /* --------------------------------------------------------- shared controls */
  function financingControls(prefix) {
    var f = data.financing;
    var ratePct = (num(f.taxRate) * 100);
    var rateStr = ratePct ? String(Math.round(ratePct * 1000) / 1000) : "";
    var termOpts = [36, 48, 60, 66, 72, 84].map(function (t) {
      return '<option value="' + t + '"' + (Math.round(num(f.term)) === t ? " selected" : "") + ">" + t + "</option>";
    }).join("");
    var stateOpts = C.states.map(function (s) {
      return '<option value="' + esc(s.code) + '"' + (f.state === s.code ? " selected" : "") + ">" + esc(s.name) + "</option>";
    }).join("");
    return '' +
      '<div class="card" data-fin-scope="' + prefix + '">' +
        '<h3>Shared financing</h3>' +
        '<p class="hint">These drive every dealer’s monthly payment and the calculator.</p>' +
        '<div class="grid-2">' +
          field("Down payment", '<input inputmode="decimal" data-fin="downPayment" value="' + attrNum(f.downPayment) + '" placeholder="0">') +
          field("Trade-in value", '<input inputmode="decimal" data-fin="tradeInValue" value="' + attrNum(f.tradeInValue) + '" placeholder="0">') +
          field("APR %", '<input inputmode="decimal" data-fin="apr" value="' + attrNum(f.apr) + '" placeholder="6.9">') +
          field("Term (months)", '<select data-fin="term">' + termOpts + "</select>") +
          field("State", '<select data-fin="state">' + stateOpts + "</select>") +
          field("Tax rate %", '<input inputmode="decimal" data-fin="taxRatePct" value="' + esc(rateStr) + '" placeholder="7">') +
        "</div>" +
        '<div class="inline-check"><input type="checkbox" id="' + prefix + '-rollin" data-fin="rollInFees"' + (f.rollInFees ? " checked" : "") + '>' +
          '<label for="' + prefix + '-rollin">Roll fees &amp; tax into the loan</label></div>' +
      "</div>";
  }
  function field(label, control) { return '<div class="field"><label>' + label + "</label>" + control + "</div>"; }
  function attrNum(v) { return (v === 0 || v === "" || v == null) ? "" : esc(v); }

  // wire a financing-controls block inside a container; onChange re-renders computed views
  function wireFinancing(container, recompute) {
    container.addEventListener("input", function (e) {
      var t = e.target; var key = t.getAttribute("data-fin"); if (!key) return;
      if (key === "state") return; // handled on 'change'
      applyFin(key, t);
      recompute();
    });
    container.addEventListener("change", function (e) {
      var t = e.target; var key = t.getAttribute("data-fin"); if (!key) return;
      if (key === "state") {
        var code = t.value; data.financing.state = code;
        var preset = null;
        for (var i = 0; i < C.states.length; i++) if (C.states[i].code === code) preset = C.states[i].rate;
        if (preset != null) data.financing.taxRate = preset; // custom (null) leaves rate as-is
        save();
        // re-render so the tax-rate field reflects the preset (overlay re-renders itself)
        if (container.id === "onboarding") renderOnboarding();
        else renderActive();
        return;
      }
      applyFin(key, t); recompute();
    });
  }
  function applyFin(key, t) {
    var f = data.financing;
    if (key === "rollInFees") f.rollInFees = t.checked;
    else if (key === "term") f.term = Math.round(num(t.value)) || 1;
    else if (key === "taxRatePct") f.taxRate = clamp0(num(t.value)) / 100;
    else f[key] = clamp0(num(t.value));
    save();
  }

  /* ============================================================ PLAYBOOK (E) */
  function renderPlaybook() {
    var doneMap = (data.progress && data.progress.steps) || {};
    var total = C.playbook.length;
    var done = 0; for (var k in doneMap) if (doneMap[k]) done++;
    var pct = total ? Math.round(done / total * 100) : 0;
    var allDone = done === total && total > 0;

    var steps = C.playbook.map(function (s) {
      var isDone = !!doneMap[s.n];
      return '<div class="tl-step' + (isDone ? " done" : "") + '">' +
        '<button class="tl-node" data-toggle="' + s.n + '" role="checkbox" aria-checked="' +
          (isDone ? "true" : "false") + '" aria-label="Mark “' + esc(s.title) + '” ' +
          (isDone ? "not done" : "done") + '">' + (isDone ? "✓" : s.n) + "</button>" +
        '<div class="tl-card">' +
          '<div class="tl-title-row"><span class="onb-title">' + esc(s.title) + "</span>" +
            (isDone ? '<span class="pill done-pill">Done</span>' : "") + "</div>" +
          '<div class="onb-desc">' + esc(s.body) + "</div>" +
          '<a class="onb-go" href="#' + s.link + '">' + linkName(s.link) + " →</a>" +
        "</div></div>";
    }).join("");

    $("#section-playbook").innerHTML =
      "<h1>The playbook</h1>" +
      '<p class="section-intro">The 7-step process, in order. Tick each step as you finish it — ' +
      "your progress is saved on this device and tracked on Home.</p>" +
      '<div class="progress-wrap">' +
        '<div class="progress-head"><h2 class="onb-h" style="margin:0">Your progress</h2>' +
          '<span class="progress-count num">' + done + " / " + total + "</span></div>" +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        (allDone
          ? '<p class="progress-msg">🎉 Every step done — go get your car.</p>'
          : "") +
        (done > 0 ? '<button class="btn btn-sm btn-ghost" data-reset-progress>Reset checklist</button>' : "") +
      "</div>" +
      '<div class="tl">' + steps + "</div>" + flowNav("playbook");
  }

  /* ================================================================== HOME */
  function playbookStats() {
    var doneMap = (data.progress && data.progress.steps) || {};
    var total = C.playbook.length, done = 0;
    for (var k in doneMap) if (doneMap[k]) done++;
    var next = null;
    for (var i = 0; i < C.playbook.length; i++) {
      if (!doneMap[C.playbook[i].n]) { next = C.playbook[i]; break; }
    }
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, next: next };
  }
  function isOffer(d) { return dealerCalc(d).hasPrice; }

  // compact card used on Home and the Compare screen — tap to open the detail view
  function compactCard(d, calcs) {
    var v = d.vehicle, c = calcs || dealerCalc(d);
    var vehLine = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || d.dealership || "New car";
    var sub = [d.dealership && vehLine !== d.dealership ? d.dealership : "", v.mileage ? Number(String(v.mileage).replace(/[^0-9]/g, "")).toLocaleString("en-US") + " mi" : ""]
      .filter(Boolean).join(" · ");
    return '<a class="card mini-card" href="#dealer/' + d.id + '">' +
      '<div class="mini-main">' +
        '<div class="mini-title">' + esc(vehLine) + "</div>" +
        (sub ? '<div class="mini-sub">' + esc(sub) + "</div>" : "") +
        '<div class="mini-badges" data-mini-badges="' + d.id + '"></div>' +
      "</div>" +
      '<div class="mini-side">' +
        '<span class="pill status-' + d.status + '">' + statusLabel(d.status) + "</span>" +
        (c.hasPrice
          ? '<div class="mini-otd money">' + money(c.otd, 0) + '</div><div class="mini-pay money">' + money(c.monthly, 2) + "/mo</div>"
          : '<div class="mini-otd hint">no quote yet</div>') +
        '<span class="mini-go">›</span>' +
      "</div>" +
    "</a>";
  }

  function renderHome() {
    var s = $("#section-home");
    var ps = playbookStats();
    var offers = data.dealers.filter(isOffer);
    var saved = data.dealers.filter(function (d) { return !isOffer(d); });
    var name = (data.ui.myName || "").split(" ")[0];

    var offersHtml = offers.length
      ? offers.map(function (d) { return compactCard(d); }).join("")
      : '<div class="empty-line">No written quotes yet. Send the email blast and log what comes back.</div>';
    var savedHtml = saved.length
      ? saved.map(function (d) { return compactCard(d); }).join("")
      : '<div class="empty-line">Nothing saved yet. Find a car near you or paste a listing link.</div>';

    s.innerHTML =
      '<h1>' + (name ? "Hi " + esc(name) + " 👋" : "Your car hunt") + "</h1>" +
      '<p class="section-intro">Everything in one place: where you are in the process, the cars you’re ' +
      "watching, and the offers on the table.</p>" +

      '<a class="card progress-card" href="#playbook">' +
        '<div class="progress-head"><h3 style="margin:0">🧭 Playbook</h3>' +
          '<span class="progress-count num">' + ps.done + " / " + ps.total + "</span></div>" +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + ps.pct + '%"></div></div>' +
        (ps.next
          ? '<div class="hint" style="margin-top:8px">Next up: <b>Step ' + ps.next.n + " — " + esc(ps.next.title) + "</b> ›</div>"
          : '<div class="progress-msg" style="margin-top:8px">🎉 Every step done — go get your car.</div>') +
      "</a>" +

      '<div class="btn-row" style="margin:4px 0 18px">' +
        '<button class="btn btn-sm" data-home-add>+ Add dealer</button>' +
        '<button class="btn btn-sm" data-home-import>⬆ Import quote</button>' +
        '<a class="btn btn-sm" href="#find">🔍 Find a car</a>' +
      "</div>" +

      '<div class="home-sec-head"><h2>Your offers</h2>' +
        (offers.length ? '<a class="btn btn-sm btn-ghost" href="#dashboard">Compare all →</a>' : "") + "</div>" +
      '<p class="hint" style="margin-bottom:10px">Dealers who’ve given you a real out-the-door number.</p>' +
      '<div class="mini-list">' + offersHtml + "</div>" +

      '<div class="home-sec-head" style="margin-top:22px"><h2>Your saved cars</h2></div>' +
      '<p class="hint" style="margin-bottom:10px">Cars you’re eyeing — no quote yet. They move up once a price comes in.</p>' +
      '<div class="mini-list">' + savedHtml + "</div>" +
      flowNav("home");

    homeBadges(offers);
    var ab = s.querySelector("[data-home-add]"), ib = s.querySelector("[data-home-import]");
    if (ab) ab.addEventListener("click", openAddDealerModal);
    if (ib) ib.addEventListener("click", openImportModal);
  }

  function homeBadges(offers) {
    if (!offers.length) return;
    var minOtd = Infinity, minPay = Infinity;
    var calcs = {};
    offers.forEach(function (d) {
      var c = dealerCalc(d); calcs[d.id] = c;
      if (c.otd < minOtd) minOtd = c.otd;
      if (c.monthly < minPay) minPay = c.monthly;
    });
    offers.forEach(function (d) {
      var el = document.querySelector('[data-mini-badges="' + d.id + '"]');
      if (!el) return;
      var h = "";
      if (calcs[d.id].otd === minOtd) h += '<span class="badge">★ Lowest OTD</span>';
      if (calcs[d.id].monthly === minPay) h += '<span class="badge badge-pay">Lowest payment</span>';
      el.innerHTML = h;
    });
  }
  function linkName(id) {
    return { home: "Home", playbook: "Playbook", find: "Find a car", cars: "Your Cars",
             dashboard: "OTD Pricing", calculator: "Financing", templates: "Emails",
             fees: "Fee Decoder", guide: "Field Guide", data: "Your Data" }[id] || id;
  }

  // linear prev/next footer for the sections that aren't on the tab bar
  var FLOW = ["home", "playbook", "find", "cars", "dashboard", "calculator", "templates", "fees", "guide", "data"];
  function flowNav(id) {
    var i = FLOW.indexOf(id);
    var prev = i > 0 ? FLOW[i - 1] : null;
    var next = i < FLOW.length - 1 ? FLOW[i + 1] : null;
    var left = prev ? '<a class="btn btn-sm" href="#' + prev + '">← ' + linkName(prev) + "</a>" : "<span></span>";
    var right = next ? '<a class="btn btn-sm btn-primary" href="#' + next + '">' + linkName(next) + " →</a>" : "<span></span>";
    return '<div class="flow-nav">' + left + right + "</div>";
  }

  /* ============================================================ FIND A CAR */
  function findSlug(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function findCode(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, ""); }
  function findInt(v) { var n = parseInt(String(v).replace(/[^0-9]/g, ""), 10); return isFinite(n) ? n : 0; }

  function buildFindLinks(q) {
    var mk = (q.make || "").trim(), md = (q.model || "").trim(), tr = (q.trim || "").trim();
    var yr = (q.year || "").trim(), zip = (q.zip || "").trim();
    var r = findInt(q.radius) || 50, pMax = findInt(q.priceMax), mMax = findInt(q.mileageMax);
    var cond = q.condition || "all";
    var mkS = findSlug(mk), mdS = findSlug(md), mkC = findCode(mk), mdC = findCode(md);
    var e = encodeURIComponent, links = [];

    var gq = [yr, mk, md, tr, "for sale", zip ? "near " + zip : "",
      pMax ? "under $" + pMax : "", mMax ? "under " + mMax + " miles" : ""].filter(Boolean).join(" ");
    links.push({ name: "Google", url: "https://www.google.com/search?q=" + e(gq) });

    links.push({ name: "Cars.com", url: "https://www.cars.com/shopping/results/?stock_type=" +
      (cond === "new" ? "new" : cond === "used" ? "used" : "all") +
      "&makes[]=" + e(mkS) + "&models[]=" + e(mkS + "-" + mdS) + "&maximum_distance=" + r +
      (zip ? "&zip=" + e(zip) : "") + (pMax ? "&list_price_max=" + pMax : "") + (mMax ? "&mileage_max=" + mMax : "") });

    links.push({ name: "Autotrader", url: "https://www.autotrader.com/cars-for-sale/all-cars?makeCodeList=" +
      e(mkC) + "&modelCodeList=" + e(mdC) + (zip ? "&zip=" + e(zip) : "") + "&searchRadius=" + r +
      (pMax ? "&maxPrice=" + pMax : "") + (mMax ? "&maxMileage=" + mMax : "") +
      (cond === "used" ? "&listingTypes=USED" : cond === "new" ? "&listingTypes=NEW" : "") });

    links.push({ name: "TrueCar", url: "https://www.truecar.com/" + (cond === "new" ? "new" : "used") +
      "-cars-for-sale/listings/" + e(mkS) + "/" + e(mdS) + "/?" + (zip ? "zipcode=" + e(zip) + "&" : "") +
      "searchRadius=" + r + (pMax ? "&priceHigh=" + pMax : "") + (mMax ? "&mileageHigh=" + mMax : "") });

    links.push({ name: "Edmunds", url: "https://www.edmunds.com/inventory/srp.html?make=" + e(mkS) +
      "&model=" + e(mkS + "|" + mdS) + (zip ? "&zip=" + e(zip) : "") + "&radius=" + r +
      (pMax ? "&priceMax=" + pMax : "") + (mMax ? "&mileageMax=" + mMax : "") + (cond !== "all" ? "&inventorytype=" + cond : "") });

    links.push({ name: "CarMax", url: "https://www.carmax.com/cars/" + e(mkS) + "/" + e(mdS) + (zip ? "?zip=" + e(zip) : "") });
    return links;
  }

  function renderFind() {
    var s = $("#section-find");
    if (!data.ui.find) data.ui.find = defaultFind();
    var f = data.ui.find;
    var dealerOpts = '<option value="">— prefill from a saved dealer —</option>' + data.dealers.map(function (d) {
      var v = d.vehicle; var label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || d.dealership || "Unnamed";
      return '<option value="' + d.id + '">' + esc(label) + "</option>";
    }).join("");
    var radiusOpts = [10, 25, 50, 100, 200, 500].map(function (n) {
      return '<option value="' + n + '"' + (String(f.radius) === String(n) ? " selected" : "") + ">" + n + " mi</option>";
    }).join("");
    var condOpts = [["all", "New & used"], ["used", "Used only"], ["new", "New only"]].map(function (c) {
      return '<option value="' + c[0] + '"' + (f.condition === c[0] ? " selected" : "") + ">" + c[1] + "</option>";
    }).join("");

    s.innerHTML =
      "<h1>Find a car near you</h1>" +
      '<p class="section-intro">Enter the exact car you want and your ZIP. CarBuddy builds prefilled searches ' +
      "you can open on the big marketplaces — shortlist what’s in stock, then email those dealers with the " +
      "playbook. Your search stays in your browser until you click through to a site.</p>" +
      '<div class="card">' +
        (data.dealers.length ? field("Prefill from a saved dealer", '<select id="find-prefill">' + dealerOpts + "</select>") : "") +
        '<div class="grid-3">' +
          field("Year", '<input id="find-year" inputmode="numeric" value="' + esc(f.year) + '" placeholder="Any">') +
          field("Make", '<input id="find-make" value="' + esc(f.make) + '" placeholder="Toyota">') +
          field("Model", '<input id="find-model" value="' + esc(f.model) + '" placeholder="RAV4">') +
        "</div>" +
        '<div class="grid-2">' +
          field("Trim", '<input id="find-trim" value="' + esc(f.trim) + '" placeholder="XLE (optional)">') +
          field("Condition", '<select id="find-condition">' + condOpts + "</select>") +
        "</div>" +
        '<div class="grid-3">' +
          field("ZIP code", '<input id="find-zip" inputmode="numeric" value="' + esc(f.zip) + '" placeholder="32204">') +
          field("Radius", '<select id="find-radius">' + radiusOpts + "</select>") +
          field("Max price", '<input id="find-price" inputmode="numeric" value="' + esc(f.priceMax) + '" placeholder="Any">') +
        "</div>" +
        field("Max mileage", '<input id="find-mileage" inputmode="numeric" value="' + esc(f.mileageMax) + '" placeholder="Any">') +
        '<button class="btn btn-block" id="find-save-car">💾 Save this car to my list</button>' +
        '<p class="hint" style="margin-top:6px">Saves it under “Your saved cars” on Home, ready to attach a dealer and quote later.</p>' +
      "</div>" +
      '<div id="find-links"></div>' + flowNav("find");

    var fields = { "find-year": "year", "find-make": "make", "find-model": "model", "find-trim": "trim",
      "find-zip": "zip", "find-radius": "radius", "find-price": "priceMax", "find-mileage": "mileageMax", "find-condition": "condition" };
    Object.keys(fields).forEach(function (id) {
      var el = $("#" + id); if (!el) return;
      el.addEventListener("input", function () { data.ui.find[fields[id]] = el.value; save(); renderFindLinks(); });
      el.addEventListener("change", function () { data.ui.find[fields[id]] = el.value; save(); renderFindLinks(); });
    });
    var pre = $("#find-prefill");
    if (pre) pre.addEventListener("change", function () {
      var d = findDealer(pre.value); if (!d) return;
      var v = d.vehicle;
      data.ui.find.year = v.year || ""; data.ui.find.make = v.make || "";
      data.ui.find.model = v.model || ""; data.ui.find.trim = v.trim || "";
      save(); renderFind();
    });
    $("#find-save-car").addEventListener("click", function () {
      var q = data.ui.find;
      if (!(q.make || "").trim() || !(q.model || "").trim()) { toast("Enter at least a make and model first."); return; }
      var d = newDealer();
      d.vehicle.year = (q.year || "").trim();
      d.vehicle.make = (q.make || "").trim();
      d.vehicle.model = (q.model || "").trim();
      d.vehicle.trim = (q.trim || "").trim();
      data.dealers.push(d); save();
      toast("Saved to your cars");
      location.hash = "#dealer/" + d.id;
    });
    renderFindLinks();
  }

  function renderFindLinks() {
    var box = $("#find-links"); if (!box) return;
    var f = data.ui.find;
    if (!(f.make || "").trim() || !(f.model || "").trim()) {
      box.innerHTML = '<div class="empty"><p>Enter at least a <b>make</b> and <b>model</b> to build searches.</p></div>';
      return;
    }
    var links = buildFindLinks(f).map(function (l) {
      return '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + esc(l.url) + '">' + esc(l.name) + " ↗</a>";
    }).join("");
    box.innerHTML = '<div class="card"><h3>Open a prefilled search</h3>' +
      '<p class="hint">Each opens on that marketplace in a new tab — the only point your search leaves your browser. ' +
      "Deep links are best-effort (refine trim/options on the site); the <b>Google</b> link always works.</p>" +
      '<div class="btn-row">' + links + "</div></div>";
  }

  /* ---------------------------------------------------------------- modals */
  function openModal(html, onClose) {
    var wrap = $("#modal-wrap"), box = $("#modal");
    box.innerHTML = html;
    wrap.hidden = false;
    document.body.classList.add("no-scroll");
    modalCloser = onClose || null;
    requestAnimationFrame(function () { wrap.classList.add("show"); });
  }
  var modalCloser = null;
  function closeModal() {
    var wrap = $("#modal-wrap");
    if (wrap.hidden) return;
    wrap.classList.remove("show");
    document.body.classList.remove("no-scroll");
    setTimeout(function () { wrap.hidden = true; $("#modal").innerHTML = ""; }, 180);
    if (modalCloser) { var f = modalCloser; modalCloser = null; f(); }
  }
  function modalHead(title) {
    return '<div class="modal-head"><h3>' + title + '</h3><button class="btn btn-sm btn-ghost" data-modal-close aria-label="Close">✕</button></div>';
  }

  // In-app confirmation — window.confirm() is silently blocked in some in-app browsers.
  function confirmAction(title, message, yesLabel, onYes) {
    openModal(modalHead(title) +
      "<p>" + message + "</p>" +
      '<div class="btn-row" style="margin-top:6px">' +
        '<button class="btn btn-danger" id="confirm-yes">' + yesLabel + "</button>" +
        '<button class="btn btn-ghost" data-modal-close>Cancel</button>' +
      "</div>");
    $("#confirm-yes").addEventListener("click", function () {
      modalCloser = null; closeModal(); onYes();
    });
  }

  function openAddDealerModal() {
    openModal(modalHead("Add a dealer") +
      '<p class="hint">Just the basics — everything else lives on the dealer’s page.</p>' +
      field("Dealership", '<input id="am-dealership" placeholder="Dealer name">') +
      '<div class="grid-3">' +
        field("Year", '<input id="am-year" inputmode="numeric" placeholder="2026">') +
        field("Make", '<input id="am-make" placeholder="Toyota">') +
        field("Model", '<input id="am-model" placeholder="RAV4">') +
      "</div>" +
      '<div class="grid-2">' +
        field("Trim", '<input id="am-trim" placeholder="Optional">') +
        field("Sale price", '<input id="am-price" inputmode="decimal" placeholder="If quoted">') +
      "</div>" +
      '<div class="btn-row" style="margin-top:6px">' +
        '<button class="btn btn-primary" id="am-save">Add dealer</button>' +
        '<button class="btn btn-ghost" data-modal-close>Cancel</button>' +
      "</div>");
    $("#am-save").addEventListener("click", function () {
      var price = clamp0(num($("#am-price").value));
      var d = newDealer();
      d.dealership = $("#am-dealership").value.trim();
      d.vehicle.year = $("#am-year").value.trim();
      d.vehicle.make = $("#am-make").value.trim();
      d.vehicle.model = $("#am-model").value.trim();
      d.vehicle.trim = $("#am-trim").value.trim();
      d.quote.salePrice = price;
      if (price > 0) d.status = "quoted";
      data.dealers.push(d); save();
      closeModal();
      location.hash = "#dealer/" + d.id;
    });
    $("#am-dealership").focus();
  }

  function openImportModal() {
    openModal(modalHead("Import a quote or listing") +
      '<p class="hint">Paste a <b>listing URL</b> and CarBuddy pulls the car from it (paste the listing’s ' +
      "page text too for price &amp; dealer). Or upload a <b>photo</b>/<b>PDF</b> of a quote, an " +
      "email/<b>.txt</b>/<b>.eml</b>/<b>.csv</b>, or a CarBuddy <b>.json</b>. Everything is read " +
      "<b>on your device</b> — nothing leaves your browser. Best-effort, so review the fields afterward.</p>" +
      '<div class="btn-row" style="margin-bottom:10px">' +
        '<label class="btn btn-sm" style="cursor:pointer">Choose file…' +
          '<input type="file" id="quote-file" accept=".txt,.eml,.json,.csv,.md,.text,.pdf,image/*,application/pdf,text/*,message/rfc822" style="display:none"></label>' +
      "</div>" +
      '<div class="import-status" id="import-status" hidden></div>' +
      '<textarea id="quote-text" placeholder="Paste a listing URL, or the dealer’s quote / listing text / email…"></textarea>' +
      '<div class="btn-row" style="margin-top:8px">' +
        '<button class="btn btn-primary btn-sm" id="parse-quote">Parse &amp; add dealer</button>' +
        '<button class="btn btn-sm btn-ghost" data-modal-close>Cancel</button>' +
      "</div>");
    wireImport();
    $("#quote-text").focus();
  }

  /* ================================================== OTD PRICING (A) */
  function renderDashboard() {
    var s = $("#section-dashboard");
    var head = "<h1>OTD pricing</h1>" +
      '<p class="section-intro">Every active quote side by side by out-the-door price. Tap a card for the ' +
      "full quote, fee ledger, and reply helper.</p>" +
      financingControls("dash") +
      '<div class="btn-row" style="margin:14px 0">' +
        '<button class="btn btn-primary" id="add-dealer">+ Add dealer</button>' +
        '<button class="btn" id="toggle-import">⬆ Import a quote</button>' +
      "</div>";

    var offers = data.dealers.filter(isOffer);
    var savedCount = data.dealers.length - offers.length;
    var body;
    if (!data.dealers.length) {
      body = '<div class="empty"><div class="big">🏷️</div>' +
        "<p>No dealers yet. Add the first one, then send them all the same out-the-door request.</p>" +
        '<a class="btn btn-sm" href="#templates">Get the email template →</a></div>';
    } else if (!offers.length) {
      body = '<div class="empty"><div class="big">🏷️</div>' +
        "<p>No written quotes yet. Your " + savedCount + " saved car" + (savedCount === 1 ? "" : "s") +
        " are on the <a href=\"#cars\">Cars tab</a> — email those dealers for an OTD number.</p>" +
        '<a class="btn btn-sm" href="#templates">Get the email template →</a></div>';
    } else {
      body = offers.map(function (d) { return compactCard(d); }).join("") +
        (savedCount ? '<p class="hint" style="margin-top:10px">' + savedCount + " saved car" + (savedCount === 1 ? "" : "s") +
          ' without a quote yet — see the <a href="#cars">Cars tab</a>.</p>' : "");
    }
    var vsBlock = data.dealers.length >= 2
      ? '<div class="card" id="vs-card"><h3>⚖️ Head-to-head</h3>' +
        '<p class="hint">Pick two cars to compare — numbers, and where to research the rest (reliability, owner threads).</p>' +
        '<div class="grid-2">' +
          field("Car A", '<select id="vs-a">' + vsOptions(vsA) + "</select>") +
          field("Car B", '<select id="vs-b">' + vsOptions(vsB) + "</select>") +
        "</div>" +
        '<div id="vs-box"></div></div>'
      : "";

    s.innerHTML = head + vsBlock + '<div id="dealer-list" class="mini-list">' + body + "</div>" + flowNav("dashboard");

    wireFinancing(s, function () { updateDashboardList(); renderVs(); });
    $("#add-dealer").addEventListener("click", openAddDealerModal);
    $("#toggle-import").addEventListener("click", openImportModal);
    homeBadges(data.dealers.filter(isOffer));
    if (data.dealers.length >= 2) {
      $("#vs-a").addEventListener("change", function () { vsA = this.value; renderVs(); });
      $("#vs-b").addEventListener("change", function () { vsB = this.value; renderVs(); });
      renderVs();
    }
  }

  /* ------------------------- head-to-head: compare two cars ------------------------- */
  var vsA = "", vsB = "";
  function vsDefaults() {
    // default to the two lowest-OTD offers, else the first two cars
    var ranked = data.dealers.slice().sort(function (a, b) {
      var ca = dealerCalc(a), cb = dealerCalc(b);
      if (ca.hasPrice !== cb.hasPrice) return ca.hasPrice ? -1 : 1;
      return ca.otd - cb.otd;
    });
    if (!findDealer(vsA)) vsA = ranked[0] ? ranked[0].id : "";
    if (!findDealer(vsB) || vsB === vsA) vsB = (ranked[1] && ranked[1].id !== vsA) ? ranked[1].id : (ranked.find(function (d) { return d.id !== vsA; }) || {}).id || "";
  }
  function vsOptions(sel) {
    vsDefaults();
    return data.dealers.map(function (d) {
      var v = d.vehicle;
      var label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || "Unnamed";
      if (d.dealership) label += " · " + d.dealership;
      return '<option value="' + d.id + '"' + (sel === d.id ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
  }
  function researchLinks(d) {
    var v = d.vehicle;
    var q = [v.year, v.make, v.model].filter(Boolean).join(" ");
    if (!q) return '<span class="hint">add year/make/model</span>';
    var e = encodeURIComponent;
    return '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=' + e(q + " reliability review") + '">Reviews ↗</a> · ' +
      '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=' + e("reddit " + q + " long term owner review problems") + '">Owner threads ↗</a> · ' +
      '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=' + e(q + " known problems transmission") + '">Known issues ↗</a>';
  }
  function renderVs() {
    var box = $("#vs-box"); if (!box) return;
    vsDefaults();
    var a = findDealer(vsA), b = findDealer(vsB);
    if (!a || !b) { box.innerHTML = ""; return; }
    if (a.id === b.id) { box.innerHTML = '<p class="hint">Pick two different cars to compare.</p>'; return; }
    var ca = dealerCalc(a), cb = dealerCalc(b);
    var f = data.financing, term = Math.round(num(f.term)) || 1;

    function carName(d) { var v = d.vehicle; return esc([v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || d.dealership || "Unnamed"); }
    function lo(x, y, lowerWins) { // returns [clsA, clsB]
      if (x == null || y == null || !isFinite(x) || !isFinite(y) || x === y) return ["", ""];
      var aWins = lowerWins ? x < y : x > y;
      return aWins ? [" vs-win", ""] : ["", " vs-win"];
    }
    function junkTotal(d) {
      return (d.quote.fees || []).reduce(function (s2, fe) { return s2 + (fe.category === "fake" ? num(fe.amount) : 0); }, 0);
    }
    var rows = [];
    function row(label, va, vb, clsPair) {
      rows.push('<div class="vs-row"><div class="vs-lbl">' + label + '</div>' +
        '<div class="vs-cell money' + (clsPair ? clsPair[0] : "") + '">' + va + "</div>" +
        '<div class="vs-cell money' + (clsPair ? clsPair[1] : "") + '">' + vb + "</div></div>");
    }
    var mA = num(a.vehicle.mileage), mB = num(b.vehicle.mileage);
    row("Mileage", mA ? mA.toLocaleString("en-US") + " mi" : "—", mB ? mB.toLocaleString("en-US") + " mi" : "—", lo(mA || null, mB || null, true));
    row("Sale price", ca.hasPrice ? money(num(a.quote.salePrice), 0) : "—", cb.hasPrice ? money(num(b.quote.salePrice), 0) : "—",
      lo(ca.hasPrice ? num(a.quote.salePrice) : null, cb.hasPrice ? num(b.quote.salePrice) : null, true));
    row("All fees", money(ca.feesTotal, 0), money(cb.feesTotal, 0), lo(ca.feesTotal, cb.feesTotal, true));
    row("· junk fees", money(junkTotal(a), 0), money(junkTotal(b), 0), lo(junkTotal(a), junkTotal(b), true));
    row("Tax", ca.hasPrice ? money(ca.tax, 0) : "—", cb.hasPrice ? money(cb.tax, 0) : "—", null);
    row("<b>Out the door</b>", ca.hasPrice ? "<b>" + money(ca.otd, 0) + "</b>" : "—", cb.hasPrice ? "<b>" + money(cb.otd, 0) + "</b>" : "—",
      lo(ca.hasPrice ? ca.otd : null, cb.hasPrice ? cb.otd : null, true));
    row("Est. monthly", ca.hasPrice ? money(ca.monthly, 2) : "—", cb.hasPrice ? money(cb.monthly, 2) : "—",
      lo(ca.hasPrice ? ca.monthly : null, cb.hasPrice ? cb.monthly : null, true));
    row("Interest over " + term + " mo",
      ca.hasPrice ? money(ca.monthly * term - ca.financed, 0) : "—",
      cb.hasPrice ? money(cb.monthly * term - cb.financed, 0) : "—", null);
    rows.push('<div class="vs-row"><div class="vs-lbl">Research</div>' +
      '<div class="vs-cell vs-links">' + researchLinks(a) + '</div>' +
      '<div class="vs-cell vs-links">' + researchLinks(b) + "</div></div>");
    rows.push('<div class="vs-row"><div class="vs-lbl">Your notes</div>' +
      '<div class="vs-cell vs-note">' + (a.notes ? esc(a.notes) : '<span class="hint">none yet</span>') + "</div>" +
      '<div class="vs-cell vs-note">' + (b.notes ? esc(b.notes) : '<span class="hint">none yet</span>') + "</div></div>");

    var verdict = "";
    if (ca.hasPrice && cb.hasPrice && ca.otd !== cb.otd) {
      var cheaper = ca.otd < cb.otd ? a : b;
      var diff = Math.abs(ca.otd - cb.otd);
      verdict = '<p class="vs-verdict">💡 <b>' + carName(cheaper) + "</b> is " + money(diff, 0) +
        " cheaper out-the-door. Numbers aside, check the research links for reliability and owner reports before deciding.</p>";
    }
    box.innerHTML =
      '<div class="vs-head"><div></div><div class="vs-cell vs-carname"><a href="#dealer/' + a.id + '">' + carName(a) + '</a></div>' +
      '<div class="vs-cell vs-carname"><a href="#dealer/' + b.id + '">' + carName(b) + "</a></div></div>" +
      rows.join("") + verdict;
  }

  // re-render only the compare list (keeps focus in the financing inputs above it)
  function updateDashboardList() {
    var list = $("#dealer-list"); if (!list) return;
    var offers = data.dealers.filter(isOffer);
    if (offers.length) {
      list.innerHTML = offers.map(function (d) { return compactCard(d); }).join("");
      homeBadges(offers);
    }
  }

  /* ============================================================ YOUR CARS */
  function renderCars() {
    var s = $("#section-cars");
    var saved = data.dealers.filter(function (d) { return !isOffer(d); });
    var offers = data.dealers.filter(isOffer);
    var body = saved.length
      ? saved.map(function (d) { return compactCard(d); }).join("")
      : '<div class="empty"><div class="big">🚗</div>' +
        "<p>No saved cars yet. Find one near you, paste a listing link, or add one by hand.</p></div>";
    s.innerHTML =
      "<h1>Your cars</h1>" +
      '<p class="section-intro">Cars you’re eyeing but don’t have a written quote for yet. ' +
      "Once a dealer sends an out-the-door number, the car moves to OTD pricing automatically.</p>" +
      '<div class="btn-row" style="margin-bottom:14px">' +
        '<a class="btn btn-primary" href="#find">🔍 Find a car</a>' +
        '<button class="btn" id="cars-add">+ Add</button>' +
        '<button class="btn" id="cars-import">⬆ Import</button>' +
      "</div>" +
      '<div class="mini-list">' + body + "</div>" +
      (offers.length ? '<p class="hint" style="margin-top:14px">' + offers.length + " car" + (offers.length === 1 ? " has" : "s have") +
        ' quotes already — compare them on <a href="#dashboard">OTD pricing</a>.</p>' : "");
    $("#cars-add").addEventListener("click", openAddDealerModal);
    $("#cars-import").addEventListener("click", openImportModal);
  }

  function wireImport() {
    $("#quote-file").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      e.target.value = ""; // allow re-choosing the same file

      if (window.CARBUDDY_OCR && window.CARBUDDY_OCR.isOcrFile(f)) {
        var kind = window.CARBUDDY_OCR.kindOf(f);
        setImportBusy(true);
        setImportStatus("Preparing the on-device reader… the first photo/PDF import loads it (a few MB, one time).");
        window.CARBUDDY_OCR.extractText(f, function (status, progress) {
          setImportStatus(prettyOcrStatus(status, progress));
        }).then(function (text) {
          setImportBusy(false);
          $("#quote-text").value = text || "";
          if (text && text.trim()) setImportStatus("✓ Text read from " + (kind === "pdf" ? "PDF" : "photo") + " — review it below, then Parse & add.");
          else setImportStatus("Couldn’t find readable text. Try a sharper, straight-on photo, or paste the text.");
        }).catch(function (err) {
          setImportBusy(false);
          var msg = (err && err.message) || String(err);
          if (location.protocol === "file:") {
            setImportStatus("Photo/PDF reading needs the hosted site (it can’t run from a local file). Open the deployed URL, or paste the text instead.");
          } else {
            setImportStatus("Couldn’t read that file: " + msg + ". You can paste the text instead.");
          }
        });
      } else {
        var reader = new FileReader();
        reader.onload = function () { $("#quote-text").value = String(reader.result || ""); setImportStatus("✓ Loaded “" + f.name + "” — review and Parse & add."); };
        reader.onerror = function () { setImportStatus("Couldn’t read that file."); };
        reader.readAsText(f);
      }
    });
    $("#parse-quote").addEventListener("click", function () { handleParse($("#quote-text").value); });
  }

  function setImportStatus(msg) {
    var el = $("#import-status"); if (!el) return;
    el.textContent = msg || ""; el.hidden = !msg;
  }
  function setImportBusy(busy) {
    var p = $("#parse-quote"), f = $("#quote-file");
    if (p) p.disabled = busy;
    if (f) f.disabled = busy;
    var panel = $("#import-panel");
    if (panel) panel.classList.toggle("busy", busy);
  }
  function prettyOcrStatus(status, progress) {
    var pct = Math.round((progress || 0) * 100);
    if (/recognizing/i.test(status)) return "Reading text… " + pct + "%";
    if (/core/i.test(status)) return "Loading reader…";
    if (/language|traineddata/i.test(status)) return "Loading language data…";
    if (/initiali/i.test(status)) return "Getting ready…";
    if (/reading pdf/i.test(status)) return "Reading PDF text… " + pct + "%";
    if (/ocr pdf/i.test(status)) return "Reading " + status.replace("ocr pdf page", "PDF page") + "… " + pct + "%";
    return status.charAt(0).toUpperCase() + status.slice(1) + "… " + pct + "%";
  }

  function looksJson(t) { t = t.trim(); return t.charAt(0) === "{" || t.charAt(0) === "["; }
  function firstUrl(t) { var m = String(t).match(/https?:\/\/[^\s"'<>)]+/i); return m ? m[0] : null; }
  function mergeListing(base, u) {
    base.vehicle = base.vehicle || {};
    ["year", "make", "model", "trim", "vin", "stock", "mileage"].forEach(function (k) {
      if (!base.vehicle[k] && u.vehicle[k]) base.vehicle[k] = u.vehicle[k];
    });
    if (!base.salePrice && u.salePrice) base.salePrice = u.salePrice;
    base.listingUrl = u.listingUrl || base.listingUrl || "";
    return base;
  }

  function handleParse(text) {
    text = (text || "").trim();
    if (!text) { toast("Paste or choose a quote first."); return; }
    try {
      if (looksJson(text)) {
        try {
          var obj = JSON.parse(text);
          var dealerObj = obj && Array.isArray(obj.dealers) ? obj.dealers[0] : obj;
          if (dealerObj && typeof dealerObj === "object") { addParsedDealer(fromJsonDealer(dealerObj)); return; }
        } catch (e) { /* not valid JSON — fall through to text parsing */ }
      }
      if (!window.CARBUDDY_PARSE) {
        setImportStatus("Parser didn’t load. Reload the page and try again.");
        addParsedDealer({}); // still give the user an editable card
        return;
      }
      var base = window.CARBUDDY_PARSE.parseQuote(text);
      var url = firstUrl(text);
      if (url && window.CARBUDDY_PARSE.parseListingUrl) {
        base = mergeListing(base, window.CARBUDDY_PARSE.parseListingUrl(url));
      }
      // A bare URL with no car info in it (CarMax/Cars.com links are just an ID):
      // don't silently add an empty card — explain and let them paste the page text.
      var urlOnly = /^https?:\/\/\S+$/.test(text);
      var v0 = base.vehicle || {};
      var gotInfo = v0.make || v0.model || v0.vin || num(base.salePrice) > 0;
      if (urlOnly && !gotInfo) {
        setImportStatus("That link doesn’t carry the car’s details (it’s just a listing ID). " +
          "Open the listing, select-all and copy the page, then paste it here under the link — " +
          "you’ll get the car, price, and mileage. Or add it with just the link:");
        var pq = $("#parse-quote");
        if (pq && !$("#add-anyway")) {
          var btn = document.createElement("button");
          btn.className = "btn btn-sm"; btn.id = "add-anyway"; btn.textContent = "Add with just the link";
          pq.parentNode.insertBefore(btn, pq.nextSibling);
          btn.addEventListener("click", function () { addParsedDealer(base); });
        }
        return;
      }
      addParsedDealer(base);
    } catch (e) {
      if (window.console) console.error("CarBuddy: parse failed", e);
      setImportStatus("Couldn’t read that automatically — added a blank card to fill in.");
      addParsedDealer({});
    }
  }

  // map a CarBuddy-shaped dealer object (e.g. from an exported backup) to a parsed shape
  function fromJsonDealer(o) {
    var v = o.vehicle || {};
    var q = o.quote || {};
    return {
      dealership: o.dealership || "", contact: o.contact || "",
      vehicle: { year: v.year, make: v.make, model: v.model, trim: v.trim, color: v.color, vin: v.vin, stock: v.stock },
      salePrice: num(q.salePrice),
      fees: Array.isArray(q.fees) ? q.fees.map(function (f) {
        return { label: f.label || "Fee", amount: num(f.amount), category: f.category || "negotiable", taxable: f.taxable !== false };
      }) : []
    };
  }

  function countFound(d) {
    var v = d.vehicle, n = 0;
    ["year", "make", "model", "trim", "color", "vin", "stock"].forEach(function (k) { if (v[k]) n++; });
    if (d.dealership) n++;
    if (d.contact) n++;
    if (num(d.quote.salePrice) > 0) n++;
    n += (d.quote.fees || []).length;
    return n;
  }

  function addParsedDealer(p) {
    p = p || {};
    var pv = p.vehicle || {};
    var hasQuote = num(p.salePrice) > 0 || (p.fees && p.fees.length);
    var d = {
      id: uid("d_"), dealership: p.dealership || "", contact: p.contact || "",
      status: hasQuote ? "quoted" : "contacted",
      vehicle: {
        year: pv.year || "", make: pv.make || "", model: pv.model || "", trim: pv.trim || "",
        color: pv.color || "", vin: pv.vin || "", stock: pv.stock || "", mileage: pv.mileage || ""
      },
      quote: {
        salePrice: num(p.salePrice) || 0,
        fees: (p.fees || []).map(function (f) {
          return { id: uid("f_"), label: f.label || "Fee", amount: num(f.amount) || 0,
                   category: f.category || "negotiable", taxable: f.taxable !== false };
        })
      },
      listingUrl: p.listingUrl || "",
      notes: "", tactics: [], lastReply: "", createdAt: Date.now(), updatedAt: Date.now()
    };
    data.dealers.push(d); save();
    var found = countFound(d);
    closeModal();
    location.hash = "#dealer/" + d.id;
    toast(found ? "Imported " + found + " field" + (found > 1 ? "s" : "") + " — please review"
                : "Added a dealer — couldn’t read details, fill it in");
  }

  function dealerCard(d) {
    var v = d.vehicle;
    var vehLine = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") ||
      '<span class="hint">no vehicle yet</span>';
    var vehSub = [v.color, v.vin && ("VIN " + v.vin), v.stock && ("Stock " + v.stock)].filter(Boolean).join(" · ");
    var statusOpts = STATUS.map(function (o) {
      return '<option value="' + o[0] + '"' + (d.status === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");

    var fees = (d.quote.fees || []).map(function (fe) { return feeRow(d.id, fe); }).join("");

    var tactics = C.redFlags.map(function (rf) {
      var on = (d.tactics || []).indexOf(rf.id) >= 0;
      return '<label class="inline-check" style="font-weight:500;margin:4px 0">' +
        '<input type="checkbox" data-tactic="' + rf.id + '"' + (on ? " checked" : "") + "> " + esc(rf.tactic) + "</label>";
    }).join("");

    return '<div class="card dealer-card" data-id="' + d.id + '">' +
      '<div class="dealer-head"><div>' +
        '<div class="dealer-title">' + vehLine + "</div>" +
        (vehSub ? '<div class="dealer-sub">' + esc(vehSub) + "</div>" : "") +
        (d.listingUrl ? '<div class="dealer-sub"><a href="' + esc(d.listingUrl) + '" target="_blank" rel="noopener noreferrer">View listing ↗</a></div>' : "") +
      "</div>" +
      '<span class="pill status-' + d.status + '" data-status-pill>' + statusLabel(d.status) + "</span>" +
      "</div>" +

      '<div class="badges" id="badges-' + d.id + '"></div>' +

      '<div class="grid-2">' +
        field("Dealership", '<input data-df="dealership" value="' + esc(d.dealership) + '" placeholder="Dealer name">') +
        field("Contact", '<input data-df="contact" value="' + esc(d.contact) + '" placeholder="Salesperson">') +
      "</div>" +
      '<div class="grid-3">' +
        field("Year", '<input data-vf="year" value="' + esc(v.year) + '" placeholder="2026">') +
        field("Make", '<input data-vf="make" value="' + esc(v.make) + '">') +
        field("Model", '<input data-vf="model" value="' + esc(v.model) + '">') +
      "</div>" +
      '<div class="grid-3">' +
        field("Trim", '<input data-vf="trim" value="' + esc(v.trim) + '">') +
        field("Color", '<input data-vf="color" value="' + esc(v.color) + '">') +
        field("Status", '<select data-df="status">' + statusOpts + "</select>") +
      "</div>" +
      '<div class="grid-3">' +
        field("VIN", '<input data-vf="vin" value="' + esc(v.vin) + '">') +
        field("Stock #", '<input data-vf="stock" value="' + esc(v.stock) + '">') +
        field("Mileage", '<input data-vf="mileage" inputmode="numeric" value="' + esc(v.mileage || "") + '" placeholder="e.g. 12,000">') +
      "</div>" +
      field("Listing URL", '<input data-df="listingUrl" value="' + esc(d.listingUrl || "") + '" placeholder="Paste a listing link (optional)">') +

      '<div class="divider"></div>' +
      "<h3>Fee ledger</h3>" +
      field("Sale price", '<input inputmode="decimal" data-df="salePrice" value="' + attrNum(d.quote.salePrice) + '" placeholder="Negotiated price">') +
      '<div class="fee-rows" data-fees>' + fees + "</div>" +
      '<div class="btn-row" style="margin:8px 0">' +
        '<button class="btn btn-sm" data-add-fee>+ Add fee</button>' +
        '<button class="btn btn-sm btn-ghost" data-quick-fees>Quick-add common fees</button>' +
      "</div>" +
      '<div class="fee-total-line"><span>Taxable base</span><span class="money" data-base></span></div>' +
      '<div class="fee-total-line"><span>Tax</span><span class="money" data-tax></span></div>' +
      '<div class="otd-line"><span>Out the door</span><span class="big money" id="otd-' + d.id + '"></span></div>' +
      '<div class="pay-line"><span>Est. monthly</span><span class="money" id="pay-' + d.id + '"></span></div>' +

      '<div class="divider"></div>' +
      '<details class="reply-helper"' + ((d.lastReply || "").trim() ? " open" : "") + ">" +
        "<summary>💬 Dealer replied? Get a suggested response</summary>" +
        '<div style="margin-top:8px">' +
          field("Their message", '<textarea data-reply placeholder="Paste the dealer’s email or text reply here…">' + esc(d.lastReply || "") + "</textarea>") +
          '<div class="reply-analysis" id="reply-' + d.id + '"></div>' +
        "</div>" +
      "</details>" +

      '<div class="divider"></div>' +
      field("Notes &amp; tactics log", '<textarea data-df="notes" placeholder="“Pushed for a phone call,” “refused written quote,” “asked me to name a number”…">' + esc(d.notes) + "</textarea>") +
      '<details style="margin-top:8px"><summary class="hint">Log dealer tactics (' + (d.tactics || []).length + ' flagged)</summary><div style="margin-top:6px">' + tactics + "</div></details>" +

      '<div class="btn-row" style="margin-top:12px"><button class="btn btn-sm btn-danger" data-del-dealer>Delete dealer</button></div>' +
    "</div>";
  }

  function feeRow(dealerId, fe) {
    var cats = [["fixed", "Fixed"], ["negotiable", "Negotiable"], ["fake", "Fake"]];
    var opts = cats.map(function (c) {
      return '<option value="' + c[0] + '"' + (fe.category === c[0] ? " selected" : "") + ">" + c[1] + "</option>";
    }).join("");
    return '<div class="fee-row" data-fee="' + fe.id + '">' +
      '<input data-fee-f="label" value="' + esc(fe.label) + '" placeholder="Fee name">' +
      '<input inputmode="decimal" data-fee-f="amount" value="' + attrNum(fe.amount) + '" placeholder="0">' +
      '<button class="btn btn-sm btn-ghost" data-del-fee title="Remove">✕</button>' +
      '<div class="fee-cat">' +
        '<span class="chip cat-' + fe.category + '" data-chip>' + fe.category + "</span>" +
        '<select data-fee-f="category" style="width:auto;padding:4px 8px">' + opts + "</select>" +
        '<label class="inline-check" style="font-weight:500;font-size:.78rem"><input type="checkbox" data-fee-f="taxable"' + (fe.taxable ? " checked" : "") + "> taxed</label>" +
      "</div>" +
    "</div>";
  }

  function newDealer() {
    return {
      id: uid("d_"), dealership: "", contact: "", status: "contacted",
      vehicle: { year: "", make: "", model: "", trim: "", color: "", vin: "", stock: "", mileage: "" },
      quote: { salePrice: 0, fees: [] }, listingUrl: "", notes: "", tactics: [], lastReply: "",
      createdAt: Date.now(), updatedAt: Date.now()
    };
  }

  function findDealer(id) { for (var i = 0; i < data.dealers.length; i++) if (data.dealers[i].id === id) return data.dealers[i]; return null; }

  /* ============================================================ DEALER DETAIL */
  var detailId = null;
  function renderDetail(id) {
    detailId = id || detailId;
    var s = $("#section-detail");
    var d = findDealer(detailId);
    if (!d) { location.hash = "#home"; return; }
    s.innerHTML =
      '<div class="detail-bar">' +
        '<a class="btn btn-sm" href="#dashboard">← All dealers</a>' +
        '<a class="btn btn-sm btn-ghost" href="#home">Home</a>' +
      "</div>" +
      financingControls("det") +
      dealerCard(d);
    wireFinancing(s, updateComputed);
    updateComputed();
    renderReplyAnalysis(d.id);
  }

  function wireDetail() {
    var s = $("#section-detail");
    s.addEventListener("input", onDealerEdit);
    s.addEventListener("change", onDealerEdit);
    s.addEventListener("click", function (e) {
      var card = e.target.closest(".dealer-card"); if (!card) return;
      var d = findDealer(card.getAttribute("data-id")); if (!d) return;

      if (e.target.closest("[data-del-dealer]")) {
        confirmAction("Delete this dealer?",
          "This removes " + esc(d.dealership || "this dealer") + " and its quote. It can’t be undone.",
          "Delete dealer", function () {
            data.dealers = data.dealers.filter(function (x) { return x.id !== d.id; });
            save(); toast("Dealer deleted");
            location.hash = "#dashboard"; renderDashboard();
          });
      } else if (e.target.closest("[data-add-fee]")) {
        d.quote.fees.push({ id: uid("f_"), label: "", amount: 0, category: "negotiable", taxable: true });
        touch(d); renderDetail();
      } else if (e.target.closest("[data-quick-fees]")) {
        d.quote.fees.push(
          { id: uid("f_"), label: "Doc fee", amount: 0, category: "negotiable", taxable: true },
          { id: uid("f_"), label: "Electronic filing", amount: 0, category: "fake", taxable: true },
          { id: uid("f_"), label: "Title & registration", amount: 0, category: "fixed", taxable: false }
        );
        touch(d); renderDetail();
      } else if (e.target.closest("[data-del-fee]")) {
        var row = e.target.closest("[data-fee]");
        var fid = row.getAttribute("data-fee");
        d.quote.fees = d.quote.fees.filter(function (f) { return f.id !== fid; });
        touch(d); renderDetail();
      }
    });
  }

  function onDealerEdit(e) {
    var t = e.target;
    var card = t.closest(".dealer-card"); if (!card) return;
    var d = findDealer(card.getAttribute("data-id")); if (!d) return;

    if (t.hasAttribute("data-df")) {
      var k = t.getAttribute("data-df");
      if (k === "salePrice") d.quote.salePrice = clamp0(num(t.value));
      else if (k === "status") { d.status = t.value; var pill = $("[data-status-pill]", card);
        pill.className = "pill status-" + d.status; pill.textContent = statusLabel(d.status); }
      else d[k] = t.value;
    } else if (t.hasAttribute("data-vf")) {
      d.vehicle[t.getAttribute("data-vf")] = t.value;
      // reflect title/sub live without stealing focus
      var v = d.vehicle;
      var titleEl = $(".dealer-title", card);
      titleEl.innerHTML = [v.year, v.make, v.model, v.trim].filter(Boolean).map(esc).join(" ") || '<span class="hint">no vehicle yet</span>';
    } else if (t.hasAttribute("data-fee-f")) {
      var row = t.closest("[data-fee]"); var fid = row.getAttribute("data-fee");
      var fe = null; for (var i = 0; i < d.quote.fees.length; i++) if (d.quote.fees[i].id === fid) fe = d.quote.fees[i];
      if (!fe) return;
      var fk = t.getAttribute("data-fee-f");
      if (fk === "amount") fe.amount = clamp0(num(t.value));
      else if (fk === "taxable") fe.taxable = t.checked;
      else if (fk === "category") { fe.category = t.value; var chip = $("[data-chip]", row);
        chip.className = "chip cat-" + fe.category; chip.textContent = fe.category; }
      else fe.label = t.value;
    } else if (t.hasAttribute("data-tactic")) {
      var id = t.getAttribute("data-tactic");
      d.tactics = (d.tactics || []).filter(function (x) { return x !== id; });
      if (t.checked) d.tactics.push(id);
    } else if (t.hasAttribute("data-reply")) {
      d.lastReply = t.value; touch(d); renderReplyAnalysis(d.id); return; // no recompute needed
    } else return;

    touch(d);
    updateComputed();
  }

  function touch(d) { d.updatedAt = Date.now(); save(); }

  // recompute every card's tax/OTD/payment + lowest badges, without touching inputs
  function updateComputed() {
    if (!data.dealers.length) return;
    var calcs = data.dealers.map(function (d) { return { d: d, c: dealerCalc(d) }; });
    var minOtd = Infinity, minPay = Infinity;
    calcs.forEach(function (x) {
      if (x.c.hasPrice) { if (x.c.otd < minOtd) minOtd = x.c.otd; if (x.c.monthly < minPay) minPay = x.c.monthly; }
    });
    calcs.forEach(function (x) {
      var d = x.d, c = x.c, card = $('.dealer-card[data-id="' + d.id + '"]'); if (!card) return;
      var baseEl = $("[data-base]", card), taxEl = $("[data-tax]", card);
      if (baseEl) baseEl.textContent = c.hasPrice ? money(c.taxableBase, 0) : "—";
      if (taxEl) taxEl.textContent = c.hasPrice ? money(c.tax, 0) : "—";
      $("#otd-" + d.id).textContent = c.hasPrice ? money(c.otd, 0) : "—";
      $("#pay-" + d.id).textContent = c.hasPrice ? money(c.monthly, 2) + "/mo" : "—";
      var badges = $("#badges-" + d.id); badges.innerHTML = "";
      card.classList.remove("highlight-otd");
      if (c.hasPrice && c.otd === minOtd) { badges.innerHTML += '<span class="badge">★ Lowest OTD</span>'; card.classList.add("highlight-otd"); }
      if (c.hasPrice && c.monthly === minPay) { badges.innerHTML += '<span class="badge badge-pay">Lowest payment</span>'; }
    });
  }

  // Read a dealer's pasted reply → show detected tactics + a ready-to-send response.
  function renderReplyAnalysis(id) {
    var d = findDealer(id); if (!d) return;
    var box = document.getElementById("reply-" + id); if (!box) return;
    var msg = (d.lastReply || "").trim();
    if (!msg) { box.innerHTML = '<p class="hint" style="margin-top:8px">Paste their reply and CarBuddy suggests exactly what to send back — pre-filled.</p>'; return; }
    if (!window.CARBUDDY_ADVISE) { box.innerHTML = ""; return; }

    var mine = dealerCalc(d), best = competingOtd(d.id);
    var hasLower = mine.hasPrice ? (best < mine.otd) : (best < Infinity);
    var s = window.CARBUDDY_ADVISE.suggestReply(msg, { hasLowerCompeting: hasLower });

    var flags = (s.tacticIds || []).map(function (tid) {
      var rf = findRedFlag(tid); if (!rf) return "";
      return '<div class="flag"><div class="t">🚩 ' + esc(rf.tactic) + '</div><div class="c"><b>Counter:</b> ' + esc(rf.counter) + "</div></div>";
    }).join("");

    var tpl = getTpl(s.templateId), html = "";
    if (flags) html += '<div style="margin-top:10px">' + flags + "</div>";
    if (tpl) {
      html += '<div class="reply-suggest">' +
        '<div class="reply-lead">✍️ Send this back — <b>' + esc(tpl.title) + "</b></div>" +
        (s.reason ? '<div class="hint" style="margin:4px 0 8px">' + esc(s.reason) + "</div>" : "") +
        '<div class="tpl-body">' + esc(merge(tpl.body, contextForDealer(d))) + "</div>" +
        '<div class="btn-row" style="margin-bottom:8px">' +
          '<button class="btn btn-sm btn-primary" data-reply-copy>Copy reply</button>' +
          '<button class="btn btn-sm" data-reply-mail>Open in email</button>' +
        "</div>" +
        '<div class="tpl-why"><b>Why it works:</b> ' + esc(tpl.why) + "</div>" +
      "</div>";
    }
    box.innerHTML = html;
    var cb = box.querySelector("[data-reply-copy]"), mb = box.querySelector("[data-reply-mail]");
    if (cb) cb.addEventListener("click", function () { copyText(merge(getTpl(s.templateId).body, contextForDealer(d))); });
    if (mb) mb.addEventListener("click", function () {
      var c = contextForDealer(d), tt = getTpl(s.templateId);
      var subj = tt.title + (c.vehicle ? " — " + c.vehicle : "");
      window.location.href = "mailto:?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(merge(tt.body, c));
    });
  }

  /* ========================================================== CALCULATOR (B) */
  function renderCalculator() {
    var s = $("#section-calculator");
    s.innerHTML =
      "<h1>Your financing</h1>" +
      '<p class="section-intro">The numbers that drive every payment in the app, plus a calculator to ' +
      "model any price — compare terms, and see what a later lump-sum payment (like selling your old car) would save.</p>" +
      financingControls("calc") +
      '<div class="card">' +
        '<div class="grid-2">' +
          field("Vehicle price", '<input inputmode="decimal" id="calc-price" value="' + attrNum(readTmp("price")) + '" placeholder="30000">') +
          field("Other fees (cash)", '<input inputmode="decimal" id="calc-fees" value="' + attrNum(readTmp("fees")) + '" placeholder="0">') +
        "</div>" +
        '<div class="result-grid" id="calc-results"></div>' +
        "<h3>Compare terms</h3><div class=\"term-strip\" id=\"calc-terms\"></div>" +
        '<div class="divider"></div>' +
        "<h3>Lump-sum payoff</h3>" +
        '<p class="hint">Apply a one-time extra principal payment (e.g., proceeds from selling your old car) and see the savings.</p>' +
        '<div class="grid-2">' +
          field("Extra payment", '<input inputmode="decimal" id="calc-lump" value="' + attrNum(readTmp("lump")) + '" placeholder="5000">') +
          field("After month #", '<input inputmode="numeric" id="calc-lumpm" value="' + attrNum(readTmp("lumpm")) + '" placeholder="12">') +
        "</div>" +
        '<div class="result" id="calc-lump-result" style="display:none"></div>' +
      "</div>" + flowNav("calculator");

    wireFinancing(s, computeCalc);
    ["calc-price", "calc-fees", "calc-lump", "calc-lumpm"].forEach(function (id) {
      $("#" + id).addEventListener("input", function () {
        tmp.price = $("#calc-price").value; tmp.fees = $("#calc-fees").value;
        tmp.lump = $("#calc-lump").value; tmp.lumpm = $("#calc-lumpm").value;
        computeCalc();
      });
    });
    computeCalc();
  }

  // ephemeral calculator scratch (not persisted — keeps localStorage about the deal, not doodles)
  var tmp = { price: "", fees: "", lump: "", lumpm: "" };
  function readTmp(k) { return tmp[k]; }

  function computeCalc() {
    var f = data.financing;
    var price = clamp0(num($("#calc-price") ? $("#calc-price").value : tmp.price));
    var extraFees = clamp0(num($("#calc-fees") ? $("#calc-fees").value : tmp.fees));
    var trade = num(f.tradeInValue), down = num(f.downPayment);
    var apr = num(f.apr), term = Math.round(num(f.term)) || 1;

    var taxableBase = clamp0(price - trade);
    var tax = Math.round(taxableBase * num(f.taxRate) * 100) / 100;
    var otd = price + extraFees + tax;
    var financed = f.rollInFees
      ? clamp0(otd - down - trade)
      : clamp0(price + tax - down - trade);
    var M = monthlyPayment(financed, apr, term);
    var totalPaid = M * term;
    var totalInterest = totalPaid - financed;
    var totalCost = down + trade + totalPaid;

    $("#calc-results").innerHTML =
      '<div class="result hero"><div class="lbl">Monthly payment · ' + term + ' mo</div><div class="val money">' + money(M, 2) + "</div></div>" +
      '<div class="result"><div class="lbl">Out the door</div><div class="val money">' + money(otd, 0) + "</div></div>" +
      '<div class="result"><div class="lbl">Amount financed</div><div class="val money">' + money(financed, 0) + "</div></div>" +
      '<div class="result"><div class="lbl">Total interest</div><div class="val money">' + money(totalInterest, 0) + "</div></div>" +
      '<div class="result"><div class="lbl">Tax</div><div class="val money">' + money(tax, 0) + "</div></div>";

    // term strip: selected term + two nearest standard terms
    var terms = uniqueSorted([60, 72, 84, term]);
    var baseline = Math.min.apply(null, terms.map(function (t) { return monthlyPayment(financed, apr, t) * t - financed; }));
    $("#calc-terms").innerHTML = terms.map(function (t) {
      var m = monthlyPayment(financed, apr, t);
      var interest = m * t - financed;
      var delta = interest - baseline;
      return '<div class="term-cell' + (t === term ? " sel" : "") + '">' +
        '<div class="t num">' + t + " mo</div>" +
        '<div class="m money">' + money(m, 0) + "</div>" +
        (delta > 1 ? '<div class="d money">+' + money(delta, 0) + " int.</div>" : '<div class="d">lowest int.</div>') +
        "</div>";
    }).join("");

    // lump-sum
    var lump = clamp0(num($("#calc-lump").value));
    var lumpM = Math.round(num($("#calc-lumpm").value));
    var box = $("#calc-lump-result");
    if (lump > 0 && lumpM >= 1 && financed > 0) {
      var r = amortizeWithLump(financed, apr, term, lump, lumpM);
      box.style.display = "block";
      box.innerHTML = '<div class="lbl">Paying ' + money(lump, 0) + " after month " + lumpM + "</div>" +
        '<div class="val money" style="font-size:1.15rem">Saves ' + money(r.interestSaved, 0) + " in interest</div>" +
        '<div class="hint">Loan pays off in ' + r.newMonths + " months instead of " + r.baseMonths + " (" + r.monthsSaved + " months sooner).</div>";
    } else { box.style.display = "none"; }
  }
  function uniqueSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (n) { n = Math.round(n); if (n > 0 && !seen[n]) { seen[n] = 1; out.push(n); } });
    return out.sort(function (a, b) { return a - b; });
  }

  /* =========================================================== TEMPLATES (C) */
  function renderTemplates() {
    var s = $("#section-templates");
    var dealerOpts = '<option value="">— manual / no dealer —</option>' + data.dealers.map(function (d) {
      var v = d.vehicle; var name = (d.dealership || "Unnamed") + (v.model ? " · " + [v.make, v.model].filter(Boolean).join(" ") : "");
      return '<option value="' + d.id + '"' + (data.ui.tplDealer === d.id ? " selected" : "") + ">" + esc(name) + "</option>";
    }).join("");

    s.innerHTML =
      "<h1>Email templates</h1>" +
      '<p class="section-intro">Pick a dealer to auto-fill the merge fields, set your target number, then copy or ' +
      "open in your mail app. Every message stays out-the-door and in writing.</p>" +
      '<div class="card">' +
        '<div class="grid-2">' +
          field("Your name", '<input id="tpl-name" value="' + esc(data.ui.myName) + '" placeholder="For the sign-off">') +
          field("Fill from dealer", '<select id="tpl-dealer">' + dealerOpts + "</select>") +
        "</div>" +
        field("Target OTD (optional)", '<input id="tpl-target" inputmode="decimal" value="' + esc(data.ui.targetOtd) + '" placeholder="Your goal, e.g. 30000">') +
      "</div>" +
      '<div id="tpl-list"></div>' + flowNav("templates");

    $("#tpl-name").addEventListener("input", function () { data.ui.myName = this.value; save(); renderTplList(); });
    $("#tpl-dealer").addEventListener("change", function () { data.ui.tplDealer = this.value; save(); renderTplList(); });
    $("#tpl-target").addEventListener("input", function () { data.ui.targetOtd = this.value; save(); renderTplList(); });
    renderTplList();
  }

  // lowest OTD among OTHER dealers with a price (Infinity if none)
  function competingOtd(dealerId) {
    var best = Infinity;
    data.dealers.forEach(function (o) {
      if (o.id === dealerId) return; var c = dealerCalc(o); if (c.hasPrice && c.otd < best) best = c.otd;
    });
    return best;
  }
  function contextForDealer(d) {
    var ctx = { my_name: data.ui.myName };
    if (d) {
      var v = d.vehicle;
      ctx.dealer = d.dealership;
      ctx.contact = d.contact;
      ctx.vehicle = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
      var best = competingOtd(d.id);
      if (best < Infinity) ctx.competing_OTD = money(best, 0);
    }
    var target = num(data.ui.targetOtd);
    if (target > 0) ctx.target_OTD = money(target, 0);
    return ctx;
  }
  function tplContext() { return contextForDealer(findDealer(data.ui.tplDealer)); }
  function findRedFlag(id) { for (var i = 0; i < C.redFlags.length; i++) if (C.redFlags[i].id === id) return C.redFlags[i]; return null; }
  function merge(body, ctx) {
    return body
      .replace(/{dealer}/g, ctx.dealer || "[dealer]")
      .replace(/{contact}/g, ctx.contact || "there")
      .replace(/{vehicle}/g, ctx.vehicle || "[year make model trim]")
      .replace(/{competing_OTD}/g, ctx.competing_OTD || "[competing OTD]")
      .replace(/{target_OTD}/g, ctx.target_OTD || "[target OTD]")
      .replace(/{my_name}/g, ctx.my_name || "[your name]");
  }

  function renderTplList() {
    var ctx = tplContext();
    $("#tpl-list").innerHTML = C.templates.map(function (t) {
      var merged = merge(t.body, ctx);
      return '<div class="card">' +
        '<div class="dealer-head"><div><h3 style="margin-bottom:2px">' + esc(t.title) + "</h3>" +
          '<span class="tpl-cat">' + esc(t.category) + "</span></div></div>" +
        '<div class="tpl-body">' + esc(merged) + "</div>" +
        '<div class="btn-row" style="margin-bottom:10px">' +
          '<button class="btn btn-sm btn-primary" data-copy="' + t.id + '">Copy</button>' +
          '<button class="btn btn-sm" data-mail="' + t.id + '">Open in email</button>' +
        "</div>" +
        '<div class="tpl-why"><b>Why it works:</b> ' + esc(t.why) + "</div>" +
      "</div>";
    }).join("");

    $("#tpl-list").onclick = function (e) {
      var copyId = e.target.getAttribute && e.target.getAttribute("data-copy");
      var mailId = e.target.getAttribute && e.target.getAttribute("data-mail");
      if (copyId) { copyText(merge(getTpl(copyId).body, tplContext())); }
      else if (mailId) {
        var t = getTpl(mailId), c = tplContext();
        var subj = t.title + (c.vehicle ? " — " + c.vehicle : "");
        window.location.href = "mailto:?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(merge(t.body, c));
      }
    };
  }
  function getTpl(id) { for (var i = 0; i < C.templates.length; i++) if (C.templates[i].id === id) return C.templates[i]; }

  /* ========================================================== FEE DECODER (D) */
  function renderFees() {
    var s = $("#section-fees");
    s.innerHTML =
      "<h1>Fee decoder</h1>" +
      '<p class="section-intro">Search any line item on a quote. Each entry tells you what it is, the honest ' +
      "range, whether it’s negotiable, and the exact sentence to send back.</p>" +
      '<div class="toolbar"><input type="search" id="fee-search" placeholder="Search fees… (e.g. e-filing, doc, market adjustment)"></div>' +
      '<div class="btn-row" style="margin-bottom:12px">' +
        '<span class="chip cat-fixed">Fixed</span><span class="chip cat-negotiable">Negotiable</span><span class="chip cat-fake">Fake</span>' +
      "</div>" +
      '<div id="fee-list"></div>' + flowNav("fees");
    $("#fee-search").addEventListener("input", function () { renderFeeList(this.value); });
    renderFeeList("");
  }
  function renderFeeList(q) {
    q = (q || "").toLowerCase().trim();
    var items = C.fees.filter(function (fe) {
      if (!q) return true;
      return (fe.name + " " + fe.what + " " + fe.category + " " + fe.say).toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) { $("#fee-list").innerHTML = '<div class="empty"><p>No fees match “' + esc(q) + '.”</p></div>'; return; }
    $("#fee-list").innerHTML = items.map(function (fe) {
      return '<div class="card fee-entry">' +
        "<h3>" + esc(fe.name) + "</h3>" +
        '<div class="fee-meta"><span class="chip cat-' + fe.category + '">' + fe.category + "</span></div>" +
        "<p>" + esc(fe.what) + "</p>" +
        '<div class="fee-kv"><b>Typical range:</b> ' + esc(fe.range) + "</div>" +
        '<div class="fee-kv"><b>Negotiable?</b> ' + esc(fe.negotiable) + "</div>" +
        '<div class="fee-say">Say: ' + esc(fe.say) + "</div>" +
        (fe.state ? '<div class="state-note">📍 ' + esc(fe.state) + "</div>" : "") +
      "</div>";
    }).join("");
  }

  /* ============================== FIELD GUIDE: tile hub (F/G + insurance + playbook) */
  var guideView = "hub";
  function renderGuide() {
    var s = $("#section-guide");
    var back = '<div class="detail-bar"><button class="btn btn-sm" data-guide="hub">← Field guide</button></div>';
    var html;

    if (guideView === "flags") {
      html = back + "<h1>Red flags &amp; counter-moves</h1>" +
        '<p class="section-intro">The tactics dealers use, and exactly how to answer each one.</p>' +
        C.redFlags.map(function (rf) {
          return '<div class="flag"><div class="t">🚩 ' + esc(rf.tactic) + '</div><div class="c"><b>Counter:</b> ' + esc(rf.counter) + "</div></div>";
        }).join("");
    } else if (guideView === "share") {
      html = back + "<h1>What’s safe to share, and when</h1>" +
        '<p class="section-intro">Keep identity documents back until the price is locked in writing — ' +
        "premature SSN/DL sharing invites a credit pull you didn’t authorize.</p>" +
        C.infoSharing.map(function (st) {
          return '<div class="info-card"><div class="stage">' + esc(st.stage) + "</div>" +
            '<div class="safe">✓ Safe to share: ' + esc(st.safe) + "</div>" +
            '<div class="hold">✕ Hold back: ' + esc(st.hold) + "</div>" +
            '<div class="hint">' + esc(st.note) + "</div></div>";
        }).join("");
    } else if (guideView === "insurance") {
      html = back + "<h1>Finding the best car insurance</h1>" +
        '<p class="section-intro">Insurance is part of the real cost of the car — shop it with the same ' +
        "method: multiple quotes, identical coverage, in writing.</p>" +
        C.insurance.map(function (st) {
          return '<div class="step"><div class="n num">' + st.n + '</div><div class="body">' +
            "<h3>" + esc(st.title) + "</h3><p>" + esc(st.body) + "</p></div></div>";
        }).join("");
    } else if (guideView === "playbook") {
      html = back + "<h1>The full playbook</h1>" +
        '<p class="section-intro">The complete method, start to finish. (Track your progress with the ' +
        '<a href="#playbook">checklist</a>.)</p>' +
        C.playbook.map(function (p) {
          return '<div class="step"><div class="n num">' + p.n + '</div><div class="body">' +
            "<h3>" + esc(p.title) + "</h3><p>" + esc(p.body) + "</p>" +
            '<a class="btn btn-sm btn-ghost" href="#' + p.link + '">' + linkName(p.link) + " →</a></div></div>";
        }).join("");
    } else {
      html = "<h1>Field guide</h1>" +
        '<p class="section-intro">Reference guides for every part of the hunt — open one.</p>' +
        '<div class="tile-grid">' +
          '<button class="tile" data-guide="flags"><span class="tile-ico">🚩</span><span class="tile-t">Red flags</span><span class="tile-d">Dealer tactics &amp; counter-moves</span></button>' +
          '<button class="tile" data-guide="share"><span class="tile-ico">🔐</span><span class="tile-t">Safe to share</span><span class="tile-d">What info to give, and when</span></button>' +
          '<a class="tile" href="#fees"><span class="tile-ico">🔍</span><span class="tile-t">Fee decoder</span><span class="tile-d">Every fee, decoded</span></a>' +
          '<button class="tile" data-guide="insurance"><span class="tile-ico">🛡️</span><span class="tile-t">Car insurance</span><span class="tile-d">Finding the best coverage</span></button>' +
          '<button class="tile" data-guide="playbook"><span class="tile-ico">🧭</span><span class="tile-t">Full playbook</span><span class="tile-d">The whole method, in prose</span></button>' +
        "</div>" + flowNav("guide");
    }
    s.innerHTML = html;
    var tiles = s.querySelectorAll("[data-guide]");
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].addEventListener("click", function () {
        guideView = this.getAttribute("data-guide"); renderGuide(); window.scrollTo(0, 0);
      });
    }
  }

  /* ================================================================ DATA (H) */
  function renderData() {
    $("#section-data").innerHTML =
      "<h1>Your data</h1>" +
      '<div class="card"><h3>🔒 Private by design</h3>' +
        "<p>Everything you enter lives only in this browser’s local storage. Nothing is uploaded, tracked, or sent " +
        "anywhere — there’s no server and no account. Clearing your browser data (or using a different device) means " +
        "starting fresh, so back up with export below.</p></div>" +
      '<div class="card"><h3>Export</h3>' +
        "<p class=\"hint\">Download a JSON backup you can restore later or on another device.</p>" +
        '<button class="btn btn-primary btn-block" id="export-btn">Download backup (.json)</button></div>' +
      '<div class="card"><h3>Import / restore</h3>' +
        '<p class="hint">Paste a backup below, or choose a file. This replaces your current data.</p>' +
        '<textarea id="import-text" placeholder="Paste backup JSON here…"></textarea>' +
        '<div class="btn-row" style="margin-top:8px"><button class="btn" id="import-btn">Restore from text</button>' +
        '<label class="btn" style="cursor:pointer">Choose file…<input type="file" id="import-file" accept="application/json,.json" style="display:none"></label></div></div>' +
      '<div class="card"><h3>Start over</h3>' +
        '<p class="hint">Delete every dealer and reset to defaults. This cannot be undone.</p>' +
        '<button class="btn btn-danger btn-block" id="clear-btn">Clear all data</button></div>' +
      flowNav("data");

    $("#export-btn").addEventListener("click", exportData);
    $("#import-btn").addEventListener("click", function () { importFromText($("#import-text").value); });
    $("#import-file").addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { importFromText(reader.result); };
      reader.readAsText(file);
    });
    $("#clear-btn").addEventListener("click", function () {
      confirmAction("Clear all data?", "Every dealer, quote, and setting will be deleted. This cannot be undone.",
        "Clear everything", function () {
          data = defaultData(); data.ui.onboarded = true; save(); renderAll(); toast("Cleared");
        });
    });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "carbuddy-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); toast("Backup downloaded");
  }
  function importFromText(text) {
    try {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !("version" in parsed) && !("dealers" in parsed))
        throw new Error("Not a CarBuddy backup");
      var migrated = migrate(parsed);
      var d = defaultData();
      migrated.financing = Object.assign(d.financing, migrated.financing || {});
      migrated.ui = Object.assign(d.ui, migrated.ui || {});
      migrated.ui.find = Object.assign(defaultFind(), migrated.ui.find || {});
      migrated.progress = Object.assign(d.progress, migrated.progress || {});
      if (!migrated.progress.steps || typeof migrated.progress.steps !== "object") migrated.progress.steps = {};
      if (!Array.isArray(migrated.dealers)) migrated.dealers = [];
      data = migrated; save(); renderAll(); toast("Restored " + data.dealers.length + " dealer(s)");
    } catch (e) {
      toast("That doesn’t look like a valid backup.");
    }
  }

  /* -------------------------------------------------------------- rendering */
  var SECTIONS = ["home", "playbook", "find", "cars", "dashboard", "detail", "calculator", "templates", "fees", "guide", "data"];
  function renderAll() {
    renderHome(); renderPlaybook(); renderFind(); renderCars(); renderDashboard(); renderCalculator();
    renderTemplates(); renderFees(); renderGuide(); renderData();
    route();
  }
  var RENDERERS = {
    home: renderHome, playbook: renderPlaybook, find: renderFind, cars: renderCars,
    dashboard: renderDashboard, detail: renderDetail, calculator: renderCalculator,
    templates: renderTemplates, fees: renderFees, guide: renderGuide, data: renderData
  };
  function renderActive() { var id = current(); if (RENDERERS[id]) RENDERERS[id](); }

  function current() {
    var h = (location.hash || "").replace("#", "");
    if (h.indexOf("dealer/") === 0) return "detail";
    if (SECTIONS.indexOf(h) >= 0 && h !== "detail") return h;
    var saved = data.ui.activeSection;
    return (SECTIONS.indexOf(saved) >= 0 && saved !== "detail") ? saved : "home";
  }
  function route() {
    var id = current();
    var h = (location.hash || "").replace("#", "");
    if (id === "detail") renderDetail(h.slice("dealer/".length));
    SECTIONS.forEach(function (s) {
      var sec = $("#section-" + s); if (sec) sec.classList.toggle("active", s === id);
    });
    var links = document.querySelectorAll("#drawer a");
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle("active", links[i].getAttribute("href") === "#" + id);
    }
    // bottom tab bar: detail belongs to the OTD tab
    var tabId = id === "detail" ? "dashboard" : id;
    var tabs = document.querySelectorAll("#tabbar a");
    for (var t2 = 0; t2 < tabs.length; t2++) {
      tabs[t2].classList.toggle("active", tabs[t2].getAttribute("data-tab") === tabId);
    }
    // full brand header on Home only; compact everywhere else
    document.body.classList.toggle("compact-top", id !== "home");
    if (id !== "detail" && data.ui.activeSection !== id) { data.ui.activeSection = id; save(); }
    // sections that depend on cross-section data are refreshed on entry
    if (id === "home") renderHome();
    if (id === "templates") renderTemplates();
    if (id === "dashboard") renderDashboard();
    if (id === "cars") renderCars();
    if (id === "playbook") renderPlaybook();
    setMenu(false);
    closeModal();
    window.scrollTo(0, 0);
  }

  /* --------------------------------------------------------- hamburger menu */
  function menuOpen() { return $("#drawer").classList.contains("open"); }
  function setMenu(open) {
    var d = $("#drawer"), sc = $("#scrim"), btn = $("#menu-btn");
    d.classList.toggle("open", open);
    d.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("no-scroll", open);
    if (open) { sc.hidden = false; requestAnimationFrame(function () { sc.classList.add("show"); }); }
    else { sc.classList.remove("show"); setTimeout(function () { if (!menuOpen()) sc.hidden = true; }, 220); }
  }
  // playbook checklist toggles (delegated once on the persistent section element)
  $("#section-playbook").addEventListener("click", function (e) {
    var tog = e.target.closest("[data-toggle]");
    if (tog) {
      var n = tog.getAttribute("data-toggle");
      data.progress.steps[n] = !data.progress.steps[n];
      save(); renderPlaybook(); return;
    }
    if (e.target.closest("[data-reset-progress]")) {
      data.progress.steps = {}; save(); renderPlaybook();
    }
  });

  $("#menu-btn").addEventListener("click", function () { setMenu(!menuOpen()); });
  $("#menu-close").addEventListener("click", function () { setMenu(false); });
  $("#scrim").addEventListener("click", function () { setMenu(false); });
  $("#drawer").addEventListener("click", function (e) {
    if (e.target.closest("#replay-intro")) { e.preventDefault(); setMenu(false); startOnboarding(); return; }
    if (e.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("#modal-wrap").hidden) { closeModal(); return; }
    if (menuOpen()) setMenu(false);
  });

  // modal chrome (close button anywhere inside, scrim click)
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-modal-close]")) closeModal();
  });
  $("#modal-scrim").addEventListener("click", closeModal);

  /* ------------------------------------------------------------- onboarding */
  var onbStep = 0;
  function startOnboarding() { onbStep = 0; renderOnboarding(); $("#onboarding").hidden = false; document.body.classList.add("no-scroll"); }
  function finishOnboarding() {
    data.ui.onboarded = true; save();
    $("#onboarding").hidden = true; document.body.classList.remove("no-scroll");
    location.hash = "#home"; renderHome();
  }
  function renderOnboarding() {
    var o = $("#onboarding"), html = "";
    if (onbStep === 0) {
      html = '<div class="onb-screen onb-splash">' +
        '<div class="onb-art">🚗</div>' +
        '<div class="onb-logo">CarBuddy</div>' +
        '<h2 class="onb-tag">Buy your car<br>without the stress.</h2>' +
        '<p class="onb-sub">The process dealers hope you never learn — turned into a calm, step-by-step toolkit.</p>' +
        '<p class="onb-privacy"><span class="dot"></span> Everything stays in your browser. Nothing is ever uploaded.</p>' +
        '<div class="onb-actions">' +
          '<button class="btn btn-primary btn-lg" data-onb-next>Get started</button>' +
          '<button class="btn btn-ghost" data-onb-skip>Skip the intro</button>' +
        "</div></div>";
    } else if (onbStep === 1) {
      var cards = C.onboarding.map(function (c, i) {
        return '<div class="onb-card" data-idx="' + i + '">' +
          '<div class="onb-card-icon">' + c.icon + "</div>" +
          "<h3>" + esc(c.title) + "</h3><p>" + esc(c.body) + "</p></div>";
      }).join("");
      var dots = C.onboarding.map(function (_, i) {
        return '<span class="onb-dot' + (i === 0 ? " on" : "") + '" data-dot="' + i + '"></span>';
      }).join("");
      html = '<div class="onb-screen">' +
        '<h2 class="onb-head">How it works</h2>' +
        '<p class="onb-sub">Four moves. Swipe through them →</p>' +
        '<div class="onb-carousel" id="onb-carousel">' + cards + "</div>" +
        '<div class="onb-dots">' + dots + "</div>" +
        '<div class="onb-actions">' +
          '<button class="btn btn-primary btn-lg" data-onb-next>Next — your numbers</button>' +
          '<button class="btn btn-ghost" data-onb-skip>Skip</button>' +
        "</div></div>";
    } else {
      html = '<div class="onb-screen">' +
        '<h2 class="onb-head">Your financing details</h2>' +
        '<p class="onb-sub">These power every payment and out-the-door number in the app. ' +
        "Estimates are fine — you can change them anytime.</p>" +
        field("Your first name (for email sign-offs)", '<input id="onb-name" value="' + esc(data.ui.myName) + '" placeholder="Optional">') +
        financingControls("onb") +
        '<div class="onb-actions">' +
          '<button class="btn btn-primary btn-lg" data-onb-done>Take me home →</button>' +
        "</div></div>";
    }
    o.innerHTML = html;
    var nx = o.querySelector("[data-onb-next]"), sk = o.querySelector("[data-onb-skip]"), dn = o.querySelector("[data-onb-done]");
    if (nx) nx.addEventListener("click", function () { onbStep++; renderOnboarding(); });
    if (sk) sk.addEventListener("click", finishOnboarding);
    if (dn) dn.addEventListener("click", function () {
      var n = o.querySelector("#onb-name"); if (n) { data.ui.myName = n.value.trim(); save(); }
      finishOnboarding();
    });
    var name = o.querySelector("#onb-name");
    if (name) name.addEventListener("input", function () { data.ui.myName = name.value; save(); });
    if (onbStep === 2) wireFinancing(o, function () {});
    var car = o.querySelector("#onb-carousel");
    if (car) car.addEventListener("scroll", function () {
      // pick the card whose center is nearest the viewport center (cards are 86% wide + gaps)
      var center = car.scrollLeft + car.clientWidth / 2;
      var cards2 = car.querySelectorAll(".onb-card");
      var best = 0, bestDist = Infinity;
      for (var c2 = 0; c2 < cards2.length; c2++) {
        var mid = cards2[c2].offsetLeft + cards2[c2].offsetWidth / 2;
        var dist = Math.abs(mid - center);
        if (dist < bestDist) { bestDist = dist; best = c2; }
      }
      var dots2 = o.querySelectorAll(".onb-dot");
      for (var k = 0; k < dots2.length; k++) dots2[k].classList.toggle("on", k === best);
    }, { passive: true });
  }

  wireDetail();
  window.addEventListener("hashchange", route);
  renderAll();
  if (!location.hash) location.hash = "#" + current();
  if (!data.ui.onboarded) startOnboarding();
})();
