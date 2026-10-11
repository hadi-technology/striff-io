/**
 * Whether a rule limits what the code may do, rather than stating what it has: "`AIReviewService`
 * may not depend on `LlmAgentClient`", "nothing in `web` may depend on `billing.internal`", "only
 * `billing` depends on `com.stripe`", "every class in `billing.providers` implements
 * `PaymentGateway`", "`Line` is internal to its module". These are the design
 * decisions a repository's docs set, the ones a new change can break, and a rules list starts with
 * them. Rules that state what is there ("`Cache` has a `get` method", "`A` depends on `B`") follow.
 *
 * It reads the rule as Striff words it, never the doc's sentence: the wording comes from a fixed
 * set of phrasings, where the sentence formats code however its author chose. Code names are
 * taken out first, quoted or not, so a type called `Only` or `NoOp` is never read as a word.
 *
 * Plain JavaScript so the node tests read the same answer the rules table orders by.
 *
 * @param {{ statement: string }} row
 * @returns {boolean}
 */
export function limitsTheCode(row) {
  const words = (row.statement || "")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\b[\w$]*[A-Z_.$][\w$.]*\b/g, (token) => (LIMIT_WORDS.test(token) ? token : " "));
  return LIMIT_PHRASE.test(words);
}

/** The words a limit is phrased with, as a whole word each. */
const LIMIT_PHRASE = /\b(may not|may only|must not|never|nothing|anything|only|no|every|is internal to)\b/i;

/** A capitalised word that is still one of those words, at the start of a rule: "Nothing", "Only", "Every". */
const LIMIT_WORDS = /^(Nothing|Anything|Only|No|Never|Every)$/;
