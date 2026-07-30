import crypto from "node:crypto";

const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

export const handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) {
    return { statusCode: 400, body: "Missing code parameter" };
  }

  // CSRF check: the state GitHub echoes back must match the cookie set when the sign-in
  // flow started (see getOAuthUrl / AuthButton).
  const state = event.queryStringParameters?.state;
  const cookieState = parseCookie(event.headers?.cookie || "")["gh_oauth_state"];
  if (!state || !cookieState || state !== cookieState) {
    return { statusCode: 400, body: "Invalid OAuth state — please start sign-in again from striff.io" };
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return { statusCode: 401, body: "Token exchange failed" };
  }

  // Get user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  const user = await userRes.json();

  // Get primary email
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  const emails = await emailsRes.json();
  const primaryEmail = Array.isArray(emails)
    ? emails.find((e) => e.primary)?.email
    : null;

  // Report the primary email to the backend for each installation the user can access. The
  // backend stores it (fill-only) and sends the canonical welcome email on first capture; app
  // installation tokens can't read private emails, so this OAuth session is the one place a
  // reliable address exists. Best-effort: sign-in never blocks on it.
  if (primaryEmail && STRIFF_BILLING_AUTH_SECRET && STRIFF_SERVER_KEY) {
    try {
      const instRes = await fetch("https://api.github.com/user/installations?per_page=100", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    } catch (e) {
      console.error("Failed to report account email:", e.message);
    }
  }

  // Set httpOnly cookie and redirect to dashboard
  const cookie = [
    `gh_token=${accessToken}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=2592000", // 30 days
  ].join("; ");

  return {
    statusCode: 302,
    headers: {
      Location: "/dashboard",
    },
    multiValueHeaders: {
      "Set-Cookie": [
        cookie,
        "gh_oauth_state=; Path=/; Max-Age=0; Secure; SameSite=Lax",
      ],
    },
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
