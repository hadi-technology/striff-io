import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRuleStates, coveringPath, ignoreCounts } from "../src/lib/ruleStates.js";

const rule = (factId, extra = {}) => ({ factId, statement: factId, ...extra });
const answer = () => ({
  truncated: false,
  documents: [
    { document: { path: "AGENTS.md" }, rules: [rule("a1"), rule("a2")] },
    { document: { path: "docs/adr/0007.md" }, rules: [rule("d1"), rule("d2")] },
    { document: { path: "docs/adr/0008.md" }, rules: [rule("d3")] },
    { document: { path: "docs/old.md" }, rules: [rule("x1", { ignored: true, ignoredBy: "excluded" })] },
  ],
});
const state = (rules) => Object.fromEntries(rules.documents.flatMap((g) => g.rules.map((r) => [r.factId, r.ignoredBy || (r.ignored ? "?" : "active")])));

test("an answer from a server without rule states reads as every rule active", () => {
  assert.deepEqual(ignoreCounts(answer().documents.slice(0, 3).flatMap((g) => g.rules)), { total: 5, ignored: 0, changeable: 5 });
});

test("one rule is ignored and made active again on its own", () => {
  let next = applyRuleStates(answer(), { ignored: true, factIds: ["a2"] });
  assert.equal(state(next).a2, "rule");
  assert.equal(state(next).a1, "active");
  assert.equal(next.documents[0].document.ignoredRules, 1);
  assert.equal(next.documents[0].document.ignored, false);

  next = applyRuleStates(next, { ignored: false, factIds: ["a2"] });
  assert.equal(state(next).a2, "active");
});

test("a folder ignored covers every doc beneath it, and the rules later found there", () => {
  const next = applyRuleStates(answer(), { ignored: true, path: "docs/adr", prefix: true });
  assert.deepEqual([state(next).d1, state(next).d2, state(next).d3], ["folder", "folder", "folder"]);
  assert.equal(state(next).a1, "active");
  assert.deepEqual(next.ignoredPaths, [{ path: "docs/adr", prefix: true }]);
  assert.deepEqual(coveringPath("docs/adr/0009-new.md", next.ignoredPaths), { path: "docs/adr", prefix: true });
  assert.equal(coveringPath("docs/adrx.md", next.ignoredPaths), null);
});

test("a rule made active inside an ignored doc stays active", () => {
  let next = applyRuleStates(answer(), { ignored: true, path: "docs/adr/0007.md", prefix: false });
  assert.deepEqual([state(next).d1, state(next).d2], ["document", "document"]);
  next = applyRuleStates(next, { ignored: false, factIds: ["d1"] });
  assert.equal(state(next).d1, "active");
  assert.equal(state(next).d2, "document");
  assert.equal(next.documents[1].document.ignored, true);
});

test("making a folder active takes back everything set beneath it", () => {
  let next = applyRuleStates(answer(), { ignored: true, path: "docs/adr/0007.md", prefix: false });
  next = applyRuleStates(next, { ignored: true, factIds: ["d3"] });
  next = applyRuleStates(next, { ignored: false, path: "docs", prefix: true });
  assert.deepEqual([state(next).d1, state(next).d2, state(next).d3], ["active", "active", "active"]);
  assert.deepEqual(next.ignoredPaths, []);
});

test("the whole repository is the empty path, and an excluded doc is left alone", () => {
  const next = applyRuleStates(answer(), { ignored: true, path: "", prefix: true });
  assert.equal(state(next).a1, "folder");
  assert.equal(state(next).x1, "excluded");
  assert.deepEqual(ignoreCounts(next.documents.flatMap((g) => g.rules)), { total: 6, ignored: 6, changeable: 5 });
});
