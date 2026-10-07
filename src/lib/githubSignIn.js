// Starting a sign-in with GitHub, for the header's sign-in button and the dashboard alike.
//
// GitHub remembers who is signed in to it and, for someone who has already authorized Striff,
// hands the sign-in straight back without a screen. That is what a returning visitor wants. The
// exception is someone who has just signed out of Striff: they may mean to come back as another
// account, and without asking GitHub would quietly sign them back in as the same one. Sign-out
// (auth-logout) leaves a readable cookie, gh_signed_out, for a day; while it is there the sign-in
// asks for GitHub's account picker, and the callback clears it once someone has signed in.
// Plain JavaScript, so the tests can import it without a build.

/** The cookie sign-out leaves for the page to read. */
export const SIGNED_OUT_COOKIE = "gh_signed_out";

/**
 * Whether the visitor has just signed out of Striff.
 *
 * @param {string} cookie the page's cookies, as document.cookie gives them
 */
export function justSignedOut(cookie) {
  return String(cookie || "")
    .split(";")
    .some((pair) => pair.trim() === `${SIGNED_OUT_COOKIE}=1`);
}

/**
 * The address that starts a sign-in with GitHub.
 *
 * @param {{ clientId: string, origin: string, state: string, cookie: string }} sign
 *     the OAuth client's id, the site's origin, the state the callback checks, and the page's
 *     cookies
 */
export function authorizeUrl({ clientId, origin, state, cookie }) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "read:user,user:email",
    redirect_uri: `${origin}/.netlify/functions/auth-callback`,
    state,
  });
  if (justSignedOut(cookie)) params.set("prompt", "select_account");
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * The address to send the browser to for signing in, with its state set.
 *
 * Double-submit state: auth-callback compares this cookie against the state GitHub echoes back, so
 * a forged callback URL can't sign the visitor into an attacker's account. The address is built
 * when it is used, not at render, so each sign-in has its own state.
 *
 * @param {string} clientId the OAuth client's id
 */
export function signInUrl(clientId) {
  const state = crypto.randomUUID();
  document.cookie = `gh_oauth_state=${state}; path=/; max-age=600; secure; samesite=lax`;
  return authorizeUrl({ clientId, origin: window.location.origin, state, cookie: document.cookie });
}
