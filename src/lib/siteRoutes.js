/**
 * First path segments that are this site's own pages, never a repository's owner: a two-part
 * address under one of them is the site's, not a public repository's report.
 */
export const SITE_ROUTES = new Set(["blog", "contact", "billing", "dashboard", "demo", "pricing",
  "privacy", "terms", "cookies", "installed", "badge", "badge-examples"]);
