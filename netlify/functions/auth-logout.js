/**
 * Signing out of Striff.
 *
 * Clearing the cookie is the part a visitor sees, and on its own it is not enough. The cookie
 * holds a GitHub access token that GitHub keeps honouring after the browser has forgotten it: a
 * copy taken from a shared machine, a proxy log, or a backup would still read the account weeks
 * later. So sign-out also asks GitHub to destroy the token, and only then drops the cookie.
 *
 * The revoke is best-effort, and strictly time-boxed. Signing out must not be able to fail: if
 * GitHub is slow, unreachable, or the app's secret is not configured, the cookie still goes. An
 * un-timed call here would be the worst kind of bug -- press "sign out", wait, and stay signed in
 * because the function timed out before it ever set the header.
 *
 * Sign-out also deletes what the shared access cache (../lib/access-cache.js) holds for the token,
 * so a copy of it is not granted from the cache for the minutes that cache would otherwise keep it.
 * Best-effort and time-boxed like the revoke, and run beside it.
 *
 * What this deliberately does not do is revoke the authorization grant. Striff stays on the
 * visitor's list of authorized apps, so signing back in is one click rather than a fresh consent
 * screen. Someone who wants Striff to forget them entirely does that from GitHub's own settings.
 */

import { Buffer } from "node:buffer";
import { accessCache } from "../lib/access-cache.js";

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;

/** Longest the revoke may take before sign-out stops waiting for it and clears the cookie. */
const REVOKE_TIMEOUT_MS = 2500;

/** Cookies cleared on the way out, each written the same way it was set. */
const CLEARED = [
  "gh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  "gh_oauth_state=; Secure; SameSite=Lax; Path=/; Max-Age=0",
];

export const handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  await Promise.all([token ? accessCache(event, token).forget() : null, revoke(token)]);

  return {
    statusCode: 302,
    headers: { Location: "/" },
    multiValueHeaders: { "Set-Cookie": CLEARED },
  };
};

async function revoke(token) {
  if (token && CLIENT_ID && CLIENT_SECRET) {
    try {
      await fetch(`https://api.github.com/applications/${CLIENT_ID}/token`, {
        method: "DELETE",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
    } catch (e) {
      // Including the timeout. The token outlives the session in this case, which is the old
      // behaviour and not worse than it; being unable to sign out would be.
      console.error("Could not revoke the access token on sign-out:", e.message);
    }
  }
}

function parseCookie(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}
