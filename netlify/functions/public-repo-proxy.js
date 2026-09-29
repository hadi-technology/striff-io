// Netlify function backing a public repository's page (/<owner>/<repo>): read-only, no sign-in.
//
// Whether a repository has a page, and what it shows, is decided by striff-api: it asks GitHub
// whether the repository is public on every read, and answers the same 404 for any repository
// without a page. This function adds nothing to that decision. It only forwards the reads the page
// makes, with the server key, and refuses anything else: no writes, no path it does not know.

const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// The names GitHub could have given a repository. Anything else never reaches the API.
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

const VIEWS = {
  page: "",
  checks: "/checks",
  catalog: "/doc-catalog",
  rules: "/doc-catalog/rules",
  "type-findings": "/doc-catalog/type-findings",
  doc: "/doc-catalog/doc",
};

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * The API path a request is for, or null where the request names no page the site reads.
 *
 * @param {Record<string, string | undefined>} params the request's query parameters
 */
export function apiPathFor(params) {
  const { owner, repo, view = "page" } = params;
  if (!owner || !repo || !OWNER.test(owner) || !NAME.test(repo) || repo === "." || repo === "..") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(VIEWS, view)) {
    return null;
  }
  const query = new URLSearchParams();
  if (view === "checks") {
    const page = params.page ?? "0";
    if (!/^\d{1,3}$/.test(page)) return null;
    query.set("page", page);
  }
  if (view === "doc") {
    if (!params.path || params.path.length > 1000) return null;
    query.set("path", params.path);
    if (params.version) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.version)) return null;
      query.set("version", params.version);
    }
  }
  const search = query.toString();
  return `/api/v1/public-repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    + VIEWS[view] + (search ? `?${search}` : "");
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { Allow: "GET" }, body: "Method Not Allowed" };
  }
  const path = apiPathFor(event.queryStringParameters || {});
  if (!path) {
    return {
      statusCode: 404,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "not_found", message: "Striff has no public page for this repository." }),
    };
  }
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "Server not configured" }) };
  }
  try {
    const res = await fetch(`${STRIFF_API_BASE}${path}`, {
      headers: { "X-Server-Key": STRIFF_SERVER_KEY, Accept: "application/json" },
    });
    return {
      statusCode: res.status,
      // A page is the same for everyone who opens it, so a minute of it may be shared; a refusal
      // is not kept, so a page published a moment ago shows at once.
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": res.ok ? "public, max-age=60" : "no-store",
        "X-Robots-Tag": "noindex",
      },
      body: await res.text(),
    };
  } catch {
    return {
      statusCode: 502,
      headers: { ...JSON_HEADERS, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "unavailable", message: "Striff could not be reached just now." }),
    };
  }
};
