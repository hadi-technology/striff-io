import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const { testing } = await import("../netlify/lib/access-cache.js");
const { handler } = await import("../netlify/functions/doc-catalog-proxy.js");

const TOKEN = "gho_owner_0123456789";
const sha = (token) => crypto.createHash("sha256").update(token).digest("hex");

let store;
let asked;
/** What GitHub says the caller may do on acme/widgets. */
let permissions;
const realFetch = globalThis.fetch;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  asked = [];
  permissions = { admin: true, maintain: true, push: true, pull: true };
  const data = new Map();
  store = {
    data,
    async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(key) { data.delete(key); },
  };
  testing.useStore(() => store);
  // The caller sees acme/widgets under installation 7, and their login is already known.
  const at = Date.now();
  data.set(`${sha(TOKEN)}/installations/7/repositories`, JSON.stringify({ v: 1, at, names: ["acme/widgets"] }));
  data.set(`${sha(TOKEN)}/login`, JSON.stringify({ v: 1, at, login: "alice" }));
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin === "https://api.example") return json({ answered: u.pathname });
    if (u.origin === "https://api.github.com" && u.pathname === "/repos/acme/widgets") {
      return json({ full_name: "acme/widgets", permissions });
    }
    return json({ message: "Not Found" }, 404);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function request(method, view, body) {
  return handler({
    httpMethod: method,
    headers: { cookie: `gh_token=${TOKEN}` },
    queryStringParameters: { installation_id: "7", owner: "acme", repo: "widgets", ...(view ? { view } : {}) },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

const apiCalls = () => asked.filter((a) => a.url.startsWith("https://api.example"));

test("each write goes to its own API path", async () => {
  for (const [view, path] of [[null, "exclusions"], ["exclusions", "exclusions"], ["force-read", "force-read"],
    ["rule-states", "rule-states"]]) {
    asked = [];
    const res = await request("PATCH", view, { paths: ["a.md"] });
    assert.equal(res.statusCode, 200, String(view));
    assert.equal(new URL(apiCalls()[0].url).pathname,
      `/api/v1/organizations/7/repos/acme/widgets/doc-catalog/${path}`, String(view));
  }
});

test("a write the dashboard does not make goes nowhere, rather than to the exclusion list", async () => {
  for (const view of ["rules", "__proto__", "exclusionz"]) {
    asked = [];
    const res = await request("PATCH", view, { paths: ["a.md"] });
    assert.equal(res.statusCode, 400, view);
    assert.equal(JSON.parse(res.body).error, "unknown_view");
    assert.equal(apiCalls().length, 0, view);
  }
});

test("a rule-state write carries the caller's login, never the body's", async () => {
  await request("PATCH", "rule-states", { ignored: true, factIds: ["a.md|abc"], actor: "mallory" });

  assert.deepEqual(JSON.parse(apiCalls()[0].init.body),
    { ignored: true, factIds: ["a.md|abc"], actor: "alice" });
});

test("only the repository's owner or an admin can change which rules are checked", async () => {
  for (const shy of [{ admin: false, maintain: true, push: true }, { admin: false, maintain: false, push: true }]) {
    permissions = shy;
    asked = [];

    const res = await request("PATCH", "rule-states", { ignored: true, path: "docs", prefix: true });

    assert.equal(res.statusCode, 403, JSON.stringify(shy));
    assert.equal(JSON.parse(res.body).error, "not_repo_admin");
    assert.equal(apiCalls().length, 0);
  }
});

test("an admin passes the gate, and the exclusion list is not gated", async () => {
  permissions = { admin: true, maintain: false };
  assert.equal((await request("PATCH", "rule-states", { ignored: false, path: "", prefix: true })).statusCode, 200);

  permissions = { admin: false, maintain: false };
  assert.equal((await request("PATCH", null, { paths: ["a.md"] })).statusCode, 200);
});

test("the permissions view answers from GitHub and asks the API nothing", async () => {
  let res = await request("GET", "permissions");
  assert.deepEqual(JSON.parse(res.body), { canManageRules: true });

  permissions = { admin: false, maintain: true, push: true };
  res = await request("GET", "permissions");
  assert.deepEqual(JSON.parse(res.body), { canManageRules: false });
  assert.equal(apiCalls().length, 0);
});

test("a GitHub that will not answer is a no", async () => {
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.origin === "https://api.github.com") return json({ message: "Server Error" }, 502);
    return json({ answered: u.pathname });
  };

  const res = await request("PATCH", "rule-states", { ignored: true, factIds: ["a.md|abc"] });

  assert.equal(res.statusCode, 403);
});

test("the issues the findings are tracked in are read from their own API path", async () => {
  const res = await request("GET", "finding-issues");

  assert.equal(res.statusCode, 200);
  const call = apiCalls().find((a) => a.url.includes("/finding-issues"));
  assert.ok(call, JSON.stringify(asked.map((a) => a.url)));
  assert.match(call.url, /\/api\/v1\/organizations\/7\/repos\/acme\/widgets\/doc-catalog\/finding-issues\?token=/);
  assert.equal(call.init.headers["X-Server-Key"], "server-key");
});
