/* CarBuddy quote parser — extracts dealer/vehicle/price/fee fields from a pasted or
   uploaded text quote. Runs entirely in the browser; no dependencies, nothing uploaded.
   Heuristic and best-effort by design — every field lands in an editable card to verify. */
(function (root) {
  "use strict";

  var MAKES = [
    "Alfa Romeo", "Aston Martin", "Land Rover", "Range Rover", "Mercedes-Benz",
    "Acura", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Chevrolet", "Chevy",
    "Chrysler", "Dodge", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hyundai",
    "Infiniti", "Jaguar", "Jeep", "Kia", "Lexus", "Lincoln", "Maserati", "Mazda",
    "Mercedes", "Mini", "Mitsubishi", "Nissan", "Polestar", "Porsche", "Ram",
    "Rivian", "Subaru", "Tesla", "Toyota", "Volkswagen", "VW", "Volvo"
  ];
  var MAKE_CANON = {
    "chevy": "Chevrolet", "vw": "Volkswagen", "mercedes": "Mercedes-Benz",
    "range rover": "Land Rover"
  };

  // fee specs: first matching key wins per spec. `provides`/`consumes` dedupe a combined
  // "title & registration" line against separate title / registration lines.
  var FEE_SPECS = [
    { keys: ["electronic filing", "electronic registration filing", "e-filing", "efiling", "e file"],
      label: "Electronic filing", category: "fake", taxable: true },
    { keys: ["documentation fee", "documentary fee", "doc fee", "dealer doc fee", "dealer documentation"],
      label: "Doc fee", category: "negotiable", taxable: true },
    { keys: ["predelivery service charge", "predelivery", "pre-delivery", "pre delivery", "pdi"],
      label: "Predelivery service charge", category: "fake", taxable: true },
    { keys: ["dealer preparation", "dealer prep"], label: "Dealer prep", category: "fake", taxable: true },
    { keys: ["dealer add-on", "dealer add on", "protection package", "appearance package",
      "dealer services", "dealer addendum", "addendum"], label: "Dealer add-ons", category: "fake", taxable: true },
    { keys: ["nitrogen"], label: "Nitrogen tires", category: "fake", taxable: true },
    { keys: ["vin etching", "etching"], label: "VIN etching", category: "fake", taxable: true },
    { keys: ["paint and fabric protection", "paint & fabric", "paint protection", "fabric protection"],
      label: "Paint & fabric protection", category: "fake", taxable: true },
    { keys: ["gap insurance", "gap coverage"], label: "GAP insurance", category: "negotiable", taxable: false },
    { keys: ["extended warranty", "vehicle service contract", "service contract", "vsc"],
      label: "Extended warranty (VSC)", category: "negotiable", taxable: false },
    { keys: ["additional dealer markup", "market adjustment", "market adj", "adm"],
      label: "Market adjustment", category: "negotiable", taxable: true },
    { keys: ["destination charge", "destination", "freight"], label: "Destination", category: "fixed", taxable: true },
    { keys: ["advertising fee", "regional advertising", "advertising"], label: "Advertising fee", category: "negotiable", taxable: false },
    // combined title+reg first, so it consumes the separate lines below
    { keys: ["title & registration", "title and registration", "title/registration", "title/reg",
      "tag & title", "tag and title", "title, tag", "tag/title"], label: "Title & registration",
      category: "fixed", taxable: false, provides: "titlereg" },
    { keys: ["title fee", "title"], label: "Title fee", category: "fixed", taxable: false, consumes: ["titlereg"] },
    { keys: ["registration fee", "registration", "tag fee", "license plate fee", "license fee"],
      label: "Registration / tag", category: "fixed", taxable: false, consumes: ["titlereg"] }
  ];

  var SALE_KEYS = ["agreed sale price", "negotiated price", "sale price", "selling price",
    "sales price", "vehicle price", "internet price", "e-price", "cash price", "unit price"];

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function toNumber(s) {
    if (s == null) return 0;
    var n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  }
  function clean(s) { return String(s).replace(/\s+/g, " ").trim(); }

  // find the first dollar amount that follows any of `keys` on the same line
  function findAmount(text, keys) {
    for (var i = 0; i < keys.length; i++) {
      var re = new RegExp("\\b" + escRe(keys[i]) + "\\b[^0-9\\n$]*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", "i");
      var m = text.match(re);
      if (m) { var v = toNumber(m[1]); if (v > 0) return v; }
    }
    return null;
  }

  function normalizeMake(m) {
    var low = m.toLowerCase();
    if (MAKE_CANON[low]) return MAKE_CANON[low];
    if (/^(bmw|gmc|vw)$/i.test(m)) return m.toUpperCase();
    return m.replace(/\b[a-z]/gi, function (c, i) { return c.toUpperCase(); })
            .replace(/([A-Za-z])([A-Za-z]*)/g, function (_, a, b) { return a.toUpperCase() + b.toLowerCase(); });
  }

  function findVehicle(text) {
    var v = {};
    var vin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
    if (vin && /[A-Za-z]/.test(vin[1]) && /[0-9]/.test(vin[1])) v.vin = vin[1].toUpperCase();

    var makesAlt = MAKES.slice().sort(function (a, b) { return b.length - a.length; }).map(escRe).join("|");
    var vre = new RegExp("\\b(19[89]\\d|20[0-4]\\d)\\s+(" + makesAlt + ")\\b[ \\t]*([^\\n,;|]*)", "i");
    var vm = text.match(vre);
    if (vm) {
      v.year = vm[1];
      v.make = normalizeMake(vm[2]);
      var rest = clean(vm[3] || "").split(" ").filter(Boolean);
      // drop trailing noise tokens (VIN/stock words, punctuation-only)
      rest = rest.filter(function (t) { return !/^(vin|stock|#|color|colou?r)$/i.test(t); });
      if (rest.length) {
        v.model = rest[0];
        if (rest.length > 1) v.trim = rest.slice(1, 3).join(" ");
      }
    }
    var st = text.match(/\bstock\s*(?:#|no\.?|number|num)?\s*[:#]?\s*#?\s*([A-Za-z0-9][A-Za-z0-9-]{1,})/i);
    if (st) v.stock = st[1];
    var col = text.match(/\b(?:exterior(?:\s+colou?r)?|colou?r)\b\s*[:#-]?\s*([A-Za-z][A-Za-z ]{2,20}?)\s*(?:\n|,|;|\.|\||$)/i);
    if (col) v.color = clean(col[1]);
    return v;
  }

  function findDealership(text) {
    var lines = text.split(/\n/);
    var re = new RegExp("([A-Z][A-Za-z0-9&'.\\- ]{1,38}?\\b(?:Toyota|Honda|Ford|Chevrolet|Chevy|Nissan|Kia|" +
      "Hyundai|Subaru|Mazda|BMW|Mercedes(?:-Benz)?|Lexus|Acura|Jeep|Dodge|Ram|GMC|Buick|Cadillac|" +
      "Volkswagen|Audi|Volvo|Mitsubishi|Genesis|Infiniti|Lincoln|Porsche|Tesla|Chrysler|Motors|" +
      "Automotive|Auto Group|Auto Mall|AutoNation|Autopark|Superstore)\\b" +
      "(?:\\s+of\\s+[A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+)*)?)");
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/\b(19[89]\d|20[0-4]\d)\b/.test(ln)) continue;   // skip vehicle/year lines
      if (/@/.test(ln) && !/\s/.test(ln.trim())) continue; // skip bare email addresses
      var m = ln.match(re);
      if (m) return clean(m[1]);
    }
    return "";
  }

  function findContact(text) {
    var m = text.match(/^\s*from:\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){0,2})\s*(?:<|\(|$)/im);
    if (m) return clean(m[1]);
    m = text.match(/(?:sales\s*(?:person|man|consultant|rep(?:resentative)?|associate|manager)|your\s+(?:sales\s+)?(?:rep|consultant)|contact)\s*[:\-]?\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})/i);
    if (m) return clean(m[1]);
    m = text.match(/(?:thanks|thank you|best|best regards|kind regards|regards|sincerely|cheers|warmly)[,!.]?\s*[\r\n]+\s*([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,1})\s*(?:\n|$)/i);
    if (m) return clean(m[1]);
    return "";
  }

  function parseQuote(text) {
    text = String(text || "");
    var out = { vehicle: findVehicle(text), fees: [] };
    out.dealership = findDealership(text);
    out.contact = findContact(text);
    var sp = findAmount(text, SALE_KEYS);
    if (sp != null) out.salePrice = sp;

    var provided = {};
    FEE_SPECS.forEach(function (spec) {
      if (spec.consumes && spec.consumes.some(function (g) { return provided[g]; })) return;
      var amt = findAmount(text, spec.keys);
      if (amt != null) {
        out.fees.push({ label: spec.label, amount: amt, category: spec.category, taxable: spec.taxable });
        if (spec.provides) provided[spec.provides] = true;
      }
    });
    return out;
  }

  var api = { parseQuote: parseQuote };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CARBUDDY_PARSE = api;
})(typeof window !== "undefined" ? window : this);
