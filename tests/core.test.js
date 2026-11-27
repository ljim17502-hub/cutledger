"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { time, compare, markdown } = require("../core.js");
const fixture = { duration: "8", source: "A 2\nB 5", proposed: "A 2\nB 5", approved: "", confirmed: true };
const review = (parameters) => compare({ ...fixture, ...parameters });
const states = (result) => Object.fromEntries(result.rows.map(r => [r.id, r.state]));
test("strict time syntax in integer milliseconds", () => {
  for (const [input, expected] of [["02:03.12", 123120], ["3.003", 3003], ["0", 0], ["-0.05", -50], ["−01:02", -62000], ["00:63", null], ["2.1234", null], ["1e1", null], ["00:00:03", null]]) {
    assert.equal(time(input), expected, input);
  }
});
test("same IDs in a different text order compare by identifier", () => {
  const result = review({ proposed: "B 5.000\n# note\nA 00:02" });
  assert.equal(result.outcome, "matched");
  assert.deepEqual(states(result), { A: "kept", B: "kept" });
});
test("reports moves, omissions and additions distinctly", () => {
  const result = review({ proposed: "A 2.250\nC 5" });
  assert.equal(result.flags, 3);
  assert.deepEqual(states(result), { A: "moved", B: "missing", C: "extra" });
});
test("flags endpoints, negative values, and timestamps beyond runtime", () => {
  assert.deepEqual(states(review({ proposed: "A 0\nB 8\nC 9\nD -0.05" })), { A: "bounds", B: "bounds", C: "bounds", D: "bounds" });
});
test("an approved retime requires the exact named cut and time", () => {
  assert.deepEqual(states(review({ proposed: "A 2.4\nB 6", approved: "B 6" })), { A: "moved", B: "approved" });
  assert.deepEqual(states(review({ approved: "B 6" })), { A: "kept", B: "mismatch" });
  assert.deepEqual(states(review({ proposed: "A 2\nB 6.001", approved: "B 6" })), { A: "kept", B: "moved" });
  assert.equal(review({ proposed: "A 2\nB 6", approved: "B 6" }).outcome, "matched");
});
test("rejects invalid source, duplicate IDs or times, and invalid approvals", () => {
  for (const [config, error] of [
    [{duration:"0"}, /Duration/], [{source:"A 0"}, /Source cut/], [{source:"A 8"}, /Source cut/],
    [{proposed:"A 2\nA 5"}, /duplicate cut ID/], [{proposed:"A 2\nB 2"}, /share a timestamp/],
    [{approved:"X 6"}, /does not name/], [{approved:"B 8"}, /strictly inside/], [{approved:"B 5"}, /no retime/],
    [{source:"[Shot2] 2.000"}, /Source, line 1/]
  ]) {
    const result = review(config);
    assert.equal(result.outcome, "invalid");
    assert.match(result.errors.join("\n"), error);
    assert.equal(markdown(result), "");
  }
});
test("unverified source cannot issue a matching verdict", () => {
  const result = review({ confirmed: false });
  assert.equal(result.outcome, "unverified");
  assert.match(markdown(result), /Source not verified/);
  assert.match(markdown(result), /not footage/);
});
test("empty manifests represent a single uncut shot", () => {
  assert.equal(review({ source:"", proposed:"" }).outcome, "matched");
});
