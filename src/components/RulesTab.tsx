import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { issueUrl, worthAnIssue } from "./docIssue";
import RevisionLine from "./RevisionLine";
import { mark, withCode, when } from "./docRules";

/**
 * Every rule Striff has read from one repository's documents, in one list.
 *
 * The documents view answers "what does Striff know about this file"; this one answers "what does
 * this repository promise", which is the question someone opens the dashboard with, and the one
 * they want to search, print or hand to a reviewer. Each rule names the document and line it was
 * read from, and that name opens the document beside its own rules.
 */

interface Doc {
  path: string;
  state: string;
  ruleCount: number;
  outdated: boolean;
  lastExtractedMs: number | null;
  lastExtractedPullNo: string | null;
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

interface RepoRules {
  repoOwner: string;
  repoName: string;
  /** The branch this listing is of; null where GitHub would not say. */
  defaultBranch: string | null;
  /** The commit that branch pointed at when the documents were last listed. */
  defaultBranchSha: string | null;
  lastScanMs: number | null;
  summary: Summary;
  documents: { document: Doc; rules: Rule[] }[];
  truncated: boolean;
}

/** One rule with the document it came from, which is how this view reads them. */
type Row = Rule & { doc: Doc };

type Filter = "all" | "broken" | "holds" | "unchecked";

/**
 * How a rule stands, in one answer.
 *
 * There were two: what the last pull request said about it, and how it stands on the default
 * branch. They measure different moments -- a pull request judged it at that revision, the branch
 * is now -- and as two sets of filters side by side they asked a reader to hold both in their head
 * to work out whether a rule is being kept. It is one repository and one branch, so the question is
 * one question: does this hold now? The branch answers it where anything has judged it there, and
 * the last pull request answers it where nothing has. Which pull request said what stays on the
 * row, as how it got that way.
 *
 * A rule nothing could judge is neither: see {@link standing}.
 */
type Standing = "holds" | "broken" | "unchecked" | "unclear";

function standing(row: { status: string | null; onDefaultBranch: string | null }): Standing {
  if (row.onDefaultBranch === "HOLDS") return "holds";
  if (row.onDefaultBranch === "BROKEN") return "broken";
  if (row.onDefaultBranch === "UNCLEAR") return "unclear";
  if (row.status === "MAINTAINED" || row.status === "RESTORED") return "holds";
  if (row.status === "VIOLATED" || row.status === "PRE_EXISTING") return "broken";
  if (row.status === "UNCLEAR") return "unclear";
  return "unchecked";
}

/** Which column the list is ordered by. */
type SortKey = "rule" | "source" | "outcome";

/**
 * Worst first: what the code does not keep, then what nothing has judged, then what it keeps. An
 * alphabetical sort of these words would put "Broken" above "Holds" by luck rather than by
 * meaning, and "Not checked yet" above both.
 */
/** Worst first: what is broken, then what nothing has judged, then what holds. */
const SEVERITY: Record<Standing, number> = { broken: 0, unchecked: 1, holds: 2, unclear: 3 };

const STANDING_LABEL: Record<Standing, string> = {
  broken: "Broken",
  holds: "Holds",
  unchecked: "Not checked yet",
  unclear: "Couldn't check",
};

const STANDING_HELP: Record<Standing, string> = {
  broken: "The code does not keep this rule.",
  holds: "The code keeps this rule.",
  unchecked: "Nothing has judged this rule against the code yet.",
  unclear: "Striff could not tell.",
};

/**
 * Plain text, for a file someone opens in a spreadsheet: no backticks, no newlines, quotes doubled.
 *
 * A cell that begins with =, +, -, @ or a control character is a formula to Excel and Sheets, not
 * text, and these cells carry sentences out of a customer's own documents. A leading apostrophe is
 * the standard way to say "this is text": the spreadsheet drops it, and nothing is evaluated.
 */
function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "").replace(/`/g, "").replace(/\s+/g, " ").trim();
  // Tabs and returns cannot lead here -- the line above collapsed them -- so the guard names only
  // what can: a cell starting =, + or - is arithmetic to a spreadsheet, and @ is a function call.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function RulesTab({
  installationId,
  repos,
  openRepo,
  onOpenDoc,
  onRepoChange,
  showFilter,
}: {
  installationId: number;
  repos: { full_name: string }[];
  /** The repository being looked at, remembered across the sections. */
  openRepo?: string | null;
  /** Opens the documents view on one document, which is where a rule's source leads. */
  onOpenDoc?: (path: string) => void;
  /** Reports a repository picked here, so the shell and the documents view follow it. */
  onRepoChange?: (fullName: string) => void;
  /** Which rules to show, where a reader followed a count here; `at` is when they asked. */
  showFilter?: { value: string; at: number } | null;
}) {
  const [repo, setRepo] = useState<string>(openRepo || repos[0]?.full_name || "");
  const [data, setData] = useState<RepoRules | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  // Document order to begin with: a repository's rules read as its documents do until someone
  // asks for something else.
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "source", dir: 1 });
  /** How many times this view has waited for a listing it asked for; see DocsTab. */
  const waitedForListing = useRef(0);
  /** What the page is showing right now, so a wait never reloads over someone reading it. */
  const dataRef = useRef<RepoRules | null>(null);

  const [owner, name] = repo.split("/");
  dataRef.current = data;

  useEffect(() => {
    if (openRepo && openRepo !== repo) setRepo(openRepo);
  }, [openRepo]);

  // Keyed on when it was asked for, not on what was asked for: following the same count twice has
  // to move the view both times.
  useEffect(() => {
    if (showFilter) setFilter(showFilter.value as Filter);
  }, [showFilter?.at]);

  useEffect(() => {
    if (!owner || !name) return;
    waitedForListing.current = 0;
    load();
  }, [repo]);

  useEffect(() => {
    if (!exportOpen) return;
    const close = () => setExportOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [exportOpen]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?view=rules&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || body.error || "Couldn't load this repository's rules");
        // Same as the documents view: a failed refresh says so and leaves the rules where they are.
        if (!dataRef.current) setData(null);
        return;
      }
      setData(body);
      // Same as the documents view: only an empty page waits, and only while it stays empty.
      if ((body.documents || []).length === 0 && body.lastScanMs === null
          && waitedForListing.current < 3) {
        waitedForListing.current += 1;
        window.setTimeout(() => {
          if (!dataRef.current || (dataRef.current.documents || []).length === 0) load();
        }, 6000);
      }
    } catch {
      setError("Couldn't load this repository's rules");
    } finally {
      setLoading(false);
    }
  }

  /** Every rule, in document order, each carrying the document it was read from. */
  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [];
    for (const group of data?.documents || []) {
      for (const rule of group.rules) {
        // A rule Striff could not judge says nothing about the code, and a list of things that
        // said nothing is not worth a reader's attention or a place in the counts. It is still
        // stored, and the next pull request that touches the code it names judges it again.
        if (standing({ status: rule.status, onDefaultBranch: rule.onDefaultBranch }) === "unclear") {
          continue;
        }
        all.push({ ...rule, doc: group.document });
      }
    }
    return all.sort((a, b) =>
      a.doc.path === b.doc.path
        ? (a.sourceLine || 0) - (b.sourceLine || 0)
        : a.doc.path.localeCompare(b.doc.path)
    );
  }, [data]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      broken: rows.filter((row) => standing(row) === "broken").length,
      holds: rows.filter((row) => standing(row) === "holds").length,
      unchecked: rows.filter((row) => standing(row) === "unchecked").length,
    }),
    [rows]
  );

  const term = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const matchesFilter = (row: Row) => (filter === "all" ? true : standing(row) === filter);
    const matchesTerm = (row: Row) =>
      term === "" ||
      (row.statement || "").replace(/`/g, "").toLowerCase().includes(term) ||
      (row.quote || "").toLowerCase().includes(term) ||
      row.doc.path.toLowerCase().includes(term);
    const byDocument = (a: Row, b: Row) =>
      a.doc.path === b.doc.path
        ? (a.sourceLine || 0) - (b.sourceLine || 0)
        : a.doc.path.localeCompare(b.doc.path);
    const compare = (a: Row, b: Row) => {
      if (sort.key === "rule") {
        const plain = (row: Row) => (row.statement || "").replace(/`/g, "").toLowerCase();
        return plain(a).localeCompare(plain(b)) || byDocument(a, b);
      }
      if (sort.key === "outcome") {
        const rank = (row: Row) => SEVERITY[standing(row)];
        // Judged most recently first within a standing, so "what happened lately" is one click
        // away from "what is broken".
        return rank(a) - rank(b) || (b.judgedAtMs || 0) - (a.judgedAtMs || 0) || byDocument(a, b);
      }
      return byDocument(a, b);
    };
    return rows
      .filter((row) => matchesFilter(row) && matchesTerm(row))
      .sort((a, b) => sort.dir * compare(a, b));
  }, [rows, filter, term, sort]);

  /** The same click on a column twice turns it round; a different column starts at the top. */
  function orderBy(key: SortKey) {
    setSort((was) => (was.key === key ? { key, dir: was.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  /** A column heading that orders the list, and says which way it is ordered. */
  function heading(key: SortKey, label: string) {
    const on = sort.key === key;
    return (
      <th aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className={`rules-sort${on ? " is-on" : ""}`}
          onClick={() => orderBy(key)}
        >
          {label}
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {on && sort.dir === -1 ? <path d="M3 5l3 3 3-3" /> : <path d="M3 7l3-3 3 3" />}
          </svg>
        </button>
      </th>
    );
  }

  /** The list as it stands on screen, as a file: what is filtered out is not in it. */
  function downloadCsv() {
    const header = ["Document", "Line", "Rule", "Sentence", "Outcome", "Pull request", "Judged", "On default branch"];
    const lines = [header.map(csvCell).join(",")];
    for (const row of shown) {
      lines.push(
        [
          csvCell(row.doc.path),
          csvCell(row.sourceLine ?? ""),
          csvCell(row.statement),
          csvCell(row.quote),
          csvCell(STANDING_LABEL[standing(row)]),
          csvCell(row.pullNo ? `#${row.pullNo}` : ""),
          csvCell(row.judgedAtMs ? new Date(row.judgedAtMs).toISOString().slice(0, 10) : ""),
          csvCell(row.onDefaultBranch ? "judged against the default branch" : "judged on a pull request"),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${owner}-${name}-rules.csv`;
    // In the document, and revoked a tick later: a detached anchor does not download everywhere,
    // and revoking in the same tick races the browser's own fetch of the blob.
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const summary = data?.summary;

  if (repos.length === 0) {
    return (
      <div className="dashboard-empty">
        <p className="text-slate-600">
          This account has no repository Striff can see yet. Add one to the installation on GitHub,
          and its docs are listed as soon as Striff has read the repository.
        </p>
        <a
          href="https://github.com/apps/striff-app/installations/new"
          className="dashboard-button dashboard-button-primary mt-4 inline-block"
          target="_blank"
          rel="noopener noreferrer"
        >
          Manage repositories on GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="rules-view">
      <div className="docs-head">
        <div className="docs-head-copy">
          <p className="dashboard-kicker">Rules</p>
          <div className="docs-title">
            <select
              className="docs-title-select"
              aria-label="Repository"
              value={repo}
              onChange={(event) => {
                setRepo(event.target.value);
                onRepoChange?.(event.target.value);
              }}
            >
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <a
              className="docs-repo-link"
              href={`https://github.com/${owner}/${name}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this repository on GitHub"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
          <p className="docs-lede">
            Every rule Striff has read from this repository's docs, and where each one came from.
            Open a document's name to see it beside the rest of its doc.
          </p>
          {data && <RevisionLine catalog={data} />}
        </div>
        {summary && rows.length > 0 && (
          <div className="docs-tally">
            {([
              ["all", counts.all, "rules", "", "Every rule read from this repository's docs."],
              ["broken", counts.broken, "broken", "is-violated", STANDING_HELP.broken],
              ["holds", counts.holds, "holding", "is-held", STANDING_HELP.holds],
              ["unchecked", counts.unchecked, "not checked", "", STANDING_HELP.unchecked],
            ] as const).map(([key, count, label, tone, help]) => (
              <button
                key={key}
                type="button"
                className={`docs-tally-item ${tone}${filter === key ? " is-on" : ""}`}
                title={`${help} Click to show these.`}
                onClick={() => setFilter(key)}
              >
                <b>{count}</b>
                <i>{label}</i>
              </button>
            ))}
            <span
              className="docs-tally-item"
              title="Documents whose rules have been extracted, of every document Striff can read here."
            >
              <b>
                {summary.read}
                <em>
                  /{summary.documents - summary.retired - summary.screenedOut - summary.excluded}
                </em>
              </b>
              <i>docs read</i>
            </span>
          </div>
        )}
      </div>

      {loading && <p className="dashboard-metric-caption">Loading rules...</p>}
      {error && <p className="dashboard-inline-error">{error}</p>}

      {data && rows.length === 0 && !loading && data.truncated && (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            This repository holds more rules than one list can carry, and the first document alone
            fills it. Striff has them; this page cannot show them all yet.
          </p>
        </div>
      )}

      {data && rows.length === 0 && !loading && !data.truncated && (
        <div className="dashboard-empty">
          {data.lastScanMs === null ? (
            <p className="text-slate-600">
              Striff is listing this repository's documents. Any rules it has already read appear
              here as soon as that lands — a few seconds, usually.
            </p>
          ) : (
            <p className="text-slate-600">
              Striff hasn't read a rule out of this repository yet. It reads a doc when a pull
              request changes code that doc talks about; the documents view lists everything it can
              read.
            </p>
          )}
        </div>
      )}

      {data && rows.length > 0 && (
        <div className="rules-panel">
          <div className="rules-toolbar">
            <label className="rules-search">
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.25" />
                <path d="m10.25 10.25 3.5 3.5" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Search rules, sentences and docs"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="rules-export" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="rules-export-button"
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((open) => !open)}
              >
                Export
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6.5 8 10.5 12 6.5" />
                </svg>
              </button>
              {exportOpen && (
                <div className="rules-export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setExportOpen(false); window.print(); }}>
                    Print or save as PDF
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setExportOpen(false); downloadCsv(); }}>
                    Download CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Only on paper: what was printed, of what, and when. */}
          <div className="rules-print-head">
            <h1>{`${owner}/${name}`} — documented rules</h1>
            <p>
              {shown.length} of {rows.length} rules, printed{" "}
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              {filter !== "all" || term !== "" ? " (filtered)" : ""}.
            </p>
          </div>

          <table className="docs-rules rules-table">
            <thead>
              <tr>
                {heading("rule", "The rule")}
                {heading("source", "Where it came from")}
                {heading("outcome", "How it stands")}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.factId}
                  className={
                    row.status === "VIOLATED" ? "is-violated" : row.status === "PRE_EXISTING" ? "is-prior" : ""
                  }
                >
                  <td className="docs-rule-statement">
                    {withCode(row.statement, term)}
                    {row.quote && (
                      <span className="rules-quote">“{withCode(row.quote, term)}”</span>
                    )}
                  </td>
                  <td className="rules-source">
                    <span className="rules-source-where">
                    <button type="button" className="rules-source-link" onClick={() => onOpenDoc?.(row.doc.path)}>
                      {mark(row.doc.path, term)}
                      {row.sourceLine ? <i>:{row.sourceLine}</i> : null}
                    </button>
                    <a
                      className="rules-source-github"
                      href={`https://github.com/${owner}/${name}/blob/${data.defaultBranch || "HEAD"}/${row.doc.path}${row.sourceLine ? `#L${row.sourceLine}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${row.doc.path}${row.sourceLine ? ` at line ${row.sourceLine}` : ""} on GitHub`}
                    >
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                      </svg>
                    </a>
                    </span>
                    <span className="rules-source-when">
                      {row.doc.outdated
                        ? `Doc edited since Striff read it${row.doc.lastExtractedMs ? `, ${when(row.doc.lastExtractedMs)}` : ""}`
                        : row.doc.lastExtractedMs
                        ? `Read ${when(row.doc.lastExtractedMs)}${row.doc.lastExtractedPullNo ? ` on PR #${row.doc.lastExtractedPullNo}` : ""}`
                        : ""}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`docs-outcome is-${standing(row)}`}
                      title={STANDING_HELP[standing(row)]}
                    >
                      {STANDING_LABEL[standing(row)]}
                    </span>
                    {row.pullNo && (
                      <span className="docs-outcome-when">
                        last judged on PR #{row.pullNo} · {when(row.judgedAtMs)}
                      </span>
                    )}
                    {standing(row) === "broken" && (
                      <a
                        className="docs-issue-link"
                        href={issueUrl(owner, name, row.doc.path, row)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Opens GitHub with an issue written out: the sentence, the rule, what happened and what would close it."
                      >
                        Open an issue
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6.5 3.5H3.5v9h9v-3" /><path d="M9.5 3.5h3v3" /><path d="M12.5 3.5 7 9" />
                        </svg>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {shown.length === 0 && (
            <p className="dashboard-metric-caption">No rule here matches that.</p>
          )}

          <div className="docs-tree-foot">
            {shown.length === rows.length
              ? `${rows.length} rules from ${data.documents.length} docs`
              : `${shown.length} of ${rows.length} rules`}
            {data.truncated && (
              <>
                {" · "}
                <b>This repository holds more rules than one list carries; these are the first of
                them, by document.</b>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
