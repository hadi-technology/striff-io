import { useEffect, useRef, useState } from "react";

/**
 * Asking Striff to read a whole repository now, and watching it happen.
 *
 * Reading is otherwise lazy: a document is read the first time a pull request changes code it
 * names, which is right for cost and wrong for someone who has just connected a repository and
 * wants to see what it promises. This asks for all of it at once — parse the repository, read every
 * document, judge every rule against the default branch.
 *
 * The work is a queued job of minutes, so the button is not the interesting part; the state is.
 * What it offers depends on what there is to do:
 *
 * - nothing read yet → "Read this repository now"
 * - some documents waiting → "Read the N docs waiting"
 * - everything read → "Re-check against main", quietly, because there is little to gain
 * - asked for, not started → "Waiting its turn", with how long
 * - reading → "Reading…", with how long
 * - finished → what it found, and when another may be asked for
 *
 * A reading costs a parse and a model call per document, so the API rate-limits it. The button says
 * when the next one is allowed rather than letting someone click into a refusal.
 */

export interface Reading {
  state: string;
  askedBy: string | null;
  askedAtMs: number;
  startedAtMs: number;
  finishedAtMs: number;
  rulesJudged: number;
  reason: string | null;
  canAskAgainAtMs: number;
}

/** A run that has not stopped is one worth watching. */
export function isRunning(reading: Reading | null | undefined): boolean {
  return reading?.state === "queued" || reading?.state === "running";
}

function since(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)}h`;
}

function until(ms: number): string {
  const minutes = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function ReadRepository({
  reading,
  waiting,
  read,
  busy,
  onRead,
}: {
  /** Where the last reading got to, null where none was ever asked for. */
  reading: Reading | null;
  /** Documents Striff can read here that it has not read. */
  waiting: number;
  /** Documents whose rules it holds. */
  read: number;
  /** Whether another request is in flight from this page. */
  busy?: boolean;
  /** Asks for a reading; resolves when the API has taken the request. */
  onRead: () => void;
}) {
  // Re-rendered on a timer only while something is running, so "23s" does not go stale in front of
  // someone watching it, and nothing ticks on a page where nothing is happening.
  const [, setTick] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!isRunning(reading)) return;
    timer.current = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [reading?.state]);

  if (isRunning(reading)) {
    const started = reading!.state === "running";
    return (
      <span className="read-repo is-running" role="status" aria-live="polite">
        <span className="read-repo-spinner" aria-hidden="true" />
        {started
          ? `Reading this repository… ${since(reading!.startedAtMs)}`
          : `Queued to read… ${since(reading!.askedAtMs)}`}
      </span>
    );
  }

  const blockedUntil = reading?.canAskAgainAtMs && reading.canAskAgainAtMs > Date.now()
    ? reading.canAskAgainAtMs
    : 0;
  const label = waiting > 0
    ? `Read the ${waiting} doc${waiting === 1 ? "" : "s"} waiting`
    : read > 0
    ? "Re-check against main"
    : "Read this repository now";
  const help = waiting > 0
    ? "Reads every document Striff has not read yet and judges every rule against the default branch. Costs a model call per document."
    : read > 0
    ? "Everything here has been read. This judges every rule against the default branch again, and re-reads any doc edited since."
    : "Reads every document in this repository and judges the rules it finds against the default branch. Costs a model call per document.";

  return (
    <span className="read-repo">
      <button
        type="button"
        className={`read-repo-button${waiting > 0 || read === 0 ? " is-primary" : ""}`}
        disabled={!!busy || blockedUntil > 0}
        title={blockedUntil > 0
          ? `Striff read this repository recently. Another reading can be asked for in ${until(blockedUntil)}.`
          : help}
        onClick={onRead}
      >
        {label}
      </button>
      {reading?.state === "done" && reading.finishedAtMs > 0 && (
        <span className="read-repo-note">
          Read {since(reading.finishedAtMs)} ago · {reading.rulesJudged} rule
          {reading.rulesJudged === 1 ? "" : "s"} judged
        </span>
      )}
      {reading?.state === "skipped" && (
        <span className="read-repo-note">{reading.reason}</span>
      )}
      {reading?.state === "failed" && (
        <span className="read-repo-note is-bad">
          The last reading stopped: {reading.reason || "no reason recorded"}
        </span>
      )}
      {blockedUntil > 0 && reading?.state !== "failed" && (
        <span className="read-repo-note">Another can be asked for in {until(blockedUntil)}</span>
      )}
    </span>
  );
}
