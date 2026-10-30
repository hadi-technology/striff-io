/**
 * Decides which folders of the document tree are open.
 *
 * A tree that opens every folder buries what matters in a large repository, and one that resets on
 * every reload undoes the reader's own choices. So a folder gets a default once, the first time it
 * is seen: open if it is the repository itself, leads to a document with results or to the
 * selection, or the tree is small enough that closing anything only adds clicks. After that the
 * folder belongs to the reader.
 *
 * Pure: it reads the paths it is given and returns the next open set, so the rule can be tested
 * without a page.
 */

/** A repository with at most this many documents opens whole: closing folders in a small tree only adds clicks. */
export const OPEN_WHOLE_TREE_AT_MOST = 15;

/**
 * The folders above a path, outermost first, starting with the repository itself ("").
 * @param {string} path a document or folder path
 * @returns {string[]}
 */
export function ancestorFolders(path) {
  const segments = (path || "").split("/").filter(Boolean);
  const folders = [""];
  for (let i = 1; i < segments.length; i++) folders.push(segments.slice(0, i).join("/"));
  return folders;
}

/**
 * The open set with the folders above a path added, so that path is visible. Returns the same set
 * when nothing needs opening.
 * @param {Set<string>} expanded the folders open now
 * @param {string} path the document or folder to reveal
 * @returns {Set<string>}
 */
export function revealPath(expanded, path) {
  if (!path) return expanded;
  const missing = ancestorFolders(path).filter((folder) => !expanded.has(folder));
  return missing.length === 0 ? expanded : new Set([...expanded, ...missing]);
}

/**
 * The next open set after a catalogue or its results arrive. Folders not in `seen` get the
 * default; every other folder keeps whatever the reader left it as.
 * @param {object} input
 * @param {Iterable<string>} input.docPaths the path of every document in the repository
 * @param {Iterable<string>} input.resultPaths the documents with results (a rule that holds or is broken, or a stale name)
 * @param {string} input.selected the selected path, "" for the repository itself
 * @param {Set<string>} input.seen the folders already given their default
 * @param {Set<string>} input.expanded the folders open now
 * @param {boolean} [input.markClosedSeen] whether a folder that stays closed is now seen; false while
 *     the results are not known, so a later call can still open it
 * @returns {{expanded: Set<string>, seen: Set<string>}} the given sets themselves when nothing changed
 */
export function nextExpanded({ docPaths, resultPaths, selected, seen, expanded, markClosedSeen = true }) {
  const docs = [...docPaths];
  const folders = new Set([""]);
  for (const path of docs) for (const folder of ancestorFolders(path)) folders.add(folder);
  const wanted = new Set([""]);
  if (docs.length <= OPEN_WHOLE_TREE_AT_MOST) {
    for (const folder of folders) wanted.add(folder);
  } else {
    for (const path of resultPaths) for (const folder of ancestorFolders(path)) wanted.add(folder);
    for (const folder of ancestorFolders(selected)) wanted.add(folder);
  }
  const nextSeen = new Set(seen);
  const nextOpen = new Set(expanded);
  let changed = false;
  for (const folder of folders) {
    if (seen.has(folder)) continue;
    if (wanted.has(folder)) {
      nextOpen.add(folder);
    } else if (!markClosedSeen) {
      continue;
    }
    nextSeen.add(folder);
    changed = true;
  }
  return changed ? { expanded: nextOpen, seen: nextSeen } : { expanded, seen };
}
