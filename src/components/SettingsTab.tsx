import { useEffect, useState } from "react";
import NotificationsPanel, { Switch } from "./NotificationsPanel";
import ChoiceSelect from "./ChoiceSelect";
import {
  APPLIES_FROM,
  accountFormDirty,
  accountFormFromApi,
  accountSaveSteps,
  failOnBreakHelp,
  installationSettingsUrl,
  lastChangedLine,
  needsSignIn,
  permissionMissing,
  readOnlyNote,
  searchRepos,
  settingsParts,
  tableRepos,
  words,
} from "../lib/checkSettings.js";

const PROXY = "/.netlify/functions/check-settings";

interface DashboardRepo {
  full_name: string;
  private: boolean;
  archived?: boolean;
}

type Form = ReturnType<typeof accountFormFromApi>;

/**
 * The account's Settings tab: the pull-request check settings every repository follows unless it
 * chose for itself, and the break emails. Everyone in the account sees both; the API says who may
 * change the account's.
 */
export default function SettingsTab({
  installationId,
  account,
  isOrg,
  repos,
  hasPlan,
  focus,
  onSignedOut,
}: {
  installationId: number;
  account: string;
  isOrg: boolean;
  /** The repositories the dashboard loaded, with their visibility. */
  repos: DashboardRepo[];
  /** Whether the account has a plan; null while the dashboard has not heard. */
  hasPlan: boolean | null;
  /** The section a link asked to land on. */
  focus?: "notifications" | "checks" | null;
  onSignedOut: (onBlocked: () => void) => void;
}) {
  useEffect(() => {
    if (!focus) return;
    const id = focus === "notifications" ? "settings-notifications" : "settings-checks";
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ block: "start" }), 300);
  }, [focus]);
  return (
    <div className="settings-tab">
      <PullRequestChecks
        installationId={installationId}
        account={account}
        isOrg={isOrg}
        repos={repos}
        hasPlan={hasPlan}
        onSignedOut={onSignedOut}
      />
      <NotificationsPanel
        installationId={installationId}
        account={account}
        isOrg={isOrg}
        repos={repos.map((r) => r.full_name)}
        onSignedOut={onSignedOut}
      />
    </div>
  );
}

function PullRequestChecks({
  installationId,
  account,
  isOrg,
  repos,
  hasPlan,
  onSignedOut,
}: {
  installationId: number;
  account: string;
  isOrg: boolean;
  repos: DashboardRepo[];
  hasPlan: boolean | null;
  onSignedOut: (onBlocked: () => void) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [query, setQuery] = useState("");

  function take(body: any) {
    const next = accountFormFromApi(body);
    setData(body);
    setSaved(next);
    setForm(next);
  }

  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    fetch(`${PROXY}?installation_id=${installationId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!current) return;
        if (res.status === 401) {
          onSignedOut(() => setError("Your session ended. Sign in again to see these settings."));
          return;
        }
        if (!res.ok) {
          setError(body.message || body.error || "Couldn't load these settings.");
          return;
        }
        take(body);
      })
      .catch(() => current && setError("Couldn't load these settings."));
    return () => {
      current = false;
    };
  }, [installationId]);

  async function put(payload: object) {
    const res = await fetch(PROXY, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installation_id: installationId, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  }

  async function save() {
    if (!form || !saved) return;
    setBusy(true);
    setSaveError("");
    setJustSaved(false);
    try {
      const steps = accountSaveSteps(form, saved);
      let latest: any = null;
      const calls: object[] = [...(steps.account ? [steps.account] : []), ...steps.repos];
      for (const call of calls) {
        const { res, body } = await put(call);
        if (res.status === 401 && body.code !== "github_login_required") {
          onSignedOut(() => setSaveError("Your session ended. Sign in again to save."));
          return;
        }
        if (!res.ok) {
          setSaveError(body.code === "github_login_required"
            ? "Sign in with GitHub to change these settings."
            : body.message || body.error || "Couldn't save. Try again.");
          return;
        }
        latest = body;
      }
      // The last answer to an account write carries the whole picture; a repository write's does
      // not, so the page is read again to show what is stored.
      const res = await fetch(`${PROXY}?installation_id=${installationId}`);
      take(res.ok ? await res.json() : latest ?? data);
      setJustSaved(true);
    } catch {
      setSaveError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data || !form || !saved) {
    return (
      <section className="notif-panel" id="settings-checks" aria-label="Pull request checks">
        <h3 className="settings-heading">Pull request checks</h3>
        {error ? <p className="notif-error" role="alert">{error}</p>
          : <p className="dashboard-metric-caption">Loading settings…</p>}
      </section>
    );
  }

  // The account type is the installation's, as the API reports it.
  const org = data.accountType ? data.accountType === "Organization" : isOrg;
  const w = words(org);
  const parts = settingsParts(org ? "Organization" : "User");
  const note = readOnlyNote(data, org);
  // Whom the settings belong to is not a thing to say on a personal account.
  const shownNote = note && (parts.ownersNote || data.adminCheck !== "not_admin") ? note : null;
  const editable = note === null;
  const dirty = accountFormDirty(form, saved);
  const change = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setJustSaved(false);
  };
  const rows = tableRepos(data.repositories, repos, hasPlan);
  const shown = searchRepos(rows, query);
  const changed = lastChangedLine(data.checkSettingsUpdatedBy, data.checkSettingsUpdatedAt);
  const commentsOn = data.commentsAvailable !== false;
  const setRow = (repo: string, patch: Partial<Form["rows"][string]>) =>
    change({ rows: { ...form.rows, [repo]: { ...form.rows[repo], ...patch } } });

  return (
    <section className="notif-panel" id="settings-checks" aria-label="Pull request checks">
      <h3 className="settings-heading">Pull request checks</h3>
      <p className="notif-row-hint">
        What Striff does on pull requests in {account && org ? account : "your account"}. A
        repository can follow these or choose for itself on its Checks tab.
      </p>
      {permissionMissing(data) && (
        <p className="notif-note" role="status">
          Striff can't comment on pull requests until the installation grants Pull requests: write.{" "}
          <a href={installationSettingsUrl(installationId, account, isOrg)} target="_blank" rel="noopener noreferrer">
            Open the installation's settings
          </a>
          .
        </p>
      )}
      {!commentsOn && <p className="notif-row-hint">Pull request comments aren't available yet.</p>}

      <Switch
        checked={form.prCommentsDefault}
        onChange={(prCommentsDefault) => change({ prCommentsDefault })}
        label="Comment on pull requests"
        hint="One comment when a pull request breaks, fixes, adds or removes a documented rule, updated on each push."
        disabledReason={note}
      />
      <Switch
        checked={form.failOnBreakDefault}
        onChange={(failOnBreakDefault) => change({ failOnBreakDefault })}
        label="Fail the check when a pull request breaks a documented rule"
        hint={failOnBreakHelp(org)}
        disabledReason={note}
      />
      {parts.lock && data.lockAvailable && (
        <Switch
          checked={!form.repoSettingsLocked}
          onChange={(open) => change({ repoSettingsLocked: !open })}
          label="Let repository admins change these settings"
          hint="When off, only organization owners can change them, from here."
          disabledReason={note}
        />
      )}
      {shownNote && (
        <p className="notif-row-hint settings-readonly" role="status">
          {shownNote}
          {needsSignIn(data) && (
            <>
              {" "}
              <button
                type="button"
                className="check-settings-link"
                onClick={() => onSignedOut(() => setSaveError("Sign in with GitHub to change these settings."))}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      )}

      <p className="notif-legend settings-sub">Repositories</p>
      {data.repositoriesAvailable === false ? (
        <p className="notif-row-hint">Couldn't load the list of repositories. Reload to try again.</p>
      ) : (
        <>
          <input
            type="search"
            className="settings-search"
            placeholder="Search repositories"
            aria-label="Search repositories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col">Comment</th>
                  <th scope="col">Fail on break</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const row = form.rows[r.fullName];
                  if (!row) return null;
                  // Editable: a repository without a plan keeps its settings, and they apply once it has one.
                  const why = note;
                  return (
                    <tr key={r.fullName}>
                      <th scope="row">
                        <span className="notif-repo-name">{r.fullName}</span>
                        {r.needsPlan && <span className="settings-unchecked">Applies once you subscribe</span>}
                      </th>
                      <td data-label="Comment">
                        <ChoiceSelect
                          value={row.comments}
                          onChange={(comments) => setRow(r.fullName, { comments })}
                          label={`Comment on pull requests in ${r.fullName}`}
                          resolved={commentsOn && form.prCommentsDefault}
                          isOrg={org}
                          blockedReason={why}
                        />
                      </td>
                      <td data-label="Fail on break">
                        <ChoiceSelect
                          value={row.failOnBreak}
                          onChange={(failOnBreak) => setRow(r.fullName, { failOnBreak })}
                          label={`Fail the check on a break in ${r.fullName}`}
                          resolved={form.failOnBreakDefault}
                          isOrg={org}
                          blockedReason={why}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && (
            <p className="notif-row-hint">{rows.length === 0 ? "No repositories yet." : "No repository matches."}</p>
          )}
          {data.repositoriesComplete === false && (
            <p className="notif-row-hint">Showing the first {rows.length} repositories.</p>
          )}
          <p className="notif-row-hint">{w.newRepos}</p>
        </>
      )}

      <p className="notif-row-hint">{APPLIES_FROM}</p>
      {changed && parts.lastChanged && <p className="notif-row-hint settings-changed">{changed}</p>}

      {editable && (
        <div className="notif-actions">
          <button
            type="button"
            className="dashboard-button dashboard-button-primary disabled:opacity-50"
            disabled={!dirty || busy}
            onClick={save}
          >
            Save
          </button>
          {justSaved && !dirty && <span className="notif-saved" role="status">Saved.</span>}
          {saveError && <span className="notif-error" role="alert">{saveError}</span>}
        </div>
      )}
      {!editable && saveError && <p className="notif-error" role="alert">{saveError}</p>}
    </section>
  );
}
