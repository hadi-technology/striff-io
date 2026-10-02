import { test } from "node:test";
import assert from "node:assert/strict";

const { allowedPath } = await import("../netlify/functions/github-proxy.js");

test("the caller's own listings and one repository may be asked for", () => {
  assert.equal(allowedPath("/user/installations?per_page=100&page=1"), true);
  assert.equal(allowedPath("/user/installations/12/repositories?per_page=100"), true);
  assert.equal(allowedPath("/repos/acme/widgets"), true);
  assert.equal(allowedPath("/repos/acme/my.lib"), true);
});

test("nothing below a repository, and nothing that escapes, is forwarded", () => {
  for (const path of [
    undefined,
    "",
    "/user/../repos/acme/widgets/contents/x",
    "/repos/acme/widgets/contents/README.md",
    "/repos/acme/widgets?ref=x",
    "/repos/acme/.",
    "/repos/-acme/widgets",
    "/repos/acme",
    "/orgs/acme",
  ]) {
    assert.equal(allowedPath(path), false, String(path));
  }
});
