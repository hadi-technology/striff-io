import test from "node:test";
import assert from "node:assert/strict";
import { progressTitle, selectedLeft } from "../src/lib/readingProgress.js";

test("no selection recorded: no number, the generic sentence", () => {
  for (const reading of [null, {}, { docsSelected: null, docsSelectedLeft: null }, { docsSelected: 3 }]) {
    assert.equal(selectedLeft(reading), null);
    assert.equal(progressTitle(reading), "Striff is reading this repository's documents.");
  }
});

test("a number left shows, with how far the reading has got", () => {
  const reading = { state: "running", docsSelected: 3, docsSelectedLeft: 2 };
  assert.equal(selectedLeft(reading), 2);
  assert.equal(progressTitle(reading), "Striff is reading this repository's documents: 1 of 3 read so far.");
});

test("none left shows no number", () => {
  const reading = { state: "running", docsSelected: 3, docsSelectedLeft: 0 };
  assert.equal(selectedLeft(reading), null);
  assert.equal(progressTitle(reading), "Striff is reading this repository's documents: 3 of 3 read so far.");
});

test("a queued reading says it is queued", () => {
  assert.match(progressTitle({ state: "queued", docsSelected: 3, docsSelectedLeft: 3 }), /queued/);
});
