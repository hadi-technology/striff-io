/**
 * What both views of a document's rules need: the words for an outcome, and the two ways a
 * customer's own text is put on screen.
 *
 * These lived in both tabs, byte for byte. A label changed in one and not the other is two views
 * calling the same status different things, which is the confusion the labels were rewritten to
 * end, reintroduced by copying.
 */
import { createElement } from "react";

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
export function withCode(text: string | null | undefined) {
  if (!text) return null;
  return text.split(/`([^`]+)`/g).map((part, index) =>
    index % 2 === 1
      ? createElement("code", { key: index, className: "github-inline-code" }, part)
      : part
  );
}

export function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
