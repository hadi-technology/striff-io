import { TOKEN_REFUSED, withGitHubSession } from "../lib/github-session.js";

// The names GitHub could have given a repository, as public-repo-proxy.js checks them.
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Whether the proxy may ask GitHub this, with the caller's own token: anything under /user/, and
 * one repository exactly (/repos/<owner>/<repo>), which a public page reads to see whether the
 * signed-in reader may push to it. Nothing below a repository, so this cannot read its contents.
 */
export function allowedPath(path) {
  if (!path || path.includes("..")) return false;
  // ".." would let a caller escape the /user/ prefix after URL normalization
  if (path.startsWith("/user/")) return true;
  const repo = /^\/repos\/([^/?#]+)\/([^/?#]+)$/.exec(path);
  return !!repo && OWNER.test(repo[1]) && NAME.test(repo[2]) && repo[2] !== ".";
}

export const handler = async (event) => {
  const path = event.queryStringParameters?.path;
  if (!allowedPath(path)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid path" }) };
  }
  // The session is read through ../lib/github-session.js, which renews an expired access token.
  return withGitHubSession(event, (token) => ask(token, path));
};

async function ask(token, path) {
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 401) return TOKEN_REFUSED;

    const data = await res.json();
    return {
      statusCode: res.status,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": res.headers.get("x-ratelimit-limit") || "",
        "X-RateLimit-Remaining": res.headers.get("x-ratelimit-remaining") || "",
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
