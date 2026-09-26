import { useState } from "react";
import RulesTab from "./RulesTab";
import DocsTab from "./DocsTab";
import { demoCatalog, demoDoc, demoRules, DEMO_REPO } from "../data/demoDashboard";

/**
 * The dashboard, on a repository nobody has to install anything to look at.
 *
 * Until now the only way to see what Striff produces was to grant a GitHub App access to your
 * repositories. That is a large first step for someone who has read one article and wants to know
 * whether the screenshots are real, and it is the step a link in a comment thread cannot carry.
 *
 * So this is the real thing: the same two views a customer uses, the same table, sorting, search,
 * export, truncation and clamping, running against a fixed set of answers in the shape the API
 * sends. Nothing is redrawn for the occasion, which is the point -- a demo that is a picture of a
 * product proves only that somebody can draw.
 *
 * The repository is invented and says so, here and in the page around it. Writing is refused:
 * excluding a document, forcing a read and asking for a reading all decline politely rather than
 * pretending, because a control that appears to work and does not is worse than one that is
 * honest about being an example.
 */
export default function Demo() {
  const [view, setView] = useState<"rules" | "docs">("rules");
  const [focusDoc, setFocusDoc] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ value: string; at: number } | null>(null);
  const repos = [{ full_name: DEMO_REPO }];

  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="demo-tabs" role="tablist" aria-label="Dashboard views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "rules"}
            className={`demo-tab${view === "rules" ? " is-on" : ""}`}
            onClick={() => setView("rules")}
          >
            Rules
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "docs"}
            className={`demo-tab${view === "docs" ? " is-on" : ""}`}
            onClick={() => setView("docs")}
          >
            Documents
          </button>
        </div>
        <p className="demo-note">
          <span className="demo-chip">Example</span>
          An invented repository, in the real dashboard. Nothing here can be changed.
        </p>
      </div>

      <div className="demo-stage">
        {view === "rules" ? (
          <RulesTab
            installationId={0}
            repos={repos}
            openRepo={DEMO_REPO}
            sample={demoRules}
            showFilter={filter}
            onOpenDoc={(path) => {
              setFocusDoc(path);
              setView("docs");
            }}
          />
        ) : (
          <DocsTab
            installationId={0}
            repos={repos}
            openRepo={DEMO_REPO}
            focusDoc={focusDoc}
            sample={{ catalog: demoCatalog, doc: demoDoc }}
            onOpenRules={(value) => {
              setFilter({ value, at: Date.now() });
              setView("rules");
            }}
          />
        )}
      </div>
    </div>
  );
}
