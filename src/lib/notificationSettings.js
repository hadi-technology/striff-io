// The Notifications panel's settings: what striff-api's GET answers, the form state the panel
// edits, and the body a save sends. Kept apart from the component so the rules are testable.

/**
 * The form state for an API answer.
 *
 * A person who unsubscribed from everything through an email link shows as off, whatever else
 * their row holds; turning the switch on and saving brings the emails back.
 */
export function formFromApi(data) {
  const scope = data?.scope === "REPOS" ? "REPOS" : "ALL";
  return {
    enabled: Boolean(data?.enabled) && !data?.unsubscribedAll,
    scope,
    repos: Array.isArray(data?.repos) ? [...data.repos] : [],
    installationEnabled: data?.installationEnabled !== false,
    defaultForNewRepos: Boolean(data?.defaultForNewRepos),
  };
}

/** Whether the installation-wide controls are shown: only to someone who may manage it. */
export function showsAdminControls(data) {
  return data?.canManageInstallation === true;
}

/** Whether the form differs from what was last loaded or saved. */
export function isDirty(form, saved) {
  if (!form || !saved) return false;
  const sorted = (list) => [...list].sort().join("\n");
  if (form.enabled !== saved.enabled || form.scope !== saved.scope) return true;
  if (form.scope === "REPOS" && sorted(form.repos) !== sorted(saved.repos)) return true;
  return form.installationEnabled !== saved.installationEnabled
    || form.defaultForNewRepos !== saved.defaultForNewRepos;
}

/**
 * The body of a save. The installation-wide fields go only for someone who may manage the
 * installation; the API refuses them from anyone else.
 */
export function saveBody(installationId, form, admin) {
  const body = {
    installation_id: installationId,
    enabled: form.enabled,
    scope: form.scope,
    repos: form.scope === "REPOS" ? form.repos : [],
  };
  if (admin) {
    body.installationEnabled = form.installationEnabled;
    body.defaultForNewRepos = form.defaultForNewRepos;
  }
  return body;
}

/** Whether a person who chose repositories but ticked none would get no emails at all. */
export function choosesNoRepos(form) {
  return form.enabled && form.scope === "REPOS" && form.repos.length === 0;
}
