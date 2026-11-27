"use strict";
(() => {
  const { compare, fmt, labels, markdown } = window.CutLedger;
  const el = id => document.getElementById(id);
  const keys = ["duration", "source", "proposed", "approved", "confirmed"];
  let result;
  function node(tag, value, name) {
    const n = document.createElement(tag);
    if (value != null) n.textContent = value;
    if (name) n.className = name;
    return n;
  }
  function drawTimeline() {
    for (const [key, label] of [["before", "Source"], ["after", "Proposal"]]) {
      const row = node("div", null, "timeline-row");
      const rail = node("div", null, "rail");
      for (const r of result.rows) {
        const at = r[key];
        if (!(at > 0 && at < result.length)) continue;
        const pin = node("span", null, "pin" + (["kept", "approved"].includes(r.state) ? "" : " flag"));
        pin.style.left = (at / result.length * 100) + "%";
        pin.title = r.id + " · " + fmt(at);
        rail.append(pin);
      }
      row.append(node("span", label), rail);
      el("timeline").append(row);
    }
  }
  function render() {
    result = compare(Object.fromEntries(keys.map(k => [k, k === "confirmed" ? el(k).checked : el(k).value])));
    const status = { invalid: "Fix the inputs to compare cuts", unverified: "Draft · source not verified",
      matched: "Cut plan matched", review: "Review needed · " + result.flags + " flagged" };
    if (el("status").textContent !== status[result.outcome]) el("status").textContent = status[result.outcome];
    el("status").className = "badge " + result.outcome;
    el("timeline").replaceChildren();
    el("rows").replaceChildren();
    el("errors").replaceChildren(...result.errors?.map(message => node("li", message)) ?? []);
    el("errors").hidden = result.outcome !== "invalid";
    el("table-wrap").hidden = result.outcome === "invalid";
    el("copy").disabled = el("download").disabled = result.outcome === "invalid";
    el("output-note").textContent = "";
    if (result.outcome === "invalid") return;
    drawTimeline();
    for (const r of result.rows) {
      const row = node("tr", null, ["kept", "approved"].includes(r.state) ? "ok" : "");
      const state = labels[r.state] + (r.target !== null && r.state !== "approved" ? " · target " + fmt(r.target) : "");
      row.append(node("td", r.id), node("td", fmt(r.before)), node("td", fmt(r.after)), node("td", state));
      el("rows").append(row);
    }
    if (!result.rows.length) {
      const cell = node("td", "No internal cuts supplied.");
      cell.colSpan = 4;
      const row = node("tr");
      row.append(cell);
      el("rows").append(row);
    }
  }
  function demo() {
    el("sample-state").textContent = "Synthetic example";
    el("duration").value = "8";
    el("source").value = "A 2.000\nB 5.000";
    el("proposed").value = "A 2.400\nB 6.000\nC 9.000";
    el("approved").value = "B 6.000";
    el("confirmed").checked = true;
    render();
  }
  for (const k of keys) el(k).addEventListener("input", () => {
    el("sample-state").textContent = "Your inputs · not saved";
    if (k === "source" || k === "duration") el("confirmed").checked = false;
    render();
  });
  el("demo").addEventListener("click", demo);
  el("copy").addEventListener("click", async () => {
    const report = markdown(result);
    try {
      await navigator.clipboard.writeText(report);
      el("output-note").textContent = "Report copied.";
    } catch {
      el("output-note").textContent = "Clipboard access is unavailable. Use Download instead.";
    }
  });
  el("download").addEventListener("click", () => {
    const href = URL.createObjectURL(new Blob([markdown(result)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = "cutledger-review.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    el("output-note").textContent = "Download started.";
  });
  demo();
})();
