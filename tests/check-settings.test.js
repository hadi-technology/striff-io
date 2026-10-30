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
  assert.deepEqual(checkSettingsBody({ failOnBreak: null }, null), { body: { failOnBreak: null } });
  for (const bad of [{}, { prComments: "yes" }, { failOnBreak: "no" }, { failOnBreak: 1 }, null, "x"]) {
    assert.ok(checkSettingsBody(bad, "alice").error, JSON.stringify(bad));
  }
});

test("the account settings are read and written with the user's own token", async () => {
  let res = await accountHandler({ httpMethod: "GET", headers: { cookie: `gh_token=${TOKEN}` }, queryStringParameters: { installation_id: "7" } });
  assert.equal(res.statusCode, 200);
  // The caller's own token goes along on the read too, so the API can say whether they may change it.
  assert.equal(apiCalls()[0].init.headers["X-GitHub-User-Token"], TOKEN);
  asked = [];
  res = await accountHandler({
    httpMethod: "PUT",
    headers: { cookie: `gh_token=${TOKEN}` },
    body: JSON.stringify({ installation_id: "7", prCommentsDefault: true, repoSettingsLocked: false, updatedBy: "mallory", other: 1 }),
  });
  assert.equal(res.statusCode, 200);
  const call = apiCalls()[0];
  assert.equal(call.init.method, "PUT");
  assert.equal(call.init.headers["X-GitHub-User-Token"], TOKEN);
  // The name on the write is the token's, whatever the body claims.
  assert.deepEqual(JSON.parse(call.init.body), { prCommentsDefault: true, repoSettingsLocked: false, updatedBy: "alice" });
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

test("a repository form sends only what changed, null to use the account's setting", () => {
  const saved = lib.repoFormFromApi({ prCommentsChoice: null, failOnBreakChoice: false });
  assert.deepEqual(saved, { comments: "default", failOnBreak: "off" });
  assert.equal(lib.repoFormDirty(saved, saved), false);
  assert.deepEqual(lib.repoSaveBody({ ...saved, failOnBreak: "on" }, saved), { failOnBreak: true });
  assert.deepEqual(lib.repoSaveBody({ ...saved, comments: "off" }, saved), { prComments: false });
  assert.deepEqual(lib.repoSaveBody({ ...saved, failOnBreak: "default" }, saved), { failOnBreak: null });
  assert.deepEqual(lib.repoSaveBody({ comments: "default", failOnBreak: "default" },
    { comments: "on", failOnBreak: "on" }), { prComments: null, failOnBreak: null });
});

test("an account admin writes a repository's choices through the account route", async () => {
  const res = await accountHandler({
    httpMethod: "PUT",
    headers: { cookie: `gh_token=${TOKEN}` },
    body: JSON.stringify({ installation_id: "7", repo: "acme/widgets", prComments: null, failOnBreak: true, extra: 1 }),
  });
  assert.equal(res.statusCode, 200);
  const call = apiCalls()[0];
  assert.equal(new URL(call.url).pathname, "/api/v1/organizations/7/repos/acme/widgets/check-settings/account");
  assert.equal(call.init.headers["X-GitHub-User-Token"], TOKEN);
  assert.deepEqual(JSON.parse(call.init.body), { prComments: null, failOnBreak: true, updatedBy: "alice" });
  for (const bad of [{ repo: "../x", prComments: true }, { repo: "acme/widgets" }, { repo: "acme/widgets", prComments: "on" }]) {
    asked = [];
    const refused = await accountHandler({ httpMethod: "PUT", headers: {}, body: JSON.stringify({ installation_id: "7", ...bad }) });
    assert.equal(refused.statusCode, 400);
    assert.equal(asked.length, 0);
  }
});

test("the table lists the repositories both lists hold, leaves out archived ones and marks private ones with no plan", () => {
  const api = [
    { fullName: "acme/b" }, { fullName: "acme/a" }, { fullName: "acme/gone" },
    { fullName: "acme/old" }, { fullName: "acme/secret" },
  ];
  const dashboard = [
    { full_name: "acme/a", private: false }, { full_name: "acme/b", private: false },
    { full_name: "acme/old", private: false, archived: true }, { full_name: "acme/secret", private: true },
    { full_name: "acme/only-here", private: false },
  ];
  const rows = lib.tableRepos(api, dashboard, false);
  assert.deepEqual(rows.map((r) => r.fullName), ["acme/a", "acme/b", "acme/secret"]);
  assert.deepEqual(rows.map((r) => r.needsPlan), [false, false, true]);
  assert.equal(lib.tableRepos(api, dashboard, true).some((r) => r.needsPlan), false);
  assert.equal(lib.tableRepos(api, dashboard, null).some((r) => r.needsPlan), false);
  assert.deepEqual(lib.searchRepos(rows, " SEC ").map((r) => r.fullName), ["acme/secret"]);
  assert.equal(lib.searchRepos(rows, "").length, 3);
});

test("a personal account has no lock, no for-everyone group, no owners-only note and no last-changed line", () => {
  assert.deepEqual(lib.settingsParts("User"), { lock: false, forEveryone: false, ownersNote: false, lastChanged: false, lockNotice: false });
  assert.deepEqual(lib.settingsParts("Organization"), { lock: true, forEveryone: true, ownersNote: true, lastChanged: true, lockNotice: true });
  // The wording never names an organization for a person.
  for (const text of [...Object.values(lib.words(false)), lib.defaultOptionLabel(false, true), lib.failOnBreakHelp(false), lib.APPLIES_FROM]) {
    assert.doesNotMatch(text, /organi[sz]ation/i);
  }
});

test("a repository with no plan is Striff's to leave alone, and the page says so", async () => {
  const { notCovered } = await import("../src/lib/readingStatus.js");
  assert.equal(notCovered({ state: "private_no_plan" }), true);
  for (const state of ["private_paused", "unpaid", "paid_all_read", "paid_waiting_for_pull_request"]) assert.equal(notCovered({ state }), false);
  assert.equal(notCovered(null), false);
});

test("an account save sends the defaults that changed and the rows that changed", () => {
  const api = {
    prCommentsDefault: false, failOnBreakDefault: false, repoSettingsLocked: false,
    repositories: [{ fullName: "acme/a", prComments: null, failOnBreak: true }, { fullName: "acme/b", prComments: null, failOnBreak: null }],
  };
  const saved = lib.accountFormFromApi(api);
  assert.equal(lib.accountFormDirty(saved, saved), false);
  const form = { ...saved, failOnBreakDefault: true, rows: { ...saved.rows, "acme/b": { comments: "on", failOnBreak: "default" } } };
  assert.deepEqual(lib.accountSaveSteps(form, saved), {
    account: { failOnBreakDefault: true },
    repos: [{ repo: "acme/b", prComments: true }],
  });
});

test("the wording follows the account type and never mixes", () => {
  assert.equal(lib.defaultOptionLabel(true, false), "Use organization setting (Off)");
  assert.equal(lib.defaultOptionLabel(false, true), "Use account setting (On)");
  assert.equal(lib.words(true).lockedAsk, "Set by your organization. Ask an organization owner to change it.");
  assert.equal(lib.words(true).onlyOwners, "Only organization owners can change this.");
  for (const text of Object.values(lib.words(false))) assert.doesNotMatch(text, /organi[sz]ation/);
  assert.match(lib.failOnBreakHelp(true), /^Applies to every repository that uses the organization setting\. Blocks merging only where the Striff check is required\. Takes effect on each pull request's next check\.$/);
  assert.doesNotMatch(lib.failOnBreakHelp(false), /organi[sz]ation/);
});

test("the API's answer, not the site, says who may change the settings", () => {
  assert.equal(lib.readOnlyNote({ canManageInstallation: true }, true), null);
  assert.equal(lib.readOnlyNote({ adminCheck: "not_admin" }, true), "Only organization owners can change this.");
  assert.equal(lib.readOnlyNote({ adminCheck: "login_required" }, true), "Sign in with GitHub to change these settings.");
  assert.equal(lib.needsSignIn({ adminCheck: "login_required" }), true);
  assert.equal(lib.needsSignIn({ adminCheck: "not_admin" }), false);
  assert.match(lib.readOnlyNote({ adminCheck: "unavailable" }, false), /couldn't confirm/);
  assert.equal(lib.repoLocked({ locked: true }), true);
  assert.equal(lib.mayOpenAccountSettings({ canManageInstallation: false, locked: true }), false);
});

test("last changed names who and when, with the year only when it is not this one", () => {
  const now = Date.UTC(2026, 9, 30);
  assert.equal(lib.lastChangedLine("alice", Date.UTC(2026, 9, 30, 12), now), "Last changed by @alice on Oct 30");
  assert.equal(lib.lastChangedLine("alice", Date.UTC(2025, 11, 3), now), "Last changed by @alice on Dec 3, 2025");
  assert.equal(lib.lastChangedLine(null, Date.UTC(2026, 9, 1), now), "Last changed on Oct 1");
  assert.equal(lib.lastChangedLine(null, null, now), "");
});

test("the old Notifications address lands on Settings, Notifications", () => {
  assert.deepEqual(lib.sectionFromAddress("?section=notifications", ""), { section: "settings", focus: "notifications" });
  assert.deepEqual(lib.sectionFromAddress("", "#notifications"), { section: "settings", focus: "notifications" });
  assert.deepEqual(lib.sectionFromAddress("?section=settings", ""), { section: "settings", focus: null });
  assert.equal(lib.sectionFromAddress("?section=billing", ""), null);
  assert.equal(lib.sectionFromAddress("", ""), null);
});

test("the permissions link goes to the organization's page for an organization", () => {
  assert.equal(lib.installationSettingsUrl(7, "acme", true), "https://github.com/organizations/acme/settings/installations/7");
  assert.equal(lib.installationSettingsUrl(7, "alice", false), "https://github.com/settings/installations/7");
  assert.equal(lib.permissionMissing({ pullRequestsPermissionMissing: true }), true);
  assert.equal(lib.permissionMissing({ pullRequestsPermission: "unknown" }), false);
});
