import { useEffect, useState } from "react";
import ChoiceSelect from "./ChoiceSelect";
import {
  APPLIES_FROM,
  activityLine,
  mayOpenAccountSettings,
  repoLocked,
  words,
  installationSettingsUrl,
  permissionMissing,
  repoFormDirty,
  repoFormFromApi,
  repoSaveBody,
} from "../lib/checkSettings.js";

const PROXY = "/.netlify/functions/doc-catalog-proxy";
const READ_ONLY = "Only repository admins can change this.";

interface Settings {
  prComments: boolean;
  prCommentsChoice: boolean | null;
  accountDefault: boolean;
  failOnBreak: boolean;
  failOnBreakChoice: boolean | null;
  accountFailOnBreakDefault: boolean;
  locked: boolean;
  canManageInstallation: boolean;
  commentsAvailable: boolean;
  pullRequestsPermissionMissing: boolean;
  activity?: { available: boolean; days?: number; commented?: number; deleted?: number };
}

/**
 * What a repository's check does on its pull requests: whether Striff comments, and whether the
 * check fails when a pull request breaks a documented rule. Anyone who sees the repository sees
 * the settings; only its admins change them, with an explicit Save.
 */
export default function CheckSettings({
  installationId,
  repo,
  account,
  isOrg,
  onSignedOut,
  onOpenAccountSettings,
  appliesOnSubscribe,
}: {
  installationId: number;
  /** The repository, "owner/name". */
  repo: string;
  /** The GitHub account the app is installed on, by login, for the link to its settings. */
  account?: string;
  isOrg?: boolean;
  onSignedOut?: (onBlocked: () => void) => void;
  /** Opens the account's Settings tab. */
  onOpenAccountSettings?: () => void;
  /** Whether the repository is private and its account has no plan, so nothing applies yet. */
  appliesOnSubscribe?: boolean;
}) {
  const [owner, name] = repo.split("/");
  const [data, setData] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<ReturnType<typeof repoFormFromApi> | null>(null);
  const [form, setForm] = useState<ReturnType<typeof repoFormFromApi> | null>(null);
  /** Whether this reader administers the repository: null until GitHub has said. */
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const query = `installation_id=${installationId}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`;

  useEffect(() => {
    let current = true;
    setData(null);
    setSaved(null);
    setForm(null);
    setAdmin(null);
    setLoadError("");
    setSaveError("");
    setJustSaved(false);
    fetch(`${PROXY}?view=check-settings&${query}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!current) return;
        if (res.status === 401 && onSignedOut) {
          onSignedOut(() => setLoadError("Your session ended. Sign in again to see these settings."));
          return;
        }
        if (!res.ok) {
          setLoadError(body.message || body.error || "Couldn't load the settings.");
          return;
        }
        const next = repoFormFromApi(body);
        setData(body);
        setSaved(next);
        setForm(next);
      })
      .catch(() => current && setLoadError("Couldn't load the settings."));
    fetch(`${PROXY}?view=permissions&${query}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((answer) => current && setAdmin(answer ? !!answer.canManageRules : null))
      .catch(() => {
        // Unknown leaves the switches read-only; a write would be refused if it should be.
      });
    return () => {
      current = false;
    };
  }, [installationId, repo]);

  async function save() {
    if (!form || !saved) return;
    setBusy(true);
    setSaveError("");
    setJustSaved(false);
    try {
      const res = await fetch(`${PROXY}?view=check-settings&${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repoSaveBody(form, saved)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 && onSignedOut) {
        onSignedOut(() => setSaveError("Your session ended. Sign in again to save."));
        return;
      }
      if (!res.ok) {
        setSaveError(body.message || body.error || "Couldn't save. Try again.");
        return;
      }
      const next = repoFormFromApi(body);
      setData(body);
      setSaved(next);
      setForm(next);
      setJustSaved(true);
    } catch {
      setSaveError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data || !form || !saved) {
    return (
      <section className="check-settings" aria-label="Pull request settings">
        {loadError ? (
          <p className="notif-error" role="alert">{loadError}</p>
        ) : (
          <p className="dashboard-metric-caption">Loading settings…</p>
        )}
      </section>
    );
  }

  // The installation's account type, as the API reports it; a personal account has no lock.
  const org = data.accountType ? data.accountType === "Organization" : !!isOrg;
  const locked = org && repoLocked(data);
  const w = words(org);
  const canEdit = admin === true && !locked;
  const blocked = canEdit ? null
    : locked ? w.lockedAsk
    : admin === false ? READ_ONLY : "Checking whether you administer this repository.";
  const dirty = repoFormDirty(form, saved);
  const change = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setJustSaved(false);
  };
  const activity = activityLine(data.activity);
  // What the first option resolves to: the account's setting, and for comments also whether the
  // service has them available at all.
  const commentsDefault = data.commentsAvailable !== false && data.accountDefault === true;

  return (
    <section className="check-settings" aria-label="Pull request settings">
      {permissionMissing(data) && (
        <p className="notif-note check-settings-note" role="status">
          Striff can't comment on pull requests until the installation grants Pull requests: write.{" "}
          <a
            href={installationSettingsUrl(installationId, account, isOrg)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the installation's settings
          </a>
          .
        </p>
      )}
      {data.commentsAvailable === false && (
        <p className="notif-row-hint">Pull request comments aren't available for this repository yet.</p>
      )}
      {locked && (
        <p className="notif-row-hint check-settings-readonly" role="status">
          {w.lockedAsk}
          {mayOpenAccountSettings(data) && onOpenAccountSettings && (
            <>
              {" "}
              <button type="button" className="check-settings-link" onClick={onOpenAccountSettings}>
                Change in account settings
              </button>
            </>
          )}
        </p>
      )}

      <div className="notif-row check-settings-choice">
        <div className="notif-row-text">
          <p className="notif-row-label">Comment on pull requests</p>
          <p className="notif-row-hint">
            One comment when a pull request breaks, fixes, adds or removes a documented rule,
            updated on each push.
          </p>
        </div>
        <ChoiceSelect
          value={form.comments}
          onChange={(comments) => change({ comments })}
          label="Comment on pull requests"
          resolved={commentsDefault}
          isOrg={org}
          blockedReason={blocked}
        />
      </div>
      <div className="notif-row check-settings-choice">
        <div className="notif-row-text">
          <p className="notif-row-label">Fail the check when a pull request breaks a documented rule</p>
          <p className="notif-row-hint">
            Only rules this pull request breaks. Rules that were already broken, or that couldn't be
            checked, never fail it. Make the check required to block merging.
          </p>
        </div>
        <ChoiceSelect
          value={form.failOnBreak}
          onChange={(failOnBreak) => change({ failOnBreak })}
          label="Fail the check when a pull request breaks a documented rule"
          resolved={data.accountFailOnBreakDefault === true}
          isOrg={org}
          blockedReason={blocked}
        />
      </div>
      <p className="notif-row-hint">{APPLIES_FROM}</p>
      {appliesOnSubscribe && <p className="notif-row-hint">These apply once you subscribe.</p>}

      {admin === false && !locked && <p className="notif-row-hint check-settings-readonly">{READ_ONLY}</p>}

      {canEdit && (
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

      {data.activity?.available === false && (
        <p className="notif-row-hint check-settings-activity">Recent comment activity isn't available right now.</p>
      )}
      {activity && <p className="notif-row-hint check-settings-activity">{activity}</p>}
    </section>
  );
}

