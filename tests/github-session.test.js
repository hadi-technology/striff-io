import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.GITHUB_OAUTH_CLIENT_ID = "Iv23client";
process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
process.env.STRIFF_BILLING_AUTH_SECRET = "billing-secret";
process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";

const accessCache = (await import("../netlify/lib/access-cache.js")).testing;
const session = (await import("../netlify/lib/github-session.js")).testing;
const callback = (await import("../netlify/functions/auth-callback.js")).handler;
const status = (await import("../netlify/functions/auth-status.js")).handler;
const logout = (await import("../netlify/functions/auth-logout.js")).handler;
const bootstrap = (await import("../netlify/functions/dashboard-bootstrap.js")).handler;
const githubProxy = (await import("../netlify/functions/github-proxy.js")).handler;
const metrics = (await import("../netlify/functions/metrics-proxy.js")).handler;
const docCatalog = (await import("../netlify/functions/doc-catalog-proxy.js")).handler;
const billing = (await import("../netlify/functions/billing-proxy.js")).handler;
const emailSync = (await import("../netlify/functions/email-sync.js")).handler;
const { authorizeUrl, justSignedOut } = await import("../src/lib/githubSignIn.js");

const OLD = "ghu_old_access_0123456789";
const NEW = "ghu_new_access_0123456789";
const REFRESH = "ghr_refresh_0123456789";
const NEXT_REFRESH = "ghr_next_refresh_0123456789";

/** A Netlify Blobs store kept in a Map. */
function fakeStore() {
  const data = new Map();
  return {
    data,
    async get(key) {
      return data.has(key) ? JSON.parse(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key })) };
    },
    async delete(key) {
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

/** What GitHub does: which access tokens it accepts, and how it answers a refresh. */
let github;
let asked;
let logged;
const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;

beforeEach(() => {
  asked = [];
  logged = [];
  console.error = (...args) => logged.push(args.map(String).join(" "));
  console.log = (...args) => logged.push(args.map(String).join(" "));
  // No store unless a test gives one: a refused refresh is then believed at once.
  session.useStore(() => {
    throw new Error("no store in this test");
  });
  accessCache.useStore(() => {
    throw new Error("no store in this test");
  });
  github = {
    valid: new Set([NEW]),
    refreshes: new Map([[REFRESH, { access_token: NEW, refresh_token: NEXT_REFRESH }]]),
    refresh: null,
    api: null,
  };
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.origin === "https://api.example") return json({ answered: u.pathname });
    if (u.href === "https://github.com/login/oauth/access_token") {
      const body = JSON.parse(init.body);
      if (github.refresh) return github.refresh(body);
      if (body.code) {
        return json({
          access_token: OLD,
          expires_in: 28800,
          refresh_token: REFRESH,
          refresh_token_expires_in: 15897600,
          token_type: "bearer",
        });
      }
      const issued = github.refreshes.get(body.refresh_token);
      if (!issued) return json({ error: "bad_refresh_token", error_description: "The refresh token passed is incorrect or expired." });
      // GitHub spends a refresh token on use.
      github.refreshes.delete(body.refresh_token);
      github.valid.add(issued.access_token);
      return json({ expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer", ...issued });
    }
    assert.equal(u.origin, "https://api.github.com", `unexpected request to ${url}`);
    if (github.api) {
      const special = await github.api(u);
      if (special) return special;
    }
    const token = (init.headers?.Authorization || "").replace(/^Bearer /, "");
    if (!github.valid.has(token)) return json({ message: "Bad credentials" }, 401);
    if (u.pathname === "/user") return json({ login: "alice", avatar_url: "a", name: "Alice" });
    if (u.pathname === "/user/emails") return json([{ email: "a@example.com", primary: true }]);
    if (u.pathname === "/user/installations") {
      return json({ total_count: 1, installations: [{ id: 7, account: { login: "acme" } }] });
    }
    if (u.pathname === "/user/installations/7/repositories") {
      return json({ total_count: 1, repositories: [{ full_name: "acme/widgets" }] });
    }
    return json({ message: "Not Found" }, 404);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.log = realLog;
  // No token, access or refresh, is ever written to the logs.
  for (const line of logged) {
    for (const token of [OLD, NEW, REFRESH, NEXT_REFRESH]) assert.ok(!line.includes(token), line);
  }
});

const refreshCalls = () => asked.filter((a) => a.url === "https://github.com/login/oauth/access_token");
const setCookies = (res) => res.multiValueHeaders?.["Set-Cookie"] || [];
const cookieNamed = (res, name) => setCookies(res).find((c) => c.startsWith(`${name}=`));
const maxAge = (cookie) => Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);

function assertSignedIn(res, access, refresh) {
  const token = cookieNamed(res, "gh_token");
  assert.equal(token, `gh_token=${access}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28500`);
  const kept = cookieNamed(res, "gh_refresh");
  assert.equal(kept, `gh_refresh=${refresh}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15897600`);
}

function assertCleared(res) {
  assert.equal(maxAge(cookieNamed(res, "gh_token")), 0);
  assert.equal(maxAge(cookieNamed(res, "gh_refresh")), 0);
  assert.match(cookieNamed(res, "gh_token"), /^gh_token=;/);
  assert.match(cookieNamed(res, "gh_refresh"), /^gh_refresh=;/);
}

test("the callback keeps both tokens, each for as long as GitHub says, and clears the sign-out marker", async () => {
  const res = await callback({
    queryStringParameters: { code: "abc", state: "s1" },
    headers: { cookie: "gh_oauth_state=s1; gh_signed_out=1" },
  });

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/dashboard");
  // Five minutes short of GitHub's eight hours, so it is renewed before GitHub refuses it.
  assertSignedIn(res, OLD, REFRESH);
  assert.equal(maxAge(cookieNamed(res, "gh_oauth_state")), 0);
  const marker = cookieNamed(res, "gh_signed_out");
  assert.equal(maxAge(marker), 0);
  assert.ok(!marker.includes("HttpOnly"));
});

test("a token GitHub gives no expiry for is kept 30 days, and no refresh cookie is left behind", async () => {
  github.refresh = () => json({ access_token: OLD, token_type: "bearer" });

  const res = await callback({
    queryStringParameters: { code: "abc", state: "s1" },
    headers: { cookie: "gh_oauth_state=s1; gh_refresh=someone_elses" },
  });

  assert.equal(maxAge(cookieNamed(res, "gh_token")), 2592000);
  assert.equal(cookieNamed(res, "gh_refresh"), "gh_refresh=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
});

test("an expired access token is renewed once from the refresh token, and the new cookies are set", async () => {
  // The browser dropped gh_token when its Max-Age ran out; gh_refresh is still there.
  const res = await status({ headers: { cookie: `gh_refresh=${REFRESH}` } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { authenticated: true, user: { login: "alice", avatar_url: "a", name: "Alice" } });
  assert.equal(refreshCalls().length, 1);
  assert.deepEqual(JSON.parse(refreshCalls()[0].init.body), {
    client_id: "Iv23client",
    client_secret: "client-secret",
    grant_type: "refresh_token",
    refresh_token: REFRESH,
  });
  assertSignedIn(res, NEW, NEXT_REFRESH);
});

test("an access token GitHub refuses is renewed once and the request runs again with the new one", async () => {
  for (const run of [
    () => status({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } }),
    () => githubProxy({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` }, queryStringParameters: { path: "/user/installations" } }),
    () => bootstrap({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } }),
    () => metrics({ httpMethod: "GET", headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` }, queryStringParameters: { installation_id: "7" } }),
    () => billing({ httpMethod: "POST", headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` }, body: JSON.stringify({ action: "status", installation_id: 7 }) }),
    () => docCatalog({ httpMethod: "GET", headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` }, queryStringParameters: { installation_id: "7", owner: "acme", repo: "widgets" } }),
    () => emailSync({ httpMethod: "POST", headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } }),
  ]) {
    github.valid = new Set();
    github.refreshes = new Map([[REFRESH, { access_token: NEW, refresh_token: NEXT_REFRESH }]]);
    asked = [];

    const res = await run();

    assert.equal(res.statusCode, 200, run.toString());
    assert.equal(refreshCalls().length, 1, run.toString());
    assertSignedIn(res, NEW, NEXT_REFRESH);
    const tokensUsed = asked.filter((a) => a.url.startsWith("https://api.github.com"))
      .map((a) => a.init.headers.Authorization);
    assert.equal(tokensUsed[0], `Bearer ${OLD}`);
    assert.equal(tokensUsed.at(-1), `Bearer ${NEW}`);
  }
});

test("a session is renewed at most once per request: a new token GitHub also refuses signs out", async () => {
  github.valid = new Set();
  github.refreshes = new Map([[REFRESH, { access_token: "ghu_also_refused" }]]);
  github.api = () => json({ message: "Bad credentials" }, 401);

  const res = await status({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } });

  assert.deepEqual(JSON.parse(res.body), { authenticated: false });
  assert.equal(refreshCalls().length, 1);
  assertCleared(res);
});

test("a refresh GitHub refuses clears both cookies and answers signed out", async () => {
  const expired = await status({ headers: { cookie: "gh_refresh=ghr_spent_or_revoked" } });
  assert.equal(expired.statusCode, 200);
  assert.deepEqual(JSON.parse(expired.body), { authenticated: false });
  assertCleared(expired);

  github.valid = new Set();
  const proxied = await metrics({
    httpMethod: "GET",
    headers: { cookie: `gh_token=${OLD}; gh_refresh=ghr_spent_or_revoked` },
    queryStringParameters: { installation_id: "7" },
  });
  assert.equal(proxied.statusCode, 401);
  assertCleared(proxied);
  assert.ok(!asked.some((a) => a.url.startsWith("https://api.example")));
});

test("a token GitHub refuses with no refresh token to renew it answers signed out", async () => {
  const res = await bootstrap({ headers: { cookie: `gh_token=${OLD}` } });
  assert.deepEqual(JSON.parse(res.body), { authenticated: false });
  assert.equal(refreshCalls().length, 0);
  assertCleared(res);

  asked = [];
  const none = await status({ headers: {} });
  assert.deepEqual(JSON.parse(none.body), { authenticated: false });
  assert.deepEqual(setCookies(none), []);
  assert.equal(asked.length, 0);
});

test("GitHub not answering a refresh is an error, never a sign-out: the cookies stay", async () => {
  for (const refresh of [
    () => json({ message: "Server Error" }, 502),
    () => json({}, 429),
    () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
    () => json({ error: "incorrect_client_credentials" }),
  ]) {
    github.refresh = refresh;
    const res = await status({ headers: { cookie: `gh_refresh=${REFRESH}` } });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(setCookies(res), []);

    const boot = await bootstrap({ headers: { cookie: `gh_refresh=${REFRESH}` } });
    assert.equal(boot.statusCode, 503);
    assert.deepEqual(setCookies(boot), []);
  }
});

test("GitHub not answering who is signed in is an error, never a sign-out", async () => {
  github.valid = new Set([OLD]);
  github.api = (u) => (u.pathname === "/user" ? json({ message: "Server Error" }, 502) : null);

  const res = await status({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(setCookies(res), []);

  const boot = await bootstrap({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } });
  assert.equal(boot.statusCode, 503);
  assert.deepEqual(JSON.parse(boot.body), { error: "github_unavailable" });
  assert.deepEqual(setCookies(boot), []);

  github.api = () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  };
  const timedOut = await status({ headers: { cookie: `gh_token=${OLD}` } });
  assert.equal(timedOut.statusCode, 503);
  assert.deepEqual(setCookies(timedOut), []);
  assert.equal(refreshCalls().length, 0);
});

test("two requests racing to renew one session both stay signed in, with the same new tokens", async () => {
  const store = fakeStore();
  session.useStore(() => store);

  const [first, second] = await Promise.all([
    status({ headers: { cookie: `gh_refresh=${REFRESH}` } }),
    githubProxy({ headers: { cookie: `gh_refresh=${REFRESH}` }, queryStringParameters: { path: "/user/installations" } }),
  ]);

  assert.equal(JSON.parse(first.body).authenticated, true);
  assert.equal(second.statusCode, 200);
  assertSignedIn(first, NEW, NEXT_REFRESH);
  assertSignedIn(second, NEW, NEXT_REFRESH);
  // What the store holds cannot be read without the spent refresh token.
  for (const value of store.data.values()) {
    for (const token of [NEW, NEXT_REFRESH, REFRESH]) assert.ok(!value.includes(token));
  }
});

test("a renewal left for racers is used instead of asking GitHub again, and grows stale after a minute", async () => {
  const store = fakeStore();
  session.useStore(() => store);
  await status({ headers: { cookie: `gh_refresh=${REFRESH}` } });
  assert.equal(refreshCalls().length, 1);

  const raced = await status({ headers: { cookie: `gh_refresh=${REFRESH}` } });
  assert.equal(refreshCalls().length, 1);
  assert.equal(cookieNamed(raced, "gh_token").split(";")[0], `gh_token=${NEW}`);

  for (const [key, value] of store.data) {
    store.data.set(key, JSON.stringify({ ...JSON.parse(value), at: Date.now() - 61 * 1000 }));
  }
  // Stale: GitHub is asked, refuses the spent token, and no racer's renewal turns up.
  const late = await status({ headers: { cookie: `gh_refresh=${REFRESH}` } });
  assert.equal(JSON.parse(late.body).authenticated, false);
});

test("signing out clears both session cookies and leaves the readable sign-out marker for a day", async () => {
  const res = await logout({ headers: { cookie: `gh_token=${OLD}; gh_refresh=${REFRESH}` } });

  assert.equal(res.statusCode, 302);
  assertCleared(res);
  assert.equal(cookieNamed(res, "gh_signed_out"), "gh_signed_out=1; Secure; SameSite=Lax; Path=/; Max-Age=86400");
  // The access token is still revoked with GitHub, as before.
  const revoke = asked.find((a) => a.url === "https://api.github.com/applications/Iv23client/token");
  assert.equal(revoke.init.method, "DELETE");
});

test("GitHub's account picker is asked for only after a sign-out", () => {
  const sign = { clientId: "Iv23client", origin: "https://striff.io", state: "s1" };

  const returning = new URL(authorizeUrl({ ...sign, cookie: "ph_x=1; other=2" }));
  assert.equal(returning.searchParams.get("prompt"), null);
  assert.equal(returning.searchParams.get("client_id"), "Iv23client");
  assert.equal(returning.searchParams.get("state"), "s1");
  assert.equal(returning.searchParams.get("redirect_uri"), "https://striff.io/.netlify/functions/auth-callback");

  const afterSignOut = new URL(authorizeUrl({ ...sign, cookie: "ph_x=1; gh_signed_out=1" }));
  assert.equal(afterSignOut.searchParams.get("prompt"), "select_account");

  assert.equal(justSignedOut("gh_signed_out=1"), true);
  for (const cookie of ["", undefined, "gh_signed_out=", "gh_signed_out=0", "not_gh_signed_out=1"]) {
    assert.equal(justSignedOut(cookie), false, String(cookie));
  }
});
