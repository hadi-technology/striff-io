// The dashboard's deep link to one repository: /dashboard?repo=<owner>/<name>, which a private
// repository's README badge links to.
//
// The repository named is opened only if one of the signed-in reader's installations covers it, as
// GitHub lists them for the reader's own token. One that none covers is answered the same way
// whether it exists or not. Plain JavaScript, so the tests can import it without a build.

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Where a deep link waits while the reader signs in with GitHub and comes back. */
export const PENDING_REPO_KEY = "striff.pendingRepo";

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
