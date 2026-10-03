import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyFrom, loadTallies } from "../src/data/ossTally.js";

const repo = (name, snapshot = { held: 1, broken: 0, outOfDate: 1 }) => ({ owner: "acme", repo: name, snapshot });
const catalog = (summary) => ({ summary: { rules: 3, holdsOnDefaultBranch: 3, brokenOnDefaultBranch: 0, rereading: 0, ...summary } });
const findings = (n) => ({ findings: Array.from({ length: n }, (_, i) => ({ name: `T${i}` })) });

/** A fetch that answers each view from `answers[repo][view]`, and records what it was asked. */
function fakeFetch(answers, asked = []) {
  return async (url) => {
    const u = new URL(url);
    asked.push(u);
    const answer = answers[u.searchParams.get("repo")]?.[u.searchParams.get("view")];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer), { status: 200 });
  };
}

test("the tally is the default branch's holding and broken rules and the names out of date", () => {
  assert.deepEqual(tallyFrom(catalog({ rules: 56, holdsOnDefaultBranch: 54, brokenOnDefaultBranch: 2 }), findings(1)),
    { held: 54, broken: 2, outOfDate: 1, rules: 56 });
});

test("while documents are read again, the rules that held last time still count as held", () => {
  const t = tallyFrom(catalog({ rules: 10, holdsOnDefaultBranch: 10, rereading: 2, lastKnownRules: 7, lastKnownHeld: 6 }), findings(0));
  assert.equal(t.held, 16);
  assert.equal(t.rules, 17);
  const settled = tallyFrom(catalog({ rereading: 0, lastKnownHeld: 6 }), findings(0));
  assert.equal(settled.held, 3);
});

test("an answer of another shape is no tally", () => {
  assert.equal(tallyFrom({}, findings(1)), null);
  assert.equal(tallyFrom(catalog({ holdsOnDefaultBranch: null }), findings(1)), null);
  assert.equal(tallyFrom(catalog({}), {}), null);
});

test("every read asks for no re-reading", async () => {
  const asked = [];
  await loadTallies([repo("a")], { fetchImpl: fakeFetch({ a: { catalog: catalog({}), "type-findings": findings(1) } }, asked), log: () => {} });
  assert.equal(asked.length, 2);
  for (const u of asked) assert.equal(u.searchParams.get("no_refresh"), "1");
});

test("a report that cannot be read keeps its snapshot, and the rest stay live", async () => {
  const logged = [];
  const out = await loadTallies([repo("a", { held: 9, broken: 0, outOfDate: 2 }), repo("b"), repo("c")], {
    fetchImpl: fakeFetch({
      a: { catalog: new Error("timed out"), "type-findings": findings(1) },
      b: { catalog: catalog({ holdsOnDefaultBranch: 4 }), "type-findings": findings(3) },
      c: { catalog: { unexpected: true }, "type-findings": findings(1) },
    }),
    log: (m) => logged.push(m),
  });
  assert.deepEqual(out.map((r) => [r.repo, r.live, r.tally.held, r.tally.outOfDate]),
    [["a", false, 9, 2], ["b", true, 4, 3], ["c", false, 1, 1]]);
  assert.equal(logged.length, 2);
});

test("a live report with neither a rule nor a finding is left out", async () => {
  const out = await loadTallies([repo("a"), repo("b")], {
    fetchImpl: fakeFetch({
      a: { catalog: catalog({ rules: 0, holdsOnDefaultBranch: 0 }), "type-findings": findings(0) },
      b: { catalog: catalog({ rules: 0, holdsOnDefaultBranch: 0 }), "type-findings": findings(1) },
    }),
    log: () => {},
  });
  assert.deepEqual(out.map((r) => r.repo), ["b"]);
});
