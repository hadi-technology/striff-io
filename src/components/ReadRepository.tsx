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
 * The work is a queued job of minutes, and this does not sit and watch it: a page that reloads
 * itself every few seconds moves under whoever is reading it. A run records the documents it has
 * read every few documents, so what this says is how far the run had got when the page was
 * loaded, and a refresh is how a reader asks again:
 *
 * - documents waiting → "Read 3 docs now"
 * - asked for, or a run already going → no button, and "In progress" beside a dot that pulses,
 *   with how many documents are left to read. A greyed button still read as something to press,
 *   and its label as an offer still open.
 * - nothing waiting → nothing at all, which is how a finished reading reports itself; or, where
 *   there is a reason worth saying, that reason and no button
 * - stopped, or going so long that nothing is coming, with documents still waiting → the button
 *   again, and why
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
 * There is one gate, and it is the count beside the button: documents waiting to be read. That is
 * the documents nothing has read, and the read ones waiting to be read again -- after Striff changes
 * how it reads, say, a document is shown with the rules it last gave and is still work for a
 * reading. It is the same count the server refuses a reading on, and it has to be: gated on fewer,
 * the button hid exactly where a reading would have changed rules; gated on anything looser, it was
 * offered on a repository still being listed, on one with no documents, and on one in a language
 * Striff does not read, and pressing it was answered that every document had been read, which on
 * those repositories is false. A reading is expensive to serve -- a parse of the repository and a
 * model call for every document whose rules are not already held -- and what buys that is rules
 * that do not yet exist or are out of date. There used to be a second gate, a four-hour interval
 * since the branch was last judged, and it produced a contradiction anyone could see: the page
 * offered to read three documents and the run answered that the rules already carried a recent
 * reading. Both were true; neither was about those three documents, and merges move that clock
 * without a reader touching anything.
 *
 * Where there is nothing a reading could do and that needs saying -- the code is in a language
 * Striff does not read, or the server has just refused a reading for one of its reasons -- the
 * reason is said in the button's place, plainly, and there is no button.
 *
 * What it costs us is our problem and is not said out loud: the reader is told how long it takes,
 * which is what they can act on.
 *
 * A reading Striff starts on its own when the page is viewed is not one anybody asked for, so it is
 * never reported: no progress, no note when it finishes, no note when it stops. This behaves as if
 * there were no reading at all, and the offer stays for documents nothing has read.
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

/** Who asked for a reading Striff started by itself because the page was viewed. */
export const AUTOMATIC_READING = "Striff, when the page was viewed";

/** Whether nobody asked for this reading: Striff started it when the page was viewed. */
export function isAutomatic(reading: Reading | null | undefined): boolean {
  return reading?.askedBy === AUTOMATIC_READING;
}

/** The reading a page may report on: a reading somebody asked for, null for any other. */
export function askedReading(reading: Reading | null | undefined): Reading | null {
  return reading && !isAutomatic(reading) ? reading : null;
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
  reading: given,
  waiting,
  closed,
  busy,
  onRead,
}: {
  /** The repository this is about, so a press is remembered against the right one. */
  repo: string;
  /** Where the last reading got to, null where none was ever asked for. */
  reading: Reading | null;
  /**
   * Documents a reading would read: those nothing has read, and those waiting to be read again.
   * Zero wherever there is nothing for one to do, including a repository still being listed.
   */
  waiting: number;
  /**
   * Why a reading could do nothing here, said in the button's place; null where it might. Wins
   * over the count, since it is the server's answer or a fact about the code, and the count can be
   * a page load old.
   */
  closed?: string | null;
  /** Whether another request is in flight from this page. */
  busy?: boolean;
  /** Asks for a reading. Resolves false where the API refused it, so the control can recover. */
  onRead: () => void | boolean | Promise<boolean | void>;
}) {
  const reading = askedReading(given);
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
  const nothingToRead = waiting === 0 || !!closed;

  if (nothingToRead && justFinished && !inProgress) {
    return (
      <span className="read-repo">
        <span className="read-repo-note is-good">
          Read {since(reading!.finishedAtMs)} ago · {reading!.rulesJudged} rule
          {reading!.rulesJudged === 1 ? "" : "s"} checked
          {reading!.reason?.startsWith("Read in part") && (
            <span className="read-repo-part" title={reading!.reason}> · read in part</span>
          )}
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
            : (reading?.docsTotal || 0) > 0
            ? `Striff is reading this repository. It has been through ${reading!.docsDone || 0} of its ${reading!.docsTotal} documents, counting the ones it had already read.`
            : "Striff is reading this repository's code, and reads its documents next."}
        >
          <span className="read-repo-pulse" aria-hidden="true" />
          In progress
          {/* The number the button had, going down: documents nothing has read yet. How many of
              the repository's documents the run has been through was shown here and did not
              add up to anything beside it -- "13 of 73" under a button that had said 25, because
              the run passes over the documents already read as well. */}
          {waiting > 0 && (
            <span className="read-repo-count">
              {waiting} doc{waiting === 1 ? "" : "s"} left to read
            </span>
          )}
        </span>
        <span className="read-repo-note">Press Refresh to see what has been read since.</span>
      </span>
    );
  }

  // Nothing waits, so there is no work to offer. This is also how a reading that worked reports
  // itself, once its note has had its few minutes -- the button it was pressed on is gone. A
  // reading that stopped is not offered again here either: "Try again" on a repository where
  // nothing waits is a press the server refuses.
  if (nothingToRead) {
    return closed ? (
      <span className="read-repo">
        <span className="read-repo-note">{closed}</span>
      </span>
    ) : null;
  }

  // "Read 3" beside a count of documents read could be a count itself. It has to name what it does
  // to what, in the fewest words that still say it: read documents, here, now.
  const label = stopped ? "Try again" : `Read ${waiting} doc${waiting === 1 ? "" : "s"} now`;
  const help = "Reads the documents waiting to be read and checks every rule it finds against your default branch. Takes a few minutes.";

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
          {reading!.rulesJudged === 1 ? "" : "s"} checked
          {reading!.reason?.startsWith("Read in part") && (
            <span className="read-repo-part" title={reading!.reason}> · read in part</span>
          )}
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
