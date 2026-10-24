import test from "node:test";
import assert from "node:assert/strict";
import { readingHeader } from "../src/lib/readingStatus.js";

const words = (header) => header.line.map((p) => (typeof p === "string" ? p : p.b)).join("");
const NOW = Date.UTC(2026, 10, 20);

test("no status, or an unknown visibility, says nothing new", () => {
  assert.equal(readingHeader(undefined), null);
  assert.equal(readingHeader(null), null);
  assert.equal(readingHeader({ state: null, documentsRead: 3, documentsTotal: 9 }), null);
  assert.equal(readingHeader({ state: "from_the_future" }), null);
});

test("unpaid: the count, the free growth, the offer as a link and the growth line", () => {
  const h = readingHeader({ state: "unpaid", offerPaidPlan: true, documentsRead: 12, documentsTotal: 15, readAtInstallation: 9, readSince: 3 }, NOW);
  assert.equal(words(h), "Striff has read 12 of your 15 documents, starting with the ones most tied to your code. Every pull request and push reads the documents about the code it changes, free, so this keeps growing as your team works.");
  assert.equal(h.offer, true);
  assert.equal(h.subscribe, false);
  assert.deepEqual(h.growth, { read: 12, total: 15, bar: true, text: "9 read at installation, 3 more since through pull requests and pushes." });
});

test("unpaid: nothing read since installation leaves the second clause out; no offer when none is made", () => {
  const h = readingHeader({ state: "unpaid", offerPaidPlan: false, documentsRead: 9, documentsTotal: 15, readAtInstallation: 9, readSince: 0 }, NOW);
  assert.equal(h.growth.text, "9 read at installation.");
  assert.equal(h.offer, false);
});

test("unpaid, waiting and reading", () => {
  assert.equal(words(readingHeader({ state: "unpaid_waiting" })), "Striff reads this repository's most important documents when its first pull request or push arrives.");
  const reading = readingHeader({ state: "unpaid_reading", documentsRead: 0, documentsTotal: 0 });
  assert.equal(reading.growth, null);
  assert.equal(reading.offer, false);
});

test("private without a plan, and paused, offer Subscribe", () => {
  const none = readingHeader({ state: "private_no_plan" });
  assert.equal(words(none), "Striff starts reading this repository's documents and checking its pull requests when you subscribe.");
  assert.equal(none.subscribe, true);
  const paused = readingHeader({ state: "private_paused", pausedSinceMs: Date.UTC(2026, 10, 12) }, NOW);
  assert.equal(words(paused), "Paused: this repository's plan ended on 12 Nov. Its rules show how they stood then.");
  assert.equal(paused.subscribe, true);
  const lastYear = readingHeader({ state: "private_paused", pausedSinceMs: Date.UTC(2025, 10, 12) }, NOW);
  assert.match(words(lastYear), /ended on 12 Nov 2025\./);
});

test("paid states have no button and no offer", () => {
  const waiting = readingHeader({ state: "paid_waiting_for_pull_request" });
  assert.equal(words(waiting), "Striff reads this repository's documents when its first pull request is checked.");
  const reading = readingHeader({ state: "paid_reading", documentsRead: 40, documentsTotal: 136, documentsNotRead: 96 });
  assert.equal(words(reading), "Striff is reading the other 96 documents: 40 read so far.");
  const all = readingHeader({ state: "paid_all_read", documentsRead: 131, documentsTotal: 131 });
  assert.equal(words(all), "Striff has read all 131 documents.");
  assert.deepEqual(all.growth, { read: 131, total: 131, bar: false, text: "131 read" });
  for (const h of [waiting, reading, all]) {
    assert.equal(h.offer, false);
    assert.equal(h.subscribe, false);
  }
});

test("no customer text names a limit", () => {
  const states = ["unpaid", "unpaid_waiting", "unpaid_reading", "private_no_plan", "private_paused", "paid_waiting_for_pull_request", "paid_reading", "paid_all_read"];
  for (const state of states) {
    const h = readingHeader({ state, offerPaidPlan: true, documentsRead: 1, documentsTotal: 2, readAtInstallation: 1, readSince: 1, pausedSinceMs: NOW }, NOW);
    assert.doesNotMatch(words(h) + (h.growth?.text || ""), /\b(limit|cap|budget|only \d+)\b/i);
  }
});
