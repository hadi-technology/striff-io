exports.handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  const path = event.queryStringParameters?.path;
  if (!path || !path.startsWith("/user/")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid path" }) };
  }

  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

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
};

function parseCookie(header) {
  const cookies = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.split("=");
    cookies[k.trim()] = (v.join("=") || "").trim();
  }
  return cookies;
}
