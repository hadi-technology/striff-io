// The pull-request check settings of the dashboard: the repository Checks tab's selects, the
// account Settings tab's defaults, lock and repository table, and the account links that reach the
// tab. What striff-api's GETs answer, the form state the components edit, and the body a save
// sends are kept apart from the components so the rules are testable without a build.

/** The three choices of a setting a repository may leave to its account. */
export const CHOICES = ["default", "on", "off"];

/** The choice a stored value is: null follows the account. */
export function choiceOf(value) {
  return value === true ? "on" : value === false ? "off" : "default";
}

/** The stored value a choice is. */
export function valueOfChoice(choice) {
  return choice === "on" ? true : choice === "off" ? false : null;
}

/**
 * The words that name the account. An organization has owners and settings of its own; a personal
 * account is just its owner's. One set is used throughout so the two never mix.
 */
export function words(isOrg) {
  return isOrg
    ? {
      noun: "organization",
      useSetting: "Use organization setting",
      setBy: "Set by your organization.",
      lockedAsk: "Set by your organization. Ask an organization owner to change it.",
      onlyOwners: "Only organization owners can change this.",
      everyone: "everyone in your organization",
      newRepos: "New repositories use the organization setting.",
      applies: "every repository that uses the organization setting",
    }
    : {
      noun: "account",
      useSetting: "Use account setting",
      setBy: "Set by your account.",
      lockedAsk: "Set by your account.",
      onlyOwners: "Only the account owner can change this.",
      everyone: "everyone on your account",
      newRepos: "New repositories use the account setting.",
      applies: "every repository that uses the account setting",
    };
}

/** The first option's label, with what it resolves to: "Use organization setting (Off)". */
export function defaultOptionLabel(isOrg, resolved) {
  return `${words(isOrg).useSetting} (${resolved ? "On" : "Off"})`;
}

/** The help under the account's fail-on-break default. */
export function failOnBreakHelp(isOrg) {
  return `Applies to ${words(isOrg).applies}. Blocks merging only where the Striff check is required. `
    + "Takes effect on each pull request's next check.";
}

/** The line every pull-request settings section carries. */
export const APPLIES_FROM = "Changes apply from each pull request's next check.";

/** The form state for a repository's API answer. */
export function repoFormFromApi(data) {
  return {
    comments: choiceOf(data?.prCommentsChoice),
    failOnBreak: choiceOf(data?.failOnBreakChoice),
  };
}

/** Whether the form differs from what was last loaded or saved. */
export function repoFormDirty(form, saved) {
  if (!form || !saved) return false;
  return form.comments !== saved.comments || form.failOnBreak !== saved.failOnBreak;
}

/**
 * The body of a repository save: only what changed, each as true, false or null (null: use the
 * account's setting).
 */
export function repoSaveBody(form, saved) {
  const body = {};
  if (form.comments !== saved.comments) body.prComments = valueOfChoice(form.comments);
  if (form.failOnBreak !== saved.failOnBreak) body.failOnBreak = valueOfChoice(form.failOnBreak);
  return body;
}

/** Whether the account has taken the settings out of the repositories' hands. */
export function repoLocked(data) {
  return data?.locked === true;
}

/** Whether the repository's page may link to the account's settings: only for an account admin. */
export function mayOpenAccountSettings(data) {
  return data?.canManageInstallation === true;
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
  const rows = {};
  for (const repo of Array.isArray(data?.repositories) ? data.repositories : []) {
    rows[repo.fullName] = { comments: choiceOf(repo.prComments), failOnBreak: choiceOf(repo.failOnBreak) };
  }
  return {
    prCommentsDefault: data?.prCommentsDefault === true,
    failOnBreakDefault: data?.failOnBreakDefault === true,
    repoSettingsLocked: data?.repoSettingsLocked === true,
    rows,
  };
}

/** Whether the account form differs from what was last loaded or saved. */
export function accountFormDirty(form, saved) {
  return accountSaveSteps(form, saved).account !== null || accountSaveSteps(form, saved).repos.length > 0;
}

/**
 * What a save sends: one account write for the defaults and lock that changed (null where none
 * did), and one write for each repository whose row changed.
 */
export function accountSaveSteps(form, saved) {
  const account = {};
  for (const key of ["prCommentsDefault", "failOnBreakDefault", "repoSettingsLocked"]) {
    if (form[key] !== saved[key]) account[key] = form[key];
  }
  const repos = [];
  for (const [repo, row] of Object.entries(form.rows)) {
    const before = saved.rows[repo];
    if (!before) continue;
    const body = repoSaveBody(row, before);
    if (Object.keys(body).length > 0) repos.push({ repo, ...body });
  }
  return { account: Object.keys(account).length > 0 ? account : null, repos };
}

/**
 * The repositories the table lists: those the account's list and the dashboard's both hold, with
 * archived ones left out. A private repository on an account with no plan is kept but marked, since
 * Striff does not check it. Sorted by name.
 *
 * @param {{ fullName: string, repositoryId: number }[]} apiRepos the API's list
 * @param {{ full_name: string, private: boolean, archived?: boolean }[]} dashboardRepos the dashboard's
 * @param {boolean | null} hasPlan whether the account has a plan; null while that is not known
 */
export function tableRepos(apiRepos, dashboardRepos, hasPlan) {
  const known = new Map((dashboardRepos || []).map((r) => [String(r.full_name).toLowerCase(), r]));
  const rows = [];
  for (const repo of apiRepos || []) {
    const seen = known.get(String(repo.fullName).toLowerCase());
    if (!seen || seen.archived === true) continue;
    rows.push({
      fullName: repo.fullName,
      isPrivate: seen.private === true,
      needsPlan: seen.private === true && hasPlan === false,
    });
  }
  return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** The rows whose name contains the query, ignoring case; all of them for an empty query. */
export function searchRepos(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  return q ? rows.filter((r) => r.fullName.toLowerCase().includes(q)) : rows;
}

/**
 * "Last changed by @alice on Oct 30", or "" where nothing says who or when. The year is added for
 * a date that is not this year's.
 */
export function lastChangedLine(by, atMs, now = Date.now()) {
  const at = Number(atMs);
  if (!by && !(at > 0)) return "";
  let when = "";
  if (at > 0) {
    const date = new Date(at);
    const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
    when = date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC",
    });
  }
  const who = by ? ` by @${by}` : "";
  return `Last changed${who}${when ? ` on ${when}` : ""}`;
}

/**
 * Why the settings cannot be edited by this reader, or null where they can: the API's answer says
 * who may, never the site.
 */
export function readOnlyNote(data, isOrg) {
  if (data?.canManageInstallation === true) return null;
  switch (data?.adminCheck) {
    case "login_required":
      return "Sign in with GitHub to change these settings.";
    case "unavailable":
    case "unverifiable":
      return "Striff couldn't confirm that you can change these settings. Try again shortly.";
    default:
      return words(isOrg).onlyOwners;
  }
}

/**
 * Which parts of the account Settings tab exist, decided by the account type the API reports for
 * the installation in view, never by who is looking: a personal account is one person, so it has no
 * lock, no "for everyone" notification group, no owners-only notes and no "last changed" lines.
 *
 * @param {"Organization" | "User"} accountType the installation's account type
 */
export function settingsParts(accountType) {
  const org = accountType === "Organization";
  return { lock: org, forEveryone: org, ownersNote: org, lastChanged: org, lockNotice: org };
}

/** Whether the reader needs to sign in again with GitHub to change the settings. */
export function needsSignIn(data) {
  return data?.adminCheck === "login_required";
}

/**
 * The section a dashboard address asks for. The account's Notifications tab is now the Notifications
 * section of Settings, so its old addresses (?section=notifications, #notifications) land there.
 *
 * @return {{ section: "settings", focus: "notifications" | "checks" | null } | null}
 */
export function sectionFromAddress(search, hash) {
  const asked = new URLSearchParams(search || "").get("section");
  const fragment = String(hash || "").replace(/^#/, "");
  if (asked === "notifications" || fragment === "notifications") {
    return { section: "settings", focus: "notifications" };
  }
  if (asked === "settings" || fragment === "settings") return { section: "settings", focus: null };
  return null;
}
