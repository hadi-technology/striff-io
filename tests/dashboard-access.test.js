import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const { testing, tokenHash, ACCESS_TTL_MS } = await import("../netlify/lib/access-cache.js");
const bootstrap = (await import("../netlify/functions/dashboard-bootstrap.js")).handler;
const docCatalog = (await import("../netlify/functions/doc-catalog-proxy.js")).handler;
const metrics = (await import("../netlify/functions/metrics-proxy.js")).handler;
const billing = (await import("../netlify/functions/billing-proxy.js")).handler;
const logout = (await import("../netlify/functions/auth-logout.js")).handler;

const TOKEN_A = "gho_tokenA_0123456789";
const TOKEN_B = "gho_tokenB_0123456789";
const sha = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** A Netlify Blobs store kept in a Map, recording every call. */
function fakeStore() {
  const data = new Map();
  const calls = [];
  return {
    data,
    calls,
    failReads: false,
    async get(key, options) {
      calls.push(["get", key]);
      if (this.failReads) throw new Error("blobs unavailable");
      assert.equal(options?.type, "json");
      return data.has(key) ? JSON.parse(data.get(key)) : null;
    },
    async setJSON(key, value) {
      calls.push(["setJSON", key]);
      data.set(key, JSON.stringify(value));
    },
    async list({ prefix }) {
      calls.push(["list", prefix]);
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(key) {
      calls.push(["delete", key]);
      data.delete(key);
    },
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const repo = (fullName, extra = {}) => ({
  full_name: fullName,
  private: true,
  html_url: `https://github.com/${fullName}`,
  default_branch: "main",
  node_id: "unused",
  ...extra,
});
const installation = (id, login) => ({
  id,
  account: { login, avatar_url: `https://avatars/${login}`, type: "Organization", node_id: "x" },
  repository_selection: "selected",
  permissions: { contents: "read" },
});

/** What GitHub knows, per token. */
let github;
let asked;
let store;
const realFetch = globalThis.fetch;

function paged(list, url) {
  const page = Number(new URL(url).searchParams.get("page") || "1");
  const perPage = Number(new URL(url).searchParams.get("per_page") || "30");
  return list.slice((page - 1) * perPage, page * perPage);
}

beforeEach(() => {
  asked = [];
  store = fakeStore();
  testing.useStore(() => store);
  github = {
    [TOKEN_A]: {
      user: { login: "alice", avatar_url: "https://avatars/alice", name: "Alice", id: 1 },
      installations: [installation(7, "acme")],
      repositories: { 7: [repo("Acme/Widgets")] },
    },
    [TOKEN_B]: {
      user: { login: "bob", avatar_url: "https://avatars/bob", name: null, id: 2 },
      installations: [installation(9, "bobco")],
      repositories: { 9: [repo("bobco/thing")] },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin === "https://api.example") {
      return json({ answered: u.pathname });
    }
    assert.equal(u.origin, "https://api.github.com", `unexpected request to ${url}`);
    const token = (init.headers?.Authorization || "").replace(/^Bearer /, "");
    const known = github[token];
    if (!known) return json({ message: "Bad credentials" }, 401);
    if (typeof known.respond === "function") {
      const special = await known.respond(u);
      if (special) return special;
    }
    if (u.pathname === "/user") return json(known.user);
    if (u.pathname === "/user/installations") {
      return json({ total_count: known.installations.length, installations: paged(known.installations, url) });
    }
    const m = /^\/user\/installations\/(\d+)\/repositories$/.exec(u.pathname);
    if (m) {
      const list = known.repositories[m[1]];
      if (!list) return json({ message: "Not Found" }, 404);
      return json({ total_count: list.length, repositories: paged(list, url) });
    }
    return json({ message: "Not Found" }, 404);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const cookie = (token) => ({ cookie: `other=1; gh_token=${token}` });
const githubCalls = () => asked.filter((a) => a.url.startsWith("https://api.github.com"));
const apiCalls = () => asked.filter((a) => a.url.startsWith("https://api.example"));

function catalogRequest(token, installationId, owner, repoName, extra = {}) {
  return docCatalog({
    httpMethod: "GET",
    headers: cookie(token),
    queryStringParameters: { installation_id: String(installationId), owner, repo: repoName, ...extra },
  });
}

function seed(token, key, value) {
  store.data.set(`${sha(token)}/${key}`, JSON.stringify({ v: 1, at: Date.now(), ...value }));
}

test("the token hash is SHA-256 of the whole token", () => {
  assert.equal(tokenHash(TOKEN_A), sha(TOKEN_A));
  assert.notEqual(tokenHash(`${TOKEN_A}x`), tokenHash(TOKEN_A));
});

test("bootstrap gathers every page, returns the dashboard's shape and caches what it was told", async () => {
  const many = Array.from({ length: 150 }, (_, i) => installation(1000 + i, `org${i}`));
  github[TOKEN_A].installations = many;
  github[TOKEN_A].repositories = Object.fromEntries(many.map((inst) => [inst.id, [repo(`${inst.account.login}/r`)]]));
  github[TOKEN_A].repositories[1000] = Array.from({ length: 230 }, (_, i) => repo(`org0/Repo${i}`));

  const res = await bootstrap({ headers: cookie(TOKEN_A) });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.authenticated, true);
  assert.deepEqual(body.user, { login: "alice", avatar_url: "https://avatars/alice", name: "Alice" });
  assert.equal(body.installations.length, 150);
  assert.deepEqual(body.installations[0], {
    id: 1000,
    account: { login: "org0", avatar_url: "https://avatars/org0", type: "Organization" },
    repository_selection: "selected",
    repositories: github[TOKEN_A].repositories[1000].map((r) => ({
      full_name: r.full_name, private: true, html_url: r.html_url, default_branch: "main",
    })),
  });
  assert.equal(body.installations[0].repositories.length, 230);
  assert.equal(body.installations[149].repositories[0].full_name, "org149/r");

  // Pages 2 and 3 of the 230 repositories, and page 2 of the installations, were asked for.
  const urls = githubCalls().map((a) => a.url);
  assert.ok(urls.includes("https://api.github.com/user/installations?per_page=100&page=2"));
  assert.ok(urls.includes("https://api.github.com/user/installations/1000/repositories?per_page=100&page=3"));
  assert.ok(!urls.includes("https://api.github.com/user/installations?per_page=100&page=3"));

  const hash = sha(TOKEN_A);
  const ids = JSON.parse(store.data.get(`${hash}/installations`));
  assert.equal(ids.ids.length, 150);
  assert.ok(Number.isFinite(ids.at));
  assert.equal(JSON.parse(store.data.get(`${hash}/login`)).login, "alice");
  const names = JSON.parse(store.data.get(`${hash}/installations/1000/repositories`)).names;
  assert.equal(names.length, 230);
  assert.ok(names.includes("org0/repo17"));
  // The token itself is nowhere in the store.
  for (const [key, value] of store.data) {
    assert.ok(!key.includes(TOKEN_A) && !value.includes(TOKEN_A));
    assert.ok(key.startsWith(`${hash}/`));
  }
});

test("bootstrap without a cookie, or with a token GitHub refuses, says signed out and caches nothing", async () => {
  assert.deepEqual(JSON.parse((await bootstrap({ headers: {} })).body), { authenticated: false });
  const refused = await bootstrap({ headers: cookie("gho_revoked") });
  assert.equal(refused.statusCode, 200);
  assert.deepEqual(JSON.parse(refused.body), { authenticated: false });
  assert.equal(store.data.size, 0);
});

test("bootstrap shows a listing that failed as before but caches only the complete ones", async () => {
  github[TOKEN_A].installations = [installation(7, "acme"), installation(8, "beta")];
  github[TOKEN_A].repositories[8] = Array.from({ length: 150 }, (_, i) => repo(`beta/r${i}`));
  github[TOKEN_A].respond = (u) =>
    u.pathname === "/user/installations/8/repositories" && u.searchParams.get("page") === "2"
      ? json({ message: "Server Error" }, 502)
      : null;

  const body = JSON.parse((await bootstrap({ headers: cookie(TOKEN_A) })).body);

  assert.equal(body.installations[1].repositories.length, 100);
  const hash = sha(TOKEN_A);
  assert.ok(store.data.has(`${hash}/installations/7/repositories`));
  assert.ok(!store.data.has(`${hash}/installations/8/repositories`));
  assert.ok(store.data.has(`${hash}/installations`));
});

test("a cached listing grants that repository without asking GitHub", async () => {
  seed(TOKEN_A, "installations/7/repositories", { names: ["acme/widgets"] });

  const res = await catalogRequest(TOKEN_A, 7, "Acme", "widgets");

  assert.equal(res.statusCode, 200);
  assert.equal(githubCalls().length, 0);
  assert.equal(apiCalls().length, 1);
  assert.match(apiCalls()[0].url, /\/organizations\/7\/repos\/Acme\/widgets\/doc-catalog\?token=v1\./);
});

test("a cached listing grants only what it lists: anything else is asked of GitHub", async () => {
  seed(TOKEN_A, "installations/7/repositories", { names: ["acme/widgets"] });

  const otherRepo = await catalogRequest(TOKEN_A, 7, "acme", "secret");
  assert.equal(otherRepo.statusCode, 403);
  assert.equal(githubCalls().length, 1);

  const otherInstallation = await catalogRequest(TOKEN_A, 8, "acme", "widgets");
  assert.notEqual(otherInstallation.statusCode, 200);
  assert.equal(apiCalls().length, 0);
});

test("one token never reads another token's entries", async () => {
  // Alice's cache says she sees bobco/thing under installation 9; Bob asks with his own token.
  seed(TOKEN_A, "installations/9/repositories", { names: ["bobco/thing", "bobco/private"] });
  seed(TOKEN_A, "installations", { ids: ["9", "4242"] });

  const res = await catalogRequest(TOKEN_B, 9, "bobco", "private");

  assert.equal(res.statusCode, 403);
  const reads = store.calls.filter(([op]) => op === "get").map(([, key]) => key);
  assert.ok(reads.length > 0);
  for (const key of reads) assert.ok(key.startsWith(`${sha(TOKEN_B)}/`), key);

  const owns = await metrics({ httpMethod: "GET", headers: cookie(TOKEN_B), queryStringParameters: { installation_id: "4242" } });
  assert.equal(owns.statusCode, 403);
  assert.equal(apiCalls().length, 0);
});

test("an expired entry is absent: GitHub is asked, and its no stands", async () => {
  store.data.set(`${sha(TOKEN_A)}/installations/7/repositories`,
    JSON.stringify({ v: 1, at: Date.now() - ACCESS_TTL_MS - 1, names: ["acme/gone"] }));

  const res = await catalogRequest(TOKEN_A, 7, "acme", "gone");

  assert.equal(res.statusCode, 403);
  assert.equal(githubCalls().length, 1);
  // GitHub's complete answer replaces it.
  const names = JSON.parse(store.data.get(`${sha(TOKEN_A)}/installations/7/repositories`)).names;
  assert.deepEqual(names, ["acme/widgets"]);
});

test("an entry dated in the future, malformed, or of another format grants nothing", async () => {
  const key = `${sha(TOKEN_A)}/installations/7/repositories`;
  for (const value of [
    { v: 1, at: Date.now() + 10 * 60 * 1000, names: ["acme/x"] },
    { v: 1, at: "now", names: ["acme/x"] },
    { v: 2, at: Date.now(), names: ["acme/x"] },
    { v: 1, at: Date.now(), names: "acme/x" },
    { v: 1, at: Date.now(), names: [{ toLowerCase: 1 }] },
  ]) {
    store.data.set(key, JSON.stringify(value));
    const res = await catalogRequest(TOKEN_A, 7, "acme", "x");
    assert.equal(res.statusCode, 403, JSON.stringify(value));
  }
});

test("a cache that cannot be read is a miss, never a grant", async () => {
  seed(TOKEN_A, "installations/7/repositories", { names: ["acme/secret"] });
  seed(TOKEN_A, "installations", { ids: ["4242"] });
  store.failReads = true;

  const docs = await catalogRequest(TOKEN_A, 7, "acme", "secret");
  assert.equal(docs.statusCode, 403);

  const seen = await catalogRequest(TOKEN_A, 7, "acme", "widgets");
  assert.equal(seen.statusCode, 200);

  const m = await metrics({ httpMethod: "GET", headers: cookie(TOKEN_A), queryStringParameters: { installation_id: "4242" } });
  assert.equal(m.statusCode, 403);
});

test("a store that cannot be opened at all falls back to GitHub", async () => {
  testing.useStore(() => {
    throw new Error("The environment has not been configured to use Netlify Blobs");
  });
  const ok = await catalogRequest(TOKEN_A, 7, "acme", "widgets");
  assert.equal(ok.statusCode, 200);
  const no = await catalogRequest(TOKEN_A, 7, "acme", "secret");
  assert.equal(no.statusCode, 403);
  assert.equal(githubCalls().length, 2);
});

test("a GitHub failure is never cached, and keeps its own answer", async () => {
  const key = `${sha(TOKEN_A)}/installations/7/repositories`;

  github[TOKEN_A].respond = () => json({ message: "Server Error" }, 500);
  assert.equal((await catalogRequest(TOKEN_A, 7, "acme", "widgets")).statusCode, 503);
  assert.ok(!store.data.has(key));

  github[TOKEN_A].respond = () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" });
  assert.equal((await catalogRequest(TOKEN_A, 7, "acme", "widgets")).statusCode, 503);
  assert.ok(!store.data.has(key));

  github[TOKEN_A].respond = () => json({ message: "Bad credentials" }, 401);
  const signedOut = await catalogRequest(TOKEN_A, 7, "acme", "widgets");
  assert.equal(signedOut.statusCode, 401);
  assert.equal(JSON.parse(signedOut.body).error, "github_sign_in_expired");

  github[TOKEN_A].respond = (u) => (u.pathname === "/user/installations" ? json({}, 502) : null);
  const m = await metrics({ httpMethod: "GET", headers: cookie(TOKEN_A), queryStringParameters: { installation_id: "7" } });
  assert.equal(m.statusCode, 403);

  assert.equal(store.calls.filter(([op]) => op === "setJSON").length, 0);
});

test("a listing cut short by a failed page is not cached, but what it showed still grants", async () => {
  github[TOKEN_A].repositories[7] = Array.from({ length: 250 }, (_, i) => repo(`acme/r${i}`));
  github[TOKEN_A].respond = (u) => (u.searchParams.get("page") === "3" ? json({}, 500) : null);

  assert.equal((await catalogRequest(TOKEN_A, 7, "acme", "r5")).statusCode, 200);
  assert.equal((await catalogRequest(TOKEN_A, 7, "acme", "r240")).statusCode, 503);
  assert.equal(store.calls.filter(([op]) => op === "setJSON").length, 0);
});

test("ownership of an installation past the first hundred is honoured, then answered from the cache", async () => {
  github[TOKEN_A].installations = Array.from({ length: 250 }, (_, i) => installation(5000 + i, `o${i}`));

  const first = await metrics({ httpMethod: "GET", headers: cookie(TOKEN_A), queryStringParameters: { installation_id: "5234" } });
  assert.equal(first.statusCode, 200);
  assert.equal(githubCalls().length, 3);
  assert.equal(JSON.parse(store.data.get(`${sha(TOKEN_A)}/installations`)).ids.length, 250);

  const second = await billing({
    httpMethod: "POST",
    headers: cookie(TOKEN_A),
    body: JSON.stringify({ action: "status", installation_id: 5150 }),
  });
  assert.equal(second.statusCode, 200);
  assert.equal(githubCalls().length, 3);

  const notOwned = await billing({
    httpMethod: "POST",
    headers: cookie(TOKEN_A),
    body: JSON.stringify({ action: "status", installation_id: 7 }),
  });
  assert.equal(notOwned.statusCode, 403);
  assert.equal(githubCalls().length, 6);
});

test("the proxies keep refusing a malformed installation id before anything is asked", async () => {
  const docs = await catalogRequest(TOKEN_A, "7/../../user/repos", "acme", "widgets");
  assert.equal(docs.statusCode, 400);
  const m = await metrics({ httpMethod: "GET", headers: cookie(TOKEN_A), queryStringParameters: { installation_id: "7a" } });
  assert.equal(m.statusCode, 400);
  assert.equal(asked.length, 0);
  assert.equal(store.calls.length, 0);
});

test("the actor on a write is the cached login for this token, never the body's", async () => {
  seed(TOKEN_A, "installations/7/repositories", { names: ["acme/widgets"] });
  seed(TOKEN_A, "login", { login: "alice" });

  await docCatalog({
    httpMethod: "PATCH",
    headers: cookie(TOKEN_A),
    queryStringParameters: { installation_id: "7", owner: "acme", repo: "widgets" },
    body: JSON.stringify({ paths: ["a.md"], actor: "mallory" }),
  });

  assert.equal(githubCalls().length, 0);
  assert.equal(JSON.parse(apiCalls()[0].init.body).actor, "alice");
});

test("signing out deletes that token's entries and no one else's", async () => {
  seed(TOKEN_A, "installations", { ids: ["7"] });
  seed(TOKEN_A, "installations/7/repositories", { names: ["acme/widgets"] });
  seed(TOKEN_B, "installations", { ids: ["9"] });

  const res = await logout({ headers: cookie(TOKEN_A) });

  assert.equal(res.statusCode, 302);
  assert.deepEqual([...store.data.keys()], [`${sha(TOKEN_B)}/installations`]);
});
