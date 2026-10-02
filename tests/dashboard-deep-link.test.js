import { test } from "node:test";
import assert from "node:assert/strict";

const { repoFromSearch, findRepo, withoutRepoParam } = await import("../src/lib/dashboardDeepLink.js");

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
