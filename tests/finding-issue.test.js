import test from "node:test";
import assert from "node:assert/strict";
import { issueView, ruleMarker, staleNameMarker } from "../src/components/findingIssue.ts";

const url = "https://github.com/acme/checkout-service/issues/431";

test("no issue, or an answer without one, is none", () => {
  assert.deepEqual(issueView(null), { kind: "none" });
  assert.deepEqual(issueView(undefined), { kind: "none" });
});

test("an open issue is shown in place of the button", () => {
  assert.deepEqual(issueView({ number: 431, url, state: "open", stateReason: null }),
    { kind: "open", number: 431, url });
});

test("a reopened issue is open", () => {
  assert.equal(issueView({ number: 431, url, state: "open", stateReason: "reopened" }).kind, "open");
});

test("a closed issue says whether it was closed as not planned", () => {
  assert.deepEqual(issueView({ number: 7, url, state: "closed", stateReason: "completed" }),
    { kind: "closed", number: 7, url, notPlanned: false });
  assert.deepEqual(issueView({ number: 7, url, state: "closed", stateReason: "not_planned" }),
    { kind: "closed", number: 7, url, notPlanned: true });
  assert.equal(issueView({ number: 7, url, state: "closed", stateReason: null }).notPlanned, false);
});

test("anything malformed is none, so the button shows", () => {
  for (const bad of [
    { number: 0, url, state: "open" },
    { number: 1.5, url, state: "open" },
    { number: 3, url: "https://evil.example/issues/3", state: "open" },
    { number: 3, url, state: "merged" },
    "431",
  ]) {
    assert.deepEqual(issueView(bad), { kind: "none" }, JSON.stringify(bad));
  }
});

test("the markers are the exact lines the server looks for", () => {
  assert.equal(ruleMarker("docs/a.md|abc123"), "<!-- striff:finding rule:docs/a.md|abc123 -->");
  assert.equal(staleNameMarker("README.md", "org.x.Y"), "<!-- striff:finding stale-name:README.md:org.x.Y -->");
});

import { issueIndex, withRuleIssues, withStaleNameIssue } from "../src/components/findingIssue.ts";

const open431 = { number: 431, url, state: "open", stateReason: null };
const answer = {
  rules: [{ factId: "AGENTS.md|aaa", issue: open431 }],
  staleNames: [{ docPath: "ARCHITECTURE.md", name: "CartSessionStore", issue: { ...open431, number: 433 } }],
  complete: true,
};

test("a rule takes the issue its factId names", () => {
  const rows = [{ factId: "AGENTS.md|aaa" }, { factId: "AGENTS.md|bbb" }];
  const out = withRuleIssues(rows, issueIndex(answer));
  assert.deepEqual(out[0].issue, open431);
  assert.equal(out[1], rows[1]);
  assert.equal(out[1].issue, undefined);
});

test("a stale name takes the issue its doc and name name", () => {
  const index = issueIndex(answer);
  assert.equal(withStaleNameIssue({ name: "CartSessionStore" }, "ARCHITECTURE.md", index).issue.number, 433);
  const other = { name: "CartSessionStore" };
  assert.equal(withStaleNameIssue(other, "README.md", index), other);
});

test("an empty, failed or malformed answer leaves the rows as they were", () => {
  const rows = [{ factId: "AGENTS.md|aaa", issue: open431 }];
  for (const bad of [null, undefined, {}, { rules: [], staleNames: [] }, { error: "unavailable" }, "nope", { rules: "x" }]) {
    const index = issueIndex(bad);
    assert.equal(index, null, JSON.stringify(bad));
    assert.equal(withRuleIssues(rows, index), rows);
    const finding = { name: "X" };
    assert.equal(withStaleNameIssue(finding, "README.md", index), finding);
  }
});

test("an issue already on a row stays where the answer says nothing of it", () => {
  const rows = [{ factId: "AGENTS.md|zzz", issue: open431 }];
  assert.equal(withRuleIssues(rows, issueIndex(answer)), rows);
});
