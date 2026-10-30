import test from "node:test";
import assert from "node:assert/strict";
import { nextExpanded, revealPath, OPEN_WHOLE_TREE_AT_MOST } from "../src/lib/treeOpen.js";

const large = Array.from({ length: OPEN_WHOLE_TREE_AT_MOST + 5 }, (_, i) => `d${i}/sub/doc${i}.md`);
const start = { selected: "", seen: new Set(), expanded: new Set([""]) };

test("a large tree opens only the root and the paths to results", () => {
  const { expanded } = nextExpanded({ ...start, docPaths: large, resultPaths: ["d1/sub/doc1.md"] });
  assert.deepEqual([...expanded].sort(), ["", "d1", "d1/sub"]);
});

test("a small tree opens fully", () => {
  const docs = ["a/b/x.md", "c/y.md", "README.md"];
  const { expanded } = nextExpanded({ ...start, docPaths: docs, resultPaths: [] });
  assert.deepEqual([...expanded].sort(), ["", "a", "a/b", "c"]);
});

test("the selected document's ancestors open", () => {
  const { expanded } = nextExpanded({ ...start, docPaths: large, resultPaths: [], selected: "d7/sub/doc7.md" });
  assert.deepEqual([...expanded].sort(), ["", "d7", "d7/sub"]);
  assert.ok(revealPath(new Set([""]), "d3/sub/doc3.md").has("d3/sub"));
});

test("a reload keeps a folder the reader closed", () => {
  const input = { docPaths: large, resultPaths: ["d1/sub/doc1.md"] };
  const first = nextExpanded({ ...start, ...input });
  const closed = new Set(first.expanded);
  closed.delete("d1");
  const again = nextExpanded({ ...input, selected: "", seen: first.seen, expanded: closed });
  assert.equal(again.expanded, closed);
  assert.ok(!again.expanded.has("d1"));
});

test("a new folder after a reload gets the default", () => {
  const first = nextExpanded({ ...start, docPaths: large, resultPaths: [] });
  const docPaths = [...large, "fresh/doc.md", "quiet/doc.md"];
  const again = nextExpanded({
    docPaths, resultPaths: ["fresh/doc.md"], selected: "", seen: first.seen, expanded: first.expanded,
  });
  assert.ok(again.expanded.has("fresh"));
  assert.ok(!again.expanded.has("quiet"));
});

test("without results a large tree opens the root and the selection, and a later load opens the results", () => {
  const first = nextExpanded({ ...start, docPaths: large, resultPaths: [], selected: "d2/sub/doc2.md", markClosedSeen: false });
  assert.deepEqual([...first.expanded].sort(), ["", "d2", "d2/sub"]);
  const again = nextExpanded({
    docPaths: large, resultPaths: ["d1/sub/doc1.md"], selected: "d2/sub/doc2.md", seen: first.seen, expanded: first.expanded,
  });
  assert.ok(again.expanded.has("d1/sub"));
});
