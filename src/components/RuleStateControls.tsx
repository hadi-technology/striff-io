import { useEffect, useId, useRef, useState } from "react";

/** Why a control is off for a reader who is not the repository's owner or an admin. */
export const NOT_ADMIN = "Only the repository's owner and admins can change this.";

/** What an ignored rule says about why it is ignored. */
export const IGNORED_BY_HINT: Record<string, string> = {
  rule: "",
  document: "doc",
  folder: "folder",
  excluded: "excluded doc",
};

/**
 * One rule's switch between Active (checked on pull requests) and Ignored.
 *
 * A rule in an excluded doc has its switch off: it is not checked until the doc is included again,
 * and that is the doc's setting, not the rule's.
 */
export function RuleSwitch({
  ignored,
  ignoredBy,
  disabledReason,
  onToggle,
  compact = false,
}: {
  /** Whether it is the small switch beside a rule's pill, with no visible label; its state is in its title. */
  compact?: boolean;
  ignored: boolean;
  ignoredBy?: string | null;
  /** Why the switch cannot be used, or null where it can. */
  disabledReason: string | null;
  /** Called with the state asked for. */
  onToggle: (ignored: boolean) => void;
}) {
  const excluded = ignoredBy === "excluded";
  const reason = excluded ? "Ignored because the doc is excluded." : disabledReason;
  const title = reason
    ?? (ignored
      ? "Ignored: pull requests aren't checked against this rule. Click to check it again."
      : "Active: pull requests are checked against this rule. Click to ignore it.");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!ignored}
      aria-label={`Check pull requests against this rule: ${ignored ? "off" : "on"}`}
      className={`rule-switch${ignored ? " is-off" : ""}${compact ? " is-compact" : ""}`}
      disabled={!!reason}
      title={title}
      onClick={() => onToggle(!ignored)}
    >
      <span className="rule-switch-track" aria-hidden="true"><span className="rule-switch-knob" /></span>
      {!compact && <span className="rule-switch-label">{ignored ? "Ignored" : "Active"}</span>}
    </button>
  );
}

/**
 * Every rule under a doc, a folder or the repository, made ignored or active at once.
 *
 * Asks before it acts, in a small panel rather than the browser's own dialog, and says what the
 * setting does beyond the rules on the page: ignoring a path is a standing setting, so rules Striff
 * finds there later start ignored too.
 */
export function ScopeIgnore({
  total,
  ignored,
  where,
  disabledReason,
  onApply,
}: {
  /** The rules under this scope that can be changed. */
  total: number;
  /** How many of them are ignored now. */
  ignored: number;
  /** "this doc", "this folder" or "this repository". */
  where: string;
  disabledReason: string | null;
  /** Applies the change; resolves false where it was refused. */
  onApply: (ignored: boolean) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (asking === null) return;
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

  if (total === 0) return null;

  function close() {
    setAsking(null);
    button.current?.focus();
  }

  async function apply(next: boolean) {
    setBusy(true);
    const ok = await onApply(next);
    setBusy(false);
    if (ok) close();
  }

  const all = ignored === total;
  const none = ignored === 0;
  const label = all
    ? `All ${total} rules ignored`
    : none
      ? `Ignore all ${total} rule${total === 1 ? "" : "s"} here`
      : `${ignored} of ${total} rules ignored`;
  // Mixed offers both; otherwise the one change that does something.
  const next = all ? false : true;

  return (
    <span className="scope-ignore">
      <button
        ref={button}
        type="button"
        className={`finding-action scope-ignore-button${all ? " is-all" : none ? "" : " is-mixed"}`}
        aria-haspopup="dialog"
        aria-expanded={asking !== null}
        disabled={!!disabledReason || busy}
        title={disabledReason ?? (all ? `Make every rule in ${where} active again` : `Ignore every rule in ${where}`)}
        onClick={() => setAsking(asking === null ? next : null)}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" aria-hidden="true">
          {all ? <path d="M3 8.5l3 3 7-7" /> : <><circle cx="8" cy="8" r="5.5" /><path d="M4.2 11.8l7.6-7.6" /></>}
        </svg>
        {label}
      </button>
      {asking !== null && (
        <div ref={panel} className="finding-flag-panel scope-ignore-panel" role="dialog" aria-labelledby={titleId}>
          {!none && !all && (
            <p className="finding-flag-hint">{ignored} of the {total} rules in {where} {ignored === 1 ? "is" : "are"} ignored now.</p>
          )}
          {(none || !all) && (
            <>
              <p id={titleId} className="finding-flag-title">Ignore all {total} rule{total === 1 ? "" : "s"} in {where}?</p>
              <p className="finding-flag-hint">
                Pull requests won't be checked against them. Rules Striff finds here later will start
                ignored.
              </p>
            </>
          )}
          {all && (
            <>
              <p id={titleId} className="finding-flag-title">Make all {total} rule{total === 1 ? "" : "s"} in {where} active?</p>
              <p className="finding-flag-hint">All rules here will be checked on pull requests again.</p>
            </>
          )}
          <div className="finding-flag-foot">
            <button type="button" className="finding-action" onClick={close}>Cancel</button>
            {!none && !all && (
              <button type="button" className="finding-action" disabled={busy} onClick={() => apply(false)}>
                Make all active
              </button>
            )}
            <button type="button" className="finding-action is-primary" disabled={busy}
              onClick={() => apply(all ? false : true)}>
              {busy ? "Saving…" : all ? "Make all active" : "Ignore all"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
