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

// A folder has no tab bar.
await page.getByRole("button", { name: /^docs\b/ }).first().click().catch(() => {});
assert.equal(await page.getByRole("tab", { name: "Document" }).count(), 0, "folder or repository shows no tabs");

// A doc with rules has Rules | Document, on Rules by default.
await page.getByRole("button", { name: /ARCHITECTURE\.md/ }).first().click();
await page.getByRole("tab", { name: "Document" }).waitFor();
assert.equal(await page.getByRole("tab", { name: /^Rules/ }).getAttribute("aria-selected"), "true");

await page.getByRole("tab", { name: "Document" }).click();
await page.waitForSelector(".dv-doc");
for (const kind of ["holds", "broken", "unchecked", "excluded", "stale"]) {
  assert.ok(await page.locator(`.dv-doc .dv-mark.is-${kind}`).count() > 0, `${kind} is drawn`);
}
assert.ok(await page.locator(".dv-doc .dv-block.is-holds").count() > 0, "a table row or diagram line is a block");
assert.ok(await page.locator(".dv-divider").count() === 1, "partly read divider");
assert.ok((await page.locator(".dv-unplaced li").count()) === 1, "one rule is not marked in the text");

// A click opens the card, a second click and Escape close it.
const mark = page.locator(".dv-doc .dv-mark.is-broken").first();
await mark.click();
assert.equal(await page.locator(".dv-card").count(), 1);
await mark.click();
assert.equal(await page.locator(".dv-card").count(), 0);
await mark.click();
await page.keyboard.press("Escape");
assert.equal(await page.locator(".dv-card").count(), 0);

// Source view and back.
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
