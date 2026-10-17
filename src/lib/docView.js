/**
 * The arithmetic behind a document's text view: which characters of it are drawn as what.
 *
 * Plain JavaScript so the node tests read the same answers the page shows. Everything here works
 * on UTF-16 offsets into the text exactly as Striff read it, which is what mdast positions and the
 * API's placements both count in.
 *
 * A highlight is a range `{ from, to, kind, id }` with `to` exclusive. Kinds, strongest first, are
 * `broken`, `stale`, `holds`, `unchecked`, `excluded`; a range of kind `tail` marks text past what
 * Striff read and is never a rule. Where ranges overlap the strongest kind is what is drawn and
 * every range at that spot is listed in the card.
 */
import { standing } from "./standing.js";

/** Strongest first: what is drawn where several highlights overlap. */
export const PRECEDENCE = ["broken", "stale", "holds", "unchecked", "excluded", "tail"];

const RANK = Object.fromEntries(PRECEDENCE.map((kind, index) => [kind, index]));

/** Orders ranges strongest first, and the first-placed first among equals. */
export function byStrength(a, b) {
  return (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) || a.from - b.from;
}

/**
 * How a rule is drawn, or null where it is not drawn at all.
 *
 * An excluded rule is drawn as excluded whatever its standing, since it is not checked. A rule
 * Striff could not judge says nothing about the code and is neither drawn nor listed.
 *
 * @param {{ excluded?: boolean, status: string | null, onDefaultBranch: string | null }} rule
 * @returns {"broken" | "holds" | "unchecked" | "excluded" | null}
 */
export function ruleKind(rule) {
  const s = standing(rule);
  if (s === "unclear") return null;
  if (rule.excluded) return "excluded";
  return s;
}

/** Whether a UTF-16 unit is the second half of a surrogate pair that starts before it. */
function splitsPair(text, at) {
  if (at <= 0 || at >= text.length) return false;
  const low = text.charCodeAt(at);
  const high = text.charCodeAt(at - 1);
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
}

/**
 * Ranges clipped to `[0, limit)`, with edges that would fall inside a character moved outside it,
 * and empty ones dropped.
 */
export function normalizeRanges(text, ranges, limit = text.length) {
  const out = [];
  for (const range of ranges) {
    let from = Math.max(0, range.from);
    let to = Math.min(limit, range.to);
    if (!(to > from)) continue;
    if (splitsPair(text, from)) from -= 1;
    if (splitsPair(text, to)) to += 1;
    out.push({ ...range, from, to });
  }
  return out;
}

/**
 * Cuts `[from, to)` at every edge of a range that falls inside it, and says which ranges cover each
 * piece, strongest first. Pieces tile the interval exactly.
 *
 * @returns {{ from: number, to: number, hits: object[], kind: string | null }[]}
 */
export function segments(from, to, ranges) {
  const hit = ranges.filter((range) => range.from < to && range.to > from);
  const cuts = new Set([from, to]);
  for (const range of hit) {
    if (range.from > from) cuts.add(range.from);
    if (range.to < to) cuts.add(range.to);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const hits = hit.filter((range) => range.from <= a && range.to >= b).sort(byStrength);
    out.push({ from: a, to: b, hits, kind: hits.length ? hits[0].kind : null });
  }
  return out;
}

/**
 * Where each character of a node's value sits in its source, or null where that cannot be told.
 *
 * A text node's value is not its source: escapes, entities and the prefixes of quoted or indented
 * lines are in the source and not the value. Every character of the value is found in order in the
 * source, and the position is kept. A value with a character the source does not hold (an entity
 * that decoded to something else) has no map, and the node is then drawn whole.
 *
 * @returns {number[] | null} for each value index, its index in `source`
 */
export function alignText(value, source) {
  const map = new Array(value.length);
  let j = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    while (j < source.length && source[j] !== ch) j++;
    if (j >= source.length) return null;
    map[i] = j;
    j++;
  }
  return map;
}

/** The first index in the ascending `map` whose entry is at least `x`. */
function lowerBound(map, x) {
  let lo = 0;
  let hi = map.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * A node's text cut at the highlights that cross it.
 *
 * @param {{ value: string, start: number, end: number, map: number[] | null }} node `start` is
 *     where the node begins in the text, `map` is {@link alignText} of its value against the
 *     source from `start`
 * @param {object[]} ranges
 * @returns {{ text: string, hits: object[], kind: string | null }[]} pieces that join back to the
 *     value; a node with no map is one piece carrying every range that touches it
 */
export function textSegments(node, ranges) {
  const { value, start, end, map } = node;
  const touching = ranges.filter((range) => range.from < end && range.to > start);
  if (!touching.length || value.length === 0) return [{ text: value, hits: [], kind: null }];
  if (!map) {
    const hits = [...touching].sort(byStrength);
    return [{ text: value, hits, kind: hits[0].kind }];
  }
  const cuts = new Set([0, value.length]);
  for (const range of touching) {
    for (const edge of [range.from, range.to]) {
      if (edge > start && edge < end) cuts.add(lowerBound(map, edge - start));
    }
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const probe = start + map[a];
    const hits = touching.filter((range) => range.from <= probe && range.to > probe).sort(byStrength);
    out.push({ text: value.slice(a, b), hits, kind: hits.length ? hits[0].kind : null });
  }
  return out;
}

/** Offsets at which each line of `text` begins; a final entry is `text.length + 1`. */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  starts.push(text.length + 1);
  return starts;
}

/**
 * The offsets of line `line` (counted from 1), without its line ending, or null where the text has
 * no such line.
 */
export function lineRange(text, line, starts = lineStarts(text)) {
  if (!Number.isInteger(line) || line < 1 || line > starts.length - 1) return null;
  const from = starts[line - 1];
  let to = starts[line] - 1;
  if (to > from && text.charCodeAt(to - 1) === 13) to -= 1;
  if (to > text.length) to = text.length;
  return { from, to: Math.max(from, to) };
}

/** Every node of a tree, parents first. */
export function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

function offsets(node) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  return start == null || end == null ? null : { from: start, to: end };
}

function covers(node, line) {
  const p = node.position;
  return !!p && p.start.line <= line && p.end.line >= line;
}

/**
 * The offsets a table row, a list item or a diagram line occupies, found in the parsed document by
 * the line the API names; the whole line where the tree has no such node there.
 *
 * @param {object | null} tree the parsed document, or null for a view with none
 * @param {string} text
 * @param {{ line: number, kind: "row" | "item" | "diagram" }} block
 * @returns {{ from: number, to: number } | null}
 */
export function blockRange(tree, text, block, starts = lineStarts(text)) {
  const whole = lineRange(text, block.line, starts);
  if (!tree) return whole;
  let found = null;
  if (block.kind === "row") {
    walk(tree, (node) => {
      if (node.type === "tableRow" && covers(node, block.line)) found = offsets(node);
    });
  } else if (block.kind === "item") {
    // The deepest item covering the line, for its own text and not its nested list's.
    let item = null;
    walk(tree, (node) => {
      if (node.type === "listItem" && covers(node, block.line)) item = node;
    });
    if (item) {
      const own = (item.children || []).filter((child) => child.type !== "list");
      const first = offsets(item);
      let end = first ? first.to : null;
      if (own.length) {
        end = Math.max(...own.map((child) => offsets(child)?.to ?? 0));
      } else if (item.children?.length && first) {
        end = offsets(item.children[0]).from;
      }
      if (first && end != null && end > first.from) found = { from: first.from, to: end };
    }
  } else if (block.kind === "diagram") {
    let code = null;
    walk(tree, (node) => {
      if (node.type === "code" && covers(node, block.line)) code = node;
    });
    // Only a line inside the fence is a diagram line; the fence itself is not.
    if (code && code.position.start.line < block.line && code.position.end.line > block.line) found = whole;
  }
  return found || whole;
}

/** Offsets of the parts of the tree that are parsed and not drawn. */
export function hiddenRanges(tree) {
  const hidden = [];
  walk(tree, (node) => {
    const gone = node.type === "definition" || node.type === "mdxjsEsm" || node.type === "yaml"
      || node.type === "toml" || node.type === "mdxFlowExpression" || node.type === "mdxTextExpression"
      || (node.type === "html" && /^\s*(<!--[\s\S]*?-->\s*)+$/.test(node.value || ""));
    const at = gone ? offsets(node) : null;
    if (at) hidden.push(at);
  });
  return hidden;
}

/**
 * Turns the API's placements into the ranges to draw, and the rules that have no place.
 *
 * Every rule given appears in exactly one of the two results: a rule the API left unplaced, one it
 * did not mention, and one whose every place is in text this view does not draw (an import line, a
 * comment) is unplaced. A rule that is not drawn at all (one Striff could not judge) is in neither.
 *
 * @param {{ text: string, tree: object | null, placements: object[], unplaced?: string[],
 *     rules: object[], readChars?: number | null }} input
 * @returns {{ ranges: object[], unplaced: object[], placed: object[] }}
 */
export function ruleRanges({ text, tree, placements, unplaced = [], rules, readChars = null }) {
  const limit = readChars != null && readChars < text.length ? readChars : text.length;
  const byId = new Map(rules.map((rule) => [rule.factId, rule]));
  const starts = lineStarts(text);
  const hidden = tree ? hiddenRanges(tree) : [];
  const never = new Set(unplaced);
  const out = [];
  const drawn = new Set();
  for (const placement of placements || []) {
    const rule = byId.get(placement.factId);
    const kind = rule ? ruleKind(rule) : null;
    if (!rule || !kind || never.has(placement.factId) || drawn.has(placement.factId)) continue;
    const found = [];
    for (const span of placement.spans || []) {
      if (Number.isInteger(span.from) && Number.isInteger(span.to)) found.push({ from: span.from, to: span.to });
    }
    let block;
    if (!found.length && placement.block && Number.isInteger(placement.block.line)) {
      const at = blockRange(tree, text, placement.block, starts);
      if (at) {
        found.push(at);
        block = placement.block.kind;
      }
    }
    const kept = normalizeRanges(text, found.map((r) => ({ ...r, kind, id: placement.factId, block })), limit)
      .filter((r) => !hidden.some((h) => h.from <= r.from && h.to >= r.to));
    if (kept.length) {
      drawn.add(placement.factId);
      out.push(...kept);
    }
  }
  const missing = rules.filter((rule) => ruleKind(rule) && !drawn.has(rule.factId));
  return { ranges: out, unplaced: missing, placed: rules.filter((rule) => drawn.has(rule.factId)) };
}

/** Whether `ch` could continue an identifier. */
function wordChar(ch) {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/**
 * The first place `name` stands alone in `line` as a whole token, or -1. A neighbouring letter,
 * digit or underscore means it is part of a longer name and does not count.
 */
export function tokenIndex(line, name) {
  if (!name) return -1;
  let at = line.indexOf(name);
  while (at >= 0) {
    if (!wordChar(line[at - 1]) && !wordChar(line[at + name.length])) return at;
    at = line.indexOf(name, at + 1);
  }
  return -1;
}

/**
 * Where a stale name is: on the line the finding names, the first whole-token occurrence of the
 * name there. A qualified name that is not written in full is looked for by its last part. Nothing
 * where the finding has no line, the line does not hold the name, or the place is past what was
 * read.
 *
 * @param {string} text
 * @param {{ name: string, docPath: string, sourceLine: number | null }[]} findings
 * @returns {object[]} ranges of kind `stale`, each with the finding it is for
 */
export function staleRanges(text, findings, readChars = null) {
  const starts = lineStarts(text);
  const limit = readChars != null && readChars < text.length ? readChars : text.length;
  const out = [];
  for (const finding of findings) {
    const at = finding.sourceLine ? lineRange(text, finding.sourceLine, starts) : null;
    if (!at) continue;
    const line = text.slice(at.from, at.to);
    let name = finding.name;
    let index = tokenIndex(line, name);
    if (index < 0 && name.includes(".")) {
      name = name.slice(name.lastIndexOf(".") + 1);
      index = tokenIndex(line, name);
    }
    if (index < 0) continue;
    const range = normalizeRanges(text, [{
      from: at.from + index,
      to: at.from + index + name.length,
      kind: "stale",
      id: `stale:${finding.docPath}:${finding.name}`,
      finding,
    }], limit);
    out.push(...range);
  }
  return out;
}

/**
 * How many of each kind a view shows, in the order the counts row lists them. Rules are counted
 * whether they are marked in the text or listed under it; a stale name only where it is marked.
 */
export function kindCounts(rules, stale) {
  const counts = { holds: 0, broken: 0, unchecked: 0, excluded: 0, stale: stale.length };
  for (const rule of rules) {
    const kind = ruleKind(rule);
    if (kind) counts[kind] += 1;
  }
  return counts;
}

/**
 * What a reader is told when the text of a document cannot be shown, and whether trying again can
 * help. A version that is no longer on GitHub is final: the same request would be answered the same.
 *
 * @param {string | null | undefined} reason one of the API's reasons, or a status the page made up
 * @returns {{ message: string, retry: boolean }}
 */
export function failureMessage(reason) {
  switch (reason) {
    case "CHANGED":
      return { message: "This version of the doc isn't on GitHub any more.", retry: false };
    case "NOT_FOUND":
      return { message: "GitHub no longer has this doc, or the commit Striff read it at.", retry: true };
    case "FORBIDDEN":
      return {
        message: "GitHub wouldn't let Striff read this file. The installation may have been revoked or suspended, or lost access to this repository.",
        retry: true,
      };
    case "RATE_LIMITED":
      return { message: "GitHub is limiting how fast Striff can read files right now. Try again in a minute.", retry: true };
    case "TIMEOUT":
      return { message: "GitHub took too long to send this file.", retry: true };
    case "VERSION_UNKNOWN":
      return { message: "Striff doesn't know which commit this version of the doc was read at, so it can't show the text.", retry: true };
    case "TOO_LARGE":
      return { message: "This doc is too large to show here.", retry: true };
    case "UNREACHABLE":
      return { message: "Couldn't reach Striff to load the text of this doc.", retry: true };
    default:
      return { message: "Couldn't load the text of this doc.", retry: true };
  }
}

/** The one request key of a doc's text: the path and the version it is of. */
export function textKey(path, version) {
  return `${path}\u0000${version ?? ""}`;
}
