// Netlify function behind the Dashboard "Notifications" panel: who gets an email when a documented
// rule on the default branch breaks. It authenticates the caller's GitHub session
// (../lib/github-session.js), checks the caller sees the installation (callerSeesInstallation in
// ../lib/github-access.js), then reads or writes the caller's own settings on striff-api with the
// X-Server-Key and a per-installation HMAC token.
//
// The identity sent to the API (user id, login, email) always comes from GitHub, answered to the
// caller's own token, never from the request body. Email is the verified primary one. Neither the
// email nor a token is logged.
import crypto from "node:crypto";
import { accessCache } from "../lib/access-cache.js";
import {
  CHECK_PAGES,
  SEES,
  SIGNED_OUT,
  callerSeesInstallation,
  listInstallationRepositories,
} from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

const GITHUB_API = "https://api.github.com";
const MAX_REPOS = 500;
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const SCOPES = new Set(["ALL", "REPOS"]);

// A billing token is valid for 30 days from issue: v1.<expiresAtEpochSec>.<hex HMAC of
// "v1:<installation id>:<expiry>">. striff-api answers an expired one with 401 token_expired.
const BILLING_TOKEN_LIFETIME_SEC = 30 * 24 * 60 * 60;

export function generateToken(installationId) {
  const expiresAt = Math.floor(Date.now() / 1000) + BILLING_TOKEN_LIFETIME_SEC;
  const signature = crypto
    .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
    .update(`v1:${installationId}:${expiresAt}`)
    .digest("hex");
  return `v1.${expiresAt}.${signature}`;
}

export async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

export function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** The verified primary email of a /user/emails answer, lowercased, or null. */
export function verifiedPrimaryEmail(emails) {
  if (!Array.isArray(emails)) return null;
  const found = emails.find((e) => e && e.primary && e.verified && typeof e.email === "string");
  return found ? found.email.trim().toLowerCase() : null;
}

/**
 * The settings a request may change, in the shape the API takes, or an error string.
 * Admin-only fields are passed on only when the request names them; the API refuses them from a
 * non-admin.
 */
export function settingsFrom(input) {
  if (!input || typeof input !== "object") return { error: "Invalid settings" };
  if (typeof input.enabled !== "boolean") return { error: "Missing enabled" };
  const scope = SCOPES.has(input.scope) ? input.scope : null;
  if (!scope) return { error: "Bad scope" };
  const repos = [];
  if (scope === "REPOS") {
    if (!Array.isArray(input.repos) || input.repos.length > MAX_REPOS) return { error: "Bad repos" };
    for (const name of input.repos) {
      if (typeof name !== "string" || !REPO_NAME.test(name)) return { error: "Bad repos" };
      repos.push(name);
    }
  }
  const settings = { enabled: input.enabled, scope, repos: [...new Set(repos)] };
  for (const key of ["installationEnabled", "defaultForNewRepos"]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") return { error: `Bad ${key}` };
    settings[key] = input[key];
  }
  return { settings };
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

  let parsed = null;
  if (event.httpMethod === "PUT") {
    parsed = settingsFrom(body);
    if (parsed.error) return reply(400, { error: parsed.error });
  }

  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return reply(500, { error: "Server not configured" });
  }

  return withGitHubSession(event, (token) =>
    proxy(event, token, String(installationId), parsed?.settings || null));
};

export async function whoAmI(token) {
  const res = await fetch(`${GITHUB_API}/user`, { headers: githubHeaders(token) });
  if (res.status === 401) return TOKEN_REFUSED;
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !Number.isInteger(user.id) || typeof user.login !== "string") return null;
  return { id: user.id, login: user.login };
}

export async function primaryEmail(token) {
  const res = await fetch(`${GITHUB_API}/user/emails`, { headers: githubHeaders(token) });
  if (res.status === 401) return TOKEN_REFUSED;
  if (!res.ok) return null;
  return verifiedPrimaryEmail(await res.json());
}

/** The repositories among `names` that the caller sees under this installation, as GitHub spells them. */
export async function seenRepos(cache, token, installationId, names) {
  const cached = await cache.repositoryNames(installationId);
  let known = cached;
  if (!known) {
    const listed = await listInstallationRepositories(token, installationId, CHECK_PAGES);
    known = listed.items.map((r) => String(r.full_name || "").toLowerCase());
    if (listed.complete) await cache.rememberRepositoryNames(installationId, known);
    // An incomplete listing proves nothing about the names it lacks: keep them for the API.
    if (!listed.complete) return names;
  }
  const set = new Set(known);
  return names.filter((n) => set.has(n.toLowerCase()));
}

async function proxy(event, token, installationId, settings) {
  try {
    const cache = accessCache(event, token);
    const owns = await callerSeesInstallation(cache, token, installationId);
    if (owns === SIGNED_OUT) return TOKEN_REFUSED;
    if (owns !== SEES) return reply(403, { error: "Not authorized for this installation" });

    const user = await whoAmI(token);
    if (user === TOKEN_REFUSED) return TOKEN_REFUSED;
    if (!user) return reply(502, { error: "GitHub didn't say who you are. Try again in a moment." });

    const hmac = generateToken(installationId);
    // Admin-only fields are honoured by striff-api only for an admin of the installation's
    // account, which it checks with GitHub using the signed-in user's own token (as billing does).
    const headers = {
      "X-Server-Key": STRIFF_SERVER_KEY,
      "X-GitHub-User-Token": token,
    };
    const path = `${STRIFF_API_BASE}/api/v1/organizations/${installationId}/notifications`;

    if (!settings) {
      const res = await fetch(`${path}?token=${hmac}&user_id=${user.id}`, { headers });
      const data = await readBody(res);
      return reply(res.status, data);
    }

    const email = await primaryEmail(token);
    if (email === TOKEN_REFUSED) return TOKEN_REFUSED;
    if (!email && settings.enabled) {
      return reply(409, {
        error: "no_verified_email",
        message: "GitHub has no verified primary email for your account, so there is nowhere to send these.",
      });
    }
    const repos = settings.scope === "REPOS"
      ? await seenRepos(cache, token, installationId, settings.repos)
      : [];
    const res = await fetch(`${path}?token=${hmac}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        repos,
        githubUserId: String(user.id),
        login: user.login,
        email: email || null,
      }),
    });
    return reply(res.status, await readBody(res));
  } catch (e) {
    console.error("notifications error:", e.message);
    return reply(500, { error: "Something went wrong. Try again." });
  }
}
