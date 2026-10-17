/**
 * What it takes to show a customer's document without trusting it: where its links go, which of its
 * raw HTML is drawn, and how a source view recognises headings and code.
 *
 * Plain JavaScript so the node tests read the same answers the page shows.
 */

/** The raw HTML elements a document may use; every other tag is shown as the text it is. */
export const ALLOWED_TAGS = new Set(["details", "summary", "br", "sub", "sup", "kbd"]);
const VOID_TAGS = new Set(["br"]);

/** `https://github.com/<owner>/<repo>/blob/<ref>/<path>`, with a line where one is given. */
export function blobUrl(owner, repo, ref, path, line = null) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encoded}`
    + (line ? `?plain=1#L${line}` : "");
}

/**
 * Where a link in a document goes.
 *
 * An absolute web address opens in a new tab. Anything relative is a path in the repository, taken
 * from the folder of the document and followed to GitHub at the commit the document was read at,
 * so the link shows what the author saw; `..` stops at the root. A bare `#fragment` is a heading
 * in the document itself. Any other scheme (`javascript:`, `data:`) is not a link at all.
 *
 * @param {string} href as the document wrote it
 * @param {{ owner: string, repo: string, sha: string | null, docPath: string }} where
 * @returns {{ href: string, external: boolean } | null}
 */
export function resolveLink(href, where) {
  const raw = String(href || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { href: raw, external: true };
  if (raw.startsWith("//")) return { href: `https:${raw}`, external: true };
  if (/^mailto:/i.test(raw)) return { href: raw, external: true };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return null;
  if (!where.sha) return null;

  let rest = raw;
  let hash = "";
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    hash = rest.slice(hashAt);
    rest = rest.slice(0, hashAt);
  }
  const queryAt = rest.indexOf("?");
  if (queryAt >= 0) rest = rest.slice(0, queryAt);

  const parts = rest.startsWith("/") ? [] : where.docPath.split("/").slice(0, -1);
  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else {
      let decoded = part;
      try {
        decoded = decodeURIComponent(part);
      } catch {
        // A segment that is not valid percent-encoding is used as written.
      }
      parts.push(decoded);
    }
  }
  const path = parts.join("/");
  const folder = rest.endsWith("/");
  const base = `https://github.com/${where.owner}/${where.repo}`;
  const encoded = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const sha = encodeURIComponent(where.sha);
  const target = rest === "" ? `${base}/blob/${sha}/${where.docPath.split("/").map(encodeURIComponent).join("/")}`
    : path === "" ? `${base}/tree/${sha}`
    : `${base}/${folder ? "tree" : "blob"}/${sha}/${encoded}`;
  return { href: `${target}${hash}`, external: true };
}

/**
 * The pieces of one raw HTML fragment: text, the allowed tags, and comments (which are not drawn).
 * A tag that is not allowed is text, so it is shown as written and never becomes an element.
 *
 * @param {string} value
 * @param {number} base where the fragment begins in the document
 */
export function htmlTokens(value, base = 0) {
  const re = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?(\/?)>/g;
  const out = [];
  let last = 0;
  const text = (from, to) => {
    if (to > from) out.push({ kind: "text", text: value.slice(from, to), from: base + from, to: base + to });
  };
  for (let m = re.exec(value); m; m = re.exec(value)) {
    text(last, m.index);
    last = m.index + m[0].length;
    const from = base + m.index;
    const to = base + last;
    if (m[0].startsWith("<!--")) {
      out.push({ kind: "comment", from, to });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      out.push({ kind: "text", text: m[0], from, to });
    } else if (VOID_TAGS.has(tag)) {
      out.push({ kind: "void", tag, from, to });
    } else if (m[3]) {
      // A self-closing tag for an element that has content is not one this view draws.
      out.push({ kind: "text", text: m[0], from, to });
    } else {
      out.push({ kind: m[1] ? "close" : "open", tag, from, to });
    }
  }
  text(last, value.length);
  return out;
}

/**
 * A list of sibling nodes with their raw HTML turned into elements: an allowed opening tag, the
 * siblings after it and its closing tag become one `htmlElement` holding them. Raw HTML in markdown
 * arrives as separate nodes for the opening and the closing tag, with the markdown between them as
 * siblings, so the pairing is done here. A closing tag with nothing open is text; an element left
 * open ends with its parent.
 */
export function nestHtml(children) {
  if (!children.some((child) => child.type === "html")) return children;
  const root = { children: [] };
  const stack = [root];
  const add = (item) => stack[stack.length - 1].children.push(item);
  const at = (from, to) => ({ start: { offset: from }, end: { offset: to } });
  for (const child of children) {
    if (child.type !== "html") {
      add(child);
      continue;
    }
    const base = child.position?.start?.offset ?? 0;
    for (const token of htmlTokens(child.value || "", base)) {
      if (token.kind === "text") {
        add({ type: "htmlText", value: token.text, position: at(token.from, token.to) });
      } else if (token.kind === "comment") {
        add({ type: "htmlComment", position: at(token.from, token.to) });
      } else if (token.kind === "void") {
        add({ type: "htmlVoid", tag: token.tag, position: at(token.from, token.to) });
      } else if (token.kind === "open") {
        const element = { type: "htmlElement", tag: token.tag, children: [], position: at(token.from, token.to) };
        add(element);
        stack.push(element);
      } else {
        let open = stack.length - 1;
        while (open > 0 && stack[open].tag !== token.tag) open--;
        if (open === 0) {
          add({ type: "htmlText", value: `</${token.tag}>`, position: at(token.from, token.to) });
        } else {
          stack.length = open + 1;
          stack[open].position.end.offset = token.to;
          stack.pop();
        }
      }
    }
  }
  // An element left open reaches as far as what it holds.
  const close = (items) => {
    for (const item of items) {
      if (item.type !== "htmlElement") continue;
      close(item.children);
      const last = item.children[item.children.length - 1];
      const end = last?.position?.end?.offset;
      if (end != null && end > item.position.end.offset) item.position.end.offset = end;
    }
  };
  close(root.children);
  return root.children;
}

/** A line of 3 or more of one punctuation character, the underline of an rST title. */
function underline(line) {
  return /^([=\-`:'"~^_*+#.])\1{2,}\s*$/.test(line);
}

/**
 * The lines of a document in a form a source view can set: each with where it begins, and whether
 * it is a heading or part of code.
 *
 * Headings are recognised the way the reader of the doc recognises them: a `#` run in Markdown, `=`
 * run in AsciiDoc, a title with an underline of punctuation in rST. Code is a fenced block in
 * Markdown, a delimited `----` or `....` block in AsciiDoc, and in rST the indented block after a
 * `::` or a code directive.
 *
 * @param {string} text
 * @param {"markdown" | "mdx" | "asciidoc" | "rst"} format
 * @returns {{ n: number, from: number, to: number, kind: "text" | "heading" | "code" }[]}
 */
export function sourceLines(text, format) {
  const out = [];
  let from = 0;
  const raw = [];
  for (;;) {
    const nl = text.indexOf("\n", from);
    const end = nl < 0 ? text.length : nl;
    let to = end;
    if (to > from && text.charCodeAt(to - 1) === 13) to -= 1;
    raw.push({ from, to });
    if (nl < 0) break;
    from = nl + 1;
  }
  let fence = null;
  let literal = false;
  for (let i = 0; i < raw.length; i++) {
    const { from: a, to: b } = raw[i];
    const line = text.slice(a, b);
    const trimmed = line.trim();
    let kind = "text";
    if (format === "rst") {
      if (literal) {
        if (trimmed === "" || /^\s/.test(line)) kind = "code";
        else literal = false;
      }
      if (kind !== "code") {
        const next = i + 1 < raw.length ? text.slice(raw[i + 1].from, raw[i + 1].to) : "";
        if (trimmed && !underline(trimmed) && underline(next) && next.trim().length >= trimmed.length) kind = "heading";
        else if (underline(trimmed) && i > 0 && out[i - 1]?.kind === "heading") kind = "heading";
        else if (/(::|\.\. (code|code-block|sourcecode|literalinclude)::.*)\s*$/.test(trimmed)) literal = true;
      }
    } else if (format === "asciidoc") {
      const delimiter = /^(-{4,}|\.{4,})$/.exec(trimmed);
      if (fence) {
        kind = "code";
        if (delimiter && delimiter[1] === fence) fence = null;
      } else if (delimiter) {
        kind = "code";
        fence = delimiter[1];
      } else if (/^=+\s+\S/.test(trimmed)) {
        kind = "heading";
      }
    } else if (fence) {
      kind = "code";
      if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
    } else {
      const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (open) {
        kind = "code";
        fence = open[1];
      } else if (/^\s{0,3}#{1,6}\s/.test(line)) {
        kind = "heading";
      }
    }
    out.push({ n: i + 1, from: a, to: b, kind });
  }
  return out;
}
