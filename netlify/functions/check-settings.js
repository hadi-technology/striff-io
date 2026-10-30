// Netlify function behind the account Settings tab's "Pull request checks" section: the account's
// defaults for commenting and failing the check, its lock on the repositories' own settings, and
// any repository's values set from the account. It authenticates the caller's GitHub session (../lib/github-session.js), checks the
// caller sees the installation (callerSeesInstallation in ../lib/github-access.js), then reads or
// writes the default on striff-api with the X-Server-Key and a per-installation HMAC token.
//
// Changing any of it is for the account's administrators. striff-api decides that with the
// signed-in user's own GitHub token, which is passed on in X-GitHub-User-Token on every call as
// billing does, and its answer to the read says whether the caller is one; this function does not
// guess. The name on a write is the token's, whoever the body claims.
import crypto from "node:crypto";
import { accessCache } from "../lib/access-cache.js";
import { SEES, SIGNED_OUT, callerLogin, callerSeesInstallation } from "../lib/github-access.js";
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

const ACCOUNT_FLAGS = ["prCommentsDefault", "failOnBreakDefault", "repoSettingsLocked"];
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * What a write passes on, or an error string. An account write names any of the two defaults and
 * the lock, each a boolean. A repository write names a repository ("owner/name") and its comment
 * and fail-on-break choices, each true, false or null (null: follow the account). Nothing else of
 * the request reaches the API.
 */
export function writeBody(input) {
  if (!input || typeof input !== "object") return { error: "Malformed request" };
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if (has("repo")) {
    const parts = String(input.repo).split("/");
    if (parts.length !== 2 || !OWNER.test(parts[0]) || !NAME.test(parts[1]) || parts[1] === "." || parts[1] === "..") {
      return { error: "Bad repo" };
    }
    const body = {};
    for (const key of ["prComments", "failOnBreak"]) {
      if (!has(key)) continue;
      if (input[key] !== null && typeof input[key] !== "boolean") return { error: `Bad ${key}` };
      body[key] = input[key];
    }
    if (Object.keys(body).length === 0) return { error: "Nothing to change" };
    return { owner: parts[0], name: parts[1], body };
  }
  const body = {};
  for (const key of ACCOUNT_FLAGS) {
    if (!has(key)) continue;
    if (typeof input[key] !== "boolean") return { error: `${key} must be true or false` };
    body[key] = input[key];
  }
  if (Object.keys(body).length === 0) return { error: "Nothing to change" };
  return { body };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "PUT") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  let input = {};
  if (event.httpMethod === "PUT") {
    try {
      input = JSON.parse(event.body || "{}");
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
  }
  const installationId = event.httpMethod === "GET"
    ? event.queryStringParameters?.installation_id
    : input.installation_id;
  if (!installationId) return reply(400, { error: "Missing installation_id" });
  // The id goes into an API path; nothing but digits is an installation.
  if (!/^\d+$/.test(String(installationId))) return reply(400, { error: "Bad installation_id" });
  let written = null;
  if (event.httpMethod === "PUT") {
    written = writeBody(input);
    if (written.error) return reply(400, { error: written.error });
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return reply(500, { error: "Server not configured" });
  }

  return withGitHubSession(event, (token) => proxy(event, token, String(installationId), written));
};

async function proxy(event, token, installationId, written) {
  try {
    const cache = accessCache(event, token);
    const owns = await callerSeesInstallation(cache, token, installationId);
    if (owns === SIGNED_OUT) return TOKEN_REFUSED;
    if (owns !== SEES) return reply(403, { error: "Not authorized for this installation" });

    const base = `${STRIFF_API_BASE}/api/v1/organizations/${installationId}`;
    const auth = `token=${generateToken(installationId)}`;
    const identity = { "X-Server-Key": STRIFF_SERVER_KEY, "X-GitHub-User-Token": token };
    let res;
    if (written === null) {
      res = await fetch(`${base}/check-settings?${auth}`, { headers: identity });
    } else {
      const login = await callerLogin(cache, token);
      const url = written.owner
        ? `${base}/repos/${encodeURIComponent(written.owner)}/${encodeURIComponent(written.name)}`
          + `/check-settings/account?${auth}`
        : `${base}/check-settings?${auth}`;
      res = await fetch(url, {
        method: "PUT",
        headers: { ...identity, "Content-Type": "application/json" },
        body: JSON.stringify(login ? { ...written.body, updatedBy: login } : written.body),
      });
    }
    return reply(res.status, await readBody(res));
  } catch (e) {
    console.error("check-settings error:", e.message);
    return reply(500, { error: "Something went wrong. Try again." });
  }
}
