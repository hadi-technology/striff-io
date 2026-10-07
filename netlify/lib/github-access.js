// Asking GitHub, with the caller's own token, who they are and what they can see; and answering the
// same questions from what an earlier request was told (access-cache.js) where that is still fresh.
//
// Every answer here is GitHub's answer for this token. The cache may say "yes" on GitHub's behalf
// for a few minutes after GitHub said it; it never says "no". A refusal always comes from GitHub
// itself, asked again.
//
// Not a function: this directory is outside netlify/functions, so it is bundled into the functions
// that import it and never deployed as an endpoint of its own.

const GITHUB_API = "https://api.github.com";
const PAGE_SIZE = 100;

/** The pages a dashboard listing reads: 500 items per list. */
export const DASHBOARD_PAGES = 5;
/** The pages an authorization check reads before it says it cannot tell. */
export const CHECK_PAGES = 10;
/** Longest the question "who is this?" may take before it counts as GitHub not answering. */
const USER_TIMEOUT_MS = 8000;

export function parseCookie(header) {
  const cookies = {};
  for (const pair of (header || "").split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * The signed-in user, as GitHub knows the token, or why GitHub would not say. The two failures are
 * kept apart because they mean opposite things: a token GitHub refuses is a session that has ended
 * (or that a refresh can renew), while no answer at all is GitHub being down, and must not sign
 * anyone out.
 *
 * @return { user } with the user's login, avatar and name; or { failure } where failure is
 *     "signed_out" (GitHub answered 401 to the token) or "error" (anything else)
 */
export async function whoIs(token) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}/user`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(USER_TIMEOUT_MS),
    });
  } catch {
    return { failure: "error" };
  }
  if (res.status === 401) return { failure: "signed_out" };
  if (!res.ok) return { failure: "error" };
  try {
    const user = await res.json();
    if (!user || typeof user.login !== "string") return { failure: "error" };
    return { user: { login: user.login, avatar_url: user.avatar_url, name: user.name } };
  } catch {
    return { failure: "error" };
  }
}

/**
 * The signed-in user, as GitHub knows the token.
 *
 * @return the user's login, avatar and name, or null where GitHub would not say (a token it does
 *     not accept, or no answer at all)
 */
export async function fetchUser(token) {
  return (await whoIs(token)).user || null;
}

/**
 * What a non-OK answer means. GitHub answers a rate limit with 403 as well as a refusal, and the
 * difference matters: one says the caller may not see something, the other says ask again later.
 *
 * @return "signed_out" (GitHub refused the token itself), "limited", "refused", or "error"
 */
async function failureOf(res) {
  if (res.status === 401) return "signed_out";
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const retryAfter = res.headers.get("retry-after");
    const body = await res.text().catch(() => "");
    const limited = res.status === 429 || retryAfter !== null || remaining === "0"
      || /rate limit|secondary rate|abuse/i.test(body);
    return limited ? "limited" : "refused";
  }
  return "error";
}

async function fetchPage(token, path, listKey, page) {
  let res;
  try {
    const join = path.includes("?") ? "&" : "?";
    res = await fetch(`${GITHUB_API}${path}${join}per_page=${PAGE_SIZE}&page=${page}`,
      { headers: githubHeaders(token) });
  } catch {
    return { failure: "error", items: [] };
  }
  if (!res.ok) return { failure: await failureOf(res), items: [] };
  try {
    const data = await res.json();
    const items = Array.isArray(data?.[listKey]) ? data[listKey] : null;
    if (!items) return { failure: "error", items: [] };
    return { failure: null, items, total: Number.isInteger(data.total_count) ? data.total_count : null };
  } catch {
    return { failure: "error", items: [] };
  }
}

/**
 * Every item of a paged GitHub listing, up to maxPages pages. The first page says how many there
 * are; the rest are asked for together.
 *
 * @return { items, complete, failure }: complete is true only when every page GitHub has was read
 *     without error; failure names the first page that failed ("signed_out", "limited", "refused",
 *     "error"), or null. items holds whatever was read, complete or not.
 */
export async function listAllPages(token, path, listKey, maxPages) {
  const first = await fetchPage(token, path, listKey, 1);
  if (first.failure) return { items: [], complete: false, failure: first.failure };
  const items = [...first.items];

  if (first.total !== null) {
    const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
    const asked = [];
    for (let page = 2; page <= Math.min(pages, maxPages); page += 1) {
      asked.push(fetchPage(token, path, listKey, page));
    }
    const rest = await Promise.all(asked);
    let failure = null;
    for (const answer of rest) {
      items.push(...answer.items);
      failure = failure || answer.failure;
    }
    return { items, complete: !failure && pages <= maxPages, failure };
  }

  // No count given: read on until a short page.
  let last = first.items;
  for (let page = 2; page <= maxPages && last.length >= PAGE_SIZE; page += 1) {
    const answer = await fetchPage(token, path, listKey, page);
    if (answer.failure) return { items, complete: false, failure: answer.failure };
    items.push(...answer.items);
    last = answer.items;
  }
  return { items, complete: last.length < PAGE_SIZE, failure: null };
}

/** Every installation the token sees. */
export function listInstallations(token, maxPages) {
  return listAllPages(token, "/user/installations", "installations", maxPages);
}

/** Every repository the token sees under one installation. */
export function listInstallationRepositories(token, installationId, maxPages) {
  return listAllPages(token, `/user/installations/${installationId}/repositories`, "repositories",
    maxPages);
}

export const SEES = "yes";
export const SEES_NOT = "no";
/** GitHub would not say: a rate limit, an outage, or a listing longer than this pages through. */
export const CANNOT_TELL = "unknown";
/** GitHub would not accept the caller's own token: expired, revoked, or signed out elsewhere. */
export const SIGNED_OUT = "signed_out";

/**
 * Whether the caller's own token sees this installation.
 *
 * A fresh cached list that names it answers SEES. Otherwise GitHub is asked, through every page,
 * and a complete answer is cached. GitHub refusing the token itself is SIGNED_OUT, so the caller
 * can renew the session and ask again; anything else GitHub would not answer is SEES_NOT, as
 * before.
 *
 * @param cache the access cache for this same token
 * @param installationId digits only; callers validate it
 */
export async function callerSeesInstallation(cache, token, installationId) {
  const wanted = String(installationId);
  const cached = await cache.installationIds();
  if (cached && cached.includes(wanted)) return SEES;

  const listed = await listInstallations(token, CHECK_PAGES);
  const ids = listed.items.map((inst) => String(inst.id));
  if (listed.complete) await cache.rememberInstallationIds(ids);
  if (ids.includes(wanted)) return SEES;
  return listed.failure === "signed_out" ? SIGNED_OUT : SEES_NOT;
}

/**
 * Whether the caller's own token sees this repository under this installation.
 *
 * A fresh cached listing that names it answers SEES. Otherwise GitHub is asked, through every
 * page; a complete listing is cached. Three answers besides yes, not one: a rate limit, a 5xx or
 * an installation larger than this pages through is not evidence that the caller cannot see the
 * repository, and answering 403 to it tells someone they lack access they actually have.
 *
 * @param cache the access cache for this same token
 * @param installationId digits only; callers validate it
 */
export async function callerSeesRepository(cache, token, installationId, owner, repo) {
  const wanted = `${owner}/${repo}`.toLowerCase();
  const cached = await cache.repositoryNames(installationId);
  if (cached && cached.includes(wanted)) return SEES;

  const listed = await listInstallationRepositories(token, installationId, CHECK_PAGES);
  const names = listed.items.map((r) => String(r.full_name || "").toLowerCase());
  if (listed.complete) await cache.rememberRepositoryNames(installationId, names);
  if (names.includes(wanted)) return SEES;
  if (listed.failure === "signed_out") return SIGNED_OUT;
  if (listed.failure === "refused") return SEES_NOT;
  if (listed.failure) return CANNOT_TELL;
  // Every page read and the repository on none of them; or more pages than this reads, which is
  // an installation this check cannot finish, not one that does not cover the repository.
  return listed.complete ? SEES_NOT : CANNOT_TELL;
}

/**
 * Who is asking, as GitHub knows them: from the cache where fresh, otherwise from GitHub.
 *
 * @return the login, or null where GitHub would not say
 */
export async function callerLogin(cache, token) {
  const cached = await cache.login();
  if (cached) return cached;
  const user = await fetchUser(token);
  if (!user) return null;
  await cache.rememberLogin(user.login);
  return user.login;
}
