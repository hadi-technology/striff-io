import { test } from "node:test";
import assert from "node:assert/strict";

const { parseDoc } = await import("../src/lib/docParse.js");

function firstText(node) {
  if (node.type === "text") return node;
  for (const child of node.children || []) {
    const found = firstText(child);
    if (found) return found;
  }
  return null;
}

test("offsets count a leading byte order mark, as the API's placements do", () => {
  const text = "﻿# Head\n\nBody text.\n";
  const head = firstText(parseDoc(text, "markdown"));
  assert.equal(text.slice(head.position.start.offset, head.position.end.offset), "Head");
  assert.equal(head.position.start.line, 1);
});

test("a text with no byte order mark keeps the parser's offsets", () => {
  const text = "# Head\n\nBody text.\n";
  const head = firstText(parseDoc(text, "markdown"));
  assert.equal(text.slice(head.position.start.offset, head.position.end.offset), "Head");
});
