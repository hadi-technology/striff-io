import { useEffect, useRef, useState } from "react";

/**
 * What a reader can do with one finding: open it as an issue on GitHub, already written, and copy
 * a prompt an agent can run as it stands to fix it.
 *
 * The issue link is left out where the repository takes no issues, since GitHub answers it there
 * with a 404. In the demo the repository is made up, so the issue button says what it would do
 * rather than opening GitHub. Copying says whether it worked: a clipboard the browser refuses is
 * said, never passed off as copied.
 */
export default function FindingActions({
  issueUrl,
  prompt,
  demo = false,
}: {
  /** GitHub's new-issue page with this finding filled in, or null where the repository takes none. */
  issueUrl: string | null;
  /** The instructions for an agent, pasted as they are; no copy button without one. */
  prompt?: string;
  /** Whether the finding is the demo's, about a repository that does not exist on GitHub. */
  demo?: boolean;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [explained, setExplained] = useState(false);
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

  return (
    <span className="finding-actions">
      {issueUrl && !demo && (
        <a
          className="finding-action"
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Opens GitHub with an issue written out: the doc, the sentence, what the code has and what would close it."
        >
          {ISSUE_ICON}
          Open an issue
        </a>
      )}
      {issueUrl && demo && (
        <button
          type="button"
          className="finding-action"
          onClick={() => setExplained((open) => !open)}
          aria-expanded={explained}
        >
          {ISSUE_ICON}
          Open an issue
        </button>
      )}
      {prompt && <button
        type="button"
        className={`finding-action${copy === "copied" ? " is-done" : ""}${copy === "failed" ? " is-failed" : ""}`}
        onClick={copyPrompt}
        title="Copies instructions an agent such as Claude Code can run as they are: check the finding, fix the doc, open a pull request."
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
      {explained && (
        <span className="finding-action-note" role="note">
          In your repository, this opens a GitHub issue about it, already written: the sentence in
          the doc, what Striff found and what would close it.
        </span>
      )}
    </span>
  );
}

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
