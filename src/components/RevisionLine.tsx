/**
 * Which revision of the repository this page is a view of.
 *
 * Both views list what is on the **default branch**: the catalogue is written by a scan of that
 * branch, and its counts are counts of it. Rules, though, are read by pull requests, so a document's
 * rules can come from a version that only ever existed on someone's branch. Saying which branch
 * this is, and when it was last listed, is the difference between a list of documents and a list of
 * documents as of something.
 */

interface Revision {
  defaultBranch: string | null;
  defaultBranchSha: string | null;
  lastScanMs: number | null;
}

function listedWhen(ms: number | null): string {
  if (!ms) return "not listed yet";
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "listed just now";
  if (minutes < 60) return `listed ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `listed ${hours}h ago`;
  return `listed ${new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function RevisionLine({ catalog }: { catalog: Revision }) {
  const branch = catalog.defaultBranch;
  const sha = catalog.defaultBranchSha;
  return (
    <p className="docs-revision">
      <span
        className="docs-revision-branch"
        title="Everything on this page is the default branch. Striff lists a repository's documents from that branch, and counts them there."
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
        <code className="docs-revision-sha" title="The commit that branch pointed at when Striff last listed its documents.">
          {sha.slice(0, 7)}
        </code>
      )}
      <span className="docs-revision-when">{listedWhen(catalog.lastScanMs)}</span>
    </p>
  );
}
