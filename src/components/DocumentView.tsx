import { Component, Fragment, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { Clamped, when, withCode } from "./docRules";
import { STANDING_HELP, STANDING_LABEL, standing, type Row } from "./RulesTable";
import { formatDay } from "../lib/renderClock.js";
import {
  alignText,
  byStrength,
  kindCounts,
  normalizeRanges,
  ruleKind,
  ruleRanges,
  segments,
  staleRanges,
  textSegments,
} from "../lib/docView.js";
import { blobUrl, nestHtml, resolveLink, sourceLines } from "../lib/docMarkup.js";

/**
 * One document's text with the words each rule checks marked in it.
 *
 * Built from what Striff already stores plus the text of the version the rules were read from: it
 * runs no analysis. The rules arrive from the Rules tab's own answer, so a switch changes a mark at
 * once; the text and the places come from the text endpoint and are joined to the rules by id.
 *
 * Markdown and MDX are drawn formatted, from a parse whose offsets are the same UTF-16 offsets the
 * API counts in. Everything else, and Markdown on request or when the formatted view throws, is a
 * source view. Nothing here sets HTML: raw HTML is shown as text unless it is one of a short list
 * of tags, images are not loaded, MDX components are placeholders, and links are resolved to GitHub
 * at the commit the doc was read at.
 */

/** The answer of the text endpoint when it could show the text. */
export interface DocText {
  path: string;
  contentHash: string;
  format: "markdown" | "mdx" | "asciidoc" | "rst";
  commit: string;
  mainChanged: boolean;
  text: string;
  readChars: number | null;
  placements: { factId: string; spans: { from: number; to: number }[]; block: { line: number; kind: "row" | "item" | "diagram" } | null }[];
  unplaced: string[];
}

/** A name the doc writes that the default branch lacks, with where the page finds it. */
export interface DocStale {
  docPath: string;
  name: string;
  sourceLine: number | null;
  state: string;
}

const KIND_LABEL: Record<string, string> = {
  holds: "Holds",
  broken: "Broken",
  unchecked: "Not checked yet",
  excluded: "Excluded",
  stale: "Stale name",
};

const FORMATTED = new Set(["markdown", "mdx"]);

/** Past this many characters a doc opens as source: formatting it would hold the page for a second or more. */
const LARGE_CHARS = 200_000;

/** Everything the node renderers share for one document. */
interface Shared {
  text: string;
  owner: string;
  name: string;
  docPath: string;
  commit: string | null;
  definitions: Map<string, string>;
  pick: (block: number, ids: string[]) => void;
}

/** What one top-level block draws with. */
interface Ctx extends Shared {
  block: number;
  ranges: any[];
  selected: Set<string> | null;
  inLink: boolean;
}

function parse(text: string, format: string): any {
  const processor = unified().use(remarkParse).use(remarkGfm);
  if (format === "mdx") processor.use(remarkMdx);
  return processor.parse(text);
}

/** Catches a throw while the formatted view draws and hands over to the source view. */
class Guard extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const NONE: any[] = [];

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function idsOf(hits: any[]): string[] {
  const out: string[] = [];
  for (const hit of hits) if (hit.id && !out.includes(hit.id)) out.push(hit.id);
  return out;
}

/** One marked piece of text, which opens the card of the rules at it when clicked. */
function Mark({ hits, ctx, children }: { hits: any[]; ctx: Ctx; children: ReactNode }) {
  const ids = idsOf(hits);
  const kind = hits[0]?.kind;
  if (!ids.length) {
    return <span className={kind === "tail" ? "dv-unread" : undefined}>{children}</span>;
  }
  const open = !!ctx.selected && ids.some((id) => ctx.selected!.has(id));
  const activate = (event: { target: EventTarget; stopPropagation: () => void }) => {
    if ((event.target as HTMLElement).closest?.("a")) return;
    event.stopPropagation();
    ctx.pick(ctx.block, ids);
  };
  return (
    <span
      className={`dv-mark is-${kind}${open ? " is-open" : ""}`}
      data-kind={kind}
      data-ids={ids.join(" ")}
      role={ctx.inLink ? undefined : "button"}
      tabIndex={ctx.inLink ? undefined : 0}
      aria-expanded={ctx.inLink ? undefined : open}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event);
        }
      }}
    >
      {children}
    </span>
  );
}

function pieces(parts: { text: string; hits: any[] }[], ctx: Ctx): ReactNode {
  return parts.map((part, i) =>
    part.hits.length ? <Mark key={i} hits={part.hits} ctx={ctx}>{part.text}</Mark> : <Fragment key={i}>{part.text}</Fragment>
  );
}

function touches(ctx: Ctx, start: number, end: number) {
  return ctx.ranges.some((range) => range.from < end && range.to > start);
}

/** A whole node drawn as one mark where a highlight touches it: code spans, images. */
function atomic(node: any, ctx: Ctx, child: ReactNode): ReactNode {
  const start = node.position.start.offset;
  const end = node.position.end.offset;
  const hits = ctx.ranges.filter((range) => range.from < end && range.to > start).sort(byStrength);
  return hits.length ? <Mark hits={hits} ctx={ctx}>{child}</Mark> : child;
}

function TextNode({ node, ctx }: { node: any; ctx: Ctx }) {
  const start = node.position.start.offset;
  const end = node.position.end.offset;
  if (!touches(ctx, start, end)) return <>{node.value}</>;
  const map = alignText(node.value, ctx.text.slice(start, end));
  return <>{pieces(textSegments({ value: node.value, start, end, map }, ctx.ranges), ctx)}</>;
}

/** The strongest block kind marking a node's whole row or item, for its own background. */
function blockClass(ctx: Ctx, kind: "row" | "item", node: any): string {
  const start = node.position.start.offset;
  const end = node.position.end.offset;
  const hit = ctx.ranges
    .filter((r) => r.block === kind && (kind === "row" ? r.from === start && r.to === end : r.from === start))
    .sort(byStrength)[0];
  return hit ? ` dv-block is-${hit.kind}` : "";
}

function CodeBlock({ node, ctx }: { node: any; ctx: Ctx }) {
  const start = node.position.start.offset;
  const end = node.position.end.offset;
  const source = ctx.text.slice(start, end);
  const fenced = /^\s{0,3}(`{3,}|~{3,})/.test(source);
  const skip = fenced ? source.indexOf("\n") + 1 : 0;
  const value: string = node.value || "";
  const map = skip >= 0 ? alignText(value, source.slice(skip)) : null;
  const rows: ReactNode[] = [];
  let at = 0;
  value.split("\n").forEach((line, i) => {
    const vs = at;
    const ve = at + line.length;
    at = ve + 1;
    let content: ReactNode = line || " ";
    let blockKind = "";
    if (line && map) {
      const from = start + skip + map[vs];
      const to = start + skip + map[ve - 1] + 1;
      if (touches(ctx, from, to)) {
        const relative = map.slice(vs, ve).map((m: number) => m - map[vs]);
        content = pieces(textSegments({ value: line, start: from, end: to, map: relative }, ctx.ranges), ctx);
        const block = ctx.ranges.filter((r) => r.block && r.from <= from && r.to >= to).sort(byStrength)[0];
        if (block) blockKind = ` dv-block is-${block.kind}`;
      }
    }
    rows.push(<span key={i} className={`dv-cl${blockKind}`}>{content}</span>);
  });
  return (
    <div className="dv-codewrap">
      {node.lang && <span className="dv-lang">{node.lang}</span>}
      <pre className="dv-pre"><code>{rows}</code></pre>
    </div>
  );
}

function Kids({ nodes, ctx }: { nodes: any[]; ctx: Ctx }) {
  return <>{nestHtml(nodes).map((child: any, i: number) => <NodeView key={i} node={child} ctx={ctx} />)}</>;
}

function NodeView({ node, ctx }: { node: any; ctx: Ctx }): ReactNode {
  const kids = (c: Ctx = ctx) => <Kids nodes={node.children || []} ctx={c} />;
  switch (node.type) {
    case "root":
      return kids();
    case "heading": {
      const Tag = `h${Math.min(6, Math.max(1, node.depth))}` as "h1";
      return <Tag className="dv-h">{kids()}</Tag>;
    }
    case "paragraph":
      return <p className="dv-p">{kids()}</p>;
    case "text":
      return <TextNode node={node} ctx={ctx} />;
    case "emphasis":
      return <em>{kids()}</em>;
    case "strong":
      return <strong>{kids()}</strong>;
    case "delete":
      return <del>{kids()}</del>;
    case "inlineCode":
      return atomic(node, ctx, <code className="dv-ic">{node.value}</code>);
    case "break":
      return <br />;
    case "thematicBreak":
      return <hr className="dv-hr" />;
    case "blockquote":
      return <blockquote className="dv-bq">{kids()}</blockquote>;
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return <Tag className="dv-list" start={node.ordered && node.start != null && node.start !== 1 ? node.start : undefined}>{kids()}</Tag>;
    }
    case "listItem":
      return (
        <li className={`dv-li${blockClass(ctx, "item", node)}`}>
          {typeof node.checked === "boolean" && <input type="checkbox" checked={node.checked} disabled readOnly aria-label={node.checked ? "done" : "not done"} />}
          {kids()}
        </li>
      );
    case "code":
      return <CodeBlock node={node} ctx={ctx} />;
    case "table": {
      const [head, ...body] = node.children || [];
      const align: (string | null)[] = node.align || [];
      const cell = (row: any, Tag: "th" | "td") =>
        (row.children || []).map((c: any, i: number) => (
          <Tag key={i} style={align[i] ? { textAlign: align[i] as "left" } : undefined}>
            <Kids nodes={c.children || []} ctx={ctx} />
          </Tag>
        ));
      return (
        <div className="dv-tablewrap">
          <table className="dv-table">
            {head && <thead><tr className={`dv-row${blockClass(ctx, "row", head)}`}>{cell(head, "th")}</tr></thead>}
            <tbody>
              {body.map((row: any, i: number) => (
                <tr key={i} className={`dv-row${blockClass(ctx, "row", row)}`}>{cell(row, "td")}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "link": {
      const to = resolveLink(node.url, { owner: ctx.owner, repo: ctx.name, sha: ctx.commit, docPath: ctx.docPath });
      const inner = <Kids nodes={node.children || []} ctx={{ ...ctx, inLink: true }} />;
      return to ? (
        <a href={to.href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{inner}</a>
      ) : (
        <span className="dv-dead">{inner}</span>
      );
    }
    case "linkReference": {
      const url = ctx.definitions.get(String(node.identifier).toLowerCase());
      const to = url ? resolveLink(url, { owner: ctx.owner, repo: ctx.name, sha: ctx.commit, docPath: ctx.docPath }) : null;
      const inner = <Kids nodes={node.children || []} ctx={{ ...ctx, inLink: true }} />;
      return to ? (
        <a href={to.href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{inner}</a>
      ) : (
        <span className="dv-dead">{inner}</span>
      );
    }
    case "image":
    case "imageReference":
      return atomic(node, ctx, <span className="dv-image">[image: {node.alt || ""}]</span>);
    case "footnoteReference":
      return <sup className="dv-fn">[{node.label || node.identifier}]</sup>;
    case "footnoteDefinition":
      return <div className="dv-fndef"><b>[{node.label || node.identifier}]</b> {kids()}</div>;
    case "html":
      return null;
    case "htmlText": {
      const start = node.position.start.offset;
      const end = node.position.end.offset;
      if (!touches(ctx, start, end)) return <>{node.value}</>;
      const map = alignText(node.value, ctx.text.slice(start, end));
      return <>{pieces(textSegments({ value: node.value, start, end, map }, ctx.ranges), ctx)}</>;
    }
    case "htmlComment":
      return null;
    case "htmlVoid":
      return <br />;
    case "htmlElement": {
      const start = node.position.start.offset;
      const end = node.position.end.offset;
      const marked = ctx.ranges.some((r) => r.kind !== "tail" && r.from < end && r.to > start);
      const inner = <Kids nodes={node.children || []} ctx={ctx} />;
      if (node.tag === "details") return <details className="dv-details" open={marked || undefined}>{inner}</details>;
      if (node.tag === "summary") return <summary>{inner}</summary>;
      if (node.tag === "sub") return <sub>{inner}</sub>;
      if (node.tag === "sup") return <sup>{inner}</sup>;
      if (node.tag === "kbd") return <kbd>{inner}</kbd>;
      return <>{inner}</>;
    }
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      // A component is never run: its name stands where it was, around whatever text it holds.
      const Wrap = node.type === "mdxJsxFlowElement" ? "div" : "span";
      if (!node.name) return <Wrap>{kids()}</Wrap>;
      return (
        <Wrap className="dv-mdx">
          <span className="dv-ph">‹{node.name}›</span>{kids()}<span className="dv-ph">‹/{node.name}›</span>
        </Wrap>
      );
    }
    case "mdxjsEsm":
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "definition":
    case "yaml":
    case "toml":
      return null;
    default:
      if (node.children) return kids();
      return typeof node.value === "string" ? <>{node.value}</> : null;
  }
}

function collectDefinitions(tree: any): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (node: any) => {
    if (node.type === "definition" && node.identifier) out.set(String(node.identifier).toLowerCase(), node.url);
    (node.children || []).forEach(visit);
  };
  visit(tree);
  return out;
}

/** A top-level block, redrawn only when its own highlights or open card change. */
const BlockView = memo(function BlockView({ node, index, shared, ranges, selected, muted }: {
  node: any; index: number; shared: Shared; ranges: any[]; selected: Set<string> | null; muted: boolean;
}) {
  const ctx: Ctx = { ...shared, block: index, ranges, selected, inLink: false };
  const out = <NodeView node={node} ctx={ctx} />;
  return muted ? <div className="dv-unread">{out}</div> : out;
});

function DocCard({ items, onClose }: { items: ReactNode[]; onClose: () => void }) {
  return (
    <div className="dv-card" role="region" aria-label="Rules at this spot">
      <button type="button" className="dv-card-close" onClick={onClose} aria-label="Close">×</button>
      {items}
    </div>
  );
}

export default function DocumentView({
  data, rules, stale, owner, name, docPath, branch, lastReadMs, onInclude, renderStale,
}: {
  data: DocText;
  /** The doc's rules as the Rules tab lists them, with their current exclusion. */
  rules: Row[];
  stale: DocStale[];
  owner: string;
  name: string;
  docPath: string;
  branch: string | null;
  lastReadMs: number | null;
  /** Puts an excluded rule back; absent where nothing may be changed. */
  onInclude?: (rule: Row) => Promise<string | null>;
  /** The body of a stale name's card: the existing wording and its issue link. */
  renderStale: (finding: any) => ReactNode;
}) {
  const formatted = FORMATTED.has(data.format);
  const [wanted, setWanted] = useState<"formatted" | "source">(
    formatted && data.text.length <= LARGE_CHARS ? "formatted" : "source"
  );
  const [broke, setBroke] = useState(false);
  const [selected, setSelected] = useState<{ block: number; ids: string[] } | null>(null);
  const [includeError, setIncludeError] = useState<Record<string, string>>({});
  const mode = formatted && wanted === "formatted" && !broke ? "formatted" : "source";

  const parsed = useMemo(() => {
    if (mode !== "formatted") return { tree: null as any, failed: false };
    try {
      return { tree: parse(data.text, data.format), failed: false };
    } catch {
      return { tree: null, failed: true };
    }
  }, [data.text, data.format, mode]);
  const shown = parsed.failed ? "source" : mode;
  const tree = shown === "formatted" ? parsed.tree : null;

  const cut = data.readChars != null && data.readChars < data.text.length ? data.readChars : null;
  const placed = useMemo(
    () => ruleRanges({ text: data.text, tree, placements: data.placements, unplaced: data.unplaced, rules, readChars: cut }),
    [data, tree, rules, cut]
  );
  const staleMarks = useMemo(() => staleRanges(data.text, stale, cut), [data.text, stale, cut]);
  const ranges = useMemo(() => [...placed.ranges, ...staleMarks], [placed, staleMarks]);
  const counts = kindCounts(rules, [...new Set(staleMarks.map((r: any) => r.id))]);

  useEffect(() => setSelected(null), [shown, data]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const pick = (block: number, ids: string[]) =>
    setSelected((now) => (now && now.block === block && sameIds(now.ids, ids) ? null : { block, ids }));

  const byId = useMemo(() => new Map(rules.map((rule) => [rule.factId, rule])), [rules]);
  const staleById = useMemo(
    () => new Map(staleMarks.map((r: any) => [r.id, r.finding])),
    [staleMarks]
  );

  const card = selected && (
    <DocCard
      onClose={() => setSelected(null)}
      items={selected.ids.map((id) => {
        const finding = staleById.get(id);
        if (finding) {
          return (
            <div key={id} className="dv-card-item">
              <div className="dv-card-head">
                <span className="dv-badge is-stale">Stale name</span>
                <code className="dv-card-name">{finding.name}</code>
              </div>
              {renderStale(finding)}
            </div>
          );
        }
        const rule = byId.get(id);
        if (!rule) return null;
        return (
          <RuleItem
            key={id}
            rule={rule}
            owner={owner}
            name={name}
            docPath={docPath}
            commit={data.commit}
            onInclude={onInclude}
            error={includeError[id]}
            setError={(message) => setIncludeError((was) => ({ ...was, [id]: message }))}
          />
        );
      })}
    />
  );

  const swatch = (kind: string, n: number, label: string) =>
    n > 0 && (
      <span key={kind} className="dv-count">
        <i className={`dv-sw is-${kind}`} aria-hidden="true" />
        {n} {label}
      </span>
    );

  const shared: Shared = useMemo(
    () => ({
      text: data.text,
      owner,
      name,
      docPath,
      commit: data.commit,
      definitions: tree ? collectDefinitions(tree) : new Map(),
      pick,
    }),
    [data.text, owner, name, docPath, data.commit, tree]
  );

  const divider = (
    <div className="dv-divider" role="separator" aria-label="Striff read up to here">
      <span>Striff read up to here</span>
    </div>
  );

  let body: ReactNode;
  if (shown === "formatted") {
    const blocks = nestHtml(tree.children || []);
    let dividerAt = -1;
    if (cut != null) dividerAt = blocks.findIndex((b: any) => (b.position?.start?.offset ?? 0) >= cut);
    body = (
      <Guard onFail={() => setBroke(true)}>
        <div className="dv-doc">
          {blocks.map((block: any, i: number) => {
            const start = block.position?.start?.offset ?? 0;
            const end = block.position?.end?.offset ?? start;
            const inTail = cut != null && start >= cut;
            const straddles = cut != null && start < cut && end > cut;
            const own = inTail ? NONE : straddles ? [...ranges, { from: cut, to: end, kind: "tail" }] : ranges;
            return (
              <Fragment key={i}>
                {i === dividerAt && divider}
                <BlockView
                  node={block}
                  index={i}
                  shared={shared}
                  ranges={own}
                  selected={selected && selected.block === i ? new Set(selected.ids) : null}
                  muted={inTail}
                />
                {selected && selected.block === i && card}
              </Fragment>
            );
          })}
          {cut != null && dividerAt < 0 && divider}
        </div>
      </Guard>
    );
  } else {
    body = (
      <SourceView
        data={data}
        ranges={ranges}
        cut={cut}
        selected={selected}
        pick={pick}
        card={card}
        divider={divider}
        owner={owner}
        name={name}
        docPath={docPath}
      />
    );
  }

  const sha = data.commit ? data.commit.slice(0, 7) : null;
  return (
    <div className="dv">
      <div className="dv-bar">
        {sha && (
          <p className="dv-readat">
            Read at{" "}
            <a href={blobUrl(owner, name, data.commit, docPath)} target="_blank" rel="noopener noreferrer"><code>{sha}</code></a>
            {branch ? ` on ${branch}` : ""}
            {lastReadMs ? `, ${formatDay(lastReadMs, { day: "numeric", month: "short", year: "numeric" })}` : ""}.
            {data.mainChanged && (
              <>
                {" · "}
                <a href={`https://github.com/${owner}/${name}/blob/${encodeURIComponent(branch || "HEAD")}/${docPath.split("/").map(encodeURIComponent).join("/")}`}
                   target="_blank" rel="noopener noreferrer">
                  {branch || "main"} has changed this doc since
                </a>
              </>
            )}
          </p>
        )}
        {formatted && !parsed.failed && !broke && (
          <div className="dv-toggle" role="group" aria-label="How to show the doc">
            {(["formatted", "source"] as const).map((m) => (
              <button key={m} type="button" className={wanted === m ? "is-on" : ""} aria-pressed={wanted === m} onClick={() => setWanted(m)}>
                {m === "formatted" ? "Formatted" : "Source"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="dv-counts" aria-label="What is marked in the doc">
        {swatch("holds", counts.holds, "hold")}
        {swatch("broken", counts.broken, "broken")}
        {swatch("unchecked", counts.unchecked, "not checked yet")}
        {swatch("excluded", counts.excluded, "excluded by you")}
        {swatch("stale", counts.stale, counts.stale === 1 ? "stale name" : "stale names")}
      </div>
      {body}
      {placed.unplaced.length > 0 && (
        <section className="dv-unplaced">
          <h4>Not marked in the text <b>{placed.unplaced.length}</b></h4>
          <ul>
            {placed.unplaced.map((rule: Row) => {
              const kind = ruleKind(rule) as string;
              return (
                <li key={rule.factId}>
                  <span className={`dv-badge is-${kind}`}>{KIND_LABEL[kind]}</span>
                  <Clamped lines={3}>{withCode(rule.quote || rule.statement)}</Clamped>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** What the code does about one rule, in the words the Rules tab uses. */
function outcomeLine(rule: Row, owner: string, name: string): ReactNode {
  const s = standing(rule);
  if (rule.excluded) {
    return "Excluded: pull requests aren't checked against this rule.";
  }
  if (s === "broken" && rule.status === "VIOLATED" && rule.pullNo) {
    return (
      <>
        Broken on the default branch.{" "}
        <a href={`https://github.com/${owner}/${name}/pull/${rule.pullNo}`} target="_blank" rel="noopener noreferrer">
          PR #{rule.pullNo}
        </a>{" "}broke it.
      </>
    );
  }
  if (s === "broken" && rule.status === "PRE_EXISTING") {
    return "Already broken: the code was not keeping this rule before it was first checked.";
  }
  if (s === "holds" && rule.status === "RESTORED" && rule.pullNo) {
    return `Restored by PR #${rule.pullNo}: the code was not keeping this rule until then, and does now.`;
  }
  return STANDING_HELP[s];
}

function RuleItem({ rule, owner, name, docPath, commit, onInclude, error, setError }: {
  rule: Row; owner: string; name: string; docPath: string; commit: string;
  onInclude?: (rule: Row) => Promise<string | null>; error?: string; setError: (message: string) => void;
}) {
  const kind = ruleKind(rule) as string;
  const label = rule.excluded ? "Excluded" : STANDING_LABEL[standing(rule)];
  return (
    <div className="dv-card-item" data-rule={rule.factId}>
      <div className="dv-card-head">
        <span className={`dv-badge is-${kind}`}>{label}</span>
        <span className="dv-card-title">{withCode(rule.statement)}</span>
      </div>
      <p className="dv-card-body">
        {outcomeLine(rule, owner, name)}
        {rule.pullNo && rule.judgedAtMs ? <span className="dv-card-when"> Last checked on PR #{rule.pullNo}, {when(rule.judgedAtMs)}.</span> : null}
      </p>
      <div className="dv-card-actions">
        {rule.excluded && onInclude && (
          <button
            type="button"
            className="dv-card-button"
            onClick={async () => {
              setError("");
              const failed = await onInclude(rule);
              if (failed) setError(failed);
            }}
          >
            Include again
          </button>
        )}
        {rule.sourceLine && commit && (
          <a href={blobUrl(owner, name, commit, docPath, rule.sourceLine)} target="_blank" rel="noopener noreferrer">
            Line {rule.sourceLine} on GitHub
          </a>
        )}
        {error && <span className="dv-card-error" role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** The doc as text: wrapped lines, each numbered with a link to GitHub, headings bold, code monospace. */
function SourceView({ data, ranges, cut, selected, pick, card, divider, owner, name, docPath }: {
  data: DocText; ranges: any[]; cut: number | null; selected: { block: number; ids: string[] } | null;
  pick: (block: number, ids: string[]) => void; card: ReactNode; divider: ReactNode; owner: string; name: string; docPath: string;
}) {
  const lines = useMemo(() => sourceLines(data.text, data.format), [data.text, data.format]);
  const norm = useMemo(() => normalizeRanges(data.text, ranges), [data.text, ranges]);
  const dividerAt = cut == null ? -1 : lines.findIndex((l) => l.from >= cut);
  return (
    <div className="dv-source">
      {lines.map((line, i) => {
        const own = cut != null && line.from < cut && line.to > cut ? [...norm, { from: cut, to: line.to, kind: "tail" }] : norm;
        const inTail = cut != null && line.from >= cut;
        const here = selected && selected.block === i ? new Set(selected.ids) : null;
        const ctx: Ctx = {
          text: data.text, owner, name, docPath, commit: data.commit, definitions: new Map(),
          pick, block: i, ranges: inTail ? [] : own, selected: here, inLink: false,
        };
        let content: ReactNode = line.from === line.to ? " " : data.text.slice(line.from, line.to);
        let blockKind = "";
        if (!inTail && line.to > line.from && own.some((r: any) => r.from < line.to && r.to > line.from)) {
          const parts = segments(line.from, line.to, own).map((seg: any) => ({ text: data.text.slice(seg.from, seg.to), hits: seg.hits }));
          content = pieces(parts, ctx);
          const block = own.filter((r: any) => r.block && r.from <= line.from && r.to >= line.to).sort(byStrength)[0];
          if (block) blockKind = ` dv-block is-${block.kind}`;
        }
        return (
          <Fragment key={i}>
            {i === dividerAt && divider}
            <div className={`dv-line is-${line.kind}${inTail ? " dv-unread" : ""}${blockKind}`}>
              <a className="dv-ln" href={blobUrl(owner, name, data.commit, docPath, line.n)} target="_blank" rel="noopener noreferrer" aria-label={`Line ${line.n} on GitHub`}>{line.n}</a>
              <span className="dv-lt">{content}</span>
            </div>
            {selected && selected.block === i && card}
          </Fragment>
        );
      })}
      {cut != null && dividerAt < 0 && divider}
    </div>
  );
}
