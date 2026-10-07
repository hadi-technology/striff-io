// Who is signed in, for the header's sign-in button and the public pages. The session is read
// through ../lib/github-session.js, which renews an expired access token from the refresh token.
// GitHub refusing the session answers signed out; GitHub not answering is an error, and leaves the
// visitor signed in.
import { whoIs } from "../lib/github-access.js";
import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

export const handler = async (event) =>
  withGitHubSession(
    event,
    async (token) => {
      const { user, failure } = await whoIs(token);
      if (failure === "signed_out") return TOKEN_REFUSED;
      if (!user) return unavailable();
      return jsonResponse({ authenticated: true, user });
    },
    { signedOut: () => jsonResponse({ authenticated: false }), unavailable }
  );

function unavailable() {
  return {
    statusCode: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "5" },
    body: JSON.stringify({ error: "github_unavailable" }),
  };
}

function jsonResponse(data) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
