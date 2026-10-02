import { test } from "node:test";
import assert from "node:assert/strict";

const { badgeImageUrl, badgeLinkUrl, badgeSnippet, isRootReadme, readmeEditUrl } =
  await import("../src/lib/badgeSnippets.js");

test("the badge's address carries a style other than flat, and a key only where given", () => {
  assert.equal(badgeImageUrl("acme", "widgets"), "https://striff.io/badge/acme/widgets.svg");
  assert.equal(badgeImageUrl("acme", "widgets", { style: "flat" }), "https://striff.io/badge/acme/widgets.svg");
  assert.equal(badgeImageUrl("acme", "widgets", { style: "for-the-badge", token: "ab12" }),
    "https://striff.io/badge/acme/widgets.svg?style=for-the-badge&token=ab12");
  assert.equal(badgeImageUrl("acme", "widgets", { preview: true }), "https://striff.io/badge/acme/widgets.svg?preview=1");
});

test("a public repository's badge links to its page, in every markup, with no tracking", () => {
  const image = badgeImageUrl("acme", "widgets", { style: "flat-square" });
  const link = badgeLinkUrl("acme", "widgets");
  assert.equal(link, "https://striff.io/acme/widgets");
  assert.equal(badgeSnippet("markdown", image, link),
    "[![Striff](https://striff.io/badge/acme/widgets.svg?style=flat-square)](https://striff.io/acme/widgets)");
  assert.equal(badgeSnippet("html", image, link),
    '<a href="https://striff.io/acme/widgets"><img src="https://striff.io/badge/acme/widgets.svg?style=flat-square" alt="Striff"></a>');
  assert.equal(badgeSnippet("rst", image, link),
    ".. image:: https://striff.io/badge/acme/widgets.svg?style=flat-square\n   :target: https://striff.io/acme/widgets\n   :alt: Striff");
  assert.equal(badgeSnippet("asciidoc", image, link),
    'image:https://striff.io/badge/acme/widgets.svg?style=flat-square[Striff,link="https://striff.io/acme/widgets"]');
});

test("a private repository's badge carries its key and links to it on the dashboard", () => {
  const image = badgeImageUrl("acme", "secret", { token: "ab12" });
  const link = badgeLinkUrl("acme", "secret", { privateRepo: true });
  assert.equal(link, "https://striff.io/dashboard?repo=acme/secret");
  for (const format of ["markdown", "html", "rst", "asciidoc"]) {
    const snippet = badgeSnippet(format, image, link);
    assert.ok(snippet.includes("https://striff.io/badge/acme/secret.svg?token=ab12"), format);
    assert.ok(snippet.includes("https://striff.io/dashboard?repo=acme/secret"), format);
    assert.ok(!snippet.includes("striff.io/acme/secret"), format);
    assert.ok(!snippet.includes("utm_"), format);
  }
  assert.equal(badgeSnippet("markdown", image, link),
    "[![Striff](https://striff.io/badge/acme/secret.svg?token=ab12)](https://striff.io/dashboard?repo=acme/secret)");
});

test("the README is opened in GitHub's editor, or a new one is started", () => {
  assert.equal(isRootReadme("README.md"), true);
  assert.equal(isRootReadme("readme"), true);
  assert.equal(isRootReadme("docs/README.md"), false);
  assert.equal(isRootReadme("README.mdx"), false);
  assert.equal(readmeEditUrl("acme", "widgets", "main", "README.md"),
    "https://github.com/acme/widgets/edit/main/README.md");
  assert.equal(readmeEditUrl("acme", "widgets", "release/2.x", null),
    "https://github.com/acme/widgets/new/release/2.x?filename=README.md");
});

test("a Striff page shows the badge from its own origin, as a preview", async () => {
  const { badgePreviewPath } = await import("../src/lib/badgeSnippets.js");
  assert.equal(badgePreviewPath("acme", "widgets"), "/badge/acme/widgets.svg?preview=1");
  assert.equal(badgePreviewPath("acme", "secret", { style: "for-the-badge", token: "ab12" }),
    "/badge/acme/secret.svg?style=for-the-badge&token=ab12&preview=1");
});

test("a variant other than the default count is named in the address, the preview and every snippet", async () => {
  const { badgePreviewPath } = await import("../src/lib/badgeSnippets.js");
  assert.equal(badgeImageUrl("acme", "widgets", { variant: "count" }), "https://striff.io/badge/acme/widgets.svg");
  assert.equal(badgePreviewPath("acme", "widgets", { variant: "count" }), "/badge/acme/widgets.svg?preview=1");
  assert.equal(badgePreviewPath("acme", "secret", { style: "flat-square", variant: "agent", token: "ab12" }),
    "/badge/acme/secret.svg?style=flat-square&variant=agent&token=ab12&preview=1");
  for (const variant of ["practice", "agent"]) {
    const image = badgeImageUrl("acme", "secret", { style: "for-the-badge", variant, token: "ab12" });
    assert.equal(image, `https://striff.io/badge/acme/secret.svg?style=for-the-badge&variant=${variant}&token=ab12`);
    const link = badgeLinkUrl("acme", "secret", { privateRepo: true });
    for (const format of ["markdown", "html", "rst", "asciidoc"]) {
      const snippet = badgeSnippet(format, image, link);
      assert.ok(snippet.includes(`variant=${variant}`), `${variant} ${format}`);
      assert.ok(!snippet.includes("utm_"), format);
    }
  }
  for (const format of ["markdown", "html", "rst", "asciidoc"]) {
    const snippet = badgeSnippet(format, badgeImageUrl("acme", "widgets", { variant: "count" }), badgeLinkUrl("acme", "widgets"));
    assert.ok(!snippet.includes("variant="), format);
  }
});

test("rules verified comes first and is preselected from ten rules held; below that practice is", async () => {
  const { badgeVariantChoices } = await import("../src/lib/badgeSnippets.js");
  const offered = (facts) => badgeVariantChoices(facts)
    .map((each) => `${each.id}:${each.shown ? "shown" : "hidden"}/${each.available ? "on" : "off"}${each.preselected ? "*" : ""}`);
  assert.deepEqual(offered({ heldRules: 10, agentDocs: true }),
    ["count:shown/on*", "practice:shown/on", "agent:shown/on"]);
  assert.deepEqual(offered({ heldRules: 9, agentDocs: false }),
    ["count:shown/off", "practice:shown/on*", "agent:hidden/off"]);
  assert.deepEqual(offered({ heldRules: 0 }), ["count:shown/off", "practice:shown/on*", "agent:hidden/off"]);
  assert.deepEqual(offered({ heldRules: null }), ["count:shown/off", "practice:shown/on*", "agent:hidden/off"]);
  assert.deepEqual(offered({}), ["count:shown/off", "practice:shown/on*", "agent:hidden/off"]);
});

test("practice is named in the address only where it was chosen over an available count", async () => {
  const { badgeVariantChoices } = await import("../src/lib/badgeSnippets.js");
  const address = (facts, id) => badgeVariantChoices(facts).find((each) => each.id === id).address;
  const snippetFor = (facts, id) => badgeSnippet("markdown",
    badgeImageUrl("acme", "widgets", { variant: address(facts, id) }), badgeLinkUrl("acme", "widgets"));
  // Below ten, preselected or picked, practice leaves the variant out: it upgrades on its own at ten.
  for (const facts of [{ heldRules: 9 }, { heldRules: 0 }, { heldRules: null }, {}]) {
    assert.equal(address(facts, "practice"), "count");
    assert.equal(snippetFor(facts, "practice"),
      "[![Striff](https://striff.io/badge/acme/widgets.svg)](https://striff.io/acme/widgets)");
  }
  // From ten, the default count is left out and a practice picked over it is kept.
  assert.equal(snippetFor({ heldRules: 10 }, "count"),
    "[![Striff](https://striff.io/badge/acme/widgets.svg)](https://striff.io/acme/widgets)");
  assert.equal(snippetFor({ heldRules: 10 }, "practice"),
    "[![Striff](https://striff.io/badge/acme/widgets.svg?variant=practice)](https://striff.io/acme/widgets)");
  assert.equal(address({ heldRules: 3, agentDocs: true }, "agent"), "agent");
});
