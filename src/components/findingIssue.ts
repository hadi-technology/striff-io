/**
 * The GitHub issue a doc finding is tracked in, as the server reports it, and what the page shows
 * for it.
 *
 * The server links an issue to a finding when the issue names it (a marker the prefilled body
 * carries, or the title it was opened with) and keeps the link as the issue opens, closes and
 * reopens. A finding with no link, or an answer from a server that does not send one, shows the
 * button to open an issue as before: a link the page cannot read is never taken to mean one exists.
 */

/** An issue as the server sends it beside a rule or a stale name. */
export interface FindingIssue {
  number: number;
  url: string;
  state: string;
  stateReason?: string | null;
}

/** What the page shows for a finding's issue. */
export type IssueView =
  | { kind: "none" }
  | { kind: "open"; number: number; url: string }
  | { kind: "closed"; number: number; url: string; notPlanned: boolean };

/**
 * What a finding's issue comes to on the page: none, open, or closed and whether as not planned.
 * Anything malformed is none, so the button to open an issue shows.
 */
export function issueView(issue: FindingIssue | null | undefined): IssueView {
  if (!issue || typeof issue !== "object") return { kind: "none" };
  const number = Number(issue.number);
  const url = typeof issue.url === "string" ? issue.url : "";
  if (!Number.isInteger(number) || number <= 0 || !url.startsWith("https://github.com/")) {
    return { kind: "none" };
  }
  if (issue.state === "open") return { kind: "open", number, url };
  if (issue.state === "closed") {
    return { kind: "closed", number, url, notPlanned: issue.stateReason === "not_planned" };
  }
  return { kind: "none" };
}

/** The hidden line a prefilled issue ends with, naming the rule it is about. */
export function ruleMarker(factId: string): string {
  return `<!-- striff:finding rule:${factId} -->`;
}

/** The hidden line a prefilled issue ends with, naming the stale name it is about. */
export function staleNameMarker(docPath: string, name: string): string {
  return `<!-- striff:finding stale-name:${docPath}:${name} -->`;
}

/** The issues a repository's findings are tracked in, as the API answers them, apart from the rules. */
export interface FindingIssuesAnswer {
  rules?: { factId: string; issue: FindingIssue | null }[];
  staleNames?: { docPath: string; name: string; issue: FindingIssue | null }[];
  complete?: boolean;
}

/** An answer, kept for looking findings up: by rule, and by doc and name. */
export interface IssueIndex {
  rules: Map<string, FindingIssue>;
  staleNames: Map<string, FindingIssue>;
}

const staleKey = (docPath: string, name: string) => `${docPath}\u0000${name}`;

/**
 * The issues an answer names, by finding; null where the answer is missing or not an answer, so a
 * failed or empty read changes nothing on the page.
 */
export function issueIndex(answer: unknown): IssueIndex | null {
  if (!answer || typeof answer !== "object") return null;
  const { rules, staleNames } = answer as FindingIssuesAnswer;
  const index: IssueIndex = { rules: new Map(), staleNames: new Map() };
  for (const entry of Array.isArray(rules) ? rules : []) {
    if (entry && typeof entry.factId === "string" && entry.issue) index.rules.set(entry.factId, entry.issue);
  }
  for (const entry of Array.isArray(staleNames) ? staleNames : []) {
    if (entry && typeof entry.docPath === "string" && typeof entry.name === "string" && entry.issue) {
      index.staleNames.set(staleKey(entry.docPath, entry.name), entry.issue);
    }
  }
  return index.rules.size === 0 && index.staleNames.size === 0 ? null : index;
}

/**
 * The rows with the issue each is tracked in, where the index names one. A row the index does not
 * name keeps whatever it carried; with no index, the same array comes back, so nothing re-renders.
 */
export function withRuleIssues<T extends { factId: string; issue?: FindingIssue | null }>(
  rows: T[],
  index: IssueIndex | null
): T[] {
  if (!index || index.rules.size === 0) return rows;
  let changed = false;
  const out = rows.map((row) => {
    const issue = index.rules.get(row.factId);
    if (!issue || issue === row.issue) return row;
    changed = true;
    return { ...row, issue };
  });
  return changed ? out : rows;
}

/** A stale name with the issue it is tracked in, where the index names one; itself otherwise. */
export function withStaleNameIssue<T extends { name: string; issue?: FindingIssue | null }>(
  finding: T,
  docPath: string,
  index: IssueIndex | null
): T {
  const issue = index?.staleNames.get(staleKey(docPath, finding.name));
  return issue && issue !== finding.issue ? { ...finding, issue } : finding;
}
