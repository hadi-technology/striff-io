import crypto from "node:crypto";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

function generateToken(installationId) {
  return crypto
    .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
    .update(String(installationId))
    .digest("hex");
}

function parseCookie(header) {
  const cookies = {};
  for (const pair of (header || "").split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
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

  const hmacToken = generateToken(installationId);
  const apiHeaders = { "X-Server-Key": STRIFF_SERVER_KEY || "" };

  try {
    switch (action) {
      case "checkout": {
        if (!plan) {
          return { statusCode: 400, body: JSON.stringify({ error: "Missing plan" }) };
        }
        const res = await fetch(
          `${STRIFF_API_BASE}/api/v1/billing/checkout?installation_id=${installationId}&plan=${plan}&token=${hmacToken}`,
          { method: "POST", headers: apiHeaders }
        );
        const data = await res.json();
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
          { method: "POST", headers: apiHeaders }
        );
        const data = await res.json();
        if (!res.ok) {
          return { statusCode: res.status, body: JSON.stringify(data) };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalUrl: data.url }),
        };
      }

      case "status": {
        const res = await fetch(
          `${STRIFF_API_BASE}/api/v1/billing/status?installation_id=${installationId}&token=${hmacToken}`,
          { headers: apiHeaders }
        );
        const data = await res.json();
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
