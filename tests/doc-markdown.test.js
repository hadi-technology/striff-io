import { test } from "node:test";
import assert from "node:assert/strict";

const { inlineRuns, plainText } = await import("../src/lib/docMarkdown.js");

/** Runs written compactly: the text, then what is on it. */
function shape(raw, options) {
  const { runs, links } = inlineRuns(raw, options);
  return runs.map((run) => [
    run.text,
    ...["strong", "em", "code", "mark", "hit"].filter((key) => run[key]),
    ...(run.link >= 0 ? [`link:${links[run.link].href}`] : []),
  ].join("|"));
}

test("bold, emphasis and code read as styles, in either spelling", () => {
  assert.deepEqual(shape("**a** __b__ *c* _d_ `e`"),
    ["a|strong", " ", "b|strong", " ", "c|em", " ", "d|em", " ", "e|code"]);
});

test("an underscore inside a name is part of the name", () => {
  assert.equal(plainText("call snake_case_name or __init__ here"), "call snake_case_name or init here");
  assert.equal(plainText("MAX_SIZE_BYTES and a_b_c"), "MAX_SIZE_BYTES and a_b_c");
});

test("an unmatched mark is shown as the character it is", () => {
  assert.equal(plainText("2 * 3 and a lone ` tick and **open and _half"),
    "2 * 3 and a lone ` tick and **open and _half");
  assert.equal(plainText("src/**/*.java"), "src/**/*.java");
});

test("emphasis around strong keeps both", () => {
  assert.deepEqual(shape("*a **b** c*"), ["a |em", "b|strong|em", " c|em"]);
  assert.deepEqual(shape("***x***"), ["x|strong|em"]);
});

test("a code span keeps what is inside it literally", () => {
  assert.deepEqual(shape("`a*b*c` and `` x`y ``"), ["a*b*c|code", " and ", "x`y|code"]);
  assert.equal(plainText("`<script>`"), "<script>");
});

test("only a web address becomes a link, and the text is what shows", () => {
  assert.deepEqual(shape("see [the spec](https://example.com/a_b) now"),
    ["see ", "the spec|link:https://example.com/a_b", " now"]);
  assert.deepEqual(shape("[Front](src/main/Front.java) and [x](#anchor)"),
    ["Front|link:null", " and ", "x|link:null"]);
  assert.deepEqual(shape("[click](javascript:alert(1))"), ["click|link:null"]);
  assert.deepEqual(shape("[`Take`](src/Take.java)"), ["Take|code|link:null"]);
});

test("reference links, images and autolinks read as their text", () => {
  assert.equal(plainText("a Java [`@FunctionalInterface`][fi] and [XPath][]"),
    "a Java @FunctionalInterface and XPath");
  assert.equal(plainText("![diagram](img.png) and [![badge](b.svg)](https://ci.example)"), "diagram and badge");
  assert.deepEqual(shape("<https://example.com>"), ["https://example.com|link:https://example.com"]);
  assert.equal(plainText("a [bracketed] aside"), "a [bracketed] aside");
});

test("escapes, entities and line breaks", () => {
  assert.equal(plainText("a \\*literal\\* \\_x\\_ \\`t\\`"), "a *literal* _x_ `t`");
  assert.equal(plainText("A &amp; B &lt;T&gt; &#39;q&#39; &#x2014; &bogus;"), "A & B <T> 'q' — &bogus;");
  assert.equal(plainText("one<br>two<br/>three<BR />four"), "one two three four");
});

test("markup other than a line break is text, never HTML", () => {
  assert.equal(plainText("say <a href='/acc'>hi</a><img src=x onerror=1>"),
    "say <a href='/acc'>hi</a><img src=x onerror=1>");
});

test("a list item, heading or quote line loses its leading marks", () => {
  assert.equal(plainText("* [RsJSON](#rsjson)"), "RsJSON");
  assert.equal(plainText("- [x] done"), "done");
  assert.equal(plainText("1. First"), "First");
  assert.equal(plainText("## Title"), "Title");
  assert.equal(plainText("> quoted"), "quoted");
  assert.equal(plainText("-1 is returned"), "-1 is returned");
});

test("a table row reads as its cells", () => {
  assert.equal(plainText("| `StickyList` | `Lists.newArrayList()` | ? | `Arrays.asList()` |"),
    "StickyList · Lists.newArrayList() · ? · Arrays.asList()");
  assert.equal(plainText("a | b"), "a | b");
});

test("a range starting inside a bold run bolds part of it, without cutting its marks", () => {
  const raw = "**A b** c";
  assert.deepEqual(shape(raw, { from: raw.indexOf("b"), to: raw.length }),
    ["A |strong", "b|strong|hit", " c|hit"]);
});

test("a range straddling a link and code takes their visible text", () => {
  const raw = "Use [the `Gateway`](docs/gw.md) for calls, and log.";
  assert.deepEqual(shape(raw, { from: raw.indexOf("["), to: raw.indexOf(",") }),
    ["Use ", "the |hit|link:null", "Gateway|code|hit|link:null", " for calls|hit", ", and log."]);
});

test("a range that does not fit the text emphasises nothing", () => {
  for (const [from, to] of [[1, 9], [2, 2], [-1, 2], [null, null], [undefined, 2], [0.5, 2]]) {
    const { runs, ranged } = inlineRuns("abc", { from, to });
    assert.equal(ranged, false);
    assert.deepEqual(runs.map((run) => run.hit), [false]);
  }
});

test("a range's offsets count UTF-16 units in the raw string", () => {
  const raw = "😀 **x** y";
  assert.deepEqual(shape(raw, { from: raw.indexOf("x"), to: raw.indexOf("x") + 1 }),
    ["😀 ", "x|strong|hit", " y"]);
});

test("a search marks every match in the visible text, across styles and the range", () => {
  assert.deepEqual(shape("**Front** interface and front", { term: "front i" }),
    ["Front|strong|mark", " i|mark", "nterface and front"]);
  const raw = "`Api` calls `Store` daily";
  assert.deepEqual(shape(raw, { from: 0, to: raw.indexOf(" daily"), term: "store da" }),
    ["Api|code|hit", " calls |hit", "Store|code|mark|hit", " da|mark", "ily"]);
});

test("nothing, or no text, is nothing", () => {
  assert.equal(plainText(null), "");
  assert.deepEqual(inlineRuns(undefined).runs, []);
});
