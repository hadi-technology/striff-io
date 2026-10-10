import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyExclusion,
  applyRuleStates,
  coveringFolder,
  coveringPath,
  exclusionWrites,
  normalizeCatalog,
  normalizeRules,
  ruleCounts,
} from "../src/lib/ruleStates.js";

const HOLDS = { status: "MAINTAINED", onDefaultBranch: "HOLDS" };
const BROKEN = { status: "VIOLATED", onDefaultBranch: "BROKEN" };
const rule = (factId, extra = {}) => ({ factId, statement: factId, ...HOLDS, ...extra });
const answer = () => normalizeRules({
  truncated: false,
  documents: [
    { document: { path: "AGENTS.md", state: "READ" }, rules: [rule("a1"), rule("a2", BROKEN)] },
    { document: { path: "docs/adr/0007.md", state: "READ" }, rules: [rule("d1"), rule("d2")] },
    { document: { path: "docs/adr/0008.md", state: "READ", extractedContentHash: "x" }, rules: [rule("d3")] },
    { document: { path: "docs/old.md", state: "EXCLUDED" }, rules: [rule("x1", { excluded: true, excludedBy: "excluded" })] },
  ],
});
const catalog = () => ({
  documents: answer().documents.map((group) => group.document),
  exclusions: [{ path: "docs/old.md", folder: false, excludedBy: "maria", reason: null, atMs: 1 }],
});
const state = (rules) => Object.fromEntries(rules.documents.flatMap((g) => g.rules.map((r) => [r.factId, r.excludedBy || (r.excluded ? "?" : "included")])));
const allRules = (rules) => rules.documents.flatMap((g) => g.rules);

test("an answer from a server without rule states reads as every rule included", () => {
  const plain = normalizeRules({ documents: [{ document: { path: "A.md" }, rules: [rule("a")] }] });
  assert.equal(plain.documents[0].rules[0].excluded, false);
  assert.equal(plain.documents[0].rules[0].excludedBy, null);
  assert.deepEqual(plain.excludedPaths, []);
  assert.deepEqual(plain.legacyPaths, []);
});

test("the old field names are read where the new ones are absent", () => {
  const old = normalizeRules({
    ignoredPaths: [{ path: "docs", prefix: true }],
    documents: [{
      document: { path: "docs/a.md", ignored: true, ignoredRules: 1, excludedBy: "maria" },
      rules: [rule("a", { ignored: true, ignoredBy: "folder" })],
    }],
  });
  // The old server's paths are rule-state entries, not the exclusion list.
  assert.deepEqual(old.legacyPaths, [{ path: "docs", prefix: true }]);
  assert.deepEqual(old.excludedPaths, []);
  assert.equal(old.ignoredPaths, undefined);
  assert.deepEqual(old.documents[0].rules[0].excluded, true);
  assert.equal(old.documents[0].rules[0].excludedBy, "folder");
  assert.equal(old.documents[0].rules[0].ignored, undefined);
  assert.equal(old.documents[0].document.excluded, true);
  assert.equal(old.documents[0].document.excludedRules, 1);
  // A doc's own excludedBy is who excluded it, and is kept as it was.
  assert.equal(old.documents[0].document.excludedBy, "maria");
});

test("the new field names win where a server sends both", () => {
  const both = normalizeRules({
    ignoredPaths: [{ path: "", prefix: true }],
    excludedPaths: [{ path: "", prefix: true }],
    documents: [{ document: { path: "a.md" }, rules: [rule("a", { ignored: false, excluded: true, excludedBy: "rule", ignoredBy: null })] }],
  });
  assert.deepEqual(both.excludedPaths, [{ path: "", prefix: true }]);
  // The new server sends the exclusion list under both names; neither is an old rule-state entry.
  assert.deepEqual(both.legacyPaths, []);
  assert.equal(both.documents[0].rules[0].excluded, true);
  assert.equal(both.documents[0].rules[0].excludedBy, "rule");
  const detail = normalizeCatalog({ document: { path: "a.md", ignored: true }, rules: [rule("a", { ignored: true, ignoredBy: "rule" })] });
  assert.equal(detail.document.excluded, true);
  assert.equal(detail.rules[0].excludedBy, "rule");
});

test("one rule is excluded and included again on its own, and the counts follow", () => {
  let next = applyRuleStates(answer(), { excluded: true, factIds: ["a2"] });
  assert.equal(state(next).a2, "rule");
  assert.equal(state(next).a1, "included");
  assert.equal(next.documents[0].document.excludedRules, 1);
  assert.equal(next.documents[0].document.excluded, false);
  assert.deepEqual(ruleCounts(allRules(answer())), { all: 6, holds: 4, broken: 1, unchecked: 0, excluded: 1 });
  assert.deepEqual(ruleCounts(allRules(next)), { all: 6, holds: 4, broken: 0, unchecked: 0, excluded: 2 });

  next = applyRuleStates(next, { excluded: false, factIds: ["a2"] });
  assert.equal(state(next).a2, "included");
});

test("a doc or folder from the old rule states covers the docs beneath it, and is taken back", () => {
  let next = applyRuleStates(answer(), { excluded: true, path: "docs/adr", prefix: true });
  assert.deepEqual([state(next).d1, state(next).d2, state(next).d3], ["folder", "folder", "folder"]);
  assert.deepEqual(coveringPath("docs/adr/0009-new.md", next.legacyPaths), { path: "docs/adr", prefix: true });
  assert.equal(coveringPath("docs/adrx.md", next.legacyPaths), null);
  next = applyRuleStates(next, { excluded: false, path: "docs", prefix: true });
  assert.deepEqual([state(next).d1, state(next).d2, state(next).d3], ["included", "included", "included"]);
  assert.deepEqual(next.legacyPaths, []);
});

test("a folder exclusion covers the folder and everything under it; the empty path is the repository", () => {
  const exclusions = [{ path: "docs", folder: true }, { path: "docs/adr/0007.md", folder: false }];
  assert.equal(coveringFolder("docs/adr/0007.md", exclusions).path, "docs");
  assert.equal(coveringFolder("docs", exclusions).path, "docs");
  assert.equal(coveringFolder("docsx/a.md", exclusions), null);
  assert.equal(coveringFolder("README.md", [{ path: "", folder: true }]).path, "");
});

test("excluding a doc stops reading it and excludes every rule in it, until it is included again", () => {
  let next = applyExclusion(catalog(), answer(), { path: "AGENTS.md", folder: false, excluded: true });
  assert.equal(next.catalog.documents.find((d) => d.path === "AGENTS.md").state, "EXCLUDED");
  assert.ok(next.catalog.exclusions.some((e) => e.path === "AGENTS.md" && !e.folder));
  assert.deepEqual([state(next.rules).a1, state(next.rules).a2], ["excluded", "excluded"]);
  assert.equal(ruleCounts(allRules(next.rules)).excluded, 3);

  next = applyExclusion(next.catalog, next.rules, { path: "AGENTS.md", folder: false, excluded: false });
  assert.equal(next.catalog.documents.find((d) => d.path === "AGENTS.md").state, "READ");
  assert.deepEqual([state(next.rules).a1, state(next.rules).a2], ["included", "included"]);
  assert.equal(ruleCounts(allRules(next.rules)).excluded, 1);
});

test("a rule excluded on its own stays excluded when its doc is excluded and included again", () => {
  let next = applyRuleStates(answer(), { excluded: true, factIds: ["d1"] });
  let both = applyExclusion(catalog(), next, { path: "docs/adr", folder: true, excluded: true });
  assert.deepEqual([state(both.rules).d1, state(both.rules).d2, state(both.rules).d3], ["excluded", "excluded", "excluded"]);
  both = applyExclusion(both.catalog, both.rules, { path: "docs/adr", folder: true, excluded: false });
  assert.deepEqual([state(both.rules).d1, state(both.rules).d2, state(both.rules).d3], ["rule", "included", "included"]);
});

test("a doc under a folder still excluded stays excluded when its own exclusion is taken back", () => {
  let next = applyExclusion(catalog(), answer(), { path: "docs", folder: true, excluded: true });
  assert.equal(next.catalog.documents.find((d) => d.path === "docs/adr/0008.md").state, "EXCLUDED");
  next = applyExclusion(next.catalog, next.rules, { path: "docs/old.md", folder: false, excluded: false });
  assert.equal(next.catalog.documents.find((d) => d.path === "docs/old.md").state, "EXCLUDED");
  assert.equal(state(next.rules).x1, "excluded");
});

test("a doc excluded before the page loaded goes back to read or not read by whether it has rules", () => {
  const withRead = catalog();
  withRead.documents.find((d) => d.path === "docs/old.md").extractedContentHash = "abc";
  const next = applyExclusion(withRead, answer(), { path: "docs/old.md", folder: false, excluded: false });
  assert.equal(next.catalog.documents.find((d) => d.path === "docs/old.md").state, "READ");
  assert.equal(state(next.rules).x1, "included");
  const unread = applyExclusion(catalog(), answer(), { path: "docs/old.md", folder: false, excluded: false });
  assert.equal(unread.catalog.documents.find((d) => d.path === "docs/old.md").state, "NOT_READ");
});

test("the whole repository is the empty folder", () => {
  const next = applyExclusion(catalog(), answer(), { path: "", folder: true, excluded: true });
  assert.ok(next.catalog.documents.every((d) => d.state === "EXCLUDED"));
  assert.equal(ruleCounts(allRules(next.rules)).excluded, 6);
});

test("a rule made included inside a doc from the old rule states stays included", () => {
  let next = applyRuleStates(answer(), { excluded: true, path: "docs/adr/0007.md", prefix: false });
  assert.deepEqual([state(next).d1, state(next).d2], ["document", "document"]);
  next = applyRuleStates(next, { excluded: false, factIds: ["d1"] });
  assert.equal(state(next).d1, "included");
  assert.equal(state(next).d2, "document");
  assert.equal(next.documents[1].document.excluded, true);
});

test("a whole-repository path in the old rule states leaves a doc excluded from reading alone", () => {
  const next = applyRuleStates(answer(), { excluded: true, path: "", prefix: true });
  assert.equal(state(next).a1, "folder");
  assert.equal(state(next).x1, "excluded");
  assert.deepEqual(ruleCounts(allRules(next)), { all: 6, holds: 0, broken: 0, unchecked: 0, excluded: 6 });
  const back = applyRuleStates(next, { excluded: false, path: "", prefix: true });
  assert.equal(state(back).a1, "included");
  assert.equal(state(back).x1, "excluded");
});

/** An answer in the new API's shape: the exclusion list under both names, excludedBy "excluded". */
const newApi = () => normalizeRules({
  truncated: false,
  excludedPaths: [{ path: "docs/old.md", prefix: false }],
  ignoredPaths: [{ path: "docs/old.md", prefix: false }],
  documents: [
    { document: { path: "AGENTS.md", state: "READ", excluded: false, ignored: false }, rules: [rule("a1"), rule("a2", BROKEN)] },
    { document: { path: "docs/adr/0007.md", state: "READ" }, rules: [rule("d1"), rule("d2")] },
    { document: { path: "docs/adr/0008.md", state: "READ", extractedContentHash: "x" }, rules: [rule("d3")] },
    { document: { path: "docs/old.md", state: "EXCLUDED", excluded: true, ignored: true, excludedRules: 1 },
      rules: [rule("x1", { excluded: true, excludedBy: "excluded", ignored: true, ignoredBy: "excluded" })] },
  ],
});

test("on the new API, excluding and including a doc or a folder is one write and moves the counts at once", () => {
  for (const change of [{ path: "AGENTS.md", folder: false }, { path: "docs/adr", folder: true }]) {
    const out = exclusionWrites(catalog(), newApi(), { ...change, excluded: true });
    assert.equal(out.length, 1, change.path);
    assert.equal(out[0].view, "exclusions");
    assert.deepEqual(out[0].body, change.folder
      ? { paths: [], folders: ["docs/adr"], excluded: true }
      : { paths: ["AGENTS.md"], folders: [], excluded: true });

    const excluded = applyExclusion(catalog(), newApi(), { ...change, excluded: true });
    const moved = change.folder ? 3 : 2;
    assert.deepEqual(ruleCounts(allRules(excluded.rules)).excluded, 1 + moved, change.path);
    assert.ok(excluded.rules.excludedPaths.some((entry) => entry.path === change.path && entry.prefix === change.folder));

    const back = exclusionWrites(excluded.catalog, excluded.rules, { ...change, excluded: false });
    assert.deepEqual(back.map((w) => w.view), ["exclusions"], change.path);
    const included = applyExclusion(excluded.catalog, excluded.rules, { ...change, excluded: false });
    assert.deepEqual(ruleCounts(allRules(included.rules)), ruleCounts(allRules(newApi())), change.path);
  }
});

test("on the new API, including a doc excluded before the page loaded is one write to the exclusion list", () => {
  const out = exclusionWrites(catalog(), newApi(), { path: "docs/old.md", folder: false, excluded: false });
  assert.deepEqual(out, [{ view: "exclusions", body: { paths: ["docs/old.md"], folders: [], excluded: false } }]);
  const included = applyExclusion(catalog(), newApi(), { path: "docs/old.md", folder: false, excluded: false });
  assert.equal(state(included.rules).x1, "included");
  assert.equal(ruleCounts(allRules(included.rules)).excluded, 0);
});

test("on the old API, a path held in the rule states is taken back there, and on the list too where it is on both", () => {
  const old = normalizeRules({
    ignoredPaths: [{ path: "docs/adr", prefix: true }],
    documents: [{ document: { path: "docs/adr/0007.md", ignored: true }, rules: [rule("d1", { ignored: true, ignoredBy: "folder" })] }],
  });
  assert.deepEqual(exclusionWrites(catalog(), old, { path: "docs/adr", folder: true, excluded: false }),
    [{ view: "rule-states", body: { excluded: false, ignored: false, path: "docs/adr", prefix: true } }]);
  const both = { ...catalog(), exclusions: [{ path: "docs/adr", folder: true }] };
  assert.deepEqual(exclusionWrites(both, old, { path: "docs/adr", folder: true, excluded: false }).map((w) => w.view),
    ["rule-states", "exclusions"]);
  // Excluding never writes to the rule states.
  assert.deepEqual(exclusionWrites(both, old, { path: "docs/adr", folder: true, excluded: true }).map((w) => w.view),
    ["exclusions"]);
});

test("the repository is excluded as the empty folder", () => {
  assert.deepEqual(exclusionWrites(catalog(), newApi(), { path: "", folder: true, excluded: true }),
    [{ view: "exclusions", body: { paths: [], folders: [""], excluded: true } }]);
});
