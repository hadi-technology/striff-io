import { useEffect, useState, type ReactNode } from "react";
import {
  accountFormFromApi,
} from "../lib/checkSettings.js";
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
  const accountName = isOrg && account ? account : "your account";
  const everyone = isOrg && account ? `everyone at ${account}` : "everyone on your account";
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
        body: JSON.stringify(saveBody(installationId, form, admin)),
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
    <div className="notif-panel">
      <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
      <p className="mt-1 text-sm text-slate-500">
        When a push to the default branch breaks a rule from your docs, Striff emails you with
        what broke and where. Breaks it finds in code that was already there come in one daily
        summary.
      </p>

      {!form.installationEnabled && (
        <p className="notif-note" role="status">
          Break emails are turned off for {everyone}.
        </p>
      )}
      {unsubscribed && (
        <p className="notif-note" role="status">
          You unsubscribed from these emails. Turn this on and save to get them again.
        </p>
      )}

      <Switch
        checked={form.enabled}
        onChange={(enabled) => change({ enabled })}
        label="Email me when a documented rule breaks"
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

      {admin && (
        <div className="notif-admin">
          <p className="notif-legend">For {everyone}</p>
          <Switch
            checked={form.defaultForNewRepos}
            onChange={(defaultForNewRepos) => change({ defaultForNewRepos })}
            label="New people get emails for all repositories"
            hint={`Anyone who signs in to Striff for ${accountName} after this starts with every repository on.`}
          />
          <Switch
            checked={!form.installationEnabled}
            onChange={(off) => change({ installationEnabled: !off })}
            label={`Turn off break emails for ${everyone}`}
            hint="No one gets them, whatever they chose."
          />
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

      {admin && (
        <PullRequestCommentsDefault installationId={installationId} onSignedOut={onSignedOut} />
      )}
    </div>
  );
}

const CHECK_SETTINGS_PROXY = "/.netlify/functions/check-settings";

/**
 * The account's default for whether Striff comments on pull requests, for the repositories that
 * haven't chosen. Shown only to the account's administrators and saved on its own, since it is
 * the account's setting and not the signed-in person's.
 */
function PullRequestCommentsDefault({
  installationId,
  onSignedOut,
}: {
  installationId: number;
  onSignedOut: (onBlocked: () => void) => void;
}) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [value, setValue] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let current = true;
    setSaved(null);
    setError("");
    fetch(`${CHECK_SETTINGS_PROXY}?installation_id=${installationId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!current) return;
        if (res.status === 401) {
          onSignedOut(() => setError("Your session ended. Sign in again to see this setting."));
          return;
        }
        if (!res.ok) {
          setError(data.message || data.error || "Couldn't load this setting.");
          return;
        }
        const next = accountFormFromApi(data).prCommentsDefault;
        setSaved(next);
        setValue(next);
      })
      .catch(() => current && setError("Couldn't load this setting."));
    return () => {
      current = false;
    };
  }, [installationId]);

  async function save() {
    setBusy(true);
    setError("");
    setJustSaved(false);
    try {
      const res = await fetch(CHECK_SETTINGS_PROXY, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: installationId, prCommentsDefault: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        onSignedOut(() => setError("Your session ended. Sign in again to save."));
        return;
      }
      if (!res.ok) {
        setError(data.message || data.error || "Couldn't save. Try again.");
        return;
      }
      const next = accountFormFromApi(data).prCommentsDefault;
      setSaved(next);
      setValue(next);
      setJustSaved(true);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved === null) {
    return error ? <p className="notif-error notif-pr-default" role="alert">{error}</p> : null;
  }
  const dirty = value !== saved;
  return (
    <div className="notif-admin" data-testid="pr-comments-default">
      <p className="notif-legend">Pull request comments</p>
      <Switch
        checked={value}
        onChange={(next) => {
          setValue(next);
          setJustSaved(false);
        }}
        label="Comment on pull requests in repositories that haven't chosen"
        hint="Each repository can choose for itself on its Checks tab."
      />
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
        {error && <span className="notif-error" role="alert">{error}</span>}
      </div>
    </div>
  );
}
