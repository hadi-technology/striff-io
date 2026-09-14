// Netlify function backing the Dashboard "Metrics" tab: authenticates the caller's gh_token,
// verifies they actually own the requested installation_id (via GitHub's /user/installations),
// then proxies to striff-api's org metrics endpoint with the required X-Server-Key + HMAC token.
import crypto from "node:crypto";

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

function parseCookie(header) {
  const cookies = {};
  for (const pair of (header || "").split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
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

// Confirms the caller's own GitHub session actually has access to installationId, by asking
// GitHub itself which installations the gh_token can see (same API Dashboard.tsx already uses
// to list installations). This is real authorization, not just authentication: without it, any
// authenticated user could pass an arbitrary installation_id and read another org's PR volume,
// flagged repos, and component names -- billing-proxy.js does NOT do this check today (it only
// verifies a gh_token cookie is present before minting the HMAC token), so there's no existing
// helper to reuse here.
async function callerOwnsInstallation(ghToken, installationId) {
  const res = await fetch("https://api.github.com/user/installations?per_page=100", {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return false;
  }
  const data = await res.json();
  const installations = data.installations || [];
  return installations.some((inst) => String(inst.id) === String(installationId));
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ghToken = parseCookie(event.headers?.cookie)["gh_token"];
  if (!ghToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  const installationId = event.queryStringParameters?.installation_id;
  if (!installationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing installation_id" }) };
  }
  const months = event.queryStringParameters?.months || "6";

  if (!STRIFF_BILLING_AUTH_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: BILLING_AUTH_SECRET missing" }) };
  }
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: SERVER_KEY missing" }) };
  }

  try {
    const owns = await callerOwnsInstallation(ghToken, installationId);
    if (!owns) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorized for this installation" }) };
    }

    const hmacToken = generateToken(installationId);
    const res = await fetch(
      `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/metrics?months=${encodeURIComponent(months)}&token=${hmacToken}`,
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
};
