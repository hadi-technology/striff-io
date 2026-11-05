// Smoke test of the Document tab on /demo. Run with the dev server up: `npm run dev`, then
// `npm run test:e2e` (BASE_URL defaults to http://localhost:4321).
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let textRequests = 0;
page.on("request", (r) => { if (r.url().includes("doc-text")) textRequests++; });

await page.goto(`${base}/demo/`, { waitUntil: "networkidle" });

// The document chips partition the documents: with no Retired chip, their counts add up to All.
const chips = await page.locator(".docs-filter").evaluateAll((els) =>
  els.map((el) => [el.textContent.replace(/\s*\d+$/, "").trim(), Number(el.textContent.match(/(\d+)\s*$/)?.[1])]));
const countOf = (label) => chips.find(([name]) => name === label)?.[1];
assert.ok(!chips.some(([name]) => name === "Retired"), "no Retired chip");
const parts = ["With rules", "No rules", "Not read yet", "Couldn't read", "Excluded"];
assert.equal(parts.reduce((sum, name) => sum + (countOf(name) || 0), 0), countOf("All"), `document chips add up to All (${JSON.stringify(chips)})`);

// A folder has no tab bar.
await page.getByRole("button", { name: /^docs\b/ }).first().click().catch(() => {});
assert.equal(await page.getByRole("tab", { name: "Document" }).count(), 0, "folder or repository shows no tabs");

// A doc with rules has Rules | Document, on Rules by default.
await page.getByRole("button", { name: /ARCHITECTURE\.md/ }).first().click();
await page.getByRole("tab", { name: "Document" }).waitFor();
assert.equal(await page.getByRole("tab", { name: /^Rules/ }).getAttribute("aria-selected"), "true");

await page.getByRole("tab", { name: "Document" }).click();
await page.waitForSelector(".dv-doc");
for (const kind of ["holds", "broken", "unchecked", "unclear", "excluded", "stale"]) {
  assert.ok(await page.locator(`.dv-doc .dv-mark.is-${kind}`).count() > 0, `${kind} is drawn`);
}
assert.ok(await page.locator(".dv-doc .dv-block.is-holds").count() > 0, "a table row or diagram line is a block");
assert.ok(await page.locator(".dv-divider").count() === 1, "partly read divider");
assert.ok((await page.locator(".dv-unplaced li").count()) === 1, "one rule is not marked in the text");

// A click on a stale name goes to its row in the stale names table; no card opens.
await page.getByRole("tab", { name: "Document" }).click();
const gone = page.locator('.dv-doc .dv-mark.is-stale[data-ids*="billing.LedgerEntry"]').first();
await gone.scrollIntoViewIfNeeded();
assert.match(await gone.getAttribute("aria-label"), /Stale name · click to see it in the table/);
await gone.click();
assert.equal(await page.getByRole("tab", { name: /^Rules/ }).getAttribute("aria-selected"), "true");
assert.equal(await page.locator(".dv-card").count(), 0, "no card");
await page.locator('.docs-stale-table tr.is-target[data-stale^="billing.LedgerEntry@"]').waitFor();
assert.equal(await page.locator("tr.is-target").count(), 1, "only the stale row is the target");
await page.waitForTimeout(700);
assert.ok(await page.locator("tr.is-target").evaluate((el) => el === document.activeElement), "stale row focused");

// A mark over a rule and a stale name targets both, and Back to the document returns to the spot.
await page.getByRole("tab", { name: "Document" }).click();
const mixed = page.locator('.dv-doc .dv-mark[data-ids*="stale:"][data-ids*="ARCHITECTURE.md|"]').first();
await mixed.scrollIntoViewIfNeeded();
assert.match(await mixed.getAttribute("aria-label"), /a rule and a stale name · click to see them/);
const spot = await page.evaluate(() => window.scrollY);
await mixed.click();
await page.locator(".docs-stale-table tr.is-target").waitFor();
await page.locator(".rules-table tr.is-target").waitFor();
await page.waitForTimeout(700);
const back = page.getByRole("button", { name: /Back to the document/ });
assert.equal(await back.count(), 1, "a way back while targets are outlined");
await back.click();
assert.equal(await page.getByRole("tab", { name: "Document" }).getAttribute("aria-selected"), "true");
await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 4, spot, { timeout: 3000 }).catch(() => {});
assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - spot) < 4, "back at the spot");
assert.equal(await page.getByRole("button", { name: /Back to the document/ }).count(), 0, "the way back goes with the outline");

// A row with a mark in the text can show it there.
await page.getByRole("tab", { name: /^Rules/ }).click();
const shown = page.locator("tr", { hasText: "Domain events are published only through" }).first();
await shown.getByRole("button", { name: "Show in document" }).click();
await page.waitForSelector(".dv-doc");
await page.waitForTimeout(800);
assert.ok(await page.evaluate(() => document.activeElement?.classList.contains("dv-mark")), "the mark is focused");
const markBox = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return [r.top, r.bottom, window.innerHeight]; });
assert.ok(markBox[0] >= 0 && markBox[1] <= markBox[2], "the mark is on screen");

// A click on a rule's words goes to that rule in the Rules tab, whatever its kind.
for (const kind of ["holds", "broken", "unchecked", "unclear", "excluded"]) {
  await page.getByRole("tab", { name: "Document" }).click();
  const target = page.locator(`.dv-doc .dv-mark.is-${kind}`).first();
  await target.scrollIntoViewIfNeeded();
  const ids = (await target.getAttribute("data-ids")).split("\n");
  const before = await page.evaluate(() => window.scrollY);
  await target.click();
  assert.equal(await page.getByRole("tab", { name: /^Rules/ }).getAttribute("aria-selected"), "true", `${kind}: Rules tab`);
  assert.equal(await page.locator(".dv-card").count(), 0, `${kind}: no card`);
  const row = page.locator(`tr.is-target[data-rule="${ids[0]}"]`);
  await row.waitFor();
  assert.equal(await page.locator("tr.is-target").count(), ids.length, `${kind}: every rule at the mark is the target`);
  assert.ok(await row.evaluate((el) => el === document.activeElement), `${kind}: row focused`);
  await page.waitForTimeout(700);
  const box = await row.boundingBox();
  const height = await page.evaluate(() => window.innerHeight);
  assert.ok(box && box.y >= 0 && box.y + box.height <= height, `${kind}: row on screen`);
  // Back in the document, the reader is where they clicked.
  await page.getByRole("tab", { name: "Document" }).click();
  assert.equal(await page.locator("tr.is-target").count(), 0);
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 4, before, { timeout: 3000 }).catch(() => {});
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - before) < 4, `${kind}: place kept`);
}

// Escape puts the outline and the way back out.
await page.getByRole("tab", { name: "Document" }).click();
await page.locator(".dv-doc .dv-mark.is-holds").first().click();
await page.locator("tr.is-target").first().waitFor();
assert.equal(await page.getByRole("button", { name: /Back to the document/ }).count(), 1);
await page.keyboard.press("Escape");
assert.equal(await page.locator("tr.is-target").count(), 0, "Escape puts the outline out");
assert.equal(await page.getByRole("button", { name: /Back to the document/ }).count(), 0, "and the way back");

// Show in document on one doc, then another doc and back: nothing is scrolled to or focused on return.
await page.getByRole("tab", { name: /^Rules/ }).click();
await page.locator("tr", { hasText: "Domain events are published only through" }).first().getByRole("button", { name: "Show in document" }).click();
await page.waitForSelector(".dv-doc");
await page.waitForTimeout(900);
await page.getByRole("button", { name: /^AGENTS\.md/ }).first().click();
await page.getByRole("button", { name: /ARCHITECTURE\.md/ }).first().click();
await page.waitForTimeout(600);
assert.ok(!(await page.evaluate(() => document.activeElement?.classList.contains("dv-mark"))), "no mark is focused on return");

// A search that hides the rule is cleared by the jump.
await page.getByRole("tab", { name: /^Rules/ }).click();
await page.getByPlaceholder(/Search/).fill("zzzz-no-such-rule");
await page.getByRole("tab", { name: "Document" }).click();
await page.locator(".dv-doc .dv-mark.is-unclear").first().click();
await page.locator("tr.is-target").first().waitFor();
assert.equal(await page.getByPlaceholder(/Search/).inputValue(), "");

// The outline stays until the next click.
await page.locator("h1, .docs-rule-count").first().click();
assert.equal(await page.locator("tr.is-target").count(), 0);

// Source view and back.
await page.getByRole("tab", { name: "Document" }).click();
await page.getByRole("button", { name: "Source" }).click();
assert.ok(await page.locator(".dv-source .dv-mark").count() > 0, "source view keeps the marks");
await page.getByRole("button", { name: "Formatted" }).click();

// Back and forth between tabs does not ask again (the demo asks nothing at all).
await page.getByRole("tab", { name: /^Rules/ }).click();
await page.getByRole("tab", { name: "Document" }).click();
assert.equal(textRequests, 0);

// A phone: no sideways scroll on the page.
await page.setViewportSize({ width: 375, height: 900 });
const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
assert.ok(widths[0] <= widths[1], `no horizontal scroll at 375px (${widths})`);

// With ?slow=1 the example waits, and the page shows placeholders in the shape of what is coming.
const slow = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await slow.goto(`${base}/demo/?slow=1`, { waitUntil: "domcontentloaded" });
await slow.waitForSelector(".sk");
assert.ok(await slow.locator('[aria-busy="true"]').count() > 0, "the waiting area is marked busy");
assert.ok(await slow.locator(".sk-area .sr-only").first().textContent(), "and says what it waits for");
assert.equal(await slow.locator(".docs-tree").count(), 0, "no tree yet");
await slow.waitForSelector(".docs-tree", { timeout: 8000 });
assert.equal(await slow.locator(".sk").count(), 0, "the placeholders are replaced, not left beside the content");
await slow.close();

await browser.close();
assert.deepEqual(errors, []);
console.log("document view smoke test passed");
