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
