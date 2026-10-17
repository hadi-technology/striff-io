import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTokens, nestHtml, resolveLink, sourceLines } from "../src/lib/docMarkup.js";

const where = { owner: "acme", repo: "app", sha: "abc123", docPath: "docs/adr/0001.md" };

test("absolute links open as they are; relative ones go to GitHub at the commit", () => {
  assert.deepEqual(resolveLink("https://example.com/a", where), { href: "https://example.com/a", external: true });
  assert.equal(resolveLink("../design/x.md#top", where).href, "https://github.com/acme/app/blob/abc123/docs/design/x.md#top");
  assert.equal(resolveLink("./y.md", where).href, "https://github.com/acme/app/blob/abc123/docs/adr/y.md");
  assert.equal(resolveLink("/README.md", where).href, "https://github.com/acme/app/blob/abc123/README.md");
  assert.equal(resolveLink("src/", where).href, "https://github.com/acme/app/tree/abc123/docs/adr/src");
  assert.equal(resolveLink("#intro", where).href, "https://github.com/acme/app/blob/abc123/docs/adr/0001.md#intro");
});

test("'..' stops at the root; unsafe schemes and unknown commits are not links", () => {
  assert.equal(resolveLink("../../../../x.md", where).href, "https://github.com/acme/app/blob/abc123/x.md");
  assert.equal(resolveLink("javascript:alert(1)", where), null);
  assert.equal(resolveLink("data:text/html,x", where), null);
  assert.equal(resolveLink("y.md", { ...where, sha: null }), null);
});

test("only the allowed tags are tags; everything else is text", () => {
  const kinds = htmlTokens("<kbd>x</kbd><script>alert(1)</script><img src=x onerror=y><!-- c --><br/>").map((t) => t.kind === "text" ? `text:${t.text}` : t.kind);
  assert.deepEqual(kinds, ["open", "text:x", "close", "text:<script>", "text:alert(1)", "text:</script>", "text:<img src=x onerror=y>", "comment", "void"]);
});

test("details pairs across sibling nodes and holds the markdown between", () => {
  const nodes = [
    { type: "html", value: "<details>\n<summary>More</summary>", position: { start: { offset: 0 }, end: { offset: 31 } } },
    { type: "paragraph", children: [], position: { start: { offset: 33 }, end: { offset: 40 } } },
    { type: "html", value: "</details>", position: { start: { offset: 41 }, end: { offset: 51 } } },
  ];
  const [el, ...rest] = nestHtml(nodes);
  assert.equal(el.tag, "details");
  assert.equal(rest.length, 0);
  assert.deepEqual(el.children.map((c) => c.tag || c.type), ["htmlText", "summary", "paragraph"]);
  assert.equal(el.position.end.offset, 51);
});

test("a stray closing tag is text", () => {
  const out = nestHtml([{ type: "html", value: "</details>", position: { start: { offset: 0 }, end: { offset: 10 } } }]);
  assert.deepEqual(out.map((n) => n.type), ["htmlText"]);
});

test("source lines: markdown fences, adoc headings and blocks, rst underlines and literals", () => {
  const kinds = (t, f) => sourceLines(t, f).map((l) => l.kind);
  assert.deepEqual(kinds("# T\ntext\n```\ncode\n```\nafter", "markdown"), ["heading", "text", "code", "code", "code", "text"]);
  assert.deepEqual(kinds("= T\ntext\n----\ncode\n----\nafter", "asciidoc"), ["heading", "text", "code", "code", "code", "text"]);
  assert.deepEqual(kinds("Title\n=====\ntext::\n\n  lit\n\nafter", "rst"), ["heading", "heading", "text", "code", "code", "code", "text"]);
});
