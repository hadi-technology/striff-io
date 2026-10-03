import { fetchUser, parseCookie } from "../lib/github-access.js";

export const handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return jsonResponse({ authenticated: false });
  }

  const user = await fetchUser(token);
  if (!user) {
    return jsonResponse({ authenticated: false });
  }
  return jsonResponse({ authenticated: true, user });
};

function jsonResponse(data) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
