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
      ui: { activeSection: "playbook", myName: "", targetOtd: "", tplDealer: "" }
    };
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
        // re-render the section so the tax-rate field reflects the preset
        renderActive();
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
      '<div class="hero">' +
        "<h1>Buy your car<br>without the stress.</h1>" +
        "<p>You’re about to run the process dealers hope you never learn: contact many dealers at " +
        "once, compare on out-the-door price only, keep everything in writing, and decode every fee. " +
        "Here’s your step-by-step.</p>" +
        '<div class="principles">' +
          '<span class="principle">📨 Many dealers at once</span>' +
          '<span class="principle">🏷️ Out-the-door only</span>' +
          '<span class="principle">✍️ In writing</span>' +
          '<span class="principle">🔍 Every fee decoded</span>' +
        "</div>" +
        '<a class="btn btn-primary btn-lg" href="#dashboard">Start — set up your dealers →</a>' +
      "</div>" +
      '<div class="progress-wrap">' +
        '<div class="progress-head"><h2 class="onb-h" style="margin:0">Your 7-step playbook</h2>' +
          '<span class="progress-count num">' + done + " / " + total + "</span></div>" +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        (allDone
          ? '<p class="progress-msg">🎉 Every step done — go get your car.</p>'
          : '<p class="hint">Tick each step as you finish it. Your progress is saved on this device.</p>') +
        (done > 0 ? '<button class="btn btn-sm btn-ghost" data-reset-progress>Reset checklist</button>' : "") +
      "</div>" +
      '<div class="tl">' + steps + "</div>";
  }
  function linkName(id) {
    return { playbook: "Home", dashboard: "Dealers", calculator: "Calculator",
             templates: "Emails", fees: "Fee Decoder", guide: "Field Guide", data: "Your Data" }[id] || id;
  }

  // linear prev/next footer so the process flows without a persistent nav
  var FLOW = ["playbook", "dashboard", "calculator", "templates", "fees", "guide", "data"];
  function flowNav(id) {
    var i = FLOW.indexOf(id);
    var prev = i > 0 ? FLOW[i - 1] : null;
    var next = i < FLOW.length - 1 ? FLOW[i + 1] : null;
    var left = prev ? '<a class="btn btn-sm" href="#' + prev + '">← ' + linkName(prev) + "</a>" : "<span></span>";
    var right = next ? '<a class="btn btn-sm btn-primary" href="#' + next + '">' + linkName(next) + " →</a>" : "<span></span>";
    return '<div class="flow-nav">' + left + right + "</div>";
  }

  /* =========================================================== DASHBOARD (A) */
  function renderDashboard() {
    var s = $("#section-dashboard");
    var head = "<h1>Dealer comparison</h1>" +
      '<p class="section-intro">Log every dealer’s itemized out-the-door quote. Lowest OTD and lowest ' +
      "monthly payment are highlighted automatically.</p>" +
      financingControls("dash") +
      '<div class="btn-row" style="margin:14px 0 0">' +
        '<button class="btn btn-primary" id="add-dealer">+ Add dealer</button>' +
        '<button class="btn" id="toggle-import">⬆ Import a quote</button>' +
      "</div>" +
      '<div class="card import-panel" id="import-panel" hidden>' +
        "<h3>Import a dealer quote</h3>" +
        '<p class="hint">Upload a <b>photo</b> or <b>PDF</b> of a quote, an email/<b>.txt</b>/<b>.eml</b>/<b>.csv</b>, ' +
        "or a CarBuddy <b>.json</b> — or paste the text. Photos and PDFs are read with an on-device " +
        "text reader: <b>the file never leaves your browser</b>. Reading is best-effort, so review the " +
        "prefilled fields afterward.</p>" +
        '<div class="btn-row" style="margin-bottom:10px">' +
          '<label class="btn btn-sm" style="cursor:pointer">Choose file…' +
            '<input type="file" id="quote-file" accept=".txt,.eml,.json,.csv,.md,.text,.pdf,image/*,application/pdf,text/*,message/rfc822" style="display:none"></label>' +
        "</div>" +
        '<div class="import-status" id="import-status" hidden></div>' +
        '<textarea id="quote-text" placeholder="…or paste the dealer’s quote / email here"></textarea>' +
        '<div class="btn-row" style="margin-top:8px">' +
          '<button class="btn btn-primary btn-sm" id="parse-quote">Parse &amp; add dealer</button>' +
          '<button class="btn btn-sm btn-ghost" id="cancel-import">Cancel</button>' +
        "</div>" +
      "</div>";

    var body;
    if (!data.dealers.length) {
      body = '<div class="empty"><div class="big">📋</div>' +
        "<p>No dealers yet. Add the first one, then send them all the same out-the-door request.</p>" +
        '<a class="btn btn-sm" href="#templates">Get the email template →</a></div>';
    } else {
      body = data.dealers.map(dealerCard).join("");
    }
    s.innerHTML = head + '<div id="dealer-list">' + body + "</div>" + flowNav("dashboard");

    wireFinancing(s, updateComputed);
    $("#add-dealer").addEventListener("click", addDealer);
    wireImport();
    wireDealerList();
    updateComputed();
  }

  function wireImport() {
    var panel = $("#import-panel");
    $("#toggle-import").addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { panel.scrollIntoView({ block: "nearest" }); $("#quote-text").focus(); }
    });
    $("#cancel-import").addEventListener("click", function () {
      panel.hidden = true; $("#quote-text").value = ""; setImportStatus("");
    });
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
          setImportStatus("Couldn’t read that file: " + ((err && err.message) || err));
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

  function handleParse(text) {
    text = (text || "").trim();
    if (!text) { toast("Paste or choose a quote first."); return; }
    if (looksJson(text)) {
      try {
        var obj = JSON.parse(text);
        var dealerObj = obj && Array.isArray(obj.dealers) ? obj.dealers[0] : obj;
        if (dealerObj && typeof dealerObj === "object") { addParsedDealer(fromJsonDealer(dealerObj)); return; }
      } catch (e) { /* not valid JSON — fall through to text parsing */ }
    }
    if (!window.CARBUDDY_PARSE) { toast("Parser unavailable."); return; }
    addParsedDealer(window.CARBUDDY_PARSE.parseQuote(text));
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
    var d = {
      id: uid("d_"), dealership: p.dealership || "", contact: p.contact || "", status: "quoted",
      vehicle: {
        year: pv.year || "", make: pv.make || "", model: pv.model || "", trim: pv.trim || "",
        color: pv.color || "", vin: pv.vin || "", stock: pv.stock || ""
      },
      quote: {
        salePrice: num(p.salePrice) || 0,
        fees: (p.fees || []).map(function (f) {
          return { id: uid("f_"), label: f.label || "Fee", amount: num(f.amount) || 0,
                   category: f.category || "negotiable", taxable: f.taxable !== false };
        })
      },
      notes: "", tactics: [], createdAt: Date.now(), updatedAt: Date.now()
    };
    data.dealers.push(d); save();
    var found = countFound(d);
    $("#import-panel").hidden = true; $("#quote-text").value = "";
    renderDashboard();
    var card = $('.dealer-card[data-id="' + d.id + '"]');
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("flash");
      setTimeout(function () { card.classList.remove("flash"); }, 1500);
    }
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
      '<div class="grid-2">' +
        field("VIN", '<input data-vf="vin" value="' + esc(v.vin) + '">') +
        field("Stock #", '<input data-vf="stock" value="' + esc(v.stock) + '">') +
      "</div>" +

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

  function addDealer() {
    data.dealers.push({
      id: uid("d_"), dealership: "", contact: "", status: "contacted",
      vehicle: { year: "", make: "", model: "", trim: "", color: "", vin: "", stock: "" },
      quote: { salePrice: 0, fees: [] }, notes: "", tactics: [],
      createdAt: Date.now(), updatedAt: Date.now()
    });
    save(); renderDashboard();
  }

  function findDealer(id) { for (var i = 0; i < data.dealers.length; i++) if (data.dealers[i].id === id) return data.dealers[i]; return null; }

  function wireDealerList() {
    var list = $("#dealer-list");
    if (!list) return;

    // text/number/select edits (no full re-render → inputs keep focus)
    list.addEventListener("input", onDealerEdit);
    list.addEventListener("change", onDealerEdit);

    // button actions (discrete → safe to re-render)
    list.addEventListener("click", function (e) {
      var card = e.target.closest(".dealer-card"); if (!card) return;
      var d = findDealer(card.getAttribute("data-id")); if (!d) return;

      if (e.target.closest("[data-del-dealer]")) {
        if (confirm("Delete this dealer and its quote?")) {
          data.dealers = data.dealers.filter(function (x) { return x.id !== d.id; });
          save(); renderDashboard();
        }
      } else if (e.target.closest("[data-add-fee]")) {
        d.quote.fees.push({ id: uid("f_"), label: "", amount: 0, category: "negotiable", taxable: true });
        touch(d); renderDashboard();
      } else if (e.target.closest("[data-quick-fees]")) {
        d.quote.fees.push(
          { id: uid("f_"), label: "Doc fee", amount: 0, category: "negotiable", taxable: true },
          { id: uid("f_"), label: "Electronic filing", amount: 0, category: "fake", taxable: true },
          { id: uid("f_"), label: "Title & registration", amount: 0, category: "fixed", taxable: false }
        );
        touch(d); renderDashboard();
      } else if (e.target.closest("[data-del-fee]")) {
        var row = e.target.closest("[data-fee]");
        var fid = row.getAttribute("data-fee");
        d.quote.fees = d.quote.fees.filter(function (f) { return f.id !== fid; });
        touch(d); renderDashboard();
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

  /* ========================================================== CALCULATOR (B) */
  function renderCalculator() {
    var s = $("#section-calculator");
    s.innerHTML =
      "<h1>Payment calculator</h1>" +
      '<p class="section-intro">Model any price against your shared financing. Then compare terms, and ' +
      "see what a later lump-sum payment (like selling your old car) would save.</p>" +
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

  function tplContext() {
    var d = findDealer(data.ui.tplDealer);
    var ctx = { my_name: data.ui.myName };
    if (d) {
      var v = d.vehicle;
      ctx.dealer = d.dealership;
      ctx.contact = d.contact;
      ctx.vehicle = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
      // competing OTD = lowest OTD among OTHER dealers with a price
      var best = Infinity;
      data.dealers.forEach(function (o) {
        if (o.id === d.id) return; var c = dealerCalc(o); if (c.hasPrice && c.otd < best) best = c.otd;
      });
      if (best < Infinity) ctx.competing_OTD = money(best, 0);
    }
    var target = num(data.ui.targetOtd);
    if (target > 0) ctx.target_OTD = money(target, 0);
    return ctx;
  }
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

  /* ================================================= GUIDE: red flags + info (F/G) */
  function renderGuide() {
    var flags = C.redFlags.map(function (rf) {
      return '<div class="flag"><div class="t">🚩 ' + esc(rf.tactic) + '</div><div class="c"><b>Counter:</b> ' + esc(rf.counter) + "</div></div>";
    }).join("");
    var info = C.infoSharing.map(function (st) {
      return '<div class="info-card"><div class="stage">' + esc(st.stage) + "</div>" +
        '<div class="safe">✓ Safe to share: ' + esc(st.safe) + "</div>" +
        '<div class="hold">✕ Hold back: ' + esc(st.hold) + "</div>" +
        '<div class="hint">' + esc(st.note) + "</div></div>";
    }).join("");
    $("#section-guide").innerHTML =
      "<h1>Field guide</h1>" +
      '<p class="section-intro">The tactics dealers use, the counter-move for each, and exactly what personal ' +
      "information is safe to share at each stage.</p>" +
      "<h2>Red flags &amp; counter-moves</h2>" + flags +
      '<div class="divider"></div>' +
      "<h2>What’s safe to share, and when</h2>" +
      '<p class="hint" style="margin-bottom:12px">Keep identity documents back until the price is locked in writing — ' +
      "premature SSN/DL sharing invites a credit pull you didn’t authorize.</p>" + info + flowNav("guide");
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
      if (confirm("Delete all dealers and reset? This cannot be undone.")) {
        data = defaultData(); save(); renderAll(); toast("Cleared");
      }
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
      migrated.progress = Object.assign(d.progress, migrated.progress || {});
      if (!migrated.progress.steps || typeof migrated.progress.steps !== "object") migrated.progress.steps = {};
      if (!Array.isArray(migrated.dealers)) migrated.dealers = [];
      data = migrated; save(); renderAll(); toast("Restored " + data.dealers.length + " dealer(s)");
    } catch (e) {
      toast("That doesn’t look like a valid backup.");
    }
  }

  /* -------------------------------------------------------------- rendering */
  var SECTIONS = ["playbook", "dashboard", "calculator", "templates", "fees", "guide", "data"];
  function renderAll() {
    renderPlaybook(); renderDashboard(); renderCalculator();
    renderTemplates(); renderFees(); renderGuide(); renderData();
    route();
  }
  var RENDERERS = {
    playbook: renderPlaybook, dashboard: renderDashboard, calculator: renderCalculator,
    templates: renderTemplates, fees: renderFees, guide: renderGuide, data: renderData
  };
  function renderActive() { var id = current(); if (RENDERERS[id]) RENDERERS[id](); }

  function current() {
    var h = (location.hash || "").replace("#", "");
    return SECTIONS.indexOf(h) >= 0 ? h : (data.ui.activeSection || "playbook");
  }
  function route() {
    var id = current();
    SECTIONS.forEach(function (s) {
      var sec = $("#section-" + s); if (sec) sec.classList.toggle("active", s === id);
    });
    var links = document.querySelectorAll("#drawer a");
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle("active", links[i].getAttribute("href") === "#" + id);
    }
    if (data.ui.activeSection !== id) { data.ui.activeSection = id; save(); }
    // sections that depend on cross-section data are refreshed on entry
    if (id === "templates") renderTemplates();
    if (id === "dashboard") updateComputed();
    setMenu(false);
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
  $("#drawer").addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menuOpen()) setMenu(false); });

  window.addEventListener("hashchange", route);
  renderAll();
  if (!location.hash) location.hash = "#" + (data.ui.activeSection || "playbook");
})();
