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

/** As much of a name a doc writes and the code lacks as the issue needs to describe itself. */
export interface IssueStaleName {
  name: string;
  state: string;
  sentence: string | null;
  sourceLine: number | null;
  historicalPath: string | null;
  movedToNamespace: string | null;
  movedToPath: string | null;
  /** For a renamed name: the spelling the code declares now, and the file declaring it. */
  renamedTo?: string | null;
  renamedToPath?: string | null;
  /** The commit that removed the name's file, where history said: its message and where to read it. */
  removedByMessage?: string | null;
  removedByUrl?: string | null;
}

/**
 * The issue a reader would write for a name a doc writes that the code does not have.
 *
 * @param owner the repository's owner
 * @param repo the repository's name
 * @param docPath the document that writes the name
 * @param finding the name and what shows it is gone
 * @param branch the branch the line link should point at
 * @return the URL to open
 */
export function staleNameIssueUrl(
  owner: string,
  repo: string,
  docPath: string,
  finding: IssueStaleName,
  branch = "main"
): string {
  const moved = finding.state === "MOVED";
  const renamed = finding.state === "RENAMED" && !!finding.renamedTo;
  const title = moved
    ? `Stale name in ${docPath}: ${finding.name} has moved`
    : renamed
      ? `Stale name in ${docPath}: ${finding.name} is now ${finding.renamedTo}`
      : `Stale name in ${docPath}: ${finding.name} is gone`;
  const where = `https://github.com/${owner}/${repo}/blob/${branch}/${docPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}${finding.sourceLine ? `#L${finding.sourceLine}` : ""}`;
  const lines = [
    `**The doc:** [\`${docPath}${finding.sourceLine ? `:${finding.sourceLine}` : ""}\`](${where})`,
    "",
  ];
  const quote = plain(finding.sentence).slice(0, MAX_QUOTE);
  if (quote) lines.push(`> ${quote}`, "");
  if (moved) {
    lines.push(
      `**What the code has:** \`${finding.name}\` is declared in \`${finding.movedToNamespace}\`${
        finding.movedToPath ? ` (\`${finding.movedToPath}\`)` : ""
      }, not where the doc puts it.`
    );
  } else if (renamed) {
    lines.push(
      `**What the code has:** \`${finding.renamedTo}\`${
        finding.renamedToPath ? ` (\`${finding.renamedToPath}\`)` : ""
      }. The name was renamed, and the doc still writes the old spelling.`
    );
  } else if (finding.historicalPath) {
    lines.push(
      `**What the code has:** nothing by that name. The repository once had \`${finding.historicalPath}\` and does not now.`
    );
  } else {
    lines.push("**What the code has:** nothing by that name.");
  }
  lines.push(
    "",
    renamed
      ? `**What would close this:** edit the doc to write \`${finding.renamedTo}\`.`
      : "**What would close this:** edit the doc so it stops naming it, or bring it back.",
    "",
    `<sub>Found by Striff on the default branch. Opened from the [Striff dashboard](${DASHBOARD_LINK}).</sub>`
  );
  return `https://github.com/${owner}/${repo}/issues/new?title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(lines.join("\n"))}`;
}

/**
 * Instructions an agent can run as they are to fix a name a doc writes that the code does not have.
 *
 * Written from the same finding as {@link staleNameIssueUrl}, and as careful about what Striff
 * knows: the agent checks the finding before it edits, because a name missing from what Striff
 * read is not proof the name is missing from the code, and it stops if the finding is wrong. It
 * edits documentation only, and says nothing about how the change is shipped: that is the team's.
 *
 * @param owner the repository's owner
 * @param repo the repository's name
 * @param docPath the document that writes the name
 * @param finding the name and what shows it is gone
 * @param branch the branch the finding was read from
 * @return the prompt, as plain text
 */
export function staleNamePrompt(
  owner: string,
  repo: string,
  docPath: string,
  finding: IssueStaleName,
  branch = "main"
): string {
  const moved = finding.state === "MOVED";
  const renamed = finding.state === "RENAMED" && !!finding.renamedTo;
  const simple = finding.name.slice(finding.name.lastIndexOf(".") + 1);
  const where = `\`${docPath}\`${finding.sourceLine ? `, line ${finding.sourceLine}` : ""}`;
  const quote = plain(finding.sentence).slice(0, MAX_QUOTE);

  let found: string;
  let fix: string;
  if (moved) {
    found = `\`${finding.name}\` is declared in \`${finding.movedToNamespace}\`${
      finding.movedToPath ? ` (\`${finding.movedToPath}\`)` : ""
    }, not where the document puts it.`;
    fix = `Update the package or path the document gives for \`${simple}\` so it matches where the code declares it.`;
  } else if (renamed) {
    found = `The type is now spelled \`${finding.renamedTo}\`${
      finding.renamedToPath ? `, declared in \`${finding.renamedToPath}\`` : ""
    }; the document still writes the old name.`;
    fix = `Replace \`${simple}\` with \`${finding.renamedTo}\` in this passage, and check that any code sample around it still reads correctly.`;
  } else {
    found = `Nothing on \`${branch}\` declares \`${finding.name}\`.${
      finding.historicalPath ? ` The repository once had \`${finding.historicalPath}\` and does not now.` : ""
    }${
      finding.removedByUrl
        ? ` It was removed by ${finding.removedByUrl}${finding.removedByMessage ? ` ("${plain(finding.removedByMessage).slice(0, 120)}")` : ""}.`
        : ""
    }`;
    fix = `Rewrite or remove the part of the passage that describes \`${simple}\`, so the document describes the code as it is now. Do not recreate the type.`;
  }

  return [
    `Fix a stale name in the documentation of ${owner}/${repo} (branch \`${branch}\`).`,
    "",
    `Document: ${where}`,
    ...(quote ? ["The sentence:", `> ${quote}`] : []),
    "",
    `What was found: ${found}`,
    "",
    "Steps:",
    `1. Check the finding first. Search the current tree for \`${simple}\` as an exact token: a class, interface, enum, record or type in any language this repository uses, including generated, Kotlin or test sources. If it is declared where the document says, stop, change nothing, and report that the finding is wrong.`,
    `2. If the finding holds: ${fix}`,
    "3. Edit documentation only. Do not change source code.",
  ].join("\n");
}

/**
 * Instructions an agent can run as they are about a rule the code is not keeping.
 *
 * A broken rule says the doc and the code disagree, not which one is wrong, and the rule was read
 * from the sentence by a model. So the agent first checks whether the code really breaks what the
 * sentence says, and stops if it does not. Where the doc is what went out of date, it edits the
 * doc. Where the code moved away from a rule the doc still means, it changes no code: it reports
 * what broke it and proposes the fix, for a person to decide. How a change is shipped is the team's.
 *
 * @param owner the repository's owner
 * @param repo the repository's name
 * @param docPath the document the rule was read from
 * @param rule the rule and what was last said about it
 * @param branch the default branch where known
 * @return the prompt, as plain text
 */
export function brokenRulePrompt(
  owner: string,
  repo: string,
  docPath: string,
  rule: IssueRule,
  branch?: string | null
): string {
  const ref = branch || "the default branch";
  const where = `\`${docPath}\`${rule.sourceLine ? `, line ${rule.sourceLine}` : ""}`;
  const quote = plain(rule.quote).slice(0, MAX_QUOTE);
  const statement = plain(rule.statement);
  const happened =
    rule.status === "VIOLATED"
      ? `The code kept this rule before ${rule.pullNo ? `pull request #${rule.pullNo}` : "the last change checked"} and not after.`
      : `The code was already not keeping this rule when ${rule.pullNo ? `pull request #${rule.pullNo}` : "it was last checked"} was checked.`;

  return [
    `Check a rule that the documentation of ${owner}/${repo} states and the code may no longer keep (branch \`${ref}\`).`,
    "",
    `Document: ${where}`,
    ...(quote ? ["The sentence:", `> ${quote}`] : []),
    `The rule Striff read from it: ${statement}`,
    `What Striff found: ${happened}`,
    "",
    "Steps:",
    "1. Check the finding first. Read the sentence and the code it talks about on the current branch, and decide whether the code really breaks what the sentence says. The rule was read from the sentence automatically and may not say quite what the sentence means. If the code keeps what the sentence says, stop, change nothing, and report that the finding is wrong.",
    `2. If the code breaks it, work out which side is out of date.${rule.pullNo ? ` Read pull request #${rule.pullNo} to see whether the change was meant.` : ""}`,
    "3. If the code changed on purpose and the doc no longer describes it, edit the sentence so it describes the code as it is now. Edit documentation only.",
    "4. If the doc still describes what is intended and the code drifted from it, do not change any code. Report which change broke the rule and the smallest code change that would restore it.",
  ].join("\n");
}

/** Where an issue's footer points: the site, tagged so an issue that brings a reader back is counted. */
const DASHBOARD_LINK =
  "https://striff.io/?utm_source=github&utm_medium=issue&utm_campaign=dashboard_issue";

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
      ? `The code kept this rule before ${rule.pullNo ? `PR #${rule.pullNo}` : "the last change checked"} and not after${rule.judgedAtMs ? `, checked on ${on(rule.judgedAtMs)}` : ""}.`
      : `The code was already not keeping this rule when ${rule.pullNo ? `PR #${rule.pullNo}` : "it was last checked"} was checked${rule.judgedAtMs ? `, on ${on(rule.judgedAtMs)}` : ""}, so that change is not what broke it.`;

  const onBranch =
    rule.onDefaultBranch === "BROKEN"
      ? "On the default branch today, the code does not keep it."
      : rule.onDefaultBranch === "HOLDS"
      ? "On the default branch today, the code does keep it — so this may already be fixed."
      : rule.onDefaultBranch === "UNCLEAR"
      ? "Striff couldn't check how it stands on the default branch."
      : "It hasn't been checked against the default branch yet.";

  const body = [
    `A rule written in [\`${where}\`](${link}) is not being kept by the code.`,
    "",
    "### The sentence in the doc",
    quote ? `> ${quote}` : "_Striff kept no sentence for this rule._",
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
    `<sub>Opened from the [Striff dashboard](${DASHBOARD_LINK}).</sub>`,
  ].join("\n");

  const params = new URLSearchParams({ title, body });
  return `https://github.com/${owner}/${repo}/issues/new?${params}`;
}
