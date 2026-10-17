/**
 * Parses a document's text into an mdast tree whose offsets count in the text exactly as given.
 *
 * Kept apart from `docView.js` so that only the Document tab, which is loaded on demand, carries
 * the Markdown parser.
 *
 * The parser drops a leading byte order mark and counts offsets from the character after it, while
 * the API's placements count the mark as the text's first character. A text that opens with one is
 * parsed without it and every offset in the tree is moved one on, so the two agree. Lines are
 * unchanged: the mark is part of the first line.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";

const BOM = "﻿";

/** Moves every offset in `tree` on by `by`. */
function shift(tree, by) {
  const visit = (node) => {
    const p = node.position;
    if (p) {
      if (p.start?.offset != null) p.start.offset += by;
      if (p.end?.offset != null) p.end.offset += by;
    }
    for (const child of node.children || []) visit(child);
  };
  visit(tree);
  return tree;
}

/**
 * @param {string} text the document's text as the API sent it
 * @param {"markdown" | "mdx"} format
 */
export function parseDoc(text, format) {
  const processor = unified().use(remarkParse).use(remarkGfm);
  if (format === "mdx") processor.use(remarkMdx);
  if (text.startsWith(BOM)) return shift(processor.parse(text.slice(1)), 1);
  return processor.parse(text);
}
