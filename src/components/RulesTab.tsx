import { createElement, useEffect, useMemo, useState } from "react";
import { issueUrl, worthAnIssue } from "./docIssue";
import RevisionLine from "./RevisionLine";

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

/**
 * What the last pull request to judge a rule said about it.
 *
 * "Broken" and "already broken" answer different questions and were told apart by nothing but the
 * word "already": one is a rule this change broke, the other a rule the code was not keeping before
 * this change either. Saying "newly broken" puts the difference in the label rather than in a
 * footnote, and every pill and chip carries the longer sentence as its title.
 */
const OUTCOME_LABEL: Record<string, string> = {
  MAINTAINED: "Held",
  VIOLATED: "Newly broken",
  PRE_EXISTING: "Already broken",
  RESTORED: "Restored",
  UNCLEAR: "Couldn't check",
};

const OUTCOME_HELP: Record<string, string> = {
  MAINTAINED: "The code kept this rule when the pull request last checked it.",
  VIOLATED: "The pull request broke this rule: the code kept it before that change and not after.",
  PRE_EXISTING:
    "The code was already not keeping this rule before that pull request, so the change is not what broke it.",
  RESTORED: "The pull request fixed this rule: the code was not keeping it before, and does now.",
  UNCLEAR: "Striff could not tell, and says so rather than guessing either way.",
};

const ON_BRANCH_LABEL: Record<string, string> = {
  HOLDS: "Holds on the default branch",
  BROKEN: "Broken on the default branch",
  UNCLEAR: "Couldn't check on the default branch",
};

type Filter = "all" | "broken" | "prior" | "held" | "unchecked" | "onMain";

/** Which column the list is ordered by. */
type SortKey = "rule" | "source" | "outcome";

/**
 * Outcomes in the order someone reads them: what a change broke, what was already broken, what
 * could not be judged, what was restored, what holds, and last what nothing has looked at. An
 * alphabetical sort of these words would put "Already broken" above "Broken" and "Held" above both,
 * which is no order at all.
 */
const SEVERITY: Record<string, number> = {
  VIOLATED: 0,
  PRE_EXISTING: 1,
  UNCLEAR: 2,
  RESTORED: 3,
  MAINTAINED: 4,
};
const NEVER_CHECKED = 5;

/**
 * A sentence or a rule as the API sends it, with backticked names as code. Split rather than set
 * HTML: the text is a customer's own document, and it is never trusted as markup.
 */
function withCode(text: string | null | undefined) {
  if (!text) return null;
  return text.split(/`([^`]+)`/g).map((part, index) =>
    index % 2 === 1
      ? createElement("code", { key: index, className: "github-inline-code" }, part)
      : part
  );
}

function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Plain text, for a file someone opens in a spreadsheet: no backticks, no newlines, quotes doubled.
 *
 * A cell that begins with =, +, -, @ or a control character is a formula to Excel and Sheets, not
 * text, and these cells carry sentences out of a customer's own documents. A leading apostrophe is
 * the standard way to say "this is text": the spreadsheet drops it, and nothing is evaluated.
 */
function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "").replace(/`/g, "").replace(/\s+/g, " ").trim();
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
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

  const [owner, name] = repo.split("/");

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
        setError(body.error || "Couldn't load this repository's rules");
        setData(null);
        return;
      }
      setData(body);
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
      for (const rule of group.rules) all.push({ ...rule, doc: group.document });
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
      broken: rows.filter((row) => row.status === "VIOLATED").length,
      prior: rows.filter((row) => row.status === "PRE_EXISTING").length,
      held: rows.filter((row) => row.status === "MAINTAINED" || row.status === "RESTORED").length,
      unchecked: rows.filter((row) => !row.status).length,
      onMain: rows.filter((row) => row.onDefaultBranch === "HOLDS").length,
    }),
    [rows]
  );

  const term = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const matchesFilter = (row: Row) => {
      switch (filter) {
        case "broken":
          return row.status === "VIOLATED";
        case "prior":
          return row.status === "PRE_EXISTING";
        case "held":
          return row.status === "MAINTAINED" || row.status === "RESTORED";
        case "unchecked":
          return !row.status;
        case "onMain":
          return row.onDefaultBranch === "HOLDS";
        default:
          return true;
      }
    };
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
        const rank = (row: Row) =>
          row.status ? SEVERITY[row.status] ?? NEVER_CHECKED : NEVER_CHECKED;
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
          csvCell(row.status ? OUTCOME_LABEL[row.status] || row.status : "Not checked yet"),
          csvCell(row.pullNo ? `#${row.pullNo}` : ""),
          csvCell(row.judgedAtMs ? new Date(row.judgedAtMs).toISOString().slice(0, 10) : ""),
          csvCell(row.onDefaultBranch ? ON_BRANCH_LABEL[row.onDefaultBranch] || row.onDefaultBranch : ""),
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
          </div>
          <p className="docs-lede">
            Every rule Striff has read from this repository's docs, and where each one came from.
            Open a document's name to see it beside the rest of its doc.
          </p>
          {data && <RevisionLine catalog={data} />}
        </div>
        {summary && (
          <div className="docs-tally">
            {([
              ["all", summary.rules, "rules", "", "Every rule read from this repository's docs."],
              ["broken", summary.brokenRules, "newly broken", "is-violated", OUTCOME_HELP.VIOLATED],
              ["prior", summary.alreadyBrokenRules, "already broken", "is-prior",
                OUTCOME_HELP.PRE_EXISTING],
              ["onMain", summary.holdsOnDefaultBranch, "hold on main", "is-held",
                "Rules that hold in the code on the default branch right now."],
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
          <p className="text-slate-600">
            Striff hasn't read a rule out of this repository yet. It reads a doc when a pull request
            changes code that doc talks about; the documents view lists everything it can read.
          </p>
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
            <div className="docs-filters">
              {([
                ["all", "All", counts.all, "", "Every rule read from this repository's docs."],
                ["broken", "Newly broken", counts.broken, "broken", OUTCOME_HELP.VIOLATED],
                ["prior", "Already broken", counts.prior, "prior", OUTCOME_HELP.PRE_EXISTING],
                ["held", "Held last check", counts.held, "held", OUTCOME_HELP.MAINTAINED],
                ["unchecked", "Not checked", counts.unchecked, "unread",
                  "No pull request has judged this rule yet."],
                ["onMain", "Holds on main", counts.onMain, "held",
                  "The rule holds in the code on the default branch right now, whatever any one pull request said about it."],
              ] as const).map(([key, label, count, dot, help]) => (
                <button
                  key={key}
                  type="button"
                  className={`docs-filter${filter === key ? " is-on" : ""}`}
                  title={help}
                  onClick={() => setFilter(key)}
                >
                  {dot && <span className={`docs-fdot is-${dot}`} />}
                  {label} <b>{count}</b>
                </button>
              ))}
            </div>
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
                {heading("outcome", "Latest outcome")}
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
                    {withCode(row.statement)}
                    {row.quote && <span className="rules-quote">“{withCode(row.quote)}”</span>}
                  </td>
                  <td className="rules-source">
                    <button type="button" className="rules-source-link" onClick={() => onOpenDoc?.(row.doc.path)}>
                      {row.doc.path}
                      {row.sourceLine ? <i>:{row.sourceLine}</i> : null}
                    </button>
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
                      className={`docs-outcome is-${(row.status || "none").toLowerCase()}`}
                      title={row.status
                        ? OUTCOME_HELP[row.status] || ""
                        : "No pull request has judged this rule yet."}
                    >
                      {row.status ? OUTCOME_LABEL[row.status] || row.status : "Not checked yet"}
                    </span>
                    {row.pullNo && (
                      <span className="docs-outcome-when">
                        PR #{row.pullNo} · {when(row.judgedAtMs)}
                      </span>
                    )}
                    {row.onDefaultBranch && (
                      <span className="docs-outcome-branch">
                        {ON_BRANCH_LABEL[row.onDefaultBranch] || row.onDefaultBranch}
                      </span>
                    )}
                    {worthAnIssue(row.status) && (
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
