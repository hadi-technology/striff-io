// Netlify function backing the dashboard's "Docs & rules" view: authenticates the caller's GitHub
// session (../lib/github-session.js, which renews an expired access token), verifies their own GitHub session can see the requested repository under the requested
// installation, then proxies to striff-api's document catalogue with X-Server-Key and a token that
// names both.
//
// The repository check is the point. Seeing an installation is not seeing every repository under
// it: an organisation member may have no access to a private repository the installation covers,
// and their documents name classes, packages and design decisions. GitHub's
// /user/installations/{id}/repositories lists only what the caller's own token can see, so asking
// it is the authorization, and the repository-scoped token is what lets the API trust the answer.
// That check, and the shared cache that lets an answer GitHub gave a few minutes ago stand in for
// asking again, are callerSeesRepository in ../lib/github-access.js.
import crypto from "node:crypto";
import { accessCache } from "../lib/access-cache.js";
import {
  SEES,
  SEES_NOT,
  SIGNED_OUT,
  callerLogin,
  callerSeesRepository,
} from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

const STRIFF_BILLING_AUTH_SECRET = process.env.STRIFF_BILLING_AUTH_SECRET;
const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// Minted for this one request and spent immediately, so it lives in minutes, not days. It travels
// as a query parameter, which means it lands in any access log along the way; a token that has
// expired by the time a log is read is worth much less to whoever reads it.
// v1.<expiresAtEpochSec>.<hex HMAC of "v1:<installation id>:<owner>/<repo>:<expiry>">. A token
// minted for one repository is invalid for any other; striff-api answers an expired one with 401.
const TOKEN_LIFETIME_SEC = 10 * 60;

function generateRepoToken(installationId, owner, repo) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SEC;
  const signature = crypto
    .createHmac("sha256", STRIFF_BILLING_AUTH_SECRET)
    .update(`v1:${installationId}:${owner}/${repo}:${expiresAt}`)
    .digest("hex");
  return `v1.${expiresAt}.${signature}`;
}

/**
 * Whether the caller may change which rules a pull request is checked against: GitHub says they
 * administer the repository, which a personal repository's owner and an organization's owners do.
 * Seeing a repository is enough to read its rules; turning one off changes what everyone else's
 * pull requests are held to. Anything short of a clear yes is a no, so a GitHub hiccup never widens
 * who can do it.
 */
async function canManageRules(ghToken, owner, repo) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "striff-dashboard",
        },
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.permissions?.admin;
  } catch {
    return false;
  }
}

/** The writes a PATCH may name, and the API path each goes to. No view is the exclusion list. */
const PATCH_VIEWS = { "": "exclusions", exclusions: "exclusions", "force-read": "force-read", "rule-states": "rule-states" };

async function readBody(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Upstream error (${res.status})` };
  }
}

export const handler = async (event) => {
  const method = event.httpMethod;
  if (method !== "GET" && method !== "PATCH" && method !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
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
  // The id goes into a GitHub API path, and a value like "../../user/repos#" normalises to one
  // that lists every repository the caller can see -- which would answer "yes, they see it" for a
  // repository this installation does not cover. The API rejects a non-numeric id too; this does
  // not rely on that.
  if (!/^\d+$/.test(String(installationId))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad installation_id" }) };
  }
  if (!STRIFF_BILLING_AUTH_SECRET || !STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  return withGitHubSession(event, (ghToken) => proxy(event, ghToken, params), {
    signedOut: () => ({
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "github_sign_in_expired",
        message: "Your GitHub sign-in has expired. Sign in again to see this repository.",
      }),
    }),
    unavailable: () => verificationUnavailable(),
  });
};

// Retryable, and said so: the caller may well have access, and a 403 would tell them they do not.
function verificationUnavailable() {
  return {
    statusCode: 503,
    headers: { "Content-Type": "application/json", "Retry-After": "5" },
    body: JSON.stringify({
      error: "verification_unavailable",
      message: "GitHub didn't answer whether you can see this repository. Try again shortly.",
    }),
  };
}

async function proxy(event, ghToken, params) {
  const method = event.httpMethod;
  const installationId = params.installation_id;
  const owner = params.owner;
  const repo = params.repo;
  try {
    const cache = accessCache(event, ghToken);
    const sees = await callerSeesRepository(cache, ghToken, installationId, owner, repo);
    if (sees === SIGNED_OUT) return TOKEN_REFUSED;
    if (sees === SEES_NOT) {
      // Deliberately the same answer whether the repository is invisible or absent: which private
      // repositories an installation covers is itself something not to hand out.
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "not_authorized",
          // Naming the pair gives away nothing the caller did not just send, and without it a
          // refusal is a dead end: the usual cause is a repository asked for under the wrong
          // installation, which is invisible unless both are written down.
          message: `GitHub does not list ${owner}/${repo} under installation ${installationId} for `
            + "your account. If it should be there, check the Striff app's repository access; if "
            + "the repository belongs to another account, switch to it in the account menu.",
        }),
      };
    }
    if (sees !== SEES) return verificationUnavailable();

    if (method === "GET" && params.view === "permissions") {
      // Asked once per repository, so the controls can say up front who may use them.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canManageRules: await canManageRules(ghToken, owner, repo) }),
      };
    }
    const patchView = PATCH_VIEWS[params.view || ""];
    if (method === "PATCH" && !Object.prototype.hasOwnProperty.call(PATCH_VIEWS, params.view || "")) {
      // An unknown write used to land on the exclusion list, the one write nobody asked for.
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "unknown_view" }),
      };
    }
    if (method === "PATCH" && patchView === "rule-states" && !(await canManageRules(ghToken, owner, repo))) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "not_repo_admin",
          message: "Only the repository's owner and admins can change which rules are checked.",
        }),
      };
    }

    const token = generateRepoToken(installationId, owner, repo);
    const base = `${STRIFF_API_BASE}/api/v1/organizations/${encodeURIComponent(installationId)}`
      + `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/doc-catalog`;

    let url;
    let init;
    if (method === "POST" && params.view === "badge-rotate") {
      // A new key for this repository's README badge; the old address stops showing its counts.
      url = `${base}/badge/rotate?token=${token}`;
      init = { method: "POST", headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (method === "POST") {
      // Reading a whole repository: queued, minutes long, and rate-limited by the API. The name on
      // it comes from the token, like every other write.
      const asked = await callerLogin(cache, ghToken);
      url = `${base}/baseline?token=${token}${asked ? `&actor=${encodeURIComponent(asked)}` : ""}`;
      init = { method: "POST", headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (method === "PATCH") {
      // Two lists say never read this and never skip it; the rule states say which rules a pull
      // request is checked against.
      url = `${base}/${patchView}?token=${token}`;
      let asked;
      try {
        asked = JSON.parse(event.body || "{}");
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: "Malformed request" }) };
      }
      // Whoever the body claims, the record says who the token is.
      asked.actor = await callerLogin(cache, ghToken);
      init = {
        method: "PATCH",
        headers: {
          "X-Server-Key": STRIFF_SERVER_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(asked),
      };
    } else if (params.view === "badge") {
      // The README badge's key for this repository, and whether a README has shown it yet.
      url = `${base}/badge?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.view === "rules") {
      url = `${base}/rules?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.view === "checks") {
      // The checks Striff ran on this repository's pull requests lately, ten a page.
      const page = Math.max(0, parseInt(params.page, 10) || 0);
      url = `${base}/checks?page=${page}&token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.view === "type-findings") {
      // The names the documents write that the default branch does not have.
      url = `${base}/type-findings?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.view === "finding-issues") {
      // The GitHub issues the rules and stale names are tracked in, asked for after the page shows.
      url = `${base}/finding-issues?token=${token}`;
      init = { headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (params.path) {
      url = `${base}/doc?path=${encodeURIComponent(params.path)}`
        + (params.version ? `&version=${encodeURIComponent(params.version)}` : "")
        + `&token=${token}`;
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
}
