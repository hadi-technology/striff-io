import crypto from "node:crypto";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// The API's error paths historically returned plain text; parsing unconditionally as JSON
// surfaced "Unexpected token ..." to the user instead of the actual message.
async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

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

// Authorization, not just authentication: the striff-api billing endpoints trust any request
// carrying a valid HMAC token, so the ownership check must happen here before minting one.
// Without it, any signed-in user could read another org's billing status or open its Stripe
// portal (and cancel its subscription) by passing an arbitrary installation_id. Same check as
// metrics-proxy.js — kept as a local copy because every file in this directory deploys as its
// own public endpoint, which makes sharing a module here more fragile than the duplication.
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
  const data = await readBody(res);
  return (data.installations || []).some((inst) => String(inst.id) === String(installationId));
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = parseCookie(event.headers?.cookie)["gh_token"];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { action, installation_id: installationId, plan } = body;
  if (!installationId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing installation_id" }) };
  }
  if (!STRIFF_BILLING_AUTH_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: BILLING_AUTH_SECRET missing" }) };
  }
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured: SERVER_KEY missing" }) };
  }

  try {
    const owns = await callerOwnsInstallation(token, installationId);
    if (!owns) {
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorized for this installation" }) };
    }

    const hmacToken = generateToken(installationId);
    const apiHeaders = { "X-Server-Key": STRIFF_SERVER_KEY || "" };
    // Checkout and the portal change billing, which only an admin of the installation's account may
    // do. striff-api checks that with GitHub using the signed-in user's own token.
    const manageHeaders = { ...apiHeaders, "X-GitHub-User-Token": token };

    switch (action) {
      case "checkout": {
        if (!plan) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing plan" }) };
        }
        const res = await fetch(
          `${STRIFF_API_BASE}/api/v1/billing/checkout?installation_id=${installationId}&plan=${plan}&token=${hmacToken}`,
          { method: "POST", headers: manageHeaders }
        );
        const data = await readBody(res);
        if (!res.ok) {
          return { statusCode: res.status, body: JSON.stringify(data) };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutUrl: data.checkoutUrl }),
        };
      }

      case "portal": {
        const res = await fetch(
          `${STRIFF_API_BASE}/api/v1/billing/portal?installation_id=${installationId}&token=${hmacToken}`,
          { method: "POST", headers: manageHeaders }
        );
        const data = await readBody(res);
        if (!res.ok) {
          return { statusCode: res.status, body: JSON.stringify(data) };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          // CustomerPortalSessionResponse's field is portalUrl (checkout's is checkoutUrl).
          body: JSON.stringify({ portalUrl: data.portalUrl }),
        };
      }

      case "status": {
        const res = await fetch(
          `${STRIFF_API_BASE}/api/v1/billing/status?installation_id=${installationId}&token=${hmacToken}`,
          { headers: apiHeaders }
        );
        const data = await readBody(res);
        if (!res.ok) {
          return { statusCode: res.status, body: JSON.stringify(data) };
        }
        // Translate BillingStatusResponse to the shape the Dashboard expects. The API's tier is
        // already status-aware (EntitlementResolver keeps the paid tier through trialing,
        // past_due grace, and canceled-until-period-end, and drops to FREE otherwise), so a paid
        // tier IS the subscription signal — additionally requiring status === "active" here made
        // the dashboard tell trialing/grace-period customers they had no plan.
        const hasSubscription = Boolean(data.tier && data.tier !== "FREE" && data.tier !== "NONE");
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hasSubscription,
            planName: hasSubscription ? capitalize(data.tier) : undefined,
            status: data.subscriptionStatus,
            // New fields from the API
            tier: data.tier,
            // Connected repos (enabled via the GitHub App) — not what's billed.
            connectedPrivateRepoCount: data.connectedPrivateRepoCount,
            // Active repos this billing period — the repos that generated a diagram, which is
            // what the tier and Stripe charge are actually based on.
            activeRepoCountThisPeriod: data.activeRepoCountThisPeriod,
            billedTier: data.billedTier,
            activeRepoNamesThisPeriod: data.activeRepoNamesThisPeriod,
            periodStartMs: data.periodStartMs,
            periodEndMs: data.periodEndMs,
            repoLimit: data.repoLimit,
            monthlyPriceUsd: data.monthlyPriceUsd,
            // What the subscription actually bills each period (null when there is no paid
            // subscription or its price is not known yet); a subscriber on the $0 price gets 0.
            monthlyPriceCents: data.monthlyPriceCents,
            priceCurrency: data.priceCurrency,
          }),
        };
      }

      default:
        return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
    }
  } catch (e) {
    console.error("billing-proxy error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
