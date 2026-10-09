// Deploys the site to production once a day (scheduled in netlify.toml).
//
// A merge to main does not deploy: netlify.toml's ignore command cancels every production build
// that a build hook did not start, so merged work reaches production here, at most a day later.
// The same build refreshes the published report pages, which are static HTML read from striff-api
// when the site is built. It posts to the site's own build hook,
// STRIFF_SITE_BUILD_HOOK_URL, and does nothing where that is not set. Netlify runs scheduled
// functions only on the published deploy and never from a request.

export const handler = async () => {
  const hook = process.env.STRIFF_SITE_BUILD_HOOK_URL;
  if (!hook) {
    console.log("[daily-deploy] STRIFF_SITE_BUILD_HOOK_URL is not set; no build asked for");
    return { statusCode: 200, body: "not configured" };
  }
  try {
    const url = new URL(hook);
    url.searchParams.set("trigger_title", "daily deploy");
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[daily-deploy] the build hook answered ${res.status}`);
      return { statusCode: 502, body: "build hook refused" };
    }
    console.log("[daily-deploy] build asked for");
    return { statusCode: 200, body: "build asked for" };
  } catch (failure) {
    console.error("[daily-deploy] the build hook could not be reached", failure);
    return { statusCode: 502, body: "build hook unreachable" };
  }
};
