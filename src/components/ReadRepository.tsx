import { useEffect, useState } from "react";

/**
 * Asking Striff to read a whole repository now.
 *
 * Reading is otherwise lazy: a document is read the first time a pull request changes code it
 * names, which is right for cost and wrong for someone who has just connected a repository and
 * wants to see what it promises. This asks for all of it at once — parse the repository, read every
 * document, judge every rule against the default branch.
 *
 * It sits beside the counts, because those counts are what it changes: nine of twelve documents
 * read, and here is how the other three get read. A button of its own under the heading made a
 * repository look like it needed configuring.
 *
 * The work is a queued job of minutes, and this does not sit and watch it. A run reports nothing
 * until it is finished, so a live display of it is a spinner beside a clock: it costs a request
 * every few seconds, it tells a reader nothing they can act on, and it invites them to wait at a
 * page rather than go back to work. So the button carries its own state in its label, says once
 * that the answer arrives on a refresh, and gets out of the way:
 *
 * - documents waiting → "Read 3 docs now"
 * - asked for, or a run already going → the same button, greyed, "Read 3 docs now (reading…)"
 * - everything read → nothing at all, which is how a finished reading reports itself
 * - stopped, or going so long that nothing is coming → the button again, and why
 *
 * Being out of service has to survive a refresh, or it is not out of service. The run record is the
 * real answer and it says "queued" within the same request the press makes — but a reload in that
 * gap came back to a live button, and a live button is one somebody presses again, each press
 * queueing another reading of the same repository. So a press is also written down in this browser,
 * and the button stays out until the record takes over or the note goes stale.
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

/** A run the server has not finished with. */
export function isRunning(reading: Reading | null | undefined): boolean {
  return reading?.state === "queued" || reading?.state === "running";
}

/** How long a finished reading keeps saying what it found before the whole thing goes away. */
const JUST_FINISHED_MS = 3 * 60 * 1000;

/**
 * How long a press holds the button on this browser's word alone.
 *
 * Normally nothing like this long: the run record says "done" or "stopped" well before it, and
 * either of those releases the button. This is the backstop for a press the server took and then
 * never recorded, and it is deliberately long -- the cost of holding a button too long is someone
 * waiting, and the cost of releasing it too early is a second reading of the same repository,
 * which is the expensive mistake.
 */
const PRESS_HOLDS_MS = 10 * 60 * 1000;

/**
 * How long a run may claim to be going before this offers to start one again.
 *
 * Nothing here is watching, so a run that stopped without writing that it stopped would otherwise
 * leave the button greyed for the rest of the repository's life.
 */
const ABANDONED_MS = 20 * 60 * 1000;

function since(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)}h`;
}

/** Where a press is written down, per repository, so a reload does not undo it. */
function pressKey(repo: string): string {
  return `striff.reading.${repo}`;
}

function pressedAt(repo: string): number {
  try {
    return Number(window.localStorage.getItem(pressKey(repo))) || 0;
  } catch {
    // A browser that will not remember is not a reason to fail: the run record still answers.
    return 0;
  }
}

function rememberPress(repo: string, at: number) {
  try {
    if (at) {
      window.localStorage.setItem(pressKey(repo), String(at));
    } else {
      window.localStorage.removeItem(pressKey(repo));
    }
  } catch {
    // As above.
  }
}

export default function ReadRepository({
  repo,
  reading,
  waiting,
  read,
  busy,
  onRead,
}: {
  /** The repository this is about, so a press is remembered against the right one. */
  repo: string;
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
}) {
  // Read on mount, so a reload lands on the same answer the press left behind.
  const [asked, setAsked] = useState<number>(0);

  useEffect(() => {
    setAsked(pressedAt(repo));
  }, [repo]);

  // A finished run -- done, stopped, or declined -- is the end of the press that started it, and
  // the note goes. A run still going agrees with the note rather than replacing it: clearing on
  // "queued" is what handed the button back to anyone who reloaded, and a button handed back is a
  // second reading of the same repository.
  useEffect(() => {
    if (!reading) return;
    if (reading.state === "done" || reading.state === "failed" || reading.state === "skipped") {
      rememberPress(repo, 0);
      setAsked(0);
    }
  }, [repo, reading?.state, reading?.askedAtMs]);

  useEffect(() => {
    if (!asked) return;
    const left = asked + PRESS_HOLDS_MS - Date.now();
    if (left <= 0) {
      rememberPress(repo, 0);
      setAsked(0);
      return;
    }
    const giveUp = window.setTimeout(() => {
      rememberPress(repo, 0);
      setAsked(0);
    }, left);
    return () => window.clearTimeout(giveUp);
  }, [repo, asked]);

  // A run going far longer than a run takes is not a run any more.
  const abandoned = isRunning(reading) && Date.now() - (reading!.askedAtMs || 0) > ABANDONED_MS;
  const held = asked > 0 && Date.now() - asked < PRESS_HOLDS_MS;
  const inProgress = held || (isRunning(reading) && !abandoned);

  const stopped = reading?.state === "failed" || (abandoned && !held);
  const justFinished = reading?.state === "done"
    && reading.finishedAtMs > 0
    && Date.now() - reading.finishedAtMs < JUST_FINISHED_MS;
  const nothingToRead = waiting === 0 && read > 0;

  // Everything is read and nothing went wrong: there is no work to offer and nothing to report.
  // This is also how a reading that worked reports itself — the button it was pressed on is gone.
  if (nothingToRead && !stopped && !justFinished && !inProgress) {
    return null;
  }

  if (nothingToRead && justFinished && !inProgress) {
    return (
      <span className="read-repo">
        <span className="read-repo-note is-good">
          Read {since(reading!.finishedAtMs)} ago · {reading!.rulesJudged} rule
          {reading!.rulesJudged === 1 ? "" : "s"} judged
        </span>
      </span>
    );
  }

  // "Read 3" beside a count of documents read could be a count itself. It has to name what it does
  // to what, in the fewest words that still say it: read documents, here, now. While it runs, the
  // same words with the state in brackets — the button is the only thing that has to change, so it
  // is the only thing that does.
  // Two words, because there are two states worth telling apart. "asking…" was a third for the
  // fraction of a second between the press and the answer, and it survived a reload as a lie.
  const doing = reading?.state === "queued" ? "queued…" : "reading…";
  const offer = waiting > 0
    ? `Read ${waiting} doc${waiting === 1 ? "" : "s"} now`
    : "Read these docs now";
  const label = inProgress ? `${offer} (${doing})` : stopped ? "Try again" : offer;
  const help = inProgress
    ? "Striff is reading this repository. It takes a few minutes; refresh the page to see the rules."
    : waiting > 0
    ? "Reads the documents Striff has not read yet and checks every rule it finds against your default branch. Takes a few minutes."
    : "Reads every document in this repository and checks every rule it finds against your default branch. Takes a few minutes.";

  return (
    <span className="read-repo">
      <button
        type="button"
        className={`read-repo-button${stopped && !inProgress ? " is-bad" : ""}`}
        disabled={inProgress || !!busy}
        title={help}
        onClick={async () => {
          const at = Date.now();
          rememberPress(repo, at);
          setAsked(at);
          try {
            if ((await onRead()) === false) {
              rememberPress(repo, 0);
              setAsked(0);
            }
          } catch {
            rememberPress(repo, 0);
            setAsked(0);
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 3.5h4a2 2 0 0 1 2 2v7a1.6 1.6 0 0 0-1.6-1.6H2.5Z" />
          <path d="M13.5 3.5h-4a2 2 0 0 0-2 2v7a1.6 1.6 0 0 1 1.6-1.6h4.4Z" />
        </svg>
        {label}
      </button>
      {/* Said once, and not repeated by a clock: the reading finishes when it finishes, and this
          page finds out the next time it is loaded. */}
      {inProgress && (
        <span className="read-repo-note" role="status">
          Striff is reading. It takes a few minutes — refresh the page to see the rules.
        </span>
      )}
      {!inProgress && justFinished && (
        <span className="read-repo-note is-good">
          Read {since(reading!.finishedAtMs)} ago · {reading!.rulesJudged} rule
          {reading!.rulesJudged === 1 ? "" : "s"} judged
        </span>
      )}
      {!inProgress && reading?.state === "skipped" && (
        <span className="read-repo-note">{reading.reason}</span>
      )}
      {!inProgress && stopped && (
        <span className="read-repo-note is-bad">
          {reading?.state === "failed"
            ? `The last reading stopped: ${reading.reason || "no reason recorded"}`
            : "The last reading has been going far longer than a reading takes. You can ask for another."}
        </span>
      )}
    </span>
  );
}
