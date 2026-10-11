import { useEffect, useId, useRef, useState } from "react";
import FloatingPanel from "./FloatingPanel";

/** Why a control is off for a reader who is not the repository's owner or an admin. */
export const NOT_ADMIN = "Only the repository's owner and admins can change this.";

/**
 * One rule's switch between Included (checked on pull requests) and Excluded.
 *
 * A rule whose doc is excluded has its switch off: nothing in that doc is read or checked until the
 * doc is included again, and that is the doc's setting, not the rule's.
 */
export function RuleSwitch({
  excluded,
  withDoc,
  disabledReason,
  onToggle,
  compact = false,
}: {
  /** Whether it is the small switch beside a rule's pill, with no visible label; its state is in its title. */
  compact?: boolean;
  excluded: boolean;
  /** Whether the rule is excluded because its doc, a folder above it or the repository is. */
  withDoc?: boolean;
  /** Why the switch cannot be used, or null where it can. */
  disabledReason: string | null;
  /** Called with the state asked for. */
  onToggle: (excluded: boolean) => void;
}) {
  const reason = withDoc ? "Excluded with its doc. Include the doc to change this rule." : disabledReason;
  const title = reason
    ?? (excluded
      ? "Excluded: pull requests aren't checked against this rule. Click to include it."
      : "Included: pull requests are checked against this rule. Click to exclude it.");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!excluded}
      aria-label={`Check pull requests against this rule: ${excluded ? "excluded" : "included"}`}
      className={`rule-switch${excluded ? " is-off" : ""}${compact ? " is-compact" : ""}`}
      disabled={!!reason}
      title={title}
      onClick={() => onToggle(!excluded)}
    >
      <span className="rule-switch-track" aria-hidden="true"><span className="rule-switch-knob" /></span>
      {!compact && <span className="rule-switch-label">{excluded ? "Excluded" : "Included"}</span>}
    </button>
  );
}

/**
 * A doc, a folder or the repository, excluded or included again, from its header.
 *
 * Asks before it acts, in a small panel rather than the browser's own dialog, and says what the
 * setting does: an excluded path is not read, none of its rules is checked, and docs added under
 * it later are excluded too. Where a folder above is what excludes this one, the button names that
 * folder and including acts on it, since that is the setting to take back.
 */
export function ScopeExclude({
  excluded,
  via,
  stillRead = false,
  rules,
  kind,
  where,
  disabledReason,
  onApply,
}: {
  /** Whether this path is excluded, by its own setting or one above it. */
  excluded: boolean;
  /** The folder above that excludes it, as a reader names it ("docs/drafts/", "the repository"); null where it is its own setting. */
  via: string | null;
  /**
   * Whether it is held only by a rule-state entry from before exclusion covered it: Striff never
   * stopped reading it, only checking its rules.
   */
  stillRead?: boolean;
  /** How many rules Striff has under it, for what the panel says. */
  rules: number;
  kind: "doc" | "folder" | "repository";
  /** "this doc", "docs/adr/" or "this repository". */
  where: string;
  disabledReason: string | null;
  /** Applies the change; resolves false where it was refused. */
  onApply: (excluded: boolean) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    if (!asking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    panel.current?.querySelector<HTMLButtonElement>("button.is-primary")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [asking]);

  function close() {
    setAsking(false);
    button.current?.focus();
  }

  async function apply() {
    if (disabledReason) return;
    setBusy(true);
    const ok = await onApply(!excluded);
    setBusy(false);
    if (ok) close();
  }

  const target = via ?? where;
  const ruleWords = `${rules} rule${rules === 1 ? "" : "s"}`;
  const label = !excluded
    ? kind === "doc" ? "Exclude this doc" : kind === "folder" ? "Exclude folder" : "Exclude repository"
    : via ? `Excluded with ${via}` : "Excluded · Include again";
  const what = kind === "doc"
    ? "Striff won't read it"
    : kind === "folder"
      ? "Striff won't read any doc under it, including docs added later"
      : "Striff won't read any doc in it, including docs added later";

  return (
    <span className="scope-exclude">
      <button
        ref={button}
        type="button"
        className={`finding-action scope-exclude-button${excluded ? " is-excluded" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={asking}
        // Still focusable where the reader may not use it, so a screen reader reaches the reason.
        aria-disabled={disabledReason ? true : undefined}
        aria-describedby={disabledReason ? reasonId : undefined}
        disabled={busy}
        title={disabledReason ?? (excluded ? `Include ${target} again` : `Exclude ${where}`)}
        onClick={() => { if (!disabledReason) setAsking(!asking); }}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" />
        </svg>
        {label}
      </button>
      {disabledReason && <span id={reasonId} className="sr-only">{disabledReason}</span>}
      {asking && (
        <FloatingPanel anchor={button} panelRef={panel} className="finding-flag-panel scope-exclude-panel" role="dialog" aria-labelledby={titleId}>
          {excluded ? (
            <>
              <p id={titleId} className="finding-flag-title">Include {target} again?</p>
              <p className="finding-flag-hint">
                {via
                  ? `This ${kind === "doc" ? "doc" : "folder"} is excluded because ${via} is. Including ${via} ${stillRead ? "has pull requests checked against every rule under it again" : "brings back every doc under it"}.`
                  : stillRead
                    ? "Striff has kept reading it; pull requests are checked against its rules again."
                    : "Striff reads it again on the next pull request that changes code it talks about, and pull requests are checked against its rules again."}
              </p>
            </>
          ) : (
            <>
              <p id={titleId} className="finding-flag-title">Exclude {where}?</p>
              <p className="finding-flag-hint">
                {what}, and pull requests won't be checked against {kind === "repository" ? "any" : "the"}{" "}
                {ruleWords} {kind === "doc" ? "in it" : "there"}. It stays excluded until you include it again.
              </p>
            </>
          )}
          <div className="finding-flag-foot">
            <button type="button" className="finding-action" onClick={close}>Cancel</button>
            <button type="button" className="finding-action is-primary" disabled={busy} onClick={apply}>
              {busy ? "Saving…" : excluded ? "Include again" : "Exclude"}
            </button>
          </div>
        </FloatingPanel>
      )}
    </span>
  );
}
