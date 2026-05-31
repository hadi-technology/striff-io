exports.handler = async (event) => {
  const token = parseCookie(event.headers?.cookie || "")["gh_token"];
  if (!token) {
    return jsonResponse({ authenticated: false });
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      return jsonResponse({ authenticated: false });
    }
    const user = await res.json();
    return jsonResponse({
      authenticated: true,
      user: { login: user.login, avatar_url: user.avatar_url, name: user.name },
    });
  } catch {
    return jsonResponse({ authenticated: false });
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

function jsonResponse(data) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
