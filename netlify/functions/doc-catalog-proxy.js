// Netlify function backing the dashboard's "Docs & rules" view: authenticates the caller's
// gh_token, verifies their own GitHub session can see the requested repository under the requested
// installation, then proxies to striff-api's document catalogue with X-Server-Key and a token that
// names both.
//
// The repository check is the point. Seeing an installation is not seeing every repository under
// it: an organisation member may have no access to a private repository the installation covers,
// and their documents name classes, packages and design decisions. GitHub's
// /user/installations/{id}/repositories lists only what the caller's own token can see, so asking
// it is the authorization, and the repository-scoped token is what lets the API trust the answer.
import crypto from "node:crypto";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// Valid for 30 days from issue, matching the installation token's lifetime:
// v1.<expiresAtEpochSec>.<hex HMAC of "v1:<installation id>:<owner>/<repo>:<expiry>">. A token
// minted for one repository is invalid for any other; striff-api answers an expired one with 401.
const TOKEN_LIFETIME_SEC = 30 * 24 * 60 * 60;

function generateRepoToken(installationId, owner, repo) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SEC;
  const signature = crypto
    .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
    .update(`v1:${installationId}:${owner}/${repo}:${expiresAt}`)
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

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

// Whether the caller's own token can see this repository under this installation. Paged, because
// an installation covering more than 100 repositories would otherwise look like one that does not
// cover the repository at all.
async function callerSeesRepository(ghToken, installationId, owner, repo) {
  const wanted = `${owner}/${repo}`.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetch(
      `https://api.github.com/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    const repositories = data.repositories || [];
    if (repositories.some((r) => (r.full_name || "").toLowerCase() === wanted)) {
      return true;
    }
    if (repositories.length < 100) {
      return false;
    }
  }
  return false;
}

export const handler = async (event) => {
  const method = event.httpMethod;
  if (method !== "GET" && method !== "PATCH") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const ghToken = parseCookie(event.headers?.cookie)["gh_token"];
  if (!ghToken) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  const params = event.queryStringParameters || {};
  const installationId = params.installation_id;
  const owner = params.owner;
  const repo = params.repo;
  if (!installationId || !owner || !repo) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing installation_id, owner or repo" }),
    };
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  try {
    const allowed = await callerSeesRepository(ghToken, installationId, owner, repo);
    if (!allowed) {
      // Deliberately the same answer whether the repository is invisible or absent: which private
      // repositories an installation covers is itself something not to hand out.
      return { statusCode: 403, body: JSON.stringify({ error: "Not authorized for this repository" }) };
    }

    const token = generateRepoToken(installationId, owner, repo);
    const base = `${STRIFF_API_BASE}/api/v1/organizations/${encodeURIComponent(installationId)}`
      + `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/doc-catalog`;

    let url;
    let init;
    if (method === "PATCH") {
      url = `${base}/exclusions?token=${token}`;
      init = {
        method: "PATCH",
        headers: {
          "X-Server-Key": STRIFF_SERVER_KEY,
          "Content-Type": "application/json",
        },
        body: event.body || "{}",
      };
    } else if (params.view === "rules") {
      url = `${base}/rules?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.path) {
      url = `${base}/doc?path=${encodeURIComponent(params.path)}&token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else {
      url = `${base}?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    }

    const res = await fetch(url, init);
    const data = await readBody(res);
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error("doc-catalog-proxy error:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to load documents" }) };
  }
};
