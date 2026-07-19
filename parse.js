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
    "sales price", "vehicle price", "internet price", "e-price", "cash price", "unit price",
    "list price", "listing price", "asking price", "our price", "sale/special price", "price"];

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
    var mi = text.match(/\b([1-9][\d,]{2,6})\s*(?:mi|miles)\b/i) || text.match(/\b(?:mileage|odometer)\b\s*[:\-]?\s*([\d,]{3,})/i);
    if (mi) { var mn = toNumber(mi[1]); if (mn >= 100 && mn < 1000000) v.mileage = String(mn); }
    return v;
  }

  // JSON-LD Vehicle/Car schema (present when a listing page's HTML source is pasted)
  function parseJsonLd(text) {
    var out = { vehicle: {} };
    var re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m;
    while ((m = re.exec(text))) {
      var json; try { json = JSON.parse(m[1].trim()); } catch (e) { continue; }
      var nodes = Array.isArray(json) ? json : (json["@graph"] ? json["@graph"] : [json]);
      nodes.forEach(function (n) {
        if (!n || typeof n !== "object") return;
        var t = String(n["@type"] || "").toLowerCase();
        if (t.indexOf("car") < 0 && t.indexOf("vehicle") < 0 && t.indexOf("product") < 0) return;
        if (n.vehicleIdentificationNumber) out.vehicle.vin = String(n.vehicleIdentificationNumber).toUpperCase();
        var yr = n.modelDate || n.vehicleModelDate || n.productionDate;
        if (yr) out.vehicle.year = String(yr).slice(0, 4);
        if (n.brand) out.vehicle.make = String(n.brand.name || n.brand);
        if (n.model) out.vehicle.model = String(n.model.name || n.model);
        if (n.vehicleConfiguration || n.trim) out.vehicle.trim = String(n.vehicleConfiguration || n.trim);
        if (n.mileageFromOdometer != null) {
          var mo = n.mileageFromOdometer; out.vehicle.mileage = String(toNumber(mo.value != null ? mo.value : mo));
        }
        var offers = n.offers ? (Array.isArray(n.offers) ? n.offers[0] : n.offers) : null;
        if (offers && offers.price) out.salePrice = toNumber(offers.price);
        if (offers && offers.seller && offers.seller.name) out.dealership = String(offers.seller.name);
        if (!out.dealership && n.seller && n.seller.name) out.dealership = String(n.seller.name);
      });
    }
    return out;
  }

  // Parse whatever is encoded in a listing URL itself (no network — works offline & private).
  // Dealer-site listing URLs usually carry year/make/model/trim + VIN in the path.
  function parseListingUrl(url) {
    var out = { vehicle: {}, listingUrl: url };
    var u = null; try { u = new URL(url); } catch (e) { /* not a full URL */ }
    var raw; try { raw = decodeURIComponent(url); } catch (e) { raw = url; }
    var pathText = ((u ? u.pathname : raw)).replace(/[-_+/.]+/g, " ")
      .replace(/\b(html?|xhtml|aspx?|php|jsp)\b/gi, " ");

    var vin = url.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
    if (vin && /[A-Za-z]/.test(vin[1]) && /[0-9]/.test(vin[1])) out.vehicle.vin = vin[1].toUpperCase();

    var v = findVehicle(pathText);
    ["year", "make", "model", "trim", "stock", "mileage"].forEach(function (k) { if (v[k]) out.vehicle[k] = v[k]; });

    // URL slugs are lowercase; recase and strip VIN / listing-id noise from the trim.
    function casePart(tok) {
      return (/\d/.test(tok) || tok.length <= 3) ? tok.toUpperCase()
        : tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    }
    if (out.vehicle.model) out.vehicle.model = out.vehicle.model.split(/\s+/).map(casePart).join(" ");
    if (out.vehicle.trim) {
      out.vehicle.trim = out.vehicle.trim.split(/\s+/).filter(function (t) {
        if (!t) return false;
        if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(t)) return false;          // VIN
        if (/^\d{5,}$/.test(t)) return false;                        // listing id
        if (out.vehicle.stock && t === out.vehicle.stock) return false;
        return true;
      }).slice(0, 3).map(casePart).join(" ");
    }

    if (u) {
      u.searchParams.forEach(function (val, key) {
        if (!out.salePrice && /price/i.test(key)) { var n = toNumber(val); if (n > 1000) out.salePrice = n; }
        if (!out.vehicle.mileage && /mile|odom/i.test(key)) { var n2 = toNumber(val); if (n2 >= 100) out.vehicle.mileage = String(n2); }
      });
      out.host = u.hostname.replace(/^www\./, "");
    }
    return out;
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

    // If listing HTML source was pasted, let structured JSON-LD fill any gaps.
    if (/application\/ld\+json/i.test(text)) {
      var ld = parseJsonLd(text);
      ["year", "make", "model", "trim", "vin", "mileage"].forEach(function (k) {
        if (ld.vehicle[k] && !out.vehicle[k]) out.vehicle[k] = ld.vehicle[k];
      });
      if (ld.salePrice && !out.salePrice) out.salePrice = ld.salePrice;
      if (ld.dealership && !out.dealership) out.dealership = ld.dealership;
    }
    return out;
  }

  var api = { parseQuote: parseQuote, parseListingUrl: parseListingUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CARBUDDY_PARSE = api;
})(typeof window !== "undefined" ? window : this);
