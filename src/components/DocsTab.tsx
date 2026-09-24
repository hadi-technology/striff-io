import { useEffect, useMemo, useState } from "react";

/**
 * The documents Striff can read in one repository, and the rules it found in them.
 *
 * Every eligible document is listed, including ones nothing has read yet: extraction is lazy, so a
 * document waits until a pull request changes code it names, and a view that showed only extracted
 * documents would read as documents Striff cannot see.
 */

type DocState =
  | "NOT_READ"
  | "READ"
  | "SCREENED_OUT"
  | "RETIRED"
  | "UNREADABLE"
  | "EXCLUDED";

interface Doc {
  path: string;
  state: DocState;
  ruleCount: number;
  outdated: boolean;
  lastExtractedMs: number | null;
  lastExtractedPullNo: string | null;
  lastUsedMs: number | null;
  screenedBy: string | null;
  screenReason: string | null;
  retiredReason: string | null;
  brokenRules: number;
  alreadyBrokenRules: number;
  excludedBy: string | null;
  excludedReason: string | null;
}

interface Summary {
  documents: number;
  read: number;
  outdated: number;
  notRead: number;
  screenedOut: number;
  retired: number;
  unreadable: number;
  rules: number;
  brokenRules: number;
  alreadyBrokenRules: number;
  neverChecked: number;
  excluded: number;
  holdsOnDefaultBranch: number;
  brokenOnDefaultBranch: number;
}

interface Catalog {
  repoOwner: string;
  repoName: string;
  lastScanMs: number | null;
  summary: Summary;
  documents: Doc[];
}

interface Rule {
  factId: string;
  statement: string;
  quote: string | null;
  firstSeenMs: number;
  sourceLine: number | null;
  status: string | null;
  pullNo: string | null;
  judgedAtMs: number | null;
  onDefaultBranch: string | null;
}

interface DocEvent {
  kind: string;
  atMs: number;
  pullNo: string | null;
  ruleCount: number;
  reason: string | null;
}

interface Detail {
  document: Doc;
  rules: Rule[];
  history: DocEvent[];
}

const STATE_LABEL: Record<DocState, string> = {
  READ: "Read",
  NOT_READ: "Not read yet",
  SCREENED_OUT: "Skipped",
  RETIRED: "Retired",
  UNREADABLE: "Couldn't read",
  EXCLUDED: "Excluded",
};

const OUTCOME_LABEL: Record<string, string> = {
  MAINTAINED: "Held",
  VIOLATED: "Broken",
  PRE_EXISTING: "Already broken",
  RESTORED: "Restored",
  UNCLEAR: "Couldn't check",
};

const ON_BRANCH_LABEL: Record<string, string> = {
  HOLDS: "Holds on the default branch",
  BROKEN: "Broken on the default branch",
  UNCLEAR: "Couldn't check on the default branch",
};

function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The line a document's state deserves, in the words the pipeline used. */
function stateLine(doc: Doc): string {
  switch (doc.state) {
    case "READ":
      if (doc.outdated) {
        return `Edited on the default branch since Striff last read it. These rules come from the ${when(doc.lastExtractedMs)} version${doc.lastExtractedPullNo ? ` (PR #${doc.lastExtractedPullNo})` : ""}, and refresh on the next pull request that changes code this doc talks about.`;
      }
      return `Rules last extracted ${when(doc.lastExtractedMs)}${doc.lastExtractedPullNo ? ` on PR #${doc.lastExtractedPullNo}` : ""}.`;
    case "NOT_READ":
      return "Striff hasn't read this doc yet. It reads a doc the first time a pull request changes code the doc talks about.";
    case "SCREENED_OUT":
      return doc.screenReason
        ? `Nothing here to check against code: ${doc.screenReason}`
        : "A screen judged this doc holds no rule that could be checked against code.";
    case "RETIRED":
      return doc.retiredReason
        ? `This doc says it is no longer current: ${doc.retiredReason}`
        : "This doc says it is no longer current, so its rules aren't checked.";
    case "UNREADABLE":
      return "Striff couldn't finish reading this doc. That isn't counted as “no rules”; it tries again on the next pull request that touches the code it names.";
    case "EXCLUDED":
      return `You excluded this doc${doc.excludedBy ? `, ${doc.excludedBy}` : ""}${doc.excludedReason ? `: “${doc.excludedReason}”` : ""}. Striff doesn't read it, so it costs nothing, and its rules aren't checked.`;
    default:
      return "";
  }
}

export default function DocsTab({
  installationId,
  repos,
}: {
  installationId: number;
  repos: { full_name: string }[];
}) {
  const [repo, setRepo] = useState<string>(repos[0]?.full_name || "");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "broken" | "outdated" | "notRead" | "other">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [owner, name] = repo.split("/");

  useEffect(() => {
    if (!owner || !name) return;
    loadCatalog();
  }, [repo]);

  async function loadCatalog() {
    setLoading(true);
    setError("");
    setDetail(null);
    setSelected(null);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't load this repository's documents");
        setCatalog(null);
        return;
      }
      setCatalog(data);
    } catch {
      setError("Couldn't load this repository's documents");
    } finally {
      setLoading(false);
    }
  }

  async function openDoc(path: string) {
    setSelected(path);
    setDetail(null);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
      );
      if (!res.ok) return;
      setDetail(await res.json());
    } catch {
      /* the list still stands; the pane simply stays empty */
    }
  }

  async function setExcluded(path: string, excluded: boolean) {
    setBusy(true);
    try {
      await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: [path], folders: [], excluded }),
        }
      );
      await loadCatalog();
      await openDoc(path);
    } finally {
      setBusy(false);
    }
  }

  const documents = useMemo(() => {
    const all = catalog?.documents || [];
    switch (filter) {
      case "broken":
        return all.filter((doc) => doc.brokenRules > 0);
      case "outdated":
        return all.filter((doc) => doc.outdated);
      case "notRead":
        return all.filter((doc) => doc.state === "NOT_READ");
      case "other":
        return all.filter((doc) =>
          ["SCREENED_OUT", "RETIRED", "UNREADABLE", "EXCLUDED"].includes(doc.state)
        );
      default:
        return all;
    }
  }, [catalog, filter]);

  if (repos.length === 0) {
    return <p className="dashboard-metric-caption">No repositories are connected yet.</p>;
  }

  const summary = catalog?.summary;

  return (
    <div className="docs-tab">
      <div className="docs-tab-head">
        <label className="docs-repo-label" htmlFor={`docs-repo-${installationId}`}>
          Repository
        </label>
        <select
          id={`docs-repo-${installationId}`}
          className="docs-repo-select"
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
        >
          {repos.map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.full_name}
            </option>
          ))}
        </select>
        {catalog?.lastScanMs && (
          <span className="docs-scanned">Documents listed {when(catalog.lastScanMs)}</span>
        )}
      </div>

      {loading && <p className="dashboard-metric-caption">Loading documents...</p>}
      {error && <p className="dashboard-inline-error">{error}</p>}

      {summary && (
        <div className="docs-summary">
          <span><b>{summary.documents}</b> docs</span>
          <span><b>{summary.read}</b> read</span>
          {summary.outdated > 0 && <span><b>{summary.outdated}</b> edited since</span>}
          <span><b>{summary.notRead}</b> not read yet</span>
          <span className="docs-summary-rules"><b>{summary.rules}</b> rules</span>
          {summary.brokenRules > 0 && (
            <span className="docs-summary-broken"><b>{summary.brokenRules}</b> broken</span>
          )}
          {summary.alreadyBrokenRules > 0 && (
            <span className="docs-summary-prior"><b>{summary.alreadyBrokenRules}</b> already broken</span>
          )}
          {summary.neverChecked > 0 && (
            <span><b>{summary.neverChecked}</b> not checked yet</span>
          )}
        </div>
      )}

      {catalog && catalog.documents.length === 0 && !loading && (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            Striff hasn't listed this repository's documents yet. It lists them when the app is
            installed, and reads one when a pull request changes code that document talks about.
          </p>
        </div>
      )}

      {catalog && catalog.documents.length > 0 && (
        <div className="docs-split">
          <div className="docs-list">
            <div className="docs-filters">
              {([
                ["all", `All ${catalog.summary.documents}`],
                ["broken", `Broken ${catalog.summary.brokenRules}`],
                ["outdated", `Edited since ${catalog.summary.outdated}`],
                ["notRead", `Not read ${catalog.summary.notRead}`],
                ["other", `Other ${catalog.summary.screenedOut + catalog.summary.retired + catalog.summary.unreadable + catalog.summary.excluded}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`docs-filter${filter === key ? " is-on" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="docs-files">
              {documents.map((doc) => (
                <li key={doc.path}>
                  <button
                    type="button"
                    className={`docs-file${selected === doc.path ? " is-open" : ""}`}
                    onClick={() => openDoc(doc.path)}
                  >
                    <span className="docs-file-path">{doc.path}</span>
                    <span className="docs-file-meta">
                      {doc.brokenRules > 0 && (
                        <span className="docs-badge is-broken">{doc.brokenRules} broken</span>
                      )}
                      {doc.outdated && doc.state === "READ" && (
                        <span className="docs-badge is-outdated">Edited since</span>
                      )}
                      {doc.state !== "READ" && (
                        <span className={`docs-badge is-${doc.state.toLowerCase()}`}>
                          {STATE_LABEL[doc.state]}
                        </span>
                      )}
                      {doc.ruleCount > 0 && <span className="docs-count">{doc.ruleCount}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="docs-pane">
            {!selected && (
              <p className="dashboard-metric-caption">
                Choose a document to see the rules Striff read from it.
              </p>
            )}
            {selected && detail && (
              <>
                <div className="docs-pane-head">
                  <span className="docs-pane-path">{selected}</span>
                  <span className="docs-pane-actions">
                    {detail.document.state === "EXCLUDED" ? (
                      <button
                        type="button"
                        className="dashboard-button dashboard-button-secondary"
                        disabled={busy}
                        onClick={() => setExcluded(selected, false)}
                      >
                        Include again
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dashboard-button dashboard-button-secondary"
                        disabled={busy}
                        onClick={() => setExcluded(selected, true)}
                      >
                        Exclude from reading
                      </button>
                    )}
                  </span>
                </div>
                <p className={`docs-state-line is-${detail.document.state.toLowerCase()}`}>
                  {stateLine(detail.document)}
                </p>

                {detail.rules.length > 0 && (
                  <table className="docs-rules">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>The sentence in your docs</th>
                        <th>The rule it became</th>
                        <th>Latest outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rules.map((rule) => (
                        <tr key={rule.factId}>
                          <td className="docs-rule-line">{rule.sourceLine ? `:${rule.sourceLine}` : ""}</td>
                          <td className="docs-rule-quote">{rule.quote}</td>
                          <td className="docs-rule-statement">{rule.statement}</td>
                          <td>
                            <span className={`docs-outcome is-${(rule.status || "none").toLowerCase()}`}>
                              {rule.status ? OUTCOME_LABEL[rule.status] || rule.status : "Not checked yet"}
                            </span>
                            {rule.pullNo && (
                              <span className="docs-outcome-when">
                                PR #{rule.pullNo} · {when(rule.judgedAtMs)}
                              </span>
                            )}
                            {rule.onDefaultBranch && (
                              <span className="docs-outcome-branch">
                                {ON_BRANCH_LABEL[rule.onDefaultBranch] || rule.onDefaultBranch}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {detail.history.length > 0 && (
                  <div className="docs-history">
                    <p className="dashboard-kicker">Every pull request that used this doc</p>
                    <ul>
                      {detail.history.map((entry, index) => (
                        <li key={`${entry.atMs}-${index}`}>
                          <span className="docs-history-when">{when(entry.atMs)}</span>
                          <span className={`docs-history-kind is-${entry.kind}`}>{entry.kind.replace("_", " ")}</span>
                          {entry.pullNo && <span className="docs-history-pr">PR #{entry.pullNo}</span>}
                          {entry.reason && <span className="docs-history-reason">{entry.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
