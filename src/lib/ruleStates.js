/**
 * Which rules a pull request is checked against: every rule is included unless it is excluded on
 * its own, or its doc or a folder above it is excluded.
 *
 * The API answers this for real; these functions apply one change to an answer already on the
 * page, so a switch moves the moment it is clicked and the demo can be tried with nothing behind
 * it. Plain JavaScript so the node tests read the same answer the dashboard shows.
 *
 * The API names these fields `excluded`, `excludedBy`, `excludedRules` and `excludedPaths`; a
 * server from before that names them `ignored`, `ignoredBy`, `ignoredRules` and `ignoredPaths`.
 * Every answer is read through {@link normalizeRules} or {@link normalizeCatalog}, which take the
 * new name where it is given and the old one where it is not, so the rest of the page only ever
 * sees the new names. Missing fields, from a server that predates rule states, read as included.
 */
import { standing } from "./standing.js";

/** Whether a doc lies under `scope`, a folder path ("" for the repository) or a doc path. */
function under(docPath, scope, prefix) {
  if (!prefix) return docPath === scope;
  return scope === "" || docPath === scope || docPath.startsWith(`${scope}/`);
}

/**
 * Whether `docPath` lies under an excluded path from the rule states: the doc itself, or a folder
 * holding it ("" with prefix is the whole repository).
 *
 * @param {string} docPath
 * @param {{ path: string, prefix: boolean }[] | undefined} excludedPaths
 * @returns {{ path: string, prefix: boolean } | null} the covering entry, the deepest if several
 */
export function coveringPath(docPath, excludedPaths) {
  let best = null;
  for (const entry of excludedPaths || []) {
    if (under(docPath, entry.path, entry.prefix) && (!best || entry.path.length >= best.path.length)) best = entry;
  }
  return best;
}

/**
 * The folder exclusion that covers `path`, a doc's or a folder's, if one does: the folder itself
 * or one above it, the empty path being the whole repository. The deepest wins, since it is the
 * one a reader set last on the way down.
 *
 * @param {string} path
 * @param {{ path: string, folder: boolean }[] | undefined} exclusions
 */
export function coveringFolder(path, exclusions) {
  let best = null;
  for (const entry of exclusions || []) {
    if (!entry.folder || !under(path, entry.path, true)) continue;
    if (!best || entry.path.length >= best.path.length) best = entry;
  }
  return best;
}

/** One rule with the new field names, read from the old ones where the server sent only those. */
export function normalizeRule(rule) {
  const { ignored, ignoredBy, ...rest } = rule;
  return {
    ...rest,
    excluded: !!(rule.excluded ?? ignored ?? false),
    excludedBy: rule.excludedBy ?? ignoredBy ?? null,
  };
}

/**
 * One doc with the new field names. A doc's own `excludedBy` is who excluded it, not why a rule is
 * excluded, and is left as it is.
 */
export function normalizeDoc(doc) {
  const { ignored, ignoredRules, ...rest } = doc;
  const out = { ...rest };
  const excluded = doc.excluded ?? ignored;
  if (excluded != null) out.excluded = !!excluded;
  const excludedRules = doc.excludedRules ?? ignoredRules;
  if (excludedRules != null) out.excludedRules = excludedRules;
  return out;
}

/**
 * Every rule of a repository with the new field names.
 *
 * @param {object | null | undefined} answer the API's answer to a read of every rule
 */
export function normalizeRules(answer) {
  if (!answer || !Array.isArray(answer.documents)) return answer;
  const { ignoredPaths, ...rest } = answer;
  return {
    ...rest,
    excludedPaths: answer.excludedPaths ?? ignoredPaths ?? [],
    documents: answer.documents.map((group) => ({
      ...group,
      document: normalizeDoc(group.document),
      rules: (group.rules || []).map(normalizeRule),
    })),
  };
}

/** A catalogue, or one doc's answer, with the new field names on its documents and rules. */
export function normalizeCatalog(answer) {
  if (!answer) return answer;
  const out = { ...answer };
  if (Array.isArray(answer.documents)) out.documents = answer.documents.map(normalizeDoc);
  if (answer.document) out.document = normalizeDoc(answer.document);
  if (Array.isArray(answer.rules)) out.rules = answer.rules.map(normalizeRule);
  return out;
}

/**
 * The rules answer with one rule-state change applied: a list of rules excluded or included, or
 * (for an answer that still carries them) a doc or folder in the rule states taken back.
 *
 * Including a path also includes every rule beneath it, whatever was set on the rule. A rule in a
 * doc that is excluded from reading is left alone: it is not checked until the doc is included.
 *
 * @param {{ documents: { document: object, rules: object[] }[], excludedPaths?: object[] }} repoRules
 * @param {{ excluded: boolean, factIds?: string[], path?: string, prefix?: boolean }} change
 * @returns the new answer; the one passed in is not changed
 */
export function applyRuleStates(repoRules, change) {
  if (!repoRules) return repoRules;
  const byPath = change.factIds == null;
  let excludedPaths = [...(repoRules.excludedPaths || [])];
  if (byPath) {
    const scope = change.path || "";
    const prefix = !!change.prefix;
    excludedPaths = excludedPaths.filter((entry) => change.excluded
      ? !(entry.path === scope && entry.prefix === prefix)
      : !(prefix ? under(entry.path, scope, true) : entry.path === scope && !entry.prefix));
    if (change.excluded) excludedPaths.push({ path: scope, prefix });
  }
  const ids = new Set(change.factIds || []);
  const documents = repoRules.documents.map((group) => {
    const path = group.document.path;
    const covering = coveringPath(path, excludedPaths);
    const rules = group.rules.map((rule) => {
      if (rule.excludedBy === "excluded") return rule;
      if (!byPath) {
        if (!ids.has(rule.factId)) return rule;
        return { ...rule, excluded: change.excluded, excludedBy: change.excluded ? "rule" : null };
      }
      if (!under(path, change.path || "", !!change.prefix)) return rule;
      if (!change.excluded) return { ...rule, excluded: false, excludedBy: null };
      return { ...rule, excluded: true, excludedBy: covering && covering.prefix ? "folder" : "document" };
    });
    const excludedRules = rules.filter((rule) => rule.excluded).length;
    return { ...group, document: { ...group.document, excluded: !!covering, excludedRules }, rules };
  });
  return { ...repoRules, documents, excludedPaths };
}

/**
 * The catalogue and the rules answer with a doc, a folder or the repository (the empty folder)
 * excluded from reading or included again, as the page shows it until the server answers.
 *
 * An excluded doc is not read and none of its rules is checked; each rule remembers its own state,
 * so including the doc again brings back a rule excluded on its own as excluded. A doc included
 * again goes back to the state it had, or to read or not read by whether it has rules, which is
 * what the server does.
 *
 * @param {{ documents: object[], exclusions?: object[] } | null} catalog
 * @param {{ documents: { document: object, rules: object[] }[] } | null} repoRules
 * @param {{ path: string, folder: boolean, excluded: boolean }} change
 * @returns {{ catalog: object | null, rules: object | null }} new answers; those passed in are not changed
 */
export function applyExclusion(catalog, repoRules, change) {
  const path = change.path || "";
  const folder = !!change.folder;
  const same = (entry) => entry.path === path && !!entry.folder === folder;
  let exclusions = (catalog?.exclusions || []).filter((entry) => !same(entry));
  if (change.excluded) {
    exclusions = [...exclusions, { path, folder, excludedBy: null, reason: null, atMs: Date.now() }];
  }
  const inside = (docPath) => under(docPath, path, folder);
  const stillCovered = (docPath) => exclusions.some((entry) => under(docPath, entry.path, !!entry.folder));

  const docOf = (doc) => {
    if (!inside(doc.path)) return doc;
    if (change.excluded) {
      return doc.state === "EXCLUDED" ? doc : { ...doc, state: "EXCLUDED", stateBeforeExclusion: doc.state };
    }
    if (doc.state !== "EXCLUDED" || stillCovered(doc.path)) return doc;
    const { stateBeforeExclusion, ...rest } = doc;
    return { ...rest, state: stateBeforeExclusion || (doc.extractedContentHash ? "READ" : "NOT_READ") };
  };

  const nextCatalog = catalog && {
    ...catalog,
    exclusions,
    documents: (catalog.documents || []).map(docOf),
  };

  const nextRules = repoRules && {
    ...repoRules,
    documents: repoRules.documents.map((group) => {
      const docPath = group.document.path;
      if (!inside(docPath)) return group;
      const covered = stillCovered(docPath);
      const legacy = coveringPath(docPath, repoRules.excludedPaths);
      const rules = group.rules.map((rule) => {
        if (change.excluded) {
          if (rule.excludedBy === "excluded") return rule;
          return { ...rule, excluded: true, excludedBy: "excluded",
            ownState: { excluded: !!rule.excluded, excludedBy: rule.excludedBy ?? null } };
        }
        if (covered || rule.excludedBy !== "excluded") return rule;
        const { ownState, ...rest } = rule;
        const own = ownState
          || (legacy ? { excluded: true, excludedBy: legacy.prefix ? "folder" : "document" } : { excluded: false, excludedBy: null });
        return { ...rest, ...own };
      });
      const document = docOf(group.document);
      return { ...group, document: { ...document, excludedRules: rules.filter((rule) => rule.excluded).length }, rules };
    }),
  };

  return { catalog: nextCatalog, rules: nextRules };
}

/**
 * How a list of rules stands, every count in rules: how many are included and hold, are broken
 * or have not been checked, and how many are excluded, whatever excluded them. An excluded rule is
 * counted as excluded and in none of the standings. A rule Striff could not judge is not listed
 * anywhere, so it is counted nowhere.
 *
 * @param {{ excluded?: boolean, status: string | null, onDefaultBranch: string | null }[]} rules
 * @returns {{ all: number, holds: number, broken: number, unchecked: number, excluded: number }}
 */
export function ruleCounts(rules) {
  const counts = { all: 0, holds: 0, broken: 0, unchecked: 0, excluded: 0 };
  for (const rule of rules) {
    const stands = standing(rule);
    if (stands === "unclear") continue;
    counts.all += 1;
    if (rule.excluded) counts.excluded += 1;
    else counts[stands] += 1;
  }
  return counts;
}
