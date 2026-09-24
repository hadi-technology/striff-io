import { createElement, useState, useEffect } from "react";
import MetricsTab, { type OrgMetricsData } from "./MetricsTab";
import DocsTab from "./DocsTab";

const OAUTH_CLIENT_ID =
  typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_GITHUB_OAUTH_CLIENT_ID
    ? import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID
    : "";

interface User {
  login: string;
  avatar_url: string;
  name: string | null;
}

interface Repo {
  full_name: string;
  private: boolean;
  html_url: string;
}

interface Installation {
  id: number;
  account: { login: string; avatar_url: string; type?: string };
  repository_selection: string;
  repositories?: Repo[];
}

interface BillingInfo {
  hasSubscription: boolean;
  planName?: string;
  status?: string;
  portalUrl?: string;
  connectedPrivateRepoCount?: number;
  activeRepoCountThisPeriod?: number;
  billedTier?: string;
  activeRepoNamesThisPeriod?: string[];
  periodStartMs?: number;
  periodEndMs?: number;
  repoLimit?: number;
  // What the subscription actually bills each period; null when unknown or unsubscribed.
  monthlyPriceCents?: number | null;
  priceCurrency?: string | null;
}

const PLANS = [
  { id: "starter", name: "Starter", price: "$29/mo", repos: "Up to 5 active repos", cap: 5 },
  { id: "team", name: "Team", price: "$59/mo", repos: "Up to 15 active repos", cap: 15 },
  { id: "scale", name: "Scale", price: "$149/mo", repos: "Up to 50 active repos", cap: 50 },
] as const;

function formatPeriodEnd(periodEndMs?: number): string | null {
  if (!periodEndMs) return null;
  return new Date(periodEndMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// en-US to match the plan cards' "$29/mo"; the browser's locale would render USD as "US$29" or "29 $".
function formatPrice(cents: number, currency?: string | null): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// A 401 from the billing or metrics proxy means the GitHub session or the billing token has
// expired; signing in again issues a fresh one. A 401 again soon after a fresh sign-in means signing
// in does not fix it, and redirecting again would loop through GitHub, so onBlocked shows an error.
const REAUTH_STORAGE_KEY = "striff_reauth_at";
const REAUTH_WINDOW_MS = 2 * 60 * 1000;

function signInAgain(onBlocked: () => void) {
  let lastReauthAt = 0;
  try {
    lastReauthAt = Number(sessionStorage.getItem(REAUTH_STORAGE_KEY)) || 0;
  } catch {
    // Storage unavailable: fall through and redirect.
  }
  if (Date.now() - lastReauthAt < REAUTH_WINDOW_MS) {
    onBlocked();
    return;
  }
  try {
    sessionStorage.setItem(REAUTH_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: redirect anyway.
  }
  window.location.href = getOAuthUrl();
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoCheckout, setAutoCheckout] = useState<{ installationId: number; plan: string } | null>(null);
  const [section, setSection] = useState<"repos" | "docs" | "metrics" | "billing">("repos");
  // Which repository the documents view is showing; set by opening one from Repositories.
  const [openRepo, setOpenRepo] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setError("");
    setLoading(true);
    try {
      const statusRes = await fetch("/.netlify/functions/auth-status");
      // An outage, a cold start or a proxy error page all return HTML here, and .json() then
      // throws a parser message ("Unexpected token '<'...") that used to be shown to the
      // customer verbatim. Decide on the content type instead of guessing from the exception.
      const contentType = statusRes.headers.get("content-type") || "";
      if (!statusRes.ok || !contentType.includes("application/json")) {
        throw new Error("UNREACHABLE");
      }
      const status = await statusRes.json();
      if (!status.authenticated) {
        window.location.href = getOAuthUrl();
        return;
      }
      setUser(status.user);

      const installs = await fetchAllPages("/user/installations", "installations");
      const withRepos = await Promise.all(
        installs.map(async (inst: Installation) => {
          try {
            const repositories = await fetchAllPages(`/user/installations/${inst.id}/repositories`, "repositories");
            return { ...inst, repositories };
          } catch {
            return { ...inst, repositories: [] };
          }
        })
      );
      setInstallations(withRepos);

      // Fire-and-forget: reports the user's primary email to the backend for each installation.
      // Covers installs made while already signed in, which never re-run the OAuth callback's
      // capture; the backend dedups and sends any pending welcome email on first capture.
      fetch("/.netlify/functions/email-sync", { method: "POST" }).catch(() => {});

      const params = new URLSearchParams(window.location.search);
      const planParam = params.get("plan");
      const instIdParam = params.get("installation_id");
      if (planParam && instIdParam) {
        setAutoCheckout({ installationId: Number(instIdParam), plan: planParam });
        window.history.replaceState({}, "", "/dashboard");
      }
    } catch (e: any) {
      // Raw exception text is for the console, not for a customer looking at a billing page.
      console.error("Dashboard failed to load", e);
      setError(
        e?.message === "UNREACHABLE"
          ? "We couldn't reach Striff just now. This is on our side, not yours, and your installations and subscription are unaffected."
          : "Something went wrong loading your dashboard. Your installations and subscription are unaffected."
      );
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    window.location.href = "/.netlify/functions/auth-logout";
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner" aria-hidden="true" />
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="dashboard-error-state">
        <h1 className="dashboard-error-title">We can't load your dashboard right now</h1>
        <p className="dashboard-error-body">{error}</p>
        <div className="dashboard-error-actions">
          <button type="button" onClick={init} className="dashboard-button dashboard-button-primary">
            Try again
          </button>
          <a href="/contact" className="dashboard-button dashboard-button-secondary">
            Contact support
          </a>
          <a href="/" className="dashboard-button dashboard-button-secondary">
            Back to homepage
          </a>
        </div>
        <p className="dashboard-error-foot">
          Reviews keep running on your pull requests whether or not this page loads. Nothing here
          affects the checks Striff posts on GitHub.
        </p>
      </div>
    );
  }

  const current =
    installations.find((inst) => inst.id === accountId) || installations[0] || null;

  return (
    <div className="dashboard-shell">
      {/* Installations */}
      {installations.length === 0 ? (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            Striff isn't installed on any of your repositories yet. Install the GitHub App to start
            analyzing pull requests. Public repos are free.
          </p>
          <a
            href="https://github.com/apps/striff-app/installations/new"
            className="dashboard-button dashboard-button-primary mt-4 inline-block"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Striff on GitHub
          </a>
        </div>
      ) : (
        <div className="dash-shell">
          <aside className="dash-side">
            <p className="nav-label">Account</p>
            {installations.length > 1 ? (
              <select
                className="dash-account-select"
                value={String(current.id)}
                onChange={(event) => setAccountId(Number(event.target.value))}
              >
                {installations.map((inst) => (
                  <option key={inst.id} value={String(inst.id)}>
                    {inst.account.login}
                  </option>
                ))}
              </select>
            ) : (
              <p className="dash-account-name">{current.account.login}</p>
            )}
            <nav className="dash-nav">
              {([
                ["metrics", "Overview", "overview", ""],
                ["repos", "Repositories", "repos", String((current.repositories || []).length)],
                ["billing", "Billing", "billing", ""],
              ] as const).map(([key, label, icon, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`nav-item${section === key ? " active" : ""}`}
                  onClick={() => setSection(key)}
                >
                  <NavIcon name={icon} />
                  <span>{label}</span>
                  {count && <span className="nav-count">{count}</span>}
                </button>
              ))}
            </nav>
            {openRepo && (
              <div className="dash-repo-group">
                <p className="nav-label">Repository</p>
                <p className="dash-repo-name" title={openRepo}>
                  {openRepo.split("/")[1] || openRepo}
                </p>
                <nav className="dash-nav">
                  <button
                    type="button"
                    className={`nav-item${section === "docs" ? " active" : ""}`}
                    onClick={() => setSection("docs")}
                  >
                    <NavIcon name="docs" />
                    <span>Docs &amp; rules</span>
                  </button>
                </nav>
              </div>
            )}
            <div className="dash-side-foot">
              <a
                href="https://github.com/apps/striff-app/installations/new"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-item"
              >
                <NavIcon name="repos" />
                <span>Add an account</span>
              </a>
              <button type="button" className="nav-item" onClick={signOut}>
                <NavIcon name="billing" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
          <div className="dash-main">
            <InstallationCard
              key={current.id}
              installation={current}
              onError={setError}
              autoPlan={autoCheckout?.installationId === current.id ? autoCheckout.plan : null}
              onAutoPlanConsumed={() => setAutoCheckout(null)}
              section={section}
              onSection={setSection}
              openRepo={openRepo}
              onOpenRepo={(fullName) => {
                setOpenRepo(fullName);
                setSection("docs");
              }}
            />
          </div>
        </div>
      )}

      {error && <p className="dashboard-inline-error">{error}</p>}

      {/* FAQ: asked when someone is looking at what they pay, not at their documents. */}
      {(installations.length === 0 || section === "billing") && <FaqSection />}
    </div>
  );
}


const NavIcon = ({ name }: { name: string }) => {
  const paths: Record<string, any> = {
    overview: ["M2 2h5v5H2z", "M9 2h5v5H9z", "M2 9h5v5H2z", "M9 9h5v5H9z"],
    repos: ["M3 12.75V2.75A1.25 1.25 0 0 1 4.25 1.5H13v10H4.25A1.25 1.25 0 0 0 3 12.75Z", "M3 12.75A1.25 1.25 0 0 0 4.25 14H13v-2.5"],
    docs: ["M3.5 1.75h5.5l3.5 3.5v9h-9Z", "m5.75 9.5 1.5 1.5 3-3"],
    billing: ["M1.5 3.5h13v9h-13z", "M1.5 6.5h13"],
  };
  return createElement(
    "svg",
    { viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    ...(paths[name] || []).map((d: string, i: number) => createElement("path", { key: i, d }))
  );
};

/* ─── Installation Card ─────────────────────────────────────────── */

function InstallationCard({
  installation,
  onError,
  autoPlan,
  onAutoPlanConsumed,
  section,
  onSection,
  openRepo,
  onOpenRepo,
}: {
  installation: Installation;
  onError: (msg: string) => void;
  autoPlan: string | null;
  onAutoPlanConsumed: () => void;
  section?: "repos" | "docs" | "metrics" | "billing";
  onSection?: (section: "repos" | "docs" | "metrics" | "billing") => void;
  openRepo?: string | null;
  onOpenRepo?: (fullName: string) => void;
}) {
  const repos = installation.repositories || [];
  const privateRepos = repos.filter((r) => r.private);
  const publicRepos = repos.filter((r) => !r.private);
  const [repoTab, setRepoTab] = useState<"private" | "public">(
    privateRepos.length > 0 ? "private" : "public"
  );
  const [billingState, setBillingState] = useState<"idle" | "loading">("idle");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [billingError, setBillingError] = useState(false);
  const [ownTab, setOwnTab] = useState<"repos" | "docs" | "metrics" | "billing">("repos");
  // The sidebar owns the section when the shell passes one; the card keeps its own otherwise.
  const installTab = section ?? ownTab;
  const setInstallTab = onSection ?? setOwnTab;
  const [metrics, setMetrics] = useState<OrgMetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");

  useEffect(() => {
    fetchBillingInfo();
    // Fetched on mount (not lazily on tab open) because the Repositories tab's "Active" badges
    // derive from metrics.activeRepos; lazy loading meant they never appeared until the user
    // happened to visit the Metrics tab.
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (installTab === "metrics" && !metrics && !metricsLoading) {
      fetchMetrics();
    }
    // Refetch on opening Billing while unsubscribed: the cached status may predate a checkout
    // that completed in another tab or before Stripe's webhook synced, and showing the plan
    // picker to a subscribed customer invites a confusing already-subscribed rejection.
    if (installTab === "billing" && !billingInfo?.hasSubscription) {
      fetchBillingInfo();
    }
  }, [installTab]);

  async function fetchMetrics() {
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const res = await fetch(
        `/.netlify/functions/metrics-proxy?installation_id=${installation.id}&months=6`
      );
      const data = await res.json();
      if (res.status === 401) {
        signInAgain(() => setMetricsError(data.error || "Failed to load metrics"));
        return;
      }
      if (!res.ok) {
        setMetricsError(data.error || "Failed to load metrics");
        return;
      }
      setMetrics(data);
    } catch {
      setMetricsError("Failed to load metrics");
    } finally {
      setMetricsLoading(false);
    }
  }

  async function fetchBillingInfo() {
    setBillingError(false);
    try {
      const res = await fetch("/.netlify/functions/billing-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          installation_id: installation.id,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        signInAgain(() => setBillingError(true));
        return;
      }
      // An error payload must not land in billingInfo: hasSubscription would read as false and
      // show a subscribed customer the plan picker during an API hiccup.
      if (!res.ok) {
        setBillingError(true);
        return;
      }
      setBillingInfo(data);
    } catch {
      setBillingError(true);
    }
  }

  useEffect(() => {
    if (autoPlan && billingState === "idle" && !checkoutLoading) {
      setInstallTab("billing");
      handleCheckout(autoPlan);
      onAutoPlanConsumed();
    }
  }, [autoPlan]);

  async function handleBilling() {
    if (billingInfo?.portalUrl) {
      window.location.href = billingInfo.portalUrl;
      return;
    }
    setBillingState("loading");
    try {
      const res = await fetch("/.netlify/functions/billing-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "portal",
          installation_id: installation.id,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        signInAgain(() => {
          onError(data.error || "Failed to open billing");
          setBillingState("idle");
        });
        return;
      }
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        // e.g. 403: only an admin of the account may manage its billing.
        onError(data.error || "Failed to open billing");
        setBillingState("idle");
      }
    } catch {
      onError("Failed to check billing status");
      setBillingState("idle");
    }
  }

  async function handleCheckout(plan: string) {
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/.netlify/functions/billing-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          installation_id: installation.id,
          plan,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (res.status === 401) {
        signInAgain(() => onError(data.error || "Failed to create checkout session"));
      } else if (res.status === 409) {
        // Already subscribed: our cached billing state is stale. Refetch so the tab swaps the
        // plan picker for the usage panel and Manage billing button instead of dead-ending.
        await fetchBillingInfo();
      } else {
        onError(data.error || "Failed to create checkout session");
        setBillingState("idle");
      }
    } catch {
      onError("Failed to start checkout");
      setBillingState("idle");
    } finally {
      setCheckoutLoading(null);
    }
  }

  const manageReposUrl = installation.account?.type === "Organization"
    ? `https://github.com/organizations/${installation.account.login}/settings/installations/${installation.id}`
    : `https://github.com/settings/installations/${installation.id}`;

  const hasNoPlan = billingInfo && !billingInfo.hasSubscription && privateRepos.length > 0;
  const displayedRepos = repoTab === "private" ? privateRepos : publicRepos;

  return (
    <div className={section === undefined ? "dashboard-installation-card" : "dashboard-section"}>
      {/* Header row: rendered only when this card stands alone; the shell's sidebar names the
          account otherwise, and a hidden attribute would lose to the flex display. */}
      {section === undefined && (
      <div className="dashboard-installation-head">
        <div className="flex items-center gap-3">
          <img src={installation.account.avatar_url} alt={installation.account.login} className="h-9 w-9 rounded-lg border border-slate-200" />
          <div>
            <h2 className="text-lg font-bold text-slate-950">{installation.account.login}</h2>
            <p className="text-xs text-slate-500">
              Installation #{installation.id} · {installation.repository_selection === "all" ? "All repositories" : "Selected repositories"}
            </p>
          </div>
        </div>
        {billingInfo?.hasSubscription && billingInfo.planName && (
          <span className="dashboard-plan-badge">
            {billingInfo.planName}
          </span>
        )}
      </div>
      )}

      {/* No-plan prompt for private repos */}
      {hasNoPlan && installTab !== "billing" && (
        <div className="dashboard-plan-notice">
          <div className="dashboard-plan-notice-body">
            <p className="dashboard-plan-notice-title">
              Activate {privateRepos.length} private repo{privateRepos.length > 1 ? "s" : ""}
            </p>
            <p className="dashboard-plan-notice-sub">
              Private pull requests need a paid plan before Striff can analyze them. Public repos are
              always free.
            </p>
          </div>
          <button
            onClick={() => setInstallTab("billing")}
            className="dashboard-button dashboard-button-primary shrink-0"
          >
            View plans
          </button>
        </div>
      )}

      {/* Repositories / Metrics / Billing tabs, when the sidebar is not driving them */}
      <div className={section === undefined ? "mt-5" : ""}>
          {section === undefined && (
          <div className="dashboard-tabs">
            <button
              onClick={() => setInstallTab("repos")}
              className={`dashboard-tab ${installTab === "repos" ? "dashboard-tab-active" : ""}`}
            >
              Repositories
            </button>
            <button
              onClick={() => setInstallTab("docs")}
              className={`dashboard-tab ${installTab === "docs" ? "dashboard-tab-active" : ""}`}
            >
              Docs &amp; rules
            </button>
            <button
              onClick={() => setInstallTab("metrics")}
              className={`dashboard-tab ${installTab === "metrics" ? "dashboard-tab-active" : ""}`}
            >
              Metrics
            </button>
            <button
              onClick={() => setInstallTab("billing")}
              className={`dashboard-tab ${installTab === "billing" ? "dashboard-tab-active" : ""}`}
            >
              Billing
            </button>
          </div>
          )}

          {installTab === "repos" ? (
            <div className="dashboard-metric-fade-in">
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="dashboard-tabs">
                  <button
                    onClick={() => setRepoTab("private")}
                    className={`dashboard-tab ${
                      repoTab === "private"
                        ? "dashboard-tab-active"
                        : ""
                    }`}
                  >
                    Private ({privateRepos.length})
                  </button>
                  <button
                    onClick={() => setRepoTab("public")}
                    className={`dashboard-tab ${
                      repoTab === "public"
                        ? "dashboard-tab-active"
                        : ""
                    }`}
                  >
                    Public ({publicRepos.length})
                  </button>
                </div>
                <a
                  href={manageReposUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-button dashboard-button-secondary"
                >
                  Manage repos
                </a>
              </div>

              {/* Repo grid */}
              {displayedRepos.length > 0 ? (
                <div className="dashboard-repo-grid">
                  {displayedRepos.map((repo) => {
                    const [repoOwner, repoName] = repo.full_name.split("/");
                    const isActive = metrics?.activeRepos.some(
                      (r) => r.repoOwner === repoOwner && r.repoName === repoName && r.active
                    );
                    return (
                      <div key={repo.full_name} className={`dashboard-repo-link ${repo.private ? "dashboard-repo-private" : "dashboard-repo-public"}`}>
                        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${repo.private ? "bg-amber-500" : "bg-emerald-600"}`} />
                        {onOpenRepo ? (
                          <button
                            type="button"
                            className="dashboard-repo-open"
                            onClick={() => onOpenRepo(repo.full_name)}
                          >
                            {repo.full_name}
                          </button>
                        ) : (
                          <span className="truncate text-slate-700">{repo.full_name}</span>
                        )}
                        {isActive && (
                          <span className="dashboard-plan-badge ml-auto shrink-0" title="Actively analyzed by Striff">
                            {"\u2713"} Active
                          </span>
                        )}
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dashboard-repo-github"
                          aria-label={`${repo.full_name} on GitHub`}
                        >
                          GitHub
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 px-3 py-6 text-center text-sm text-slate-500">
                  No {repoTab} repositories enabled
                  {repoTab === "private" && (
                    <>
                      {" \u2014 "}
                      <a href={manageReposUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        add private repos
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          ) : installTab === "docs" ? (
            <div className="mt-3 dashboard-metric-fade-in">
              <DocsTab installationId={installation.id} repos={repos} openRepo={openRepo} />
            </div>
          ) : installTab === "metrics" ? (
            <div className="mt-3 dashboard-metric-fade-in">
              <MetricsTab data={metrics} loading={metricsLoading} error={metricsError} />
            </div>
          ) : (
            <div className="mt-3 dashboard-metric-fade-in">
              {!billingInfo ? (
                billingError ? (
                  <p className="mt-3 px-3 py-6 text-center text-sm text-slate-500">
                    Couldn't load billing info.{" "}
                    <button onClick={fetchBillingInfo} className="font-semibold text-blue-600 hover:underline">
                      Retry
                    </button>
                  </p>
                ) : (
                  <p className="mt-3 px-3 py-6 text-center text-sm text-slate-500">Loading billing…</p>
                )
              ) : billingInfo.hasSubscription ? (
                <>
                  <UsagePanel installation={installation} billingInfo={billingInfo} privateRepoCount={privateRepos.length} />
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={handleBilling}
                      disabled={billingState !== "idle"}
                      className="dashboard-button dashboard-button-primary disabled:opacity-50"
                    >
                      {billingState === "loading" ? "Loading..." : "Manage billing"}
                    </button>
                    <p className="text-sm text-slate-500">
                      Invoices, payment methods, and cancellation are handled in the Stripe portal.
                    </p>
                  </div>
                </>
              ) : (
                <div className="dashboard-plan-picker mt-3">
                  <h3 className="text-sm font-bold text-slate-900">Choose a plan</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Private repo analysis requires a paid plan. Public repos are always free.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {PLANS.map((plan) => (
                      <div key={plan.id} className="dashboard-plan-option">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{plan.name}</p>
                        <p className="mt-1 text-lg font-black text-slate-950">{plan.price}</p>
                        <p className="text-xs text-slate-500">{plan.repos}</p>
                        <button
                          onClick={() => handleCheckout(plan.id)}
                          disabled={checkoutLoading === plan.id}
                          className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {checkoutLoading === plan.id ? "Loading..." : "Subscribe"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

/* ─── Usage Panel ───────────────────────────────────────────────── */

const TIER_ORDER = ["FREE", "STARTER", "TEAM", "SCALE", "ENTERPRISE"] as const;
const TIER_CAPS: Record<string, number | null> = { FREE: 0, STARTER: 5, TEAM: 15, SCALE: 50, ENTERPRISE: null };

function nextTierLabel(tier?: string): string | null {
  if (!tier) return null;
  const idx = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

function capitalizeTier(tier?: string): string {
  if (!tier) return "";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function UsagePanel({
  billingInfo,
  privateRepoCount,
}: {
  installation: Installation;
  billingInfo: BillingInfo;
  privateRepoCount: number;
}) {
  const activeCount = billingInfo.activeRepoCountThisPeriod ?? 0;
  const cap = billingInfo.billedTier ? TIER_CAPS[billingInfo.billedTier] : null;
  const nextTier = nextTierLabel(billingInfo.billedTier);
  const periodEnd = formatPeriodEnd(billingInfo.periodEndMs);
  const activeNames = billingInfo.activeRepoNamesThisPeriod || [];

  return (
    <div className="dashboard-usage-panel">
      <p className="text-sm font-semibold text-slate-900">
        Usage this billing period{periodEnd ? ` · resets ${periodEnd}` : ""}
      </p>
      <div className="dashboard-usage-stats">
        <div>
          <p className="dashboard-usage-stat-label">Enabled</p>
          <p className="dashboard-usage-stat-value">{privateRepoCount}</p>
        </div>
        <div>
          <p className="dashboard-usage-stat-label">Active this period</p>
          <p className="dashboard-usage-stat-value">{activeCount}</p>
        </div>
        <div>
          <p className="dashboard-usage-stat-label">Billed as</p>
          <p className="dashboard-usage-stat-value">{capitalizeTier(billingInfo.billedTier)}</p>
        </div>
        {billingInfo.monthlyPriceCents != null && (
          <div>
            <p className="dashboard-usage-stat-label">You pay</p>
            <p className="dashboard-usage-stat-value">
              {formatPrice(billingInfo.monthlyPriceCents, billingInfo.priceCurrency)}/mo
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Only repos that generate a diagram count toward your bill.
        {cap ? ` ${activeCount} of ${cap} before ${capitalizeTier(nextTier || "")}.` : ""}
      </p>
      {activeNames.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Active repos: </span>
          {activeNames.join(", ")}
        </p>
      )}
    </div>
  );
}

/* ─── FAQ Section ───────────────────────────────────────────────── */

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  const items: { q: string; a: string }[] = [
    {
      q: "How does Striff pricing work?",
      a: "<b>Public repositories are completely free</b> \u2014 no limits, no credit card required. Private repositories need a paid plan (Starter, Team, or Scale). Each tier has a flat monthly price, but the tier you land on is based on <b>how many repos actually generated a diagram during your billing period</b> \u2014 not how many you've connected. Connect as many private repos as you want; you're only billed for the ones that produce a diagram. Full tier details are on the <a href=\"/pricing\" class=\"font-semibold text-blue-600 hover:underline\">pricing page</a>.",
    },
    {
      q: "What makes a repo billable?",
      a: "A repo counts toward your bill only when it <b>produces at least one architectural diagram</b> during your current billing period. Simply connecting a repo to the GitHub App is free \u2014 it only becomes billable once a pull request triggers a diagram.",
    },
    {
      q: "I enabled 20 repos but only 3 were active \u2014 what do I pay?",
      a: "You'd be billed for <b>3 active repos</b>, which falls in the Starter tier ($29/mo) \u2014 not Scale, even though 20 repos are connected. The \"Usage this billing period\" panel on your installation card shows exactly how many repos are active and which tier that puts you in.",
    },
    {
      q: "Will I be charged automatically if I add more repos?",
      a: "<b>Not just for connecting them.</b> Adding private repos to your Striff installation doesn't change your bill by itself \u2014 only repos that go on to generate a diagram count. Your tier then adjusts <b>automatically in both directions</b>: if more repos were active than your tier covers you're upgraded, and if fewer were active you're downgraded \u2014 a fully quiet month drops to <b>$0</b>. Changes are never charged mid-period; the adjusted tier applies from your next invoice.",
    },
    {
      q: "How do I enable Striff on private repositories?",
      a: "Open the <b>Repositories</b> tab on your installation card and click <b>\"Manage repos\"</b> to open GitHub\u2019s App settings, where you can grant Striff access to specific private repositories. Then pick a plan in the <b>Billing</b> tab to enable analysis on private pull requests.",
    },
    {
      q: "When will I be charged?",
      a: "You are charged <b>on the day you subscribe</b>, then on the same date each month. You can see your next billing date and manage payment methods in the Stripe Customer Portal (the <b>Billing</b> tab on your installation card).",
    },
    {
      q: "How do I stop being charged?",
      a: "Open the <b>Billing</b> tab on your installation card and click <b>\"Manage billing\"</b> to open the Stripe portal and cancel your subscription. <b>You keep access until the end of your current billing period</b> \u2014 there is no immediate cutoff. You can also remove all private repos from the GitHub App settings to avoid any future need for a paid plan.",
    },
    {
      q: "What happens if I cancel my subscription?",
      a: "<b>Public repository analysis continues for free</b> \u2014 that never changes. Private repository analysis is paused until you re-subscribe. Your data is retained, and you can reactivate at any time.",
    },
    {
      q: "Which languages does Striff support?",
      a: "Diagrams run on <b>Java, TypeScript, Python and C#</b>, with Go coming. Documented rules are further along on some than others: <b>Java and C# are production-ready</b>, Python extracts rules from your docs but cannot yet answer all of them, and TypeScript is still being proven out. Every language is parsed into a full structural model, not regex or text matching.",
    },
    {
      q: "What does Striff actually do on my pull requests?",
      a: "For each PR, Striff reads the architecture your repository already documents \u2014 ARCHITECTURE.md, ADRs, READMEs and design notes \u2014 turns each sentence about the code into a rule, and checks it against both revisions of the change, quoting the sentence and the line it came from. Alongside the rules it posts a <b>diagram of what changed</b> and <b>AI review notes</b> on the components the PR touched. Results appear as a single <b>GitHub check-run</b>. Install the <a href=\"/#extension\" class=\"font-semibold text-blue-600 hover:underline\">browser extension</a> to see the same review beside the dependency diagram.",
    },
    {
      q: "What is the browser extension?",
      a: "The <a href=\"https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"font-semibold text-blue-600 hover:underline\">Striff browser extension</a> shows <b>interactive architectural diagrams</b> directly on GitHub, with the repository\u2019s own <b>documented rules checked</b> and listed beside it, one click away. You can switch between code and architecture views, focus on specific components, and <b>post subdiagrams as PR comments</b> for your team. There\u2019s a walkthrough video <a href=\"/#extension\" class=\"font-semibold text-blue-600 hover:underline\">on the homepage</a>.",
    },
  ];

  return (
    <div className="dashboard-faq">
      <h2 className="text-xl font-bold text-slate-950">Frequently asked questions</h2>
      <div className="mt-4 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="dashboard-faq-item">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-medium text-slate-900">{item.q}</span>
              <svg
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open === i && (
              <div
                className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600"
                dangerouslySetInnerHTML={{ __html: item.a }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Utility ───────────────────────────────────────────────────── */

// GitHub caps pages at 100 items; a single fetch silently truncated orgs with >100 repos or
// users with >100 installations. Follows pages until a short page; capped at 5 (500 items) to
// bound dashboard load time.
async function fetchAllPages(path: string, listKey: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      "/.netlify/functions/github-proxy?path=" + encodeURIComponent(`${path}?per_page=100&page=${page}`)
    );
    const data = await res.json();
    const items = data[listKey] || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

function getOAuthUrl() {
  // Double-submit state: auth-callback compares this cookie against the state GitHub echoes
  // back, so a forged callback URL can't log the visitor into an attacker's account.
  const state = crypto.randomUUID();
  document.cookie = `gh_oauth_state=${state}; path=/; max-age=600; secure; samesite=lax`;
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    scope: "read:user,user:email",
    redirect_uri: `${window.location.origin}/.netlify/functions/auth-callback`,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}
