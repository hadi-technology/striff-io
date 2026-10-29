// Netlify function behind the Notifications panel's "Comment on pull requests" switch: the
// account-wide default for whether Striff comments on pull requests in repositories that haven't
// chosen. It authenticates the caller's GitHub session (../lib/github-session.js), checks the
// caller sees the installation (callerSeesInstallation in ../lib/github-access.js), then reads or
// writes the default on striff-api with the X-Server-Key and a per-installation HMAC token.
//
// Changing the default is for the account's administrators. striff-api decides that with the
// signed-in user's own GitHub token, which is passed on in X-GitHub-User-Token as billing does;
// this function does not guess.
import crypto from "node:crypto";
import { accessCache } from "../lib/access-cache.js";
import { SEES, SIGNED_OUT, callerSeesInstallation } from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// A billing token is valid for 30 days from issue: v1.<expiresAtEpochSec>.<hex HMAC of
// "v1:<installation id>:<expiry>">. striff-api answers an expired one with 401 token_expired.
const BILLING_TOKEN_LIFETIME_SEC = 30 * 24 * 60 * 60;

function generateToken(installationId) {
  const expiresAt = Math.floor(Date.now() / 1000) + BILLING_TOKEN_LIFETIME_SEC;
  const signature = crypto
    .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
    .update(`v1:${installationId}:${expiresAt}`)
    .digest("hex");
  return `v1.${expiresAt}.${signature}`;
}

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "PUT") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  let body = {};
  if (event.httpMethod === "PUT") {
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
  }
  const installationId = event.httpMethod === "GET"
    ? event.queryStringParameters?.installation_id
    : body.installation_id;
  if (!installationId) return reply(400, { error: "Missing installation_id" });
  // The id goes into an API path; nothing but digits is an installation.
  if (!/^\d+$/.test(String(installationId))) return reply(400, { error: "Bad installation_id" });
  if (event.httpMethod === "PUT" && typeof body.prCommentsDefault !== "boolean") {
    return reply(400, { error: "prCommentsDefault must be true or false" });
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return reply(500, { error: "Server not configured" });
  }

  return withGitHubSession(event, (token) =>
    proxy(event, token, String(installationId), event.httpMethod === "PUT" ? body.prCommentsDefault : null));
};

async function proxy(event, token, installationId, prCommentsDefault) {
  try {
    const cache = accessCache(event, token);
    const owns = await callerSeesInstallation(cache, token, installationId);
    if (owns === SIGNED_OUT) return TOKEN_REFUSED;
    if (owns !== SEES) return reply(403, { error: "Not authorized for this installation" });

    const url = `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/check-settings`
      + `?token=${generateToken(installationId)}`;
    const res = prCommentsDefault === null
      ? await fetch(url, { headers: { "X-Server-Key": STRIFF_SERVER_KEY } })
      : await fetch(url, {
        method: "PUT",
        headers: {
          "X-Server-Key": STRIFF_SERVER_KEY,
          "X-GitHub-User-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prCommentsDefault }),
      });
    return reply(res.status, await readBody(res));
  } catch (e) {
    console.error("check-settings error:", e.message);
    return reply(500, { error: "Something went wrong. Try again." });
  }
}
