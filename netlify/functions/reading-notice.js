// Netlify function behind the "Email me when it's done" box beside a repository's reading in
// progress. It follows the Notifications function's auth exactly: the caller's GitHub session, a
// check that the caller sees the installation and the repository, then the X-Server-Key and a
// per-installation HMAC token to striff-api.
//
// The identity sent to the API (user id, login, email) always comes from GitHub, answered to the
// caller's own token, never from the request. The address is the verified primary one; with none,
// nothing is registered and the caller is told why. Neither the email nor a token is logged.
import { accessCache } from "../lib/access-cache.js";
import { SEES, SIGNED_OUT, callerSeesInstallation } from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";
import {
  generateToken,
  primaryEmail,
  readBody,
  reply,
  seenRepos,
  whoAmI,
} from "./notifications.js";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";
const REPO_NAME = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;

export const NO_VERIFIED_EMAIL = {
  error: "no_verified_email",
  message: "No verified email on your GitHub account",
};

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
  const input = event.httpMethod === "GET" ? event.queryStringParameters || {} : body;
  const installationId = input.installation_id;
  if (!installationId || !/^\d+$/.test(String(installationId))) {
    return reply(400, { error: "Bad installation_id" });
  }
  const match = REPO_NAME.exec(String(input.repo || ""));
  if (!match) return reply(400, { error: "Bad repo" });
  if (event.httpMethod === "PUT" && typeof body.enabled !== "boolean") {
    return reply(400, { error: "Missing enabled" });
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return reply(500, { error: "Server not configured" });
  }
  return withGitHubSession(event, (token) =>
    proxy(event, token, String(installationId), String(input.repo), match,
      event.httpMethod === "PUT" ? body.enabled : null));
};

async function proxy(event, token, installationId, repo, match, enabled) {
  try {
    const cache = accessCache(event, token);
    const owns = await callerSeesInstallation(cache, token, installationId);
    if (owns === SIGNED_OUT) return TOKEN_REFUSED;
    if (owns !== SEES) return reply(403, { error: "Not authorized for this installation" });

    // The repository must be one the caller sees. The spelling is the dashboard's own, which is
    // GitHub's, since the API keys a repository's reading by it.
    const seen = await seenRepos(cache, token, installationId, [repo]);
    if (seen.length !== 1) return reply(403, { error: "Not authorized for this repository" });
    const [, owner, name] = match;

    const user = await whoAmI(token);
    if (user === TOKEN_REFUSED) return TOKEN_REFUSED;
    if (!user) return reply(502, { error: "GitHub didn't say who you are. Try again in a moment." });

    const hmac = generateToken(installationId);
    const headers = { "X-Server-Key": STRIFF_SERVER_KEY };
    const path = `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/reading-notice`;

    if (enabled === null) {
      const query = new URLSearchParams({ token: hmac, user_id: String(user.id), owner, repo: name });
      const res = await fetch(`${path}?${query}`, { headers });
      return reply(res.status, await readBody(res));
    }

    let email = null;
    if (enabled) {
      email = await primaryEmail(token);
      if (email === TOKEN_REFUSED) return TOKEN_REFUSED;
      // Nothing is registered without somewhere to send it, and the caller is told so.
      if (!email) return reply(409, NO_VERIFIED_EMAIL);
    }
    const res = await fetch(`${path}?token=${hmac}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        githubUserId: String(user.id),
        login: user.login,
        email,
        owner,
        repo: name,
        enabled,
      }),
    });
    return reply(res.status, await readBody(res));
  } catch (e) {
    console.error("reading-notice error:", e.message);
    return reply(500, { error: "Something went wrong. Try again." });
  }
}
