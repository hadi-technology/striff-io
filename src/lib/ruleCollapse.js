/**
 * Brings the rules of one sentence that say the same thing about different names into one line.
 *
 * One sentence ("never convert these files to use A or B") can yield a rule per function and
 * constant of every file it covers, and a sentence listing members ("X exposes a, b, c") a rule per
 * member. Each is one claim to a reader, so this says it once -- "`a`, `b`, `c` and 14 more may not
 * depend on `A` or `B`" -- and the table keeps every rule behind it.
 *
 * Presentation only. Nothing here changes a rule, its standing or its count; it reads the rules in
 * the order given and says which of them to show as one line.
 *
 * What may be brought together: rules of the same sentence, of one standing, with the same
 * pull-request verdict, exclusion and units, whose statements differ only in one name. A broken rule
 * is never brought together with another: each break is its own finding and keeps its own row.
 * A run shorter than {@link MIN_COLLAPSED} rules is left as it is.
 *
 * Plain JavaScript so the node tests read what the table shows.
 */

import { standing } from "./standing.js";

/** The fewest rules a line may stand for: a run shorter than this reads better as its own rows. */
export const MIN_COLLAPSED = 6;

/** How many names a collapsed line spells out; the rest are counted. */
export const LISTED_NAMES = 3;

/** First words of a statement that have a plural form, for a line that speaks of several subjects. */
const PLURAL_FIRST_WORD = {
  is: "are",
  has: "have",
  depends: "depend",
  imports: "import",
  calls: "call",
  uses: "use",
  declares: "declare",
  exposes: "expose",
  extends: "extend",
  implements: "implement",
  contains: "contain",
  returns: "return",
  references: "reference",
  holds: "hold",
};

/** First words that read the same for one subject or several. */
const INVARIANT_FIRST_WORD = new Set(["may", "must", "should", "can", "cannot", "never", "will", "shall"]);

/**
 * A statement split at its subject, its verb phrase and, where the verb phrase ends in one name, that
 * object. Null where the statement does not open with a single name of code.
 *
 * @param {string} statement
 * @returns {{ subject: string, verb: string, object: string } | null} `object` is empty where none
 */
export function parts(statement) {
  const subject = /^`([^`]+)`\s+(.+)$/s.exec(statement || "");
  if (!subject) return null;
  const rest = subject[2].trim();
  const object = /^([^`]*[^`\s])\s+`([^`]+)`$/s.exec(rest);
  return object
    ? { subject: subject[1], verb: object[1], object: object[2] }
    : { subject: subject[1], verb: rest, object: "" };
}

/** The verb phrase for several subjects, or null where it has no plural this knows. */
function plural(verb) {
  const first = verb.split(/\s+/, 1)[0].toLowerCase();
  if (INVARIANT_FIRST_WORD.has(first)) return verb;
  const swapped = PLURAL_FIRST_WORD[first];
  return swapped ? swapped + verb.slice(first.length) : null;
}

/** Whether the verb phrase denies something, so that a list of objects reads "or" and not "and". */
function negative(verb) {
  return /\b(not|never|no)\b/i.test(verb);
}

/** `a`, `b`, `c` and 14 more -- every name where there are few. */
function nameList(names, joiner) {
  const code = names.map((name) => `\`${name}\``);
  if (code.length <= LISTED_NAMES + 1) {
    return code.length === 1 ? code[0] : `${code.slice(0, -1).join(", ")} ${joiner} ${code[code.length - 1]}`;
  }
  return `${code.slice(0, LISTED_NAMES).join(", ")} and ${code.length - LISTED_NAMES} more`;
}

/**
 * What makes rules comparable: the sentence they came from and everything that decides the pill
 * beside them. Rules that differ in any of it are never one line.
 *
 * @param {object} row
 * @param {(row: object) => string} sentenceOf the key of the sentence a row came from
 */
function clusterKey(row, sentenceOf) {
  const units = Array.isArray(row.crossUnits) ? row.crossUnits.join(">") : "";
  return [
    sentenceOf(row),
    standing(row),
    row.excluded ? "excluded" : "",
    row.excludedBy || "",
    row.excludedWith || "",
    row.status || "",
    row.pullNo || "",
    row.onDefaultBranch || "",
    row.issue ? JSON.stringify(row.issue) : "",
    units,
  ].join("\u0000");
}

/**
 * The rows as lines to show, in the order given: each line is one row, or the rows one line stands
 * for, placed where the first of them was.
 *
 * @param {object[]} rows rules in display order, each with `statement`, `status`, `onDefaultBranch`
 * @param {(row: object) => string} sentenceOf the key of the sentence a row came from
 * @returns {{ rows: object[], text: string | null }[]} `text` is the line's statement, with names
 *     of code in backticks, and null for a rule shown as itself
 */
export function collapse(rows, sentenceOf) {
  /** @type {Map<string, object[]>} */
  const clusters = new Map();
  for (const row of rows) {
    const key = clusterKey(row, sentenceOf);
    clusters.set(key, [...(clusters.get(key) || []), row]);
  }
  /** @type {Map<object, { rows: object[], text: string }>} */
  const lineOf = new Map();
  for (const members of clusters.values()) {
    if (members.length < MIN_COLLAPSED || standing(members[0]) === "broken") continue;
    for (const line of linesOf(members)) {
      for (const row of line.rows) lineOf.set(row, line);
    }
  }
  const lines = [];
  const placed = new Set();
  for (const row of rows) {
    const line = lineOf.get(row);
    if (!line) {
      lines.push({ rows: [row], text: null });
    } else if (!placed.has(line)) {
      placed.add(line);
      // Each line keeps its rules in the order they were given.
      lines.push({ rows: rows.filter((one) => line.rows.includes(one)), text: line.text });
    }
  }
  return lines;
}

/** The lines one cluster of comparable rules can be said as, each standing for enough rules. */
function linesOf(members) {
  /** verb -> subject -> objects, in the order met. */
  const byVerb = new Map();
  for (const row of members) {
    const split = parts(row.statement);
    if (!split) continue;
    const subjects = byVerb.get(split.verb) || new Map();
    const objects = subjects.get(split.subject) || new Map();
    objects.set(split.object, row);
    subjects.set(split.subject, objects);
    byVerb.set(split.verb, subjects);
  }
  const lines = [];
  for (const [verb, subjects] of byVerb) {
    /** The subjects that have exactly the same objects, with those objects. */
    const bySet = new Map();
    for (const [subject, objects] of subjects) {
      const signature = [...objects.keys()].sort().join("\u0000");
      const group = bySet.get(signature) || { subjects: [], objects: [...objects.keys()] };
      group.subjects.push(subject);
      bySet.set(signature, group);
    }
    for (const group of bySet.values()) {
      const rowOf = (subject, object) => subjects.get(subject).get(object);
      const covered = group.subjects.length * group.objects.length;
      const joiner = negative(verb) ? "or" : "and";
      const objectText = group.objects.filter(Boolean).length
        ? ` ${nameList(group.objects.filter(Boolean), joiner)}`
        : "";
      if (group.subjects.length >= 2 && covered >= MIN_COLLAPSED) {
        const spoken = plural(verb);
        if (spoken === null) continue;
        lines.push({
          rows: group.subjects.flatMap((s) => group.objects.map((o) => rowOf(s, o))),
          text: `${nameList(group.subjects, "and")} ${spoken}${objectText}`,
        });
      } else if (group.objects.filter(Boolean).length >= MIN_COLLAPSED) {
        for (const subject of group.subjects) {
          lines.push({
            rows: group.objects.map((o) => rowOf(subject, o)),
            text: `\`${subject}\` ${verb}${objectText}`,
          });
        }
      }
    }
  }
  return lines;
}
