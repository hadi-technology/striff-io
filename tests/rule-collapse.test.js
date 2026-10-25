import { test } from "node:test";
import assert from "node:assert/strict";
import { collapse, parts, MIN_COLLAPSED } from "../src/lib/ruleCollapse.js";

const sentence = (row) => `${row.doc}|${row.quote}`;
let n = 0;
const rule = (statement, extra = {}) => ({
  factId: `f${n++}`, statement, quote: "Q", doc: "d.md", status: null, pullNo: null,
  onDefaultBranch: "HOLDS", ...extra,
});

test("a statement splits into subject, verb and one trailing object", () => {
  assert.deepEqual(parts("`a` may not depend on `B`"), { subject: "a", verb: "may not depend on", object: "B" });
  assert.deepEqual(parts("`a` is exported"), { subject: "a", verb: "is exported", object: "" });
  assert.equal(parts("nothing in `x` may import `y`"), null);
});

test("subjects fanned out over the same targets are one line, and no rule is lost", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const rows = names.flatMap((s) => ["X", "Y"].map((t) => rule(`\`${s}\` may not depend on \`${t}\``)));
  const lines = collapse(rows, sentence);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].rows.length, 16);
  assert.equal(lines[0].text, "`a`, `b`, `c` and 5 more may not depend on `X` or `Y`");
});

test("a member list is one line for its subject", () => {
  const members = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
  const rows = members.map((m) => rule(`\`Backend\` has \`${m}\``));
  const [line] = collapse(rows, sentence);
  assert.equal(line.rows.length, 7);
  assert.equal(line.text, "`Backend` has `m1`, `m2`, `m3` and 4 more");
});

test("a short run keeps its own rows", () => {
  const rows = Array.from({ length: MIN_COLLAPSED - 1 }, (_, i) => rule(`\`s${i}\` may not import \`Z\``));
  const lines = collapse(rows, sentence);
  assert.equal(lines.length, rows.length);
  assert.ok(lines.every((l) => l.text === null));
});

test("a broken rule is never brought together with another", () => {
  const rows = Array.from({ length: 8 }, (_, i) => rule(`\`s${i}\` may not import \`Z\``, { onDefaultBranch: "BROKEN" }));
  assert.ok(collapse(rows, sentence).every((l) => l.rows.length === 1 && l.text === null));
});

test("rules of different standing never share a line; the broken one stays on its own row", () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    rule(`\`s${i}\` may not import \`Z\``, i === 3 ? { onDefaultBranch: "BROKEN" } : {}));
  const lines = collapse(rows, sentence);
  const broken = lines.filter((l) => l.rows.some((r) => r.onDefaultBranch === "BROKEN"));
  assert.equal(broken.length, 1);
  assert.equal(broken[0].rows.length, 1);
  const holds = lines.filter((l) => l.text !== null);
  // Seven holding rules: one line, without the broken one.
  assert.equal(holds.length, 1);
  assert.equal(holds[0].rows.length, 7);
  assert.equal(lines.reduce((sum, l) => sum + l.rows.length, 0), 8);
});

test("rules of different sentences are not brought together", () => {
  const rows = Array.from({ length: 8 }, (_, i) => rule(`\`s${i}\` may not import \`Z\``, { quote: `Q${i}` }));
  assert.ok(collapse(rows, sentence).every((l) => l.text === null));
});

test("a verb with no known plural is left as separate rows", () => {
  const rows = Array.from({ length: 8 }, (_, i) => rule(`\`s${i}\` frobnicates \`Z\``));
  assert.ok(collapse(rows, sentence).every((l) => l.text === null));
});

test("a line sits where its first rule was, and the others keep their places", () => {
  const rows = [
    rule("`only` is exported", { quote: "other" }),
    ...Array.from({ length: 6 }, (_, i) => rule(`\`s${i}\` may not import \`Z\``)),
    rule("`last` is exported", { quote: "other" }),
  ];
  const lines = collapse(rows, sentence);
  assert.deepEqual(lines.map((l) => l.rows.length), [1, 6, 1]);
});
