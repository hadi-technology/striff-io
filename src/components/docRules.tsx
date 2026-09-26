/**
 * What both views of a document's rules need: the words for an outcome, and the two ways a
 * customer's own text is put on screen.
 *
 * These lived in both tabs, byte for byte. A label changed in one and not the other is two views
 * calling the same status different things, which is the confusion the labels were rewritten to
 * end, reintroduced by copying.
 */
import { createElement, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * What the last pull request to judge a rule said about it.
 *
 * "Broken" and "already broken" answer different questions and were told apart by nothing but the
 * word "already": one is a rule this change broke, the other a rule the code was not keeping before
 * this change either. Saying "newly broken" puts the difference in the label rather than in a
 * footnote, and every pill and chip carries the longer sentence as its title.
 */
export const OUTCOME_LABEL: Record<string, string> = {
  MAINTAINED: "Held",
  VIOLATED: "Newly broken",
  PRE_EXISTING: "Already broken",
  RESTORED: "Restored",
  UNCLEAR: "Couldn't check",
};

export const OUTCOME_HELP: Record<string, string> = {
  MAINTAINED: "The code kept this rule when the pull request last checked it.",
  VIOLATED: "The pull request broke this rule: the code kept it before that change and not after.",
  PRE_EXISTING:
    "The code was already not keeping this rule before that pull request, so the change is not what broke it.",
  RESTORED: "The pull request fixed this rule: the code was not keeping it before, and does now.",
  UNCLEAR: "Striff could not tell, and says so rather than guessing either way.",
};

export const ON_BRANCH_LABEL: Record<string, string> = {
  HOLDS: "Holds on the default branch",
  BROKEN: "Broken on the default branch",
  UNCLEAR: "Couldn't check on the default branch",
};

/**
 * A sentence or a rule as the API sends it, with backticked names as code.
 *
 * The API writes a name the way the document did, in backticks; rendering them literally leaves
 * the marks on screen. Split rather than set HTML: the text is a customer's own document, and it
 * is never trusted as markup.
 */
export function withCode(text: string | null | undefined, term?: string) {
  if (!text) return null;
  return text.split(/`([^`]+)`/g).map((part, index) =>
    index % 2 === 1
      ? createElement("code", { key: index, className: "github-inline-code" },
          mark(part, term, `c${index}`))
      : mark(part, term, `p${index}`)
  );
}

/**
 * The text with every run of what someone is searching for marked.
 *
 * Every occurrence, not the first: a rule that says the same name twice was showing a reader one
 * of them. Case-insensitive, because nobody types the case of a package name. The text is split
 * and rebuilt as elements rather than wrapped in markup, for the same reason {@link withCode}
 * does: it is a customer's own document, and it is never trusted as HTML.
 *
 * @param text the text to show
 * @param term what is being searched for, already trimmed; empty or absent leaves the text alone
 * @param keyPrefix distinguishes the runs of one call from another's, for React's keys
 * @return the text, with the matches wrapped in <mark>
 */
export function mark(text: string, term?: string, keyPrefix = "m"): any {
  const needle = (term || "").trim().toLowerCase();
  if (!needle || !text) return text;
  const haystack = text.toLowerCase();
  const parts: any[] = [];
  let at = 0;
  let found = haystack.indexOf(needle);
  while (found >= 0) {
    if (found > at) parts.push(text.slice(at, found));
    parts.push(createElement("mark", { key: `${keyPrefix}-${found}` },
        text.slice(found, found + needle.length)));
    at = found + needle.length;
    found = haystack.indexOf(needle, at);
  }
  if (at === 0) return text;
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

export function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A window of text around what was searched for.
 *
 * A result that matched on text the list does not show reads as a result that should not be there.
 * Where the match is in a long sentence, this cuts a window around it so the reader sees the words
 * that matched rather than the first ninety characters of something else.
 *
 * @param text the text the match was found in
 * @param term what was searched for
 * @param radius how much of the sentence to keep either side of the match
 * @return the window, with an ellipsis where it was cut
 */
export function snippet(text: string, term?: string, radius = 45): string {
  const needle = (term || "").trim().toLowerCase();
  if (!needle || !text) return text;
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return text;
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + needle.length + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/**
 * A cell that stops after a few lines, and opens when there is more.
 *
 * A rule's sentence is a customer's own prose and can be a paragraph. Left alone, one long
 * sentence sets the height of its row and pushes everything after it off the screen, so a table of
 * twenty rules reads as a table of four. Clamped, every row is the same shape and the long ones
 * say they have more.
 *
 * The toggle only appears where the text really is cut: measured after layout, against the clamped
 * height, so a two-line sentence carries no affordance it does not need. On paper nothing is
 * clamped -- a printed page has no way to expand anything.
 *
 * @param lines how many lines to show before cutting
 * @param children the cell's content
 */
export function Clamped({ lines = 3, children }: { lines?: number; children: any }) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element || open) return;
    // A couple of pixels of slack: sub-pixel line heights make an uncut cell look cut.
    setCut(element.scrollHeight - element.clientHeight > 2);
  }, [children, open, lines]);

  return (
    <div className="clamp-wrap">
      <div
        ref={body}
        className={`clamp${open ? " is-open" : ""}`}
        style={{ ["--clamp-lines" as any]: String(lines) }}
      >
        {children}
      </div>
      {(cut || open) && (
        <button type="button" className="clamp-toggle" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * Looks again, while there is something to wait for.
 *
 * Work that fills these pages — listing a repository, reading it — happens on a queue and finishes
 * whenever it finishes. A page that asked for it and then sat still is a page someone has to
 * refresh to find out anything, and a page that polls forever is a page that costs something for
 * nobody.
 *
 * So: while {@code active}, look every few seconds; stop the moment it is not; give up after
 * {@code untilMs} because work that has taken that long is not going to be answered by asking
 * again; and never look while the tab is hidden, since nobody is reading it. The caller's job is
 * to make {@code active} false once the thing arrives, and to make its own reload harmless — this
 * only decides when to call it.
 *
 * @param active whether there is still something to wait for
 * @param look what to do each time; the latest one given is always the one called
 * @param everyMs how often to look
 * @param untilMs how long to keep looking before giving up
 */
export function useWatch(
  active: boolean,
  look: () => void,
  everyMs = 5000,
  untilMs = 180000,
  onGiveUp?: () => void
) {
  const latest = useRef(look);
  latest.current = look;
  const gaveUp = useRef(onGiveUp);
  gaveUp.current = onGiveUp;

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > untilMs) {
        window.clearInterval(timer);
        // Watching stopped, and the page has to say so. Going quiet leaves someone looking at a
        // spinner that will never resolve, wondering whether anything is happening at all.
        gaveUp.current?.();
        return;
      }
      if (!document.hidden) latest.current();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs, untilMs]);
}
