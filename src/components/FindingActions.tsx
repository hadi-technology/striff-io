import { useEffect, useRef, useState } from "react";
import { issueView, type FindingIssue } from "./findingIssue.ts";

/**
 * What a reader can do with one finding: open it as an issue on GitHub, already written, and copy
 * a prompt an agent can run as it stands to fix it.
 *
 * The issue link is left out where the repository takes no issues, since GitHub answers it there
 * with a 404. In the demo the repository is made up, so the issue button says what it would do
 * rather than opening GitHub. Copying says whether it worked: a clipboard the browser refuses is
 * said, never passed off as copied.
 *
 * A finding already tracked in an open issue shows that issue in place of the button. One whose
 * issue was closed shows the button again with a note, and where it was closed as not planned,
 * offers to ignore the rule instead. Read-only, as on a public page, it shows only the issue.
 */
export default function FindingActions({
  issueUrl,
  prompt,
  demo = false,
  issue = null,
  readOnly = false,
  onIgnore = null,
}: {
  /** GitHub's new-issue page with this finding filled in, or null where the repository takes none. */
  issueUrl: string | null;
  /** The instructions for an agent, pasted as they are; no copy button without one. */
  prompt?: string;
  /** Whether the finding is the demo's, about a repository that does not exist on GitHub. */
  demo?: boolean;
  /** The issue the finding is tracked in, as the server reports it; absent where none is known. */
  issue?: FindingIssue | null;
  /** Whether the reader can only look, as on a public page: the issue shows, the buttons do not. */
  readOnly?: boolean;
  /** Ignores the rule, where a closed-as-not-planned issue makes that the likelier wish. */
  onIgnore?: (() => void) | null;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [explained, setExplained] = useState<null | "open" | "tracked">(null);
  // Opening the form is not filing an issue: until the server links one, this is only a hint.
  const [opened, setOpened] = useState(false);
  const tracked = issueView(issue);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (reset.current) clearTimeout(reset.current);
  }, []);

  async function copyPrompt() {
    if (!prompt) return;
    const ok = await toClipboard(prompt);
    setCopy(ok ? "copied" : "failed");
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopy("idle"), 2200);
  }

  const offerIssue = !!issueUrl && !readOnly && tracked.kind !== "open";
  if (readOnly && tracked.kind === "none") return null;

  return (
    <span className="finding-actions">
      {tracked.kind === "open" && !demo && (
        <a
          className="finding-action is-tracked"
          href={tracked.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Tracked in issue #${tracked.number} on GitHub`}
        >
          {TRACKED_ICON}
          Issue #{tracked.number}
        </a>
      )}
      {tracked.kind === "open" && demo && (
        <button
          type="button"
          className="finding-action is-tracked"
          title={`Tracked in issue #${tracked.number} on GitHub`}
          onClick={() => setExplained((was) => (was === "tracked" ? null : "tracked"))}
          aria-expanded={explained === "tracked"}
        >
          {TRACKED_ICON}
          Issue #{tracked.number}
        </button>
      )}
      {offerIssue && !demo && (
        <a
          className="finding-action"
          href={issueUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpened(true)}
          title={opened
            ? "The form opened on GitHub. Once the issue is submitted, it shows here. Click to open another."
            : "Opens GitHub with an issue written out: the doc, the sentence, what the code has and what would close it."}
        >
          {ISSUE_ICON}
          {opened ? "Opened on GitHub · open another" : "Open an issue"}
        </a>
      )}
      {offerIssue && demo && (
        <button
          type="button"
          className="finding-action"
          onClick={() => setExplained((was) => (was === "open" ? null : "open"))}
          aria-expanded={explained === "open"}
        >
          {ISSUE_ICON}
          Open an issue
        </button>
      )}
      {!readOnly && prompt && <button
        type="button"
        className={`finding-action${copy === "copied" ? " is-done" : ""}${copy === "failed" ? " is-failed" : ""}`}
        onClick={copyPrompt}
        title="Copies instructions an agent such as Claude Code can run as they are: check the finding, then fix the doc."
        aria-live="polite"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copy === "copied"
            ? <path d="M3.5 8.5l3 3 6-7" />
            : <><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" /></>}
        </svg>
        {/* Both labels share one cell, so the button keeps its width when the label changes. */}
        <span className="finding-action-label">
          <span className={copy === "idle" ? undefined : "is-hidden"}>Copy agent prompt</span>
          <span className={copy === "idle" ? "is-hidden" : undefined}>
            {copy === "failed" ? "Couldn't copy" : "Copied"}
          </span>
        </span>
      </button>}
      {tracked.kind === "closed" && (
        <span className="finding-issue-note">
          {demo ? (
            <span>#{tracked.number}</span>
          ) : (
            <a href={tracked.url} target="_blank" rel="noopener noreferrer">#{tracked.number}</a>
          )}
          {tracked.notPlanned ? " closed as not planned" : " was closed"}
          {tracked.notPlanned && onIgnore && !readOnly && (
            <>
              {" · "}
              <button type="button" className="finding-issue-ignore" onClick={onIgnore}
                title="Pull requests won't be checked against this rule. You can switch it back on.">
                Ignore this rule?
              </button>
            </>
          )}
        </span>
      )}
      {explained === "open" && (
        <span className="finding-action-note" role="note">
          In your repository, this opens a GitHub issue about it, already written: the sentence in
          the doc, what Striff found and what would close it. Once it's submitted, it shows here in
          place of this button.
        </span>
      )}
      {explained === "tracked" && (
        <span className="finding-action-note" role="note">
          In your repository, this opens the GitHub issue this finding is tracked in.
        </span>
      )}
    </span>
  );
}

/** GitHub's open-issue mark, in pink: the finding is tracked. */
const TRACKED_ICON = (
  <svg className="finding-tracked-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="8" cy="8" r="1.6" fill="currentColor" />
  </svg>
);

const ISSUE_ICON = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

/** Puts text on the clipboard, falling back to a selected textarea where the async API is refused. */
async function toClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (permissions, an unfocused document): the older path below may still work.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
