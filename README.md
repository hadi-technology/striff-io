# Striff.io

[![Netlify Status](https://api.netlify.com/api/v1/badges/a460ac24-018e-4070-bd69-d1f7b03d88fb/deploy-status)](https://app.netlify.com/projects/striff-io/deploys)

Marketing + reference site for Striff diagrams.

## Getting started

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4321

## Build

```bash
npm run build
npm run preview
```

## Deployment

Configured for Netlify via `netlify.toml`. Set environment variables in Netlify:
- `PUBLIC_POSTHOG_PROJECT_TOKEN`
- `PUBLIC_POSTHOG_HOST`

### Public report pages

Every published public report (`striff.io/<owner>/<repo>`) is built as a static page, with its
content in the HTML, from the same reads the live page makes (`src/lib/staticReports.js`). A page
the build has none for falls through to the generic shell (`src/pages/repo.astro`, never indexed).

- `STRIFF_SERVER_KEY` (and `STRIFF_API_BASE_URL` if not `https://api.striff.io`): already set for
  the functions; its scope must include **Builds**. Without it the build makes no report pages and
  every report is served by the shell, as before.
- `STRIFF_SITE_BUILD_HOOK_URL` (Functions scope): the site's build hook, which the daily fallback
  rebuild (`netlify/functions/daily-rebuild.js`) posts to. striff-api posts to the same hook when a
  page's reading finishes or a page is published or taken down; see striff-api's `DEPLOYMENT.md`.
- `STRIFF_STATIC_REPORTS=0` builds no report pages.

A local build without the key can read through the live site's public proxy instead:

```bash
STRIFF_REPORTS_PROXY=https://striff.io STRIFF_REPORTS_LIST=yegor256/takes,objectionary/eo npm run build
```
