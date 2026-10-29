// The Checks tab's settings for pull-request comments and fail-on-break, and the Notifications
// tab's account default: what striff-api's GET answers, the form state the panels edit, and the
// body a save sends. Kept apart from the components so the rules are testable without a build.

/** The form state for a repository's API answer. */
export function repoFormFromApi(data) {
  return {
    comments: data?.prComments === true,
    following: data?.followingDefault === true || data?.prCommentsChoice == null,
    failOnBreak: data?.failOnBreak === true,
  };
}

/** Whether the form differs from what was last loaded or saved. */
export function repoFormDirty(form, saved) {
  if (!form || !saved) return false;
  return form.comments !== saved.comments
    || form.following !== saved.following
    || form.failOnBreak !== saved.failOnBreak;
}

/**
 * The body of a repository save: only what changed. Going back to following the account sends
 * null for the comment setting, which the API reads as "no choice of its own".
 */
export function repoSaveBody(form, saved) {
  const body = {};
  if (form.comments !== saved.comments || form.following !== saved.following) {
    body.prComments = form.following ? null : form.comments;
  }
  if (form.failOnBreak !== saved.failOnBreak) body.failOnBreak = form.failOnBreak;
  return body;
}

/**
 * The 30-day activity line, or "" where there is nothing to say: both counts zero, or an answer
 * that could not be read (never shown as zero).
 */
export function activityLine(activity) {
  if (!activity || activity.available !== true) return "";
  const commented = Number(activity.commented) || 0;
  const deleted = Number(activity.deleted) || 0;
  if (commented === 0 && deleted === 0) return "";
  const days = Number(activity.days) || 30;
  const parts = [`Commented on ${commented} pull request${commented === 1 ? "" : "s"} in the last ${days} days`];
  if (deleted > 0) parts.push(`${deleted} comment${deleted === 1 ? " was" : "s were"} deleted`);
  return parts.join(" · ");
}

/** Whether the installation lacks Pull requests: write, which comments need. */
export function permissionMissing(data) {
  return data?.pullRequestsPermissionMissing === true;
}

/**
 * Where the installation's permissions are changed on GitHub: an organization's owners use the
 * organization's page, a person uses their own.
 */
export function installationSettingsUrl(installationId, account, isOrg) {
  return isOrg && account
    ? `https://github.com/organizations/${encodeURIComponent(account)}/settings/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`;
}

/** The form state for the account answer. */
export function accountFormFromApi(data) {
  return { prCommentsDefault: data?.prCommentsDefault === true };
}
