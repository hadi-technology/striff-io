// Netlify function behind https://striff.io/badge/<owner>/<repo>.svg: the README badge.
//
// The badge says that a repository's docs are checked against its code, or, as ?variant= asks,
// how many of its documented rules hold. It is drawn by striff-api, which also decides whether
// the repository has one at all. Every answer it gives is an image with status 200, a repository
// it has no count for included, so a README never shows a broken image for a repository Striff
// does not know. This function adds nothing to that decision. It checks that the address could
// name a GitHub repository, passes the style, label, variant and token on, and lets Netlify's CDN
// keep the answer, so README traffic seldom reaches the API.
//
// A request that does not carry preview=1 came from somewhere other than Striff's own pages, a
// README almost always, and is passed on as from=readme: that is what ticks the onboarding item
// "Add the Striff badge to your README". One line is logged per request, with the variant asked
// for, which is how many READMEs carry the badge, and which variant, is counted per repository per
// day.

const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

// The names GitHub could have given a repository, as public-repo-proxy.js checks them.
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

const STYLES = new Set(["flat", "flat-square", "for-the-badge"]);
// What the badge can say; the API falls back to the default for a repository that does not qualify.
const VARIANTS = new Set(["practice", "count", "agent", "held"]);
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
// Printable, no control characters, and short enough to draw: the API measures up to this.
const LABEL = /^[^\u0000-\u001f\u007f]{1,40}$/u;

const DEFAULT_CACHE = "public, max-age=300, s-maxage=600";
const CDN_CACHE = "public, s-maxage=600, stale-while-revalidate=3600, durable";

/**
 * The repository a badge address names, or null where it names none.
 *
 * Netlify hands the function either the address as asked (/badge/<owner>/<repo>.svg) or the one
 * the rewrite made of it (/.netlify/functions/badge/<owner>/<repo>.svg); the last two segments are
 * the same in both.
 *
 * @param {string | undefined} path the request's path
 */
export function repoFromPath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.length < 3) return null;
  const owner = decode(parts[parts.length - 2]);
  const file = decode(parts[parts.length - 1]);
  if (owner === null || file === null || !/\.svg$/i.test(file)) return null;
  const name = file.replace(/\.svg$/i, "");
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") return null;
  return { owner, name };
}

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

/**
 * The API path for a badge: the repository, and whichever of style, label, variant and token are
 * ones the API could use. One that is not is dropped rather than refused, so a typo in a README
 * still shows a badge.
 *
 * @param {{ owner: string, name: string }} repo
 * @param {Record<string, string | undefined>} params the request's query parameters
 */
export function apiPathFor(repo, params) {
  const query = new URLSearchParams();
  if (params.style && STYLES.has(params.style)) query.set("style", params.style);
  if (params.label && LABEL.test(params.label)) query.set("label", params.label);
  if (params.variant && VARIANTS.has(params.variant)) query.set("variant", params.variant);
  if (params.token && TOKEN.test(params.token)) query.set("token", params.token);
  if (params.preview !== "1") query.set("from", "readme");
  const search = query.toString();
  return `/api/v1/public-repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/badge`
    + (search ? `?${search}` : "");
}

function header(headers, name) {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

const UNAVAILABLE = {
  statusCode: 503,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60" },
  body: "Striff could not be reached just now.",
};

export const handler = async (event) => {
  const method = event.httpMethod;
  if (method !== "GET" && method !== "HEAD") {
    return { statusCode: 405, headers: { Allow: "GET, HEAD" }, body: "Method Not Allowed" };
  }
  const repo = repoFromPath(event.path);
  if (!repo) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      body: "No repository could have this name.",
    };
  }
  const params = event.queryStringParameters || {};
  const readme = params.preview !== "1";
  console.log(JSON.stringify({
    badge: `${repo.owner}/${repo.name}`.toLowerCase(),
    day: new Date().toISOString().slice(0, 10),
    readme,
    variant: params.variant && VARIANTS.has(params.variant) ? params.variant : "practice",
  }));
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, headers: { "Cache-Control": "no-store" }, body: "Server not configured" };
  }
  const headers = { "X-Server-Key": STRIFF_SERVER_KEY, Accept: "image/svg+xml" };
  const etag = header(event.headers, "if-none-match");
  if (etag) headers["If-None-Match"] = etag;
  let res;
  try {
    res = await fetch(`${STRIFF_API_BASE}${apiPathFor(repo, params)}`, { headers });
  } catch {
    return UNAVAILABLE;
  }
  if (res.status !== 200 && res.status !== 304) {
    return UNAVAILABLE;
  }
  const cacheControl = res.headers.get("cache-control") || DEFAULT_CACHE;
  const out = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  };
  // An answer the API could not settle (GitHub would not say whether the repository is public)
  // comes marked no-store, and the CDN must not hold it: a provisional "checked" kept for ten
  // minutes would be a wrong badge in someone's README for that long.
  if (!/no-store|private/i.test(cacheControl)) out["Netlify-CDN-Cache-Control"] = CDN_CACHE;
  const answeredEtag = res.headers.get("etag");
  if (answeredEtag) out.ETag = answeredEtag;
  return {
    statusCode: res.status,
    headers: out,
    body: res.status === 304 || method === "HEAD" ? "" : await res.text(),
  };
};
