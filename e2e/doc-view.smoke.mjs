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

// A click on a stale name opens the card, a second click and Escape close it.
const mark = page.locator(".dv-doc .dv-mark.is-stale").first();
await mark.click();
assert.equal(await page.locator(".dv-card").count(), 1);
await mark.click();
assert.equal(await page.locator(".dv-card").count(), 0);
await mark.click();
await page.keyboard.press("Escape");
assert.equal(await page.locator(".dv-card").count(), 0);

// A click on a rule's words goes to that rule in the Rules tab, whatever its kind.
for (const kind of ["holds", "broken", "unchecked", "unclear", "excluded"]) {
  await page.getByRole("tab", { name: "Document" }).click();
  const target = page.locator(`.dv-doc .dv-mark.is-${kind}`).first();
  await target.scrollIntoViewIfNeeded();
  const ids = (await target.getAttribute("data-ids")).split(" ");
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

await browser.close();
assert.deepEqual(errors, []);
console.log("document view smoke test passed");
