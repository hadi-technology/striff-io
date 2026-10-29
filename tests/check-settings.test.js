import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const { testing } = await import("../netlify/lib/access-cache.js");
const { handler: accountHandler } = await import("../netlify/functions/check-settings.js");
const { handler: repoHandler, checkSettingsBody } = await import("../netlify/functions/doc-catalog-proxy.js");
const lib = await import("../src/lib/checkSettings.js");

const TOKEN = "gho_checkSettings_0123456789";
const sha = (token) => crypto.createHash("sha256").update(token).digest("hex");
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const realFetch = globalThis.fetch;
let asked;
let permissions;

beforeEach(() => {
  asked = [];
  permissions = { admin: true };
  const data = new Map();
  const at = Date.now();
  data.set(`${sha(TOKEN)}/installations/7/repositories`, JSON.stringify({ v: 1, at, names: ["acme/widgets"] }));
  data.set(`${sha(TOKEN)}/installations`, JSON.stringify({ v: 1, at, ids: [7] }));
  data.set(`${sha(TOKEN)}/login`, JSON.stringify({ v: 1, at, login: "alice" }));
  testing.useStore(() => ({
    async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
    async list() { return { blobs: [] }; },
    async delete() {},
  }));
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin === "https://api.example") return json({ answered: u.pathname });
    if (u.pathname === "/repos/acme/widgets") return json({ permissions });
    if (u.pathname === "/user/installations") return json({ total_count: 1, installations: [{ id: 7 }] });
    return json({ message: "Not Found" }, 404);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const apiCalls = () => asked.filter((a) => a.url.startsWith("https://api.example"));
const repoRequest = (method, body) => repoHandler({
  httpMethod: method,
  headers: { cookie: `gh_token=${TOKEN}` },
  queryStringParameters: { installation_id: "7", owner: "acme", repo: "widgets", view: "check-settings" },
  body: body == null ? undefined : JSON.stringify(body),
});

test("a reader who sees the repository reads its check settings, admin or not", async () => {
  permissions = { admin: false, push: true };
  const res = await repoRequest("GET");
  assert.equal(res.statusCode, 200);
  assert.equal(new URL(apiCalls()[0].url).pathname, "/api/v1/organizations/7/repos/acme/widgets/check-settings");
  assert.equal(apiCalls()[0].init.method, undefined);
});

test("only an admin writes them, as a PUT carrying the caller's login", async () => {
  permissions = { admin: false, push: true };
  let res = await repoRequest("PATCH", { failOnBreak: true });
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "not_repo_admin");
  assert.equal(apiCalls().length, 0);

  permissions = { admin: true };
  res = await repoRequest("PATCH", { prComments: null, failOnBreak: true, updatedBy: "mallory", extra: 1 });
  assert.equal(res.statusCode, 200);
  assert.equal(apiCalls()[0].init.method, "PUT");
  assert.equal(new URL(apiCalls()[0].url).pathname, "/api/v1/organizations/7/repos/acme/widgets/check-settings");
  assert.deepEqual(JSON.parse(apiCalls()[0].init.body), { prComments: null, failOnBreak: true, updatedBy: "alice" });
});

test("a check-settings body names booleans only", () => {
  assert.deepEqual(checkSettingsBody({ prComments: false }, null), { body: { prComments: false } });
  for (const bad of [{}, { prComments: "yes" }, { failOnBreak: null }, { failOnBreak: 1 }, null, "x"]) {
    assert.ok(checkSettingsBody(bad, "alice").error, JSON.stringify(bad));
  }
});

test("the account default is read with the token alone and written with the user's own token", async () => {
  let res = await accountHandler({ httpMethod: "GET", headers: { cookie: `gh_token=${TOKEN}` }, queryStringParameters: { installation_id: "7" } });
  assert.equal(res.statusCode, 200);
  assert.equal(apiCalls()[0].init.headers["X-GitHub-User-Token"], undefined);
  asked = [];
  res = await accountHandler({
    httpMethod: "PUT",
    headers: { cookie: `gh_token=${TOKEN}` },
    body: JSON.stringify({ installation_id: "7", prCommentsDefault: true, other: 1 }),
  });
  assert.equal(res.statusCode, 200);
  const call = apiCalls()[0];
  assert.equal(call.init.method, "PUT");
  assert.equal(call.init.headers["X-GitHub-User-Token"], TOKEN);
  assert.deepEqual(JSON.parse(call.init.body), { prCommentsDefault: true });
  assert.equal(new URL(call.url).pathname, "/api/v1/organizations/7/check-settings");
});

test("the account route refuses a malformed request before asking anyone", async () => {
  for (const [method, query, body] of [
    ["GET", {}, undefined],
    ["GET", { installation_id: "../x" }, undefined],
    ["PUT", {}, JSON.stringify({ installation_id: "7", prCommentsDefault: "on" })],
    ["PUT", {}, "{"],
  ]) {
    const res = await accountHandler({ httpMethod: method, headers: {}, queryStringParameters: query, body });
    assert.equal(res.statusCode, 400);
  }
  assert.equal(asked.length, 0);
});

test("the activity line is blank for nothing and for an answer that could not be read", () => {
  assert.equal(lib.activityLine({ available: true, days: 30, commented: 4, deleted: 1 }),
    "Commented on 4 pull requests in the last 30 days · 1 comment was deleted");
  assert.equal(lib.activityLine({ available: true, days: 30, commented: 1, deleted: 0 }),
    "Commented on 1 pull request in the last 30 days");
  assert.equal(lib.activityLine({ available: true, days: 30, commented: 0, deleted: 3 }),
    "Commented on 0 pull requests in the last 30 days · 3 comments were deleted");
  assert.equal(lib.activityLine({ available: true, days: 30, commented: 0, deleted: 0 }), "");
  assert.equal(lib.activityLine({ available: false, days: 30 }), "");
});

test("a repository form sends only what changed, and null to follow the account again", () => {
  const saved = lib.repoFormFromApi({ prComments: true, prCommentsChoice: null, followingDefault: true, failOnBreak: false });
  assert.deepEqual(saved, { comments: true, following: true, failOnBreak: false });
  assert.equal(lib.repoFormDirty(saved, saved), false);
  assert.deepEqual(lib.repoSaveBody({ ...saved, failOnBreak: true }, saved), { failOnBreak: true });
  assert.deepEqual(lib.repoSaveBody({ ...saved, comments: false, following: false }, saved), { prComments: false });
  const chosen = { comments: false, following: false, failOnBreak: false };
  assert.deepEqual(lib.repoSaveBody({ ...chosen, comments: true, following: true }, chosen), { prComments: null });
});

test("the permissions link goes to the organization's page for an organization", () => {
  assert.equal(lib.installationSettingsUrl(7, "acme", true), "https://github.com/organizations/acme/settings/installations/7");
  assert.equal(lib.installationSettingsUrl(7, "alice", false), "https://github.com/settings/installations/7");
  assert.equal(lib.permissionMissing({ pullRequestsPermissionMissing: true }), true);
  assert.equal(lib.permissionMissing({ pullRequestsPermission: "unknown" }), false);
});
