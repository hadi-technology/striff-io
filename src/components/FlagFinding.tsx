import { useEffect, useId, useRef, useState } from "react";

/** The Netlify form the flags are sent to; its fields are registered by a static copy in dashboard.astro. */
export const FLAG_FORM = "finding-flag";

/** The longest message a flag carries. */
const MAX_MESSAGE = 500;

/** What a flag says about the finding it is on, beside the reader's message. */
export interface Flagged {
  /** "rule" or "stale-name". */
  kind: "rule" | "stale-name";
  /** The repository, as owner/name. */
  repo: string;
  /** The doc the finding is in. */
  doc: string;
  /** The line of the doc, where known. */
  line: number | null;
  /** The rule as Striff states it, or the stale name. */
  finding: string;
  /** How it stands: holds, broken, already broken, gone, moved and so on. */
  standing: string;
  /** The rule's id, where it has one. */
  id?: string | null;
}

/**
 * A quiet flag on one finding, for a reader who thinks Striff got it wrong.
 *
 * It opens a small form with an optional message and sends it to the team as a Netlify form, then
 * thanks the reader. In the demo it thanks the reader without sending anything: the finding is
 * made up, and a flag on it would reach the team as noise.
 */
export default function FlagFinding({ flagged, demo = false }: { flagged: Flagged; demo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"editing" | "sending" | "sent" | "failed">("editing");
  const [message, setMessage] = useState("");
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();
  const label = flagged.kind === "rule" ? "Flag this rule" : "Flag this stale name";

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    button.current?.focus();
    // A sent flag is not offered again as a blank form the moment it closes.
    setState((now) => (now === "sent" ? "sent" : "editing"));
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    if (demo) {
      setState("sent");
      return;
    }
    const body = new URLSearchParams({
      "form-name": FLAG_FORM,
      kind: flagged.kind,
      repo: flagged.repo,
      doc: flagged.doc,
      line: flagged.line == null ? "" : String(flagged.line),
      finding: flagged.finding,
      standing: flagged.standing,
      id: flagged.id || "",
      message: message.trim().slice(0, MAX_MESSAGE),
      page: window.location.origin + window.location.pathname,
      "bot-field": "",
    });
    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      setState(response.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="finding-flag">
      <button
        ref={button}
        type="button"
        className={`finding-flag-button${state === "sent" ? " is-sent" : ""}`}
        aria-label={state === "sent" ? `${label}: sent` : label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={state === "sent" ? "Flagged. Thanks." : `${label} if Striff got it wrong`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill={state === "sent" ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 14V2.5" />
          <path d="M3.5 3h8l-1.75 3 1.75 3h-8" />
        </svg>
      </button>
      {open && (
        <div ref={panel} className="finding-flag-panel" role="dialog" aria-labelledby={titleId}>
          {state === "sent" ? (
            <div className="finding-flag-thanks" role="status">
              <p id={titleId}><b>Thanks for flagging this.</b></p>
              <p>Our team is looking into it.</p>
              <button type="button" className="finding-action" onClick={close}>Close</button>
            </div>
          ) : (
            <form onSubmit={send}>
              <p id={titleId} className="finding-flag-title">{label}</p>
              <p className="finding-flag-hint">Tell us what's wrong with it. Our team reads every flag.</p>
              <textarea
                ref={field}
                value={message}
                maxLength={MAX_MESSAGE}
                rows={3}
                placeholder="What's wrong? (optional)"
                aria-label="What's wrong with it (optional)"
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="finding-flag-foot">
                <span className="finding-flag-count" aria-hidden="true">{message.length}/{MAX_MESSAGE}</span>
                {state === "failed" && <span className="finding-flag-error" role="alert">Couldn't send. Try again.</span>}
                <button type="button" className="finding-action" onClick={close}>Cancel</button>
                <button type="submit" className="finding-action is-primary" disabled={state === "sending"}>
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </span>
  );
}
