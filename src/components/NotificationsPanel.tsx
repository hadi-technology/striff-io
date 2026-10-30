import { useEffect, useState, type ReactNode } from "react";
import { settingsParts, words } from "../lib/checkSettings.js";
import {
  choosesNoRepos,
  formFromApi,
  isDirty,
  saveBody,
  showsAdminControls,
} from "../lib/notificationSettings.js";

interface Form {
  enabled: boolean;
  scope: "ALL" | "REPOS";
  repos: string[];
  installationEnabled: boolean;
  defaultForNewRepos: boolean;
}

const PROXY = "/.netlify/functions/notifications";

/**
 * A labelled on/off control, drawn like the rule switch. Where `disabledReason` is given the
 * switch stays focusable and says why it cannot be used, instead of being disabled.
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabledReason,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: ReactNode;
  disabledReason?: string | null;
}) {
  return (
    <div className="notif-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabledReason ? true : undefined}
        title={disabledReason || undefined}
        className={`rule-switch${checked ? "" : " is-off"}${disabledReason ? " is-blocked" : ""}`}
        onClick={() => {
          if (!disabledReason) onChange(!checked);
        }}
      >
        <span className="rule-switch-track" aria-hidden="true"><span className="rule-switch-knob" /></span>
      </button>
      <div className="notif-row-text">
        <p className="notif-row-label">{label}</p>
        {hint && <p className="notif-row-hint">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Who in this installation is emailed when a documented rule breaks: the signed-in person's own
 * settings, and for an admin the installation-wide ones. Saves with an explicit button.
 */
export default function NotificationsPanel({
  installationId,
  account,
  isOrg,
  repos,
  onSignedOut,
}: {
  installationId: number;
  /** The GitHub account the app is installed on, by login. */
  account: string;
  /** Whether that account is an organisation rather than a person. */
  isOrg: boolean;
  /** The installation's repositories, as full names. */
  repos: string[];
  onSignedOut: (onBlocked: () => void) => void;
}) {
  const w = words(isOrg);
  const parts = settingsParts(isOrg ? "Organization" : "User");
  const accountName = isOrg && account ? account : "your account";
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [admin, setAdmin] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    load();
  }, [installationId]);

  async function load() {
    setLoadError("");
    try {
      const res = await fetch(`${PROXY}?installation_id=${installationId}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onSignedOut(() => setLoadError("Your session ended. Sign in again to see these settings."));
        return;
      }
      if (!res.ok) {
        setLoadError(data.error || "Couldn't load your notification settings.");
        return;
      }
      const next = formFromApi(data);
      setSaved(next);
      setForm(next);
      setAdmin(showsAdminControls(data));
      setUnsubscribed(Boolean(data.unsubscribedAll));
    } catch {
      setLoadError("Couldn't load your notification settings.");
    }
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setSaveError("");
    setJustSaved(false);
    try {
      const res = await fetch(PROXY, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // The installation-wide fields are an organization's; a personal account never sends them.
        body: JSON.stringify(saveBody(installationId, form, admin && parts.forEveryone)),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onSignedOut(() => setSaveError("Your session ended. Sign in again to save."));
        return;
      }
      if (!res.ok) {
        setSaveError(data.message || data.error || "Couldn't save. Try again.");
        return;
      }
      setSaved(form);
      setUnsubscribed(false);
      setJustSaved(true);
    } catch {
      setSaveError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!form || !saved) {
    return loadError ? (
      <p className="mt-3 px-3 py-6 text-center text-sm text-slate-500">
        {loadError}{" "}
        <button type="button" onClick={load} className="font-semibold text-blue-600 hover:underline">
          Try again
        </button>
      </p>
    ) : (
      <p className="mt-3 px-3 py-6 text-center text-sm text-slate-500">Loading notifications…</p>
    );
  }

  const change = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setJustSaved(false);
  };
  const toggleRepo = (name: string, on: boolean) =>
    change({ repos: on ? [...form.repos, name] : form.repos.filter((r) => r !== name) });
  const dirty = isDirty(form, saved);

  return (
    <div className="notif-panel" id="settings-notifications">
      <h3 className="settings-heading">Notifications</h3>

      {parts.forEveryone && !form.installationEnabled && (
        <p className="notif-note" role="status">
          Break notices are turned off for {w.everyone}.
        </p>
      )}
      {unsubscribed && (
        <p className="notif-note" role="status">
          You unsubscribed from these emails. Turn this on and save to get them again.
        </p>
      )}

      <p className="notif-legend settings-sub">Your emails</p>
      <p className="notif-row-hint">
        When a push to the default branch breaks a rule from your docs, Striff can email you with
        what broke and where.
      </p>
      <Switch
        checked={form.enabled}
        onChange={(enabled) => change({ enabled })}
        label="Email me when a push breaks a documented rule"
        hint="Off until you turn it on. Pull requests are covered by the check and the comment."
      />

      {form.enabled && (
        <fieldset className="notif-scope">
          <legend className="notif-legend">Which repositories</legend>
          <label className="notif-choice">
            <input
              type="radio"
              name={`scope-${installationId}`}
              checked={form.scope === "ALL"}
              onChange={() => change({ scope: "ALL" })}
            />
            <span>All repositories</span>
          </label>
          <label className="notif-choice">
            <input
              type="radio"
              name={`scope-${installationId}`}
              checked={form.scope === "REPOS"}
              onChange={() => change({ scope: "REPOS" })}
            />
            <span>Only the ones I choose</span>
          </label>
          {form.scope === "REPOS" && (
            repos.length === 0 ? (
              <p className="notif-row-hint">No repositories in {accountName} yet.</p>
            ) : (
              <ul className="notif-repos" aria-label="Repositories to get emails for">
                {repos.map((name) => (
                  <li key={name}>
                    <label className="notif-choice">
                      <input
                        type="checkbox"
                        checked={form.repos.includes(name)}
                        onChange={(e) => toggleRepo(name, e.target.checked)}
                      />
                      <span className="notif-repo-name">{name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          )}
          {choosesNoRepos(form) && (
            <p className="notif-row-hint">Pick at least one repository, or you won't get any emails.</p>
          )}
        </fieldset>
      )}

      {parts.forEveryone && (
        <div className="notif-admin">
          <p className="notif-legend settings-sub">For everyone</p>
          <Switch
            checked={form.defaultForNewRepos}
            onChange={(defaultForNewRepos) => change({ defaultForNewRepos })}
            label="New people get emails for all repositories"
            hint="Once someone turns on their emails, they start with every repository."
            disabledReason={admin ? null : w.onlyOwners}
          />
          <Switch
            checked={!form.installationEnabled}
            onChange={(off) => change({ installationEnabled: !off })}
            label="Turn off break notices for everyone"
            hint="No emails and no commit checks when a push breaks a documented rule."
            disabledReason={admin ? null : w.onlyOwners}
          />
          {!admin && <p className="notif-row-hint">{w.onlyOwners}</p>}
        </div>
      )}

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

    </div>
  );
}
