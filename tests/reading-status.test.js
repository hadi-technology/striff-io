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

test("the offer names what a paid plan would read, and says all of them where the API does not say", () => {
  const base = { state: "unpaid", offerPaidPlan: true, documentsRead: 10, documentsTotal: 15 };
  assert.equal(readingHeader({ ...base, documentsPaidWouldRead: 3 }).offerText, "Don't want to wait? A paid plan reads the other 3 now.");
  assert.equal(readingHeader({ ...base, documentsPaidWouldRead: 1 }).offerText, "Don't want to wait? A paid plan reads the other 1 now.");
  assert.equal(readingHeader(base).offerText, "Don't want to wait? A paid plan reads all of them now.");
});

test("paid, all read: documents Striff excluded are not counted, and the header says what was checked", () => {
  const status = { state: "paid_all_read", documentsRead: 15, documentsTotal: 15 };
  assert.equal(words(readingHeader(status, NOW, 4)), "Striff has read all 15 documents it can check.");
  assert.equal(words(readingHeader(status, NOW, 0)), "Striff has read all 15 documents.");
  assert.equal(words(readingHeader(status, NOW)), "Striff has read all 15 documents.");
  // A field an earlier API sent changes nothing: no clause about reading free when a change touches code.
  const old = readingHeader({ ...status, documentsReadWhenTouched: 2 }, NOW, 0);
  assert.doesNotMatch(words(old), /touches/);
});

test("paid, reading: what is not read is what is left", () => {
  const h = readingHeader({ state: "paid_reading", documentsRead: 40, documentsTotal: 136, documentsNotRead: 96 });
  assert.equal(words(h), "Striff is reading the other 96 documents: 40 read so far.");
});

test("an unpaid header names the documents it can check where some are excluded", () => {
  const status = { state: "unpaid", offerPaidPlan: true, documentsRead: 9, documentsTotal: 12, readAtInstallation: 7, readSince: 2 };
  assert.match(words(readingHeader(status, NOW, 3)), /^Striff has read 9 of the 12 documents it can check, starting with the ones most tied to your code\./);
  assert.match(words(readingHeader(status, NOW, 0)), /^Striff has read 9 of your 12 documents, starting/);
});

test("the gap counts any document the status leaves out, so a person's exclusions say it can check", () => {
  // The page passes listed documents less documentsTotal: 3 person-excluded documents make 3.
  const status = { state: "unpaid", offerPaidPlan: true, documentsRead: 9, documentsTotal: 12, documentsNotRead: 3, readAtInstallation: 9, readSince: 0 };
  assert.match(words(readingHeader(status, NOW, 3)), /^Striff has read 9 of the 12 documents it can check,/);
});

test("unpaid with nothing left reads like paid, with no offer and no bar", () => {
  const status = { state: "unpaid", offerPaidPlan: true, documentsRead: 3, documentsTotal: 3, documentsNotRead: 0, readAtInstallation: 3, readSince: 0 };
  const h = readingHeader(status, NOW, 2);
  assert.equal(words(h), "Striff has read all 3 documents it can check.");
  assert.equal(h.offer, false);
  assert.deepEqual(h.growth, { read: 3, total: 3, bar: false, text: "3 read at installation." });
  assert.equal(words(readingHeader(status, NOW, 0)), "Striff has read all 3 documents.");
});

test("nothing to check says why, and says nothing at all where nothing is excluded either", () => {
  for (const state of ["unpaid", "paid_all_read"]) {
    const status = { state, offerPaidPlan: true, documentsRead: 0, documentsTotal: 0, documentsNotRead: 0 };
    const h = readingHeader(status, NOW, 4);
    assert.equal(words(h), "None of this repository's documents states something Striff can check against its code. Each excluded document says why.");
    assert.equal(h.offer, false);
    assert.equal(h.growth, null);
    assert.equal(readingHeader(status, NOW, 0), null);
  }
});

test("one document is never '1 documents'", () => {
  assert.equal(words(readingHeader({ state: "paid_reading", documentsRead: 4, documentsTotal: 5, documentsNotRead: 1 })), "Striff is reading the other 1 document: 4 read so far.");
  assert.equal(words(readingHeader({ state: "paid_all_read", documentsRead: 1, documentsTotal: 1 })), "Striff has read all 1 document.");
  assert.equal(words(readingHeader({ state: "paid_all_read", documentsRead: 1, documentsTotal: 1 }, NOW, 2)), "Striff has read all 1 document it can check.");
  assert.match(words(readingHeader({ state: "unpaid", documentsRead: 1, documentsTotal: 2, documentsNotRead: 1 }, NOW, 1)), /^Striff has read 1 of the 2 documents it can check,/);
  assert.match(words(readingHeader({ state: "unpaid", documentsRead: 1, documentsTotal: 1 + 1, documentsNotRead: 1 })), /^Striff has read 1 of your 2 documents,/);
  assert.equal(readingHeader({ state: "unpaid", offerPaidPlan: true, documentsRead: 1, documentsTotal: 2, documentsNotRead: 1, documentsPaidWouldRead: 1 }).offerText, "Don't want to wait? A paid plan reads the other 1 now.");
});
