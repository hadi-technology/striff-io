// Netlify function backing the Dashboard "Metrics" tab: authenticates the caller's GitHub session
// (../lib/github-session.js, which renews an expired access token), verifies they actually own the
// requested installation_id (see callerSeesInstallation in ../lib/github-access.js), then proxies to striff-api's org metrics endpoint with the required
// X-Server-Key + HMAC token.
//
// The ownership check is real authorization, not just authentication: without it, any
// authenticated user could pass an arbitrary installation_id and read another org's PR volume,
// flagged repos, and component names.
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

// Some API error paths answer in plain text; parsing unconditionally as JSON turned their status
// into a 500 carrying a parser message. Same helper as billing-proxy.js.
async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const installationId = event.queryStringParameters?.installation_id;
  if (!installationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing installation_id" }) };
  }
  // The id goes into an API path; nothing but digits is an installation.
  if (!/^\d+$/.test(String(installationId))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad installation_id" }) };
  }
  const months = event.queryStringParameters?.months || "6";
  // view=badges: the repositories whose README badge has been requested from a README, for the
  // installation card's onboarding item. Same authorization as the metrics.
  const badges = event.queryStringParameters?.view === "badges";

  if (!STRIFF_BILLING_AUTH_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: BILLING_AUTH_SECRET missing" }) };
  }
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: SERVER_KEY missing" }) };
  }

  return withGitHubSession(event, (ghToken) => proxy(event, ghToken, installationId, months, badges));
};

async function proxy(event, ghToken, installationId, months, badges) {
  try {
    const owns = await callerSeesInstallation(accessCache(event, ghToken), ghToken, installationId);
    if (owns === SIGNED_OUT) return TOKEN_REFUSED;
    if (owns !== SEES) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorized for this installation" }) };
    }

    const hmacToken = generateToken(installationId);
    const res = await fetch(
      badges
        ? `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/badges?token=${hmacToken}`
        : `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/metrics?months=${encodeURIComponent(months)}&token=${hmacToken}`,
      { headers: { "X-Server-Key": STRIFF_SERVER_KEY } }
    );
    const data = await readBody(res);
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify(data) };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error("metrics-proxy error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
