// What a README needs to show a repository's Striff badge: the image's address, the page it links
// to, and the same pair written for each markup a README is commonly kept in.
//
// Plain JavaScript, so the tests can import it without a build; the badge panel imports it too.

export const SITE = "https://striff.io";

/** The styles the badge is drawn in, flat first because it is the default. */
export const BADGE_STYLES = ["flat", "flat-square", "for-the-badge"];

/**
 * What the badge can say, the default first: how many rules hold (from ten; below that it says
 * how the repository is checked), how the repository is checked, and that its agent-instruction
 * documents are checked. The badge falls back to how the repository is checked wherever it does
 * not qualify, so a variant in a README never breaks it.
 */
export const BADGE_VARIANTS = ["count", "practice", "agent"];

/** The default variant, which an address leaves out. */
export const DEFAULT_VARIANT = "count";

/** Fewest rules held that the "count" variant draws as a count. */
export const COUNT_THRESHOLD = 10;

/** The markups a snippet is written in, Markdown first because most READMEs are Markdown. */
export const BADGE_FORMATS = [
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "rst", label: "reStructuredText" },
  { id: "asciidoc", label: "AsciiDoc" },
];

const ALT = "Striff";

/**
 * The badge's address. A private repository's carries its key, and only a private one's: the key
 * is what lets the badge show while the repository stays private, and a public one needs none. A
 * style or variant other than the default is named; the default is left out.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ style?: string, variant?: string, token?: string | null, preview?: boolean }} [options]
 */
export function badgeImageUrl(owner, name, options = {}) {
  const query = new URLSearchParams();
  if (options.style && options.style !== "flat") query.set("style", options.style);
  if (options.variant && options.variant !== DEFAULT_VARIANT) query.set("variant", options.variant);
  if (options.token) query.set("token", options.token);
  if (options.preview) query.set("preview", "1");
  const search = query.toString();
  return `${SITE}/badge/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.svg${search ? `?${search}` : ""}`;
}

/**
 * The badge as one of Striff's own pages shows it: same-origin, marked a preview so it is never
 * counted as a README carrying it, in the style and variant asked for, with the key where it
 * needs one.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ style?: string, variant?: string, token?: string | null }} [options]
 */
export function badgePreviewPath(owner, name, options = {}) {
  const query = new URLSearchParams();
  if (options.style && options.style !== "flat") query.set("style", options.style);
  if (options.variant && options.variant !== DEFAULT_VARIANT) query.set("variant", options.variant);
  if (options.token) query.set("token", options.token);
  query.set("preview", "1");
  return `/badge/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.svg?${query}`;
}

/** The `ref` a badge's link carries, so a visit from a README's badge can be told from others. */
export const BADGE_REF = "badge";

/**
 * Where a click on the badge lands: a public repository's own page, and for a private one, which
 * has no public page, the dashboard opened on it, which shows it only to a reader who can see it.
 * The link carries `ref=badge`, which the site's analytics reads as the visit's source; a link
 * Striff's own pages show as a preview leaves it out, so a maintainer trying the link is not
 * counted as a reader of the README. A link without the `ref` lands on the same page.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ privateRepo?: boolean, preview?: boolean }} [options]
 */
export function badgeLinkUrl(owner, name, options = {}) {
  const ref = options.preview ? "" : `ref=${BADGE_REF}`;
  return options.privateRepo
    ? `${SITE}/dashboard?repo=${encodeURIComponent(owner)}/${encodeURIComponent(name)}${ref ? `&${ref}` : ""}`
    : `${SITE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${ref ? `?${ref}` : ""}`;
}

/**
 * The snippet to paste, in one markup.
 *
 * @param {"markdown" | "html" | "rst" | "asciidoc"} format
 * @param {string} image the badge's address
 * @param {string} link the page it links to
 */
export function badgeSnippet(format, image, link) {
  switch (format) {
    case "html":
      return `<a href="${link.replace(/&/g, "&amp;")}"><img src="${image.replace(/&/g, "&amp;")}" alt="${ALT}"></a>`;
    case "rst":
      return `.. image:: ${image}\n   :target: ${link}\n   :alt: ${ALT}`;
    case "asciidoc":
      return `image:${image}[${ALT},link="${link}"]`;
    default:
      return `[![Striff](${image})](${link})`;
  }
}

/** Whether a catalogue path is the repository's own README, at its root. */
export function isRootReadme(path) {
  return /^readme(\.(md|markdown|rst|adoc|txt))?$/i.test(path || "");
}

/**
 * Where to paste it: the README open in GitHub's editor, or GitHub's new-file editor where the
 * repository has none at its root.
 *
 * @param {string} owner
 * @param {string} name
 * @param {string} branch the default branch
 * @param {string | null} readmePath the root README's path, null where there is none
 */
export function readmeEditUrl(owner, name, branch, readmePath) {
  const base = `https://github.com/${owner}/${name}`;
  // A branch may hold slashes, which GitHub reads as part of the path; each part is encoded alone.
  const at = String(branch || "main").split("/").map(encodeURIComponent).join("/");
  return readmePath
    ? `${base}/edit/${at}/${encodeURIComponent(readmePath)}`
    : `${base}/new/${at}?filename=README.md`;
}

/**
 * Which variants the panel offers a repository, in the order it offers them, and which it
 * preselects. "count" comes first and is preselected from {@link COUNT_THRESHOLD} rules held; below
 * that, or while the count is not known, it is held back and "practice" is preselected. "agent" is
 * offered only where the repository's agent-instruction documents give rules.
 *
 * Each choice names the variant its address carries. Below ten rules the practice choice carries
 * the default, which draws the same words today and turns into the count by itself at ten; only a
 * practice chosen over an available count is named in the address, and so kept.
 *
 * @param {{ heldRules?: number | null, agentDocs?: boolean }} facts
 * @returns {{ id: string, available: boolean, shown: boolean, preselected: boolean, address: string }[]}
 */
export function badgeVariantChoices(facts = {}) {
  const held = typeof facts.heldRules === "number" ? facts.heldRules : null;
  const counts = held !== null && held >= COUNT_THRESHOLD;
  return [
    { id: "count", available: counts, shown: true, preselected: counts, address: "count" },
    { id: "practice", available: true, shown: true, preselected: !counts, address: counts ? "practice" : DEFAULT_VARIANT },
    { id: "agent", available: !!facts.agentDocs, shown: !!facts.agentDocs, preselected: false, address: "agent" },
  ];
}
