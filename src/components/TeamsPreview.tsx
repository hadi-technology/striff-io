import { useEffect, useRef, useState } from "react";
import DocsTab from "./DocsTab";
import MetricsTab from "./MetricsTab";
import { demoCatalog, demoDoc, demoDocText, demoRules, DEMO_REPO, demoStaleNames } from "../data/demoDashboard";
import { orgMetricsPreviewData } from "../data/orgMetricsPreview";

/**
 * One dashboard view, on the example data, for the leaders section of the home page.
 *
 * The views are the components the demo page runs, handed the same fixed answers. Each one plays a
 * short walk-through of itself when its slide comes on screen: a pointer moves to a control and
 * presses it, so the page shows what the view does by doing it on the real component. The frame is
 * inert for the reader, so the walk-through is the only thing that touches it.
 */
export type TeamsView = "docs" | "rules" | "metrics";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls for a control by selector and exact text, giving up after a few seconds. */
async function find(root: HTMLElement, selector: string, text?: string, alive?: () => boolean): Promise<HTMLElement | null> {
  for (let i = 0; i < 40; i++) {
    if (alive && !alive()) return null;
    const hit = Array.from(root.querySelectorAll<HTMLElement>(selector)).find((e) => !text || (e.textContent || "").trim() === text);
    if (hit) return hit;
    await wait(100);
  }
  return null;
}

function Walkthrough({ view }: { view: TeamsView }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = box.current;
    const frame = root?.closest<HTMLElement>(".teams-panel-live");
    if (!root || !frame) return;
    let live = true;
    const alive = () => live && !frame.hidden;
    if (frame.hidden) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cursor = document.createElement("div");
    cursor.className = "teams-cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 2-3 6z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>';
    frame.appendChild(cursor);

    const scrollTo = (top: number) => frame.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    const pos = (el: HTMLElement) => {
      const f = frame.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - f.left + Math.min(r.width * 0.5, 60), y: r.top - f.top + r.height * 0.5, top: r.top - f.top + frame.scrollTop };
    };
    const press = async (el: HTMLElement) => {
      const p = pos(el);
      cursor.style.opacity = "1";
      cursor.style.transform = `translate(${p.x}px, ${p.y + frame.scrollTop}px)`;
      await wait(850);
      if (!alive()) return;
      cursor.classList.add("is-press");
      el.click();
      await wait(260);
      cursor.classList.remove("is-press");
    };

    (async () => {
      if (view !== "docs") {
        if (reduced) return;
        await wait(900);
        if (!alive()) return;
      }
      if (view === "docs") {
        // No pointer and no pause: the tab is the reader's click, and what it should show is the
        // document with its sentences marked, so the view opens there at once.
        const doc = await find(root, ".docs-row-main", "ARCHITECTURE.md", alive);
        if (doc) doc.click();
        const tab = await find(root, "button", "Document", alive);
        if (tab && alive()) {
          tab.click();
          await wait(250);
          scrollTo(pos(tab).top - 14);
        }
      } else if (view === "rules") {
        const sort = await find(root, ".rules-sort", "How it stands", alive);
        if (sort && alive()) {
          scrollTo(pos(sort).top - 30);
          await wait(900);
          await press(sort);
          await wait(1200);
          const filter = await find(root, ".docs-filter", undefined, alive);
          if (filter) cursor.style.opacity = "0";
        }
      } else {
        cursor.style.opacity = "0";
      }
    })();

    return () => {
      live = false;
      cursor.remove();
    };
  }, [view]);

  const repos = [{ full_name: DEMO_REPO }];
  return (
    <div ref={box} className="dashboard-shell">
      {view === "metrics" ? (
        <div className="dashboard-installation-card">
          <MetricsTab data={orgMetricsPreviewData} loading={false} error="" />
        </div>
      ) : (
        <DocsTab
          installationId={0}
          repos={repos}
          openRepo={DEMO_REPO}
          sample={{ catalog: demoCatalog, rules: demoRules, doc: demoDoc, docText: demoDocText, staleNames: demoStaleNames, delay: () => 0 }}
        />
      )}
    </div>
  );
}

export default function TeamsPreview({ view }: { view: TeamsView }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === view) setN((v) => v + 1);
    };
    window.addEventListener("teams-car-show", on);
    return () => window.removeEventListener("teams-car-show", on);
  }, [view]);
  return <Walkthrough key={n} view={view} />;
}
