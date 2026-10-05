import { test } from "node:test";
import assert from "node:assert/strict";

const {
  isReportAddress, loadReports, reportFacts, reportHead, scriptJson, sourceFromEnv, viewRequest,
} = await import("../src/lib/staticReports.js");

const quiet = { info() {}, warn() {} };
const API = { kind: "api", base: "https://api.example", key: "server-key" };

function answers(owner, name, overrides = {}) {
  return {
    page: { repoOwner: owner, repoName: name, claimed: false, publishedAtMs: 1000, reading: { state: "done", finishedAtMs: Date.UTC(2026, 9, 2) } },
    catalog: { repoOwner: owner, repoName: name, defaultBranch: "main", lastScanMs: 1, summary: { read: 2 }, documents: [{ path: "README.md" }, { path: "docs/a.md" }] },
    rules: { documents: [{ document: { path: "README.md" }, rules: [
      { factId: "1", statement: "A depends on B", status: null, onDefaultBranch: "HOLDS" },
      { factId: "2", statement: "C never imports D", status: null, onDefaultBranch: "BROKEN" },
      { factId: "3", statement: "E is a contract", status: null, onDefaultBranch: "UNCLEAR" },
    ] }], truncated: false },
    staleNames: { findings: [{ docPath: "README.md", name: "Gone" }, { docPath: "unlisted.md", name: "Elsewhere" }], lastSeenMs: 5, truncated: false },
    ...overrides,
  };
}

/** A striff-api that answers from a table, recording every request. */
function fakeApi(pages, { failing = {} } = {}) {
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url, headers: init.headers });
    const path = new URL(url).pathname;
    if (path === "/api/v1/public-repos/published") {
      return Response.json({ pages: Object.values(pages).map((each) => ({ repoOwner: each.page.repoOwner, repoName: each.page.repoName })) });
    }
    const match = path.match(/^\/api\/v1\/public-repos\/([^/]+)\/([^/]+)(.*)$/);
    const key = `${match[1]}/${match[2]}`;
    const view = { "": "page", "/doc-catalog": "catalog", "/doc-catalog/rules": "rules", "/doc-catalog/type-findings": "staleNames" }[match[3]];
    if (failing[key]?.[view]) return new Response("{}", { status: failing[key][view] });
    if (!pages[key]) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(pages[key][view]);
  };
  return { fetchImpl, asked };
}

test("the build reads striff-api with the server key, or a site's proxy with a given list, or nothing", () => {
  assert.deepEqual(sourceFromEnv({ STRIFF_SERVER_KEY: "k", STRIFF_API_BASE_URL: "https://api.example/" }),
    { kind: "api", base: "https://api.example", key: "k" });
  assert.deepEqual(sourceFromEnv({ STRIFF_REPORTS_PROXY: "https://striff.io/", STRIFF_REPORTS_LIST: "a/b, c/d" }),
    { kind: "proxy", base: "https://striff.io", list: [{ repoOwner: "a", repoName: "b" }, { repoOwner: "c", repoName: "d" }] });
  assert.equal(sourceFromEnv({}), null);
  assert.equal(sourceFromEnv({ STRIFF_SERVER_KEY: "k", STRIFF_STATIC_REPORTS: "0" }), null);
});

test("every read is the live page's own view", () => {
  const api = viewRequest(API, "acme", "widgets", "type-findings");
  assert.equal(api.url, "https://api.example/api/v1/public-repos/acme/widgets/doc-catalog/type-findings");
  assert.equal(api.headers["X-Server-Key"], "server-key");
  const proxy = viewRequest({ kind: "proxy", base: "https://striff.io" }, "acme", "widgets", "rules");
  assert.equal(proxy.url, "https://striff.io/.netlify/functions/public-repo-proxy?owner=acme&repo=widgets&view=rules");
});

test("a page is built from its four answers", async () => {
  const { fetchImpl, asked } = fakeApi({ "acme/widgets": answers("acme", "widgets") });
  const { reports, skipped } = await loadReports({ source: API, fetchImpl, log: quiet, now: 42, retryDelayMs: 0 });
  assert.equal(reports.length, 1);
  assert.equal(skipped.length, 0);
  assert.equal(reports[0].builtAtMs, 42);
  assert.equal(reports[0].page.repoName, "widgets");
  assert.equal(asked.length, 5);
});

test("a page striff-api has none for, or that a read fails for, is not built, and the build goes on", async () => {
  const pages = { "acme/widgets": answers("acme", "widgets"), "acme/gone": answers("acme", "gone"), "acme/flaky": answers("acme", "flaky") };
  const { fetchImpl } = fakeApi(pages, { failing: { "acme/gone": { page: 404 }, "acme/flaky": { rules: 503 } } });
  const { reports, skipped } = await loadReports({ source: API, fetchImpl, log: quiet, retryDelayMs: 0 });
  assert.deepEqual(reports.map((each) => each.page.repoName), ["widgets"]);
  assert.deepEqual(skipped.map((each) => each.repo).sort(), ["acme/flaky", "acme/gone"]);
});

test("a list that cannot be had builds no report, and never throws", async () => {
  const fetchImpl = async () => { throw new TypeError("fetch failed"); };
  const { reports } = await loadReports({ source: API, fetchImpl, log: quiet, retryDelayMs: 0 });
  assert.deepEqual(reports, []);
  assert.deepEqual((await loadReports({ source: null, log: quiet })).reports, []);
});

test("an answer that is not the page's shape is not built", async () => {
  const { fetchImpl } = fakeApi({ "acme/widgets": answers("acme", "widgets", { rules: { error: "x" } }) });
  const { reports } = await loadReports({ source: API, fetchImpl, log: quiet, retryDelayMs: 0 });
  assert.deepEqual(reports, []);
});

test("an address that is one of the site's own pages is never a report", () => {
  assert.equal(isReportAddress("blog", "post"), false);
  assert.equal(isReportAddress("acme", ".."), false);
  assert.equal(isReportAddress("acme", "widgets"), true);
});

test("the counts are the page's: nothing undecided, and names only in listed documents", () => {
  const facts = reportFacts({ ...answers("acme", "widgets"), builtAtMs: 0 });
  assert.equal(facts.rules, 2);
  assert.equal(facts.holds, 1);
  assert.equal(facts.broken, 1);
  assert.equal(facts.names, 1);
  const unlooked = reportFacts({ ...answers("acme", "widgets", { staleNames: { findings: [{ docPath: "README.md" }], lastSeenMs: null } }), builtAtMs: 0 });
  assert.equal(unlooked.names, 0);
});

test("the head names the repository and its counts, points at itself and never says installed", () => {
  const head = reportHead({ ...answers("acme", "widgets"), builtAtMs: 0 });
  assert.equal(head.title, "acme/widgets: 2 documented rules checked against the code | Striff");
  assert.equal(head.canonical, "https://striff.io/acme/widgets/");
  assert.equal(head.robots, "index,follow");
  assert.match(head.description, /^Striff read 2 docs in acme\/widgets and checked the 2 rules they state against the code: 1 holds, 1 broken\. 1 name in the docs no longer matches the code\. Public, read-only report, last refreshed Oct 2, 2026\.$/);
  assert.doesNotMatch(head.description, /install|every pull request/i);
  const ld = JSON.parse(head.jsonLd);
  assert.equal(ld["@type"], "WebPage");
  assert.equal(ld.url, head.canonical);
  assert.equal(ld.about.codeRepository, "https://github.com/acme/widgets");
});

test("a page with nothing decided is built but not indexed", () => {
  const head = reportHead({ ...answers("acme", "widgets", {
    rules: { documents: [], truncated: false }, staleNames: { findings: [], lastSeenMs: null },
  }), builtAtMs: 0 });
  assert.equal(head.robots, "noindex,nofollow");
  assert.equal(head.indexable, false);
});

test("structured data cannot close its script element", () => {
  const json = scriptJson({ text: "</script><script>alert(1)</script>\u2028" });
  assert.doesNotMatch(json, /<|>|\u2028/);
  assert.equal(JSON.parse(json).text, "</script><script>alert(1)</script>\u2028");
});
