import { test } from "node:test";
import assert from "node:assert/strict";

const { repoFromSearch, findRepo, withoutRepoParam, validDocPath, docFromSearch, withLink, docLink, ruleFromSearch, validRuleId, docOfRule, PENDING_SECTION_KEY } = await import("../src/lib/dashboardDeepLink.js");
const { sectionFromAddress, resolveSection, validSection } = await import("../src/lib/checkSettings.js");

test("a dashboard address names a repository only where GitHub could have named it", () => {
  assert.equal(repoFromSearch("?repo=acme/secret"), "acme/secret");
  assert.equal(repoFromSearch("repo=acme%2Fsecret"), "acme/secret");
  assert.equal(repoFromSearch("?repo=Acme/My.Repo_1"), "Acme/My.Repo_1");
  for (const bad of ["", "?repo=", "?repo=acme", "?repo=acme/..", "?repo=../x", "?repo=a/b/c",
    "?repo=-acme/x", "?repo=acme/x%20y", "?plan=team"]) {
    assert.equal(repoFromSearch(bad), null, bad);
  }
});

test("the repository opens under the installation that covers it, as GitHub spells it", () => {
  const installations = [
    { id: 1, repositories: [{ full_name: "other/thing" }] },
    { id: 2, repositories: [{ full_name: "Acme/Secret" }, { full_name: "acme/widgets" }] },
  ];
  assert.deepEqual(findRepo(installations, "acme/secret"), { installationId: 2, fullName: "Acme/Secret" });
  assert.equal(findRepo(installations, "acme/missing"), null);
  assert.equal(findRepo([], "acme/secret"), null);
  assert.equal(findRepo([{ id: 3 }], "acme/secret"), null);
});

test("only the repo parameter is taken out of the address", () => {
  assert.equal(withoutRepoParam("https://striff.io/dashboard?repo=acme/secret"), "/dashboard");
  assert.equal(withoutRepoParam("https://striff.io/dashboard?repo=acme/secret&plan=team#badge"),
    "/dashboard?plan=team#badge");
});

test("an address names a document by its repository-relative path, encoded either way", () => {
  assert.equal(docFromSearch("?repo=a/b&doc=AGENTS.md"), "AGENTS.md");
  assert.equal(docFromSearch("?doc=docs%2Fdesign%2Fcore.md"), "docs/design/core.md");
  assert.equal(docFromSearch("?doc=docs/design/core.md"), "docs/design/core.md");
  assert.equal(docFromSearch("?doc=docs%2FMy%20Notes%20%26%20More.md"), "docs/My Notes & More.md");
  for (const bad of ["", "?doc=", "?repo=a/b", "?doc=/etc/hosts", "?doc=../x.md", "?doc=a/../b.md",
    "?doc=a//b.md", "?doc=%00x.md"]) {
    assert.equal(docFromSearch(bad), null, bad);
  }
  assert.equal(validDocPath(undefined), null);
  assert.equal(validDocPath("a".repeat(501)), null);
});

test("the address gets and loses its repo and doc, and keeps the rest", () => {
  const href = "https://striff.io/dashboard?plan=team&repo=acme/x#badge";
  assert.equal(withLink(href, { repo: "acme/x", doc: "docs/a b.md" }),
    "/dashboard?plan=team&repo=acme%2Fx&doc=docs%2Fa+b.md#badge");
  assert.equal(withLink(href, { doc: null }), "/dashboard?plan=team&repo=acme%2Fx#badge");
  assert.equal(withLink(href, { repo: null, doc: null }), "/dashboard?plan=team#badge");
  assert.equal(withLink("https://striff.io/acme/x?doc=a.md", { doc: null }), "/acme/x");
});

test("the shared link carries only the repo and doc, and reads back the same", () => {
  const link = docLink("https://striff.io/dashboard?plan=team&installation_id=3#badge", "acme/x", "docs/My Notes.md");
  assert.equal(link, "https://striff.io/dashboard?repo=acme%2Fx&doc=docs%2FMy+Notes.md");
  assert.equal(repoFromSearch(new URL(link).search), "acme/x");
  assert.equal(docFromSearch(new URL(link).search), "docs/My Notes.md");
  assert.equal(docLink("https://striff.io/acme/x", null, "AGENTS.md"), "https://striff.io/acme/x?doc=AGENTS.md");
});

test("an address names a rule by the id the API emits, and it knows its document", () => {
  const id = "architecture/README.md|87b607febdda";
  assert.equal(ruleFromSearch(`?repo=a/b&rule=${encodeURIComponent(id)}`), id);
  assert.equal(ruleFromSearch(`?rule=${id}`), id);
  assert.equal(docOfRule(id), "architecture/README.md");
  assert.equal(docOfRule("AGENTS.md|2"), "AGENTS.md");
  for (const bad of ["", "?rule=", "?rule=nobar", "?rule=|abc", "?rule=a.md|", "?rule=../x.md|abc", "?rule=a.md|a b",
    "?rule=a.md|zz%00", `?rule=a.md|${"f".repeat(65)}`]) {
    assert.equal(ruleFromSearch(bad), null, bad);
  }
  assert.equal(validRuleId(undefined), null);
  assert.equal(docOfRule(null), null);
});

test("the rule parameter is set and taken out with the repo and doc", () => {
  const href = "https://striff.io/dashboard?repo=acme/x&doc=a.md&rule=a.md%7Cabc123";
  assert.equal(withLink(href, { rule: null }), "/dashboard?repo=acme%2Fx&doc=a.md");
  assert.equal(withLink(href, { repo: null, doc: null, rule: null }), "/dashboard");
  assert.equal(withLink("https://striff.io/dashboard", { repo: "acme/x", doc: "a.md", rule: "a.md|abc123" }),
    "/dashboard?repo=acme%2Fx&doc=a.md&rule=a.md%7Cabc123");
  // The shared link for a document never carries a rule.
  assert.equal(docLink(href, "acme/x", "a.md"), "https://striff.io/dashboard?repo=acme%2Fx&doc=a.md");
});

test("the pending section key is exported", () => {
  assert.equal(PENDING_SECTION_KEY, "striff.pendingSection");
});

test("sectionFromAddress returns checks for tab=checks", () => {
  assert.deepEqual(sectionFromAddress("?tab=checks", ""), { section: "checks", focus: "checks" });
  assert.deepEqual(sectionFromAddress("?repo=acme/widgets&tab=checks", ""), { section: "checks", focus: "checks" });
  assert.deepEqual(sectionFromAddress("?repo=acme%2Fwidgets&tab=checks", ""), { section: "checks", focus: "checks" });
  // tab=checks takes precedence over section=settings
  assert.deepEqual(sectionFromAddress("?section=settings&tab=checks", ""), { section: "checks", focus: "checks" });
});

test("sectionFromAddress returns settings for notifications", () => {
  assert.deepEqual(sectionFromAddress("?section=notifications", ""), { section: "settings", focus: "notifications" });
  assert.deepEqual(sectionFromAddress("", "#notifications"), { section: "settings", focus: "notifications" });
  assert.deepEqual(sectionFromAddress("?section=settings", ""), { section: "settings", focus: null });
  assert.deepEqual(sectionFromAddress("", "#settings"), { section: "settings", focus: null });
});

test("sectionFromAddress returns null for unknown sections", () => {
  assert.equal(sectionFromAddress("?section=billing", ""), null);
  assert.equal(sectionFromAddress("", ""), null);
});

test("resolveSection: repo plus tab=checks gives checks", () => {
  assert.equal(resolveSection("acme/widgets", "?repo=acme/widgets&tab=checks", "", null), "checks");
  assert.equal(resolveSection("acme/widgets", "?repo=acme%2Fwidgets&tab=checks", "", null), "checks");
  assert.equal(resolveSection("acme/widgets", "?repo=acme/widgets&tab=checks&plan=team", "#badge", null), "checks");
});

test("resolveSection: repo plus section=settings stays docs", () => {
  assert.equal(resolveSection("acme/widgets", "?repo=acme/widgets&section=settings", "", null), "docs");
  assert.equal(resolveSection("acme/widgets", "?repo=acme/widgets&section=billing", "", null), "docs");
  assert.equal(resolveSection("acme/widgets", "?repo=acme/widgets", "", null), "docs");
});

test("resolveSection: tab=checks without a repo is ignored", () => {
  assert.equal(resolveSection(null, "?tab=checks", "", null), null);
  assert.equal(resolveSection(null, "?tab=checks&plan=team", "", null), null);
});

test("resolveSection: a stored section that is valid is restored", () => {
  assert.equal(resolveSection(null, "", "", "checks"), "checks");
  assert.equal(resolveSection(null, "", "", "settings"), "settings");
  assert.equal(resolveSection(null, "", "", "metrics"), "metrics");
  assert.equal(resolveSection(null, "", "", "billing"), "billing");
  assert.equal(resolveSection(null, "", "", "repos"), "repos");
  assert.equal(resolveSection(null, "", "", "docs"), "docs");
});

test("resolveSection: a stored section that is invalid falls back to address or null", () => {
  // Invalid stored section, no address section -> null
  assert.equal(resolveSection(null, "", "", "invalid"), null);
  assert.equal(resolveSection(null, "", "", ""), null);
  assert.equal(resolveSection(null, "", "", null), null);
  // Invalid stored section, but address has valid section -> address section wins
  // Only settings/notifications are valid address sections
  assert.equal(resolveSection(null, "?section=settings", "", "invalid"), "settings");
  assert.equal(resolveSection(null, "?section=notifications", "", "invalid"), "settings");
  assert.equal(resolveSection(null, "", "#notifications", "invalid"), "settings");
});

test("validSection validates dashboard sections", () => {
  assert.equal(validSection("repos"), "repos");
  assert.equal(validSection("docs"), "docs");
  assert.equal(validSection("checks"), "checks");
  assert.equal(validSection("metrics"), "metrics");
  assert.equal(validSection("billing"), "billing");
  assert.equal(validSection("settings"), "settings");
  assert.equal(validSection("invalid"), null);
  assert.equal(validSection(""), null);
  assert.equal(validSection(null), null);
  assert.equal(validSection(undefined), null);
  assert.equal(validSection(123), null);
});
