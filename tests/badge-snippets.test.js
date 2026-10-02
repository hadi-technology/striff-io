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
