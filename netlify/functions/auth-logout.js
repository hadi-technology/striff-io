/**
 * Signing out of Striff.
 *
 * Clearing the cookie is the part a visitor sees, and on its own it is not enough. The cookie
 * holds a GitHub access token that GitHub keeps honouring after the browser has forgotten it: a
 * copy taken from a shared machine, a proxy log, or a backup would still read the account weeks
 * later. So sign-out also asks GitHub to destroy the token, and only then drops the cookie.
 *
 * The revoke is best-effort. If GitHub is unreachable, or the app's secret is not configured, the
 * visitor is still signed out here -- a browser that cannot reach GitHub must not be left holding
 * a session it asked to end.
 *
 * What this deliberately does not do is revoke the authorization grant. Striff stays on the
 * visitor's list of authorized apps, so signing back in is one click rather than a fresh consent
 * screen. Someone who wants Striff to forget them entirely does that from GitHub's own settings.
 */

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;

/** Cookies cleared on the way out, each written the same way it was set. */
const CLEARED = [
  "gh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  "gh_oauth_state=; Secure; SameSite=Lax; Path=/; Max-Age=0",
];

export const handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
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
      });
    } catch (e) {
      console.error("Could not revoke the access token on sign-out:", e.message);
    }
  }

  return {
    statusCode: 302,
    headers: { Location: "/" },
    multiValueHeaders: { "Set-Cookie": CLEARED },
  };
};

function parseCookie(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}
