import { useEffect, useState } from "react";

/**
 * The checks Striff ran on a repository's pull requests lately.
 *
 * What happened, newest first: which pull request and commit, when, and what the check found
 * about the documented rules, with the pull request one click away. The last fifty at most, ten
 * at a time, and each page is asked for on its own so the first one arrives quickly.
 */

export interface Check {
  pullNo: string;
  pullUrl: string | null;
  headSha: string | null;
  checkedAtMs: number | null;
  state: string | null;
  headline: string | null;
  changedComponents: number | null;
  diagrams: number | null;
  rulesBroken: number;
  rulesAlreadyBroken: number;
  rulesHeld: number;
  docsRead: number | null;
}

export interface ChecksPage {
  checks: Check[];
  page: number;
  pages: number;
  total: number;
}

/** What a check found, in one word, and the tone it is shown in. */
function verdictOf(check: Check): { label: string; tone: string; help: string } {
  const state = (check.state || "").toUpperCase();
  if (state === "FAILED" || state === "ERROR") {
    return { label: "Didn't finish", tone: "is-muted", help: "The review of this commit stopped before it finished." };
  }
  if (state === "RUNNING" || state === "PENDING" || state === "QUEUED" || state === "REQUESTED") {
    return { label: "Running", tone: "is-running", help: "Striff is still reviewing this commit." };
  }
  if (check.rulesBroken > 0) {
    return { label: `Breaks ${check.rulesBroken} rule${check.rulesBroken === 1 ? "" : "s"}`, tone: "is-broken", help: "This change breaks rules your docs state." };
  }
  if (check.rulesHeld > 0 || check.rulesAlreadyBroken > 0) {
    return { label: "Keeps your rules", tone: "is-holds", help: "This change breaks none of the rules it touches." };
  }
  return { label: "No rules touched", tone: "is-muted", help: "None of your documented rules bear on this change." };
}

/** When a check was made: the day, and the time on it, since several can land on one day. */
function checkedAt(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChecksTab({
  installationId,
  repo,
  sample,
}: {
  installationId: number;
  repo: string;
  /** Fixed pages to show instead of asking the API, for the demo. */
  sample?: (page: number) => ChecksPage;
}) {
  const [page, setPage] = useState(0);
  const [answer, setAnswer] = useState<ChecksPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [owner, name] = repo.split("/");

  useEffect(() => setPage(0), [repo]);

  useEffect(() => {
    if (!repo) return;
    if (sample) {
      setAnswer(sample(page));
      return;
    }
    let current = true;
    setLoading(true);
    setError("");
    fetch(
      `/.netlify/functions/doc-catalog-proxy?view=checks&page=${page}&installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
    )
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!current) return;
        if (!res.ok) {
          setError(data.message || data.error || "Couldn't load the checks.");
          return;
        }
        setAnswer(data);
      })
      .catch(() => current && setError("Couldn't load the checks."))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [installationId, repo, page]);

  if (!repo) {
    return <p className="dashboard-metric-caption">Pick a repository to see its checks.</p>;
  }

  const checks = answer?.checks || [];
  const pages = answer?.pages || 1;

  return (
    <div className="checks-tab">
      <div className="checks-head">
        <div>
          <p className="dashboard-kicker">Checks</p>
          <h2 className="checks-title">{repo}</h2>
          <p className="checks-lede">
            The checks Striff ran on this repository's pull requests, newest first. The last 50
            are listed.
          </p>
        </div>
      </div>

      {error && <p className="dashboard-inline-error">{error}</p>}
      {!answer && loading && <p className="dashboard-metric-caption">Loading checks…</p>}
      {answer && checks.length === 0 && !loading && (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            No checks yet. Striff checks a pull request when one is opened or updated in this
            repository.
          </p>
        </div>
      )}

      {checks.length > 0 && (
        <ol className={`checks-list${loading ? " is-loading" : ""}`}>
          {checks.map((check) => {
            const verdict = verdictOf(check);
            const checked = check.rulesHeld + check.rulesBroken + check.rulesAlreadyBroken;
            // What the check did, beside what it concluded: the work is the reason to look.
            const facts = [
              check.docsRead != null && check.docsRead > 0
                ? `${check.docsRead} doc${check.docsRead === 1 ? "" : "s"} read`
                : null,
              check.changedComponents != null
                ? `${check.changedComponents} component${check.changedComponents === 1 ? "" : "s"} changed`
                : null,
              check.diagrams != null && check.diagrams > 0
                ? `${check.diagrams} diagram${check.diagrams === 1 ? "" : "s"} drawn`
                : null,
            ].filter(Boolean);
            return (
              <li key={`${check.pullNo}-${check.headSha}-${check.checkedAtMs}`} className="check-row">
                <div className="check-main">
                  <div className="check-line">
                    <a
                      className="check-pr"
                      href={check.pullUrl || `https://github.com/${repo}/pull/${check.pullNo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{check.pullNo}
                    </a>
                    {check.headSha && <code className="check-sha">{check.headSha.slice(0, 7)}</code>}
                    <span className="check-when">{checkedAt(check.checkedAtMs)}</span>
                  </div>
                  <p className="check-headline">
                    {check.headline
                      || (verdict.tone === "is-running"
                        ? "Striff is reviewing this commit."
                        : "No summary was written for this check.")}
                  </p>
                  {facts.length > 0 && <p className="check-facts">{facts.join(" · ")}</p>}
                </div>
                {/* The rules a check held the change to, and how each came out: the number a
                    reader came to this page for, so it is the largest thing on the row. */}
                <div className={`check-rules${checked === 0 ? " is-none" : ""}`}>
                  <b>{verdict.tone === "is-running" ? "…" : checked}</b>
                  <span className="check-rules-label">rule{checked === 1 ? "" : "s"} checked</span>
                  {checked > 0 && (
                    <span className="check-rules-split">
                      {check.rulesHeld > 0 && <i className="is-holds">{check.rulesHeld} kept</i>}
                      {check.rulesBroken > 0 && <i className="is-broken">{check.rulesBroken} broken</i>}
                      {check.rulesAlreadyBroken > 0 && (
                        <i className="is-prior">{check.rulesAlreadyBroken} already broken</i>
                      )}
                    </span>
                  )}
                </div>
                <div className="check-side">
                  <span className={`check-verdict ${verdict.tone}`} title={verdict.help}>
                    {verdict.label}
                  </span>
                  <a
                    className="check-open"
                    href={check.pullUrl || `https://github.com/${repo}/pull/${check.pullNo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View pull request
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pages > 1 && (
        <nav className="checks-pager" aria-label="Pages of checks">
          <button
            type="button"
            className="dashboard-button dashboard-button-secondary"
            disabled={page === 0 || loading}
            onClick={() => setPage(page - 1)}
          >
            Newer
          </button>
          <span className="checks-page">
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            className="dashboard-button dashboard-button-secondary"
            disabled={page >= pages - 1 || loading}
            onClick={() => setPage(page + 1)}
          >
            Older
          </button>
        </nav>
      )}
    </div>
  );
}
