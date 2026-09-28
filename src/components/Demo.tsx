import { useEffect, useState } from "react";
import DocsTab from "./DocsTab";
import MetricsTab from "./MetricsTab";
import { demoCatalog, demoDoc, demoRules, DEMO_REPO } from "../data/demoDashboard";
import { orgMetricsPreviewData } from "../data/orgMetricsPreview";

/**
 * The dashboard, on a repository nobody has to install anything to look at.
 *
 * Until now the only way to see what Striff produces was to grant a GitHub App access to your
 * repositories. That is a large first step for someone who has read one article and wants to know
 * whether the screenshots are real, and it is the step a link in a comment thread cannot carry.
 *
 * So this is the real thing: the same two views a customer uses, the same tree, tables, sorting,
 * search, export, truncation and clamping, running against a fixed set of answers in the shape the
 * API sends. Nothing is redrawn for the occasion, which is the point -- a demo that is a picture of
 * a product proves only that somebody can draw.
 *
 * The repository is invented and says so, here and in the page around it. Writing is refused:
 * excluding a document, forcing a read and asking for a reading all decline politely rather than
 * pretending, because a control that appears to work and does not is worse than one that is
 * honest about being an example.
 *
 * The open view is in the URL fragment (#docs, #metrics), so the homepage can send a reader to one
 * view and a reader can send a colleague to the one they mean. `#rules` was the flat list of rules
 * before it became the repository row of the tree, and it still lands where those rules are.
 */
type View = "docs" | "metrics";
const VIEWS: { id: View; label: string }[] = [
  { id: "docs", label: "Docs & rules" },
  { id: "metrics", label: "Metrics" },
];

function viewFromHash(): View | null {
  const h = window.location.hash.replace(/^#/, "");
  if (h === "rules") return "docs";
  return VIEWS.some((v) => v.id === h) ? (h as View) : null;
}

export default function Demo() {
  const [view, setView] = useState<View>("docs");
  const repos = [{ full_name: DEMO_REPO }];

  useEffect(() => {
    const apply = () => {
      const v = viewFromHash();
      if (v) setView(v);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const show = (v: View) => {
    setView(v);
    const url = `${window.location.pathname}${window.location.search}${v === "docs" ? "" : `#${v}`}`;
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="demo-tabs" role="tablist" aria-label="Dashboard views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={`demo-tab${view === v.id ? " is-on" : ""}`}
              onClick={() => show(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="demo-note">
          <span className="demo-chip">Example</span>
          {view === "metrics"
            ? "An invented organisation, in the real dashboard. Nothing here can be changed."
            : "An invented repository, in the real dashboard. Nothing here can be changed."}
        </p>
      </div>

      <div className="demo-stage">
        {view === "docs" && (
          <DocsTab
            installationId={0}
            repos={repos}
            openRepo={DEMO_REPO}
            sample={{ catalog: demoCatalog, rules: demoRules, doc: demoDoc }}
          />
        )}
        {view === "metrics" && (
          <div className="demo-metrics">
            <MetricsTab data={orgMetricsPreviewData} loading={false} error="" />
          </div>
        )}
      </div>
    </div>
  );
}
