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

test("each markup links the badge to the repository's page", () => {
  const image = badgeImageUrl("acme", "widgets", { style: "flat-square", token: "ab12" });
  const link = badgeLinkUrl("acme", "widgets");
  assert.equal(link, "https://striff.io/acme/widgets?utm_source=badge&utm_medium=readme");
  assert.equal(badgeSnippet("markdown", image, link),
    "[![Striff](https://striff.io/badge/acme/widgets.svg?style=flat-square&token=ab12)](https://striff.io/acme/widgets?utm_source=badge&utm_medium=readme)");
  assert.equal(badgeSnippet("html", image, link),
    '<a href="https://striff.io/acme/widgets?utm_source=badge&amp;utm_medium=readme"><img src="https://striff.io/badge/acme/widgets.svg?style=flat-square&amp;token=ab12" alt="Striff: architecture docs"></a>');
  assert.equal(badgeSnippet("rst", image, link),
    `.. image:: ${image}\n   :target: ${link}\n   :alt: Striff: architecture docs`);
  assert.equal(badgeSnippet("asciidoc", image, link), `image:${image}[Striff: architecture docs,link="${link}"]`);
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
