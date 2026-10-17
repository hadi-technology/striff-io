import { test } from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const V = await import("../src/lib/docView.js");

const parse = (text) => unified().use(remarkParse).use(remarkGfm).parse(text);
const rule = (factId, extra = {}) => ({ factId, status: "MAINTAINED", onDefaultBranch: "HOLDS", ...extra });

/** Every text node of a tree drawn through the splitter, as [text, strongest kind] pairs. */
function drawn(text, ranges) {
  const out = [];
  V.walk(parse(text), (node) => {
    if (node.type !== "text") return;
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    const map = V.alignText(node.value, text.slice(start, end));
    for (const seg of V.textSegments({ value: node.value, start, end, map }, ranges)) out.push([seg.text, seg.kind]);
  });
  return out;
}

test("a span across emphasis and a link marks each text node's share", () => {
  const text = "Say **bold** and [a link](x.md) now";
  const from = text.indexOf("bold");
  const to = text.indexOf("link") + 4;
  const marked = drawn(text, [{ from, to, kind: "holds", id: "a" }]).filter(([, k]) => k).map(([t]) => t);
  assert.deepEqual(marked, ["bold", " and ", "a link"]);
});

test("a span's text pieces join back to the node's value", () => {
  const text = "plain words here";
  const parts = drawn(text, [{ from: 6, to: 11, kind: "broken", id: "a" }]);
  assert.equal(parts.map(([t]) => t).join(""), text);
  assert.deepEqual(parts.filter(([, k]) => k), [["words", "broken"]]);
});

test("broken beats holds beats not checked beats excluded where they overlap", () => {
  const ranges = [
    { from: 0, to: 10, kind: "excluded", id: "e" },
    { from: 0, to: 10, kind: "unchecked", id: "u" },
    { from: 2, to: 8, kind: "holds", id: "h" },
    { from: 4, to: 6, kind: "broken", id: "b" },
  ];
  const segs = V.segments(0, 10, ranges);
  assert.deepEqual(segs.map((s) => [s.from, s.to, s.kind]),
    [[0, 2, "unchecked"], [2, 4, "holds"], [4, 6, "broken"], [6, 8, "holds"], [8, 10, "unchecked"]]);
  assert.deepEqual(segs[2].hits.map((h) => h.id), ["b", "h", "u", "e"]);
});

test("an astral character before a span does not shift it, and a span never splits one", () => {
  const text = "😀 Only billing talks to Stripe.";
  const from = text.indexOf("Only");
  assert.equal(from, 3);
  const parts = drawn(text, [{ from, to: text.length - 1, kind: "holds", id: "a" }]);
  assert.deepEqual(parts.filter(([, k]) => k).map(([t]) => t), ["Only billing talks to Stripe"]);
  const cut = V.normalizeRanges(text, [{ from: 1, to: 2, kind: "holds" }]);
  assert.deepEqual([cut[0].from, cut[0].to], [0, 2]);
});

test("a text node with escapes and an indented continuation still maps its highlight", () => {
  const text = "- one \\*star\\*\n  and more words";
  const from = text.indexOf("more");
  const parts = drawn(text, [{ from, to: from + 4, kind: "holds", id: "a" }]);
  assert.deepEqual(parts.filter(([, k]) => k), [["more", "holds"]]);
});

test("a table row, a list item and a diagram line are found by line", () => {
  const text = "| a | b |\n|---|---|\n| x | y |\n\n- first\n- second\n  - nested\n\n```mermaid\ngraph LR\n  a --> b\n```\n";
  const tree = parse(text);
  const row = V.blockRange(tree, text, { line: 3, kind: "row" });
  assert.equal(text.slice(row.from, row.to), "| x | y |");
  const item = V.blockRange(tree, text, { line: 6, kind: "item" });
  assert.equal(text.slice(item.from, item.to), "- second");
  const nested = V.blockRange(tree, text, { line: 7, kind: "item" });
  assert.equal(text.slice(nested.from, nested.to), "- nested");
  const line = V.blockRange(tree, text, { line: 11, kind: "diagram" });
  assert.equal(text.slice(line.from, line.to), "  a --> b");
});

test("the read-up-to cut clips ranges and leaves an unreachable rule unplaced", () => {
  const text = "First sentence. Second sentence.";
  const cut = 15;
  const result = V.ruleRanges({
    text, tree: parse(text), readChars: cut,
    rules: [rule("a"), rule("b")],
    placements: [
      { factId: "a", spans: [{ from: 0, to: 14 }], block: null },
      { factId: "b", spans: [{ from: 16, to: 31 }], block: null },
    ],
  });
  assert.deepEqual(result.ranges.map((r) => r.id), ["a"]);
  assert.deepEqual(result.unplaced.map((r) => r.factId), ["b"]);
});

test("every drawn rule is placed or unplaced once; unclear ones are neither", () => {
  const text = "One. Two. Three.";
  const result = V.ruleRanges({
    text, tree: null, readChars: null,
    rules: [rule("a"), rule("b"), rule("c"), rule("u", { onDefaultBranch: "UNCLEAR" })],
    placements: [{ factId: "a", spans: [{ from: 0, to: 4 }] }, { factId: "u", spans: [{ from: 5, to: 9 }] }],
    unplaced: ["b"],
  });
  assert.deepEqual(result.placed.map((r) => r.factId), ["a"]);
  assert.deepEqual(result.unplaced.map((r) => r.factId), ["b", "c"]);
});

test("a rule in text the view does not draw goes to the unplaced list", () => {
  const text = "import x from 'y'\n\nHello.\n";
  const mdx = unified().use(remarkParse).parse("[a]: http://x\n\nHello.");
  const result = V.ruleRanges({ text: "[a]: http://x\n\nHello.", tree: mdx, rules: [rule("a")],
    placements: [{ factId: "a", spans: [{ from: 0, to: 12 }] }] });
  assert.equal(result.unplaced.length, 1);
  void text;
});

test("a stale name is marked on its line, as a whole token, once", () => {
  const text = "Intro mentions Store.\nThe CartStore and Store both exist; Store again.\n";
  const [mark] = V.staleRanges(text, [{ name: "Store", docPath: "a.md", sourceLine: 2 }]);
  assert.equal(text.slice(mark.from, mark.to), "Store");
  assert.equal(mark.from, text.indexOf("and Store") + 4);
  assert.deepEqual(V.staleRanges(text, [{ name: "Store", docPath: "a.md", sourceLine: 9 }]), []);
  assert.deepEqual(V.staleRanges(text, [{ name: "Gone", docPath: "a.md", sourceLine: 2 }]), []);
  const q = V.staleRanges("see `billing.Ledger` here", [{ name: "billing.Ledger", docPath: "a.md", sourceLine: 1 }]);
  assert.equal(q.length, 1);
});

test("CRLF lines and a BOM keep line ranges right", () => {
  const text = "﻿a\r\nb\r\n";
  assert.deepEqual(V.lineRange(text, 2), { from: 4, to: 5 });
});

test("failure reasons: a final answer offers no retry, others do", () => {
  assert.equal(V.failureMessage("CHANGED").message, "This version of the doc isn't on GitHub any more.");
  for (const r of ["CHANGED", "VERSION_UNKNOWN", "TOO_LARGE"]) {
    assert.equal(V.failureMessage(r).retry, false, r);
  }
  for (const r of ["NOT_FOUND", "FORBIDDEN", "RATE_LIMITED", "TIMEOUT", "ERROR", "x"]) {
    assert.equal(V.failureMessage(r).retry, true, r);
  }
});

test("the sample document places every rule once, and its cited lines say what the rules quote", async () => {
  const { demoDocText, demoDoc, demoStaleNames, ARCH_TEXT } = await import("../src/data/demoDashboard.ts");
  const placed = demoDocText("ARCHITECTURE.md");
  const ids = demoDoc("ARCHITECTURE.md").rules.map((r) => r.factId).sort();
  assert.deepEqual([...placed.placements.map((p) => p.factId), ...placed.unplaced].sort(), ids);
  const lines = ARCH_TEXT.split("\n");
  for (const f of demoStaleNames.findings.filter((f) => f.docPath === "ARCHITECTURE.md")) {
    assert.ok(lines[f.sourceLine - 1].includes(f.name.split(".").pop()), f.name);
  }
  assert.ok(placed.readChars < ARCH_TEXT.length);
});
