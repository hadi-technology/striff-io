import { createElement, useState, useEffect } from "react";
import MetricsTab, { type OrgMetricsData } from "./MetricsTab";

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
}

const PLANS = [
  { id: "starter", name: "Starter", price: "$29/mo", repos: "Up to 5 private repos" },
  { id: "team", name: "Team", price: "$59/mo", repos: "Up to 15 private repos" },
  { id: "scale", name: "Scale", price: "$149/mo", repos: "Up to 50 private repos" },
] as const;

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoCheckout, setAutoCheckout] = useState<{ installationId: number; plan: string } | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const statusRes = await fetch("/.netlify/functions/auth-status");
      const status = await statusRes.json();
      if (!status.authenticated) {
        window.location.href = getOAuthUrl();
        return;
      }
      setUser(status.user);

      const installationsRes = await fetch(
        "/.netlify/functions/github-proxy?path=" +
          encodeURIComponent("/user/installations?per_page=100")
      );
      const installationsData = await installationsRes.json();

      const installs = installationsData.installations || [];
      const withRepos = await Promise.all(
        installs.map(async (inst: Installation) => {
          try {
            const reposRes = await fetch(
              "/.netlify/functions/github-proxy?path=" +
                encodeURIComponent(`/user/installations/${inst.id}/repositories?per_page=100`)
            );
            const reposData = await reposRes.json();
            return { ...inst, repositories: reposData.repositories || [] };
          } catch {
            return { ...inst, repositories: [] };
          }
        })
      );
      setInstallations(withRepos);

      const params = new URLSearchParams(window.location.search);
      const planParam = params.get("plan");
      const instIdParam = params.get("installation_id");
      if (planParam && instIdParam) {
        setAutoCheckout({ installationId: Number(instIdParam), plan: planParam });
        window.history.replaceState({}, "", "/dashboard");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    window.location.href = "/.netlify/functions/auth-logout";
  }

  if (loading) {
    return (
      <div class="dashboard-loading">
        <div class="dashboard-spinner" aria-hidden="true" />
        <div class="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div class="dashboard-alert dashboard-alert-danger">
        <p class="text-red-700">{error}</p>
        <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to homepage
        </a>
      </div>
    );
  }

  return (
    <div class="dashboard-shell">
      {/* Header */}
      <div class="dashboard-account-bar">
        <div class="flex items-center gap-4">
          {user && (
            <img src={user.avatar_url} alt={user.login} class="h-11 w-11 rounded-lg border border-slate-200" />
          )}
          <div>
            <p class="dashboard-kicker">Striff account</p>
            <h1 class="text-2xl font-bold text-slate-950">{user?.name || user?.login}</h1>
            <p class="text-sm text-slate-500">@{user?.login}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          class="dashboard-button dashboard-button-secondary"
        >
          Sign out
        </button>
      </div>

      {/* Installations */}
      {installations.length === 0 ? (
        <div class="dashboard-empty">
          <p class="text-slate-600">No Striff installations found.</p>
          <a
            href="https://github.com/apps/striff-app/installations/new"
            class="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Striff on a repository
          </a>
        </div>
      ) : (
        <div class="mt-8 space-y-5">
          {installations.map((inst) => (
            <InstallationCard
              key={inst.id}
              installation={inst}
              onError={setError}
              autoPlan={autoCheckout?.installationId === inst.id ? autoCheckout.plan : null}
              onAutoPlanConsumed={() => setAutoCheckout(null)}
            />
          ))}
        </div>
      )}

      {error && <p class="dashboard-inline-error">{error}</p>}

      {/* FAQ */}
      <FaqSection />
    </div>
  );
}

/* ─── Installation Card ─────────────────────────────────────────── */

function InstallationCard({
  installation,
  onError,
  autoPlan,
  onAutoPlanConsumed,
}: {
  installation: Installation;
  onError: (msg: string) => void;
  autoPlan: string | null;
  onAutoPlanConsumed: () => void;
}) {
  const repos = installation.repositories || [];
  const privateRepos = repos.filter((r) => r.private);
  const publicRepos = repos.filter((r) => !r.private);
  const [repoTab, setRepoTab] = useState<"private" | "public">(
    privateRepos.length > 0 ? "private" : "public"
  );
  const [billingState, setBillingState] = useState<"idle" | "loading" | "subscribe">("idle");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [installTab, setInstallTab] = useState<"repos" | "metrics">("repos");
  const [metrics, setMetrics] = useState<OrgMetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");

  useEffect(() => {
    fetchBillingInfo();
  }, []);

  useEffect(() => {
    if (installTab === "metrics" && !metrics && !metricsLoading) {
      fetchMetrics();
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
      setBillingInfo(data);
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    if (autoPlan && billingState === "idle" && !checkoutLoading) {
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
      setBillingInfo(data);
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else if (!data.hasSubscription) {
        setBillingState("subscribe");
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
    ? `https://github.com/organizations/${installation.account.login}/settings/installations`
    : "https://github.com/settings/installations";

  const hasNoPlan = billingInfo && !billingInfo.hasSubscription && privateRepos.length > 0;
  const displayedRepos = repoTab === "private" ? privateRepos : publicRepos;

  return (
    <div class="dashboard-installation-card">
      {/* Header row */}
      <div class="dashboard-installation-head">
        <div class="flex items-center gap-3">
          <img src={installation.account.avatar_url} alt={installation.account.login} class="h-9 w-9 rounded-lg border border-slate-200" />
          <div>
            <h2 class="text-lg font-bold text-slate-950">{installation.account.login}</h2>
            <p class="text-xs text-slate-500">
              Installation #{installation.id} · {installation.repository_selection === "all" ? "All repositories" : "Selected repositories"}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {billingInfo?.hasSubscription && billingInfo.planName && (
            <span class="dashboard-plan-badge">
              {billingInfo.planName}
            </span>
          )}
          <a
            href={manageReposUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="dashboard-button dashboard-button-secondary"
          >
            Manage repos
          </a>
          <button
            onClick={handleBilling}
            disabled={billingState !== "idle"}
            class="dashboard-button dashboard-button-primary disabled:opacity-50"
          >
            {billingState === "loading" ? "Loading..." : "Manage billing"}
          </button>
        </div>
      </div>

      {/* No-plan prompt for private repos */}
      {hasNoPlan && (
        <div class="dashboard-plan-notice">
          <p class="font-medium text-slate-900">
            {privateRepos.length} private repo{privateRepos.length > 1 ? "s" : ""} enabled — choose a plan to enable analysis.
          </p>
          <p class="mt-1 text-slate-500">
            Public repos are always free.{" "}
            <button
              onClick={() => setBillingState("subscribe")}
              class="font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-700"
            >
              View plans
            </button>
          </p>
        </div>
      )}

      {/* Plan picker */}
      {billingState === "subscribe" && (
        <div class="dashboard-plan-picker">
          <h3 class="text-sm font-bold text-slate-900">Choose a plan</h3>
          <p class="mt-1 text-xs text-slate-500">
            Private repo analysis requires a paid plan. Public repos are always free.
          </p>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} class="dashboard-plan-option">
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">{plan.name}</p>
                <p class="mt-1 text-lg font-black text-slate-950">{plan.price}</p>
                <p class="text-xs text-slate-500">{plan.repos}</p>
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={checkoutLoading === plan.id}
                  class="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {checkoutLoading === plan.id ? "Loading..." : "Subscribe"}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setBillingState("idle")} class="mt-3 text-xs text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      )}

      {/* Repositories / Metrics tabs */}
      {repos.length > 0 && (
        <div class="mt-5">
          <div class="dashboard-tabs">
            <button
              onClick={() => setInstallTab("repos")}
              class={`dashboard-tab ${installTab === "repos" ? "dashboard-tab-active" : ""}`}
            >
              Repositories
            </button>
            <button
              onClick={() => setInstallTab("metrics")}
              class={`dashboard-tab ${installTab === "metrics" ? "dashboard-tab-active" : ""}`}
            >
              Metrics
            </button>
          </div>

          {installTab === "repos" ? (
            <div class="dashboard-metric-fade-in">
              <div class="dashboard-tabs mt-3">
                <button
                  onClick={() => setRepoTab("private")}
                  class={`dashboard-tab ${
                    repoTab === "private"
                      ? "dashboard-tab-active"
                      : ""
                  }`}
                >
                  Private ({privateRepos.length})
                </button>
                <button
                  onClick={() => setRepoTab("public")}
                  class={`dashboard-tab ${
                    repoTab === "public"
                      ? "dashboard-tab-active"
                      : ""
                  }`}
                >
                  Public ({publicRepos.length})
                </button>
              </div>

              {/* Repo grid */}
              {displayedRepos.length > 0 ? (
                <div class="dashboard-repo-grid">
                  {displayedRepos.map((repo) => {
                    const [repoOwner, repoName] = repo.full_name.split("/");
                    const isActive = metrics?.activeRepos.some(
                      (r) => r.repoOwner === repoOwner && r.repoName === repoName && r.active
                    );
                    return (
                      <a
                        key={repo.full_name}
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class={`dashboard-repo-link ${
                          repo.private ? "dashboard-repo-private" : "dashboard-repo-public"
                        }`}
                      >
                        <span class={`inline-block h-2 w-2 shrink-0 rounded-full ${repo.private ? "bg-amber-500" : "bg-emerald-600"}`} />
                        <span class="truncate text-slate-700">{repo.full_name}</span>
                        {isActive && (
                          <span class="dashboard-plan-badge ml-auto shrink-0" title="Actively analyzed by Striff">
                            {"\u2713"} Active
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p class="mt-3 px-3 py-6 text-center text-sm text-slate-400">
                  No {repoTab} repositories enabled
                  {repoTab === "private" && (
                    <>
                      {" \u2014 "}
                      <a href={manageReposUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">
                        add private repos
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div class="mt-3 dashboard-metric-fade-in">
              <MetricsTab data={metrics} loading={metricsLoading} error={metricsError} />
            </div>
          )}
        </div>
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
      a: "<b>Public repositories are completely free</b> \u2014 no limits, no credit card required. Private repositories need a paid plan. You pick a tier (Starter, Team, or Scale) and pay a <b>flat monthly fee</b>. There are no per-PR charges, no usage-based billing, and no hidden fees.",
    },
    {
      q: "Will I be charged automatically if I add more repos?",
      a: "<b>No.</b> Adding private repos to your Striff installation does not change your plan or trigger any charge. You stay on the plan you selected. If you exceed your tier, Striff will simply pause analysis on additional private repos and prompt you to upgrade \u2014 but only if you explicitly choose to.",
    },
    {
      q: "How do I enable Striff on private repositories?",
      a: "Click <b>\"Manage repos\"</b> on the installation card above to open GitHub\u2019s App settings. There you can grant Striff access to specific private repositories. Then choose a plan and subscribe to enable analysis on private pull requests.",
    },
    {
      q: "When will I be charged?",
      a: "You are charged <b>on the day you subscribe</b>, then on the same date each month. You can see your next billing date and manage payment methods in the Stripe Customer Portal (click <b>\"Manage billing\"</b> above).",
    },
    {
      q: "How do I stop being charged?",
      a: "Click <b>\"Manage billing\"</b> to open the Stripe portal and cancel your subscription. <b>You keep access until the end of your current billing period</b> \u2014 there is no immediate cutoff. You can also remove all private repos from the GitHub App settings to avoid any future need for a paid plan.",
    },
    {
      q: "What happens if I cancel my subscription?",
      a: "<b>Public repository analysis continues for free</b> \u2014 that never changes. Private repository analysis is paused until you re-subscribe. Your data is retained, and you can reactivate at any time.",
    },
    {
      q: "Which languages does Striff support?",
      a: "Striff currently supports <b>Java, TypeScript, Python, and C#</b>. We parse source code to build architectural dependency graphs and detect structural changes between pull request versions.",
    },
    {
      q: "What does Striff actually do on my pull requests?",
      a: "For each PR, Striff analyzes the <b>structural impact</b> of code changes \u2014 new dependencies, broken encapsulation, package cycles, hub formation, and more. Results appear as a <b>GitHub check-run</b> with a summary. Install the <a href=\"https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"font-semibold text-blue-600 hover:underline\">Striff browser extension</a> to explore interactive architecture diagrams directly on GitHub.",
    },
    {
      q: "What is the browser extension?",
      a: "The <a href=\"https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"font-semibold text-blue-600 hover:underline\">Striff browser extension</a> lets you view <b>interactive architectural diagrams</b> directly on GitHub. You can switch between code and architecture views, focus on specific components, and <b>post subdiagrams as PR comments</b> for your team.",
    },
  ];

  return (
    <div class="dashboard-faq">
      <h2 class="text-xl font-bold text-slate-950">Frequently asked questions</h2>
      <div class="mt-4 space-y-2">
        {items.map((item, i) => (
          <div key={i} class="dashboard-faq-item">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              class="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span class="text-sm font-medium text-slate-900">{item.q}</span>
              <svg
                class={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`}
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
                class="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600"
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

function getOAuthUrl() {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    scope: "read:user,user:email",
    redirect_uri: `${window.location.origin}/.netlify/functions/auth-callback`,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}
