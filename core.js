/* CutLedger core. Inputs are explicit human-supplied cut IDs, not inferred clips. */
(function (root) {
  "use strict";
  const labels = {
    kept: "Unchanged", approved: "Approved retime", moved: "Moved", missing: "Missing",
    extra: "Extra", bounds: "Out of bounds", mismatch: "Approval mismatch"
  };
  function time(value) {
    const parts = String(value).trim().replace(/^−/, "-").match(/^(-)?(?:(\d{1,4}):([0-5]\d)|(\d{1,6}))(?:\.(\d{1,3}))?$/);
    if (!parts) return null;
    return (parts[1] ? -1 : 1) * ((parts[2] == null ? Number(parts[4]) : Number(parts[2]) * 60 + Number(parts[3])) * 1000
      + Number((parts[5] || "").padEnd(3, "0")));
  }
  function fmt(ms) {
    return ms == null ? "—" : (ms / 1000).toFixed(3) + " s";
  }
  function list(raw, label, errors) {
    const cuts = new Map(), used = new Map();
    String(raw).split(/\r?\n/).forEach((line, i) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]{0,23})[ \t]+(\S+)$/);
      const lineLabel = label + ", line " + (i + 1);
      if (!entry || time(entry[2]) === null) {
        errors.push(lineLabel + ": use an ID and a timestamp, e.g. A 2.500.");
        return;
      }
      const at = time(entry[2]);
      if (cuts.has(entry[1])) errors.push(lineLabel + ": duplicate cut ID " + entry[1] + ".");
      else if (used.has(at)) errors.push(lineLabel + ": " + entry[1] + " and " + used.get(at) + " share a timestamp.");
      else { cuts.set(entry[1], at); used.set(at, entry[1]); }
    });
    return cuts;
  }
  function compare({ duration, source, proposed, approved, confirmed }) {
    const errors = [];
    const length = time(duration);
    const a = list(source, "Source", errors), b = list(proposed, "Proposal", errors);
    const allows = list(approved, "Approvals", errors);
    if (!(length > 0)) errors.unshift("Duration must be greater than zero, e.g. 8 or 00:08.000.");
    else {
      for (const [id, at] of a) if (at <= 0 || at >= length)
        errors.push("Source cut " + id + " must be strictly inside the timeline.");
      for (const [id, at] of allows) {
        if (!a.has(id)) errors.push("Approval " + id + " does not name a source cut.");
        if (at <= 0 || at >= length) errors.push("Approval " + id + " must be strictly inside the timeline.");
        if (a.get(id) === at) errors.push("Approval " + id + " matches the source; no retime is needed.");
      }
    }
    if (errors.length) return { outcome: "invalid", errors, rows: [], length };
    const ids = [...new Set([...a.keys(), ...b.keys()])];
    ids.sort((x, y) => (a.get(x) ?? b.get(x)) - (a.get(y) ?? b.get(y)) || x.localeCompare(y, "en"));
    const rows = ids.map(id => {
      const before = a.get(id) ?? null, after = b.get(id) ?? null, target = allows.get(id) ?? null;
      const state = after !== null && (after <= 0 || after >= length) ? "bounds"
        : before === null ? "extra"
        : after === null ? "missing"
        : before === after ? target === null ? "kept" : "mismatch"
        : after === target ? "approved" : "moved";
      return { id, before, after, target, state };
    });
    const flags = rows.filter(r => !["kept", "approved"].includes(r.state)).length;
    return { outcome: !confirmed ? "unverified" : flags ? "review" : "matched", confirmed: !!confirmed, flags, rows, length };
  }
  function markdown(result) {
    if (result.outcome === "invalid") return "";
    const summary = {
      unverified: "Source not verified; this is a draft comparison.",
      review: "Review needed: " + result.flags + " flagged cut" + (result.flags === 1 ? "." : "s."),
      matched: "Cut IDs and times match the supplied plan and explicit retimes."
    };
    return "# CutLedger · cut comparison\n\n" + summary[result.outcome] + "\n\n"
      + "- Source duration: " + fmt(result.length) + "\n"
      + "- Source manually verified: " + (result.confirmed ? "yes" : "no") + "\n\n"
      + "| Cut | Source | Proposal | Approved target | Result |\n| --- | ---: | ---: | ---: | --- |\n"
      + result.rows.map(r => "| " + r.id + " | " + fmt(r.before) + " | " + fmt(r.after)
        + " | " + fmt(r.target) + " | " + labels[r.state] + " |").join("\n")
      + "\n\nChecks only supplied cut IDs and times, not footage, prompts, or rendered results.\n";
  }
  const api = { time, fmt, compare, markdown, labels };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CutLedger = api;
})(globalThis);
