// Netlify function behind the setup page (/installed): forwards where an installation's setup
// page was reached from to striff-api, with the server key.
//
// The page is public, so this checks the shape of everything it forwards and nothing else: the
// installation id is digits, and each of the other values is absent or a short token of the
// characters Striff writes into its own links. A body that does not fit is refused here, and the
// page does not wait on the answer either way.

const STRIFF_SERVER_KEY = process.env.STRIFF_SERVER_KEY;
const STRIFF_API_BASE = process.env.STRIFF_API_BASE_URL || "https://api.striff.io";

const TOKEN = /^[A-Za-z0-9._:/-]{1,100}$/;

/**
 * The request for striff-api that a page body asks for, or null where the body does not fit.
 *
 * @param {unknown} body the parsed JSON the page sent
 * @returns {{ installationId: string, payload: { state?: string, firstSource?: string, visitSource?: string } } | null}
 */
export function arrivalRequest(body) {
  if (!body || typeof body !== "object") return null;
  const installationId = String(body.installation_id ?? "");
  if (!/^\d{1,18}$/.test(installationId)) return null;

  const payload = {};
  for (const [from, to] of [
    ["state", "state"],
    ["first_source", "firstSource"],
    ["visit_source", "visitSource"],
  ]) {
    const value = body[from];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !TOKEN.test(value)) return null;
    payload[to] = value;
  }
  return { installationId, payload };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!STRIFF_SERVER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad body" }) };
  }
  const request = arrivalRequest(body);
  if (!request) {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad arrival" }) };
  }

  try {
    const res = await fetch(`${STRIFF_API_BASE}/api/v1/app/installations/${request.installationId}/arrival`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Server-Key": STRIFF_SERVER_KEY },
      body: JSON.stringify(request.payload),
    });
    return { statusCode: res.ok ? 204 : 502, body: "" };
  } catch (e) {
    console.error("install-arrival error:", e.message);
    return { statusCode: 502, body: "" };
  }
};
