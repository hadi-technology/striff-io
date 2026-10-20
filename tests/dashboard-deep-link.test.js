import { test } from "node:test";
import assert from "node:assert/strict";

const { repoFromSearch, findRepo, withoutRepoParam, validDocPath, docFromSearch, withLink, docLink } = await import("../src/lib/dashboardDeepLink.js");

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
