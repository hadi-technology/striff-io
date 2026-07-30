import crypto from "node:crypto";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// Reports the signed-in user's primary email to the backend for each installation they can
// access. auth-callback does the same at sign-in, but a user who installs the app while already
// signed in never passes through the callback again, so the dashboard fires this on load. The
// backend stores fill-only and sends the welcome email once per installation, so repeat calls
// are harmless.
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  try {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const emails = await emailsRes.json();
    const primaryEmail = Array.isArray(emails) ? emails.find((e) => e.primary)?.email : null;
    if (!primaryEmail) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ synced: false }) };
    }

    const instRes = await fetch("https://api.github.com/user/installations?per_page=100", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const instData = await instRes.json();
    await Promise.all(
      (instData.installations || []).map((inst) => {
        const hmacToken = crypto
          .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
          .update(String(inst.id))
          .digest("hex");
        return fetch(
          `${STRIFF_API_BASE}/api/v1/billing/account-email?installation_id=${inst.id}&token=${hmacToken}`,
          {
            method: "POST",
            headers: { "X-Server-Key": STRIFF_SERVER_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ email: primaryEmail }),
          }
        ).catch(() => {});
      })
    );
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ synced: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

function parseCookie(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}
