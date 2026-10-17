import { createPortal } from "react-dom";
import { createElement, lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { staleNameIssueUrl, staleNamePrompt } from "./docIssue";
import FindingActions from "./FindingActions";
import { issueIndex, withRuleIssues, withStaleNameIssue, type FindingIssue, type IssueIndex } from "./findingIssue.ts";
import FlagFinding from "./FlagFinding";
import FloatingPanel from "./FloatingPanel";
import { NOT_ADMIN, ScopeExclude } from "./RuleStateControls";
import {
  applyExclusion,
  applyRuleStates,
  exclusionWrites,
  coveringFolder,
  coveringPath,
  normalizeCatalog,
  normalizeRules,
  ruleCounts,
} from "../lib/ruleStates.js";
import RevisionLine from "./RevisionLine";
import { Clamped, mark, plainText, snippet, useWatch, withCode, when } from "./docRules";
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
import { blobUrl } from "../lib/docMarkup.js";
import { failureMessage, textKey } from "../lib/docView.js";
import ReadRepository, { askedReading, isRunning, type Reading } from "./ReadRepository";

/** Drawn only when a doc's Document tab is first opened, so the Docs page carries no Markdown parser. */
const DocumentView = lazy(() => import("./DocumentView"));

/** What the Document tab holds for one version of one doc. */
type TextEntry =
  | { status: "loading" }
  | { status: "failed"; reason: string }
  | { status: "ready"; data: any };

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
  /**
   * Whether this doc, or a folder above it, is excluded in the rule states; absent from an older
   * server. A doc excluded from reading says so by its state.
   */
  excluded?: boolean;
  /** How many of its rules pull requests aren't checked against. */
  excludedRules?: number;
  /** The state it had before this page excluded it, so including it again can put it back. */
  stateBeforeExclusion?: DocState;
}

/** Whether a doc that has been read was read in part and not from all of it. */
function readInPart(doc: Doc): boolean {
  return doc.state === "READ" && doc.readChars != null && doc.totalChars != null
    && doc.readChars < doc.totalChars;
}

/**
 * What a reader is told about a doc read in part, empty where it was read whole. It says how much
 * was read and what that leaves out, because "read" on its own would claim the rest. The part left
 * out is not always the end: a long doc is read a part at a time, and a part that was not read is
 * read by a later pull request, so the line does not say "the first".
 */
function partLine(doc: Doc): string {
  if (!readInPart(doc)) return "";
  const share = Math.max(1, Math.round((100 * (doc.readChars as number)) / (doc.totalChars as number)));
  return ` This is a long doc: Striff has read ${(doc.readChars as number).toLocaleString("en-US")} of its ${(doc.totalChars as number).toLocaleString("en-US")} characters, about ${share}%. What the rest says isn't checked.`;
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
  /**
   * Read documents waiting to be read again, after Striff changed how it reads, say. Each is
   * shown with the rules it last gave, so it is in none of the counts above that say it waits.
   * Absent from an older server, and then nothing is known to wait.
   */
  waitingToBeReadAgain?: number;
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
  lastAttempt: {
    atMs: number;
    outcome: string;
    reason: string | null;
    documents: number;
    /**
     * True where the listing saw the whole default branch and none of it is in a language Striff
     * reads, false where some of it is, null or absent where that is not known.
     */
    codeNotRead?: boolean | null;
  } | null;
  /** Where the last whole-repository reading got to, null where none was asked for. */
  reading: Reading | null;
  summary: Summary;
  documents: Doc[];
  exclusions: Exclusion[];
}

/**
 * What is said of a repository whose code is in no language Striff reads. Its documents are
 * listed, and could be read, but no rule in them could be checked against code Striff has no
 * model of, so they are not -- and that is a fact about Striff, not about the documents.
 */
const CODE_NOT_READ =
  "Striff reads Java, Python, TypeScript and C#; this repository has no code in them, so its docs aren't checked.";

/** The screen a document is set aside by where the repository's code is in no language Striff reads. */
const CODE_NOT_READ_SCREEN = "code_not_read";

/**
 * Whether the repository's code is in no language Striff reads, by the same two signs the server
 * refuses a reading on: the listing saw no such code, or a reading set every document aside for it.
 */
function isCodeNotRead(catalog: Catalog): boolean {
  const documents = catalog.documents || [];
  return catalog.lastAttempt?.codeNotRead === true
    || (documents.length > 0 && documents.every((doc) => doc.screenedBy === CODE_NOT_READ_SCREEN));
}

/**
 * Documents a reading of the whole repository would read: those nothing has read, and those
 * waiting to be read again. The same count the server refuses a reading on, so the button is
 * offered exactly where a press would be taken. A repository still being listed, or listed with
 * no documents, has none.
 */
function waitingToRead(summary: Summary): number {
  return summary.notRead + (summary.waitingToBeReadAgain || 0);
}

/**
 * What a refused reading is told, by the code the server gave. Each is said here rather than
 * passed through, so it is true of the case it covers: the server once answered every refusal
 * with "Striff has read every document it can read here", which on a repository in a language
 * Striff does not read, or one with no documents, is not so.
 *
 * @return the sentence, and whether nothing a reading could do here will change while this page is
 *     open, so the offer goes and the sentence takes its place. A repository not listed yet will
 *     be, and its page says so already; what this says then is said once, with the other errors.
 */
function refusalOf(code: string | undefined, fallback: string | undefined): { message: string; final: boolean } {
  switch (code) {
    case "nothing_to_read":
      return {
        message: "Striff has read every document it can read here, so a reading has nothing to do. Pull requests and merges keep its rules current.",
        final: true,
      };
    case "nothing_readable":
      return {
        message: "None of these docs can be read for rules: each was skipped, says it is no longer current, was excluded, or couldn't be read, as the list shows.",
        final: true,
      };
    case "code_not_read":
      return { message: CODE_NOT_READ, final: true };
    case "no_documents":
      return {
        message: "Striff found no document it reads in this repository, so there is nothing to read.",
        final: true,
      };
    case "not_listed":
      return {
        message: "Striff hasn't found this repository's docs yet, so there is nothing to read yet.",
        final: false,
      };
    default:
      return { message: fallback || "Couldn't ask Striff to read this repository.", final: false };
  }
}

/** Every rule of the repository, grouped by the document it was read from. */
interface RepoRules {
  documents: { document: Doc; rules: Rule[] }[];
  /** Whether the repository holds more rules than one answer carries. */
  truncated: boolean;
  /** The docs and folders excluded from reading ("" with prefix is the repository); the catalogue's exclusions say the same. */
  excludedPaths?: { path: string; prefix: boolean }[];
  /**
   * Docs and folders whose rules a server from before exclusion covered them set aside as a whole
   * in the rule states, while still reading them. Shown as excluded; a doc or folder is excluded
   * from now on through the exclusions instead, so these are only ever taken back.
   */
  legacyPaths?: { path: string; prefix: boolean }[];
}

/**
 * One name a doc writes that the default branch does not have, or has somewhere else. Found by
 * a reading of the whole repository, and counted apart from the rules: a doc naming something
 * that is gone is a stale doc, not a broken rule.
 */
interface StaleName {
  docPath: string;
  name: string;
  /**
   * ABSENT where the code declares nothing by the name, RENAMED where it declares it once in
   * another case (renamedTo), MOVED where it declares it elsewhere.
   */
  state: string;
  sentence: string | null;
  sourceLine: number | null;
  namespace: string | null;
  /** A file the repository's history holds for it, where that is what shows it was here. */
  historicalPath: string | null;
  /**
   * Other names the package holds, where that is what shows it is missing. The first few in
   * alphabetical order, so not a list for a reader: nearNames is.
   */
  siblings: string[];
  packageSize: number | null;
  /** For a renamed name: the spelling the code declares now, and the file declaring it. */
  renamedTo?: string | null;
  renamedToPath?: string | null;
  /** Names the package declares that read as near this one, best first; empty where none does. */
  nearNames?: string[];
  movedToNamespace: string | null;
  movedToPath: string | null;
  firstSeenMs: number;
  lastSeenMs: number;
  /** The commit that removed historicalPath, where history said; absent otherwise. */
  removedBySha?: string | null;
  removedByMessage?: string | null;
  removedAtMs?: number | null;
  removedByUrl?: string | null;
  /** The GitHub issue the stale name is tracked in, where the server knows of one. */
  issue?: FindingIssue | null;
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
  if (finding.state === "RENAMED" && finding.renamedTo) {
    return `Renamed: \`${simpleName(finding.name)}\` is now \`${finding.renamedTo}\`${finding.renamedToPath ? `, at \`${finding.renamedToPath}\`` : ""}.`;
  }
  const hint = nearHint(finding);
  if (finding.historicalPath) {
    return `The repository once had \`${finding.historicalPath}\`. It doesn't now.${hint}`;
  }
  return `${finding.namespace ? `\`${finding.namespace}\`` : "Its package"} declares nothing by this name.${hint}`;
}

/**
 * The names the package declares that read as near a missing one, or nothing. Never a list of
 * whatever the package holds: an unrelated name beside a missing one is noise.
 */
function nearHint(finding: StaleName): string {
  const near = finding.nearNames || [];
  if (near.length === 0) return "";
  const lower = simpleName(finding.name).toLowerCase();
  const sameName = near.filter((name) => name.toLowerCase() === lower);
  if (sameName.length > 1) {
    return ` Several types share this name in other capitalisations: ${sameName.map((name) => `\`${name}\``).join(", ")}.`;
  }
  return ` Closest ${near.length === 1 ? "name" : "names"} there: ${near.map((name) => `\`${name}\``).join(", ")}.`;
}

/** A name without the package a doc writes before it. */
function simpleName(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1);
}

/** The word a name's badge carries. */
function staleLabel(finding: StaleName): string {
  if (finding.state === "MOVED") return "Moved";
  if (finding.state === "RENAMED") return "Renamed";
  return "Gone";
}

/** A moved or renamed name is still in the code; only a gone one is marked as broken. */
function staleTone(finding: StaleName): string {
  return finding.state === "MOVED" || finding.state === "RENAMED" ? "unclear" : "broken";
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
 * How a reader names the folder an exclusion was set on: its path with a slash, or the repository.
 */
function folderName(rule: { path: string }): string {
  return rule.path === "" ? "the repository" : `${rule.path}/`;
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

/**
 * Why a screen skipped a doc, as a reader is told it. The reason is stored as "screen: why"; the
 * screen's name is for the logs, not a reader, wherever the reason is shown.
 */
function screenWhy(reason: string): string {
  return reason.replace(/^[a-z_]+:\s*/, "");
}

function stateLineOf(doc: Doc, covering?: Exclusion | null): string {
  switch (doc.state) {
    case "READ":
      if (!doc.lastExtractedMs && !doc.ruleCount) {
        // Read, and nothing in it states a rule, so there is no extraction to date. The line under
        // this one says so; this one saying "Striff has rules for this doc" contradicted it.
        return "Striff has read this doc.";
      }
      if (!doc.lastExtractedMs) {
        // A repository read before Striff kept a catalogue: the rules are real, the date is not
        // known, and inventing one would be worse than saying so.
        return "Striff has rules for this doc from a reading it made before it kept a record of when. They refresh on the next pull request that changes code this doc talks about.";
      }
      return `Rules last read ${when(doc.lastExtractedMs)}${doc.lastExtractedPullNo ? ` on PR #${doc.lastExtractedPullNo}` : ""}.`;
    case "NOT_READ":
      return "Striff hasn't read this doc yet. It reads a doc the first time a pull request changes code the doc talks about.";
    case "SCREENED_OUT":
      if (doc.forced) {
        return `Striff skipped this doc: it found no rule in it to check${doc.screenReason ? ` (${screenWhy(doc.screenReason)})` : ""}. ${doc.forcedBy ? `${doc.forcedBy} asked` : "You asked"} Striff to read it anyway${doc.forcedReason ? `: “${doc.forcedReason}”` : ""}, so it will on the next pull request that changes code this doc talks about.`;
      }
      return doc.screenReason
        ? `Skipped: ${screenWhy(doc.screenReason)}`
        : "Striff skipped this doc: it found no rule in it that could be checked against code.";
    case "RETIRED":
      return doc.retiredReason
        ? `This doc says it is no longer current: ${doc.retiredReason}`
        : "This doc says it is no longer current, so its rules aren't checked.";
    case "UNREADABLE":
      return "Striff couldn't finish reading this doc. That isn't counted as “no rules”; it tries again on the next pull request that touches the code it names.";
    case "EXCLUDED":
      if (covering && covering.path === "") {
        return `You excluded this repository${covering.excludedBy ? `, ${covering.excludedBy}` : ""}${covering.reason ? `: “${covering.reason}”` : ""}. Striff doesn't read any doc in it, so it costs nothing, and these rules aren't checked. Including the repository again brings every doc back.`;
      }
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
 * Which documents the tree shows, by what state each document is in.
 *
 * These count documents and are facts about a document rather than about its rules. A folder's
 * summary line leads here: every part of it is one of these, so "1 not read" is a sentence you
 * can click. "With results" is the view the tree opens on where there are any: the documents with
 * a rule that holds or is broken, or a stale name.
 */
type DocFilter =
  | "results"
  | "all"
  | "notRead"
  | "unreadable"
  | "skipped"
  | "retired"
  | "excluded"
  | "forced";

/**
 * Which rules the tree and the table show, by how they stand or that they are excluded. These
 * count rules (stale names count names), and choosing one narrows the tree to the documents
 * holding such rules and the table to those rules.
 */
type RuleChip = "holds" | "broken" | "unchecked" | "stale" | "excludedRules";

/** The one thing the tree is filtered by: a document state, or a kind of rule. */
type Filter = DocFilter | RuleChip;

const DOC_FILTER_TEST: Record<Exclude<DocFilter, "results" | "excluded">, (doc: Doc) => boolean> = {
  forced: (doc) => doc.forced,
  all: () => true,
  notRead: (doc) => doc.state === "NOT_READ",
  unreadable: (doc) => doc.state === "UNREADABLE",
  skipped: (doc) => doc.state === "SCREENED_OUT",
  retired: (doc) => doc.state === "RETIRED",
};

/**
 * One chip. `hidden` is a filter with no chip of its own, reached from a folder's summary line,
 * whose chip shows only while it is the filter in use, so the tree never filters by something the
 * chips do not say.
 */
interface Chip<K> { key: K; label: string; dot: string; always: boolean; help: string; hidden?: boolean }

/** The chips above the tree that count documents, in the order a reader looks for them. */
const DOC_CHIPS: Chip<DocFilter>[] = [
  { key: "results", label: "With results", dot: "", always: false, help: "Documents with a rule that holds or is broken, or a stale name." },
  { key: "all", label: "All", dot: "", always: true, help: "Every document in this repository, whatever state it is in." },
  { key: "notRead", label: "Not read yet", dot: "unread", always: true, help: "Documents Striff hasn't read yet, so any rule in them is not counted here." },
  { key: "unreadable", label: "Couldn't read", dot: "broken", always: false, help: "Documents Striff couldn't finish reading. That isn't counted as “no rules”." },
  { key: "skipped", label: "Skipped", dot: "other", always: true, help: "Documents Striff skipped because it found no rule in them that could be checked against code." },
  { key: "retired", label: "Retired", dot: "other", always: false, help: "Documents that say they are no longer current, so their rules aren't checked." },
  { key: "excluded", label: "Excluded", dot: "other", always: true, help: "Documents excluded here: Striff doesn't read them and none of their rules are checked." },
  { key: "forced", label: "Read anyway", dot: "other", always: false, hidden: true, help: "Documents Striff skipped that this repository asked it to read regardless." },
];

/** The chips above the tree that count rules. */
const RULE_CHIPS: Chip<RuleChip>[] = [
  { key: "holds", label: "Holding", dot: "held", always: true, help: "Included rules the code keeps." },
  { key: "broken", label: "Broken", dot: "broken", always: true, help: "Included rules the code does not keep." },
  { key: "unchecked", label: "Not checked yet", dot: "unread", always: false, help: "Included rules nothing has checked against the code yet." },
  { key: "stale", label: "Stale names", dot: "stale", always: false, help: "Names the docs write that the default branch no longer declares, or declares somewhere else. Counted in names." },
  { key: "excludedRules", label: "Excluded", dot: "other", always: true, help: "Rules pull requests aren't checked against: excluded on their own, or with their doc or folder." },
];

/** Which rules the table lists for each kind of rule chosen above the tree. */
const TABLE_FILTER: Partial<Record<Filter, RuleFilter>> = {
  holds: "holds",
  broken: "broken",
  unchecked: "unchecked",
  excludedRules: "excluded",
};

/**
 * What a folder's own row cannot say.
 *
 * A row's badges are facts about one file. A folder has no single state, so they cannot move up to
 * it -- but without them a folder's rule count is not trustworthy: fourteen rules under `docs/adr/`
 * could be all of them, or fourteen plus whatever is in three documents nobody has read. A table of
 * rules cannot say this, because a document with no rules has no row to say it in. The same states
 * as the document chips, in the same words.
 */
const SUMMARY_PARTS: { key: Filter; label: string; help: string }[] = [
  { key: "stale", label: "with stale names", help: "Documents with a stale name: one the default branch no longer declares, or declares somewhere else." },
  ...DOC_CHIPS
    .filter((chip) => chip.key !== "results" && chip.key !== "all")
    .map((chip) => ({ key: chip.key as Filter, label: chip.label.toLowerCase(), help: chip.help })),
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
    const ownBroken = node.doc && node.doc.state !== "EXCLUDED" ? node.doc.brokenRules : 0;
    node.broken = ownBroken + node.children.reduce((sum, c) => sum + c.broken, 0);
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

/** Two arrows chasing each other: load again. */
export const RefreshMark = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.25 6.5A5.25 5.25 0 0 0 3.6 4.4" />
    <path d="M3.25 2.25v2.5h2.5" />
    <path d="M2.75 9.5a5.25 5.25 0 0 0 9.65 2.1" />
    <path d="M12.75 13.75v-2.5h-2.5" />
  </svg>
);

const TickMark = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

/**
 * A repository's badge, drawn from the live image. Fetched rather than only pointed at, so its alt
 * text can be the badge's own title; nothing is drawn until it has arrived, and nothing at all if
 * it does not, so a badge that cannot be had never leaves a gap or a broken image behind.
 */
function LiveBadge({ src }: { src: string }) {
  const [shown, setShown] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    let current = true;
    let url: string | null = null;
    setShown(null);
    fetch(src)
      .then(async (res) => {
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.includes("svg")) return;
        const text = await res.text();
        const svg = new DOMParser().parseFromString(text, "image/svg+xml");
        const title = svg.querySelector("title")?.textContent?.trim() || svg.documentElement.getAttribute("aria-label") || "";
        if (!current || svg.querySelector("parsererror")) return;
        url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
        setShown({ url, title: title || "Striff badge" });
      })
      .catch(() => {
        // Nothing is drawn: the chip beside it stands alone.
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);
  if (!shown) return null;
  return (
    <img
      className="docs-live-badge"
      src={shown.url}
      alt={shown.title}
      title={shown.title}
      height={20}
      onError={() => setShown(null)}
    />
  );
}

/** A 16px stroke icon for the tabs above one doc's rules and text, drawn like the dashboard's nav icons. */
const PaneTabIcon = ({ paths }: { paths: string[] }) =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    ...paths.map((d, i) => createElement("path", { key: i, d }))
  );

export const GitHubMark = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 13, height: 13, fill: "currentColor", "aria-hidden": true },
    createElement("path", {
      d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
    })
  );

/**
 * Where a read-only view reads a repository's documents from, in place of the signed-in proxy: a
 * public repository's page, which anyone may read and nobody may change from here.
 */
export interface DocsSource {
  /**
   * The URL of one read: the catalogue (""), every rule, the names gone, one document, or the text
   * of one document at a version.
   */
  url(view: "" | "rules" | "type-findings" | "finding-issues" | "doc-text", path?: string, version?: string): string;
  /** What the view says under the repository's name, in place of how to use the tree. */
  lede?: ReactNode;
  /** The repository's README badge, shown beside its name; same-origin, so its title can be read. */
  badgeUrl?: string;
  /** Something to offer at the head's top right, above the counts. */
  action?: ReactNode;
}

export default function DocsTab({
  installationId,
  repos,
  openRepo,
  sample,
  source,
  initial,
  inShell,
  actionsSlot,
  badge,
}: {
  installationId: number;
  /** The repositories to pick from; the dashboard's carry whether each is private, and its branch. */
  repos: { full_name: string; private?: boolean; default_branch?: string; has_issues?: boolean }[];
  /** The repository to show. The shell's repository header picks it; this view only reads it. */
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
    /** One document's text and where its rules are in it, as the text endpoint sends them. */
    docText?: (path: string) => any;
  };
  /**
   * Read a public page instead of the signed-in dashboard. Nothing can be changed, and nothing
   * offers to: no menus, no reading to ask for, no issue to open on a repository that is not the
   * reader's.
   */
  source?: DocsSource;
  /**
   * The answers this view opens on, read when the page was built: it renders them at once, the
   * same as the built markup, and reads them again quietly once it is on screen.
   */
  initial?: {
    catalog: any;
    rules: any;
    staleNames: any;
  };
  /**
   * Shown under the dashboard's tab row, which names the repository and the view and holds the
   * refresh. The head then leaves those out and keeps the lede, branch line and counts.
   */
  inShell?: boolean;
  /**
   * Where the shell wants this view's refresh and the repository's README badge: its tab row. With
   * `inShell` they are drawn there, the badge right after the refresh, and not in the head.
   */
  actionsSlot?: HTMLElement | null;
  badge?: ReactNode;
}) {
  const [repo, setRepo] = useState<string>(openRepo || repos[0]?.full_name || "");
  const [catalog, setCatalog] = useState<Catalog | null>(normalizeCatalog(initial?.catalog) ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  /** Every rule of the repository, for the scopes a single document's answer cannot serve. */
  const [rulesIndex, setRulesIndex] = useState<RepoRules | null>(normalizeRules(initial?.rules) ?? null);
  /**
   * The issues the findings are tracked in. Asked for after the rules are on screen and merged into
   * them where they are shown, so a slow or failed answer never holds the page up or changes it.
   */
  const [findingIssues, setFindingIssues] = useState<IssueIndex | null>(null);
  /** Counts each answer to a read of the rules, so the issues are asked for again after one. */
  const [rulesRead, setRulesRead] = useState(0);
  const haveRules = rulesIndex != null;
  useEffect(() => {
    // The demo carries its own issues; a page with no rules yet has nothing to put them on.
    if (sample || !haveRules || !owner || !name) return;
    const controller = new AbortController();
    fetch(readUrl("finding-issues"), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((answer) => {
        // A failed read leaves whatever links are on screen; an answer replaces them.
        if (answer !== undefined && !controller.signal.aborted) setFindingIssues(issueIndex(answer));
      })
      .catch(() => {
        // No answer, no links: the buttons stay as they are.
      });
    return () => controller.abort();
  }, [repo, rulesRead, haveRules]);
  const [rulesLoading, setRulesLoading] = useState(false);
  /** The names the docs write that the code no longer has, null until a reading has reported. */
  const [staleNames, setStaleNames] = useState<StaleNames | null>(
    initial && Array.isArray(initial.staleNames?.findings) ? initial.staleNames : null
  );
  /** What is selected: the empty path is the repository itself, which is where this opens. */
  const [selected, setSelected] = useState<string>("");
  /** Which of a doc's two views is open; a doc always opens on its rules. */
  const [paneTab, setPaneTab] = useState<"rules" | "document">("rules");
  /** The text of each doc version the Document tab has been opened on, asked for once each. */
  const [docTexts, setDocTexts] = useState<Record<string, TextEntry>>({});
  /**
   * The filter someone picked, null until they pick one. Unpicked, the tree shows the documents
   * with results, or all of them where none has any, so it is never empty on load.
   */
  const [chosenFilter, setFilter] = useState<Filter | null>(null);
  // How wide the tree is, in pixels; null until someone has dragged it, which leaves the width
  // to the stylesheet. Remembered, because a width someone chose for long paths is one they
  // would have to choose again on every visit.
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const split = useRef<HTMLDivElement>(null);
  /** Whether this reader may turn rules on and off: null until GitHub has said. */
  const [canManageRules, setCanManageRules] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /** Whether this page gave up waiting for a listing that had not arrived. */
  const [listingStale, setListingStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    initial
      ? allFolders(buildTree(initial.catalog?.documents || [], (openRepo || "").split("/")[1] || ""))
      : new Set([""])
  );
  /** Whether the view still shows the answers it was built with, which a first load refreshes. */
  const seeded = useRef(!!initial);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The control of the one menu open, which that menu opens beside.
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // What a failed write or a failed document read said, shown where it happened.
  const [actionError, setActionError] = useState("");
  const [asking, setAsking] = useState(false);
  /**
   * Why the server just refused a reading of this repository, where the refusal means there is
   * nothing for one to do; null otherwise. It takes the button's place until another repository
   * is opened: offering it again would only be refused again.
   */
  const [readRefused, setReadRefused] = useState<string | null>(null);
  /** Which document was asked for last; an older answer never paints over a newer one. */
  const openedAt = useRef(0);
  /** The same for the catalogue and the rules: switching twice must not land on the first one. */
  const loadedAt = useRef(0);
  const rulesAt = useRef(0);

  /** What the view is showing right now, for the listing wait to look at before it reloads. */
  const catalogRef = useRef<Catalog | null>(null);
  /** The same for the rules, so a change is applied to the latest answer, not one a closure held. */
  const rulesRef = useRef<RepoRules | null>(null);

  const [owner, name] = repo.split("/");
  catalogRef.current = catalog;
  rulesRef.current = rulesIndex;

  /** Puts a catalogue on the page and in its ref at once, so the next change starts from it. */
  function putCatalog(next: Catalog | null) {
    catalogRef.current = next;
    setCatalog(next);
  }

  /** Puts a rules answer on the page and in its ref at once. */
  function putRules(next: RepoRules | null) {
    rulesRef.current = next;
    setRulesIndex(next);
  }
  const branch = catalog?.defaultBranch || null;
  // Unknown is offered as before; only a repository GitHub says takes no issues is spared the link.
  const takesIssues = repos.find((r) => r.full_name === repo)?.has_issues !== false;

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
    // A built page already shows this repository: read it again without taking that away, so
    // nothing on screen blinks out and back, and an answer that fails leaves it as it was.
    if (seeded.current) {
      seeded.current = false;
      loadCatalog(true);
      return;
    }
    // A new repository is read from its root, as a fresh one is.
    setSelected("");
    setPaneTab("rules");
    setDocTexts({});
    setDetail(null);
    setFilter(null);
    putRules(null);
    setStaleNames(null);
    setFindingIssues(null);
    setActionError("");
    setReadRefused(null);
    reload();
  }, [repo, installationId, repos.length]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  /** Nothing here can be changed: the example repository, or a public page. */
  const readOnly = !!sample || !!source;

  // Who may turn rules on and off is asked once per repository, so the switches can say up front
  // why they are off rather than fail on a click. The demo's switches work on the page alone.
  useEffect(() => {
    if (source) return;
    if (sample) {
      setCanManageRules(true);
      return;
    }
    if (!owner || !name) return;
    let current = true;
    setCanManageRules(null);
    fetch(`/.netlify/functions/doc-catalog-proxy?view=permissions&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((answer) => {
        if (current) setCanManageRules(answer ? !!answer.canManageRules : null);
      })
      .catch(() => {
        // Unknown leaves the controls on; the write itself is refused if it should be.
      });
    return () => {
      current = false;
    };
  }, [repo, installationId]);

  /** Why the rule switches are off for this reader, or null where they work. */
  const ruleStateBlocked = canManageRules === false ? NOT_ADMIN : null;
  /** Where the reasons a control is off are written once, for the controls to point at. */
  const blockedId = useId();
  const loadingId = useId();
  /**
   * What a control the reader may not use carries: it stays focusable and says why, rather than
   * being disabled, which a keyboard never reaches and a screen reader never explains.
   */
  const blockedProps = ruleStateBlocked
    ? { "aria-disabled": true as const, "aria-describedby": blockedId, title: ruleStateBlocked }
    : {};
  /** Runs `act` unless the reader may not change what it changes. */
  const unlessBlocked = (act: () => void) => () => {
    if (!ruleStateBlocked) act();
  };

  /**
   * Excludes rules from pull requests or includes them again: a list of rules or, to take back a
   * doc or folder set aside in the rule states before exclusion covered it, a path. The page
   * changes at once, from the latest answer on it; a refused write puts back what was there where
   * nothing else has changed it since, and reads the rules again where something has. The demo
   * changes only the page.
   *
   * The body names the change both ways, `excluded` and `ignored`, so the API from before the
   * rename reads it as well as the one after.
   *
   * @return an error to show, or null
   */
  async function setRuleStates(change: { excluded: boolean; factIds?: string[]; path?: string; prefix?: boolean }):
    Promise<string | null> {
    const before = rulesRef.current;
    if (!before) return "The rules haven't loaded yet.";
    const optimistic = applyRuleStates(before, change) as RepoRules;
    putRules(optimistic);
    if (sample) return null;
    const failed = change.excluded ? "Couldn't exclude that." : "Couldn't include that.";
    const undo = () => {
      if (rulesRef.current === optimistic) putRules(before);
      else loadRules();
    };
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?view=rule-states&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...change, ignored: change.excluded }) }
      );
      const answer = await res.json().catch(() => null);
      if (!res.ok) {
        undo();
        if (answer?.error === "not_repo_admin") setCanManageRules(false);
        return answer?.message || failed;
      }
      if (answer && Array.isArray(answer.documents)) putRules(normalizeRules(answer) as RepoRules);
      return null;
    } catch {
      undo();
      return failed;
    }
  }

  /** How many rules Striff has under a doc, a folder or the repository, for what excluding it says. */
  function rulesUnder(path: string, folder: boolean): number {
    let count = 0;
    for (const group of rulesIndex?.documents || []) {
      const docPath = group.document.path;
      const inside = !folder ? docPath === path
        : path === "" || docPath === path || docPath.startsWith(`${path}/`);
      if (inside) count += group.rules.length;
    }
    return count;
  }

  /**
   * Whether a doc, a folder or the repository is excluded, and by what: its own exclusion, a folder
   * above it, or an entry the rule states still carry for it.
   */
  function exclusionOf(path: string, folder: boolean):
    { excluded: boolean; via: string | null; stillRead: boolean } {
    const listed = (catalog?.exclusions || []).some((rule) => rule.path === path && !!rule.folder === folder);
    const legacy = (rulesIndex?.legacyPaths || []).some((entry) => entry.path === path && entry.prefix === folder);
    // Held only by an old rule-state entry: never stopped from being read, only from being checked.
    if (listed || legacy) return { excluded: true, via: null, stillRead: !listed };
    const above = coveringFolder(path, catalog?.exclusions);
    if (above) return { excluded: true, via: folderName(above), stillRead: false };
    const old = coveringPath(path, rulesIndex?.legacyPaths);
    if (old && old.prefix) return { excluded: true, via: folderName(old), stillRead: true };
    return { excluded: false, via: null, stillRead: false };
  }

  /** The Exclude control for whatever is selected; nothing on a public page. */
  function scopeExclude(path: string, kind: "doc" | "folder" | "repository") {
    if (source) return null;
    const folder = kind !== "doc";
    const { excluded, via, stillRead } = exclusionOf(path, folder);
    return (
      <ScopeExclude
        excluded={excluded}
        via={via}
        stillRead={stillRead}
        rules={rulesUnder(path, folder)}
        kind={kind}
        where={kind === "doc" ? "this doc" : kind === "folder" ? `${path}/` : "this repository"}
        // Excluding a path switches off every rule in it, so it is gated as the rule switches are.
        disabledReason={ruleStateBlocked}
        onApply={async (next) => {
          if (via && !next) {
            // A folder above is what excludes this one: that is the setting to take back.
            const above = coveringFolder(path, catalog?.exclusions)
              || coveringPath(path, rulesIndex?.legacyPaths);
            const abovePath = above?.path ?? "";
            return exclude(abovePath, true, false);
          }
          return exclude(path, folder, next);
        }}
      />
    );
  }

  /** The URL of one read, from the public page where this view reads one. */
  function readUrl(view: "" | "rules" | "type-findings" | "finding-issues" | "doc-text", path?: string, version?: string): string {
    if (source) return source.url(view, path, version);
    return `/.netlify/functions/doc-catalog-proxy?${view ? `view=${view}&` : ""}installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}${path != null ? `&path=${encodeURIComponent(path)}` : ""}${version ? `&version=${encodeURIComponent(version)}` : ""}`;
  }

  /**
   * Both answers this view is built from: what documents exist, and what rules they hold. Asked
   * for together; each has its own counter, so an older answer to either never paints over a newer
   * one.
   */
  async function reload() {
    await Promise.all([loadCatalog(), loadRules()]);
  }

  /**
   * The names the docs write that the code does not have. Asked for beside the catalogue and
   * never in its way: where it cannot be had, the documents are shown without it, and nothing is
   * said about stale names at all, since an empty list would say there are none.
   */
  async function loadStaleNames(wanted: number, keep = false) {
    if (!keep) setStaleNames(null);
    try {
      const res = await fetch(readUrl("type-findings"));
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
      putCatalog(normalizeCatalog(sample.catalog));
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
      const res = await fetch(readUrl(""));
      const data = await res.json();
      // A repository switched away from still answers; it just no longer has a view to paint.
      if (wanted !== loadedAt.current) return;
      if (!res.ok) {
        // The next look is five seconds away, and the page goes on saying it is waiting.
        if (quiet) return;
        setError(data.message || data.error || "Couldn't load this repository's documents");
        // What is on screen was true when it arrived. A refresh that failed is a reason to say so,
        // not to take the documents away from whoever is reading them.
        if (!catalogRef.current) putCatalog(null);
        return;
      }
      putCatalog(normalizeCatalog(data));
      // A quiet look keeps the names on screen until the new answer replaces them.
      loadStaleNames(wanted, quiet);
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
      putRules(normalizeRules(sample.rules));
      return;
    }
    const wanted = ++rulesAt.current;
    setRulesLoading(true);
    try {
      const res = await fetch(readUrl("rules"));
      if (!res.ok || wanted !== rulesAt.current) return;
      putRules(normalizeRules(await res.json()));
      setRulesRead((n) => n + 1);
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
    setPaneTab("rules");
    setDetail(null);
    setActionError("");
    if (sample) {
      setDetail(normalizeCatalog(sample.doc(path)));
      return;
    }
    // Two clicks in a row answer in whatever order the network likes. Only the document asked for
    // last may paint, or the pane shows one document's rules under another's name.
    const wanted = ++openedAt.current;
    try {
      const res = await fetch(readUrl("", path));
      if (wanted !== openedAt.current) return;
      if (!res.ok) {
        const answer = await res.json().catch(() => ({}));
        setActionError(answer.message || answer.error || `Couldn't open ${path}.`);
        return;
      }
      setDetail(normalizeCatalog(await res.json()));
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
    setPaneTab("rules");
    setDetail(null);
    setActionError("");
    // A document that was asked for and has not answered must not paint over a folder.
    openedAt.current += 1;
  }

  /**
   * One write, one answer. A PATCH that failed used to reload the catalogue unchanged and say
   * nothing, so a rejected token or a 500 looked exactly like a change that did not stick.
   */
  async function write(body: unknown, view: "" | "force-read", failed: string): Promise<false | any> {
    if (source) {
      setActionError("This is a public page, so nothing here can be changed.");
      return false;
    }
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
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (answer?.error === "not_repo_admin") setCanManageRules(false);
        setActionError(answer.message || answer.error || failed);
        return false;
      }
      return answer ?? {};
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

  /**
   * Excludes a doc, a folder or the repository (the empty folder) from reading, or includes it
   * again. Excluded, nothing in it is read and none of its rules is checked, now or later.
   *
   * The page changes at once, counts and all, and goes back if the write is refused; the demo
   * changes only the page. A path still set aside in the rule states from before is taken back
   * there too, since that is also what keeps it excluded.
   *
   * @return whether it was done
   */
  async function exclude(path: string, folder: boolean, excluded: boolean): Promise<boolean> {
    if (source) {
      setActionError("This is a public page, so nothing here can be changed.");
      return false;
    }
    if (ruleStateBlocked) {
      setActionError(ruleStateBlocked);
      return false;
    }
    const named = folder ? folderName({ path }) : path;
    const change = { path, folder, excluded };
    setActionError("");
    for (const step of exclusionWrites(catalogRef.current, rulesRef.current, change)) {
      if (step.view === "rule-states") {
        // An old rule-state entry holding the path: taken back where it was set.
        const failed = await setRuleStates(step.body as { excluded: boolean; path: string; prefix: boolean });
        if (failed) {
          setActionError(failed);
          return false;
        }
        continue;
      }
      // Applied to the latest answers on the page, which a write before this one may have replaced.
      const beforeCatalog = catalogRef.current;
      const beforeRules = rulesRef.current;
      const next = applyExclusion(beforeCatalog, beforeRules, change);
      putCatalog(next.catalog as Catalog);
      putRules(next.rules as RepoRules);
      if (sample) continue;
      const answer = await write(step.body, "", `Couldn't ${excluded ? "exclude" : "include"} ${named}.`);
      // A server that does not take the repository as a folder answers with the catalogue unchanged.
      const refused = answer === false
        || (excluded && path === "" && Array.isArray(answer?.exclusions)
          && !answer.exclusions.some((rule: Exclusion) => rule.folder && rule.path === ""));
      if (refused) {
        // Put back only what nothing has replaced since; otherwise the server says what is so.
        if (catalogRef.current === next.catalog && rulesRef.current === next.rules) {
          putCatalog(beforeCatalog);
          putRules(beforeRules);
        } else {
          await reload();
        }
        if (answer !== false) {
          setActionError("Striff can't exclude this repository as a whole yet. Exclude its folders or docs instead.");
        }
        return false;
      }
    }
    if (sample) return true;
    await reloadKeeping(selected);
    return true;
  }

  /**
   * Asks Striff to read every document here. A reader who opens a fresh repository sees a tree of
   * "not read yet" and should not have to find another page to do something about it.
   */
  /** @return false where the request was refused, so the control stops saying it is asking */
  async function readRepository(): Promise<boolean> {
    if (readOnly) return false;
    setAsking(true);
    setActionError("");
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        { method: "POST" }
      );
      if (res.status === 409) {
        const answer = await res.json().catch(() => ({}));
        // A reading already going is what the press asked for: the control goes on saying so,
        // which is true even of a reading Striff started by itself and this page does not report.
        if (answer.error === "already_reading") {
          await reload();
          return true;
        }
        const refusal = refusalOf(answer.error, answer.message);
        if (refusal.final) {
          setReadRefused(refusal.message);
        } else {
          setActionError(refusal.message);
        }
        // The counts the button was offered on were a page load old; these are the ones the
        // server refused on.
        await reload();
        return false;
      }
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


  const allDocs = catalog?.documents || [];

  /**
   * The reading this page reports on: one somebody asked for. A reading Striff started by itself
   * when the page was viewed is never shown, here or anywhere on the page.
   */
  const reading = askedReading(catalog?.reading);

  /** The documents the reading in flight is on, empty where none is going. */
  const readingNow = useMemo(
    () => new Set<string>(isRunning(reading) ? reading?.readingPaths || [] : []),
    [reading]
  );

  /** The stale names of each doc, by the doc's path. */

  const staleByDoc = useMemo(() => {
    const byDoc = new Map<string, StaleName[]>();
    for (const finding of staleNames?.findings || []) {
      byDoc.set(finding.docPath, [...(byDoc.get(finding.docPath) || []), finding]);
    }
    return byDoc;
  }, [staleNames]);

  /**
   * The documents with something to show: an included rule that holds, a broken one where this
   * view shows broken rules (not on a public page), or a name gone. A doc excluded from reading has
   * nothing checked, so it is not one of them.
   */
  const resultDocs = useMemo(() => {
    const paths = new Set<string>(staleByDoc.keys());
    for (const group of rulesIndex?.documents || []) {
      if (group.rules.some((rule) => !rule.excluded
        && (standing(rule) === "holds" || (!source && standing(rule) === "broken")))) {
        paths.add(group.document.path);
      }
    }
    if (!source) {
      for (const doc of allDocs) if (doc.brokenRules + doc.alreadyBrokenRules > 0) paths.add(doc.path);
    }
    for (const doc of allDocs) if (doc.state === "EXCLUDED") paths.delete(doc.path);
    return paths;
  }, [catalog, rulesIndex, staleByDoc, source]);

  /**
   * The documents excluded: from reading, or (from before exclusion covered it) set aside as a
   * whole in the rule states. One word for both, since either way none of their rules is checked.
   */
  const excludedDocs = useMemo(() => {
    const paths = new Set<string>();
    for (const doc of allDocs) {
      if (doc.state === "EXCLUDED" || coveringPath(doc.path, rulesIndex?.legacyPaths)) paths.add(doc.path);
    }
    return paths;
  }, [catalog, rulesIndex]);

  /**
   * How the repository's rules stand, every count in rules. They are of the whole repository
   * whatever is selected, and they are read from the same rule states the switches change, so
   * excluding one rule moves its count from where it stood to Excluded at once. The table below
   * shows what is selected, and says how many of the rules it lists.
   */
  const repoCounts = useMemo(
    () => ruleCounts((rulesIndex?.documents || []).flatMap((group) => group.rules)),
    [rulesIndex]
  );

  /** The documents holding each kind of rule a chip counts, by the doc's path. */
  const ruleDocs = useMemo(() => {
    const byChip: Record<RuleChip, Set<string>> = {
      holds: new Set(), broken: new Set(), unchecked: new Set(), excludedRules: new Set(),
      stale: new Set(staleByDoc.keys()),
    };
    for (const group of rulesIndex?.documents || []) {
      for (const rule of group.rules) {
        const stands = standing(rule);
        if (stands === "unclear") continue;
        const chip: RuleChip = rule.excluded ? "excludedRules" : stands;
        byChip[chip].add(group.document.path);
      }
    }
    return byChip;
  }, [rulesIndex, staleByDoc]);

  const repoStale = useMemo(
    () => allDocs.reduce((sum, doc) => sum + (staleByDoc.get(doc.path)?.length || 0), 0),
    [allDocs, staleByDoc]
  );

  /** Whether a document is one a filter shows. */
  const matches = (key: Filter) => (doc: Doc): boolean => {
    if (key === "results") return resultDocs.has(doc.path);
    if (key === "excluded") return excludedDocs.has(doc.path);
    if (key in ruleDocs) return ruleDocs[key as RuleChip].has(doc.path);
    return DOC_FILTER_TEST[key as keyof typeof DOC_FILTER_TEST](doc);
  };

  /**
   * What each chip counts: documents for the document chips, rules for the rule chips (names, for
   * stale names), each in the unit its group says.
   */
  const filterCounts = useMemo(() => {
    const counted = {} as Record<Filter, number>;
    for (const chip of DOC_CHIPS) counted[chip.key] = allDocs.filter(matches(chip.key)).length;
    counted.holds = repoCounts.holds;
    counted.broken = repoCounts.broken;
    counted.unchecked = repoCounts.unchecked;
    counted.excludedRules = repoCounts.excluded;
    counted.stale = repoStale;
    return counted;
  }, [catalog, staleByDoc, resultDocs, excludedDocs, repoCounts, repoStale]);

  const filter: Filter = chosenFilter ?? (filterCounts.results > 0 ? "results" : "all");
  /** Which rules the table lists: those a rule chip names, or every rule in what is selected. */
  const ruleFilter: RuleFilter = TABLE_FILTER[filter] ?? "all";
  /** Chooses a filter; choosing the one already chosen puts the tree back to every document. */
  const toggleFilter = (key: Filter) => setFilter(filter === key ? "all" : key);

  const documents = useMemo(
    () => allDocs.filter(matches(filter)),
    [catalog, filter, staleByDoc, resultDocs, excludedDocs, ruleDocs]
  );

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
    /** What a reader is told excluded a rule, beside the word; nothing for the rule's own switch. */
    const excludedWith = (rule: Rule, doc: Doc): string | null => {
      if (!rule.excluded) return null;
      if (rule.excludedBy === "excluded" || doc.state === "EXCLUDED") {
        const above = coveringFolder(doc.path, catalog?.exclusions);
        return !above ? "doc" : above.path === "" ? "repository" : "folder";
      }
      if (rule.excludedBy === "document") return "doc";
      if (rule.excludedBy === "folder") {
        return coveringPath(doc.path, rulesIndex?.legacyPaths)?.path === "" ? "repository" : "folder";
      }
      return null;
    };
    if (scopeKind === "doc") {
      if (!detail) return [];
      // The doc's own answer carries its rules; whether each is excluded is the repository's, so
      // it is read from there and a switch moves both. So is the doc's state, which excluding it
      // changes before the doc's own answer is read again.
      const doc = selectedDoc ?? detail.document;
      const states = new Map(
        (rulesIndex?.documents.find((group) => group.document.path === detail.document.path)?.rules || [])
          .map((rule) => [rule.factId, rule])
      );
      return detail.rules
        .filter((rule) => standing(rule) !== "unclear")
        .map((rule) => {
          const state = states.get(rule.factId);
          const own = { ...rule, excluded: state?.excluded ?? rule.excluded, excludedBy: state?.excludedBy ?? rule.excludedBy };
          return { ...own, excludedWith: excludedWith(own, doc), doc };
        });
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
        rows.push({ ...rule, excludedWith: excludedWith(rule, group.document), doc: group.document });
      }
    }
    return rows.sort((a, b) =>
      a.doc.path === b.doc.path
        ? (a.sourceLine || 0) - (b.sourceLine || 0)
        : a.doc.path.localeCompare(b.doc.path)
    );
  }, [scopeKind, selected, detail, rulesIndex, catalog]);
  // The rows as shown: with the issues each is tracked in, once that answer has come.
  const shownRows = useMemo(() => withRuleIssues(scopeRows, findingIssues), [scopeRows, findingIssues]);

  /* ─── The Document tab ──────────────────────────────────────────── */

  /** Whether the selected doc has a Document tab: one doc, with at least one rule to mark in it. */
  const hasDocumentTab = scopeKind === "doc" && !!detail && scopeRows.length > 0;
  /** The version the doc's rules were read from, as the doc's own answer names it; else the doc's. */
  const shownVersion: string | undefined = (() => {
    const showing = (detail as any)?.showing;
    if (typeof showing === "string") return showing;
    return typeof showing?.contentHash === "string" ? showing.contentHash : undefined;
  })();
  const textId = textKey(selected, shownVersion ?? detail?.document.extractedContentHash ?? null);
  const textEntry = docTexts[textId];

  /** Asks for the text of the selected doc's version; only ever called when the tab is opened or retried. */
  async function loadDocText(path: string, version: string | undefined, id: string) {
    const set = (entry: TextEntry) => setDocTexts((was) => ({ ...was, [id]: entry }));
    set({ status: "loading" });
    let answer: any = null;
    let reason = "ERROR";
    try {
      if (sample) {
        answer = sample.docText ? sample.docText(path) : null;
        if (!answer) reason = "NOT_FOUND";
      } else {
        const res = await fetch(readUrl("doc-text", path, version));
        if (res.ok) answer = await res.json();
        else reason = res.status === 404 ? "NOT_FOUND" : "ERROR";
      }
    } catch {
      reason = "UNREACHABLE";
    }
    if (answer && answer.state === "OK" && typeof answer.text === "string") {
      set({ status: "ready", data: answer });
    } else {
      set({ status: "failed", reason: (answer && answer.reason) || reason });
    }
  }

  // The first time the tab is open on a version, and never again for it: a failure waits for Retry.
  useEffect(() => {
    if (paneTab !== "document" || !hasDocumentTab || textEntry) return;
    loadDocText(selected, shownVersion, textId);
  }, [paneTab, hasDocumentTab, textId]);

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

  /**
   * A public page whose documents hold no rule. Its rule counts would be a row of zeros, which
   * says nothing to someone arriving from a link; what it has to show is the names its docs write
   * that the code no longer has, so those lead. Only once the rules have answered: until then
   * nobody knows there are none. A truncated answer has rules this page cannot reach.
   */
  const publicNoRules = !!source && !!rulesIndex && !rulesIndex.truncated && repoCounts.all === 0;
  /** Whether the rule counts are shown: on a public page, only once there are rules to count. */
  const showRuleCounts = !source || (!!rulesIndex && !publicNoRules);
  /** The names gone under whatever is selected, in the order of the documents that write them. */
  const scopeStaleFindings = useMemo(
    () => scopeDocs.flatMap((doc) => staleByDoc.get(doc.path) || []),
    [scopeDocs, staleByDoc]
  );
  /** Whether a public page leads with the names gone, above whatever rules the scope has. */
  const namesFirst = !!source && !!rulesIndex && scopeKind !== "doc"
    && scopeStaleFindings.length > 0;
  /**
   * Whether a folder or the repository shows its names gone in place of its rules: the stale names
   * chip counts names, so what it opens on is the names.
   */
  const namesOnly = filter === "stale" && scopeKind !== "doc" && scopeStaleFindings.length > 0;

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
    [scopeDocs, staleByDoc, excludedDocs, ruleDocs, resultDocs]
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
        (plainText(rule.statement).toLowerCase().includes(term) ||
          plainText(rule.quote).toLowerCase().includes(term))
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
    // A public page's reader has nothing to exclude or insist on.
    if (source) return null;
    // The same document has a menu in the tree and another in its open header; they are told
    // apart by where they are, so opening one does not open the other.
    const id = `${where}:${path}`;
    const open = menuFor === id;
    const covering = coveringFolder(path, catalog?.exclusions);
    return (
      <span className="docs-menu-wrap">
        <button
          ref={open ? menuButton : undefined}
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
          <FloatingPanel anchor={menuButton} as="span" className="docs-menu" role="menu">
            {folder ? (
              covering ? (
                // Excluded by its own rule, or by a folder above it: either way the rule to take
                // back is that folder's, not this path's.
                <button
                  type="button"
                  role="menuitem"
                  {...blockedProps}
                  onClick={unlessBlocked(() => exclude(covering.path, true, false))}
                >
                  {covering.path === path
                    ? "Include this folder again"
                    : `Include ${folderName(covering)} again`}
                </button>
              ) : (
                <button type="button" role="menuitem"
                  title="Striff won't read any doc under it, and none of their rules are checked."
                  {...blockedProps}
                  onClick={unlessBlocked(() => exclude(path, true, true))}>
                  Exclude this folder
                </button>
              )
            ) : doc?.state === "EXCLUDED" ? (
              // A document excluded by a folder rule cannot be included on its own: deleting a
              // rule for its path would delete nothing, and the doc would stay excluded.
              covering ? (
                <button
                  type="button"
                  role="menuitem"
                  {...blockedProps}
                  onClick={unlessBlocked(() => exclude(covering.path, true, false))}
                >
                  Include {folderName(covering)} again
                </button>
              ) : (
                <button type="button" role="menuitem" {...blockedProps}
                  onClick={unlessBlocked(() => exclude(path, false, false))}>
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
                <button type="button" role="menuitem"
                  title="Striff won't read this doc, and none of its rules are checked."
                  {...blockedProps}
                  onClick={unlessBlocked(() => exclude(path, false, true))}>
                  Exclude this doc
                </button>
              </>
            )}
            <a
              role="menuitem"
              href={githubUrl(path, !!folder)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </FloatingPanel>
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
        {/* A doc whose rules were set aside as a whole before exclusion covered it: excluded,
            in the same word, though its state is still what reading it found. */}
        {doc.state !== "EXCLUDED" && excludedDocs.has(doc.path) && (
          <span className="docs-badge is-excluded" title="Excluded: pull requests aren't checked against this doc's rules.">
            Excluded
          </span>
        )}
        {/* An excluded doc's rules aren't checked, so nothing in it is reported broken. */}
        {doc.state !== "EXCLUDED" && doc.brokenRules + doc.alreadyBrokenRules > 0 && (
          <span className="docs-badge is-broken" title="Rules of this doc the code does not keep.">
            {doc.brokenRules + doc.alreadyBrokenRules} broken
          </span>
        )}
        {staleByDoc.has(doc.path) && (
          <span
            className="docs-badge is-stale"
            title="Stale names in this doc: gone, moved or renamed in the code."
          >
            {staleByDoc.get(doc.path)!.length} stale name{staleByDoc.get(doc.path)!.length === 1 ? "" : "s"}
          </span>
        )}
        {doc.state !== "READ" && !beingRead && (
          <span
            className={`docs-badge is-${doc.state.toLowerCase()}`}
            title={doc.state === "EXCLUDED" ? "Excluded: Striff doesn't read this doc, and none of its rules are checked." : undefined}
          >
            {STATE_LABEL[doc.state]}
          </span>
        )}
        {/* A setting rather than a state: this repository asked for a skipped doc to be read. */}
        {doc.forced && doc.state !== "READ" && doc.state !== "EXCLUDED" && !beingRead && (
          <span className="docs-badge is-forced" title={`${doc.forcedBy ? `${doc.forcedBy} asked` : "You asked"} Striff to read this doc whatever its screens say.`}>
            Read anyway
          </span>
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
            ["RETIRED", "SCREENED_OUT", "EXCLUDED"].includes(doc.state) || excludedDocs.has(doc.path) ? " is-dim" : ""
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
    // A folder excluded from reading, or set aside as a whole in the rule states before exclusion
    // covered it: one word for either.
    const legacyFolder = coveringPath(node.path, rulesIndex?.legacyPaths);
    const excludedFolder = coveringFolder(node.path, catalog?.exclusions)
      ?? (legacyFolder?.prefix
        ? { path: legacyFolder.path, folder: true, excludedBy: null, reason: null, atMs: 0 }
        : null);
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
              }${excludedFolder.path === node.path ? "" : ` with ${folderName(excludedFolder)}`}. Striff doesn't read the docs ${
                isRoot ? "here" : "under it"}, and none of their rules are checked.`}
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
          and its docs appear as soon as Striff has read the repository.
        </p>
        <a
          href="https://github.com/apps/striffs/installations/new"
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
  // Whether the repository's code is in no language Striff reads, so no document in it is checked.
  // Said only of a repository with documents: of one without, "its docs aren't checked" would be
  // about docs it does not have, and the page already says it found none.
  const codeNotRead = !!catalog && allDocs.length > 0 && isCodeNotRead(catalog);
  // What a reading could read. Nothing while the repository is still being listed or has no
  // documents, since there are none to count.
  const readWaiting = summary ? waitingToRead(summary) : 0;
  // Why a reading could do nothing here, said in the button's place. Code Striff does not read wins
  // over documents waiting, as it does on the server: a reading of them would check nothing.
  const readClosed = readRefused || (codeNotRead ? CODE_NOT_READ : null);
  /** Whether the read button is on offer above, for the sentences that point at it. */
  const readOffered = !readOnly && readWaiting > 0 && !readClosed;

  /** The repository's counts, beside the heading. */
  const tally = summary && (
    <div className="docs-tally">
      {/* The whole repository, whatever is selected: see repoCounts. */}
      <button
        type="button"
        className="docs-tally-item"
        title="Every document in this repository, whatever state it is in."
        onClick={() => setFilter("all")}
      >
        <b>{allDocs.length}</b>
        <i>doc{allDocs.length === 1 ? "" : "s"}</i>
      </button>
      {/* Not lit when nothing is filtered: a light on every count says nothing. */}
      {showRuleCounts && (
      <>
      <button
        type="button"
        className="docs-tally-item"
        title="Every rule read from this repository's documents."
        onClick={() => setFilter("all")}
      >
        <b>{repoCounts.all}</b>
        <i>rule{repoCounts.all === 1 ? "" : "s"}</i>
      </button>
      {/* Totals first, then how the rules stand: what holds, what is broken, what nothing
          has checked. */}
      <button
        type="button"
        className={`docs-tally-item is-held${filter === "holds" ? " is-on" : ""}`}
        title={`${STANDING_HELP.holds} Click to show these.`}
        onClick={() => toggleFilter("holds")}
      >
        <b>{repoCounts.holds}</b>
        <i>hold{repoCounts.holds === 1 ? "s" : ""}</i>
      </button>
      <button
        type="button"
        className={`docs-tally-item is-violated${filter === "broken" ? " is-on" : ""}`}
        title={`${STANDING_HELP.broken} Click to show these.`}
        onClick={() => toggleFilter("broken")}
      >
        <b>{repoCounts.broken}</b>
        <i>broken</i>
      </button>
      <button
        type="button"
        className={`docs-tally-item${filter === "unchecked" ? " is-on" : ""}`}
        title={`${STANDING_HELP.unchecked} Click to show these.`}
        onClick={() => toggleFilter("unchecked")}
      >
        <b>{repoCounts.unchecked}</b>
        <i>not checked yet</i>
      </button>
      {(repoCounts.excluded > 0 || filter === "excludedRules") && (
        <button
          type="button"
          className={`docs-tally-item is-excluded${filter === "excludedRules" ? " is-on" : ""}`}
          title="Rules pull requests aren't checked against: excluded on their own, or with their doc or folder. Click to show these."
          onClick={() => toggleFilter("excludedRules")}
        >
          <b>{repoCounts.excluded}</b>
          <i>excluded</i>
        </button>
      )}
      </>
      )}
      {/* Shown only once a reading of the whole repository has looked. Until then there is
          no number to give: a zero would say every doc is current, and nothing has checked.
          Counted apart from the rules, because a doc naming something that is gone is a
          stale doc and not a broken rule. Of the whole repository, like every other count here. */}
      {staleNames && staleNames.lastSeenMs != null && !(publicNoRules && repoStale === 0) && (
        <button
          type="button"
          className={`docs-tally-item is-stale${repoStale === 0 ? " is-none" : ""}${filter === "stale" ? " is-on" : ""}`}
          title={`Stale names in your docs: gone, moved or renamed in the code. Found by reading the whole repository, last on ${when(staleNames.lastSeenMs)}.${staleNames.truncated ? " There are more than are listed here." : ""} Shows the docs that write them.`}
          onClick={() => toggleFilter("stale")}
        >
          <b>{repoStale}{staleNames.truncated ? "+" : ""}</b>
          <i>stale names</i>
        </button>
      )}
      {catalog && !readOnly && (
        <ReadRepository
          repo={repo}
          reading={catalog.reading}
          /* Documents waiting to be read, which is the only work a reading does: see
             waitingToRead. The old sum subtracted the states it knew about and so counted
             documents a reading could not finish as waiting for ever, leaving the control
             offered on a repository where it had nothing left to achieve. */
          waiting={readWaiting}
          closed={readClosed}
          busy={asking || busy}
          onRead={readRepository}
        />
      )}
    </div>
  );

  return (
    <div className="docs-tab">
      {ruleStateBlocked && <span id={blockedId} className="sr-only">{ruleStateBlocked}</span>}
      {!rulesIndex && <span id={loadingId} className="sr-only">The rules are still loading.</span>}
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
                placeholder="Search docs and the rules read from them"
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
                  <p className="dashboard-kicker">Docs</p>
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
                        {marked(plainText(rule.statement))}
                      </span>
                      {/* A rule can match on the sentence it was read from, which the line above
                          does not show: without this the result looks like one that should not be
                          in the list. It is the sentence as a reader sees it, without its Markdown:
                          a window cut from the raw text can open a mark it never closes, and a
                          result is a button, which a link inside it cannot be. */}
                      {rule.quote
                        && !plainText(rule.statement).toLowerCase().includes(term)
                        && plainText(rule.quote).toLowerCase().includes(term) && (
                          <span className="docs-palette-quote">
                            “{marked(snippet(plainText(rule.quote), term))}”
                          </span>
                        )}
                      <span className="docs-palette-sub">
                        {marked(rule.path)}
                        {rule.sourceLine ? `:${rule.sourceLine}` : ""}
                        {` · ${rule.excluded ? "excluded" : STANDING_LABEL[standing(rule)].toLowerCase()}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {!inShell && (
        <>
        {/* The title row spans the page: the description, counts and install button share the
            row below it, so a long repository name keeps its chips and badge on one line. */}
        <div className="docs-head-top">
          <p className="dashboard-kicker">Docs &amp; rules</p>
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
            {source?.badgeUrl && (
              <span className="docs-refreshed-group">
                <LiveBadge src={source.badgeUrl} />
              </span>
            )}
            {/* A public page is a snapshot: loading it again finds the same thing. */}
            {!source && (
              <button
                type="button"
                className={`docs-refresh${loading || rulesLoading ? " is-loading" : ""}`}
                onClick={() => reload()}
                disabled={loading || rulesLoading}
                title="Load this repository's documents and rules again"
              >
                <RefreshMark />
                Refresh
              </button>
            )}
          </div>
        </div>
        </>
      )}
      <div className="docs-head">
        <div className="docs-head-copy">
          {/* The second sentence used to be there whatever the repository looked like, so a
              repository with every document read was still told some were waiting. It is now the
              count, or nothing. */}
          <p className="docs-lede">
            {source?.lede
              ?? "Pick a doc for its rules, a folder for everything beneath it, or the repository for all of them."}
          </p>
          {!!source && repoStale > 0 && (
            <p className="docs-names-line">
              {repoStale}{staleNames?.truncated ? "+" : ""} stale
              name{repoStale === 1 && !staleNames?.truncated ? "" : "s"} in these docs.
            </p>
          )}
          {catalog && <RevisionLine catalog={catalog} />}
          {inShell && actionsSlot && createPortal(
            <>
              <button
                type="button"
                className={`docs-refresh${loading || rulesLoading ? " is-loading" : ""}`}
                onClick={() => reload()}
                disabled={loading || rulesLoading}
                title="Load this repository's documents and rules again"
              >
                <RefreshMark />
                Refresh
              </button>
              {badge}
            </>,
            actionsSlot
          )}
        </div>
        {source?.action ? (
          <div className="docs-head-side">
            {source.action}
            {tally}
          </div>
        ) : tally}
      </div>

      {loading && <p className="dashboard-metric-caption">Loading documents...</p>}
      {error && <p className="dashboard-inline-error">{error}</p>}

      {catalog && catalog.documents.length === 0 && !loading && (
        <div className="dashboard-empty">
          {catalog.lastAttempt?.outcome === "failed" ? (
            <>
              <p className="text-slate-600">
                Striff couldn't read this repository's doc list. Nothing about it is known yet,
                and this is not a repository with no docs.
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
              what="this repository's docs"
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
          className={`docs-split${resizing ? " is-resizing" : ""}${namesFirst ? " is-names-first" : ""}`}
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
            {/* Two groups, each counted in its own unit: the documents by the state each is in, and
                the rules by how they stand or that they are excluded. One chip is on at a time,
                and a rule chip narrows the table beside the tree as well as the tree. */}
            <div className="docs-filters">
              {([
                ["Documents", DOC_CHIPS, false],
                ["Rules", RULE_CHIPS, !rulesIndex],
              ] as [string, Chip<Filter>[], boolean][]).map(([group, chips, waiting]) => (
                <div key={group} className="docs-filter-group" role="group" aria-label={group}>
                  <span className="docs-filter-label">{group}</span>
                  {chips
                    // A public page changes nothing, so it has no excluded rules to come back to.
                    .filter((chip) => filter === chip.key || (!chip.hidden
                      && ((chip.always && !(source && chip.key === "excludedRules")) || filterCounts[chip.key] > 0)))
                    .map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        className={`docs-filter${filter === chip.key ? " is-on" : ""}`}
                        aria-pressed={filter === chip.key}
                        title={`${chip.help}${filter === chip.key ? " Click again to show every document." : ""}`}
                        aria-disabled={waiting || undefined}
                        aria-describedby={waiting ? loadingId : undefined}
                        // A second click on the chip in use puts the tree back as it was.
                        onClick={() => { if (!waiting) toggleFilter(chip.key); }}
                      >
                        {chip.dot && <span className={`docs-fdot is-${chip.dot}`} />}
                        {chip.label} <b>{waiting ? "…" : filterCounts[chip.key]}</b>
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <div className="docs-tree" role="tree">
              {renderNode(tree, 0)}
            </div>
            <div className="docs-tree-foot">
              {catalog.summary.documents} doc{catalog.summary.documents === 1 ? "" : "s"}
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
                        title={`Include ${folderName(rule)} again${rule.excludedBy ? ` (excluded by ${rule.excludedBy}${rule.reason ? `: ${rule.reason}` : ""})` : ""}`}
                        {...blockedProps}
                        onClick={unlessBlocked(() => exclude(rule.path, true, false))}
                      >
                        {rule.path === "" ? "whole repository" : `${rule.path}/`}<i aria-hidden="true">×</i>
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
            aria-label="Width of the doc tree"
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
                    {scopeExclude(scopeKind === "root" ? "" : selected,
                      scopeKind === "root" ? "repository" : "folder")}
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
                    {scopeDocs.length} doc{scopeDocs.length === 1 ? "" : "s"}
                  </button>
                  {scopeSummary.map((part) => (
                    <span key={part.key}>
                      <i className="docs-scope-sep" aria-hidden="true">·</i>
                      <button
                        type="button"
                        className={`docs-scope-part${filter === part.key ? " is-on" : ""}`}
                        title={`${part.help} Click to show these in the tree.`}
                        onClick={() => toggleFilter(part.key)}
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
                {(namesFirst || namesOnly) && (
                  <div className="docs-gone">
                    <h4>
                      Stale names in these docs
                      <b>{scopeStaleFindings.length}</b>
                    </h4>
                    <p className="docs-stale-note">
                      Each sentence below has a stale name: a type the default branch doesn't
                      declare, or declares somewhere else. Edit the doc so it matches the code, or
                      bring the type back.
                    </p>
                    <ul className="docs-gone-list">
                      {scopeStaleFindings.map((finding) => (
                        <li key={`${finding.docPath}:${finding.name}`} className="docs-gone-item">
                          <div className="docs-gone-head">
                            <span className={`docs-outcome is-${staleTone(finding)}`}>
                              {staleLabel(finding)}
                            </span>
                            <code className="docs-gone-name">{finding.name}</code>
                          </div>
                          {finding.sentence && (
                            <blockquote className="docs-gone-quote">{withCode(finding.sentence)}</blockquote>
                          )}
                          <p className="docs-gone-has">
                            {withCode(staleLine(finding))}
                            {/* The commit that renamed the file, where history named one. */}
                            {finding.state === "RENAMED" && finding.removedBySha ? (
                              <>
                                {" "}
                                <a
                                  href={finding.removedByUrl
                                    || `https://github.com/${owner}/${name}/commit/${finding.removedBySha}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={finding.removedByMessage || undefined}
                                >
                                  Renamed in <code>{finding.removedBySha.slice(0, 7)}</code>
                                </a>
                              </>
                            ) : null}
                          </p>
                          <p className="docs-gone-where">
                            <button type="button" className="rules-source-link" onClick={() => openDoc(finding.docPath)}>
                              {finding.docPath}
                              {finding.sourceLine ? <i>:{finding.sourceLine}</i> : null}
                            </button>
                            <a
                              href={`https://github.com/${owner}/${name}/blob/${branch || "HEAD"}/${finding.docPath}${finding.sourceLine ? `?plain=1#L${finding.sourceLine}` : ""}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <GitHubMark />
                              View on GitHub
                            </a>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rulesIndex && scopeRows.length === 0 && !namesFirst && !namesOnly && (
                  <p className="dashboard-metric-caption">
                    {/* A truncated answer is the one case where an empty scope is not an answer
                        about the scope: the rules exist and this list did not reach them. */}
                    {rulesIndex.truncated
                      ? "This repository has more rules than one list can carry, and the documents before this one fill it. Striff has these; this page cannot reach them yet."
                      : codeNotRead
                      // Not "found no rule": nothing looked, because there is no code it reads.
                      ? CODE_NOT_READ
                      : !scopeDocs.some((doc) => doc.state === "NOT_READ")
                      ? "Striff read these docs and found no architectural rule in them."
                      : isRunning(reading)
                      ? "Striff is reading these docs now. Their rules appear here as they are read; refresh to see them."
                      // Points at the button only where the button is there, with its number.
                      : readOffered
                      ? `Nothing here has been read yet. Use Read ${readWaiting} doc${readWaiting === 1 ? "" : "s"} now, above, to read ${readWaiting === 1 ? "it" : "them"} without waiting for a pull request.`
                      : "Nothing here has been read yet. Striff reads a doc the first time a pull request changes code that doc talks about."}
                  </p>
                )}
                {rulesIndex && scopeRows.length > 0 && !namesOnly && (
                  <RulesTable
                    rows={shownRows}
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
                    issues={!source && takesIssues}
                    readOnly={!!source}
                    demo={!!sample}
                    ruleStates={source ? undefined : {
                      disabledReason: ruleStateBlocked,
                      set: (row, excluded) => setRuleStates({ excluded, factIds: [row.factId] }),
                    }}
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
                    View on GitHub
                  </a>
                  <span className="docs-pane-actions">
                    {scopeExclude(selected, "doc")}
                    {rowMenu(selected, selectedDoc ?? detail.document, false, "pane")}
                  </span>
                </div>
                {/* The state as the catalogue has it, which excluding the doc changes at once. */}
                <p className={`docs-state-line is-${(selectedDoc ?? detail.document).state.toLowerCase()}`}>
                  <span
                    className={`docs-sdot is-${
                      (selectedDoc ?? detail.document).state.toLowerCase()
                    }`}
                  />
                  <span>
                    {withCode(stateLine(selectedDoc ?? detail.document,
                      coveringFolder(detail.document.path, catalog?.exclusions)))}
                  </span>
                </p>

                {/* How many rules came out of this doc, said in words.
                    A doc Striff read and found nothing in used to show the extraction date and
                    then simply stop, which reads like a page that failed to load. Zero is an
                    answer, and a doc is entitled to have it stated. The same line carries the
                    count when there are rules, so the number under the table is never in doubt,
                    and it says separately when rules exist but nothing has judged them. */}
                {hasDocumentTab && (
                  <div className="dv-tabs" role="tablist" aria-label="This doc">
                    <button type="button" role="tab" id="doc-tab-rules" aria-selected={paneTab === "rules"}
                      className={paneTab === "rules" ? "is-on" : ""} onClick={() => setPaneTab("rules")}>
                      <PaneTabIcon paths={["m2.5 4 1.25 1.25L6 3", "m2.5 10 1.25 1.25L6 9", "M8.5 4.25h5", "M8.5 10.25h5"]} />
                      Rules <span>{scopeRows.length}</span>
                    </button>
                    <button type="button" role="tab" id="doc-tab-document" aria-selected={paneTab === "document"}
                      className={paneTab === "document" ? "is-on" : ""} onClick={() => setPaneTab("document")}>
                      <PaneTabIcon paths={["M3.5 1.75h6l3 3v9.5h-9Z", "M9.5 1.75v3h3", "M5.75 8h4.5", "M5.75 10.5h4.5"]} />
                      Document
                    </button>
                  </div>
                )}

                {hasDocumentTab && paneTab === "document" && (
                  <div role="tabpanel" aria-labelledby="doc-tab-document">
                    {(!textEntry || textEntry.status === "loading") && (
                      <p className="dashboard-metric-caption">Loading the doc…</p>
                    )}
                    {textEntry?.status === "failed" && (() => {
                      const failure = failureMessage(textEntry.reason);
                      return (
                        <div className="dv-fail" role="alert">
                          <p>{failure.message}</p>
                          {failure.retry && (
                            <button type="button" onClick={() => loadDocText(selected, shownVersion, textId)}>Retry</button>
                          )}
                        </div>
                      );
                    })()}
                    {textEntry?.status === "ready" && (
                      <Suspense fallback={<p className="dashboard-metric-caption">Loading the doc…</p>}>
                        <DocumentView
                          data={textEntry.data}
                          rules={shownRows}
                          stale={staleByDoc.get(selected) || []}
                          owner={owner}
                          name={name}
                          docPath={selected}
                          branch={branch}
                          lastReadMs={detail.document.lastExtractedMs}
                          onInclude={readOnly ? undefined : async (row) => ruleStateBlocked ?? setRuleStates({ excluded: false, factIds: [row.factId] })}
                          renderStale={(finding: StaleName) => (
                            <>
                              <p className="dv-card-body">{withCode(staleLine(finding))}</p>
                              <div className="dv-card-actions">
                                {(!source || withStaleNameIssue(finding, selected, findingIssues).issue) && (
                                  <FindingActions
                                    issueUrl={takesIssues && !source
                                      ? staleNameIssueUrl(owner, name, selected, finding, branch || "main")
                                      : null}
                                    prompt={source ? undefined : staleNamePrompt(owner, name, selected, finding, branch || "main")}
                                    demo={!!sample}
                                    issue={withStaleNameIssue(finding, selected, findingIssues).issue}
                                    readOnly={!!source}
                                  />
                                )}
                                {finding.sourceLine && textEntry.data.commit && (
                                  <a href={blobUrl(owner, name, textEntry.data.commit, selected, finding.sourceLine)}
                                     target="_blank" rel="noopener noreferrer">
                                    Line {finding.sourceLine} on GitHub
                                  </a>
                                )}
                              </div>
                            </>
                          )}
                        />
                      </Suspense>
                    )}
                  </div>
                )}

                {(paneTab === "rules" || !hasDocumentTab) && (<>
                {(detail.document.state === "READ" || detail.rules.length > 0) && (
                  <p className="docs-rule-count">
                    {detail.rules.length === 0 ? (
                      <>
                        <b>0 rules</b> read from this doc. Striff read it and found no
                        architectural rule in it.
                      </>
                    ) : (
                      <>
                        <b>{detail.rules.length} rule{detail.rules.length === 1 ? "" : "s"}</b>{" "}
                        read from this doc
                        {scopeRows.length < detail.rules.length && (
                          <>
                            {", "}
                            {detail.rules.length - scopeRows.length} of which haven't been checked
                            yet, so {detail.rules.length - scopeRows.length === 1 ? "it is" : "they are"}{" "}
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
                    rows={shownRows}
                    owner={owner}
                    name={name}
                    branch={branch}
                    scopeLabel={scopeLabel}
                    fileStem={scopeFileStem}
                    showPath={false}
                    filter={ruleFilter}
                    docCount={1}
                    issues={!source && takesIssues}
                    readOnly={!!source}
                    demo={!!sample}
                    ruleStates={source ? undefined : {
                      disabledReason: ruleStateBlocked,
                      set: (row, excluded) => setRuleStates({ excluded, factIds: [row.factId] }),
                    }}
                  />
                )}

                {staleByDoc.has(selected) && (
                  <div className="docs-stale">
                    <h4>
                      Stale names in this doc
                      <b>{staleByDoc.get(selected)!.length}</b>
                    </h4>
                    <p className="docs-stale-note">
                      These aren't broken rules. A stale name is one the doc writes and the
                      default branch doesn't have, or has somewhere else. Edit the doc so it stops
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
                              {/* The commit that removed the file, where history named one: the
                                  question a reader has next is when, and by whom. */}
                              {finding.state !== "MOVED" && finding.removedBySha ? (
                                <a
                                  className={`docs-outcome is-${staleTone(finding)} is-link`}
                                  href={finding.removedByUrl
                                    || `https://github.com/${owner}/${name}/commit/${finding.removedBySha}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`${finding.state === "RENAMED" ? "Renamed" : "Gone"} since ${finding.removedBySha.slice(0, 7)}${finding.removedByMessage ? `: ${finding.removedByMessage}` : ""}${finding.removedAtMs ? `, ${when(finding.removedAtMs)}` : ""}`}
                                >
                                  {staleLabel(finding)} in <code>{finding.removedBySha.slice(0, 7)}</code>
                                </a>
                              ) : (
                                <span className={`docs-outcome is-${staleTone(finding)}`}>
                                  {staleLabel(finding)}
                                </span>
                              )}
                            </td>
                            <td className="docs-rule-quote">
                              <Clamped lines={4}>{withCode(finding.sentence || "")}</Clamped>
                            </td>
                            <td className="rules-standing">
                              <FlagFinding
                                demo={!!sample}
                                flagged={{
                                  kind: "stale-name",
                                  repo: `${owner}/${name}`,
                                  doc: selected,
                                  line: finding.sourceLine,
                                  finding: finding.name,
                                  standing: finding.state.toLowerCase(),
                                }}
                              />
                              <span className="docs-stale-has">{withCode(staleLine(finding))}</span>
                              <span className="docs-outcome-when">
                                first seen {when(finding.firstSeenMs)}
                              </span>
                              {(!source || withStaleNameIssue(finding, selected, findingIssues).issue) && (
                                <FindingActions
                                  issueUrl={takesIssues && !source
                                    ? staleNameIssueUrl(owner, name, selected, finding, branch || "main")
                                    : null}
                                  prompt={source ? undefined : staleNamePrompt(owner, name, selected, finding, branch || "main")}
                                  demo={!!sample}
                                  issue={withStaleNameIssue(finding, selected, findingIssues).issue}
                                  readOnly={!!source}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                </>)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
