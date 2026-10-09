/**
 * Which rules a pull request is checked against: every rule is active unless it, its doc or a
 * folder above it is ignored, and a rule in an excluded doc is never checked.
 *
 * The API answers this for real; these functions apply one change to an answer already on the
 * page, so the switch moves the moment it is clicked and the demo can be tried with nothing behind
 * it. Plain JavaScript so the node tests read the same answer the dashboard shows. Missing fields,
 * from a server that predates rule states, read as active.
 */

/**
 * Whether `docPath` lies under an ignored path: the doc itself, or a folder holding it ("" with
 * prefix is the whole repository).
 *
 * @param {string} docPath
 * @param {{ path: string, prefix: boolean }[] | undefined} ignoredPaths
 * @returns {{ path: string, prefix: boolean } | null} the covering entry, the deepest if several
 */
export function coveringPath(docPath, ignoredPaths) {
  let best = null;
  for (const entry of ignoredPaths || []) {
    const covers = entry.prefix
      ? entry.path === "" || docPath === entry.path || docPath.startsWith(`${entry.path}/`)
      : docPath === entry.path;
    if (covers && (!best || entry.path.length >= best.path.length)) best = entry;
  }
  return best;
}

/** Whether a doc lies under `scope`, a folder path ("" for the repository) or a doc path. */
function under(docPath, scope, prefix) {
  if (!prefix) return docPath === scope;
  return scope === "" || docPath === scope || docPath.startsWith(`${scope}/`);
}

/**
 * The rules answer with one change applied: a list of rules, or a doc or folder, made ignored or
 * active.
 *
 * Making a path active also makes every rule beneath it active, whatever was set on the rule; a
 * rule made active inside an ignored doc or folder stays active while the path stays ignored. A
 * rule in an excluded doc is left alone: it is not checked until the doc is included again.
 *
 * @param {{ documents: { document: object, rules: object[] }[], ignoredPaths?: object[] }} repoRules
 * @param {{ ignored: boolean, factIds?: string[], path?: string, prefix?: boolean }} change
 * @returns the new answer; the one passed in is not changed
 */
export function applyRuleStates(repoRules, change) {
  if (!repoRules) return repoRules;
  const byPath = change.factIds == null;
  let ignoredPaths = [...(repoRules.ignoredPaths || [])];
  if (byPath) {
    const scope = change.path || "";
    const prefix = !!change.prefix;
    // Taking a path back takes back everything set beneath it; ignoring one replaces what was set
    // on the same path.
    ignoredPaths = ignoredPaths.filter((entry) => change.ignored
      ? !(entry.path === scope && entry.prefix === prefix)
      : !(prefix ? under(entry.path, scope, true) : entry.path === scope && !entry.prefix));
    if (change.ignored) ignoredPaths.push({ path: scope, prefix });
  }
  const ids = new Set(change.factIds || []);
  const documents = repoRules.documents.map((group) => {
    const path = group.document.path;
    const covering = coveringPath(path, ignoredPaths);
    const rules = group.rules.map((rule) => {
      if (rule.ignoredBy === "excluded") return rule;
      if (!byPath) {
        if (!ids.has(rule.factId)) return rule;
        return { ...rule, ignored: change.ignored, ignoredBy: change.ignored ? "rule" : null };
      }
      if (!under(path, change.path || "", !!change.prefix)) return rule;
      if (!change.ignored) return { ...rule, ignored: false, ignoredBy: null };
      return { ...rule, ignored: true, ignoredBy: covering && covering.prefix ? "folder" : "document" };
    });
    const ignoredRules = rules.filter((rule) => rule.ignored).length;
    return { ...group, document: { ...group.document, ignored: !!covering, ignoredRules }, rules };
  });
  return { ...repoRules, documents, ignoredPaths };
}

/**
 * How many of `rules` are ignored, and how many could be changed at all (a rule in an excluded doc
 * cannot).
 *
 * @param {{ ignored?: boolean, ignoredBy?: string | null }[]} rules
 * @returns {{ total: number, ignored: number, changeable: number }}
 */
export function ignoreCounts(rules) {
  let ignored = 0;
  let changeable = 0;
  for (const rule of rules) {
    if (rule.ignored) ignored += 1;
    if (rule.ignoredBy !== "excluded") changeable += 1;
  }
  return { total: rules.length, ignored, changeable };
}
