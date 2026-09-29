import { useEffect, useMemo, useState } from "react";
import { issueUrl } from "./docIssue";
import { Clamped, ExtensionNote, mark, withCode, when } from "./docRules";

/**
 * A list of rules, whatever a reader selected to get it.
 *
 * There used to be two of these: one for a whole repository and one for a single document, with
 * the same four columns, two sets of sorting and only one of them able to search, print or export.
 * They were the same table read at two scopes, so this is that table, and the scope is whatever the
 * document tree has selected -- the repository, a folder and everything beneath it, or one file.
 *
 * Everything here answers the same four questions in the same order: where the rule came from, the
 * sentence in the docs that said it, the rule Striff read out of that sentence, and how the code
 * stands against it now.
 */

/** As much of a document as a row needs to say where it came from and how fresh it is. */
export interface RowDoc {
  path: string;
  outdated: boolean;
  lastExtractedMs: number | null;
  lastExtractedPullNo: string | null;
}

export interface Rule {
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

/** One rule with the document it came from, which is how every scope reads them. */
export type Row = Rule & { doc: RowDoc };

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
 */
export type Standing = "holds" | "broken" | "unchecked" | "unclear";

export function standing(row: { status: string | null; onDefaultBranch: string | null }): Standing {
  if (row.onDefaultBranch === "HOLDS") return "holds";
  if (row.onDefaultBranch === "BROKEN") return "broken";
  if (row.onDefaultBranch === "UNCLEAR") return "unclear";
  if (row.status === "MAINTAINED" || row.status === "RESTORED") return "holds";
  if (row.status === "VIOLATED" || row.status === "PRE_EXISTING") return "broken";
  if (row.status === "UNCLEAR") return "unclear";
  return "unchecked";
}

/** Worst first: what is broken, then what nothing has judged, then what holds. */
const SEVERITY: Record<Standing, number> = { broken: 0, unchecked: 1, holds: 2, unclear: 3 };

export const STANDING_LABEL: Record<Standing, string> = {
  broken: "Broken",
  holds: "Holds",
  unchecked: "Not checked yet",
  unclear: "Couldn't check",
};

export const STANDING_HELP: Record<Standing, string> = {
  broken: "The code does not keep this rule.",
  holds: "The code keeps this rule.",
  unchecked: "Nothing has judged this rule against the code yet.",
  unclear: "Striff could not tell.",
};

/** Which rules a reader asked to see, where they followed a count to them. */
export type RuleFilter = "all" | Standing;

/** Which column the list is ordered by. */
type SortKey = "rule" | "source" | "outcome";

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

/** A path as a file name: `docs/adr/0007.md` becomes `docs-adr-0007-md`. */
export function pathStem(path: string): string {
  return path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

export default function RulesTable({
  rows,
  owner,
  name,
  branch,
  scopeLabel,
  fileStem,
  showPath,
  filter,
  docCount,
  truncated,
  onOpenDoc,
}: {
  /** The rules in scope, already stripped of the ones nothing could judge. */
  rows: Row[];
  owner: string;
  name: string;
  /** The branch a line link should point at; the default branch where it is known. */
  branch: string | null;
  /** What is selected, named the way a reader would name it: `docs/adr/`, a file, a repository. */
  scopeLabel: string;
  /** The same thing as a file name, for what the export writes out. */
  fileStem: string;
  /** Whether a row names its document. One document's own rules all came from the same file. */
  showPath: boolean;
  /** Which rules to show, driven by the counts above the table. */
  filter: RuleFilter;
  /** How many documents these rules came from, for the line under the table. */
  docCount: number;
  /** Whether the repository holds more rules than one answer carries. */
  truncated?: boolean;
  /** Opens a document from the row that names it. */
  onOpenDoc?: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  // Document order to begin with: a repository's rules read as its documents do until someone
  // asks for something else.
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "source", dir: 1 });

  useEffect(() => {
    if (!exportOpen) return;
    const close = () => setExportOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [exportOpen]);

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
    // The file is named after what was selected. A folder's export landing under the
    // repository's own name is a file that is smaller than its name promises.
    link.download = `${fileStem}-rules.csv`;
    // In the document, and revoked a tick later: a detached anchor does not download everywhere,
    // and revoking in the same tick races the browser's own fetch of the blob.
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
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
            placeholder={showPath ? "Search rules, sentences and docs" : "Search this doc's rules"}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="rules-export" onClick={(event) => event.stopPropagation()}>
          {/* The control names what it would write before anyone presses it. An export that turns
              out to have covered a folder rather than the repository is a surprise found in a
              downloads folder, which is the worst place to find one. */}
          <button
            type="button"
            className="rules-export-button"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            title={`Print or download the ${shown.length} rule${shown.length === 1 ? "" : "s"} shown for ${scopeLabel}.`}
            onClick={() => setExportOpen((open) => !open)}
          >
            Export <b>{scopeLabel}</b>
            <span className="rules-export-count">
              ({shown.length} rule{shown.length === 1 ? "" : "s"})
            </span>
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
        <h1>{scopeLabel} — documented rules</h1>
        <p>
          {shown.length} of {rows.length} rules, printed{" "}
          {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          {filter !== "all" || term !== "" ? " (filtered)" : ""}.
        </p>
      </div>

      <table className={`docs-rules rules-table${showPath ? "" : " is-one-doc"}`}>
        <thead>
          <tr>
            {heading("source", "Where it came from")}
            <th>The sentence in your docs</th>
            {heading("rule", "The rule it became")}
            {heading("outcome", "How it stands")}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr
              key={row.factId}
              /* The tone follows the pill. It used to follow the pull request's own status, so a
                 rule the default branch reports as broken -- which the pill says, in red -- got a
                 white row with no mark on it at all. Newly broken and already broken keep their
                 own tones, because the first is this change's doing and the second is not. */
              className={
                row.status === "VIOLATED"
                  ? "is-violated"
                  : row.status === "PRE_EXISTING"
                  ? "is-prior"
                  : standing(row) === "broken"
                  ? "is-violated"
                  : ""
              }
            >
              <td className="rules-source">
                <span className="rules-source-where">
                  {showPath ? (
                    <button type="button" className="rules-source-link" onClick={() => onOpenDoc?.(row.doc.path)}>
                      {mark(row.doc.path, term)}
                      {row.sourceLine ? <i>:{row.sourceLine}</i> : null}
                    </button>
                  ) : (
                    // One document's own rules all came from the same file, and its name is
                    // already the heading above this table. The line is what differs.
                    <span className="rules-source-line">
                      {row.sourceLine ? `line ${row.sourceLine}` : "no line recorded"}
                    </span>
                  )}
                  <a
                    className="rules-source-github"
                    href={`https://github.com/${owner}/${name}/blob/${branch || "HEAD"}/${row.doc.path}${row.sourceLine ? `#L${row.sourceLine}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${row.doc.path}${row.sourceLine ? ` at line ${row.sourceLine}` : ""} on GitHub`}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                  </a>
                </span>
                {showPath && (
                  <span className="rules-source-when">
                    {row.doc.lastExtractedMs
                      ? `Read ${when(row.doc.lastExtractedMs)}${row.doc.lastExtractedPullNo ? ` on PR #${row.doc.lastExtractedPullNo}` : ""}`
                      : ""}
                  </span>
                )}
              </td>
              <td className="docs-rule-quote">
                <Clamped lines={4}>{withCode(row.quote, term)}</Clamped>
              </td>
              <td className="docs-rule-statement">
                <Clamped lines={4}>{withCode(row.statement, term)}</Clamped>
              </td>
              <td>
                {/* A rule a pull request's change broke names that pull request: it is where the
                    break came from, and one click from the diff. A rule broken before any pull
                    request judged it has nothing to name, and says only that it is broken. */}
                {standing(row) === "broken" && row.status === "VIOLATED" && row.pullNo ? (
                  <a
                    className="docs-outcome is-broken is-link"
                    href={`https://github.com/${owner}/${name}/pull/${row.pullNo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Pull request #${row.pullNo} broke this rule.`}
                  >
                    Broken by #{row.pullNo}
                  </a>
                ) : (
                  <span className={`docs-outcome is-${standing(row)}`} title={STANDING_HELP[standing(row)]}>
                    {STANDING_LABEL[standing(row)]}
                  </span>
                )}
                {/* This column is narrow, so each line under the pill is short enough to stay one
                    line, and the sentence it stands for is in its title. */}
                {row.pullNo && (
                  <span
                    className="docs-outcome-when"
                    title={`Last judged on PR #${row.pullNo}, ${when(row.judgedAtMs)}.`}
                  >
                    PR #{row.pullNo} · {when(row.judgedAtMs)}
                  </span>
                )}
                {row.pullNo && !row.onDefaultBranch && (
                  <span
                    className="docs-outcome-branch"
                    title="A pull request judged this rule. Nothing has judged it against the default branch yet."
                  >
                    not checked on {branch || "the branch"} yet
                  </span>
                )}
                {standing(row) === "broken" && (
                  <a
                    className="docs-issue-link"
                    href={issueUrl(owner, name, row.doc.path, row, branch)}
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

      {/* One document's count is already stated above its own table, so this line is only worth a
          row when it says something that one does not. */}
      {(showPath || shown.length !== rows.length) && (
      <div className="docs-tree-foot">
        {shown.length === rows.length
          ? `${rows.length} rule${rows.length === 1 ? "" : "s"} from ${docCount} doc${docCount === 1 ? "" : "s"}`
          : `${shown.length} of ${rows.length} rules`}
        {truncated && (
          <>
            {" · "}
            <b>This repository holds more rules than one answer carries; these are the first of
            them, by document, so a document later in the repository may have rules this list
            does not reach.</b>
          </>
        )}
      </div>
      )}

      {rows.length > 0 && <ExtensionNote />}
    </div>
  );
}
