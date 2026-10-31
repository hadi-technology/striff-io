import { test } from "node:test";
import assert from "node:assert/strict";
import { brokenBy, shortName, witnesses } from "../src/lib/brokenBy.js";

// What production returns for a broken rule: gaia's apps/api/CLAUDE.md rule e7a83db0a0b2, and
// agentbridge's AGENTS.md rule 429d2aac1453.
const NOTE = "already broken before this change; this change did not add to it";
const P = "apps.api.app.services.providers.provider_credentials_service";
const GAIA = [
  NOTE,
  `apps.api.app.config.token_repository.resolve_google_oauth_credentials -violates-> ${P}.GoogleOAuthClient`,
  `apps.api.app.config.token_repository.resolve_google_oauth_credentials -violates-> ${P}.google_oauth_client`,
  `apps.api.app.config.cloudinary.init_cloudinary -violates-> ${P}.cloudinary_account`,
  `apps.api.app.config.cloudinary.init_cloudinary -violates-> ${P}.resolved_config`,
];
const AGENTBRIDGE = [NOTE, "com.github.catatafishen.agentbridge.ui.ChatDataModelKt"];

test("the already-broken notes are not witnesses", () => {
  assert.deepEqual(witnesses([NOTE, "the code at this revision does not uphold this"]), []);
  assert.deepEqual(brokenBy([NOTE]), { lines: [], more: 0 });
  assert.equal(witnesses(GAIA).length, 4);
});

test("gaia reads as two sources, each with what it reaches", () => {
  const { lines, more } = brokenBy(GAIA);
  assert.equal(more, 0);
  assert.deepEqual(lines.map((l) => [shortName(l.from), l.to.map(shortName)]), [
    ["token_repository.resolve_google_oauth_credentials",
      ["provider_credentials_service.GoogleOAuthClient", "provider_credentials_service.google_oauth_client"]],
    ["cloudinary.init_cloudinary",
      ["provider_credentials_service.cloudinary_account", "provider_credentials_service.resolved_config"]],
  ]);
});

test("a lone name is a witness with nothing it reaches", () => {
  const { lines } = brokenBy(AGENTBRIDGE);
  assert.deepEqual(lines, [{ from: "com.github.catatafishen.agentbridge.ui.ChatDataModelKt", text: false, to: [], moreTo: 0 }]);
});

test("a file and line is a name like any other: nothing is linked or rewritten", () => {
  assert.deepEqual(brokenBy(["app/config/cloudinary.py:14"]).lines[0].from, "app/config/cloudinary.py:14");
});

test("shortening keeps the last two segments of a dotted name, in any language", () => {
  assert.equal(shortName("com.app.domain.Order"), "domain.Order");
  assert.equal(shortName("Order"), "Order");
  assert.equal(shortName("pkg.Order"), "pkg.Order");
  assert.equal(shortName("src/app/order.ts"), "src/app/order.ts");
  assert.equal(shortName("a::b::C"), "a::b::C");
});

test("no witness gives nothing, whatever shape the field has", () => {
  for (const none of [undefined, null, [], [""], ["  "], "x", [3]]) {
    assert.deepEqual(brokenBy(none), { lines: [], more: 0 });
  }
});

test("a repeated witness is listed once; past the limit the rest are counted", () => {
  const edges = ["a.A -> z.Z", "a.A -> z.Z", "b.B -> z.Z", "c.C -> z.Z", "d.D -> z.Z", "e.E -> z.Z"];
  const out = brokenBy(edges);
  assert.deepEqual(out.lines.map((l) => l.from), ["a.A", "b.B", "c.C"]);
  assert.equal(out.more, 2);
});

test("one source with many targets lists three and counts the rest", () => {
  const out = brokenBy(["a.A -> t.1", "a.A -> t.2", "a.A -> t.3", "a.A -> t.4", "a.A -> t.5"]);
  assert.equal(out.lines[0].to.length, 3);
  assert.equal(out.lines[0].moreTo, 2);
});

test("any other line is a witness, shown as written", () => {
  const sentence = "web/Cart.java imports billing";
  assert.deepEqual(brokenBy([NOTE, sentence]).lines, [{ from: sentence, text: true, to: [], moreTo: 0 }]);
  assert.deepEqual(witnesses(["In the code: Order has total"]).map((w) => w.text), [true]);
});
