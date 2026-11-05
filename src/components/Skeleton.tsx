import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SLOW_AFTER_MS, slowAfter } from "../lib/slowLoad.js";

/**
 * Placeholders for what a screen will show, drawn while it waits.
 *
 * Each shape stands where its real counterpart will, in the same containers, so that nothing moves
 * when the data lands. The shimmer is one band for the whole page (see `.sk` in the stylesheet),
 * not one per block, and there is none under reduced motion.
 */

/** One placeholder block: a line, a bar, a chip or, with `circle`, a dot. */
export function Sk({ w, h = "0.8rem", circle = false, className = "", style }: {
  w?: string | number;
  h?: string | number;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`sk${circle ? " is-circle" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ width: w ?? "100%", height: h, ...(circle ? { width: w ?? h } : {}), ...style }}
    />
  );
}

/**
 * A region that is waiting for its data: busy for assistive technology, with one label that is
 * read out, and a quiet line under the placeholders once the wait has gone on long enough.
 */
export function SkeletonArea({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => slowAfter(SLOW_AFTER_MS, () => setSlow(true)), []);
  return (
    <div className={`sk-area${className ? ` ${className}` : ""}`} aria-busy="true">
      <span className="sr-only" role="status">Loading {label}…</span>
      {children}
      {slow && <p className="sk-slow">Still loading… large repositories take a little longer.</p>}
    </div>
  );
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The branch line, the reading sentence and its progress bar, under the repository's name. */
export function HeadCopySkeleton() {
  return (
    <div className="sk-stack" aria-hidden="true">
      <Sk w="26rem" h="0.85rem" className="sk-max" />
      <Sk w="14rem" h="0.9rem" />
      <Sk w="34rem" h="0.85rem" className="sk-max" />
      <Sk w="30rem" h="0.85rem" className="sk-max" />
      <Sk w="12rem" h="0.4rem" style={{ marginTop: "0.35rem" }} />
    </div>
  );
}

/** The Rules summary: a caption over six number and label pairs. */
export function TallySkeleton() {
  return (
    <div className="docs-tally" aria-hidden="true">
      <div className="docs-tally-group">
        <Sk w="5.5rem" h="0.6rem" />
        <div className="docs-tally-row">
          {[3.4, 3, 3.6, 5.2, 4.6, 4.8].map((label, i) => (
            <div key={i} className="docs-tally-item">
              <Sk w="1.8rem" h="1.4rem" />
              <Sk w={`${label}rem`} h="0.55rem" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The tree beside the pane: its search box, two rows of chips, and a handful of indented rows. */
export function TreeSkeleton() {
  const indent = [0, 1, 2, 2, 1, 1, 0, 0];
  const width = [9, 5, 8, 10, 7, 9, 8, 6];
  return (
    <div className="docs-list" aria-hidden="true">
      <div className="sk-tree-search"><Sk w="100%" h="2.2rem" /></div>
      <div className="docs-filters sk-filters">
        {[["Documents", [3, 5, 5.5, 5]], ["Rules", [5, 4.5, 6.5, 6.5, 5.5]]].map(([group, chips]) => (
          <div key={group as string} className="docs-filter-group">
            <Sk w="4.5rem" h="0.55rem" />
            <div className="sk-chips">
              {(chips as number[]).map((w, i) => <Sk key={i} w={`${w}rem`} h="1.65rem" className="sk-pill" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="sk-tree">
        {rows(8).map((i) => (
          <div key={i} className="sk-tree-row" style={{ paddingLeft: `${0.8 + indent[i] * 0.9}rem` }}>
            <Sk w="1rem" h="1rem" />
            <Sk w={`${width[i]}rem`} h="0.8rem" className="sk-max" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Table rows as the rules table draws them: where it came from, the sentence, the rule, how it stands. */
export function RuleRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="sk-table" aria-hidden="true">
      <div className="sk-table-head">
        <Sk w="6rem" h="0.55rem" /><Sk w="9rem" h="0.55rem" /><Sk w="8rem" h="0.55rem" /><Sk w="5rem" h="0.55rem" />
      </div>
      {rows(count).map((i) => (
        <div key={i} className="sk-table-row">
          <div className="sk-cell"><Sk w="4.5rem" h="0.7rem" /></div>
          <div className="sk-cell"><Sk h="0.8rem" /><Sk h="0.8rem" /><Sk w="60%" h="0.8rem" /></div>
          <div className="sk-cell"><Sk h="0.8rem" /><Sk w={`${55 + ((i * 17) % 35)}%`} h="0.8rem" /></div>
          <div className="sk-cell"><Sk w="4.8rem" h="1.4rem" className="sk-pill" /><Sk w="6.5rem" h="0.6rem" /></div>
        </div>
      ))}
    </div>
  );
}

/** The pane beside the tree: the doc's path, its two tabs, a count line and the table. */
export function PaneSkeleton({ rowsCount = 6 }: { rowsCount?: number }) {
  return (
    <div className="docs-pane" aria-hidden="true">
      <div className="sk-pane-head">
        <Sk w="15rem" h="1.1rem" />
        <Sk w="7rem" h="1.7rem" />
        <span className="sk-grow" />
        <Sk w="7rem" h="1.9rem" />
      </div>
      <div className="sk-tabs">
        <Sk w="5.5rem" h="1rem" /><Sk w="6.5rem" h="1rem" />
      </div>
      <Sk w="11rem" h="0.8rem" style={{ marginTop: "0.9rem" }} />
      <RuleRowsSkeleton count={rowsCount} />
    </div>
  );
}

/** The tree and the pane together: the page under its header, before the first answer. */
export function SplitSkeleton() {
  return (
    <SkeletonArea label="documents and rules" className="sk-split-area">
      <div className="docs-split">
        <TreeSkeleton />
        <span aria-hidden="true" />
        <PaneSkeleton />
      </div>
    </SkeletonArea>
  );
}

/** A doc's text: a title, then paragraphs of lines of different lengths with a heading or two. */
export function DocTextSkeleton() {
  const paragraph = (widths: number[], key: string) => (
    <div key={key} className="sk-para">
      {widths.map((w, i) => <Sk key={i} w={`${w}%`} h="0.85rem" />)}
    </div>
  );
  return (
    <SkeletonArea label="the doc" className="sk-doc-area">
      <div className="sk-doc" aria-hidden="true">
        <Sk w="40%" h="1.6rem" />
        {paragraph([100, 96, 62], "a")}
        <Sk w="22%" h="1.1rem" style={{ marginTop: "0.6rem" }} />
        {paragraph([100, 92, 98, 70], "b")}
        {paragraph([88, 100, 54], "c")}
        <Sk w="28%" h="1.1rem" style={{ marginTop: "0.6rem" }} />
        {paragraph([100, 94, 99, 90, 46], "d")}
      </div>
    </SkeletonArea>
  );
}

/** A doc or folder's rules while they load, in the pane's own table. */
export function RulesSkeleton({ label = "rules", count = 5 }: { label?: string; count?: number }) {
  return (
    <SkeletonArea label={label}>
      <RuleRowsSkeleton count={count} />
    </SkeletonArea>
  );
}

/** The checks list: a heading and five rows of a pull request, its title and what was found. */
export function ChecksSkeleton() {
  return (
    <SkeletonArea label="checks">
      <ol className="checks-list sk-checks" aria-hidden="true">
        {rows(5).map((i) => (
          <li key={i} className="check-row">
            <div className="check-main sk-stack">
              <div className="sk-inline"><Sk w="3.2rem" h="0.85rem" /><Sk w={`${14 + ((i * 7) % 12)}rem`} h="0.85rem" className="sk-max" /></div>
              <Sk w="16rem" h="0.65rem" className="sk-max" />
            </div>
            <div className="sk-inline"><Sk w="4.5rem" h="1.4rem" className="sk-pill" /><Sk w="6rem" h="0.65rem" /></div>
          </li>
        ))}
      </ol>
    </SkeletonArea>
  );
}

/** The metrics: a row of stat tiles and one chart-shaped block. */
export function MetricsSkeleton() {
  return (
    <SkeletonArea label="metrics">
      <div className="sk-metrics" aria-hidden="true">
        <div className="sk-tiles">
          {rows(4).map((i) => (
            <div key={i} className="sk-tile"><Sk w="5rem" h="0.6rem" /><Sk w="4rem" h="1.8rem" /><Sk w="7rem" h="0.6rem" /></div>
          ))}
        </div>
        <div className="sk-tile sk-chart"><Sk w="9rem" h="0.8rem" /><Sk h="12rem" /></div>
      </div>
    </SkeletonArea>
  );
}

/** The billing card: a heading, a plan line and a button. */
export function BillingSkeleton() {
  return (
    <SkeletonArea label="billing">
      <div className="sk-tile sk-billing" aria-hidden="true">
        <Sk w="8rem" h="1rem" />
        <Sk w="60%" h="0.8rem" />
        <Sk w="40%" h="0.8rem" />
        <Sk w="9rem" h="2.2rem" />
      </div>
    </SkeletonArea>
  );
}

/** The whole dashboard before its first answer: the repository's header, then the tree and the pane. */
export function DashboardSkeleton() {
  return (
    <SkeletonArea label="your dashboard" className="docs-tab">
      <div className="docs-head-top" aria-hidden="true">
        <Sk w="6rem" h="0.65rem" />
        <div className="docs-title" style={{ marginTop: "0.5rem" }}>
          <Sk w="16rem" h="1.6rem" />
          <Sk w="5.5rem" h="1.7rem" />
        </div>
      </div>
      <div className="docs-head" aria-hidden="true">
        <div className="docs-head-copy"><HeadCopySkeleton /></div>
        <TallySkeleton />
      </div>
      <div className="docs-split" aria-hidden="true">
        <TreeSkeleton />
        <span />
        <PaneSkeleton />
      </div>
    </SkeletonArea>
  );
}
