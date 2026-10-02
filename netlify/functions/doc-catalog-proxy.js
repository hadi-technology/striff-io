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
// Three answers, not two: "yes", "no", and "GitHub would not say". A rate limit, a 5xx or an
// installation larger than this pages through is not evidence that the caller cannot see the
// repository, and answering 403 to it tells someone they lack access they actually have.
const SEES = "yes";
const SEES_NOT = "no";
const CANNOT_TELL = "unknown";
/** GitHub would not accept the caller's own token: expired, revoked, or signed out elsewhere. */
const SIGNED_OUT = "signed_out";

/**
 * What this token was last told about a repository, and when.
 *
 * Every read of the dashboard re-pages `/user/installations/{id}/repositories` — up to ten calls of
 * a hundred — before anything of ours is touched. Opening a page, opening a document, switching a
 * version and every write each paid that, which is slow, and on a busy tab it is how a person finds
 * GitHub's secondary rate limit. The answer does not change minute to minute, so it is kept for a
 * few, per function instance, keyed by a hash of the token so the token itself is not held.
 */
const seenCache = new Map();
const SEEN_TTL_MS = 3 * 60 * 1000;

function seenKey(ghToken, installationId, owner, repo) {
  return `${crypto.createHash("sha256").update(ghToken).digest("hex").slice(0, 16)}:`
    + `${installationId}:${owner}/${repo}`.toLowerCase();
}

async function callerSeesRepository(ghToken, installationId, owner, repo) {
  const key = seenKey(ghToken, installationId, owner, repo);
  const remembered = seenCache.get(key);
  if (remembered && Date.now() - remembered.at < SEEN_TTL_MS) {
    return remembered.answer;
  }
  const answer = await askGitHubIfCallerSees(ghToken, installationId, owner, repo);
  // Only a definite answer is worth keeping: "could not tell" is the state that should be retried.
  if (answer !== CANNOT_TELL) {
    seenCache.set(key, { answer, at: Date.now() });
    if (seenCache.size > 500) {
      for (const old of [...seenCache.keys()].slice(0, 100)) seenCache.delete(old);
    }
  }
  return answer;
}

async function askGitHubIfCallerSees(ghToken, installationId, owner, repo) {
  const wanted = `${owner}/${repo}`.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    let res;
    try {
      res = await fetch(
        `https://api.github.com/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
    } catch (e) {
      return CANNOT_TELL;
    }
    // GitHub answers a rate limit with 403 as well as a refusal, and the difference matters: one
    // says this caller may not see the repository, the other says ask again later. Telling a
    // person they have lost access because they clicked twice is the worse mistake, so anything
    // carrying a rate-limit marker is "could not tell".
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const retryAfter = res.headers.get("retry-after");
      const body = await res.text().catch(() => "");
      const limited = res.status === 429 || retryAfter !== null || remaining === "0"
        || /rate limit|secondary rate|abuse/i.test(body);
      return limited ? CANNOT_TELL : SEES_NOT;
    }
    if (res.status === 401) {
      // The caller's own token, not the repository: telling someone they lack access to their own
      // repository when the truth is that their sign-in lapsed sends them looking in the wrong
      // place.
      return SIGNED_OUT;
    }
    if (!res.ok) {
      return CANNOT_TELL;
    }
    const data = await res.json();
    const repositories = data.repositories || [];
    if (repositories.some((r) => (r.full_name || "").toLowerCase() === wanted)) {
      return SEES;
    }
    if (repositories.length < 100) {
      return SEES_NOT;
    }
  }
  // Ten pages of a hundred and still looking: an installation this large is one this check cannot
  // finish, which is not the same as one that does not cover the repository.
  return CANNOT_TELL;
}

/**
 * Who is asking, as GitHub knows them.
 *
 * The caller says who they are in the request body, and a caller can say anything. An exclusion
 * carries a name into the catalogue as the record of who asked for it, so the name has to come
 * from the token, not from the body.
 *
 * @return the login, or null where GitHub would not say — recorded as nobody rather than as
 *     whoever the request claimed
 */
async function callerLogin(ghToken) {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      return null;
    }
    const user = await res.json();
    return typeof user.login === "string" ? user.login : null;
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  const method = event.httpMethod;
  if (method !== "GET" && method !== "PATCH" && method !== "POST") {
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

  try {
    const sees = await callerSeesRepository(ghToken, installationId, owner, repo);
    if (sees === SIGNED_OUT) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "github_sign_in_expired",
          message: "Your GitHub sign-in has expired. Sign in again to see this repository.",
        }),
      };
    }
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
    if (sees !== SEES) {
      // Retryable, and said so: the caller may well have access, and a 403 would tell them they do
      // not.
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json", "Retry-After": "5" },
        body: JSON.stringify({
          error: "verification_unavailable",
          message: "GitHub didn't answer whether you can see this repository. Try again shortly.",
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
      const asked = await callerLogin(ghToken);
      url = `${base}/baseline?token=${token}${asked ? `&actor=${encodeURIComponent(asked)}` : ""}`;
      init = { method: "POST", headers: { "X-Server-Key": STRIFF_SERVER_KEY } };
    } else if (method === "PATCH") {
      // Two lists, opposite jobs: one says never read this, the other says never skip it.
      url = `${base}/${params.view === "force-read" ? "force-read" : "exclusions"}?token=${token}`;
      let asked;
      try {
        asked = JSON.parse(event.body || "{}");
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: "Malformed request" }) };
      }
      // Whoever the body claims, the record says who the token is.
      asked.actor = await callerLogin(ghToken);
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
};
