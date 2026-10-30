// Smoke test of the Dashboard's Settings tab's Notifications section against mocked function answers. Run with the
// dev server up: `npm run dev`, then `node e2e/notifications.smoke.mjs` (BASE_URL defaults to
// http://localhost:4321). SHOTS=<dir> also writes screenshots of each state there.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:4321";
const shots = process.env.SHOTS || "";
const repos = ["acme/widgets", "acme/api-gateway", "acme/docs-site", "acme/a-repository-with-a-really-long-name-for-phones"]
  .map((full_name) => ({ full_name, private: true, html_url: `https://github.com/${full_name}`, default_branch: "main" }));

const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

async function open(browser, viewport, settings, puts, accountType = "Organization") {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/.netlify/functions/**", (route) => route.fulfill(json({ error: "not mocked" }, 500)));
  await page.route("**/.netlify/functions/dashboard-bootstrap", (route) => route.fulfill(json({
    authenticated: true,
    user: { login: "alice", avatar_url: "", name: "Alice" },
    installations: [{ id: 7, account: { login: "acme", avatar_url: "", type: accountType }, repository_selection: "selected", repositories: repos }],
  })));
  await page.route("**/.netlify/functions/billing-proxy", (route) => route.fulfill(json({ hasSubscription: false })));
  await page.route("**/.netlify/functions/notifications**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      puts.push(JSON.parse(request.postData()));
      return route.fulfill(json({ ok: true }));
    }
    return route.fulfill(json(settings));
  });
  await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
  // With a repository open the tab row shows its views; the account's tabs are one step up.
  await page.getByRole("button", { name: /^acme/ }).first().click().catch(() => {});
  await page.getByRole("button", { name: /^Settings/ }).first().click();
  await page.getByRole("heading", { name: "Notifications" }).waitFor();
  return { page, context, errors };
}

const member = { enabled: true, scope: "ALL", repos: [], unsubscribedAll: false, installationEnabled: true, defaultForNewRepos: false, canManageInstallation: false };
const admin = { ...member, canManageInstallation: true };
const noScroll = async (page, label) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(scroll <= width, `no horizontal scroll: ${label} (${scroll} > ${width})`);
};
const snap = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

const browser = await chromium.launch();
try {
  // A non-admin, opted in to all: no installation-wide controls.
  let puts = [];
  let s = await open(browser, { width: 1280, height: 900 }, member, puts);
  assert.equal(await s.page.getByRole("switch", { name: "Email me when a push breaks a documented rule" }).getAttribute("aria-checked"), "true");
  assert.equal(await s.page.getByRole("switch", { name: "Turn off break notices for everyone" }).getAttribute("aria-disabled"), "true", "a member sees them read-only");
  assert.equal(await s.page.getByText(/Updating|Saving/).count(), 0, "no progress states");
  assert.equal(await s.page.getByRole("button", { name: "Save" }).isDisabled(), true, "nothing to save yet");
  await snap(s.page, "desktop-member-all");

  // Choosing repositories and saving.
  await s.page.getByLabel("Only the ones I choose").check();
  await s.page.getByLabel("acme/widgets").check();
  await s.page.getByLabel("acme/docs-site").check();
  await snap(s.page, "desktop-member-repos");
  await s.page.getByRole("button", { name: "Save" }).click();
  await s.page.getByText("Saved.").waitFor();
  assert.deepEqual(puts[0], { installation_id: 7, enabled: true, scope: "REPOS", repos: ["acme/widgets", "acme/docs-site"] });
  await s.context.close();

  // A non-admin who is off.
  puts = [];
  s = await open(browser, { width: 1280, height: 900 }, { ...member, enabled: false }, puts);
  assert.equal(await s.page.getByRole("switch", { name: "Email me when a push breaks a documented rule" }).getAttribute("aria-checked"), "false");
  assert.equal(await s.page.getByText("Which repositories").count(), 0, "scope is hidden while off");
  await snap(s.page, "desktop-member-off");
  await s.page.getByRole("switch", { name: "Email me when a push breaks a documented rule" }).click();
  await s.page.getByRole("button", { name: "Save" }).click();
  await s.page.getByText("Saved.").waitFor();
  assert.equal(puts[0].enabled, true);
  assert.ok(!("installationEnabled" in puts[0]), "a member never sends the admin fields");
  await s.context.close();

  // An admin sees and saves the installation-wide controls.
  puts = [];
  s = await open(browser, { width: 1280, height: 900 }, admin, puts);
  await s.page.getByText("For everyone", { exact: true }).waitFor();
  await snap(s.page, "desktop-admin");
  await s.page.getByRole("switch", { name: "Turn off break notices for everyone" }).click();
  await s.page.getByRole("switch", { name: "New people get emails for all repositories" }).click();
  await s.page.getByRole("button", { name: "Save" }).click();
  await s.page.getByText("Saved.").waitFor();
  assert.equal(puts[0].installationEnabled, false);
  assert.equal(puts[0].defaultForNewRepos, true);
  await s.context.close();

  // Unsubscribed through an email link, and an installation that is off.
  s = await open(browser, { width: 1280, height: 900 }, { ...admin, unsubscribedAll: true, installationEnabled: false }, []);
  await s.page.getByText(/You unsubscribed/).waitFor();
  await s.page.getByText(/Break notices are turned off for everyone in your organization/).waitFor();
  assert.equal(await s.page.getByRole("switch", { name: "Email me when a push breaks a documented rule" }).getAttribute("aria-checked"), "false");
  await s.context.close();

  // A personal account: no installation-wide group, no owners-only note, the word "organization" nowhere,
  // and a save that never sends the installation-wide fields.
  puts = [];
  s = await open(browser, { width: 1280, height: 900 }, admin, puts, "User");
  assert.equal(await s.page.getByText("For everyone", { exact: true }).count(), 0, "no for-everyone group");
  assert.equal(await s.page.getByText("Only organization owners").count(), 0);
  assert.equal(await s.page.getByText("organization", { exact: false }).count(), 0, "never the word organization");
  assert.equal(await s.page.getByText("Let repository admins change these settings").count(), 0, "no lock");
  await s.page.getByRole("switch", { name: "Email me when a push breaks a documented rule" }).click();
  await s.page.getByRole("button", { name: "Save" }).last().click();
  await s.page.getByText("Saved.").waitFor();
  assert.ok(!("installationEnabled" in puts[0]) && !("defaultForNewRepos" in puts[0]), "a person never sends the installation-wide fields");
  await s.context.close();

  // Phone width.
  for (const [name, settings] of [["member-repos", { ...member, scope: "REPOS", repos: ["acme/widgets"] }], ["admin", admin]]) {
    s = await open(browser, { width: 375, height: 800 }, settings, []);
    await noScroll(s.page, `phone ${name}`);
    await snap(s.page, `phone-${name}`);
    await s.context.close();
  }
  assert.deepEqual(s.errors, []);
} finally {
  await browser.close();
}
console.log("notifications smoke: ok");
