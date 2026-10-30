import { createElement, useState, useEffect, useRef, type ReactNode } from "react";
import MetricsTab, { type OrgMetricsData } from "./MetricsTab";
import DocsTab, { GitHubMark } from "./DocsTab";
import { RepoCardBadge, SideBadge } from "./BadgeControl";
import ChecksTab from "./ChecksTab";
import SettingsTab from "./SettingsTab";
import { sectionFromAddress } from "../lib/checkSettings.js";
import { PENDING_DOC_KEY, PENDING_REPO_KEY, PENDING_RULE_KEY, docFromSearch, findRepo, repoFromSearch, ruleFromSearch, validDocPath, validRepo, validRuleId, withLink } from "../lib/dashboardDeepLink.js";
import { signInUrl } from "../lib/githubSignIn.js";

/** Where the GitHub App is installed on an account: the first one, or one more. */
const INSTALL_URL = "https://github.com/apps/striffs/installations/new";
/** Where the account last looked at is kept, so a reload opens on it. */
const LAST_ACCOUNT_KEY = "striff.lastAccount";

const OAUTH_CLIENT_ID =
  typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_GITHUB_OAUTH_CLIENT_ID
    ? import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID
    : "";

interface User {
  login: string;
  avatar_url: string;
  name: string | null;
}

/** The sections of the dashboard: three belong to the account, two to the repository in view. */
type Section = "repos" | "docs" | "checks" | "metrics" | "billing" | "settings";

interface Repo {
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch?: string;
  /** Whether the repository takes issues; a fork does not unless its owner turned them on. */
  has_issues?: boolean;
  /** Whether the repository is archived, and so takes no pull requests. */
  archived?: boolean;
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
  { id: "starter", name: "Starter", price: "$29/mo", repos: "Up to 5 private repos Striff works on a month", cap: 5 },
  { id: "team", name: "Team", price: "$59/mo", repos: "Up to 15 private repos Striff works on a month", cap: 15 },
  { id: "scale", name: "Scale", price: "$149/mo", repos: "Up to 50 private repos Striff works on a month", cap: 50 },
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
  window.location.href = signInUrl(OAUTH_CLIENT_ID);
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoCheckout, setAutoCheckout] = useState<{ installationId: number; plan: string } | null>(null);
  const [section, setSection] = useState<Section>("repos");
  // Which repository the docs and rules view is showing; set by opening one from Repositories.
  const [openRepo, setOpenRepo] = useState<string | null>(null);
  /** The part of Settings a link asked to land on. */
  const [settingsFocus, setSettingsFocus] = useState<"notifications" | "checks" | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  /** A repository a link asked for that none of this reader's installations covers. */
  const [unreachableRepo, setUnreachableRepo] = useState<string | null>(null);
  /**
   * Whether the selected repository's badge panel is open over the page. The welcome email and
   * the post-install page link to /dashboard#badge, which opens it on arrival.
   */
  const [badgeOpen, setBadgeOpen] = useState(false);
  // The account section and the repository view last in use, so going up to the account and
  // choosing a repository again each land where the reader was.
  const [lastAccountSection, setLastAccountSection] = useState<Section>("repos");
  const [lastRepoView, setLastRepoView] = useState<"docs" | "checks">("docs");
  // Where the open repository's views put their refresh and badge: the tab row's right side.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (section === "docs" || section === "checks") setLastRepoView(section);
    else setLastAccountSection(section);
  }, [section]);

  useEffect(() => {
    if (window.location.hash === "#badge") setBadgeOpen(true);
    // The account's old Notifications tab is a section of Settings now; its addresses land there.
    const asked = sectionFromAddress(window.location.search, window.location.hash);
    if (asked) {
      setSection(asked.section);
      setSettingsFocus(asked.focus);
    }
  }, []);

  useEffect(() => {
    init();
  }, []);

  /**
   * The repository (and document) a link asked for (/dashboard?repo=<owner>/<name>&doc=<path>,
   * which a private repository's README badge links to), or the ones kept while the reader signed
   * in. The address keeps carrying them while that repository's documents are open, so a copy of
   * it is a working link; the docs view takes them out when it closes and this takes them out when
   * the repository turns out not to be the reader's, so a reload does not ask again.
   */
  function takeLinkedRepo(): { repo: string | null; doc: string | null; rule: string | null } {
    if (new URLSearchParams(window.location.search).has("repo")) {
      const named = repoFromSearch(window.location.search);
      if (named) {
        return { repo: named, doc: docFromSearch(window.location.search), rule: ruleFromSearch(window.location.search) };
      }
      window.history.replaceState({}, "", withLink(window.location.href, { repo: null, doc: null, rule: null }));
    }
    try {
      const kept = validRepo(window.sessionStorage.getItem(PENDING_REPO_KEY));
      const keptDoc = validDocPath(window.sessionStorage.getItem(PENDING_DOC_KEY));
      const keptRule = validRuleId(window.sessionStorage.getItem(PENDING_RULE_KEY));
      window.sessionStorage.removeItem(PENDING_REPO_KEY);
      window.sessionStorage.removeItem(PENDING_DOC_KEY);
      window.sessionStorage.removeItem(PENDING_RULE_KEY);
      if (kept) {
        // Back from signing in on a bare address: the docs view reads the document from it.
        window.history.replaceState({}, "", withLink(window.location.href, { repo: kept, doc: keptDoc, rule: keptRule }));
      }
      return { repo: kept, doc: kept ? keptDoc : null, rule: kept ? keptRule : null };
    } catch {
      return { repo: null, doc: null, rule: null };
    }
  }

  async function init() {
    setError("");
    setLoading(true);
    const { repo: linkedRepo, doc: linkedDoc, rule: linkedRule } = takeLinkedRepo();
    try {
      // Who is signed in, every installation and every repository under each, in one request.
      const statusRes = await fetch("/.netlify/functions/dashboard-bootstrap");
      // An outage, a cold start or a proxy error page all return HTML here, and .json() then
      // throws a parser message ("Unexpected token '<'...") that used to be shown to the
      // customer verbatim. Decide on the content type instead of guessing from the exception.
      const contentType = statusRes.headers.get("content-type") || "";
      if (!statusRes.ok || !contentType.includes("application/json")) {
        throw new Error("UNREACHABLE");
      }
      const status = await statusRes.json();
      if (!status.authenticated) {
        // Kept for the round trip through GitHub's sign-in, which lands back on /dashboard bare.
        if (linkedRepo) {
          try {
            window.sessionStorage.setItem(PENDING_REPO_KEY, linkedRepo);
            if (linkedDoc) window.sessionStorage.setItem(PENDING_DOC_KEY, linkedDoc);
            if (linkedRule) window.sessionStorage.setItem(PENDING_RULE_KEY, linkedRule);
          } catch {
            // Without storage the reader lands on the dashboard as it opens by default.
          }
        }
        window.location.href = signInUrl(OAUTH_CLIENT_ID);
        return;
      }
      setUser(status.user);

      const withRepos: Installation[] = Array.isArray(status.installations) ? status.installations : [];
      setInstallations(withRepos);
      // The account last looked at, so a reload stays on it; a link or a checkout below overrides it.
      const rememberedAccount = (() => {
        try {
          return Number(window.localStorage.getItem(LAST_ACCOUNT_KEY));
        } catch {
          return NaN;
        }
      })();
      if (withRepos.some((inst) => inst.id === rememberedAccount)) {
        setAccountId(rememberedAccount);
      }
      if (linkedRepo) {
        const found = findRepo(withRepos, linkedRepo);
        if (found) {
          setAccountId(found.installationId);
          setOpenRepo(found.fullName);
          setSection("docs");
        } else {
          // Said the same way whether the repository exists or not.
          setUnreachableRepo(linkedRepo);
          window.history.replaceState({}, "", withLink(window.location.href, { repo: null, doc: null, rule: null }));
        }
      }

      // Fire-and-forget: reports the user's primary email to the backend for each installation.
      // Covers installs made while already signed in, which never re-run the OAuth callback's
      // capture; the backend dedups and sends any pending welcome email on first capture.
      fetch("/.netlify/functions/email-sync", { method: "POST" }).catch(() => {});

      const params = new URLSearchParams(window.location.search);
      const planParam = params.get("plan");
      const instIdParam = params.get("installation_id");
      if (planParam && instIdParam) {
        setAutoCheckout({ installationId: Number(instIdParam), plan: planParam });
        // Only the account in view renders its card now, so the one being paid for has to be the
        // one in view: without this, a second account's checkout was picked up by nothing.
        setAccountId(Number(instIdParam));
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

  const current =
    installations.find((inst) => inst.id === accountId) || installations[0] || null;

  // The dashboard opens on the account, never on a repository nobody asked for: a repository is
  // open only when a link names it or the reader chooses it. Switching accounts closes one that
  // does not belong to the account now in view.
  useEffect(() => {
    if (!current || !openRepo) return;
    const repos = current.repositories || [];
    if (!repos.some((repo) => repo.full_name === openRepo)) setOpenRepo(null);
  }, [current?.id, current?.repositories?.length]);

  useEffect(() => {
    if (!current) return;
    try {
      window.localStorage.setItem(LAST_ACCOUNT_KEY, String(current.id));
    } catch {
      // A browser that will not remember is no reason to fail: the first account is the default.
    }
  }, [current?.id]);


  function signOut() {
    window.location.href = "/.netlify/functions/auth-logout";
  }

  // Every state of this page wears the bar: signing out and switching account must not depend on
  // the dashboard below having loaded.
  const framed = (children: any) => (
    <>
      <DashBar
        user={user}
        installations={installations}
        current={current}
        section={section}
        openRepo={openRepo}
        onHome={() => setSection(lastAccountSection)}
        onRepo={(fullName) => {
          setOpenRepo(fullName);
          if (section !== "docs" && section !== "checks") setSection(lastRepoView);
        }}
        onAccount={setAccountId}
        onSignOut={signOut}
      />
      {current && (
        <TabRow
          current={current}
          section={section}
          openRepo={openRepo}
          onSection={setSection}
          slotRef={setActionsSlot}
        />
      )}
      <div className="dash-page">
        {children}
        {/* The marketing footer is off on this page, and these still have to be reachable. */}
        <footer className="dash-foot">
          <a href="/privacy/">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms/">Terms</a>
          <span aria-hidden="true">·</span>
          <a href="/cookies/">Cookies</a>
          <span aria-hidden="true">·</span>
          <a href="/contact/">Contact</a>
          <span aria-hidden="true">·</span>
          <a href="/">striff.io</a>
        </footer>
      </div>
    </>
  );

  if (loading) {
    return framed(
      <div className="dashboard-loading">
        <div className="dashboard-spinner" aria-hidden="true" />
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error && !user) {
    return framed(
      <div className="dashboard-error-state">
        <h1 className="dashboard-error-title">We can't load your dashboard right now</h1>
        <p className="dashboard-error-body">{error}</p>
        <div className="dashboard-error-actions">
          <button type="button" onClick={init} className="dashboard-button dashboard-button-primary">
            Try again
          </button>
          <a href={helpUrl(user, current, section, openRepo)} className="dashboard-button dashboard-button-secondary">
            Contact support
          </a>
          <a href="/" className="dashboard-button dashboard-button-secondary">
            Back to homepage
          </a>
        </div>
        <p className="dashboard-error-foot">
          Checks keep running on your pull requests whether or not this page loads. Nothing here
          affects the checks Striff posts on GitHub.
        </p>
      </div>
    );
  }

  return framed(
    <div className="dashboard-shell">
      {unreachableRepo && (
        <p className="dashboard-link-notice" role="status">
          <span>You don't have access to <code>{unreachableRepo}</code> in Striff.</span>
          <button type="button" onClick={() => setUnreachableRepo(null)} aria-label="Dismiss">×</button>
        </p>
      )}
      {/* Installations */}
      {installations.length === 0 ? (
        <div className="dashboard-empty">
          <p className="text-slate-600">
            Striff isn't installed on any of your repositories yet. Install the GitHub App to start
            analyzing pull requests. Public repos are free.
          </p>
          <a
            href={INSTALL_URL}
            className="dashboard-button dashboard-button-primary mt-4 inline-block"
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Striff on GitHub
          </a>
        </div>
      ) : (
        <div className="dash-shell">
          <div className="dash-main">
            <InstallationCard
              key={current.id}
              installation={current}
              onError={setError}
              autoPlan={autoCheckout?.installationId === current.id ? autoCheckout.plan : null}
              onAutoPlanConsumed={() => setAutoCheckout(null)}
              section={section}
              onSection={setSection}
              settingsFocus={settingsFocus}
              openRepo={openRepo}
              actionsSlot={actionsSlot}
              repoBadge={(() => {
                // The repository's README badge, placed after the refresh of whichever of its
                // views is open; clicking it opens the panel with its snippet over the page.
                const selected = (current.repositories || []).find((r) => r.full_name === openRepo);
                return selected ? (
                  <SideBadge
                    key={selected.full_name}
                    installationId={current.id}
                    repo={selected}
                    open={badgeOpen}
                    onOpen={() => setBadgeOpen(true)}
                    onClose={() => {
                      setBadgeOpen(false);
                      if (window.location.hash === "#badge") {
                        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
                      }
                    }}
                  />
                ) : null;
              })()}
              onOpenRepo={(fullName) => {
                setOpenRepo(fullName);
                setSection("docs");
              }}
              onOfferBadge={(fullName) => {
                // The badge entry lives in the repository's views, so the panel opens over one.
                setOpenRepo(fullName);
                setSection("docs");
                setBadgeOpen(true);
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


/**
 * The contact form, told what the reader was looking at.
 *
 * Only what identifies the installation and the page: the GitHub login, the account, the
 * repository and the section. No email -- the form asks for one that is reachable, which is not
 * necessarily the one GitHub holds -- and nothing about the documents or rules themselves.
 */
function helpUrl(
  user: User | null,
  current: Installation | null,
  section?: Section,
  openRepo?: string | null
): string {
  const context = new URLSearchParams({ from: "dashboard" });
  if (user?.login) context.set("login", user.login);
  if (user?.name) context.set("name", user.name);
  if (current) {
    context.set("account", current.account.login);
    context.set("installation", String(current.id));
  }
  if (openRepo) context.set("repo", openRepo);
  if (section) context.set("section", section);
  return `/contact/?${context.toString()}`;
}

/**
 * The application's own bar: who you are signed in as, which account you are looking at, and the
 * way out. The marketing header is turned off on this page, so this is the only chrome above the
 * work, and switching account happens here rather than inside the sections it changes.
 */
function DashBar({
  user,
  installations,
  current,
  section,
  openRepo,
  onHome,
  onRepo,
  onAccount,
  onSignOut,
}: {
  user: User | null;
  installations: Installation[];
  current: Installation | null;
  /** Which part of the dashboard is open, so asking for help says where from. */
  section?: Section;
  /** The repository in view, for the same reason, and what the repository crumb shows. */
  openRepo?: string | null;
  /** Up to the account's sections, closing the repository. */
  onHome: () => void;
  onRepo: (fullName: string) => void;
  onAccount: (id: number) => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest(".bar-user")) setMenuOpen(false);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <header className="dash-bar">
      <div className="dash-bar-inner">
        <a className="bar-logo" href="/">
          <span className="bar-tile"><img src="/icon.svg" alt="" width="20" height="20" /></span>
          <span className="bar-word">Striff</span>
        </a>
        {/* A menu even with one account in it: it is where someone looks to add a second, and a
            name that did nothing when pressed gave no sign that there could be one. */}
        {current && (
          <AccountPicker
            installations={installations}
            current={current}
            onAccount={onAccount}
            onHome={onHome}
          />
        )}
        {current && (current.repositories || []).length > 0 && (
          <RepoCrumb
            repos={current.repositories || []}
            openRepo={section === "docs" || section === "checks" ? openRepo ?? null : null}
            onRepo={onRepo}
          />
        )}
        <div className="bar-right">
          {/* Help used to be a bare link to the contact form, which meant someone with a problem
              in front of them had to describe from memory which account, which repository and
              which page they were on -- and usually did not, so the first reply was a request
              for all three. The form fills that in and shows what it is sending. */}
          <a className="bar-link" href={helpUrl(user, current, section, openRepo)}>Help</a>
          {user && (
            <div className="bar-user">
              <button
                type="button"
                className="bar-user-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <img src={user.avatar_url} alt={user.login} />
                <Chevron />
              </button>
              {menuOpen && (
                <div className="bar-menu" role="menu">
                  <p className="bar-menu-who">{user.login}</p>
                  <a className="bar-menu-item" href={INSTALL_URL} target="_blank" rel="noopener noreferrer" role="menuitem">
                    Add an account
                  </a>
                  <button type="button" className="bar-menu-item" onClick={onSignOut} role="menuitem">
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The repository crumb, after the account's: the repository in view, or a muted prompt at the
 * account level, opening a menu of the account's repositories drawn like the account menu beside
 * it. The menu keeps what a native select gave: arrows move, Home and End jump, Escape closes and
 * hands focus back to the crumb. A long list gets a filter at its top.
 */
function RepoCrumb({
  repos,
  openRepo,
  onRepo,
}: {
  repos: Repo[];
  openRepo: string | null;
  onRepo: (fullName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const label = openRepo ? openRepo.split("/")[1] || openRepo : "Select a repository";
  const filterable = repos.length > 8;
  const wanted = filter.trim().toLowerCase();
  const shown = wanted ? repos.filter((r) => r.full_name.toLowerCase().includes(wanted)) : repos;

  function items(): HTMLElement[] {
    return Array.from(wrap.current?.querySelectorAll<HTMLElement>(".bar-repo-option") || []);
  }

  function close() {
    setOpen(false);
    setFilter("");
  }

  useEffect(() => {
    if (!open) return;
    if (filterable) {
      wrap.current?.querySelector<HTMLInputElement>(".bar-repo-filter")?.focus();
    } else {
      const all = items();
      (all.find((item) => item.getAttribute("aria-checked") === "true") || all[0])?.focus();
    }

    function outside(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest(".bar-repo-wrap")) close();
    }
    function keys(event: KeyboardEvent) {
      const inFilter = (document.activeElement as HTMLElement | null)?.classList.contains("bar-repo-filter");
      const all = items();
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        wrap.current?.querySelector<HTMLElement>(".bar-repo-pick")?.focus();
      } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && all.length) {
        event.preventDefault();
        const at = all.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        all[at < 0 ? (step > 0 ? 0 : all.length - 1) : (at + step + all.length) % all.length].focus();
      } else if ((event.key === "Home" || event.key === "End") && all.length && !inFilter) {
        event.preventDefault();
        (event.key === "Home" ? all[0] : all[all.length - 1]).focus();
      } else if (event.key === "Tab") {
        close();
      }
    }
    document.addEventListener("click", outside);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);

  return (
    <div className="bar-crumb-repo">
      <span className="bar-sep" aria-hidden="true">/</span>
      <div className="bar-repo-wrap" ref={wrap}>
        <button
          type="button"
          className={`bar-repo-pick${openRepo ? "" : " is-empty"}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={openRepo ? `Repository: ${openRepo}. Change repository` : "Select a repository"}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <span className="bar-repo-label">{label}</span>
          <Chevron />
        </button>
        {open && (
          <div className="bar-menu bar-account-menu bar-repo-menu" role="menu">
            <p className="bar-menu-who">Repositories</p>
            {filterable && (
              <input
                className="bar-repo-filter"
                type="search"
                placeholder="Find a repository"
                aria-label="Find a repository"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            )}
            {shown.map((r) => {
              const current = r.full_name === openRepo;
              return (
                <button
                  key={r.full_name}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  className={`bar-menu-item bar-account-option bar-repo-option${current ? " is-current" : ""}`}
                  onClick={() => {
                    close();
                    if (!current) onRepo(r.full_name);
                  }}
                >
                  <span className="bar-repo-visibility" title={r.private ? "Private" : "Public"}>
                    <RepoVisibilityIcon private={r.private} />
                  </span>
                  <span className="bar-account-option-name">{r.full_name.split("/")[1] || r.full_name}</span>
                  {current && (
                    <svg className="bar-account-tick" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  )}
                </button>
              );
            })}
            {shown.length === 0 && <p className="bar-repo-none">No repository matches.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The page's only section navigation: a white band attached to the bar. At the account level it
 * holds the account's sections; with a repository open, that repository's views, and on its right
 * the repository's actions (the link out, and a slot the open view fills with its refresh and
 * the README badge).
 */
function TabRow({
  current,
  section,
  openRepo,
  onSection,
  slotRef,
}: {
  current: Installation;
  section: Section;
  openRepo: string | null;
  onSection: (section: Section) => void;
  slotRef: (el: HTMLElement | null) => void;
}) {
  const inRepo = !!openRepo && (section === "docs" || section === "checks");
  const tabs: readonly (readonly [Section, string, string, string])[] = inRepo
    ? [
        ["docs", "Docs & rules", "docs", ""],
        ["checks", "Checks", "checks", ""],
      ]
    : [
        ["metrics", "Metrics", "overview", ""],
        ["repos", "Repositories", "repos", String((current.repositories || []).length)],
        ["billing", "Billing", "billing", ""],
        ["settings", "Settings", "settings", ""],
      ];
  const selected = (current.repositories || []).find((r) => r.full_name === openRepo);
  return (
    <div className="tabrow">
      <div className="tabrow-inner">
        <nav className="tabs" aria-label={inRepo ? `Repository ${openRepo}` : `Account ${current.account.login}`}>
          {tabs.map(([key, label, icon, count]) => (
            <button
              key={key}
              type="button"
              className={`tab${section === key ? " active" : ""}`}
              aria-current={section === key ? "page" : undefined}
              onClick={() => onSection(key)}
            >
              <NavIcon name={icon} />
              <span>{label}</span>
              {count && <span className="tab-count">{count}</span>}
            </button>
          ))}
        </nav>
        {inRepo && (
          <div className="tabrow-actions">
            <a
              className="docs-repo-link"
              href={selected?.html_url || `https://github.com/${openRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this repository on GitHub"
            >
              <GitHubMark />
              GitHub
            </a>
            <div className="tabrow-slot" ref={slotRef} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Choosing which account the dashboard is about.
 *
 * This was a native select for a while, and it looked it: the closed control could be made to fit
 * the dark bar, but the open list is drawn by the operating system, so the menu that appeared was
 * a grey system popup in the wrong font with no avatars, floating over a page that looks nothing
 * like it. A menu of our own costs a few lines and matches the one beside it.
 *
 * Each account is shown the way GitHub shows it -- avatar and login -- because someone with a
 * personal account and two organizations recognises the picture before the name, and the whole
 * point of this control is telling them apart.
 */
function AccountPicker({
  installations,
  current,
  onAccount,
  onHome,
}: {
  installations: Installation[];
  current: Installation;
  onAccount: (id: number) => void;
  /** The account's name goes up to its sections; the chevron beside it is the menu. */
  onHome: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // A native select could be driven entirely from the keyboard, and replacing it with our own
  // markup would quietly take that away. Arrows move, Home and End jump, Escape closes and hands
  // focus back to the chip that opened the menu.
  function items(): HTMLElement[] {
    return Array.from(wrap.current?.querySelectorAll<HTMLElement>(".bar-account-option") || []);
  }

  useEffect(() => {
    if (!open) return;
    // Opening lands on the account in use, so the first arrow press moves from where you are.
    const all = items();
    (all.find((item) => item.getAttribute("aria-checked") === "true") || all[0])?.focus();

    function close(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest(".bar-account-wrap")) setOpen(false);
    }
    function keys(event: KeyboardEvent) {
      const all = items();
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        wrap.current?.querySelector<HTMLElement>(".bar-account")?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        all[(at + step + all.length) % all.length].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        all[0].focus();
      } else if (event.key === "End") {
        event.preventDefault();
        all[all.length - 1].focus();
      } else if (event.key === "Tab") {
        // Tabbing out of a menu closes it, the way every other menu on this page behaves.
        setOpen(false);
      }
    }
    document.addEventListener("click", close);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);

  return (
    <div className="bar-account-wrap" ref={wrap}>
      <button
        type="button"
        className="bar-account-link"
        aria-label={`${current.account.login}: its repositories, metrics and billing`}
        onClick={onHome}
      >
        {current.account.avatar_url && (
          <img className="bar-account-avatar" src={current.account.avatar_url} alt="" />
        )}
        <span className="bar-account-name">{current.account.login}</span>
      </button>
      <button
        type="button"
        className="bar-account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${current.account.login}. ${installations.length > 1 ? "Change or add an account" : "Add an account"}`}
        onClick={() => setOpen((was) => !was)}
      >
        <Chevron />
      </button>
      {open && (
        <div className="bar-menu bar-account-menu" role="menu">
          <p className="bar-menu-who">Accounts</p>
          {installations.map((inst) => (
            <button
              key={inst.id}
              type="button"
              role="menuitemradio"
              aria-checked={inst.id === current.id}
              className={`bar-menu-item bar-account-option${inst.id === current.id ? " is-current" : ""}`}
              onClick={() => {
                setOpen(false);
                if (inst.id !== current.id) onAccount(inst.id);
              }}
            >
              {inst.account.avatar_url && (
                <img className="bar-account-avatar" src={inst.account.avatar_url} alt="" />
              )}
              <span className="bar-account-option-name">{inst.account.login}</span>
              {inst.id === current.id && (
                <svg className="bar-account-tick" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              )}
            </button>
          ))}
          {/* Installing the app on another account is how an account gets into this list, so the
              way to do it sits at the end of the list. It carries the option class so the arrow
              keys reach it like any other row. */}
          <a
            className="bar-menu-item bar-account-option bar-account-add"
            href={INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
            <span className="bar-account-option-name">Add an account</span>
            <span className="sr-only"> (opens GitHub in a new tab)</span>
          </a>
        </div>
      )}
    </div>
  );
}

/** Locked or open: the one thing about a repository that changes what Striff may charge for it. */
const RepoVisibilityIcon = ({ private: isPrivate }: { private: boolean }) =>
  isPrivate ? (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V4.75a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.6 1.7 2.4 3.7 2.4 6S9.6 12.3 8 14c-1.6-1.7-2.4-3.7-2.4-6S6.4 3.7 8 2Z" />
    </svg>
  );

const Chevron = () => (
  <svg className="bar-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6.5 8 10.5 12 6.5" />
  </svg>
);


const NavIcon = ({ name }: { name: string }) => {
  const paths: Record<string, any> = {
    overview: ["M2 2h5v5H2z", "M9 2h5v5H9z", "M2 9h5v5H2z", "M9 9h5v5H9z"],
    repos: ["M3 12.75V2.75A1.25 1.25 0 0 1 4.25 1.5H13v10H4.25A1.25 1.25 0 0 0 3 12.75Z", "M3 12.75A1.25 1.25 0 0 0 4.25 14H13v-2.5"],
    docs: ["M3.5 1.75h5.5l3.5 3.5v9h-9Z", "m5.75 9.5 1.5 1.5 3-3"],
    checks: ["M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5Z", "m5.5 8.25 1.75 1.75 3.25-3.5"],
    billing: ["M1.5 3.5h13v9h-13z", "M1.5 6.5h13"],
    settings: ["M2 4.5h7", "M12 4.5h2", "M10.5 3a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Z", "M2 11.5h2", "M7 11.5h7", "M5.5 10a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Z"],
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
  settingsFocus,
  openRepo,
  actionsSlot,
  repoBadge,
  onOpenRepo,
  onOfferBadge,
}: {
  installation: Installation;
  onError: (msg: string) => void;
  autoPlan: string | null;
  onAutoPlanConsumed: () => void;
  section?: Section;
  onSection?: (section: Section) => void;
  settingsFocus?: "notifications" | "checks" | null;
  openRepo?: string | null;
  /** The tab row's right side, where the open repository's views put their refresh and badge. */
  actionsSlot?: HTMLElement | null;
  /** The open repository's README badge entry, placed after the refresh. */
  repoBadge?: ReactNode;
  onOpenRepo?: (fullName: string) => void;
  /** Selects a repository and opens its badge panel. */
  onOfferBadge?: (fullName: string) => void;
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
  const [ownTab, setOwnTab] = useState<Section>("repos");
  // The shell's tab row owns the section when it passes one; the card keeps its own otherwise.
  const installTab = section ?? ownTab;
  const setInstallTab = onSection ?? setOwnTab;
  const [metrics, setMetrics] = useState<OrgMetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  /** The repositories whose README has shown the Striff badge; null until the API has said. */
  const [badgeRepos, setBadgeRepos] = useState<{ repoOwner: string; repoName: string; seenAtMs: number }[] | null>(null);

  useEffect(() => {
    fetchBillingInfo();
    fetchBadgeRepos();
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

  /** For the checklist: whether any README of this account shows the badge yet. Quiet on failure. */
  async function fetchBadgeRepos() {
    try {
      const res = await fetch(`/.netlify/functions/metrics-proxy?view=badges&installation_id=${installation.id}`);
      if (!res.ok) return;
      const data = await res.json();
      // Only repositories this reader is shown: a private one the account covers but the reader
      // cannot see is not named here.
      if (Array.isArray(data.repos)) {
        const seen = new Set(repos.map((r) => r.full_name.toLowerCase()));
        setBadgeRepos(data.repos.filter((r: { repoOwner: string; repoName: string }) =>
          seen.has(`${r.repoOwner}/${r.repoName}`.toLowerCase())));
      }
    } catch {
      // Left unknown: the checklist says nothing rather than claim a step not taken.
    }
  }

  /** Selects a repository, a public one where there is one, and opens its badge panel. */
  function offerBadge() {
    const target = publicRepos[0] || repos[0];
    if (!target || !onOfferBadge) return;
    onOfferBadge(target.full_name);
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
      {/* Header row: rendered only when this card stands alone; the bar above names the
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

      {/* Repositories / Metrics / Billing tabs, when the tab row is not driving them */}
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
                  Manage repositories
                </a>
              </div>


              {/* What being listed here means, said once above the list it is about. Someone who
                  granted access to a repository should not first find out from a check appearing
                  on a colleague's pull request. */}
              <div className="repo-coverage">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.25" />
                  <path d="M8 7.25v3.5M8 5.1v.05" />
                </svg>
                <div>
                  <p className="repo-coverage-title">Striff checks every pull request in these repositories</p>
                  <p className="repo-coverage-body">
                    Each pull request opened or updated in a repository below receives a Striff check
                    on GitHub, with a diagram of its architectural changes and any conflicts with
                    your documented rules.
                    {hasNoPlan
                      ? " Private repositories are included once a plan is active."
                      : ""}{" "}
                    To add or remove repositories, use{" "}
                    <a href={manageReposUrl} target="_blank" rel="noopener noreferrer">
                      Manage repositories
                    </a>.
                  </p>
                </div>
              </div>

              {/* Repo grid */}
              {displayedRepos.length > 0 ? (
                <div className="repo-grid">
                  {displayedRepos.map((repo) => {
                    const [repoOwner, repoName] = repo.full_name.split("/");
                    const isActive = metrics?.activeRepos.some(
                      (r) => r.repoOwner === repoOwner && r.repoName === repoName && r.active
                    );
                    return (
                      <div key={repo.full_name} className="repo-card">
                        {/* The card is the target. The whole face opens the repository, so nobody
                            has to hit a link the width of its own text. */}
                        <button
                          type="button"
                          className="repo-card-face"
                          onClick={() => onOpenRepo?.(repo.full_name)}
                          disabled={!onOpenRepo}
                          title={onOpenRepo ? `Open ${repo.full_name}` : repo.full_name}
                        >
                          <span className="repo-card-name">
                            <span className="repo-card-owner">{repoOwner}/</span>
                            <span className="repo-card-repo">{repoName}</span>
                          </span>
                          <span className="repo-card-meta">
                            <span className={`repo-card-vis${repo.private ? " is-private" : ""}`}>
                              <RepoVisibilityIcon private={repo.private} />
                              {repo.private ? "Private" : "Public"}
                            </span>
                            {isActive && (
                              <span className="repo-card-active" title="Connected: Striff checks every pull request opened or updated here">
                                <span className="repo-card-dot" aria-hidden="true" />
                                Connected
                              </span>
                            )}
                          </span>
                        </button>
                        {/* The repository's badge, which opens its snippet over this list. */}
                        <RepoCardBadge installationId={installation.id} repo={repo} />
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repo-card-gh"
                          aria-label={`${repo.full_name} on GitHub`}
                          title="View on GitHub"
                        >
                          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                          </svg>
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
              <DocsTab installationId={installation.id} repos={repos} openRepo={openRepo} addressLink="dashboard" inShell={section !== undefined} actionsSlot={actionsSlot} badge={repoBadge} onOpenBilling={() => setInstallTab("billing")} />
            </div>
          ) : installTab === "checks" ? (
            <div className="mt-3 dashboard-metric-fade-in">
              <ChecksTab installationId={installation.id} repo={openRepo || ""} inShell={section !== undefined} actionsSlot={actionsSlot} badge={repoBadge} account={installation.account?.login || ""} isOrg={installation.account?.type === "Organization"} onSignedOut={signInAgain} onOpenAccountSettings={() => setInstallTab("settings")} appliesOnSubscribe={!!billingInfo && !billingInfo.hasSubscription && !!repos.find((r) => r.full_name === openRepo)?.private} />
            </div>
          ) : installTab === "settings" ? (
            <div className="mt-3 dashboard-metric-fade-in">
              <SettingsTab
                installationId={installation.id}
                account={installation.account?.login || ""}
                isOrg={installation.account?.type === "Organization"}
                repos={repos}
                hasPlan={billingInfo ? billingInfo.hasSubscription : null}
                focus={settingsFocus}
                onSignedOut={signInAgain}
              />
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
                      Try again
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
                      {billingState === "loading" ? "Loading…" : "Manage billing"}
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
                    Private repositories need a paid plan. Public repositories are always free.
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
                          {checkoutLoading === plan.id ? "Loading…" : "Subscribe"}
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
        Private repos count when Striff checks a pull request on them or reads their documents after a push. Plans start at $29 a month.
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

/** Questions shown before someone asks for the rest; eleven at once is a wall, not an answer. */
const FAQ_SHOWN = 5;

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const items: { q: string; a: string }[] = [
    {
      q: "How does Striff pricing work?",
      a: "Public repositories are free: no limits, no card. Private repositories need a plan at $29, $59 or $149 a month. Which one you pay follows how many private repos Striff worked on during your billing period, meaning it checked one of their pull requests or read their documents after a push. Connecting a repo is free, and a quiet month costs $29, the Starter price. Tier details are on the <a href=\"/pricing\" class=\"font-semibold text-blue-600 hover:underline\">pricing page</a>.",
    },
    {
      q: "What makes a repo billable?",
      a: "A private repo counts when, during your billing period, Striff checks one of its pull requests or reads its documents after a push. Connecting it doesn't count, and neither does the nightly re-check of rules Striff has already read.",
    },
    {
      q: "Does Striff read all my documents for free?",
      a: "Yes, as your team works. Striff reads your most important documents when you install it, and every pull request and push reads the documents about the code it changes, at no cost. A document about code nobody changes waits until someone does. A paid plan reads the rest at once. Documents Striff can't check anything in, like CLI references, release notes or contributor lists, are excluded on every plan, with the reason shown. Choose Read it anyway on one and Striff reads it the next time a pull request changes code it names.",
    },
    {
      q: "Does Striff comment on my pull requests, and can I turn that off?",
      a: "Striff can leave one comment on a pull request that breaks, fixes, adds or removes a documented rule, and updates it on each push. Each repository chooses on its Checks tab (repository admins only); a repository that hasn't chosen follows the default an account admin sets on the account's Notifications tab. Commenting needs the Pull requests: write permission on the installation. The same tab can fail the check when a pull request breaks a documented rule; make the check required in GitHub to block merging.",
    },
    {
      q: "I enabled 20 repos but Striff only worked on 3. What do I pay?",
      a: "You pay for the 3 Striff worked on, which is Starter ($29 a month), even though 20 are connected. The usage panel on your installation card lists them.",
    },
    {
      q: "Will I be charged automatically if I add more repos?",
      a: "Not for connecting them. Your plan follows how many private repos Striff works on: more than your plan covers moves you up, fewer moves you down, never below Starter. A change never applies mid-period; it shows on your next invoice.",
    },
    {
      q: "How do I enable Striff on private repositories?",
      a: "Open the <b>Repositories</b> tab on your installation card and click <b>\"Manage repositories\"</b> to open GitHub\u2019s App settings, where you can grant Striff access to specific private repositories. Then pick a plan in the <b>Billing</b> tab to enable analysis on private pull requests.",
    },
    {
      q: "When will I be charged?",
      a: "You are charged <b>on the day you subscribe</b>, then on the same date each month. You can see your next billing date and manage payment methods in the Stripe Customer Portal (the <b>Billing</b> tab on your installation card).",
    },
    {
      q: "How do I stop being charged?",
      a: "Open the <b>Billing</b> tab on your installation card and click <b>\"Manage billing\"</b> to open the Stripe portal and cancel your subscription. <b>You keep access until the end of your current billing period</b> \u2014 there is no immediate cutoff. Removing private repos from the GitHub App settings does not stop the charge: a subscribed installation pays at least the Starter price, so cancel in the portal to stop it.",
    },
    {
      q: "What happens if I cancel my subscription?",
      a: "<b>Public repository analysis continues for free</b> \u2014 that never changes. Private repository analysis is paused until you re-subscribe. Your data is retained, and you can reactivate at any time.",
    },
    {
      q: "Which languages does Striff support?",
      a: "Striff reads <b>Java, Kotlin, TypeScript, Python and C#</b>, with Go coming. Every language is parsed into a full structural model, not regex or text matching.",
    },
    {
      q: "What does Striff actually do on my pull requests?",
      a: "For each PR, Striff reads the architecture your repository already documents \u2014 ARCHITECTURE.md, ADRs, READMEs and design notes \u2014 turns each sentence about the code into a rule, and checks it against both revisions of the change, quoting the sentence and the line it came from. Alongside the rules it posts a <b>diagram of what changed</b> and <b>AI notes</b> on the components the PR touched. Results appear as a single <b>GitHub check-run</b>.",
    },
  ];

  return (
    <div className="dashboard-faq">
      <h2 className="text-xl font-bold text-slate-950">Frequently asked questions</h2>
      <div className="mt-4 space-y-2">
        {(showAll ? items : items.slice(0, FAQ_SHOWN)).map((item, i) => (
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
      {items.length > FAQ_SHOWN && (
        <button
          type="button"
          className="dashboard-faq-more"
          aria-expanded={showAll}
          onClick={() => {
            // Collapsing with a question open would leave an answer hanging under the button.
            if (showAll) setOpen(null);
            setShowAll(!showAll);
          }}
        >
          {showAll
            ? "Show fewer questions"
            : `Show ${items.length - FAQ_SHOWN} more question${items.length - FAQ_SHOWN === 1 ? "" : "s"}`}
          <svg
            className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
