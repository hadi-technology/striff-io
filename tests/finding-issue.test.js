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
