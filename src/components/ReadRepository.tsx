import { useEffect, useRef, useState } from "react";

/**
 * Asking Striff to read a whole repository now, and watching it happen.
 *
 * Reading is otherwise lazy: a document is read the first time a pull request changes code it
 * names, which is right for cost and wrong for someone who has just connected a repository and
 * wants to see what it promises. This asks for all of it at once — parse the repository, read every
 * document, judge every rule against the default branch.
 *
 * It sits beside the "read / extractable" count, because that count is what it changes: five of
 * eight documents read, and here is how the other three get read. A button of its own under the
 * heading made a repository look like it needed configuring.
 *
 * The work is a queued job of minutes, so the button is not the interesting part; the state is.
 * What it offers depends on what there is to do:
 *
 * - nothing read yet → "Read this repository now"
 * - some documents waiting → "Read the N docs waiting"
 * - everything read → nothing at all
 * - asked for, not started → "Queued to read 8 documents", with how long it has waited
 * - reading → "Reading 8 documents…", with how long it has been going
 * - just finished → what it found, for a few minutes, then nothing
 * - stopped → what went wrong, and a way to try again
 *
 * There is deliberately no standing "re-check" button. Once every document is read, the rules are
 * kept current by the work that is already happening: a pull request re-judges the rules its change
 * touches, and a merge carries its verdicts onto the branch for free. A button offering to do it
 * all again would be a button whose only use is spending money on an answer Striff mostly has, so
 * it goes away once its job is done.
 *
 * There is one gate, and it is the count beside the button: documents nothing has read. A reading
 * is expensive to serve -- a parse of the repository and a model call for every document whose
 * rules are not already held -- and what buys that is rules that do not yet exist. There used to be
 * a second gate, a four-hour interval since the branch was last judged, and it produced a
 * contradiction anyone could see: the page offered to read three documents and the run answered
 * that the rules already carried a recent reading. Both were true; neither was about those three
 * documents, and merges move that clock without a reader touching anything.
 *
 * What it costs us is our problem and is not said out loud: the reader is told how long it takes,
 * which is what they can act on.
 *
 * The count beside "Reading" is how many documents the run has to get through, not how many are
 * left. The catalogue only hears what a run read once the whole run is finished, so a number
 * presented as progress would sit still for minutes and read as a hang. The elapsed time is the
 * liveness signal; the count is the size of the job.
 */

export interface Reading {
  state: string;
  askedBy: string | null;
  askedAtMs: number;
  startedAtMs: number;
  finishedAtMs: number;
  rulesJudged: number;
  reason: string | null;
}

/** A run that has not stopped is one worth watching. */
export function isRunning(reading: Reading | null | undefined): boolean {
  return reading?.state === "queued" || reading?.state === "running";
}

/** How long a finished reading keeps saying what it found before the whole thing goes away. */
const JUST_FINISHED_MS = 3 * 60 * 1000;

/** How long a press waits for the run record to appear before it stops believing in it. */
const STUCK_MS = 45 * 1000;

function since(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)}h`;
}

export default function ReadRepository({
  reading,
  waiting,
  read,
  busy,
  stale,
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
  /** Asks for a reading. Resolves false where the API refused it, so the control can recover. */
  onRead: () => void | boolean | Promise<boolean | void>;
  /** Whether the page has stopped watching this run, so it must say to come back. */
  stale?: boolean;
}) {
  // Pressed, and not yet visible in the run record: the gap between the click and the first answer
  // is where someone presses again, and again, each press queueing another reading. The control
  // takes itself out of service the moment it is pressed and stays out until the record says
  // something — running, finished, or stopped.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!reading) return;
    if (isRunning(reading) || reading.state === "done" || reading.state === "failed"
        || reading.state === "skipped") {
      setAsked(false);
    }
  }, [reading?.state, reading?.askedAtMs]);
  // Insurance against a spinner with nothing behind it. The API writes the run record before it
  // answers, so a press that was taken shows up on the next load; if nothing has shown up after
  // this long, something went wrong that nobody told us about, and a control stuck saying
  // "asking..." for the rest of the session is worse than one that can be pressed again.
  useEffect(() => {
    if (!asked) return;
    const giveUp = window.setTimeout(() => setAsked(false), STUCK_MS);
    return () => window.clearTimeout(giveUp);
  }, [asked]);
  // Re-rendered on a timer only while something is running, so "23s" does not go stale in front of
  // someone watching it, and nothing ticks on a page where nothing is happening.
  const [, setTick] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const finishing = reading?.state === "done" && reading.finishedAtMs > 0
      && Date.now() - reading.finishedAtMs < JUST_FINISHED_MS;
    if (!isRunning(reading) && !finishing) return;
    timer.current = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [reading?.state, reading?.finishedAtMs]);

  if (asked || isRunning(reading)) {
    const started = reading?.state === "running";
    // How big the job is, said once. Not how much of it is done: the catalogue is only told what a
    // run read when the run ends, so a figure offered as progress would not move for minutes.
    const scope = waiting > 0
      ? `${waiting} document${waiting === 1 ? "" : "s"}`
      : null;
    const label = !isRunning(reading)
      ? "Asking Striff to read this repository…"
      : started
      ? scope ? `Reading ${scope}…` : "Reading…"
      : scope ? `Queued to read ${scope}` : "Queued to read…";
    const elapsed = started ? since(reading!.startedAtMs) : reading ? since(reading!.askedAtMs) : null;
    // Said early, because the count does not move and the clock is the only thing that does.
    const patience = stale
      ? "Striff is still at it. This page has stopped checking — refresh to see where it got to."
      : started && Date.now() - reading!.startedAtMs > 20_000
      ? "This takes a few minutes. You can leave the page; it keeps going without you."
      : null;
    return (
      <span className="read-repo is-running" role="status" aria-live="polite">
        <span className="read-repo-running-line">
          <span className="read-repo-spinner" aria-hidden="true" />
          <span className="read-repo-running-label" title={label}>{label}</span>
          {elapsed && <span className="read-repo-elapsed">{elapsed}</span>}
        </span>
        {patience && <span className="read-repo-note">{patience}</span>}
      </span>
    );
  }

  const stopped = reading?.state === "failed";
  const justFinished = reading?.state === "done"
    && reading.finishedAtMs > 0
    && Date.now() - reading.finishedAtMs < JUST_FINISHED_MS;
  const nothingToRead = waiting === 0 && read > 0;

  // Everything is read and nothing went wrong: there is no work to offer and nothing to report.
  if (nothingToRead && !stopped && !justFinished) {
    return null;
  }

  if (nothingToRead && justFinished) {
    return (
      <span className="read-repo">
        <span className="read-repo-note is-good">
          Read {since(reading!.finishedAtMs)} ago · {reading!.rulesJudged} rule
          {reading!.rulesJudged === 1 ? "" : "s"} judged
        </span>
      </span>
    );
  }

  // "Read 3" beside a count of documents read could be a count itself. It has to name what it
  // does to what, in the fewest words that still say it: read documents, here, now. The sentence
  // that explains why anyone would still lives in the title.
  const label = stopped
    ? "Try again"
    : waiting > 0
    ? `Read ${waiting} doc${waiting === 1 ? "" : "s"} now`
    : "Read these docs now";
  const help = waiting > 0
    ? "Reads the documents Striff has not read yet and checks every rule it finds against your default branch. Takes a few minutes."
    : "Reads every document in this repository and checks every rule it finds against your default branch. Takes a few minutes.";

  return (
    <span className="read-repo">
      <button
        type="button"
        className={`read-repo-button${stopped ? " is-bad" : ""}`}
        disabled={!!busy}
        title={help}
        onClick={async () => {
          setAsked(true);
          try {
            if ((await onRead()) === false) setAsked(false);
          } catch {
            setAsked(false);
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 3.5h4a2 2 0 0 1 2 2v7a1.6 1.6 0 0 0-1.6-1.6H2.5Z" />
          <path d="M13.5 3.5h-4a2 2 0 0 0-2 2v7a1.6 1.6 0 0 1 1.6-1.6h4.4Z" />
        </svg>
        {label}
      </button>
      {justFinished && (
        <span className="read-repo-note is-good">
          Read {since(reading!.finishedAtMs)} ago · {reading!.rulesJudged} rule
          {reading!.rulesJudged === 1 ? "" : "s"} judged
        </span>
      )}
      {reading?.state === "skipped" && (
        <span className="read-repo-note">{reading.reason}</span>
      )}
      {stopped && (
        <span className="read-repo-note is-bad">
          The last reading stopped: {reading!.reason || "no reason recorded"}
        </span>
      )}
    </span>
  );
}
