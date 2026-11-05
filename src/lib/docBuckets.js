import { coveringPath } from "./ruleStates.js";

/**
 * The document chips other than "All" partition the documents: each document is in exactly one,
 * so their counts add up to the repository's document total. A document excluded (by Striff, by
 * its own saying that it is no longer current, or by the owner) is only Excluded, whatever its
 * state; of the rest, a state wins over rules; and a read document is With rules or No rules by the
 * rules the table lists for it.
 *
 * Plain JavaScript so the node tests read the same answer the page shows.
 *
 * @param {{ state: string }} doc
 * @param {boolean} excluded whether the doc is one of {@link excludedDocPaths}
 * @param {boolean} withRules whether the table lists rules for it
 * @returns {"excluded" | "notRead" | "unreadable" | "results" | "noRules"}
 */
export function docBucket(doc, excluded, withRules) {
  if (excluded || doc.state === "RETIRED") return "excluded";
  if (doc.state === "NOT_READ" || doc.state === "OUTSIDE_FIRST_READING") return "notRead";
  if (doc.state === "UNREADABLE") return "unreadable";
  return withRules ? "results" : "noRules";
}

/**
 * The documents excluded: from reading by the owner or by Striff's own screens, one that says it
 * is no longer current, or (from before exclusion covered it) set aside as a whole in the rule
 * states. One word for all of them, since either way none of their rules is checked.
 *
 * @param {{ path: string, state: string }[]} docs
 * @param {{ path: string, prefix?: boolean }[] | undefined} legacyPaths
 * @returns {Set<string>}
 */
export function excludedDocPaths(docs, legacyPaths) {
  const paths = new Set();
  for (const doc of docs) {
    if (doc.state === "EXCLUDED" || doc.state === "SCREENED_OUT" || doc.state === "RETIRED"
      || coveringPath(doc.path, legacyPaths)) paths.add(doc.path);
  }
  return paths;
}
