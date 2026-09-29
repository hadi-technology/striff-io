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
 * The work is a queued job of minutes. A run used to report nothing until it had finished, so
 * there was nothing to watch and this did not: a live display of it would have been a spinner
 * beside a clock. A run now records the documents it has read every few documents, so the page
 * that holds this looks again while one is going, and this says how far it has got:
 *
 * - documents waiting → "Read 3 docs now"
 * - asked for, or a run already going → no button, and "In progress" beside a dot that pulses,
 *   with how many of its documents are read once the run has counted them. A greyed button still
 *   read as something to press, and its label as an offer still open.
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
  /** Documents the run set out to read; zero or absent where it has not counted them. */
  docsTotal?: number;
  /** Documents of those read and recorded so far. A run records each few as it reads them. */
  docsDone?: number;
  /** The documents being read now; empty between steps. */
  readingPaths?: string[];
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
 * A run that stopped without writing that it stopped would otherwise keep the button away for the
 * rest of the repository's life. As long as the server believes a run is in flight, which is
 * longer than a parse of a large repository and every step of a reading take together.
 */
const ABANDONED_MS = 30 * 60 * 1000;

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

  // A reading that has been asked for is a state, not an offer, so it is not drawn as a button.
  // Queued and reading are told apart in the title and not in the words: both are "it is on its
  // way and there is nothing for you to do", which is the whole of what the page can say.
  if (inProgress) {
    return (
      <span className="read-repo">
        <span
          className="read-repo-progress"
          role="status"
          title={reading?.state === "queued"
            ? "This reading is queued behind other work and starts on its own."
            : "Striff is reading this repository."}
        >
          <span className="read-repo-pulse" aria-hidden="true" />
          In progress
          {/* Only once the run has counted its documents: before that it is parsing the
              repository, and "0 of 0" would be a number about nothing. */}
          {(reading?.docsTotal || 0) > 0 && (
            <span className="read-repo-count">
              {reading!.docsDone || 0} of {reading!.docsTotal} docs
            </span>
          )}
        </span>
        <span className="read-repo-note">
          {(reading?.docsTotal || 0) > 0
            ? "Documents and their rules appear here as they are read."
            : "Striff is reading the code first. Documents appear here as they are read."}
        </span>
      </span>
    );
  }

  // "Read 3" beside a count of documents read could be a count itself. It has to name what it does
  // to what, in the fewest words that still say it: read documents, here, now.
  const offer = waiting > 0
    ? `Read ${waiting} doc${waiting === 1 ? "" : "s"} now`
    : "Read these docs now";
  const label = stopped ? "Try again" : offer;
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
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          {reading?.state === "failed"
            ? `The last reading stopped: ${reading.reason || "no reason recorded"}`
            : "The last reading has been going far longer than a reading takes. You can ask for another."}
        </span>
      )}
    </span>
  );
}
