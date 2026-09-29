import { useEffect, useState } from "react";
import DocsTab, { type DocsSource } from "./DocsTab";
import ChecksTab from "./ChecksTab";

/**
 * A public repository's page: the dashboard's documents and checks views, read-only, for anyone.
 *
 * The repository comes from the address, the way GitHub's own does: striff.io/<owner>/<repo>.
 * Whether there is a page is striff-api's decision, and a repository without one -- private,
 * missing, or public and never analysed -- is answered the same way, so this page cannot be used
 * to find out which private repositories exist.
 *
 * A page the repository's maintainers did not set up is a snapshot, dated as one, offers them the
 * install, and shows only
 * what the repository's documents claim and whether the code holds it: the pull requests on it
 * were chosen by whoever analysed them, not by the repository, so they are no history of it.
 * A repository that installed Striff has every pull request checked, and its page lists them.
 * Nothing on either can be changed, and a finding that a person has not yet checked is left out,
 * never shown as a rule that holds.
 */

const INSTALL_URL = "https://github.com/apps/striff-app/installations/new";

/** First path segments that are this site's own pages, never a repository's owner. */
const SITE_ROUTES = new Set(["blog", "contact", "billing", "dashboard", "demo", "pricing", "privacy", "terms", "cookies", "installed"]);

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

type View = "docs" | "checks";

interface Reading {
  state: string | null;
  finishedAtMs: number;
  docsTotal: number;
  docsDone: number;
}

interface PageSummary {
  repoOwner: string;
  repoName: string;
  claimed: boolean;
  publishedAtMs: number | null;
  reading: Reading | null;
}

type Loaded =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "error" }
  | { kind: "page"; page: PageSummary };

/** The owner and name the address names, or null where it names no repository. */
function repoFromPath(pathname: string): { owner: string; name: string } | null {
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (SITE_ROUTES.has(owner.toLowerCase())) return null;
  if (!OWNER.test(owner) || !NAME.test(name) || name === "." || name === "..") return null;
  return { owner, name };
}

function proxy(owner: string, name: string, view: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ owner, repo: name, view, ...extra });
  return `/.netlify/functions/public-repo-proxy?${query.toString()}`;
}

function viewFromHash(): View {
  return window.location.hash.replace(/^#/, "") === "checks" ? "checks" : "docs";
}

export default function PublicRepo() {
  const [target, setTarget] = useState<{ owner: string; name: string } | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [view, setView] = useState<View>("docs");

  useEffect(() => {
    setTarget(repoFromPath(window.location.pathname));
    setView(viewFromHash());
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (target === undefined) return;
    if (target === null) {
      setLoaded({ kind: "none" });
      return;
    }
    let current = true;
    fetch(proxy(target.owner, target.name, "page"))
      .then(async (res) => {
        if (!current) return;
        if (res.status === 404) {
          setLoaded({ kind: "none" });
          return;
        }
        if (!res.ok) {
          setLoaded({ kind: "error" });
          return;
        }
        const page: PageSummary = await res.json();
        setLoaded({ kind: "page", page });
        document.title = `${page.repoOwner}/${page.repoName} | Striff`;
      })
      .catch(() => current && setLoaded({ kind: "error" }));
    return () => {
      current = false;
    };
  }, [target]);

  const show = (v: View) => {
    setView(v);
    window.history.replaceState(null, "", `${window.location.pathname}${v === "docs" ? "" : `#${v}`}`);
  };

  if (loaded.kind === "loading") {
    return <p className="dashboard-metric-caption">Loading…</p>;
  }

  if (loaded.kind === "error") {
    return (
      <div className="dashboard-empty">
        <p className="text-slate-600">Striff could not be reached just now. Try again in a moment.</p>
      </div>
    );
  }

  if (loaded.kind === "none") {
    const named = target ? `${target.owner}/${target.name}` : null;
    return (
      <div className="demo-cta">
        <div>
          <p className="demo-cta-title">
            {named ? <>Striff hasn't analysed <code className="github-inline-code">{named}</code>.</> : "There's no page here."}
          </p>
          <p className="demo-cta-sub">
            Striff reads the documents in a repository, turns the sentences that make claims about
            the code into rules, and checks every pull request against them. Install it on your
            repository and its page fills in from the next pull request.
          </p>
        </div>
        <div className="demo-cta-actions">
          <a className="btn-primary" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
            Install the GitHub App
          </a>
          <a className="btn-secondary" href="/dashboard">Sign in</a>
          <a className="btn-secondary" href="/demo">See an example</a>
        </div>
      </div>
    );
  }

  const { page } = loaded;
  const fullName = `${page.repoOwner}/${page.repoName}`;
  const views: View[] = page.claimed ? ["docs", "checks"] : ["docs"];
  const shown: View = views.includes(view) ? view : "docs";
  const reading = page.reading;
  const readingNow = reading && (reading.state === "queued" || reading.state === "running");
  // An unclaimed page is never read again after it is published, so it is as old as its last
  // reading, or as its publishing where no reading finished.
  const snapshotMs = reading && reading.finishedAtMs > 0 ? reading.finishedAtMs : page.publishedAtMs;
  const snapshotAt = snapshotMs
    ? new Date(snapshotMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  const docsSource: DocsSource = {
    url: (docsView, path) => path != null
      ? proxy(page.repoOwner, page.repoName, "doc", { path })
      : proxy(page.repoOwner, page.repoName, docsView === "" ? "catalog" : docsView),
  };

  return (
    <div className="public-repo">
      <div className="public-repo-head">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Architecture checks</p>
        <div className="public-repo-title-row">
          <h1 className="public-repo-title">
            <a href={`https://github.com/${fullName}`} target="_blank" rel="noopener noreferrer">{fullName}</a>
          </h1>
          {!page.claimed && (
            <div className="public-repo-install">
              <a className="btn-primary" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
                Is this yours? Install to manage it
              </a>
              <p className="public-repo-snapshot">Installed, Striff checks every pull request.</p>
            </div>
          )}
        </div>
        {!page.claimed && snapshotAt && (
          <p className="public-repo-refreshed">
            Last refreshed <strong>{snapshotAt}</strong>
          </p>
        )}
      </div>

      {readingNow && (
        <p className="public-repo-withheld">
          Striff is reading this repository's documents
          {reading && reading.docsTotal > 0 ? ` (${reading.docsDone} of ${reading.docsTotal})` : ""}.
          Their rules appear here as they are read.
        </p>
      )}

      <div className="demo">
        <div className="demo-bar">
          <div className="demo-tabs" role="tablist" aria-label="Repository views">
            {views.length > 1 && views.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={shown === v}
                className={`demo-tab${shown === v ? " is-on" : ""}`}
                onClick={() => show(v)}
              >
                {v === "docs" ? "Docs & Rules" : "Checks"}
              </button>
            ))}
          </div>
          <p className="demo-note">
            <span className="demo-chip">Public</span>
            Read-only. Nothing here can be changed.
          </p>
        </div>
        <div className="demo-stage">
          {shown === "docs" && (
            <DocsTab
              installationId={0}
              repos={[{ full_name: fullName }]}
              openRepo={fullName}
              source={docsSource}
            />
          )}
          {shown === "checks" && (
            <ChecksTab
              installationId={0}
              repo={fullName}
              source={(at) => proxy(page.repoOwner, page.repoName, "checks", { page: String(at) })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
