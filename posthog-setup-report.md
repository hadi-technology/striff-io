<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Striff landing page.

## Changes made

- **`src/components/posthog.astro`** — New component that loads the PostHog web snippet using `is:inline` to prevent Astro from processing it. Reads `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` from environment variables via `define:vars`.
- **`src/layouts/BaseLayout.astro`** — Imported and rendered `<PostHog />` inside `<head>`, ensuring PostHog is initialized on every page.
- **`src/pages/index.astro`** — Added a PostHog event tracking block inside the existing inline script to capture user interactions across the landing page.
- **`.env`** — Created with `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` values.

## Tracked events

| Event | Description | File |
|---|---|---|
| `get_plugin_clicked` | User clicks any "Get the Plugin" or "Download" CTA button — primary conversion event | `src/pages/index.astro` |
| `learn_how_clicked` | User clicks the "Learn how it works" secondary CTA in the hero section | `src/pages/index.astro` |
| `how_to_read_tab_clicked` | User clicks a tab in the "How to Read a Striff" carousel (includes `tab_title` property) | `src/pages/index.astro` |
| `github_link_clicked` | User clicks a GitHub repository link | `src/pages/index.astro` |
| `feedback_link_clicked` | User clicks the Feedback link (GitHub Discussions) | `src/pages/index.astro` |
| `hero_diagram_panned` | User pans or zooms the hero diagram — signals active product engagement | `src/pages/index.astro` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/386380/dashboard/1480319
- **Plugin CTA clicks over time** (line chart): https://us.posthog.com/project/386380/insights/Nau0rJif
- **Landing page conversion funnel** (pageview → learn how → get plugin): https://us.posthog.com/project/386380/insights/81J5juhM
- **How to Read tab engagement breakdown** (which tabs resonate most): https://us.posthog.com/project/386380/insights/kV2FdTaX
- **GitHub vs Feedback link clicks** (developer interest vs feedback intent): https://us.posthog.com/project/386380/insights/uK56wEZV
- **Hero diagram engagement** (unique users interacting with the diagram): https://us.posthog.com/project/386380/insights/4iMXrrgO

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
