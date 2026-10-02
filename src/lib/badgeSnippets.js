// What a README needs to show a repository's Striff badge: the image's address, the page it links
// to, and the same pair written for each markup a README is commonly kept in.
//
// Plain JavaScript, so the tests can import it without a build; the badge panel imports it too.

export const SITE = "https://striff.io";

/** The styles the badge is drawn in, flat first because it is the default. */
export const BADGE_STYLES = ["flat", "flat-square", "for-the-badge"];

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
 * is what lets the badge show while the repository stays private, and a public one needs none.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ style?: string, token?: string | null, preview?: boolean }} [options]
 */
export function badgeImageUrl(owner, name, options = {}) {
  const query = new URLSearchParams();
  if (options.style && options.style !== "flat") query.set("style", options.style);
  if (options.token) query.set("token", options.token);
  if (options.preview) query.set("preview", "1");
  const search = query.toString();
  return `${SITE}/badge/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.svg${search ? `?${search}` : ""}`;
}

/**
 * The badge as one of Striff's own pages shows it: same-origin, marked a preview so it is never
 * counted as a README carrying it, in the style asked for, with the key where it needs one.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ style?: string, token?: string | null }} [options]
 */
export function badgePreviewPath(owner, name, options = {}) {
  const query = new URLSearchParams();
  if (options.style && options.style !== "flat") query.set("style", options.style);
  if (options.token) query.set("token", options.token);
  query.set("preview", "1");
  return `/badge/${encodeURIComponent(owner)}/${encodeURIComponent(name)}.svg?${query}`;
}

/**
 * Where a click on the badge lands: a public repository's own page, and for a private one, which
 * has no public page, the dashboard opened on it, which shows it only to a reader who can see it.
 *
 * @param {string} owner
 * @param {string} name
 * @param {{ privateRepo?: boolean }} [options]
 */
export function badgeLinkUrl(owner, name, options = {}) {
  return options.privateRepo
    ? `${SITE}/dashboard?repo=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    : `${SITE}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
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
