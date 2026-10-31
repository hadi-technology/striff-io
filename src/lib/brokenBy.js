/**
 * What a rule reported broken is broken by, as the page says it.
 *
 * The server hands over the witnesses of the verdict as it stored them. A witness is one of two
 * shapes: an edge between two names (`a.B -violates-> c.D`) or one name (`com.app.Service`). A
 * stored list can also hold a sentence that is not a witness, such as the note that a rule was
 * already broken before the change; anything of neither shape is left out here, so the page never
 * prints it, whichever server sent it. The server does not send a file or line for a witness, so
 * none is shown or linked, and no path is made from a name.
 *
 * Edges are grouped by the name they leave, so a name that breaks the rule in four places is one
 * line with four targets. A dotted name is shortened to its last two segments (`module.member`);
 * the full name stays in the element's title.
 */

/** `A -violates-> B` or `A -> B`: two names joined by an arrow. */
const EDGE = /^(\S+)\s+-[\w-]*>\s+(\S+)$/;

/** One name with no spaces. */
const NAME = /^\S+$/;

/** The most lines a rule lists before saying how many more there are. */
export const MOST_SHOWN = 3;

/** The most names one line points at before saying how many more there are. */
export const MOST_TARGETS = 3;

/**
 * @param {unknown} evidence a rule's `evidence`, absent from an older server
 * @returns {{ from: string, to: string | null }[]} the witnesses: edges and lone names, each once,
 *     in order
 */
export function witnesses(evidence) {
  if (!Array.isArray(evidence)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of evidence) {
    if (typeof raw !== "string") continue;
    const text = raw.replace(/\s+/g, " ").trim();
    if (seen.has(text)) continue;
    const edge = EDGE.exec(text);
    if (edge) out.push({ from: edge[1], to: edge[2] });
    else if (NAME.test(text)) out.push({ from: text, to: null });
    else continue;
    seen.add(text);
  }
  return out;
}

/**
 * @param {string} name a dotted name
 * @returns {string} its last two segments, or the name where it has fewer
 */
export function shortName(name) {
  const parts = name.split(".");
  return parts.length <= 2 ? name : parts.slice(-2).join(".");
}

/**
 * @param {unknown} evidence a rule's `evidence`
 * @returns {{ lines: { from: string, to: string[], moreTo: number }[], more: number }} the lines to
 *     show, at most {@link MOST_SHOWN}, each a name and the names it breaks the rule towards, and
 *     how many further lines were left off
 */
export function brokenBy(evidence) {
  const groups = new Map();
  for (const { from, to } of witnesses(evidence)) {
    if (!groups.has(from)) groups.set(from, []);
    if (to !== null && !groups.get(from).includes(to)) groups.get(from).push(to);
  }
  const all = [...groups].map(([from, to]) => ({
    from,
    to: to.slice(0, MOST_TARGETS),
    moreTo: Math.max(0, to.length - MOST_TARGETS),
  }));
  return { lines: all.slice(0, MOST_SHOWN), more: Math.max(0, all.length - MOST_SHOWN) };
}
