// Everything the dashboard needs before it can draw anything, in one request: who is signed in,
// every installation their token sees, and every repository under each. GitHub is asked with the
// caller's own token, the same way auth-status and github-proxy ask it, and the questions that do
// not depend on each other are asked together. The session is read through ../lib/github-session.js,
// which renews an expired access token from the refresh token.
//
// What GitHub answered completely is written to the shared access cache (../lib/access-cache.js),
// so the proxies the dashboard calls next can authorize from it instead of asking GitHub again.
// Lists are capped at 500 items each, as the dashboard always capped them; a list longer than that
// is shown cut short and is not cached.
import { accessCache } from "../lib/access-cache.js";
import {
  DASHBOARD_PAGES,
  listInstallationRepositories,
  listInstallations,
  whoIs,
} from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

/** At most this many installations' repositories are asked for at once. */
const CONCURRENCY = 8;

/** Only the fields the dashboard reads; GitHub's own objects are many times larger. */
function shapeInstallation(inst, repositories) {
  return {
    id: inst.id,
    account: {
      login: inst.account?.login,
      avatar_url: inst.account?.avatar_url,
      type: inst.account?.type,
    },
    repository_selection: inst.repository_selection,
    repositories: repositories.map((repo) => ({
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      // A fork has issues turned off unless its owner turns them on, and GitHub answers a
      // prefilled new-issue link there with a 404: the page offers an issue only where one opens.
      has_issues: repo.has_issues,
    })),
  };
}

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const UNAVAILABLE = {
  statusCode: 503,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify({ error: "github_unavailable" }),
};

export const handler = async (event) =>
  withGitHubSession(event, (token) => bootstrap(event, token), {
    // As auth-status answers: the client sends the reader to sign in.
    signedOut: () => jsonResponse({ authenticated: false }),
    unavailable: () => UNAVAILABLE,
  });

async function bootstrap(event, token) {
  const cache = accessCache(event, token);
  const writes = [];

  // The user and the installation list do not depend on each other.
  const [who, listed] = await Promise.all([
    whoIs(token),
    listInstallations(token, DASHBOARD_PAGES),
  ]);
  if (who.failure === "signed_out") return TOKEN_REFUSED;
  // GitHub not saying who this is is an outage, not a sign-out: sending the reader to sign in again
  // would not help, and would show them GitHub's sign-in for nothing.
  if (!who.user) return UNAVAILABLE;
  const user = who.user;
  // A listing GitHub would not give is not an empty one: saying "Striff isn't installed" to someone
  // whose installations GitHub just failed to list is wrong, so the page is told it could not load.
  if (listed.failure && listed.items.length === 0) return UNAVAILABLE;
  writes.push(cache.rememberLogin(user.login));
  if (listed.complete) {
    writes.push(cache.rememberInstallationIds(listed.items.map((inst) => String(inst.id))));
  }

  const installations = await mapLimited(listed.items, CONCURRENCY, async (inst) => {
    const repos = await listInstallationRepositories(token, inst.id, DASHBOARD_PAGES);
    if (repos.complete) {
      writes.push(cache.rememberRepositoryNames(inst.id, repos.items.map((r) => r.full_name)));
    }
    // A listing that failed shows what it had, as the dashboard always did.
    return shapeInstallation(inst, repos.items);
  });

  // Written before answering: the next requests read them, and a function's work after it has
  // answered is not guaranteed to run. Each write is time-boxed and never fails the request.
  await Promise.all(writes);

  return jsonResponse({ authenticated: true, user, installations });
}

function jsonResponse(data) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(data),
  };
}
