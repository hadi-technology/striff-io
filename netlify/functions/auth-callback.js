const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) {
    return { statusCode: 400, body: "Missing code parameter" };
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

  // Send welcome email (best-effort, don't block on failure)
  if (RESEND_API_KEY && primaryEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Striff <noreply@striff.io>",
          to: [primaryEmail],
          subject: "Welcome to Striff!",
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h1 style="font-size:20px;font-weight:700;color:#0f172a">Welcome to Striff, ${user.login}!</h1>
              <p style="color:#475569;font-size:15px;line-height:1.6">
                Your GitHub account is now connected. Here's what you can do:
              </p>
              <ul style="color:#475569;font-size:15px;line-height:1.8">
                <li><strong>Public repos</strong>: free, no setup needed. Use the browser extension to get started.</li>
                <li><strong>Private repos</strong>: select a plan from your <a href="https://striff.io/dashboard" style="color:#2563eb">dashboard</a> to enable Striff on private pull requests.</li>
              </ul>
              <p style="color:#475569;font-size:15px;line-height:1.6">
                Questions? Reply to this email or visit <a href="https://striff.io/contact" style="color:#2563eb">striff.io/contact</a>.
              </p>
            </div>
          `,
        }),
      });
    } catch (e) {
      console.error("Failed to send welcome email:", e.message);
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
      "Set-Cookie": cookie,
    },
  };
};
