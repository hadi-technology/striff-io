/**
 * The public report pages built as static HTML, and what each one shows, read once per build.
 *
 * Which pages there are is striff-api's answer: the published pages that are up. Each is then read
 * through exactly the views the live page reads (the page summary, the catalogue, the rules and the
 * names out of date), at the same API paths the site's proxy forwards to, so a built page shows
 * nothing the live one would not.
 *
 * A page is built only from four good answers. A page striff-api has none for (taken down,
 * unpublished, made private) is not built, and a page any read fails for is not built either; both
 * fall through to the generic shell the site serves for every other address. A list that cannot be
 * had builds no report page at all. Nothing here fails the build.
 *
 * Sources, from the build's environment:
 * - STRIFF_SERVER_KEY (and STRIFF_API_BASE_URL): striff-api directly, the way the proxy reads it.
 * - otherwise STRIFF_REPORTS_PROXY (a site such as https://striff.io) with STRIFF_REPORTS_LIST
 *   (owner/repo,owner/repo): read through that site's public proxy, for a local build without
 *   the key. The proxy has no list, so the list is given.
 * - STRIFF_STATIC_REPORTS=0 builds none.
 */
import { apiPathFor } from "../../netlify/functions/public-repo-proxy.js";
import { SITE_ROUTES } from "./siteRoutes.js";
import { standing } from "./standing.js";

export const SITE = "https://striff.io";

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** The views a report page is built from, as the proxy names them, keyed as a report holds them. */
const VIEWS = { page: "page", catalog: "catalog", rules: "rules", staleNames: "type-findings" };

const REQUEST_TIMEOUT_MS = 30000;

/** Whether an address segment pair could be a repository's page rather than one of the site's. */
export function isReportAddress(owner, name) {
  return typeof owner === "string" && typeof name === "string"
    && OWNER.test(owner) && NAME.test(name) && name !== "." && name !== ".."
    && !SITE_ROUTES.has(owner.toLowerCase());
}

/**
 * Where this build reads reports from, or null where it reads none.
 *
 * @param {Record<string, string | undefined>} env
 */
export function sourceFromEnv(env = process.env) {
  if (env.STRIFF_STATIC_REPORTS === "0" || env.STRIFF_STATIC_REPORTS === "false") return null;
  if (env.STRIFF_SERVER_KEY) {
    return { kind: "api", base: (env.STRIFF_API_BASE_URL || "https://api.striff.io").replace(/\/+$/, ""), key: env.STRIFF_SERVER_KEY };
  }
  if (env.STRIFF_REPORTS_PROXY && env.STRIFF_REPORTS_LIST) {
    const list = env.STRIFF_REPORTS_LIST.split(",").map((each) => each.trim()).filter(Boolean)
      .map((each) => {
        const [repoOwner, repoName] = each.split("/");
        return { repoOwner, repoName };
      });
    return { kind: "proxy", base: env.STRIFF_REPORTS_PROXY.replace(/\/+$/, ""), list };
  }
  return null;
}

/** The URL and headers of one view's read. */
export function viewRequest(source, owner, name, view) {
  if (source.kind === "api") {
    return {
      url: source.base + apiPathFor({ owner, repo: name, view }),
      headers: { "X-Server-Key": source.key, Accept: "application/json" },
    };
  }
  const query = new URLSearchParams({ owner, repo: name, view });
  return {
    url: `${source.base}/.netlify/functions/public-repo-proxy?${query.toString()}`,
    headers: { Accept: "application/json" },
  };
}

class ReadFailed extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** One JSON read, tried twice where the failure could pass: a network error, a timeout, a 5xx. */
async function readJson(fetchImpl, url, headers, retryDelayMs = 1000) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.ok) return await res.json();
      last = new ReadFailed(`HTTP ${res.status}`, res.status);
      // A refusal is an answer; asking again would get the same one.
      if (res.status < 500) throw last;
    } catch (failure) {
      if (failure instanceof ReadFailed && failure.status > 0 && failure.status < 500) throw failure;
      last = failure instanceof ReadFailed ? failure : new ReadFailed(String(failure?.message || failure), 0);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw last;
}

/** The published pages that are up, as striff-api lists them. */
async function listPages(source, fetchImpl, retryDelayMs) {
  if (source.kind === "proxy") return source.list;
  const answer = await readJson(fetchImpl, `${source.base}/api/v1/public-repos/published`,
    { "X-Server-Key": source.key, Accept: "application/json" }, retryDelayMs);
  if (!Array.isArray(answer?.pages)) throw new ReadFailed("the list has no pages", 0);
  return answer.pages;
}

/** Whether the four answers have the shape the page reads; a page built from less is not built. */
function wellFormed(report) {
  return typeof report.page?.repoOwner === "string" && typeof report.page?.repoName === "string"
    && Array.isArray(report.catalog?.documents) && report.catalog?.summary != null
    && Array.isArray(report.rules?.documents)
    && Array.isArray(report.staleNames?.findings);
}

/** One page's four views, or a reason it is not built. */
async function readReport(source, entry, fetchImpl, builtAtMs, retryDelayMs) {
  const owner = entry.repoOwner;
  const name = entry.repoName;
  const report = { builtAtMs };
  try {
    // The summary first: a page striff-api has none for answers 404 here, and nothing else is read.
    for (const [key, view] of Object.entries(VIEWS)) {
      const { url, headers } = viewRequest(source, owner, name, view);
      report[key] = await readJson(fetchImpl, url, headers, retryDelayMs);
    }
  } catch (failure) {
    if (failure instanceof ReadFailed && failure.status === 404) return { skipped: "no public page" };
    return { skipped: `could not be read (${failure.message})` };
  }
  if (!wellFormed(report)) return { skipped: "an answer was not the shape the page reads" };
  if (!isReportAddress(report.page.repoOwner, report.page.repoName)) return { skipped: "not an address the site serves" };
  return { report };
}

/**
 * Reads every report the build can. Never throws: what cannot be read is skipped and said.
 *
 * @param {{ source: any, fetchImpl?: typeof fetch, log?: Pick<Console, "info" | "warn">,
 *           concurrency?: number, now?: number, retryDelayMs?: number }} options
 * @returns {Promise<{ reports: any[], skipped: { repo: string, reason: string }[] }>}
 */
export async function loadReports({ source, fetchImpl = fetch, log = console, concurrency = 3, now = Date.now(), retryDelayMs = 1000 }) {
  if (!source) {
    log.info("[static reports] no STRIFF_SERVER_KEY (or STRIFF_REPORTS_PROXY with STRIFF_REPORTS_LIST): every report is served by the shell");
    return { reports: [], skipped: [] };
  }
  let entries;
  try {
    entries = await listPages(source, fetchImpl, retryDelayMs);
  } catch (failure) {
    log.warn(`[static reports] the list of published pages could not be read (${failure.message}): every report is served by the shell`);
    return { reports: [], skipped: [] };
  }
  const seen = new Set();
  const wanted = entries.filter((entry) => {
    if (!isReportAddress(entry?.repoOwner, entry?.repoName)) return false;
    const key = `${entry.repoOwner}/${entry.repoName}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const reports = [];
  const skipped = [];
  let next = 0;
  async function worker() {
    while (next < wanted.length) {
      const entry = wanted[next++];
      const outcome = await readReport(source, entry, fetchImpl, now, retryDelayMs);
      if (outcome.report) reports.push(outcome.report);
      else skipped.push({ repo: `${entry.repoOwner}/${entry.repoName}`, reason: outcome.skipped });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  reports.sort((a, b) => `${a.page.repoOwner}/${a.page.repoName}`.localeCompare(`${b.page.repoOwner}/${b.page.repoName}`));
  for (const each of skipped) log.warn(`[static reports] ${each.repo} not built, served by the shell: ${each.reason}`);
  log.info(`[static reports] ${reports.length} built, ${skipped.length} served by the shell`);
  return { reports, skipped };
}

let once = null;

/** This build's reports, read once however many pages ask. */
export function staticReports() {
  if (!once) once = loadReports({ source: sourceFromEnv() }).then((loaded) => loaded.reports);
  return once;
}

/** When the page was last refreshed: its last finished reading, else when it was published. */
export function refreshedAtMs(report) {
  const reading = report.page.reading;
  if (reading && reading.finishedAtMs > 0) return reading.finishedAtMs;
  return report.page.publishedAtMs || report.catalog.lastScanMs || null;
}

/**
 * The counts the page's head shows, worked out the way the page works them out: rules nothing
 * could decide are not counted, and names out of date count only once a reading has looked, and
 * only in documents the page lists.
 */
export function reportFacts(report) {
  const { catalog, rules, staleNames } = report;
  const rows = rules.documents.flatMap((group) => group.rules || []).filter((rule) => standing(rule) !== "unclear");
  const listed = new Set(catalog.documents.map((doc) => doc.path));
  const names = staleNames.lastSeenMs != null
    ? staleNames.findings.filter((finding) => listed.has(finding.docPath)).length
    : 0;
  return {
    documents: catalog.documents.length,
    read: catalog.summary.read || 0,
    rules: rows.length,
    holds: rows.filter((row) => standing(row) === "holds").length,
    broken: rows.filter((row) => standing(row) === "broken").length,
    unchecked: rows.filter((row) => standing(row) === "unchecked").length,
    names,
    namesTruncated: !!staleNames.truncated && names > 0,
    refreshedAtMs: refreshedAtMs(report),
  };
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A day as the page's head writes it, in en-US and UTC so every build writes it alike. */
export function headDay(ms) {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A JSON document that is safe inside a script element. */
export function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

/**
 * The page's head: title, description, canonical address, robots and structured data.
 *
 * A page with no decided rule and no name out of date has nothing a search should land on, so it is
 * built (for a reader without script) but not indexed. Nothing here says the repository installed
 * Striff: the page is a report about it.
 */
export function reportHead(report, site = SITE) {
  const owner = report.page.repoOwner;
  const name = report.page.repoName;
  const full = `${owner}/${name}`;
  const facts = reportFacts(report);
  // Netlify serves every built page at its lower-cased path and redirects other spellings there,
  // so the canonical address, the sitemap and og:url name the address a crawler ends up on.
  const canonical = `${site}/${owner.toLowerCase()}/${name.toLowerCase()}/`;
  const namesPart = facts.names > 0
    ? `${facts.names}${facts.namesTruncated ? "+" : ""} stale ${facts.names === 1 && !facts.namesTruncated ? "name" : "names"} in the docs.`
    : "";
  const day = facts.refreshedAtMs ? headDay(facts.refreshedAtMs) : null;

  let headline;
  let description;
  if (facts.rules > 0) {
    headline = `${full}: ${plural(facts.rules, "documented rule")} checked against the code`;
    const standings = [`${facts.holds} ${facts.holds === 1 ? "holds" : "hold"}`, `${facts.broken} broken`];
    if (facts.unchecked > 0) standings.push(`${facts.unchecked} not checked yet`);
    description = `Striff read ${plural(facts.read, "doc")} in ${full} and checked the ${plural(facts.rules, "rule")} ${facts.read === 1 ? "it states" : "they state"} against the code: ${standings.join(", ")}.`;
  } else if (facts.names > 0) {
    headline = `${full}: ${facts.names}${facts.namesTruncated ? "+" : ""} stale ${facts.names === 1 && !facts.namesTruncated ? "name" : "names"} in its docs`;
    description = `Striff read ${plural(facts.read, "doc")} in ${full} and checked the names ${facts.read === 1 ? "it writes" : "they write"} against the code.`;
  } else {
    headline = `${full}: documented architecture report`;
    description = `Striff reads the docs in ${full}, turns the sentences that make claims about the code into rules, and checks them against the code.`;
  }
  description = [description, namesPart, `Public, read-only report${day ? `, last read ${day}` : ""}.`]
    .filter(Boolean).join(" ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: headline,
    description,
    url: canonical,
    inLanguage: "en",
    ...(facts.refreshedAtMs ? { dateModified: new Date(facts.refreshedAtMs).toISOString() } : {}),
    isPartOf: { "@type": "WebSite", name: "Striff", url: `${site}/` },
    publisher: { "@type": "Organization", name: "Striff", url: `${site}/` },
    about: { "@type": "SoftwareSourceCode", name: full, codeRepository: `https://github.com/${owner}/${name}` },
  };

  return {
    title: `${headline} | Striff`,
    ogTitle: headline,
    description,
    canonical,
    robots: facts.rules > 0 || facts.names > 0 ? "index,follow" : "noindex,nofollow",
    indexable: facts.rules > 0 || facts.names > 0,
    jsonLd: scriptJson(jsonLd),
    facts,
  };
}
