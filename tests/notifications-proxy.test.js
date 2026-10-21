import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const { testing } = await import("../netlify/lib/access-cache.js");
const { handler, settingsFrom, verifiedPrimaryEmail } = await import("../netlify/functions/notifications.js");

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
  api = { status: 200, body: { enabled: true, scope: "ALL", repos: [], canManageInstallation: false } };
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
const get = (id = "7") =>
  handler({ httpMethod: "GET", headers, queryStringParameters: { installation_id: id } });
const put = (body) => handler({ httpMethod: "PUT", headers, body: JSON.stringify(body) });
const apiCalls = () => asked.filter((a) => a.url.startsWith("https://api.example"));

test("a read forwards the GitHub user id and the per-installation token, with the user's own token", async () => {
  const res = await get();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), api.body);
  const [call] = apiCalls();
  const u = new URL(call.url);
  assert.equal(u.pathname, "/api/v1/organizations/7/notifications");
  assert.equal(u.searchParams.get("user_id"), "42");
  assert.match(u.searchParams.get("token"), /^v1\.\d+\.[0-9a-f]{64}$/);
  assert.equal(call.init.headers["X-Server-Key"], "server-key");
  assert.equal(call.init.headers["X-GitHub-User-Token"], TOKEN);
});

test("an installation the user cannot see is refused before the API is asked", async () => {
  const res = await get("9");
  assert.equal(res.statusCode, 403);
  assert.equal(apiCalls().length, 0);
  const saved = await put({ installation_id: 9, enabled: true, scope: "ALL" });
  assert.equal(saved.statusCode, 403);
  assert.equal(apiCalls().length, 0);
});

test("a malformed installation id never reaches GitHub or the API", async () => {
  const res = await get("7/../../x");
  assert.equal(res.statusCode, 400);
  assert.equal(asked.length, 0);
});

test("a save sends the identity from GitHub, not from the request", async () => {
  const res = await put({
    installation_id: 7, enabled: true, scope: "ALL",
    userId: "1", login: "mallory", email: "mallory@example.org",
  });
  assert.equal(res.statusCode, 200);
  const [call] = apiCalls();
  assert.equal(call.init.method, "PUT");
  assert.equal(new URL(call.url).pathname, "/api/v1/organizations/7/notifications");
  assert.deepEqual(JSON.parse(call.init.body), {
    enabled: true, scope: "ALL", repos: [], userId: "42", login: "alice", email: EMAIL,
  });
});

test("chosen repositories are kept when the user sees them and dropped when not", async () => {
  await put({ installation_id: 7, enabled: true, scope: "REPOS", repos: ["acme/widgets", "other/private"] });
  assert.deepEqual(JSON.parse(apiCalls()[0].init.body).repos, ["acme/widgets"]);
});

test("admin-only fields go through when named, and are left out when not", async () => {
  await put({ installation_id: 7, enabled: false, scope: "ALL", installationEnabled: false, defaultForNewRepos: true });
  const sent = JSON.parse(apiCalls()[0].init.body);
  assert.equal(sent.installationEnabled, false);
  assert.equal(sent.defaultForNewRepos, true);
  await put({ installation_id: 7, enabled: false, scope: "ALL" });
  const plain = JSON.parse(apiCalls()[1].init.body);
  assert.ok(!("installationEnabled" in plain) && !("defaultForNewRepos" in plain));
});

test("a refusal from the API for a non-admin is passed on as it came", async () => {
  api = { status: 403, body: { error: "admin_only" } };
  const res = await put({ installation_id: 7, enabled: true, scope: "ALL", installationEnabled: false });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { error: "admin_only" });
});

test("turning emails on without a verified primary email is refused; turning them off is not", async () => {
  github.emails = [{ email: "x@example.org", primary: true, verified: false }];
  const on = await put({ installation_id: 7, enabled: true, scope: "ALL" });
  assert.equal(on.statusCode, 409);
  assert.equal(JSON.parse(on.body).error, "no_verified_email");
  assert.equal(apiCalls().length, 0);
  const off = await put({ installation_id: 7, enabled: false, scope: "ALL" });
  assert.equal(off.statusCode, 200);
  assert.equal(JSON.parse(apiCalls()[0].init.body).email, null);
});

test("neither the email nor the token is logged, and no email goes back to the page", async () => {
  api = { status: 500, body: { error: "boom" } };
  const res = await put({ installation_id: 7, enabled: true, scope: "ALL" });
  assert.ok(!res.body.includes(EMAIL));
  globalThis.fetch = async () => { throw new Error("network down"); };
  await get();
  for (const line of logged) {
    assert.ok(!line.includes(EMAIL) && !line.includes(TOKEN));
  }
});

test("a session GitHub refuses is signed out, not an error", async () => {
  const res = await handler({
    httpMethod: "GET",
    headers: { cookie: "gh_token=gho_revoked" },
    queryStringParameters: { installation_id: "7" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(apiCalls().length, 0);
});

test("only GET and PUT are answered", async () => {
  const res = await handler({ httpMethod: "POST", headers, body: "{}" });
  assert.equal(res.statusCode, 405);
});

test("settings are checked: scope, repository names, flags", () => {
  assert.ok(settingsFrom({ enabled: true, scope: "ALL" }).settings);
  for (const bad of [
    null,
    { scope: "ALL" },
    { enabled: true, scope: "SOME" },
    { enabled: true, scope: "REPOS" },
    { enabled: true, scope: "REPOS", repos: ["../x"] },
    { enabled: true, scope: "REPOS", repos: [5] },
    { enabled: true, scope: "ALL", installationEnabled: "no" },
  ]) {
    assert.ok(settingsFrom(bad).error, JSON.stringify(bad));
  }
  assert.deepEqual(settingsFrom({ enabled: true, scope: "REPOS", repos: ["a/b", "a/b"] }).settings.repos, ["a/b"]);
});

test("the primary email must be verified", () => {
  assert.equal(verifiedPrimaryEmail([{ email: "A@B.org", primary: true, verified: true }]), "a@b.org");
  assert.equal(verifiedPrimaryEmail([{ email: "a@b.org", primary: true, verified: false }]), null);
  assert.equal(verifiedPrimaryEmail({ message: "x" }), null);
});
