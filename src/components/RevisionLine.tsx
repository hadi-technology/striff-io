import { clockNow, formatDay } from "../lib/renderClock.js";

/**
 * Which revision of the repository this page is a view of, and when Striff last refreshed it.
 *
 * Both views list what is on the **default branch**: the catalogue is written by a scan of that
 * branch, and its counts are counts of it. Rules, though, are read by pull requests, so a document's
 * rules can come from a version that only ever existed on someone's branch. Saying which branch
 * this is, and when it was last refreshed, is the difference between a list of documents and a list
 * of documents as of something.
 *
 * "Last refreshed" is the latest moment anything on the page was brought up to date: the documents
 * listed, a reading of the whole repository finished, or a document's rules extracted. It is the one
 * date the page shows about itself. Work still in flight is not reported here: what the page shows is
 * what Striff has, and it says when it had it.
 */

interface Revision {
  defaultBranch: string | null;
  defaultBranchSha: string | null;
  lastScanMs: number | null;
  reading?: { state: string; finishedAtMs: number } | null;
  documents?: { lastExtractedMs: number | null }[];
}

/** The latest of the listing, a finished reading and any document's extraction; null where none. */
export function lastRefreshedMs(catalog: Revision): number | null {
  let latest = catalog.lastScanMs || 0;
  if (catalog.reading?.state === "done" && catalog.reading.finishedAtMs > latest) {
    latest = catalog.reading.finishedAtMs;
  }
  for (const doc of catalog.documents || []) {
    if (doc.lastExtractedMs && doc.lastExtractedMs > latest) latest = doc.lastExtractedMs;
  }
  return latest > 0 ? latest : null;
}

function ago(ms: number): string {
  const minutes = Math.round((clockNow() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDay(ms, { month: "short", day: "numeric" });
}

function listedTitle(ms: number | null): string {
  if (!ms) return "Striff hasn't finished reading this repository's doc list.";
  return `Docs last read from the default branch ${ago(ms)}.`;
}

export default function RevisionLine({ catalog }: { catalog: Revision }) {
  const branch = catalog.defaultBranch;
  const sha = catalog.defaultBranchSha;
  const refreshed = lastRefreshedMs(catalog);
  return (
    <p className="docs-revision">
      <span
        className="docs-revision-branch"
        title="Everything on this page is the default branch. Striff reads a repository's docs from that branch, and counts them there."
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="4.5" cy="3.5" r="1.75" />
          <circle cx="4.5" cy="12.5" r="1.75" />
          <circle cx="11.5" cy="6" r="1.75" />
          <path d="M4.5 5.25v5.5M6.25 6h3.5c.83 0 1.5.67 1.5 1.5" />
        </svg>
        {branch || "default branch"}
      </span>
      {sha && (
        <code className="docs-revision-sha" title="The commit that branch pointed at when Striff last read its docs.">
          {sha.slice(0, 7)}
        </code>
      )}
      {refreshed && (
        <span className="docs-revision-when" title={listedTitle(catalog.lastScanMs)}>
          Last read {ago(refreshed)}
        </span>
      )}
    </p>
  );
}
