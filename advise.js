/* CarBuddy reply advisor — reads a dealer's message and suggests which template to
   send back, plus the tactics it detected. Pure heuristics, runs in the browser.
   Returns ids only; the app maps them to the template library and red-flags list. */
(function (root) {
  "use strict";

  function suggestReply(message, opts) {
    opts = opts || {};
    var t = " " + String(message || "").toLowerCase() + " ";
    var has = function (re) { return re.test(t); };
    var tactics = [], reason = [], templateId;

    var phone = has(/\b(call|phone|give me a (call|ring)|reach you|good number|call you|(jump|hop) on a call|by phone|ring you)\b/);
    var comeIn = has(/\b(come in|come on in|stop by|swing by|come by|in person|visit (us|the|our)|see you (here|in|at)|on the lot|come down|pop in)\b/);
    var testDrive = has(/\btest drive\b/);
    var nameNumber = has(/\b(what.{0,12}(payment|budget|number|monthly|price)|make (me|us) (an|your) offer|name your (price|number)|what were you (looking|hoping)|what.{0,8}works for you|where do you (want|need) to be|your best (offer|number)\?)\b/);
    var monthly = has(/(\$?\d{2,4}\s*(\/|per|a)\s*mo(nth)?\b|per month|monthly payment|a month|\bmonthly\b)/);
    var today = has(/\b(today only|only good (today|until|through)|expires?|won.?t last|end of (the )?month|by (today|tonight|end of day)|act (now|fast)|limited time|move fast)\b/);
    var refuseWritten = has(/\b(can.?t (email|send|give|put)[^.]{0,24}(price|number|quote)|need you to come|only[^.]{0,14}in person|have to come in|over the phone|discuss[^.]{0,12}in person)\b/);
    var fees = has(/\b(doc(umentation)? fee|dealer fee|addendum|market adjustment|adm\b|processing fee|e-?filing|electronic filing|add-?on|protection package|prep fee|nitrogen|etching|dealer services|private tag)\b/);
    var gaveOtd = has(/\b(out.the.door|otd|drive.?off|all.?in|total price)\b/) && has(/\$\s?\d[\d,]{3,}/);
    var agree = has(/\b(we have a deal|you.?ve got a deal|it.?s a deal|\bdeal\b|we accept|i can do (that|it)|sounds good|let.?s do it|works for us|that works|deal is done)\b/);

    if (phone) tactics.push("phone_push");
    if (comeIn || testDrive) tactics.push("come_in");
    if (nameNumber) tactics.push("name_number_first");
    if (monthly) tactics.push("payment_anchor");
    if (today) tactics.push("today_only");
    if (refuseWritten) tactics.push("no_written_otd");
    if (fees) tactics.push("fee_obfuscation");

    if (refuseWritten || phone || comeIn || testDrive) {
      templateId = "email_only";
      reason.push("They’re steering you off email — hold the boundary and keep it in writing.");
    } else if (nameNumber || monthly) {
      templateId = "competing_vague";
      reason.push("They want you to name a number first — flip it and make them commit to an out-the-door price.");
    } else if (agree) {
      templateId = "written_confirm";
      reason.push("Sounds like a deal — lock the exact VIN and OTD in writing before anything else.");
    } else if (fees) {
      templateId = "fee_challenge";
      reason.push("They itemized fees — challenge the junk ones and keep the focus on out-the-door.");
    } else if (gaveOtd) {
      templateId = opts.hasLowerCompeting ? "competing_disclose" : "fee_challenge";
      reason.push(opts.hasLowerCompeting
        ? "They gave an OTD — use your lower competing quote to push it down."
        : "They gave an OTD — press on the fees to bring it lower.");
    } else if (today) {
      templateId = "competing_vague";
      reason.push("Artificial urgency — don’t bite; keep them competing.");
    } else {
      templateId = "written_confirm";
      reason.push("Keep it moving — get the specifics confirmed in writing.");
    }

    return { tacticIds: dedupe(tactics), templateId: templateId, reason: reason.join(" ") };
  }

  function dedupe(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  var api = { suggestReply: suggestReply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CARBUDDY_ADVISE = api;
})(typeof window !== "undefined" ? window : this);
