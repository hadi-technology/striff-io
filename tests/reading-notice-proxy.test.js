import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const { testing } = await import("../netlify/lib/access-cache.js");
const { handler } = await import("../netlify/functions/reading-notice.js");

const TOKEN = "gho_notifTokenA_0123456789";
const EMAIL = "alice.private@example.org";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;
let asked;
let logged;
let github;
let api;

beforeEach(() => {
  asked = [];
  logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  console.log = (...args) => logged.push(args.join(" "));
  const blobs = new Map();
  testing.useStore(() => ({
    async get(key) { return blobs.has(key) ? JSON.parse(blobs.get(key)) : null; },
    async setJSON(key, value) { blobs.set(key, JSON.stringify(value)); },
    async list() { return { blobs: [] }; },
    async delete() {},
  }));
  github = {
    user: { id: 42, login: "alice" },
    emails: [
      { email: "old@example.org", primary: false, verified: true },
      { email: EMAIL, primary: true, verified: true },
    ],
    installations: [{ id: 7, account: { login: "acme" } }],
    repositories: [{ full_name: "acme/Widgets" }, { full_name: "acme/other" }],
  };
  api = { status: 200, body: { reading: "in_progress", watching: true } };
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin === "https://api.example") return json(api.body, api.status);
    assert.equal(u.origin, "https://api.github.com");
    if (!(init.headers?.Authorization || "").endsWith(TOKEN)) return json({ message: "Bad credentials" }, 401);
    if (u.pathname === "/user") return json(github.user);
    if (u.pathname === "/user/emails") return json(github.emails);
    if (u.pathname === "/user/installations") {
      return json({ total_count: github.installations.length, installations: github.installations });
    }
    if (/^\/user\/installations\/\d+\/repositories$/.test(u.pathname)) {
      return json({ total_count: github.repositories.length, repositories: github.repositories });
    }
    return json({ message: "Not Found" }, 404);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.log = realLog;
});

const headers = { cookie: `gh_token=${TOKEN}` };
const get = (id = "7", repo = "acme/widgets") =>
  handler({ httpMethod: "GET", headers, queryStringParameters: { installation_id: id, repo } });
const put = (body) => handler({ httpMethod: "PUT", headers, body: JSON.stringify(body) });
const apiCalls = () => asked.filter((a) => a.url.startsWith("https://api.example"));

test("a read asks the API with the GitHub identity and the canonical repository spelling", async () => {
  const res = await get("7", "acme/Widgets");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), api.body);
  const u = new URL(apiCalls()[0].url);
  assert.equal(u.pathname, "/api/v1/organizations/7/reading-notice");
  assert.equal(u.searchParams.get("user_id"), "42");
  assert.equal(u.searchParams.get("owner"), "acme");
  assert.equal(u.searchParams.get("repo"), "Widgets");
  assert.equal(apiCalls()[0].init.headers["X-Server-Key"], "server-key");
});

test("a registration sends the verified primary email from GitHub, never one from the request", async () => {
  const res = await put({ installation_id: 7, repo: "acme/Widgets", enabled: true, email: "mallory@example.org", githubUserId: "1" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(apiCalls()[0].init.body), {
    githubUserId: "42", login: "alice", email: EMAIL, owner: "acme", repo: "Widgets", enabled: true,
  });
});

test("with no verified primary email nothing is registered and the caller is told why", async () => {
  github.emails = [{ email: "x@example.org", primary: true, verified: false }];
  const res = await put({ installation_id: 7, repo: "acme/widgets", enabled: true });
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).message, "No verified email on your GitHub account");
  assert.equal(apiCalls().length, 0);
});

test("withdrawing sends no email address at all", async () => {
  await put({ installation_id: 7, repo: "acme/widgets", enabled: false });
  assert.equal(JSON.parse(apiCalls()[0].init.body).email, null);
});

test("an installation or repository the user cannot see never reaches the API", async () => {
  assert.equal((await get("9")).statusCode, 403);
  assert.equal((await get("7", "other/private")).statusCode, 403);
  assert.equal((await put({ installation_id: 7, repo: "other/private", enabled: true })).statusCode, 403);
  assert.equal(apiCalls().length, 0);
});

test("malformed ids and repositories never reach GitHub", async () => {
  assert.equal((await get("7/../x")).statusCode, 400);
  assert.equal((await get("7", "no-slash")).statusCode, 400);
  assert.equal(asked.length, 0);
});
