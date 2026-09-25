import { createElement, useEffect, useMemo, useRef, useState } from "react";

/**
 * The documents Striff can read in one repository, and the rules it found in them.
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
  /** Whether this repository asked for it to be read whatever a screen says. */
  forced: boolean;
  forcedBy: string | null;
  forcedReason: string | null;
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
  lastScanMs: number | null;
  summary: Summary;
  documents: Doc[];
  exclusions: Exclusion[];
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

interface Rule {
  factId: string;
  statement: string;
  quote: string | null;
  firstSeenMs: number;
  sourceLine: number | null;
  status: string | null;
  pullNo: string | null;
  judgedAtMs: number | null;
  onDefaultBranch: string | null;
}

interface DocEvent {
  kind: string;
  atMs: number;
  pullNo: string | null;
  ruleCount: number;
  reason: string | null;
}

interface Detail {
  document: Doc;
  rules: Rule[];
  history: DocEvent[];
}

const STATE_LABEL: Record<DocState, string> = {
  READ: "Read",
  NOT_READ: "Not read yet",
  SCREENED_OUT: "Skipped",
  RETIRED: "Retired",
  UNREADABLE: "Couldn't read",
  EXCLUDED: "Excluded",
};

const OUTCOME_LABEL: Record<string, string> = {
  MAINTAINED: "Held",
  VIOLATED: "Broken",
  PRE_EXISTING: "Already broken",
  RESTORED: "Restored",
  UNCLEAR: "Couldn't check",
};

const ON_BRANCH_LABEL: Record<string, string> = {
  HOLDS: "Holds on the default branch",
  BROKEN: "Broken on the default branch",
  UNCLEAR: "Couldn't check on the default branch",
};

/**
 * A sentence or a rule as the API sends it, with backticked names as code.
 *
 * The API writes a name the way the document did, in backticks; rendering them literally leaves
 * the marks on screen. Split rather than set HTML: the text is a customer's own document, and it
 * is never trusted as markup.
 */
function withCode(text: string | null | undefined) {
  if (!text) return null;
  return text.split(/`([^`]+)`/g).map((part, index) =>
    index % 2 === 1
      ? createElement("code", { key: index, className: "github-inline-code" }, part)
      : part
  );
}

function when(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The line a document's state deserves, in the words the pipeline used.
 *
 * @param doc the document
 * @param covering the folder rule that excludes it, where a folder rather than the document itself
 *     is what was excluded; naming it is the difference between a reader finding the rule and
 *     hunting for one that is not on this document at all
 */
function stateLine(doc: Doc, covering?: Exclusion | null): string {
  switch (doc.state) {
    case "READ":
      if (doc.outdated) {
        return `Edited on the default branch since Striff last read it. These rules come from the ${when(doc.lastExtractedMs)} version${doc.lastExtractedPullNo ? ` (PR #${doc.lastExtractedPullNo})` : ""}, and refresh on the next pull request that changes code this doc talks about.`;
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


/** One node of the document tree: a folder holding more, or a document. */
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
    const aFolder = a.children.length > 0;
    const bFolder = b.children.length > 0;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The documents as a tree of folders, with each folder carrying what is beneath it. */
function buildTree(documents: Doc[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], rules: 0, broken: 0 };
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
  return sortNodes(root.children.map(total));
}

/** Every folder that holds a document, so the tree opens showing what is in it. */
function allFolders(nodes: TreeNode[], into: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.add(node.path);
      allFolders(node.children, into);
    }
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

const DotsIcon = () =>
  createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 15, height: 15, fill: "currentColor", "aria-hidden": true },
    createElement("circle", { cx: 3.2, cy: 8, r: 1.3 }),
    createElement("circle", { cx: 8, cy: 8, r: 1.3 }),
    createElement("circle", { cx: 12.8, cy: 8, r: 1.3 })
  );

export default function DocsTab({
  installationId,
  repos,
  openRepo,
  focusDoc,
  actor,
  onRepoChange,
}: {
  installationId: number;
  repos: { full_name: string }[];
  /** The repository a reader opened from the repositories list, if they came that way. */
  openRepo?: string | null;
  /** The document to open on, where a reader followed a rule to where it was read from. */
  focusDoc?: string | null;
  /** The signed-in login, recorded against an exclusion or an override as who asked for it. */
  actor?: string | null;
  /** Reports a repository picked here, so the shell and the other tab follow it. */
  onRepoChange?: (fullName: string) => void;
}) {
  const [repo, setRepo] = useState<string>(openRepo || repos[0]?.full_name || "");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "broken" | "notRead" | "skipped" | "excluded">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ruleIndex, setRuleIndex] = useState<(Rule & { path: string })[]>([]);
  const [indexing, setIndexing] = useState(false);
  // What a failed write or a failed document read said, shown where it happened.
  const [actionError, setActionError] = useState("");
  /** Which document was asked for last; an older answer never paints over a newer one. */
  const openedAt = useRef(0);

  const [owner, name] = repo.split("/");

  useEffect(() => {
    if (openRepo && openRepo !== repo) setRepo(openRepo);
  }, [openRepo]);

  useEffect(() => {
    if (!owner || !name) return;
    loadCatalog();
  }, [repo]);

  // Following another rule here while this view is already open: the catalogue is loaded, so only
  // the pane changes.
  useEffect(() => {
    if (focusDoc && catalog && focusDoc !== selected) openDoc(focusDoc);
  }, [focusDoc]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  async function loadCatalog() {
    setLoading(true);
    setError("");
    setDetail(null);
    setSelected(null);
    // The palette indexes one repository's rules; keeping them across a change searched the one
    // before and opened documents this one does not have.
    setRuleIndex([]);
    setActionError("");
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't load this repository's documents");
        setCatalog(null);
        return;
      }
      setCatalog(data);
      const docs: Doc[] = data.documents || [];
      setExpanded(allFolders(buildTree(docs)));
      // Landing on an empty pane wastes the arrival: open what a reader would have opened first,
      // which is the document they followed a rule to, then a document something is broken in,
      // and otherwise one that has been read.
      const first =
        (focusDoc && docs.find((doc) => doc.path === focusDoc)) ||
        docs.find((doc) => doc.brokenRules > 0) ||
        docs.find((doc) => doc.state === "READ" && doc.ruleCount > 0);
      if (first) openDoc(first.path);
    } catch {
      setError("Couldn't load this repository's documents");
    } finally {
      setLoading(false);
    }
  }

  async function openDoc(path: string) {
    setSelected(path);
    setDetail(null);
    setActionError("");
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

  /**
   * One write, one answer. A PATCH that failed used to reload the catalogue unchanged and say
   * nothing, so a rejected token or a 500 looked exactly like a change that did not stick.
   */
  async function write(body: unknown, view: "" | "force-read", failed: string) {
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

  async function setExcluded(path: string, excluded: boolean) {
    const ok = await write({ paths: [path], folders: [], excluded, actor },
      "", `Couldn't ${excluded ? "exclude" : "include"} ${path}.`);
    if (!ok) return;
    await loadCatalog();
    await openDoc(path);
  }

  /** Asks for a document a screen skipped to be read anyway, or leaves it to the screens again. */
  async function setForced(path: string, forced: boolean) {
    const ok = await write({ paths: [path], forced, actor }, "force-read",
      `Couldn't ${forced ? "ask for" : "stop"} reading ${path}.`);
    if (!ok) return;
    await loadCatalog();
    await openDoc(path);
  }

  async function setFolderExcluded(folder: string, excluded: boolean) {
    const ok = await write({ paths: [], folders: [folder], excluded, actor },
      "", `Couldn't ${excluded ? "exclude" : "include"} ${folder}/.`);
    if (!ok) return;
    await loadCatalog();
  }

  const documents = useMemo(() => {
    const all = catalog?.documents || [];
    switch (filter) {
      case "broken":
        return all.filter((doc) => doc.brokenRules > 0);
      case "notRead":
        return all.filter((doc) => doc.state === "NOT_READ");
      case "skipped":
        return all.filter((doc) => doc.state === "SCREENED_OUT");
      case "excluded":
        return all.filter((doc) => doc.state === "EXCLUDED");
      default:
        return all;
    }
  }, [catalog, filter]);

  /** What each filter would show, counted in documents, since documents are what it filters. */
  const filterCounts = useMemo(() => {
    const all = catalog?.documents || [];
    return {
      all: all.length,
      broken: all.filter((doc) => doc.brokenRules > 0).length,
      notRead: all.filter((doc) => doc.state === "NOT_READ").length,
      skipped: all.filter((doc) => doc.state === "SCREENED_OUT").length,
      excluded: all.filter((doc) => doc.state === "EXCLUDED").length,
    };
  }, [catalog]);

  const tree = useMemo(() => buildTree(documents), [documents]);

  /**
   * Opens the palette, and indexes the rules the first time.
   *
   * One reading of the whole repository, not one per document: this used to ask for the first
   * twenty-five read documents in turn, which was twenty-five round trips and searched none of the
   * rest. What the repository-wide read leaves out, it says, and the rules page shows the same list
   * in full.
   */
  async function openPalette() {
    setPaletteOpen(true);
    setQuery("");
    if (ruleIndex.length > 0 || indexing || !catalog) return;
    if (!catalog.documents.some((doc) => doc.ruleCount > 0)) return;
    setIndexing(true);
    try {
      const res = await fetch(
        `/.netlify/functions/doc-catalog-proxy?view=rules&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      if (!res.ok) return;
      const body: { documents: { document: Doc; rules: Rule[] }[] } = await res.json();
      setRuleIndex(
        (body.documents || []).flatMap((group) =>
          group.rules.map((rule) => ({ ...rule, path: group.document.path }))
        )
      );
    } finally {
      setIndexing(false);
    }
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
  }, [catalog, ruleIndex.length, indexing]);

  const term = query.trim().toLowerCase();
  const docHits = (catalog?.documents || [])
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

  /** The matched run of a result, marked, so a reader sees why it matched. */
  function marked(text: string) {
    const at = text.toLowerCase().indexOf(term);
    if (term === "" || at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark>{text.slice(at, at + term.length)}</mark>
        {text.slice(at + term.length)}
      </>
    );
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

  /** The ⋯ menu a document or folder carries, in the tree and in the open document's header. */
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
              href={`https://github.com/${owner}/${name}/${folder ? "tree" : "blob"}/HEAD/${path}`}
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

  /** The badges a document's state earns, in the tree. */
  function rowBadges(doc: Doc) {
    return (
      <>
        {doc.brokenRules > 0 && <span className="docs-badge is-broken">{doc.brokenRules} broken</span>}
        {doc.outdated && doc.state === "READ" && (
          <span className="docs-badge is-outdated">Edited since</span>
        )}
        {doc.state !== "READ" && (
          <span className={`docs-badge is-${doc.state.toLowerCase()}`}>{STATE_LABEL[doc.state]}</span>
        )}
        {doc.forced && doc.state !== "READ" && (
          <span className="docs-badge is-forced">Read anyway</span>
        )}
      </>
    );
  }

  /** The tree itself: folders that open and close, documents that open in the pane. */
  function renderNodes(nodes: TreeNode[], depth: number): any[] {
    return nodes.flatMap((node) => {
      const indent = { paddingLeft: 8 + depth * 14 };
      if (node.children.length > 0) {
        const open = expanded.has(node.path);
        const excludedFolder = coveringFolder(node.path, catalog?.exclusions);
        const rows: any[] = [
          <div
            key={node.path}
            className={`docs-row is-folder${excludedFolder ? " is-dim" : ""}`}
            style={indent}
          >
            <button
              type="button"
              className="docs-row-main"
              aria-expanded={open}
              onClick={() => toggleFolder(node.path)}
            >
              <span className="docs-chev">{open ? <ChevronDown /> : <ChevronRight />}</span>
              <FolderIcon />
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
              {node.rules > 0 && <span className="docs-count">{node.rules}</span>}
              {rowMenu(node.path, undefined, true)}
            </span>
          </div>,
        ];
        if (open) rows.push(...renderNodes(node.children, depth + 1));
        return rows;
      }
      const doc = node.doc as Doc;
      return [
        <div
          key={node.path}
          className={`docs-row${selected === doc.path ? " is-open" : ""}${
            ["RETIRED", "SCREENED_OUT", "EXCLUDED"].includes(doc.state) ? " is-dim" : ""
          }`}
          style={indent}
        >
          <button type="button" className="docs-row-main" onClick={() => openDoc(doc.path)}>
            <span className="docs-chev" />
            <FileIcon />
            <span className="docs-row-name">{node.name}</span>
          </button>
          <span className="docs-row-meta">
            {rowBadges(doc)}
            {doc.ruleCount > 0 && <span className="docs-count">{doc.ruleCount}</span>}
            {rowMenu(doc.path, doc)}
          </span>
        </div>,
      ];
    });
  }

  if (repos.length === 0) {
    return <p className="dashboard-metric-caption">No repositories are connected yet.</p>;
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
                  {indexing && " Reading the rules…"}
                </p>
              )}
              {term !== "" && docHits.length === 0 && ruleHits.length === 0 && (
                <p className="docs-palette-hint">
                  Nothing matches “{query}”.{indexing && " Still reading the rules…"}
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
                      <span className="docs-palette-sub">
                        {rule.path}
                        {rule.sourceLine ? `:${rule.sourceLine}` : ""}
                        {rule.status ? ` · ${OUTCOME_LABEL[rule.status] || rule.status}` : " · not checked yet"}
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
          <p className="dashboard-kicker">Documents</p>
          <div className="docs-title">
            <select
              className="docs-title-select"
              aria-label="Repository"
              value={repo}
              onChange={(event) => {
                setRepo(event.target.value);
                onRepoChange?.(event.target.value);
              }}
            >
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
          <p className="docs-lede">
            Every doc Striff can read in this repository, and the rules it found in them. Striff
            reads a doc when a pull request changes code the doc talks about, so some docs are still
            waiting for that.
          </p>
        </div>
        {summary && (
          <div className="docs-tally">
            <span
              className="docs-tally-item"
              title="Documents Striff can extract rules from: everything it holds, less the ones that say they are no longer current, the ones a screen kept out, and the ones you excluded."
            >
              <b>
                {summary.documents - summary.retired - summary.screenedOut - summary.excluded}
              </b>
              <i>docs to read</i>
            </span>
            <span className="docs-tally-item is-violated">
              <b>{summary.brokenRules}</b>
              <i>broken</i>
            </span>
            <span className="docs-tally-item is-prior">
              <b>{summary.alreadyBrokenRules}</b>
              <i>already broken</i>
            </span>
            <span className="docs-tally-item is-held">
              <b>{summary.holdsOnDefaultBranch}</b>
              <i>hold on main</i>
            </span>
            <span className="docs-tally-item">
              <b>{summary.rules}</b>
              <i>rules</i>
            </span>
          </div>
        )}
      </div>

      {loading && <p className="dashboard-metric-caption">Loading documents...</p>}
      {error && <p className="dashboard-inline-error">{error}</p>}

      {catalog && catalog.documents.length === 0 && !loading && (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            Striff hasn't listed this repository's documents yet. It lists them when the app is
            installed, and reads one when a pull request changes code that document talks about.
          </p>
        </div>
      )}

      {catalog && catalog.documents.length > 0 && (
        <div className="docs-split">
          <div className="docs-list">
            <button type="button" className="tree-search" onClick={openPalette}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.25" />
                <path d="m10.25 10.25 3.5 3.5" />
              </svg>
              <span>Search docs and rules</span>
              <kbd>⌘K</kbd>
            </button>
            {actionError && detail && <p className="docs-write-error">{actionError}</p>}
            <div className="docs-filters">
              {([
                ["all", "All", filterCounts.all, ""],
                ["broken", "Broken", filterCounts.broken, "broken"],
                ["notRead", "Not read", filterCounts.notRead, "unread"],
                ["skipped", "Skipped", filterCounts.skipped, "other"],
                ["excluded", "Excluded", filterCounts.excluded, "other"],
              ] as const).map(([key, label, count, dot]) => (
                <button
                  key={key}
                  type="button"
                  className={`docs-filter${filter === key ? " is-on" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {dot && <span className={`docs-fdot is-${dot}`} />}
                  {label} <b>{count}</b>
                </button>
              ))}
            </div>
            <div className="docs-tree" role="tree">
              {renderNodes(tree, 0)}
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
          <div className="docs-pane">
            {!selected && (
              <p className="dashboard-metric-caption">
                Choose a document to see the rules Striff read from it.
              </p>
            )}
            {selected && !detail && actionError && (
              <div className="docs-pane-error">
                <p>{actionError}</p>
                <button type="button" onClick={() => openDoc(selected)} disabled={busy}>
                  Try again
                </button>
              </div>
            )}
            {selected && !detail && !actionError && (
              <p className="dashboard-metric-caption">Loading…</p>
            )}
            {selected && detail && (
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

                {detail.rules.length > 0 && (
                  <table className="docs-rules">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>The sentence in your docs</th>
                        <th>The rule it became</th>
                        <th>Latest outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rules.map((rule) => (
                        <tr
                          key={rule.factId}
                          className={
                            rule.status === "VIOLATED"
                              ? "is-violated"
                              : rule.status === "PRE_EXISTING"
                              ? "is-prior"
                              : ""
                          }
                        >
                          <td className="docs-rule-line">{rule.sourceLine ? `:${rule.sourceLine}` : ""}</td>
                          <td className="docs-rule-quote">{withCode(rule.quote)}</td>
                          <td className="docs-rule-statement">{withCode(rule.statement)}</td>
                          <td>
                            <span className={`docs-outcome is-${(rule.status || "none").toLowerCase()}`}>
                              {rule.status ? OUTCOME_LABEL[rule.status] || rule.status : "Not checked yet"}
                            </span>
                            {rule.pullNo && (
                              <span className="docs-outcome-when">
                                PR #{rule.pullNo} · {when(rule.judgedAtMs)}
                              </span>
                            )}
                            {rule.onDefaultBranch && (
                              <span className="docs-outcome-branch">
                                {ON_BRANCH_LABEL[rule.onDefaultBranch] || rule.onDefaultBranch}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
