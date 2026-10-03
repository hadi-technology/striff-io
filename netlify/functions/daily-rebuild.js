// Asks Netlify for a fresh build of the site once a day (scheduled in netlify.toml).
//
// Published report pages are built as static HTML, and striff-api asks for a build when a page's
// reading finishes or a page is published or taken down. This is the fallback for a request that
// was lost: no built page is ever more than a day behind. It posts to the site's own build hook,
// STRIFF_SITE_BUILD_HOOK_URL, and does nothing where that is not set. Netlify runs scheduled
// functions only on the published deploy and never from a request.

export const handler = async () => {
  const hook = process.env.STRIFF_SITE_BUILD_HOOK_URL;
  if (!hook) {
    console.log("[daily-rebuild] STRIFF_SITE_BUILD_HOOK_URL is not set; no build asked for");
    return { statusCode: 200, body: "not configured" };
  }
  try {
    const url = new URL(hook);
    url.searchParams.set("trigger_title", "daily rebuild of the public report pages");
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.error(`[daily-rebuild] the build hook answered ${res.status}`);
      return { statusCode: 502, body: "build hook refused" };
    }
    console.log("[daily-rebuild] build asked for");
    return { statusCode: 200, body: "build asked for" };
  } catch (failure) {
    console.error("[daily-rebuild] the build hook could not be reached", failure);
    return { statusCode: 502, body: "build hook unreachable" };
  }
};
