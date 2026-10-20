// The dashboard's deep link to one repository: /dashboard?repo=<owner>/<name>, which a private
// repository's README badge links to, and to one of its documents: ...&doc=<repo-relative path>.
// A public page takes the same doc parameter: /<owner>/<repo>?doc=<path>.
//
// The repository named is opened only if one of the signed-in reader's installations covers it, as
// GitHub lists them for the reader's own token. One that none covers is answered the same way
// whether it exists or not. Plain JavaScript, so the tests can import it without a build.

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Where a deep link waits while the reader signs in with GitHub and comes back. */
export const PENDING_REPO_KEY = "striff.pendingRepo";
/** The same for the document a deep link named. */
export const PENDING_DOC_KEY = "striff.pendingDoc";

/**
 * The repository a dashboard address names, or null where it names none GitHub could have.
 *
 * @param {string} search the address's query string, with or without its "?"
 */
export function repoFromSearch(search) {
  const value = new URLSearchParams(search || "").get("repo");
  return validRepo(value);
}

/** @return the "owner/name" given, trimmed, or null where it could not be a repository */
export function validRepo(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") return null;
  return `${owner}/${name}`;
}

/**
 * The installation that covers a repository, among the reader's, and the repository as GitHub
 * spells it; null where none does.
 *
 * @param {{ id: number, repositories?: { full_name: string }[] }[]} installations
 * @param {string} fullName "owner/name", in any case
 */
export function findRepo(installations, fullName) {
  const wanted = String(fullName || "").toLowerCase();
  if (!wanted) return null;
  for (const installation of installations || []) {
    for (const repo of installation.repositories || []) {
      if ((repo.full_name || "").toLowerCase() === wanted) {
        return { installationId: installation.id, fullName: repo.full_name };
      }
    }
  }
  return null;
}

/**
 * The address with its repo parameter taken out, everything else kept.
 *
 * @param {string} href the current address
 */
export function withoutRepoParam(href) {
  const url = new URL(href);
  url.searchParams.delete("repo");
  return url.pathname + url.search + url.hash;
}

/**
 * A repository-relative document path as the address may carry it, or null where it could not be
 * one: empty, absolute, containing a ".." or "." segment or a control character, or very long.
 * Whether the repository has such a document is for its catalogue to say.
 *
 * @param {unknown} value
 */
export function validDocPath(value) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > 500 || path.startsWith("/") || /[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return path;
}

/**
 * The document an address names, or null where it names none.
 *
 * @param {string} search the address's query string, with or without its "?"
 */
export function docFromSearch(search) {
  return validDocPath(new URLSearchParams(search || "").get("doc"));
}

/**
 * The address with its repo and doc parameters set (or taken out where null or undefined),
 * everything else kept. Left alone where a parameter's value is undefined.
 *
 * @param {string} href the current address
 * @param {{ repo?: string | null, doc?: string | null }} link
 */
export function withLink(href, link) {
  const url = new URL(href);
  for (const key of ["repo", "doc"]) {
    const value = link[key];
    if (value === undefined) continue;
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

/**
 * The link to share for one document: the page's own address with only the repo (where given) and
 * doc parameters, so a plan or installation parameter of the reader's session is not passed on.
 *
 * @param {string} href the current address
 * @param {string | null} repo "owner/name" for the dashboard, null for a public page
 * @param {string} doc the repository-relative path
 */
export function docLink(href, repo, doc) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  if (repo) url.searchParams.set("repo", repo);
  url.searchParams.set("doc", doc);
  return url.toString();
}
