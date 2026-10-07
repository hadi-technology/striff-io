/**
 * A customer's sentence as a reader should see it: the inline Markdown the document was written
 * in turned into styles, and never trusted as HTML.
 *
 * The API sends a document's own words as the document wrote them, so a quote arrives with its
 * `**bold**`, its `[links](to/a/file.md)` and its `&amp;`s. Shown as it is, that puts the marks on
 * screen; set as HTML, it puts a customer's document in charge of the page. This reads the raw
 * string once into the characters a reader sees, each remembering where it stood in the raw text
 * and which styles cover it. Everything asked afterwards -- which words a rule checks, which match
 * a search -- is asked of those characters, so a span that starts inside `**A b**` bolds half of
 * the bold run rather than cutting its asterisks apart.
 *
 * What is read: backslash escapes; code spans of any number of backticks; links and images, inline
 * or by reference (their text; a target only where it is http or https); autolinks; strong and
 * emphasis with `*` and `_`, where `_` inside a word (snake_case) is a character; a few HTML
 * entities; `<br>` as a space; and, at the very start, the marks of a list item, heading or quote
 * line, and the pipes of a table row. A mark that opens and never closes is shown as the character
 * it is.
 *
 * Plain JavaScript, with no React in it, so the node tests read the same answer the page renders.
 */

const ASCII_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const PUNCTUATION = /[\p{P}\p{S}]/u;
const SPACE = /\s/;
const WORD = /[\p{L}\p{N}]/u;

/** The entities a document plausibly writes, by name. Numeric ones are read by number. */
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  rarr: "→", larr: "←", harr: "↔", times: "×", copy: "©", reg: "®", trade: "™", deg: "°",
  middot: "·", bull: "•",
};

/** What a table row's inner pipe reads as. */
const CELL_BREAK = " · ";

/**
 * The visible characters of `raw`, with their styles and where each stood in `raw`.
 *
 * @param {string | null | undefined} raw the text as the API sent it
 * @returns {{ chars: Char[], links: Link[] }}
 *
 * @typedef {{ ch: string, at: number, strong: boolean, em: boolean, code: boolean, link: number }} Char
 * @typedef {{ href: string | null }} Link
 */
export function parseInline(raw) {
  const text = raw || "";
  const out = { chars: [], links: [], table: tableRow(text) };
  read(text, blockStart(text), out.table ? out.table.end : text.length, PLAIN, out);
  return { chars: out.chars, links: out.links };
}

const PLAIN = { strong: false, em: false, link: -1 };

/** Where the inline text starts once a list, heading or quote line's marks are passed over. */
function blockStart(text) {
  const lead = /^[ \t]{0,3}(?:>[ \t]?)*(?:(?:[*+-]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/
    .exec(text);
  const table = /^\s*\|[ \t]*/.exec(text);
  if (table && tableRow(text)) return table[0].length;
  return lead ? lead[0].length : 0;
}

/** A line that is a table row -- `| a | b |` -- and where its closing pipe is, or null. */
function tableRow(text) {
  if (!/^\s*\|.*\|\s*$/.test(text)) return null;
  const end = text.lastIndexOf("|");
  return text.indexOf("|") < end ? { end } : null;
}

/** Reads text[from, to) into out.chars with the style given. */
function read(text, from, to, style, out) {
  let i = from;
  while (i < to) {
    const c = text[i];
    if (c === "\\" && i + 1 < to && ASCII_PUNCTUATION.test(text[i + 1])) {
      push(out, text[i + 1], i + 1, style, false);
      i += 2;
      continue;
    }
    if (c === "`") {
      const span = codeSpan(text, i, to);
      if (span) {
        for (let k = span.from; k < span.to; k++) push(out, text[k] === "\n" ? " " : text[k], k, style, true);
        i = span.next;
      } else {
        // A run of backticks with no partner is that many backticks.
        while (i < to && text[i] === "`") push(out, "`", i++, style, false);
      }
      continue;
    }
    if (c === "<") {
      const br = /^<br\s*\/?>/i.exec(text.slice(i, Math.min(to, i + 8)));
      if (br) {
        push(out, " ", i, style, false);
        i += br[0].length;
        continue;
      }
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(text.slice(i, to));
      if (auto) {
        const link = out.links.push({ href: auto[1] }) - 1;
        for (let k = 1; k < auto[0].length - 1; k++) push(out, text[i + k], i + k, { ...style, link }, false);
        i += auto[0].length;
        continue;
      }
    }
    if (c === "&") {
      const entity = entityAt(text, i, to);
      if (entity) {
        push(out, entity.ch, i, style, false);
        i = entity.next;
        continue;
      }
    }
    if (c === "[" || (c === "!" && text[i + 1] === "[")) {
      const link = linkAt(text, c === "!" ? i + 1 : i, to);
      if (link) {
        const id = style.link >= 0
          ? style.link
          : out.links.push({ href: c === "!" ? null : web(link.href) }) - 1;
        read(text, link.textFrom, link.textTo, { ...style, link: id }, out);
        i = link.next;
        continue;
      }
    }
    if (c === "*" || c === "_") {
      const run = emphasisAt(text, i, to);
      if (run) {
        read(text, run.from, run.to, { ...style, [run.kind]: true }, out);
        i = run.next;
        continue;
      }
      let k = i;
      while (k < to && text[k] === c) push(out, c, k++, style, false);
      i = k;
      continue;
    }
    if (c === "|" && out.table) {
      // A cell boundary inside a table row: the cells read as a list, not as pipes.
      trimEnd(out);
      for (const ch of CELL_BREAK) push(out, ch, i, style, false);
      i++;
      while (i < to && (text[i] === " " || text[i] === "\t")) i++;
      continue;
    }
    push(out, c, i, style, false);
    i++;
  }
  if (out.table && to === out.table.end) trimEnd(out);
}

function push(out, ch, at, style, code) {
  out.chars.push({ ch, at, strong: style.strong, em: style.em, code, link: style.link });
}

/** Drops the spaces the last cell ended with, so a separator does not stand apart from its words. */
function trimEnd(out) {
  while (out.chars.length && out.chars[out.chars.length - 1].ch === " " && !out.chars[out.chars.length - 1].code) {
    out.chars.pop();
  }
}

/**
 * A code span opening at `at`: a run of n backticks closed by the next run of exactly n. One space
 * either side of the content is padding, as Markdown reads it, unless the content is all spaces.
 */
function codeSpan(text, at, to) {
  let n = 0;
  while (at + n < to && text[at + n] === "`") n++;
  let k = at + n;
  while (k < to) {
    if (text[k] !== "`") {
      k++;
      continue;
    }
    let m = 0;
    while (k + m < to && text[k + m] === "`") m++;
    if (m === n) {
      let from = at + n;
      let end = k;
      if (end - from >= 2 && text[from] === " " && text[end - 1] === " " && text.slice(from, end).trim()) {
        from++;
        end--;
      }
      return { from, to: end, next: k + m };
    }
    k += m;
  }
  return null;
}

/** An entity at `at`, by name or by number, and where it ends; null where it is not one known. */
function entityAt(text, at, to) {
  const match = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(text.slice(at, Math.min(to, at + 34)));
  if (!match) return null;
  const body = match[1];
  let ch;
  if (body[0] === "#") {
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    // Nothing a document could mean by a control character or a code point that does not exist.
    if (!(code >= 32 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return null;
    ch = String.fromCodePoint(code);
  } else {
    ch = ENTITIES[body];
    if (ch === undefined) return null;
  }
  return { ch, next: at + match[0].length };
}

/**
 * A link whose `[` is at `at`: `[text](target "title")`, `[text][ref]` or `[text][]`. A lone
 * `[text]` is left alone: it is as often a checkbox or a bracketed aside as a reference.
 */
function linkAt(text, at, to) {
  const close = matching(text, at, to, "[", "]");
  if (close < 0) return null;
  const after = close + 1;
  if (text[after] === "(") {
    const end = matching(text, after, to, "(", ")");
    if (end < 0) return null;
    const inner = text.slice(after + 1, end).trim();
    const target = /^<([^<>]*)>|^(\S*)/.exec(inner);
    return { textFrom: at + 1, textTo: close, href: target ? (target[1] ?? target[2]) : "", next: end + 1 };
  }
  if (text[after] === "[") {
    const end = text.indexOf("]", after + 1);
    if (end < 0 || end >= to || text.slice(after + 1, end).includes("[")) return null;
    return { textFrom: at + 1, textTo: close, href: null, next: end + 1 };
  }
  return null;
}

/** Where the bracket opened at `at` closes, past code spans, escapes and nested pairs; -1 if never. */
function matching(text, at, to, open, close) {
  let depth = 0;
  for (let k = at; k < to; k++) {
    const c = text[k];
    if (c === "\\") {
      k++;
      continue;
    }
    if (c === "`") {
      const span = codeSpan(text, k, to);
      if (span) {
        k = span.next - 1;
        continue;
      }
      while (k + 1 < to && text[k + 1] === "`") k++;
      continue;
    }
    if (c === open) depth++;
    if (c === close && --depth === 0) return k;
  }
  return -1;
}

/** A target worth a link: http or https only. Anything else -- a path, a fragment, a script -- is not. */
function web(href) {
  return href && /^https?:\/\/[^\s]+$/i.test(href) ? href : null;
}

/**
 * Strong or emphasis opening at `at`, as Markdown's flanking rules read it, and where it closes;
 * null where the run there opens nothing.
 *
 * Strong takes two marks and is closed only by a run of at least two; emphasis takes one and is
 * closed only by a run of one or of three or more. That is what keeps `*a **b** c*` emphasis around
 * a strong run rather than emphasis that ends at the first pair of asterisks.
 */
function emphasisAt(text, at, to) {
  const c = text[at];
  let n = 0;
  while (at + n < to && text[at + n] === c) n++;
  if (!opens(text, at, at + n, c)) return null;
  const kinds = n >= 2 ? ["strong", "em"] : ["em"];
  for (const kind of kinds) {
    const width = kind === "strong" ? 2 : 1;
    const close = closer(text, at + n, to, c, width);
    // Emphasis around no word at all is a path or a glob, `src/**/*.java`, not emphasis.
    if (close && /[\p{L}\p{N}]/u.test(text.slice(at + width, close.at + close.length - width))) {
      // A run longer than the mark opens the rest of it inside: `***x***` is strong around `*x*`.
      return { kind, from: at + width, to: close.at + close.length - width, next: close.at + close.length };
    }
  }
  return null;
}

function opens(text, from, end, c) {
  const before = from > 0 ? text[from - 1] : " ";
  const after = end < text.length ? text[end] : " ";
  const leftFlanking = !SPACE.test(after)
    && (!PUNCTUATION.test(after) || SPACE.test(before) || PUNCTUATION.test(before));
  if (!leftFlanking) return false;
  // An underscore inside a word is part of the word: snake_case_name is one name.
  return c === "*" || !WORD.test(before);
}

function closes(text, from, end, c) {
  const before = from > 0 ? text[from - 1] : " ";
  const after = end < text.length ? text[end] : " ";
  const rightFlanking = !SPACE.test(before)
    && (!PUNCTUATION.test(before) || SPACE.test(after) || PUNCTUATION.test(after));
  if (!rightFlanking) return false;
  return c === "*" || !WORD.test(after);
}

/** The first run of `c` after `from` that can close a mark `width` wide, past code and escapes. */
function closer(text, from, to, c, width) {
  let k = from;
  while (k < to) {
    const ch = text[k];
    if (ch === "\\") {
      k += 2;
      continue;
    }
    if (ch === "`") {
      const span = codeSpan(text, k, to);
      if (span) {
        k = span.next;
        continue;
      }
      while (k < to && text[k] === "`") k++;
      continue;
    }
    if (ch !== c) {
      k++;
      continue;
    }
    let m = 0;
    while (k + m < to && text[k + m] === c) m++;
    const fits = width === 2 ? m >= 2 : m === 1 || m >= 3;
    // Content is never empty: `****` is four asterisks.
    if (fits && k > from && closes(text, k, k + m, c)) return { at: k, length: m };
    k += m;
  }
  return null;
}

/**
 * The text a reader sees, without a mark of Markdown in it: for search, snippets and exports.
 *
 * @param {string | null | undefined} raw the text as the API sent it
 * @returns {string}
 */
export function plainText(raw) {
  return parseInline(raw).chars.map((each) => each.ch).join("");
}

/**
 * The visible text in runs of the same style, ready to render.
 *
 * @param {string | null | undefined} raw the text as the API sent it
 * @param {{ term?: string, from?: number | null, to?: number | null }} [options] what is searched
 *   for, marked wherever it occurs in the visible text, across styles; and the words to emphasise,
 *   as UTF-16 offsets [from, to) into `raw`. A range that does not fit `raw` emphasises nothing.
 * @returns {{ runs: Run[], links: Link[], ranged: boolean }} the runs, the links they point into,
 *   and whether a range applied
 *
 * @typedef {{ text: string, from: number, to: number, strong: boolean, em: boolean, code: boolean,
 *   link: number, mark: boolean, hit: boolean }} Run
 */
export function inlineRuns(raw, options = {}) {
  const text = raw || "";
  const { chars, links } = parseInline(text);
  const { from, to } = options;
  const ranged = typeof from === "number" && typeof to === "number"
    && Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from && to <= text.length;
  const marked = searchHits(chars, options.term);
  const runs = [];
  chars.forEach((each, index) => {
    const hit = ranged && each.at >= from && each.at < to;
    const mark = marked[index];
    const last = runs[runs.length - 1];
    if (last && last.strong === each.strong && last.em === each.em && last.code === each.code
        && last.link === each.link && last.mark === mark && last.hit === hit) {
      last.text += each.ch;
      last.to = each.at + 1;
    } else {
      runs.push({ text: each.ch, from: each.at, to: each.at + 1, strong: each.strong, em: each.em,
        code: each.code, link: each.link, mark, hit });
    }
  });
  return { runs, links, ranged };
}

/** For each visible character, whether it is part of a match for `term`, case aside. */
function searchHits(chars, term) {
  const hits = new Array(chars.length).fill(false);
  const needle = (term || "").trim().toLowerCase();
  if (!needle) return hits;
  // Lowercasing can change a character's length, so each lowercased unit remembers its character.
  let haystack = "";
  const owner = [];
  chars.forEach((each, index) => {
    const lower = each.ch.toLowerCase();
    haystack += lower;
    for (let k = 0; k < lower.length; k++) owner.push(index);
  });
  let found = haystack.indexOf(needle);
  while (found >= 0) {
    for (let k = found; k < found + needle.length; k++) hits[owner[k]] = true;
    found = haystack.indexOf(needle, found + needle.length);
  }
  return hits;
}
