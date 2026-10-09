// Where a visit came from, read from the address it arrived at and the page that sent it.
//
// Plain JavaScript with no browser globals, so the tests can import it without a build; the
// analytics script passes in what the browser knows.

import { SITE_ROUTES } from "./siteRoutes.js";

/** The `ref` values Striff writes into its own links. Any other value is ignored. */
export const REF_SOURCES = ["badge", "check", "report", "email"];

/** Where the first-touch source is kept between visits. */
export const FIRST_SOURCE_KEY = "striff_first_source";

/** Where this visit's source is kept while the reader moves between the site's own pages. */
export const VISIT_SOURCE_KEY = "striff_visit_source";

/** Value for a page reached from another page of this site, when the visit's source is not kept. */
export const INTERNAL = "internal";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

// The parts of a repository's address on GitHub that show its README or a file in it.
const README_VIEWS = new Set(["blob", "tree"]);

function parse(href) {
  try {
    return href ? new URL(href) : null;
  } catch {
    return null;
  }
}

/**
 * The source GitHub's address names: a pull request, a repository's front page or a file in it
 * (where a README is read), or GitHub otherwise. GitHub usually sends only its origin to another
 * site, so most visits from it read as "github"; the `ref` Striff writes is what tells them apart.
 *
 * @param {URL} url
 */
function githubSource(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 4 && parts[2] === "pull") return "github_pr";
  if (parts.length === 2) return "github_readme";
  if (parts.length >= 3 && README_VIEWS.has(parts[2])) return "github_readme";
  return "github";
}

/**
 * The visit's source, or null where the page was reached from another page of this site and so
 * says nothing new about where the visit came from.
 *
 * An explicit `ref` among {@link REF_SOURCES} wins. Otherwise the referrer decides: a GitHub
 * pull request is "github_pr", a GitHub repository's front page or a file in it "github_readme",
 * the rest of GitHub "github", any other site "external", and no referrer "direct".
 *
 * @param {{ href: string, referrer?: string | null }} visit the page's address and document.referrer
 * @returns {string | null}
 */
export function classifyVisitSource(visit) {
  const here = parse(visit.href);
  const ref = here ? (here.searchParams.get("ref") || "").toLowerCase() : "";
  if (REF_SOURCES.includes(ref)) return ref;

  const from = parse(visit.referrer);
  if (!from) return "direct";
  if (here && from.host === here.host) return null;
  const host = from.hostname.toLowerCase();
  if (GITHUB_HOSTS.has(host)) return githubSource(from);
  return "external";
}

/**
 * The repository a report page is about, "owner/name", or null where the path is not a report
 * page: /<owner>/<repo>, two segments, the first not one of the site's own pages.
 *
 * @param {string} pathname
 */
export function reportRepoFromPath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  let owner;
  let name;
  try {
    owner = decodeURIComponent(parts[0]);
    name = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  if (SITE_ROUTES.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === "." || name === "..") return null;
  return `${owner}/${name}`;
}
