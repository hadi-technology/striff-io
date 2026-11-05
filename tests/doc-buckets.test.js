import { test } from "node:test";
import assert from "node:assert/strict";
import { docBucket, excludedDocPaths } from "../src/lib/docBuckets.js";
import { normalizeRules, ruleCounts } from "../src/lib/ruleStates.js";

const doc = (path, state) => ({ path, state });
const docs = [
  doc("a.md", "READ"), doc("b.md", "READ"), doc("c.md", "NOT_READ"), doc("d.md", "UNREADABLE"),
  doc("e.md", "EXCLUDED"), doc("f.md", "SCREENED_OUT"), doc("g.md", "RETIRED"), doc("h.md", "OUTSIDE_FIRST_READING"),
];

test("a doc that says it is no longer current is excluded, like one Striff screened out", () => {
  const excluded = excludedDocPaths(docs, []);
  assert.deepEqual([...excluded].sort(), ["e.md", "f.md", "g.md"]);
  assert.equal(docBucket(doc("g.md", "RETIRED"), false, true), "excluded");
  assert.equal(docBucket(doc("g.md", "RETIRED"), true, false), "excluded");
});

test("the document chips partition the documents, retired ones among the excluded", () => {
  const excluded = excludedDocPaths(docs, []);
  const rules = new Set(["a.md"]);
  const buckets = {};
  for (const each of docs) {
    const bucket = docBucket(each, excluded.has(each.path), rules.has(each.path));
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  assert.deepEqual(buckets, { results: 1, noRules: 1, notRead: 2, unreadable: 1, excluded: 3 });
  assert.equal(Object.values(buckets).reduce((sum, n) => sum + n, 0), docs.length);
});

test("a doc set aside in the rule states is excluded too", () => {
  assert.ok(excludedDocPaths([doc("docs/x.md", "READ")], [{ path: "docs", prefix: true }]).has("docs/x.md"));
});

test("the rules of a retired doc are counted as excluded, in none of the standings", () => {
  const answer = normalizeRules({
    documents: [
      { document: doc("a.md", "READ"), rules: [{ factId: "1", status: "MAINTAINED", onDefaultBranch: "HOLDS" }] },
      { document: doc("g.md", "RETIRED"), rules: [{ factId: "2", status: "MAINTAINED", onDefaultBranch: "HOLDS" }, { factId: "3", status: null, onDefaultBranch: null }] },
    ],
  });
  const counts = ruleCounts(answer.documents.flatMap((group) => group.rules));
  assert.deepEqual(counts, { all: 3, holds: 1, broken: 0, unchecked: 0, unclear: 0, excluded: 2 });
});
