/**
 * A GitHub issue, written out before anyone opens it.
 *
 * Someone looking at a broken rule already knows everything the issue needs: the sentence in the
 * doc, the rule read from it, which pull request broke it and when, and how it stands on the
 * default branch. Making them retype that is how a finding turns into nothing. This builds the
 * "new issue" URL with all of it filled in, so the work left is a sentence of context and the
 * Create button.
 *
 * What it writes follows what a good issue is made of: a title that states the problem, the
 * evidence it rests on, what changed and when, and what would close it. It never claims more than
 * Striff knows -- a rule nothing has judged says so, rather than being reported as broken.
 */

/** As much of a rule as the issue needs to describe itself. */
export interface IssueRule {
  statement: string;
  quote: string | null;
  sourceLine: number | null;
  status: string | null;
  pullNo: string | null;
  judgedAtMs: number | null;
  onDefaultBranch: string | null;
}

/** GitHub's own limit is generous, but a URL this long is a sign the quote ran away. */
const MAX_QUOTE = 600;

/** The statuses worth opening an issue about: the code is not keeping the rule. */
export function worthAnIssue(status: string | null): boolean {
  return status === "VIOLATED" || status === "PRE_EXISTING";
}

function plain(text: string | null | undefined): string {
  return (text || "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function on(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The issue a reader would write for this rule, as a GitHub "new issue" link.
 *
 * @param owner the repository's owner
 * @param repo the repository's name
 * @param docPath the document the rule was read from
 * @param rule the rule and what was last said about it
 * @param branch the branch the line link should point at; the default branch where known
 * @return the URL to open; the caller decides how it is offered
 */
export function issueUrl(
  owner: string,
  repo: string,
  docPath: string,
  rule: IssueRule,
  branch?: string | null
): string {
  const ref = branch || "HEAD";
  const line = rule.sourceLine ? `#L${rule.sourceLine}` : "";
  const where = `${docPath}${rule.sourceLine ? `:${rule.sourceLine}` : ""}`;
  const link = `https://github.com/${owner}/${repo}/blob/${ref}/${docPath}${line}`;
  const quote = plain(rule.quote).slice(0, MAX_QUOTE);
  const statement = plain(rule.statement);

  const title = `Docs and code disagree: ${statement}`.slice(0, 120);

  const happened =
    rule.status === "VIOLATED"
      ? `The code kept this rule before ${rule.pullNo ? `#${rule.pullNo}` : "the last change checked"} and not after${rule.judgedAtMs ? `, checked on ${on(rule.judgedAtMs)}` : ""}.`
      : `The code was already not keeping this rule when ${rule.pullNo ? `#${rule.pullNo}` : "it was last checked"} was checked${rule.judgedAtMs ? `, on ${on(rule.judgedAtMs)}` : ""}, so that change is not what broke it.`;

  const onBranch =
    rule.onDefaultBranch === "BROKEN"
      ? "On the default branch today, the code does not keep it."
      : rule.onDefaultBranch === "HOLDS"
      ? "On the default branch today, the code does keep it — so this may already be fixed."
      : rule.onDefaultBranch === "UNCLEAR"
      ? "Striff could not tell how it stands on the default branch."
      : "Nothing has judged it against the default branch yet.";

  const body = [
    `A rule written in [\`${where}\`](${link}) is not being kept by the code.`,
    "",
    "### The sentence in the doc",
    quote ? `> ${quote}` : "_The extraction kept no sentence for this rule._",
    "",
    "### The rule Striff read from it",
    `\`${statement}\``,
    "",
    "### What happened",
    happened,
    onBranch,
    "",
    "### What would close this",
    "- Change the code so it keeps the rule, **or**",
    "- change the sentence in the doc, if it no longer says what we intend.",
    "",
    "Either is a fix. Striff re-reads a doc on the next pull request that changes code the doc talks about, so an edited sentence becomes the new rule then.",
    "",
    "<sub>Opened from the Striff dashboard.</sub>",
  ].join("\n");

  const params = new URLSearchParams({ title, body });
  return `https://github.com/${owner}/${repo}/issues/new?${params}`;
}
