import { createElement, useState, useEffect } from "react";

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
      <div class="flex items-center justify-center py-20">
        <div class="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p class="text-red-700">{error}</p>
        <a href="/" class="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to homepage
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          {user && (
            <img src={user.avatar_url} alt={user.login} class="h-10 w-10 rounded-full" />
          )}
          <div>
            <h1 class="text-2xl font-bold text-slate-950">{user?.name || user?.login}</h1>
            <p class="text-sm text-slate-500">@{user?.login}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      {/* Installations */}
      {installations.length === 0 ? (
        <div class="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
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
        <div class="mt-8 space-y-6">
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

      {error && <p class="mt-4 text-sm text-red-600">{error}</p>}

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

  useEffect(() => {
    fetchBillingInfo();
  }, []);

  async function fetchBillingInfo() {
    try {
      const res = await fetch(
        `/.netlify/functions/stripe-portal?installation_id=${installation.id}`
      );
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
      const res = await fetch(
        `/.netlify/functions/stripe-portal?installation_id=${installation.id}`
      );
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
      const res = await fetch("/.netlify/functions/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: installation.id, plan }),
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
    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header row */}
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <img src={installation.account.avatar_url} alt={installation.account.login} class="h-8 w-8 rounded" />
          <div>
            <h2 class="text-lg font-bold text-slate-950">{installation.account.login}</h2>
            <p class="text-xs text-slate-500">
              Installation #{installation.id} · {installation.repository_selection === "all" ? "All repositories" : "Selected repositories"}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {billingInfo?.hasSubscription && billingInfo.planName && (
            <span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {billingInfo.planName}
            </span>
          )}
          <a
            href={manageReposUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage repos
          </a>
          <button
            onClick={handleBilling}
            disabled={billingState !== "idle"}
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {billingState === "loading" ? "Loading..." : "Manage billing"}
          </button>
        </div>
      </div>

      {/* No-plan warning for private repos */}
      {hasNoPlan && (
        <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p class="font-medium text-amber-800">
            You have {privateRepos.length} private repo{privateRepos.length > 1 ? "s" : ""} enabled but no active subscription.
          </p>
          <p class="mt-1 text-amber-700">
            Private repo analysis requires a paid plan.{" "}
            <button
              onClick={() => setBillingState("subscribe")}
              class="font-semibold text-amber-900 underline hover:no-underline"
            >
              Choose a plan
            </button>
          </p>
        </div>
      )}

      {/* Plan picker */}
      {billingState === "subscribe" && (
        <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 class="text-sm font-bold text-slate-900">Select a plan for private repositories</h3>
          <p class="mt-1 text-xs text-slate-600">
            Public repos are always free. Choose a plan to enable Striff on private pull requests.
          </p>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} class="rounded-xl border border-slate-200 bg-white p-4">
                <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">{plan.name}</p>
                <p class="mt-1 text-lg font-black text-slate-950">{plan.price}</p>
                <p class="text-xs text-slate-500">{plan.repos}</p>
                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={checkoutLoading === plan.id}
                  class="mt-3 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {checkoutLoading === plan.id ? "Loading..." : "Subscribe"}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setBillingState("idle")} class="mt-3 text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {/* Repo tabs */}
      {repos.length > 0 && (
        <div class="mt-5">
          <div class="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setRepoTab("private")}
              class={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                repoTab === "private"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {privateRepos.length} Private
            </button>
            <button
              onClick={() => setRepoTab("public")}
              class={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                repoTab === "public"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {publicRepos.length} Public
            </button>
          </div>

          {/* Repo list */}
          {displayedRepos.length > 0 ? (
            <div class="mt-3 max-h-48 overflow-y-auto">
              <ul class="space-y-1">
                {displayedRepos.map((repo) => (
                  <li key={repo.full_name} class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
                    <span class={`inline-block h-2 w-2 rounded-full ${repo.private ? "bg-amber-400" : "bg-green-400"}`} />
                    <a
                      href={repo.html_url}
                      class="text-slate-700 hover:text-blue-600 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {repo.full_name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p class="mt-3 px-3 py-4 text-center text-sm text-slate-400">
              No {repoTab} repositories enabled
              {repoTab === "private" && (
                <>
                  {" — "}
                  <a href={manageReposUrl} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">
                    add private repos
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── FAQ Section ───────────────────────────────────────────────── */

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  const items = [
    {
      q: "How does Striff pricing work?",
      a: "Public repositories are completely free — no limits. Private repositories require a paid plan (Starter, Team, or Scale). You only pay for the plan you select, billed monthly. There are no per-PR charges or hidden fees.",
    },
    {
      q: "How do I enable Striff on private repositories?",
      a: 'Go to "Manage repos" on the installation card above, which takes you to GitHub's App settings. There you can grant Striff access to specific private repositories. Then choose a plan and subscribe to enable analysis on private pull requests.',
    },
    {
      q: "When will I be charged?",
      a: "You are charged immediately when you subscribe, and then on the same date each month. You can see your next billing date and manage payment methods in the Stripe Customer Portal (click \"Manage billing\" above).",
    },
    {
      q: "How do I stop being charged?",
      a: 'Click "Manage billing" above to open the Stripe portal, where you can cancel your subscription. You\'ll keep access until the end of your current billing period. Alternatively, you can remove all private repos from the Striff App installation in GitHub settings.',
    },
    {
      q: "What happens if I cancel my subscription?",
      a: "Striff will continue analyzing public repository pull requests for free. Private repository analysis will be paused. You can re-subscribe at any time to resume private repo analysis.",
    },
    {
      q: "Which languages does Striff support?",
      a: "Striff supports Java, Kotlin, TypeScript, JavaScript, Python, C#, and Go. We parse source code to build architectural dependency graphs and detect structural changes between pull request versions.",
    },
    {
      q: "What does Striff actually do on my pull requests?",
      a: "For each PR, Striff analyzes the structural impact of code changes — new dependencies, broken encapsulation, package cycles, hub formation, and more. Results appear as a GitHub check-run with a summary, and you can install the browser extension to explore interactive architecture diagrams inline.",
    },
    {
      q: "What is the browser extension?",
      a: 'The Striff browser extension lets you view interactive architectural diagrams directly on GitHub. You can switch between code and architecture views, focus on specific components, and post subdiagrams as PR comments. Install it from the Chrome Web Store.',
    },
  ];

  return (
    <div class="mt-12">
      <h2 class="text-xl font-bold text-slate-950">Frequently asked questions</h2>
      <div class="mt-4 space-y-2">
        {items.map((item, i) => (
          <div key={i} class="rounded-xl border border-slate-200 bg-white">
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
              <div class="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
                {item.a}
              </div>
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
