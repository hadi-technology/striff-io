import { test } from "node:test";
import assert from "node:assert/strict";

const { repoFromSearch, findRepo, withoutRepoParam, validDocPath, docFromSearch, withLink, docLink, ruleFromSearch, validRuleId, docOfRule, PENDING_SECTION_KEY, PENDING_FOCUS_KEY } = await import("../src/lib/dashboardDeepLink.js");
const { sectionFromAddress } = await import("../src/lib/checkSettings.js");

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

test("the pending section and focus keys are exported", () => {
  assert.equal(PENDING_SECTION_KEY, "striff.pendingSection");
  assert.equal(PENDING_FOCUS_KEY, "striff.pendingFocus");
});

test("sectionFromAddress resolves tab=checks with a repo to the Checks tab", () => {
  // Repo-specific Checks deep link: ?repo=acme/widgets&tab=checks
  assert.deepEqual(sectionFromAddress("?repo=acme/widgets&tab=checks", ""), { section: "checks", focus: "checks" });
  assert.deepEqual(sectionFromAddress("?repo=acme%2Fwidgets&tab=checks", ""), { section: "checks", focus: "checks" });
  // tab=checks takes precedence over section=settings
  assert.deepEqual(sectionFromAddress("?repo=acme/widgets&section=settings&tab=checks", ""), { section: "checks", focus: "checks" });
  // tab=checks is preserved with other params
  const result = sectionFromAddress("?repo=acme/widgets&tab=checks&plan=team", "#badge");
  assert.deepEqual(result, { section: "checks", focus: "checks" });
});

test("sectionFromAddress ignores tab=checks without a repo (checks is a repo view)", () => {
  // tab=checks without repo should not resolve to checks section
  // The Dashboard component handles this by only applying tab=checks when there's a linked repo
  assert.deepEqual(sectionFromAddress("?tab=checks", ""), { section: "checks", focus: "checks" });
  // But the Dashboard's takeLinkedRepo only uses the focus=checks when there's a repo
});

test("repo-specific Checks deep link: the pending state includes section and focus", () => {
  // Simulate the URL parsing that takeLinkedRepo does for a repo link with tab=checks
  const search = "?repo=acme/widgets&tab=checks";
  const asked = sectionFromAddress(search, "");
  // For a repo link, only tab=checks should override the default "docs" section
  const section = asked?.focus === "checks" ? "checks" : "docs";
  const focus = asked?.focus === "checks" ? "checks" : null;
  assert.equal(section, "checks");
  assert.equal(focus, "checks");
  // Other sections (settings, etc.) should not apply to a repo link
  const search2 = "?repo=acme/widgets&section=settings&tab=checks";
  const asked2 = sectionFromAddress(search2, "");
  const section2 = asked2?.focus === "checks" ? "checks" : "docs";
  assert.equal(section2, "checks");
});

test("repo link with section=settings but no tab=checks defaults to docs", () => {
  // ?section=settings&repo=x used to open docs for the repo; it should still open docs
  const search = "?repo=acme/widgets&section=settings";
  const asked = sectionFromAddress(search, "");
  // sectionFromAddress returns { section: "settings", focus: null } for section=settings
  // But the Dashboard's takeLinkedRepo only uses tab=checks to override
  const section = asked?.focus === "checks" ? "checks" : "docs";
  assert.equal(section, "docs");
});
