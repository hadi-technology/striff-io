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
  account: { login: string; avatar_url: string };
  repository_selection: string;
  repositories?: Repo[];
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

      // Auto-trigger checkout if redirected from installed page with plan param
      const params = new URLSearchParams(window.location.search);
      const planParam = params.get("plan");
      const instIdParam = params.get("installation_id");
      if (planParam && instIdParam) {
        setAutoCheckout({ installationId: Number(instIdParam), plan: planParam });
        // Clean URL
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
            <img
              src={user.avatar_url}
              alt={user.login}
              class="h-10 w-10 rounded-full"
            />
          )}
          <div>
            <h1 class="text-2xl font-bold text-slate-950">
              {user?.name || user?.login}
            </h1>
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

      {error && (
        <p class="mt-4 text-sm text-red-600">{error}</p>
      )}

      {/* Help */}
      <div class="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        <p class="font-semibold text-slate-900">Need help?</p>
        <ul class="mt-2 space-y-1">
          <li>
            Install Striff on more repos:{" "}
            <a
              href="https://github.com/apps/striff-app/installations/new"
              class="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub App settings
            </a>
          </li>
          <li>
            To stop being charged, remove private repos or{" "}
            <a
              href="https://github.com/settings/installations"
              class="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              uninstall the app
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

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
  const [billingState, setBillingState] = useState<"idle" | "loading" | "subscribe" | "portal_loading">("idle");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Auto-trigger checkout when redirected from installed page with a plan
  useEffect(() => {
    if (autoPlan && billingState === "idle" && !checkoutLoading) {
      handleCheckout(autoPlan);
      onAutoPlanConsumed();
    }
  }, [autoPlan]);

  async function handleBilling() {
    setBillingState("loading");
    try {
      const res = await fetch(
        `/.netlify/functions/stripe-portal?installation_id=${installation.id}`
      );
      const data = await res.json();
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
        body: JSON.stringify({
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

  return (
    <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <img
            src={installation.account.avatar_url}
            alt={installation.account.login}
            class="h-8 w-8 rounded"
          />
          <div>
            <h2 class="text-lg font-bold text-slate-950">
              {installation.account.login}
            </h2>
            <p class="text-xs text-slate-500">
              Installation #{installation.id} ·{" "}
              {installation.repository_selection === "all"
                ? "All repositories"
                : "Selected repositories"}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <a
            href="https://github.com/settings/installations"
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

      {/* Plan picker — shown when no subscription exists */}
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
          <button
            onClick={() => setBillingState("idle")}
            class="mt-3 text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Repo stats */}
      <div class="mt-4 flex gap-4">
        <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {privateRepos.length} private
        </span>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {publicRepos.length} public
        </span>
      </div>

      {/* Repo list */}
      {repos.length > 0 && (
        <div class="mt-4 max-h-48 overflow-y-auto">
          <ul class="space-y-1">
            {repos.map((repo) => (
              <li key={repo.full_name} class="flex items-center gap-2 text-sm">
                <span
                  class={`inline-block h-2 w-2 rounded-full ${
                    repo.private ? "bg-amber-400" : "bg-green-400"
                  }`}
                />
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
      )}
    </div>
  );
}

function getOAuthUrl() {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    scope: "read:user,user:email",
    redirect_uri: `${window.location.origin}/.netlify/functions/auth-callback`,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}
