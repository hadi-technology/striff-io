export const handler = async () => {
  return {
    statusCode: 302,
    headers: {
      Location: "/",
      "Set-Cookie":
        "gh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    },
  };
};
