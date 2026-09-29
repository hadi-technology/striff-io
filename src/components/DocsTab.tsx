import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { staleNameIssueUrl } from "./docIssue";
import RevisionLine from "./RevisionLine";
import { Clamped, mark, snippet, useWatch, withCode, when } from "./docRules";
import RulesTable, {
  pathStem,
  standing,
  STANDING_HELP,
  STANDING_LABEL,
  type Row,
  type Rule,
  type RuleFilter,
} from "./RulesTable";
import Listing from "./Listing";
import ReadRepository, { isRunning, type Reading } from "./ReadRepository";

/**
 * One repository's documents, and the rules read from whichever of them is selected.
 *
 * This was two views. One listed every rule in the repository, flat, each naming the document it
 * came from; the other drew the documents as a tree and showed one document's rules at a time. They
 * were the same data cut two ways, and the tree already held the relationship the flat list was
 * missing -- which document sits under which folder.
 *
 * So the tree is the only navigation, and what it selects is the scope of the rules beside it: the
 * repository row shows every rule in it, a folder shows every rule from every document beneath it,
 * and a document shows its own. The counts above follow the selection, and so does what an export
 * writes out.
 *
 * Every eligible document is listed, including ones nothing has read yet: extraction is lazy, so a
 * document waits until a pull request changes code it names, and a view that showed only extracted
 * documents would read as documents Striff cannot see.
 */

type DocState =
  | "NOT_READ"
  | "READ"
  | "SCREENED_OUT"
  | "RETIRED"
  | "UNREADABLE"
  | "EXCLUDED";

interface Doc {
  path: string;
  state: DocState;
  ruleCount: number;
  outdated: boolean;
  lastExtractedMs: number | null;
  lastExtractedPullNo: string | null;
  lastUsedMs: number | null;
  screenedBy: string | null;
  screenReason: string | null;
  retiredReason: string | null;
  brokenRules: number;
  alreadyBrokenRules: number;
  excludedBy: string | null;
  excludedReason: string | null;
  /** A fingerprint of the text on the default branch when it was last listed. */
  currentContentHash: string | null;
  /** A fingerprint of the text the rules were read from, which may be a branch's version. */
  extractedContentHash: string | null;
  /** Whether this repository asked for it to be read whatever a screen says. */
  forced: boolean;
  forcedBy: string | null;
  forcedReason: string | null;
  /**
   * How many characters of the doc its rules were read from, null where that is all of it. A doc
   * longer than one reading holds is read from its opening.
   */
  readChars?: number | null;
  /** How long the doc is, null wherever readChars is. */
  totalChars?: number | null;
}

/** Whether a doc that has been read was read from its opening and not from all of it. */
function readInPart(doc: Doc): boolean {
  return doc.state === "READ" && doc.readChars != null && doc.totalChars != null
    && doc.readChars < doc.totalChars;
}

/**
 * What a reader is told about a doc read in part, empty where it was read whole. It says how far
 * the reading went and what that leaves out, because "read" on its own would claim the rest.
 */
function partLine(doc: Doc): string {
  if (!readInPart(doc)) return "";
  const share = Math.max(1, Math.round((100 * (doc.readChars as number)) / (doc.totalChars as number)));
  return ` This is a long doc: Striff read the first ${(doc.readChars as number).toLocaleString("en-US")} of its ${(doc.totalChars as number).toLocaleString("en-US")} characters, about ${share}%. What it says further down isn't checked.`;
}

interface Summary {
  documents: number;
  read: number;
  outdated: number;
  notRead: number;
  screenedOut: number;
  retired: number;
  unreadable: number;
  rules: number;
  brokenRules: number;
  alreadyBrokenRules: number;
  neverChecked: number;
  excluded: number;
  holdsOnDefaultBranch: number;
  brokenOnDefaultBranch: number;
}

interface Catalog {
  repoOwner: string;
  repoName: string;
  /** The branch this listing is of; null where GitHub would not say. */
  defaultBranch: string | null;
  /** The commit that branch pointed at when the documents were last listed. */
  defaultBranchSha: string | null;
  lastScanMs: number | null;
  /** What came of the last attempt to list this repository, null where none is recorded. */
  lastAttempt: { atMs: number; outcome: string; reason: string | null; documents: number } | null;
  /** Where the last whole-repository reading got to, null where none was asked for. */
  reading: Reading | null;
  summary: Summary;
  documents: Doc[];
  exclusions: Exclusion[];
}

/** Every rule of the repository, grouped by the document it was read from. */
interface RepoRules {
  documents: { document: Doc; rules: Rule[] }[];
  /** Whether the repository holds more rules than one answer carries. */
  truncated: boolean;
}

/**
 * One name a doc writes that the default branch does not have, or has somewhere else. Found by
 * a reading of the whole repository, and counted apart from the rules: a doc naming something
 * that is gone is a stale doc, not a broken rule.
 */
interface StaleName {
  docPath: string;
  name: string;
  /** ABSENT where the code declares nothing by the name, MOVED where it declares it elsewhere. */
  state: string;
  sentence: string | null;
  sourceLine: number | null;
  namespace: string | null;
  /** A file the repository's history holds for it, where that is what shows it was here. */
  historicalPath: string | null;
  /** Other types the package holds, where that is what shows it is missing. */
  siblings: string[];
  packageSize: number | null;
  movedToNamespace: string | null;
  movedToPath: string | null;
  firstSeenMs: number;
  lastSeenMs: number;
}

interface StaleNames {
  findings: StaleName[];
  documents: number;
  truncated: boolean;
  /** When a reading last reported any; null where nothing has looked, which is not "none". */
  lastSeenMs: number | null;
}

/** What the code has in place of a name a doc writes, in one sentence. */
function staleLine(finding: StaleName): string {
  if (finding.state === "MOVED") {
    return `The code declares it in \`${finding.movedToNamespace}\`${finding.movedToPath ? `, at \`${finding.movedToPath}\`` : ""}, not in ${finding.namespace ? `\`${finding.namespace}\`` : "the package this doc writes"}.`;
  }
  if (finding.historicalPath) {
    return `The repository once held \`${finding.historicalPath}\`. It doesn't now.`;
  }
  const shown = (finding.siblings || []).slice(0, 3).join(", ");
  const more = finding.packageSize && finding.packageSize > 3 ? ", …" : "";
  return `${finding.namespace ? `\`${finding.namespace}\`` : "Its package"} holds ${finding.packageSize || (finding.siblings || []).length} type${(finding.packageSize || 0) === 1 ? "" : "s"}${shown ? ` (${shown}${more})` : ""} and none by this name.`;
}

/** One thing this repository has asked Striff not to read: a document, or a folder of them. */
interface Exclusion {
  path: string;
  folder: boolean;
  excludedBy: string | null;
  reason: string | null;
  atMs: number;
}

/**
 * The folder rule that covers this path, if one does. A folder rule covers the folder itself and
 * everything under it, which is what someone who excluded a directory meant, so a document inside
 * it cannot be included on its own -- the rule to take back is the folder's.
 */
function coveringFolder(path: string, exclusions: Exclusion[] | undefined): Exclusion | null {
  for (const rule of exclusions || []) {
    if (!rule.folder) continue;
    if (path === rule.path || path.startsWith(`${rule.path}/`)) return rule;
  }
  return null;
}

interface Detail {
  document: Doc;
  rules: Rule[];
}

const STATE_LABEL: Record<DocState, string> = {
  READ: "Read",
  NOT_READ: "Not read yet",
  SCREENED_OUT: "Skipped",
  RETIRED: "Retired",
  UNREADABLE: "Couldn't read",
  EXCLUDED: "Excluded",
};

/**
 * What state this document is in, in one sentence.
 *
 * @param doc the document
 * @param covering the folder rule that excludes it, where a folder rather than the document itself
 *     is what was excluded; naming it is the difference between a reader finding the rule and
 *     hunting for one that is not on this document at all
 */
function stateLine(doc: Doc, covering?: Exclusion | null): string {
  return stateLineOf(doc, covering) + partLine(doc);
}

function stateLineOf(doc: Doc, covering?: Exclusion | null): string {
  switch (doc.state) {
    case "READ":
      if (doc.outdated) {
        return `Edited on the default branch since Striff last read it. These rules come from the ${when(doc.lastExtractedMs)} version${doc.lastExtractedPullNo ? ` (PR #${doc.lastExtractedPullNo})` : ""}, and refresh on the next pull request that changes code this doc talks about.`;
      }
      if (!doc.lastExtractedMs) {
        // A repository read before Striff kept a catalogue: the rules are real, the date is not
        // known, and inventing one would be worse than saying so.
        return "Striff has rules for this doc from a reading it made before it kept a record of when. They refresh on the next pull request that changes code this doc talks about.";
      }
      return `Rules last extracted ${when(doc.lastExtractedMs)}${doc.lastExtractedPullNo ? ` on PR #${doc.lastExtractedPullNo}` : ""}.`;
    case "NOT_READ":
      return "Striff hasn't read this doc yet. It reads a doc the first time a pull request changes code the doc talks about.";
    case "SCREENED_OUT":
      if (doc.forced) {
        return `A screen judged this doc holds no rule to check${doc.screenReason ? ` (${doc.screenReason})` : ""}. ${doc.forcedBy ? `${doc.forcedBy} asked` : "You asked"} Striff to read it anyway${doc.forcedReason ? `: “${doc.forcedReason}”` : ""}, so it will on the next pull request that changes code this doc talks about.`;
      }
      return doc.screenReason
        ? `Nothing here to check against code: ${doc.screenReason}`
        : "A screen judged this doc holds no rule that could be checked against code.";
    case "RETIRED":
      return doc.retiredReason
        ? `This doc says it is no longer current: ${doc.retiredReason}`
        : "This doc says it is no longer current, so its rules aren't checked.";
    case "UNREADABLE":
      return "Striff couldn't finish reading this doc. That isn't counted as “no rules”; it tries again on the next pull request that touches the code it names.";
    case "EXCLUDED":
      if (covering && covering.path !== doc.path) {
        return `This doc is inside ${covering.path}/, a folder you excluded${covering.excludedBy ? `, ${covering.excludedBy}` : ""}${covering.reason ? `: “${covering.reason}”` : ""}. Striff doesn't read anything under it, so it costs nothing, and these rules aren't checked. Including the folder again brings every doc under it back.`;
      }
      return `You excluded this doc${doc.excludedBy ? `, ${doc.excludedBy}` : ""}${doc.excludedReason ? `: “${doc.excludedReason}”` : ""}. Striff doesn't read it, so it costs nothing, and its rules aren't checked.`;
    default:
      return "";
  }
}

/** The tree's width: what it is until someone drags it, how narrow it may go, and a key's step. */
const TREE_DEFAULT = 320;
const TREE_MIN = 220;
const TREE_STEP = 24;
/** The most of the view the tree may take, so the rules beside it are never squeezed out. */
const TREE_MAX_SHARE = 0.6;
const TREE_WIDTH_KEY = "striff.docsTreeWidth";

/**
 * Which documents the tree shows.
 *
 * These are facts about a document rather than about its rules, which is why they filter the tree
 * and the standings filter the table. A folder's summary line leads here: every part of it is one
 * of these, so "1 edited since read" is a sentence you can click.
 */
type DocFilter =
  | "all"
  | "broken"
  | "stale"
  | "notRead"
  | "outdated"
  | "skipped"
  | "retired"
  | "unreadable"
  | "excluded"
  | "forced";

const DOC_FILTER_TEST: Record<DocFilter, (doc: Doc) => boolean> = {
  all: () => true,
  broken: (doc) => doc.brokenRules + doc.alreadyBrokenRules > 0,
  // Filled in where the view is, because it is the only thing here that is not a fact about the
  // document on its own: it depends on what a reading of the whole repository reported.
  stale: () => false,
  notRead: (doc) => doc.state === "NOT_READ",
  outdated: (doc) => doc.outdated && doc.state === "READ",
  skipped: (doc) => doc.state === "SCREENED_OUT",
  retired: (doc) => doc.state === "RETIRED",
  unreadable: (doc) => doc.state === "UNREADABLE",
  excluded: (doc) => doc.state === "EXCLUDED",
  forced: (doc) => doc.forced,
};

/** The chips above the tree, in the order a reader looks for them. */
const FILTER_CHIPS: { key: DocFilter; label: string; dot: string; always: boolean }[] = [
  { key: "all", label: "All", dot: "", always: true },
  { key: "broken", label: "Broken", dot: "broken", always: true },
  { key: "stale", label: "Names gone", dot: "stale", always: false },
  { key: "notRead", label: "Not read", dot: "unread", always: true },
  { key: "outdated", label: "Edited since", dot: "outdated", always: false },
  { key: "unreadable", label: "Couldn't read", dot: "broken", always: false },
  { key: "skipped", label: "Skipped", dot: "other", always: true },
  { key: "retired", label: "Retired", dot: "other", always: false },
  { key: "excluded", label: "Excluded", dot: "other", always: true },
  { key: "forced", label: "Read anyway", dot: "other", always: false },
];

/**
 * What a folder's own row cannot say.
 *
 * A row's badges are facts about one file. A folder has no single state, so they cannot move up to
 * it -- but without them a folder's rule count is not trustworthy: fourteen rules under `docs/adr/`
 * could be all of them, or fourteen plus whatever is in three documents nobody has read. A table of
 * rules cannot say this, because a document with no rules has no row to say it in.
 */
const SUMMARY_PARTS: { key: DocFilter; label: string; help: string }[] = [
  { key: "stale", label: "naming something gone", help: "Documents that write a name the default branch no longer has." },
  { key: "notRead", label: "not read", help: "Documents Striff hasn't read yet, so any rule in them is not counted here." },
  { key: "outdated", label: "edited since read", help: "Documents edited on the default branch since Striff read them, so their rules come from an older version." },
  { key: "unreadable", label: "couldn't read", help: "Documents Striff could not finish reading. That isn't counted as “no rules”." },
  { key: "skipped", label: "skipped", help: "Documents a screen judged hold no rule that could be checked against code." },
  { key: "retired", label: "retired", help: "Documents that say they are no longer current, so their rules aren't checked." },
  { key: "excluded", label: "excluded", help: "Documents this repository asked Striff not to read." },
  { key: "forced", label: "read anyway", help: "Documents a screen skipped that this repository asked Striff to read regardless." },
];

/** One node of the document tree: the repository, a folder holding more, or a document. */
interface TreeNode {
  name: string;
  path: string;
  doc?: Doc;
  children: TreeNode[];
  rules: number;
  broken: number;
}

/** Folders first, then documents, each alphabetically -- a file explorer's order. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    const aFolder = !a.doc;
    const bFolder = !b.doc;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The documents as a tree of folders, with each folder carrying what is beneath it.
 *
 * The root is returned rather than thrown away. The recursive arithmetic was always here; the
 * repository itself was simply never given a row, which made "every rule in this repository" a
 * special case instead of the thing you click first.
 */
function buildTree(documents: Doc[], repoName: string): TreeNode {
  const root: TreeNode = { name: repoName, path: "", children: [], rules: 0, broken: 0 };
  for (const doc of documents) {
    const segments = doc.path.split("/");
    let node = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const path = segments.slice(0, index + 1).join("/");
      let next = node.children.find((child) => child.name === segment);
      if (!next) {
        next = { name: segment, path, children: [], rules: 0, broken: 0 };
        node.children.push(next);
      }
      if (isLeaf) next.doc = doc;
      node = next;
    });
  }
  const total = (node: TreeNode): TreeNode => {
    node.children = sortNodes(node.children.map(total));
    node.rules = (node.doc?.ruleCount || 0) + node.children.reduce((sum, c) => sum + c.rules, 0);
    node.broken = (node.doc?.brokenRules || 0) + node.children.reduce((sum, c) => sum + c.broken, 0);
    return node;
  };
  return total(root);
}

/** Every folder that holds a document, so the tree opens showing what is in it. */
function allFolders(node: TreeNode, into: Set<string> = new Set()): Set<string> {
  if (!node.doc) {
    into.add(node.path);
    for (const child of node.children) allFolders(child, into);
  }
  return into;
}

const ChevronDown = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    createElement("path", { d: "m4 6 4 4 4-4" })
  );

const ChevronRight = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    createElement("path", { d: "m6 4 4 4-4 4" })
  );

const FolderIcon = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    createElement("path", { d: "M1.75 3.5h4l1.5 1.75h7v7.25a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1Z" })
  );

const FileIcon = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    createElement("path", { d: "M3.5 1.75h5.5l3.5 3.5v9h-9Z" }),
    createElement("path", { d: "M9 1.75v3.5h3.5" })
  );

/** The repository's own row, at the head of its tree. */
const RepoIcon = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 15, height: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    createElement("path", { d: "M3 12.75V2.75A1.25 1.25 0 0 1 4.25 1.5H13v10H4.25A1.25 1.25 0 0 0 3 12.75Z" }),
    createElement("path", { d: "M3 12.75A1.25 1.25 0 0 0 4.25 14H13v-2.5" })
  );

const DotsIcon = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 15, height: 15, fill: "currentColor", "aria-hidden": true },
    createElement("circle", { cx: 3.2, cy: 8, r: 1.3 }),
    createElement("circle", { cx: 8, cy: 8, r: 1.3 }),
    createElement("circle", { cx: 12.8, cy: 8, r: 1.3 })
  );

const GitHubMark = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 13, height: 13, fill: "currentColor", "aria-hidden": true },
    createElement("path", {
      d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
    })
  );

export default function DocsTab({
  installationId,
  repos,
  openRepo,
  sample,
}: {
  installationId: number;
  repos: { full_name: string }[];
  /** The repository to show. The shell's sidebar picks it; this view only reads it. */
  openRepo?: string | null;
  /**
   * Fixed answers to show instead of asking the API, for the public demo: the catalogue, every
   * rule in the repository, and a function giving one document's rules. Writes are refused, so the
   * demo can be explored and cannot be changed.
   */
  sample?: {
    catalog: any;
    rules: any;
    doc: (path: string) => any;
    staleNames?: any;
  };
}) {
  const [repo, setRepo] = useState<string>(openRepo || repos[0]?.full_name || "");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  /** Every rule of the repository, for the scopes a single document's answer cannot serve. */
  const [rulesIndex, setRulesIndex] = useState<RepoRules | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  /** The names the docs write that the code no longer has, null until a reading has reported. */
  const [staleNames, setStaleNames] = useState<StaleNames | null>(null);
  /** What is selected: the empty path is the repository itself, which is where this opens. */
  const [selected, setSelected] = useState<string>("");
  const [filter, setFilter] = useState<DocFilter>("all");
  // How wide the tree is, in pixels; null until someone has dragged it, which leaves the width
  // to the stylesheet. Remembered, because a width someone chose for long paths is one they
  // would have to choose again on every visit.
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const split = useRef<HTMLDivElement>(null);
  /** Which of the selection's rules to list, followed from the counts above them. */
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Whether this page gave up waiting for a listing that had not arrived. */
  const [listingStale, setListingStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // What a failed write or a failed document read said, shown where it happened.
  const [actionError, setActionError] = useState("");
  const [asking, setAsking] = useState(false);
  /** Which document was asked for last; an older answer never paints over a newer one. */
  const openedAt = useRef(0);
  /** The same for the catalogue and the rules: switching twice must not land on the first one. */
  const loadedAt = useRef(0);
  const rulesAt = useRef(0);

  /** What the view is showing right now, for the listing wait to look at before it reloads. */
  const catalogRef = useRef<Catalog | null>(null);

  const [owner, name] = repo.split("/");
  catalogRef.current = catalog;
  const branch = catalog?.defaultBranch || null;

  // A listing is seconds of work and it is the difference between an empty page and a page: watch
  // until it lands, and stop as soon as there is anything to show or anything to say about why
  // there is not. Only the catalogue -- a repository with no documents listed has no rules to ask
  // for. A reading is the other kind of wait, and nothing watches that: see ReadRepository.
  useWatch(
    !!catalog
      && (catalog.documents || []).length === 0
      && catalog.lastScanMs === null
      && !catalog.lastAttempt,
    () => loadCatalog(true),
    5000,
    180000,
    () => setListingStale(true)
  );

  // The width someone last dragged the tree to. Read after mounting, since the server that first
  // renders this has no browser to ask.
  useEffect(() => {
    try {
      const remembered = Number(window.localStorage.getItem(TREE_WIDTH_KEY));
      if (remembered >= TREE_MIN) setTreeWidth(remembered);
    } catch {
      // Nothing remembered is the default width.
    }
  }, []);

  useEffect(() => {
    if (openRepo && openRepo !== repo) setRepo(openRepo);
  }, [openRepo]);

  // A repository belongs to one account. Switching account while this view holds the last one's
  // repository asks the API about a pair that does not exist — an installation and a repository
  // from different accounts — which is refused, correctly, and reads as "no documents".
  useEffect(() => {
    if (repos.length === 0) return;
    if (!repos.some((each) => each.full_name === repo)) setRepo(repos[0].full_name);
  }, [installationId, repos.length]);

  useEffect(() => {
    if (!owner || !name) return;
    // A repository and an installation from different accounts is a pair GitHub refuses, and the
    // refusal reads as "this repository has nothing in it". Nothing is asked until the two agree;
    // the effect above brings the view back to a repository this account has.
    if (repos.length > 0 && !repos.some((each) => each.full_name === repo)) return;
    // A new repository is read from its root, as a fresh one is.
    setSelected("");
    setDetail(null);
    setFilter("all");
    setRuleFilter("all");
    setRulesIndex(null);
    setStaleNames(null);
    setActionError("");
    reload();
  }, [repo, installationId, repos.length]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  /** Both answers this view is built from: what documents exist, and what rules they hold. */
  async function reload() {
    await loadCatalog();
    await loadRules();
  }

  /**
   * The names the docs write that the code does not have. Asked for beside the catalogue and
   * never in its way: where it cannot be had, the documents are shown without it, and nothing is
   * said about stale names at all, since an empty list would say there are none.
   */
  async function loadStaleNames(wanted: number) {
    setStaleNames(null);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?view=type-findings&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      if (!res.ok || wanted !== loadedAt.current) return;
      const data = await res.json();
      if (wanted === loadedAt.current && Array.isArray(data.findings)) setStaleNames(data);
    } catch {
      // Left unset: the view says nothing about stale names.
    }
  }

  /**
   * @param quiet true for a look made while waiting for a listing. The page already says it is
   *     waiting, so such a look changes nothing on it until there is something to show: it used
   *     to put "Loading documents..." in place of that sentence for the length of every request,
   *     every five seconds, and a look that failed put an error there.
   */
  async function loadCatalog(quiet = false) {
    if (sample) {
      setCatalog(sample.catalog);
      setStaleNames(sample.staleNames || null);
      setExpanded(allFolders(buildTree(sample.catalog.documents || [], name)));
      setLoading(false);
      return;
    }
    const wanted = ++loadedAt.current;
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      const data = await res.json();
      // A repository switched away from still answers; it just no longer has a view to paint.
      if (wanted !== loadedAt.current) return;
      if (!res.ok) {
        // The next look is five seconds away, and the page goes on saying it is waiting.
        if (quiet) return;
        setError(data.message || data.error || "Couldn't load this repository's documents");
        // What is on screen was true when it arrived. A refresh that failed is a reason to say so,
        // not to take the documents away from whoever is reading them.
        if (!catalogRef.current) setCatalog(null);
        return;
      }
      setCatalog(data);
      loadStaleNames(wanted);
      setExpanded(allFolders(buildTree(data.documents || [], name)));
      // The documents a listing was waited for bring their rules with them.
      if (quiet && (data.documents || []).length > 0) loadRules();
    } catch {
      if (wanted === loadedAt.current && !quiet) setError("Couldn't load this repository's documents");
    } finally {
      if (wanted === loadedAt.current) setLoading(false);
    }
  }

  /**
   * Every rule in the repository, in one request.
   *
   * The repository row and every folder are rollups of this, and so is the search palette. One
   * reading, not one per document: the palette used to ask for the first twenty-five read
   * documents in turn, which was twenty-five round trips and searched none of the rest.
   */
  async function loadRules() {
    if (sample) {
      setRulesIndex(sample.rules);
      return;
    }
    const wanted = ++rulesAt.current;
    setRulesLoading(true);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?view=rules&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      if (!res.ok || wanted !== rulesAt.current) return;
      setRulesIndex(await res.json());
    } catch {
      // The tree, the states and one document's rules all still work without this; the rollups
      // say they are still loading rather than claiming a repository has no rules.
    } finally {
      if (wanted === rulesAt.current) setRulesLoading(false);
    }
  }

  /** The widest the tree may be dragged: most of the way across, leaving the rules room to read. */
  function treeMax(): number {
    const across = split.current?.getBoundingClientRect().width || 0;
    return Math.max(TREE_MIN, Math.round(across > 0 ? across * TREE_MAX_SHARE : 640));
  }

  /** How wide the tree is drawn now, for a width nobody has chosen yet. */
  function treeNow(): number {
    const list = split.current?.querySelector(".docs-list");
    return list ? list.getBoundingClientRect().width : TREE_DEFAULT;
  }

  /** Sets the tree's width, held between its bounds; null gives the width back to the stylesheet. */
  function resizeTree(width: number | null, remember: boolean) {
    const held = width == null ? null : Math.round(Math.min(treeMax(), Math.max(TREE_MIN, width)));
    setTreeWidth(held);
    if (!remember) return;
    try {
      if (held == null) window.localStorage.removeItem(TREE_WIDTH_KEY);
      else window.localStorage.setItem(TREE_WIDTH_KEY, String(held));
    } catch {
      // A browser that will not remember still resizes; the width lasts as long as the page.
    }
  }

  async function openDoc(path: string) {
    setSelected(path);
    setDetail(null);
    setActionError("");
    if (sample) {
      setDetail(sample.doc(path));
      return;
    }
    // Two clicks in a row answer in whatever order the network likes. Only the document asked for
    // last may paint, or the pane shows one document's rules under another's name.
    const wanted = ++openedAt.current;
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
      );
      if (wanted !== openedAt.current) return;
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        setActionError(answer.message || answer.error || `Couldn't open ${path}.`);
        return;
      }
      setDetail(await res.json());
    } catch {
      if (wanted === openedAt.current) setActionError(`Couldn't open ${path}.`);
    }
  }

  /** Selects a node of the tree: the repository, a folder and everything under it, or a document. */
  function select(path: string) {
    if ((catalog?.documents || []).some((doc) => doc.path === path)) {
      openDoc(path);
      return;
    }
    setSelected(path);
    setDetail(null);
    setActionError("");
    // A document that was asked for and has not answered must not paint over a folder.
    openedAt.current += 1;
  }

  /**
   * One write, one answer. A PATCH that failed used to reload the catalogue unchanged and say
   * nothing, so a rejected token or a 500 looked exactly like a change that did not stick.
   */
  async function write(body: unknown, view: "" | "force-read", failed: string) {
    if (sample) {
      setActionError("This is an example repository, so nothing here can be changed.");
      return false;
    }
    setActionError("");
    setBusy(true);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?${view ? `view=${view}&` : ""}installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        setActionError(answer.message || answer.error || failed);
        return false;
      }
      return true;
    } catch {
      setActionError(failed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Reloads both answers and comes back to whatever was being read. */
  async function reloadKeeping(path: string) {
    await reload();
    // A path that named a document still names one: what a write changes is its state, not
    // whether it exists, so the selection before the write decides which pane comes back.
    if (allDocs.some((doc) => doc.path === path)) {
      await openDoc(path);
    } else {
      setSelected(path);
    }
  }

  async function setExcluded(path: string, excluded: boolean) {
    const ok = await write({ paths: [path], folders: [], excluded },
      "", `Couldn't ${excluded ? "exclude" : "include"} ${path}.`);
    if (!ok) return;
    await reloadKeeping(path);
  }

  /**
   * Asks Striff to read every document here. A reader who opens a fresh repository sees a tree of
   * "not read yet" and should not have to find another page to do something about it.
   */
  /** @return false where the request was refused, so the control stops saying it is asking */
  async function readRepository(): Promise<boolean> {
    if (sample) return false;
    setAsking(true);
    setActionError("");
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        setActionError(answer.message || answer.error || "Couldn't ask Striff to read this repository.");
        return false;
      }
      await reload();
      return true;
    } catch {
      setActionError("Couldn't ask Striff to read this repository.");
      return false;
    } finally {
      setAsking(false);
    }
  }

  /** Asks for a document a screen skipped to be read anyway, or leaves it to the screens again. */
  async function setForced(path: string, forced: boolean) {
    const ok = await write({ paths: [path], forced }, "force-read",
      `Couldn't ${forced ? "ask for" : "stop"} reading ${path}.`);
    if (!ok) return;
    await reloadKeeping(path);
  }

  async function setFolderExcluded(folder: string, excluded: boolean) {
    const ok = await write({ paths: [], folders: [folder] , excluded },
      "", `Couldn't ${excluded ? "exclude" : "include"} ${folder}/.`);
    if (!ok) return;
    // The button is usually in the open node's own menu, and reloading must come back to what was
    // being read rather than to wherever the tree happens to start.
    await reloadKeeping(selected);
  }

  const allDocs = catalog?.documents || [];

  /** The stale names of each doc, by the doc's path. */
  /** The documents the reading in flight is on, empty where none is going. */
  const readingNow = useMemo(
    () => new Set<string>(isRunning(catalog?.reading) ? catalog?.reading?.readingPaths || [] : []),
    [catalog?.reading]
  );

  const staleByDoc = useMemo(() => {
    const byDoc = new Map<string, StaleName[]>();
    for (const finding of staleNames?.findings || []) {
      byDoc.set(finding.docPath, [...(byDoc.get(finding.docPath) || []), finding]);
    }
    return byDoc;
  }, [staleNames]);

  /** Every filter is a fact about a document; this one needs the reading's answer as well. */
  const matches = (key: DocFilter) => (doc: Doc) =>
    key === "stale" ? staleByDoc.has(doc.path) : DOC_FILTER_TEST[key](doc);

  const documents = useMemo(
    () => allDocs.filter(matches(filter)),
    [catalog, filter, staleByDoc]
  );

  /** What each filter would show, counted in documents, since documents are what it filters. */
  const filterCounts = useMemo(() => {
    const counted = {} as Record<DocFilter, number>;
    for (const chip of FILTER_CHIPS) counted[chip.key] = allDocs.filter(matches(chip.key)).length;
    return counted;
  }, [catalog, staleByDoc]);

  const tree = useMemo(() => buildTree(documents, name), [documents, name]);

  /* ─── What is selected, and what it scopes ──────────────────────── */

  const selectedDoc = allDocs.find((doc) => doc.path === selected) || null;
  const scopeKind: "root" | "folder" | "doc" =
    selected === "" ? "root" : selectedDoc ? "doc" : "folder";

  /** The documents the selection covers: one, a folder's worth, or the repository's. */
  const scopeDocs = useMemo(() => {
    if (scopeKind === "doc") return selectedDoc ? [selectedDoc] : [];
    if (scopeKind === "root") return allDocs;
    return allDocs.filter((doc) => doc.path.startsWith(`${selected}/`));
  }, [catalog, selected, scopeKind]);

  /**
   * The rules the selection covers.
   *
   * A document's own rules come from its own answer, not from the repository-wide one.
   */
  const scopeRows = useMemo<Row[]>(() => {
    if (scopeKind === "doc") {
      if (!detail) return [];
      return detail.rules
        .filter((rule) => standing(rule) !== "unclear")
        .map((rule) => ({ ...rule, doc: detail.document }));
    }
    const under = scopeKind === "root" ? null : `${selected}/`;
    const rows: Row[] = [];
    for (const group of rulesIndex?.documents || []) {
      if (under && !group.document.path.startsWith(under)) continue;
      for (const rule of group.rules) {
        // A rule Striff could not judge says nothing about the code, and a list of things that
        // said nothing is not worth a reader's attention or a place in the counts. It is still
        // stored, and the next pull request that touches the code it names judges it again.
        if (standing(rule) === "unclear") continue;
        rows.push({ ...rule, doc: group.document });
      }
    }
    return rows.sort((a, b) =>
      a.doc.path === b.doc.path
        ? (a.sourceLine || 0) - (b.sourceLine || 0)
        : a.doc.path.localeCompare(b.doc.path)
    );
  }, [scopeKind, selected, detail, rulesIndex]);

  /** Names gone under whatever is selected, so the count agrees with the rest of the tally. */
  const scopeStale = useMemo(
    () => scopeDocs.reduce((sum, doc) => sum + (staleByDoc.get(doc.path)?.length || 0), 0),
    [scopeDocs, staleByDoc]
  );

  /** How many documents the listed rules actually came from. */
  const scopeRuleDocs = useMemo(
    () => new Set(scopeRows.map((row) => row.doc.path)).size,
    [scopeRows]
  );

  const scopeCounts = useMemo(
    () => ({
      all: scopeRows.length,
      broken: scopeRows.filter((row) => standing(row) === "broken").length,
      holds: scopeRows.filter((row) => standing(row) === "holds").length,
      unchecked: scopeRows.filter((row) => standing(row) === "unchecked").length,
    }),
    [scopeRows]
  );

  /** What the selection is called, in the export, on paper and in the pane's own heading. */
  const scopeLabel =
    scopeKind === "root" ? repo : scopeKind === "folder" ? `${selected}/` : selected;
  const scopeFileStem =
    scopeKind === "root" ? `${owner}-${name}` : `${owner}-${name}-${pathStem(selected)}`;

  /** The states of the documents under a folder, which the folder's own row cannot carry. */
  const scopeSummary = useMemo(
    () =>
      SUMMARY_PARTS.map((part) => ({
        ...part,
        count: scopeDocs.filter(matches(part.key)).length,
      })).filter((part) => part.count > 0),
    [scopeDocs, staleByDoc]
  );

  /* ─── The search palette ────────────────────────────────────────── */

  const ruleIndex = useMemo(
    () =>
      (rulesIndex?.documents || []).flatMap((group) =>
        group.rules.map((rule) => ({ ...rule, path: group.document.path }))
      ),
    [rulesIndex]
  );

  function openPalette() {
    setPaletteOpen(true);
    setQuery("");
    if (!rulesIndex && !rulesLoading) loadRules();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rulesIndex, rulesLoading]);

  const term = query.trim().toLowerCase();
  const docHits = allDocs
    .filter((doc) => term !== "" && doc.path.toLowerCase().includes(term))
    .slice(0, 6);
  const ruleHits = ruleIndex
    .filter(
      (rule) =>
        term !== "" &&
        ((rule.statement || "").replace(/`/g, "").toLowerCase().includes(term) ||
          (rule.quote || "").toLowerCase().includes(term))
    )
    .slice(0, 8);

  /** The matched runs of a palette result, marked, so a reader sees why it matched. */
  function marked(text: string) {
    return mark(text, term);
  }

  function toggleFolder(path: string) {
    setExpanded((open) => {
      const next = new Set(open);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  /** The ⋯ menu a document or folder carries, in the tree and in the selection's own header. */
  function rowMenu(path: string, doc?: Doc, folder?: boolean, where: string = "tree") {
    // The same document has a menu in the tree and another in its open header; they are told
    // apart by where they are, so opening one does not open the other.
    const id = `${where}:${path}`;
    const open = menuFor === id;
    const covering = coveringFolder(path, catalog?.exclusions);
    return (
      <span className="docs-menu-wrap">
        <button
          type="button"
          className="docs-menu-button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Actions for ${path}`}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            setMenuFor(open ? null : id);
          }}
        >
          <DotsIcon />
        </button>
        {open && (
          <span className="docs-menu" role="menu">
            {folder ? (
              covering ? (
                // Excluded by its own rule, or by a folder above it: either way the rule to take
                // back is that folder's, not this path's.
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setFolderExcluded(covering.path, false)}
                >
                  {covering.path === path
                    ? "Include this folder again"
                    : `Include ${covering.path}/ again`}
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={() => setFolderExcluded(path, true)}>
                  Exclude this folder from reading
                </button>
              )
            ) : doc?.state === "EXCLUDED" ? (
              // A document excluded by a folder rule cannot be included on its own: deleting a
              // rule for its path would delete nothing, and the doc would stay excluded.
              covering ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setFolderExcluded(covering.path, false)}
                >
                  Include {covering.path}/ again
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={() => setExcluded(path, false)}>
                  Include again
                </button>
              )
            ) : (
              <>
                {/* The screens are predictions; whoever wrote the doc may know better. */}
                {doc?.state === "SCREENED_OUT" &&
                  (doc.forced ? (
                    <button type="button" role="menuitem" onClick={() => setForced(path, false)}>
                      Go back to skipping it
                    </button>
                  ) : (
                    <button type="button" role="menuitem" onClick={() => setForced(path, true)}>
                      Read it anyway
                    </button>
                  ))}
                <button type="button" role="menuitem" onClick={() => setExcluded(path, true)}>
                  Exclude from reading
                </button>
              </>
            )}
            <a
              role="menuitem"
              href={githubUrl(path, !!folder)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on GitHub
            </a>
          </span>
        )}
      </span>
    );
  }

  /** Where a path lives on GitHub, at the branch this page is a view of. */
  function githubUrl(path: string, folder: boolean): string {
    const base = `https://github.com/${owner}/${name}`;
    if (!path) return branch ? `${base}/tree/${branch}` : base;
    return `${base}/${folder ? "tree" : "blob"}/${branch || "HEAD"}/${path}`;
  }

  /** The badges a document's state earns, in the tree. */
  function rowBadges(doc: Doc) {
    // A document the reading is on now says so in place of its state: "not read yet" beside
    // "reading" is two answers to one question. Only a document a reading has work to do on. One
    // already read is in the step too and is answered from what is held, which is not reading,
    // and one a screen or the repository keeps out is not read at all.
    const beingRead = readingNow.has(doc.path)
      && (doc.state === "NOT_READ" || doc.state === "UNREADABLE"
        || (doc.state === "READ" && doc.outdated));
    return (
      <>
        {beingRead && (
          <span className="docs-badge is-reading" title="Striff is reading this document now.">
            <span className="read-repo-pulse" aria-hidden="true" />
            Reading
          </span>
        )}
        {doc.brokenRules + doc.alreadyBrokenRules > 0 && (
          <span className="docs-badge is-broken" title="Rules of this doc the code does not keep.">
            {doc.brokenRules + doc.alreadyBrokenRules} broken
          </span>
        )}
        {staleByDoc.has(doc.path) && (
          <span
            className="docs-badge is-stale"
            title="Names this doc writes that the code no longer has."
          >
            {staleByDoc.get(doc.path)!.length} gone
          </span>
        )}
        {doc.state !== "READ" && !beingRead && (
          <span className={`docs-badge is-${doc.state.toLowerCase()}`}>{STATE_LABEL[doc.state]}</span>
        )}
        {doc.forced && doc.state !== "READ" && !beingRead && (
          <span className="docs-badge is-forced">Read anyway</span>
        )}
      </>
    );
  }

  /**
   * The tree: the repository, then its folders and documents.
   *
   * A folder's chevron opens it and its name selects it, which is the one thing that makes a
   * folder a scope rather than a container -- a row that only expanded could never answer "what
   * does everything under here promise".
   */
  function renderNode(node: TreeNode, depth: number): any[] {
    const indent = { paddingLeft: 8 + depth * 14 };
    if (node.doc) {
      const doc = node.doc;
      return [
        <div
          key={node.path}
          className={`docs-row${selected === doc.path ? " is-open" : ""}${
            ["RETIRED", "SCREENED_OUT", "EXCLUDED"].includes(doc.state) ? " is-dim" : ""
          }`}
          style={indent}
        >
          <span className="docs-chev" />
          <button type="button" className="docs-row-main" onClick={() => openDoc(doc.path)}>
            <FileIcon />
            <span className="docs-row-name">{node.name}</span>
          </button>
          <span className="docs-row-meta">
            {rowBadges(doc)}
            {doc.ruleCount > 0 && (
              <span
                className="docs-count"
                title={`${doc.ruleCount} rule${doc.ruleCount === 1 ? "" : "s"} read from this doc`}
              >
                {doc.ruleCount}
              </span>
            )}
            {rowMenu(doc.path, doc)}
          </span>
        </div>,
      ];
    }

    const isRoot = node.path === "";
    const open = expanded.has(node.path);
    const excludedFolder = isRoot ? null : coveringFolder(node.path, catalog?.exclusions);
    const rows: any[] = [
      <div
        key={node.path || "__root__"}
        className={`docs-row is-folder${isRoot ? " is-root" : ""}${
          selected === node.path ? " is-open" : ""
        }${excludedFolder ? " is-dim" : ""}`}
        style={indent}
      >
        <button
          type="button"
          className="docs-chev docs-chev-button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${isRoot ? name : node.name}`}
          onClick={() => toggleFolder(node.path)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </button>
        <button
          type="button"
          className="docs-row-main"
          title={
            isRoot
              ? "Every rule in this repository"
              : `Every rule under ${node.path}/`
          }
          onClick={() => select(node.path)}
        >
          {isRoot ? <RepoIcon /> : <FolderIcon />}
          <span className="docs-row-name">{node.name}</span>
        </button>
        <span className="docs-row-meta">
          {excludedFolder && (
            <span
              className="docs-badge is-excluded"
              title={`Excluded${excludedFolder.excludedBy ? ` by ${excludedFolder.excludedBy}` : ""}${
                excludedFolder.reason ? `: ${excludedFolder.reason}` : ""
              }${excludedFolder.path === node.path ? "" : ` with ${excludedFolder.path}/`}`}
            >
              Excluded
            </span>
          )}
          {node.broken > 0 && <span className="docs-dot" title={`${node.broken} broken`} />}
          {node.rules > 0 && (
            <span
              className="docs-count"
              title={`${node.rules} rule${node.rules === 1 ? "" : "s"} read from the docs ${
                isRoot ? "in this repository" : `under ${node.path}/`
              }`}
            >
              {node.rules}
            </span>
          )}
          {/* The repository is not a folder anyone can exclude, so it carries no menu; its
              header has the link to GitHub the folders' menus carry. */}
          {!isRoot && rowMenu(node.path, undefined, true)}
        </span>
      </div>,
    ];
    if (open) rows.push(...node.children.flatMap((child) => renderNode(child, depth + 1)));
    return rows;
  }

  if (repos.length === 0) {
    return (
      <div className="dashboard-empty">
        <p className="text-slate-600">
          This account has no repository Striff can see yet. Add one to the installation on GitHub,
          and its docs are listed as soon as Striff has read the repository.
        </p>
        <a
          href="https://github.com/apps/striff-app/installations/new"
          className="dashboard-button dashboard-button-primary mt-4 inline-block"
          target="_blank"
          rel="noopener noreferrer"
        >
          Manage repositories on GitHub
        </a>
      </div>
    );
  }

  const summary = catalog?.summary;

  return (
    <div className="docs-tab">
      {paletteOpen && (
        <div className="docs-palette-scrim" onClick={() => setPaletteOpen(false)}>
          <div className="docs-palette" role="dialog" aria-label="Search docs and rules" onClick={(event) => event.stopPropagation()}>
            <div className="docs-palette-input">
              <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.25" />
                <path d="m10.25 10.25 3.5 3.5" />
              </svg>
              <input
                autoFocus
                type="search"
                value={query}
                placeholder="Search documents and the rules read from them"
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="docs-palette-body">
              {term === "" && (
                <p className="docs-palette-hint">
                  Type to search this repository's documents and every rule read from them.
                  {rulesLoading && " Reading the rules…"}
                </p>
              )}
              {term !== "" && docHits.length === 0 && ruleHits.length === 0 && (
                <p className="docs-palette-hint">
                  Nothing matches “{query}”.{rulesLoading && " Still reading the rules…"}
                </p>
              )}
              {docHits.length > 0 && (
                <div className="docs-palette-group">
                  <p className="dashboard-kicker">Documents</p>
                  {docHits.map((doc) => (
                    <button
                      key={doc.path}
                      type="button"
                      className="docs-palette-item"
                      onClick={() => {
                        setPaletteOpen(false);
                        openDoc(doc.path);
                      }}
                    >
                      <span className="docs-palette-main">{marked(doc.path)}</span>
                      <span className="docs-palette-sub">
                        {doc.ruleCount > 0 ? `${doc.ruleCount} rules` : STATE_LABEL[doc.state]}
                        {doc.brokenRules > 0 ? ` · ${doc.brokenRules} broken` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {ruleHits.length > 0 && (
                <div className="docs-palette-group">
                  <p className="dashboard-kicker">Rules</p>
                  {ruleHits.map((rule) => (
                    <button
                      key={rule.factId}
                      type="button"
                      className="docs-palette-item"
                      onClick={() => {
                        setPaletteOpen(false);
                        openDoc(rule.path);
                      }}
                    >
                      <span className="docs-palette-main">
                        {marked((rule.statement || "").replace(/`/g, ""))}
                      </span>
                      {/* A rule can match on the sentence it was read from, which the line above
                          does not show: without this the result looks like one that should not be
                          in the list. */}
                      {rule.quote
                        && !(rule.statement || "").replace(/`/g, "").toLowerCase().includes(term)
                        && rule.quote.toLowerCase().includes(term) && (
                          <span className="docs-palette-quote">
                            “{marked(snippet(rule.quote, term))}”
                          </span>
                        )}
                      <span className="docs-palette-sub">
                        {marked(rule.path)}
                        {rule.sourceLine ? `:${rule.sourceLine}` : ""}
                        {` · ${STANDING_LABEL[standing(rule)].toLowerCase()}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="docs-head">
        <div className="docs-head-copy">
          <p className="dashboard-kicker">Docs &amp; Rules</p>
          <div className="docs-title">
            <span className="docs-title-name">{repo}</span>
            <a
              className="docs-repo-link"
              href={githubUrl("", true)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this repository on GitHub"
            >
              <GitHubMark />
              GitHub
            </a>
          </div>
          {/* The second sentence used to be there whatever the repository looked like, so a
              repository with every document read was still told some were waiting. It is now the
              count, or nothing. */}
          <p className="docs-lede">
            Pick a doc for its rules, a folder for everything beneath it, or the repository for
            all of them.
          </p>
          {catalog && <RevisionLine catalog={catalog} />}
        </div>
        {summary && (
          <div className="docs-tally">
            {/* The counts are of what is selected, so a folder says how much of the repository it
                accounts for rather than repeating the whole of it. */}
            <button
              type="button"
              className="docs-tally-item"
              title={
                scopeKind === "doc"
                  ? "This document."
                  : `Every document ${scopeKind === "root" ? "in this repository" : `under ${selected}/`}, whatever state it is in.`
              }
              onClick={() => setFilter("all")}
            >
              <b>{scopeDocs.length}</b>
              <i>document{scopeDocs.length === 1 ? "" : "s"}</i>
            </button>
            <button
              type="button"
              className={`docs-tally-item is-violated${ruleFilter === "broken" ? " is-on" : ""}`}
              title={`${STANDING_HELP.broken} Click to show these.`}
              onClick={() => setRuleFilter(ruleFilter === "broken" ? "all" : "broken")}
            >
              <b>{scopeCounts.broken}</b>
              <i>broken</i>
            </button>
            <button
              type="button"
              className={`docs-tally-item is-held${ruleFilter === "holds" ? " is-on" : ""}`}
              title={`${STANDING_HELP.holds} Click to show these.`}
              onClick={() => setRuleFilter(ruleFilter === "holds" ? "all" : "holds")}
            >
              <b>{scopeCounts.holds}</b>
              <i>holding</i>
            </button>
            <button
              type="button"
              className={`docs-tally-item${ruleFilter === "unchecked" ? " is-on" : ""}`}
              title={`${STANDING_HELP.unchecked} Click to show these.`}
              onClick={() => setRuleFilter(ruleFilter === "unchecked" ? "all" : "unchecked")}
            >
              <b>{scopeCounts.unchecked}</b>
              <i>not checked</i>
            </button>
            {/* Not lit when nothing is filtered: a light on every count says nothing. */}
            <button
              type="button"
              className="docs-tally-item"
              title="Every rule read from what is selected."
              onClick={() => setRuleFilter("all")}
            >
              <b>{scopeCounts.all}</b>
              <i>rule{scopeCounts.all === 1 ? "" : "s"}</i>
            </button>
            {/* Shown only once a reading of the whole repository has looked. Until then there is
                no number to give: a zero would say every doc is current, and nothing has checked.
                Counted apart from the rules, because a doc naming something that is gone is a
                stale doc and not a broken rule. Of the selection, like every other count here. */}
            {staleNames && staleNames.lastSeenMs != null && (
              <button
                type="button"
                className={`docs-tally-item is-stale${scopeStale === 0 ? " is-none" : ""}${filter === "stale" ? " is-on" : ""}`}
                title={`Names your docs write that the code no longer has. Found by reading the whole repository, last on ${when(staleNames.lastSeenMs)}.${staleNames.truncated ? " There are more than are listed here." : ""} Shows the docs that write them.`}
                onClick={() => setFilter(filter === "stale" ? "all" : "stale")}
              >
                <b>{scopeStale}{staleNames.truncated ? "+" : ""}</b>
                <i>names gone</i>
              </button>
            )}
            {catalog && !sample && (
              <ReadRepository
                repo={repo}
                reading={catalog.reading}
                /* Documents nothing has read, which is the only work a reading does. The old
                   sum subtracted the states it knew about and so counted documents a reading
                   could not finish as waiting for ever, leaving the control offered on a
                   repository where it had nothing left to achieve. */
                waiting={summary.notRead}
                read={summary.read}
                busy={asking || busy}
                onRead={readRepository}
              />
            )}
          </div>
        )}
      </div>

      {loading && <p className="dashboard-metric-caption">Loading documents...</p>}
      {error && <p className="dashboard-inline-error">{error}</p>}

      {catalog && catalog.documents.length === 0 && !loading && (
        <div className="dashboard-empty">
          {catalog.lastAttempt?.outcome === "failed" ? (
            <>
              <p className="text-slate-600">
                Striff could not read this repository to list its documents. Nothing about it is
                known yet — this is not a repository with no documents.
              </p>
              {catalog.lastAttempt.reason && (
                <p className="docs-attempt-reason">{catalog.lastAttempt.reason}</p>
              )}
              <button
                type="button"
                className="dashboard-button dashboard-button-secondary mt-4"
                disabled={busy}
                onClick={() => reload()}
              >
                Try again
              </button>
            </>
          ) : catalog.lastAttempt?.outcome === "listed" || catalog.lastScanMs !== null ? (
            // It looked, and there was nothing to find. Saying "listing now" here is how a page
            // waits forever for something that already happened.
            <p className="text-slate-600">
              Striff found no document it can read in this repository. It looks for Markdown and
              text documents on the default branch, and skips ones that say they are no longer
              current.
            </p>
          ) : (
            <Listing
              what="this repository's documents"
              stale={listingStale}
              onLookAgain={() => {
                setListingStale(false);
                reload();
              }}
            />
          )}
        </div>
      )}

      {catalog && catalog.documents.length > 0 && (
        <div
          className={`docs-split${resizing ? " is-resizing" : ""}`}
          ref={split}
          style={treeWidth == null ? undefined : ({ "--tree-width": `${treeWidth}px` } as any)}
        >
          <div className="docs-list">
            <button type="button" className="tree-search" onClick={openPalette}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.25" />
                <path d="m10.25 10.25 3.5 3.5" />
              </svg>
              <span>Search docs and rules</span>
              <kbd>⌘K</kbd>
            </button>
            {actionError && (scopeKind !== "doc" || detail) && (
              <p className="docs-write-error">{actionError}</p>
            )}
            <div className="docs-filters">
              {FILTER_CHIPS.filter((chip) => chip.always || filterCounts[chip.key] > 0 || filter === chip.key).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={`docs-filter${filter === chip.key ? " is-on" : ""}`}
                  onClick={() => setFilter(chip.key)}
                >
                  {chip.dot && <span className={`docs-fdot is-${chip.dot}`} />}
                  {chip.label} <b>{filterCounts[chip.key]}</b>
                </button>
              ))}
            </div>
            <div className="docs-tree" role="tree">
              {renderNode(tree, 0)}
            </div>
            <div className="docs-tree-foot">
              {catalog.summary.documents} docs{catalog.lastScanMs ? `, listed ${when(catalog.lastScanMs)}` : ""}
              {/* Folder rules live above the tree they affect, so an excluded directory is
                  visible without hunting for the folder it was set on. */}
              {(catalog.exclusions || []).some((rule) => rule.folder) && (
                <span className="docs-foot-folders">
                  <span>Folders excluded:</span>
                  {(catalog.exclusions || [])
                    .filter((rule) => rule.folder)
                    .map((rule) => (
                      <button
                        key={rule.path}
                        type="button"
                        className="docs-foot-folder"
                        disabled={busy}
                        title={`Include ${rule.path}/ again${rule.excludedBy ? ` (excluded by ${rule.excludedBy}${rule.reason ? `: ${rule.reason}` : ""})` : ""}`}
                        onClick={() => setFolderExcluded(rule.path, false)}
                      >
                        {rule.path}/<i aria-hidden="true">×</i>
                        <span className="sr-only"> — include again</span>
                      </button>
                    ))}
                </span>
              )}
            </div>
          </div>
          {/* The edge between the tree and what it selects, which can be dragged. A separator with a
              value is what a splitter is to a screen reader, and the arrow keys move it for
              whoever is not using a pointer. Twice pressed, it goes back to the width it had. */}
          <div
            className="docs-split-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Width of the document tree"
            aria-valuemin={TREE_MIN}
            aria-valuemax={treeMax()}
            aria-valuenow={Math.round(treeWidth ?? treeNow())}
            tabIndex={0}
            title="Drag to resize. Double-click to reset."
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              setResizing(true);
            }}
            onPointerMove={(event) => {
              if (!resizing || !split.current) return;
              resizeTree(event.clientX - split.current.getBoundingClientRect().left, false);
            }}
            onPointerUp={(event) => {
              if (!resizing) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              setResizing(false);
              if (split.current) {
                resizeTree(event.clientX - split.current.getBoundingClientRect().left, true);
              }
            }}
            onPointerCancel={() => setResizing(false)}
            onDoubleClick={() => resizeTree(null, true)}
            onKeyDown={(event) => {
              const at = treeWidth ?? treeNow();
              const to = event.key === "ArrowLeft" ? at - TREE_STEP
                : event.key === "ArrowRight" ? at + TREE_STEP
                : event.key === "Home" ? TREE_MIN
                : event.key === "End" ? treeMax()
                : null;
              if (to == null) return;
              event.preventDefault();
              resizeTree(to, true);
            }}
          />
          <div className="docs-pane">
            {/* ── A folder, or the repository: everything beneath it ── */}
            {scopeKind !== "doc" && (
              <>
                <div className="docs-pane-head">
                  <span className="docs-pane-path">
                    {scopeKind === "root" ? (
                      <b>{repo}</b>
                    ) : (
                      selected.split("/").map((part, index, all) => (
                        <span key={index}>
                          {index > 0 && <i className="docs-crumb-sep">/</i>}
                          {index === all.length - 1 ? <b>{part}/</b> : part}
                        </span>
                      ))
                    )}
                  </span>
                  <a
                    className="docs-pane-github"
                    href={githubUrl(selected, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${scopeKind === "root" ? repo : `${selected}/`} on GitHub${branch ? `, at ${branch}` : ""}`}
                  >
                    <GitHubMark />
                    {scopeKind === "root" ? "Open repository" : "Open folder"}
                  </a>
                  <span className="docs-pane-actions">
                    {scopeKind === "folder" && rowMenu(selected, undefined, true, "pane")}
                  </span>
                </div>

                {/* A folder has no state of its own, and its rule count is not trustworthy
                    without the states of the documents under it: fourteen rules, plus whatever
                    is in three files nobody has read.

                    Only for a folder. At the repository the chips above the tree count the same
                    documents in the same words, and saying it twice on one screen made the tree's
                    own chips look like they meant something else. */}
                {scopeKind === "folder" && (
                <p className="docs-scope-summary">
                  <button
                    type="button"
                    className={`docs-scope-part${filter === "all" ? " is-on" : ""}`}
                    title="Every document here, whatever state it is in."
                    onClick={() => setFilter("all")}
                  >
                    {scopeDocs.length} document{scopeDocs.length === 1 ? "" : "s"}
                  </button>
                  {scopeSummary.map((part) => (
                    <span key={part.key}>
                      <i className="docs-scope-sep" aria-hidden="true">·</i>
                      <button
                        type="button"
                        className={`docs-scope-part${filter === part.key ? " is-on" : ""}`}
                        title={`${part.help} Click to show these in the tree.`}
                        onClick={() => setFilter(filter === part.key ? "all" : part.key)}
                      >
                        {part.count} {part.label}
                      </button>
                    </span>
                  ))}
                </p>
                )}

                {rulesLoading && !rulesIndex && (
                  <p className="dashboard-metric-caption">Reading this repository's rules…</p>
                )}
                {rulesIndex && scopeRows.length === 0 && (
                  <p className="dashboard-metric-caption">
                    {/* A truncated answer is the one case where an empty scope is not an answer
                        about the scope: the rules exist and this list did not reach them. */}
                    {rulesIndex.truncated
                      ? "This repository holds more rules than one list can carry, and the documents before this one fill it. Striff has these; this page cannot reach them yet."
                      : !scopeDocs.some((doc) => doc.state === "NOT_READ")
                      ? "Striff read these docs and found no rule about the code in them."
                      : summary && summary.notRead > 0 && !sample
                      ? `Nothing here has been read yet. Read ${summary.notRead} doc${summary.notRead === 1 ? "" : "s"} now, above, does it without waiting for a pull request.`
                      : "Nothing here has been read yet. Striff reads a doc the first time a pull request changes code that doc talks about."}
                  </p>
                )}
                {rulesIndex && scopeRows.length > 0 && (
                  <RulesTable
                    rows={scopeRows}
                    owner={owner}
                    name={name}
                    branch={branch}
                    scopeLabel={scopeLabel}
                    fileStem={scopeFileStem}
                    showPath
                    filter={ruleFilter}
                    docCount={scopeRuleDocs}
                    truncated={!!rulesIndex.truncated}
                    onOpenDoc={(path) => openDoc(path)}
                  />
                )}
              </>
            )}

            {/* ── One document ── */}
            {scopeKind === "doc" && !detail && actionError && (
              <div className="docs-pane-error">
                <p>{actionError}</p>
                <button type="button" onClick={() => openDoc(selected)} disabled={busy}>
                  Try again
                </button>
              </div>
            )}
            {scopeKind === "doc" && !detail && !actionError && (
              <p className="dashboard-metric-caption">Loading…</p>
            )}
            {scopeKind === "doc" && detail && (
              <>
                <div className="docs-pane-head">
                  <span className="docs-pane-path">
                    {selected.split("/").map((part, index, all) => (
                      <span key={index}>
                        {index > 0 && <i className="docs-crumb-sep">/</i>}
                        {index === all.length - 1 ? <b>{part}</b> : part}
                      </span>
                    ))}
                  </span>
                  {/* Reading the document itself is the first thing anyone does when a rule looks
                      wrong, so it is a link rather than an item in a menu nobody opens. */}
                  <a
                    className="docs-pane-github"
                    href={githubUrl(selected, false)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${selected} on GitHub${branch ? `, at ${branch}` : ""}`}
                  >
                    <GitHubMark />
                    Open on GitHub
                  </a>
                  <span className="docs-pane-actions">{rowMenu(selected, detail.document, false, "pane")}</span>
                </div>
                <p className={`docs-state-line is-${detail.document.state.toLowerCase()}`}>
                  <span
                    className={`docs-sdot is-${
                      detail.document.outdated && detail.document.state === "READ"
                        ? "outdated"
                        : detail.document.state.toLowerCase()
                    }`}
                  />
                  <span>
                    {withCode(stateLine(detail.document,
                      coveringFolder(detail.document.path, catalog?.exclusions)))}
                  </span>
                </p>

                {/* How many rules came out of this doc, said in words.
                    A doc Striff read and found nothing in used to show the extraction date and
                    then simply stop, which reads like a page that failed to load. Zero is an
                    answer, and a doc is entitled to have it stated. The same line carries the
                    count when there are rules, so the number under the table is never in doubt,
                    and it says separately when rules exist but nothing has judged them. */}
                {(detail.document.state === "READ" || detail.rules.length > 0) && (
                  <p className="docs-rule-count">
                    {detail.rules.length === 0 ? (
                      <>
                        <b>0 rules</b> extracted from this doc. Striff read it and found nothing in
                        it that states a rule about the code.
                      </>
                    ) : (
                      <>
                        <b>{detail.rules.length} rule{detail.rules.length === 1 ? "" : "s"}</b>{" "}
                        extracted from this doc
                        {scopeRows.length < detail.rules.length && (
                          <>
                            {", "}
                            {detail.rules.length - scopeRows.length} of which nothing has been able
                            to judge yet, so {detail.rules.length - scopeRows.length === 1 ? "it is" : "they are"}{" "}
                            not listed
                          </>
                        )}
                        .
                      </>
                    )}
                  </p>
                )}

                {scopeRows.length > 0 && (
                  <RulesTable
                    rows={scopeRows}
                    owner={owner}
                    name={name}
                    branch={branch}
                    scopeLabel={scopeLabel}
                    fileStem={scopeFileStem}
                    showPath={false}
                    filter={ruleFilter}
                    docCount={1}
                  />
                )}

                {staleByDoc.has(selected) && (
                  <div className="docs-stale">
                    <h4>
                      Names this doc writes that the code no longer has
                      <b>{staleByDoc.get(selected)!.length}</b>
                    </h4>
                    <p className="docs-stale-note">
                      These aren't broken rules. The doc names something the default branch
                      doesn't have, so the doc is out of date about it. Edit the doc so it stops
                      naming it, or bring it back; the next reading of the repository closes it
                      either way.
                    </p>
                    <table className="docs-rules docs-stale-table">
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>The name</th>
                          <th>The sentence in your docs</th>
                          <th>What the code has</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staleByDoc.get(selected)!.map((finding) => (
                          <tr key={finding.name}>
                            <td className="docs-rule-line">
                              {finding.sourceLine ? `:${finding.sourceLine}` : ""}
                            </td>
                            <td className="docs-stale-name">
                              <code>{finding.name}</code>
                              <span className={`docs-outcome is-${finding.state === "MOVED" ? "unclear" : "broken"}`}>
                                {finding.state === "MOVED" ? "Moved" : "Gone"}
                              </span>
                            </td>
                            <td className="docs-rule-quote">
                              <Clamped lines={4}>{withCode(finding.sentence || "")}</Clamped>
                            </td>
                            <td>
                              <span className="docs-stale-has">{withCode(staleLine(finding))}</span>
                              <span className="docs-outcome-when">
                                first seen {when(finding.firstSeenMs)}
                              </span>
                              {!sample && (
                                <a
                                  className="docs-issue-link"
                                  href={staleNameIssueUrl(owner, name, selected, finding,
                                    branch || "main")}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Opens GitHub with an issue written out: the doc, the sentence, what the code has and what would close it."
                                >
                                  Open an issue
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
