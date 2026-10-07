// The visitor's GitHub sign-in, as every function that acts for them reads it.
//
// Striff signs people in through its GitHub App, and GitHub gives a GitHub App's sign-in two
// tokens: an access token that expires after eight hours, and a refresh token, good for about six
// months, that trades for a new pair. Both live in HttpOnly cookies: gh_token holds the access
// token and lasts as long as GitHub says it is valid; gh_refresh holds the refresh token. When the
// access token has run out, or GitHub refuses it, the session is renewed from the refresh token and
// the request goes on, so a visitor stays signed in for as long as their grant is valid instead of
// for eight hours.
//
// The rules:
//   - A session is renewed at most once per request. If the refresh is refused, both cookies are
//     cleared and the request is answered as signed out.
//   - GitHub not answering (a 5xx, a timeout, a network error) never signs anyone out. The request
//     is answered as an error and the cookies are left as they are, to work again once GitHub does.
//   - No token is ever logged.
//
// GitHub spends a refresh token on use. A page often asks two functions at once (the header's
// sign-in button and the page's own content both ask who is signed in), and with an expired access
// token both would try to renew it: one would win, the other would be refused, and its answer would
// sign the visitor out. So the winner leaves the new tokens for the others for a minute, in a
// Netlify Blobs store, encrypted with a key only the spent refresh token can derive and filed under
// an id derived from it the same way. Whoever is refused looks there before deciding the session
// has ended. Nothing in the store can be read without the refresh token it was renewed from.
//
// Not a function: this directory is outside netlify/functions, so it is bundled into the functions
// that import it and never deployed as an endpoint of its own.
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import { parseCookie } from "./github-access.js";

export const ACCESS_COOKIE = "gh_token";
export const REFRESH_COOKIE = "gh_refresh";
/** Set on sign-out, readable by the page: the next sign-in asks GitHub which account to use. */
export const SIGNED_OUT_COOKIE = "gh_signed_out";

/**
 * What a function's GitHub work returns when GitHub answered 401 to the access token. The session
 * is then renewed once and the work run again with the new token.
 */
export const TOKEN_REFUSED = Symbol("GitHub refused the access token");

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const TOKEN_URL = "https://github.com/login/oauth/access_token";

/** A token GitHub gives no expiry for is kept as long as the access cookie always was. */
const DEFAULT_MAX_AGE_SEC = 30 * 24 * 60 * 60;
/** The access cookie ends this long before GitHub's expiry, so it is renewed before it is refused. */
const EXPIRY_MARGIN_SEC = 5 * 60;
/** Longest a refresh may take before it counts as GitHub not answering. */
const REFRESH_TIMEOUT_MS = 5000;

/** How long renewed tokens wait in the store for a request that raced the renewal. */
const HANDOFF_TTL_MS = 60 * 1000;
/** How long a refused request looks for a racer's renewal before deciding the session ended. */
const HANDOFF_WAIT_MS = 3000;
const HANDOFF_POLL_MS = 250;
/** The store is a safety net for races: waiting longer than this for it is not worth it. */
const STORE_TIMEOUT_MS = 1500;
const HANDOFF_STORE = "github-session-handoff";
const FORMAT = 1;

let openStore = (event) => {
  // Lambda compatibility mode: the store's address and credentials arrive on the event.
  connectLambda(event);
  return getStore(HANDOFF_STORE);
};

function cookie(name, value, maxAge, httpOnly = true) {
  return [
    `${name}=${value}`,
    ...(httpOnly ? ["HttpOnly"] : []),
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function seconds(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The cookies that hold a session GitHub just issued, from its token answer as given.
 *
 * The access cookie lasts until a few minutes before GitHub's expires_in, or 30 days for a token
 * GitHub gives no expiry for. The refresh cookie lasts refresh_token_expires_in. An answer without a
 * refresh token clears any refresh cookie left from an earlier sign-in, so it cannot renew a
 * session that is not its own.
 */
export function sessionCookies(tokens) {
  const expiresIn = seconds(tokens.expires_in);
  const accessMaxAge = expiresIn
    ? expiresIn - Math.min(EXPIRY_MARGIN_SEC, Math.floor(expiresIn / 2))
    : DEFAULT_MAX_AGE_SEC;
  const cookies = [cookie(ACCESS_COOKIE, tokens.access_token, accessMaxAge)];
  if (tokens.refresh_token) {
    const refreshMaxAge = seconds(tokens.refresh_token_expires_in) || DEFAULT_MAX_AGE_SEC;
    cookies.push(cookie(REFRESH_COOKIE, tokens.refresh_token, refreshMaxAge));
  } else {
    cookies.push(cookie(REFRESH_COOKIE, "", 0));
  }
  return cookies;
}

/** Both session cookies, cleared: each written the same way it was set. */
export function clearedSessionCookies() {
  return [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)];
}

/** The sign-out marker, set for a day, readable by the page. */
export function signedOutMarker() {
  return cookie(SIGNED_OUT_COOKIE, "1", 24 * 60 * 60, false);
}

/** The sign-out marker, cleared. */
export function clearedSignedOutMarker() {
  return cookie(SIGNED_OUT_COOKIE, "", 0, false);
}

/**
 * Trades a refresh token for a new pair, asking GitHub once.
 *
 * @return { tokens } with GitHub's answer; { refused: true } where GitHub will not renew this
 *     session; or { unavailable: true } where GitHub did not answer, or Striff's own configuration
 *     is wrong, neither of which is the visitor's session ending
 */
export async function refreshTokens(refreshToken) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("github session: the OAuth client id or secret is not configured");
    return { unavailable: true };
  }
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (e) {
    console.error("github session: GitHub did not answer the refresh:", e.name);
    return { unavailable: true };
  }
  if (res.status >= 500 || res.status === 429) return { unavailable: true };
  let data;
  try {
    data = await res.json();
  } catch {
    return res.ok ? { unavailable: true } : { refused: true };
  }
  if (data && typeof data.access_token === "string" && data.access_token) return { tokens: data };
  if (data?.error === "incorrect_client_credentials") {
    // Striff's secret, not the visitor's grant: signing them out would not fix it.
    console.error("github session: GitHub does not accept the OAuth client's credentials");
    return { unavailable: true };
  }
  // GitHub names the reason (bad_refresh_token for a spent, expired or revoked one); only the name
  // is logged.
  console.error("github session: GitHub refused the refresh:", String(data?.error || res.status));
  return { refused: true };
}

/** The store id and encryption key for renewals made from one refresh token. */
function handoffKeys(refreshToken) {
  const derive = (label) => crypto.createHmac("sha256", refreshToken).update(label).digest();
  return {
    id: derive("striff github-session handoff id").toString("hex"),
    key: derive("striff github-session handoff key"),
  };
}

const bucketOf = (ms) => Math.floor(ms / HANDOFF_TTL_MS);

function withTimeout(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${STORE_TIMEOUT_MS} ms`)),
      STORE_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function handoffStore(event) {
  try {
    return openStore(event);
  } catch (e) {
    // Outside Netlify's runtime there is no store; a race is then decided as GitHub decides it.
    console.error("github session: handoff store unavailable:", e?.message);
    return null;
  }
}

/**
 * Leaves renewed tokens for a request that raced this one, and clears out what is older than any
 * racer could still ask for. Best-effort and time-boxed: a renewal never fails on it.
 */
async function leaveHandoff(store, refreshToken, tokens) {
  if (!store) return;
  const now = Date.now();
  const { id, key } = handoffKeys(refreshToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  try {
    await withTimeout(store.setJSON(`${bucketOf(now)}/${id}`, {
      v: FORMAT,
      at: now,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      sealed: sealed.toString("base64"),
    }), "handoff write");
    const { blobs } = await withTimeout(store.list(), "handoff list");
    const stale = (blobs || []).filter((blob) => Number(blob.key.split("/")[0]) < bucketOf(now) - 1);
    await withTimeout(Promise.all(stale.map((blob) => store.delete(blob.key))), "handoff prune");
  } catch (e) {
    console.error("github session: could not leave a handoff:", e?.message);
  }
}

/** Tokens a racing request renewed from this same refresh token in the last minute, or null. */
async function takeHandoff(store, refreshToken) {
  if (!store) return null;
  const now = Date.now();
  const { id, key } = handoffKeys(refreshToken);
  for (const bucket of [bucketOf(now), bucketOf(now) - 1]) {
    try {
      const value = await withTimeout(store.get(`${bucket}/${id}`, { type: "json" }), "handoff read");
      if (!value || value.v !== FORMAT || !Number.isFinite(value.at)) continue;
      const age = now - value.at;
      if (age < 0 || age >= HANDOFF_TTL_MS) continue;
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
      decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      const tokens = JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(value.sealed, "base64")),
        decipher.final(),
      ]).toString("utf8"));
      // The cookies' lifetimes count from now, not from when the racer was answered.
      const elapsed = Math.floor(age / 1000);
      for (const field of ["expires_in", "refresh_token_expires_in"]) {
        if (seconds(tokens[field])) tokens[field] = Math.max(1, tokens[field] - elapsed);
      }
      return tokens;
    } catch (e) {
      console.error("github session: could not read a handoff:", e?.message);
    }
  }
  return null;
}

/**
 * Renews a session from its refresh token: from a racing request's renewal where there is one,
 * otherwise by asking GitHub. A refusal waits a moment for a racer's renewal to land before it is
 * believed.
 *
 * @return as refreshTokens
 */
export async function renewSession(event, refreshToken) {
  const store = handoffStore(event);
  const ready = await takeHandoff(store, refreshToken);
  if (ready) return { tokens: ready };

  const outcome = await refreshTokens(refreshToken);
  if (outcome.tokens) {
    await leaveHandoff(store, refreshToken, outcome.tokens);
    return outcome;
  }
  if (outcome.refused && store) {
    for (let waited = 0; waited < HANDOFF_WAIT_MS; waited += HANDOFF_POLL_MS) {
      await new Promise((resolve) => setTimeout(resolve, HANDOFF_POLL_MS));
      const raced = await takeHandoff(store, refreshToken);
      if (raced) return { tokens: raced };
    }
  }
  return outcome;
}

/** Adds Set-Cookie headers to a function's response, after any it already sets. */
export function withCookies(response, cookies) {
  if (!cookies.length) return response;
  const multiValueHeaders = { ...(response.multiValueHeaders || {}) };
  multiValueHeaders["Set-Cookie"] = [...(multiValueHeaders["Set-Cookie"] || []), ...cookies];
  return { ...response, multiValueHeaders };
}

const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  body: JSON.stringify(body),
});

const DEFAULT_ANSWERS = {
  signedOut: () => json(401, { error: "Not authenticated" }),
  unavailable: () => json(503, { error: "github_unavailable" }, { "Retry-After": "5" }),
};

/**
 * Runs one request's GitHub work with the visitor's access token, renewing the session from the
 * refresh token where the access token has run out or GitHub refuses it.
 *
 * With no access cookie and no refresh cookie, the request is signed out and run is not called.
 * With only a refresh cookie, the session is renewed first. If run returns TOKEN_REFUSED, the
 * session is renewed (once per request) and run is called again with the new token. Whatever cookies
 * the renewal sets are added to run's response.
 *
 * @param event the Lambda-style event: its cookies, and the store's credentials
 * @param run async (token) => the function's response, or TOKEN_REFUSED where GitHub answered 401
 *     to the token
 * @param answers optional { signedOut, unavailable }: the function's own responses for a session
 *     that has ended, and for GitHub not answering a renewal
 */
export async function withGitHubSession(event, run, answers = {}) {
  const signedOut = answers.signedOut || DEFAULT_ANSWERS.signedOut;
  const unavailable = answers.unavailable || DEFAULT_ANSWERS.unavailable;
  const jar = parseCookie(event.headers?.cookie);
  let token = jar[ACCESS_COOKIE] || null;
  const refreshToken = jar[REFRESH_COOKIE] || null;
  let cookies = [];
  let renewed = false;

  /** @return null once renewed, or the response that ends the request */
  async function renew() {
    renewed = true;
    const outcome = await renewSession(event, refreshToken);
    if (outcome.tokens) {
      token = outcome.tokens.access_token;
      cookies = sessionCookies(outcome.tokens);
      return null;
    }
    if (outcome.refused) return withCookies(signedOut(), clearedSessionCookies());
    return unavailable();
  }

  if (!token) {
    if (!refreshToken) return signedOut();
    const ended = await renew();
    if (ended) return ended;
  }

  let response = await run(token);
  if (response === TOKEN_REFUSED && refreshToken && !renewed) {
    const ended = await renew();
    if (ended) return ended;
    response = await run(token);
  }
  if (response === TOKEN_REFUSED) {
    return withCookies(signedOut(), clearedSessionCookies());
  }
  return withCookies(response, cookies);
}

/** For tests only: replaces how the handoff store is opened. */
export const testing = {
  useStore(open) {
    openStore = open;
  },
};
