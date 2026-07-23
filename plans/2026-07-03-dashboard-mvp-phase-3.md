# Dashboard MVP — Coverage Card, Flagged-PR Links, ADR Implementation Plan

**Related plans:** phase-1, phase-2, phase-3 (this file)

**Depends on:** phase-1 and phase-2 (must be implemented first — this phase consumes `prCheckWebhooksReceivedCount` and `recentFlaggedPrs`, both added to the API response by those phases)

**Goal:** `MetricsTab.tsx` renders a "Coverage" card and a "Recently flagged PRs" card whose entries link to the actual GitHub PR, and both repos' ADRs document the change.

**Architecture:** Pure consumption of the two new `MonthlyMetricsDto` fields already flowing through `netlify/functions/metrics-proxy.js` unchanged (it JSON-passes-through whatever striff-api returns — `metrics-proxy.js:83-91` — no proxy change needed). `MetricsTab.tsx` gets two new entries in its existing `METRIC_CARDS` config array, following the same shape every other card already uses. The "Recently flagged PRs" card reuses `dashboard-metric-list`/`dashboard-metric-list-item`/`dashboard-metric-list-badge` classnames that `MetricsTab.tsx` already references for `topFlaggedRepos` (`MetricsTab.tsx:260,266,268`) but that have no matching CSS today — those rules are added here since the new card needs them working.

**Working directory for all commands:** `/home/zir0/git/striff-io`

**Maintainability expectations:**
- Reuse `MetricCardShell`, `Sparkline`, `TrendArrow`, and the existing `METRIC_CARDS` config-array pattern — no parallel card-rendering path.
- Reuse the existing `ratePct` helper for the coverage percentage — do not write a second rate-calculation function.
- Use existing CSS custom properties (`var(--brand)`, `var(--ink)`, `var(--danger)`, `var(--mint)`) and the exact color/spacing values already used by sibling `.dashboard-metric-*` rules — no new raw hex/spacing values.
- Every change must leave the codebase cleaner or equally clean — never worse.

---

## Phase 3 — Frontend cards + ADR

**Objective:** Dashboard shows a coverage percentage and clickable recently-flagged-PR links; ADR-020 (striff-api) documents both features and cross-links from ADR-019's Follow-up section.

**Problem:** `MetricsTab.tsx` (`MetricsTab.tsx:22-30`) has no `prCheckWebhooksReceivedCount`/`recentFlaggedPrs` fields in its `MonthlyMetrics` interface, so once phase-1/phase-2 ship on the backend, the frontend silently ignores the new data — same failure mode ADR-019 already flagged for false-positive-less trust ("dashboard only showed aggregate counts with no link to underlying PRs"). Separately, `dashboard-metric-list-item`/`dashboard-metric-list-badge` are referenced in JSX (`MetricsTab.tsx:266,268`) but have zero matching rules in `global.css` (only `.dashboard-metric-repo-*` variants exist, `global.css:3176-3241`) — the existing "most-flagged repos" list renders unstyled today. This phase's new card uses the same classnames, so fixing the CSS gap is required, not optional cleanup.

**Files changed:**
- Modify: `src/components/MetricsTab.tsx`
- Modify: `src/styles/global.css`
- Modify: `../striff-api/architecture/adr-019-org-metrics-dashboard.md` (Follow-up cross-link)
- Create: `../striff-api/architecture/adr-020-metrics-coverage-and-pr-links.md`

### Steps

- [ ] **Step 1: Extend the TypeScript types (non-behavioral, no TDD)**

  ```tsx
  // src/components/MetricsTab.tsx:16-43
  export interface RepoHotspot {
    repoOwner: string;
    repoName: string;
    flaggedCount: number;
  }

  export interface FlaggedPr {
    repoOwner: string;
    repoName: string;
    pullNo: string;
    pullUrl: string;
    regressionCount: number;
    hotspotCount: number;
    createdAtMs: number;
  }

  export interface MonthlyMetrics {
    yearMonth: string;
    structuralRegressionCount: number;
    reviewHotspotCount: number;
    prsAnalyzedCount: number;
    cleanPrCount: number;
    highRiskPrCount: number;
    prCheckWebhooksReceivedCount: number;
    topFlaggedRepos: RepoHotspot[];
    recentFlaggedPrs: FlaggedPr[];
  }

  export interface ActiveRepo {
    repoOwner: string;
    repoName: string;
    active: boolean;
  }

  export interface OrgMetricsData {
    installationId: number;
    accountLogin: string;
    months: MonthlyMetrics[];
    activeRepos: ActiveRepo[];
  }
  ```

- [ ] **Step 2: Add the coverage-rate helper next to the existing rate helpers**

  ```tsx
  // src/components/MetricsTab.tsx:150-159
  // cleanPrCount/highRiskPrCount come back as counts, not rates -- the frontend divides by
  // prsAnalyzedCount to render a rate, matching how every other card in this DTO already leaves
  // formatting/derivation to the frontend. See ADR-019.
  const cleanPrRate = (m: MonthlyMetrics) => ratePct(m.cleanPrCount, m.prsAnalyzedCount);
  const highRiskPrRate = (m: MonthlyMetrics) => ratePct(m.highRiskPrCount, m.prsAnalyzedCount);
  // Coverage divides by webhooks *received*, not PRs analyzed -- the denominator here is the count
  // of PR-check webhook events GitHub sent, independent of whether analysis completed. See ADR-020.
  const coverageRate = (m: MonthlyMetrics) => ratePct(m.prsAnalyzedCount, m.prCheckWebhooksReceivedCount);
  const monthsWithRates = months.map((m) => ({
    ...m,
    cleanPrRate: cleanPrRate(m),
    highRiskPrRate: highRiskPrRate(m),
    coverageRate: coverageRate(m),
  }));
  ```

- [ ] **Step 3: Add the "Coverage" card to `METRIC_CARDS`, right after the "prs" card**

  ```tsx
  // src/components/MetricsTab.tsx -- insert after the "prs" card entry (currently ends at line 235)
  {
    key: "coverage",
    label: "Coverage",
    description:
      "Share of GitHub PR-check webhook events (opened, updated, reopened) that completed analysis this month. Below 100% may mean PRs were skipped -- check billing status or repo connection.",
    render: () => {
      // Months before this metric shipped have no webhook-receipt data at all (ADR-020 has no
      // backfill, matching ADR-019's precedent) -- show "no data" rather than a misleading 0%.
      const hasData = latest.prCheckWebhooksReceivedCount > 0;
      return (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{hasData ? `${coverageRate(latest)}%` : "—"}</span>
            {hasData && <TrendArrow current={coverageRate(latest)} previous={coverageRate(previous)} />}
          </div>
          {hasData ? (
            <Sparkline data={monthsWithRates} dataKey="coverageRate" color="var(--brand)" />
          ) : (
            <p class="dashboard-metric-caption">No webhook data for the selected month</p>
          )}
        </>
      );
    },
  },
  ```

- [ ] **Step 4: Add the "Recently flagged PRs" card, right after the "repos" card**

  ```tsx
  // src/components/MetricsTab.tsx -- insert after the "repos" card entry (currently ends at line 280)
  {
    key: "recentFlagged",
    label: "Recently flagged PRs",
    description:
      "The most recent pull requests this month with a structural regression or review hotspot -- click through to see exactly what was flagged.",
    render: () => (
      <>
        {latest.recentFlaggedPrs.length > 0 ? (
          <ul class="dashboard-metric-list">
            {latest.recentFlaggedPrs.map((pr) => (
              <li key={pr.pullUrl} class="dashboard-metric-list-item">
                <a
                  class="dashboard-metric-list-link"
                  href={pr.pullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="truncate">{pr.repoOwner}/{pr.repoName} #{pr.pullNo}</span>
                </a>
                <span class="dashboard-metric-list-badge">
                  {pr.regressionCount > 0
                    ? `${pr.regressionCount} regression${pr.regressionCount === 1 ? "" : "s"}`
                    : `${pr.hotspotCount} hotspot${pr.hotspotCount === 1 ? "" : "s"}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="dashboard-metric-caption">No flagged PRs for the selected month</p>
        )}
      </>
    ),
  },
  ```

- [ ] **Step 5: Add the missing CSS for `.dashboard-metric-list*` (fixes the pre-existing unstyled "most-flagged repos" list too)**

  ```css
  /* src/styles/global.css -- insert after the .dashboard-metric-repo-delta.is-flat / .is-new block (global.css:3238-3241), before .dashboard-metric-fade-in (global.css:3243) */

  .dashboard-metric-list {
    margin-top: 0.6rem;
    display: grid;
    gap: 0.4rem;
  }

  .dashboard-metric-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-radius: 0.5rem;
    background: #f6f8fa;
    padding: 0.45rem 0.6rem;
    font-size: 0.8rem;
  }

  .dashboard-metric-list-link {
    min-width: 0;
    color: #24292f;
    font-weight: 600;
    text-decoration: none;
  }

  .dashboard-metric-list-link:hover,
  .dashboard-metric-list-link:focus-visible {
    color: var(--brand);
    text-decoration: underline;
  }

  .dashboard-metric-list-badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 700;
    color: #57606a;
  }
  ```

- [ ] **Step 6: Verify the change compiles**

  Run: `cd /home/zir0/git/striff-io && npm run build`
  Expected: exit 0. (No dedicated typecheck script exists in this project — `astro build` is the closest available compile-check; it fails on JSX/syntax errors in `.tsx` files it processes.)

- [ ] **Step 7: Manual verification in the browser**

  Run: `cd /home/zir0/git/striff-io && npm run dev`
  Open the dashboard, select an installation with metrics data, open the "Metrics" tab:
  - Confirm the "Coverage" card renders a percentage (or "—" for months with no webhook data).
  - Confirm "Recently flagged PRs" renders a list; click a link and confirm it opens the correct `github.com/.../pull/N` URL in a new tab.
  - Confirm the "Most-flagged repos" list (pre-existing) is now visibly styled (background chip, badge) instead of unstyled text.

- [ ] **Step 8: Update ADR-019's Follow-up section with a forward cross-link**

  ```markdown
  <!-- ../striff-api/architecture/adr-019-org-metrics-dashboard.md -- append to the "Follow-up" section (adr-019, currently ends around line 247) -->
  - Coverage visibility and per-flag PR links shipped as a follow-up MVP — see ADR-020.
  ```

- [ ] **Step 9: Create ADR-020**

  ```markdown
  <!-- ../striff-api/architecture/adr-020-metrics-coverage-and-pr-links.md -->
  # ADR-020: Org Metrics — Coverage Count and Flagged-PR Links

  ## Status

  Accepted

  ## Context

  ADR-019 shipped org-level counts (regressions, hotspots, PRs analyzed, clean/high-risk rate,
  most-flagged repos) but two gaps surfaced from direct customer-facing feedback:

  1. Every number was an aggregate with no path to the underlying PR — a manager sees "12
     regressions flagged" with no way to verify a single one without leaving the dashboard.
  2. No visibility into whether Striff silently skipped PRs — a webhook event can fail before a
     `StriffOperationRecord` ever gets created (billing gate, queue drop, analysis error), and none
     of ADR-019's counts would reflect that gap.

  Both are minimal, additive extensions of ADR-019's live-query design — no new job, no new
  persisted aggregation, no schema migration.

  ## Decision

  ### Coverage count

  `GitHubAppService.handlePullRequest` now writes one `PrCheckWebhookEvent` (installationId,
  createdAtMs) per `opened`/`synchronize`/`reopened` webhook event, before enqueueing — so the
  record survives regardless of what happens downstream. `OrgMetricsService` queries this
  collection with the identical bounded-range-scan shape already used for
  `StriffOperationRecord`, and returns `prCheckWebhooksReceivedCount` per month.
  `prsAnalyzedCount / prCheckWebhooksReceivedCount` is the coverage rate; a persistent gap between
  the two numbers is a real signal something is being dropped.

  No idempotency key was added to `PrCheckWebhookEvent` — `GitHubWebhookDedupService` already
  guarantees `handlePullRequest` runs at most once per webhook `deliveryId` upstream (dedup happens
  in `GitHubAppController` before `handleWebhook` is called), so a duplicate write here would only
  happen if that existing dedup layer failed, in which case `StriffOperationRecord` creation would
  already be equally duplicated.

  ### Flagged-PR links

  `StriffOperationRecord.pullUrl`/`pullNo` already exist (populated from the GitHub webhook's
  `pull_request.html_url`/`number` at analysis time). `OrgMetricsService.buildMonth` already
  computes per-operation flagged status while building `topFlaggedRepos` — this reuses that same
  loop to also collect a `FlaggedPrDto` per flagged operation, sorted most-recent-first, capped at
  the existing `TOP_N` (5). Returned as `MonthlyMetricsDto.recentFlaggedPrs`.

  ### Scope kept at org-level, matching ADR-019

  Neither addition breaks ADR-019's org-level-only scope: coverage is one count per month, and
  `recentFlaggedPrs` is a flat top-5 across all repos (not per-repo), same shape as
  `topFlaggedRepos`.

  ## Consequences

  Positive:

  - A customer can now click from a flagged count straight to the PR that caused it.
  - A persistent gap between `prsAnalyzedCount` and `prCheckWebhooksReceivedCount` is now visible
    instead of silently invisible.
  - No new job, no new persisted aggregation, no new auth surface — same live-query/index pattern
    as every other metric in ADR-019.

  Tradeoffs:

  - No backfill: installations that received PR-check webhooks before this shipped show 0 (frontend
    renders "—" rather than a misleading 0%) for those months, matching ADR-019's own no-backfill
    precedent for `installationId`.
  - `recentFlaggedPrs` is a flat top-5 list, not scoped per repo — a very active single repo could
    crowd out other repos' flagged PRs from view in the same way `topFlaggedRepos` already can.
  - Coverage counts webhook events, not unique PRs — a PR pushed 5 times in a month contributes 5
    to the denominator, matching how `prsAnalyzedCount` already counts operations, not unique PRs
    (apples-to-apples, but "PRs opened" is not a literal PR count).

  ## Implementation Notes

  striff-api (`src/main/java/com/hadi/striff/`):

  - `app/PrCheckWebhookEvent.java`, `app/PrCheckWebhookEventRepository.java` — new
  - `app/GitHubAppService.java` — records a `PrCheckWebhookEvent` in `handlePullRequest`
  - `metrics/dto/FlaggedPrDto.java` — new
  - `metrics/dto/MonthlyMetricsDto.java` — `prCheckWebhooksReceivedCount`, `recentFlaggedPrs` added
  - `metrics/OrgMetricsService.java` — queries `PrCheckWebhookEventRepository`, collects flagged PRs
    in the existing `buildMonth` loop

  striff-io:

  - `src/components/MetricsTab.tsx` — "Coverage" and "Recently flagged PRs" cards
  - `src/styles/global.css` — added `.dashboard-metric-list`/`-item`/`-link`/`-badge` (also fixes
    the pre-existing unstyled `topFlaggedRepos` list, which referenced these classnames with no
    matching rules since ADR-019 shipped)
  - `netlify/functions/metrics-proxy.js` — unchanged (pure passthrough)

  Tests: `GitHubAppServiceTest` (webhook-event recording per action), `OrgMetricsServiceTest`
  (coverage counting, flagged-PR ranking/ordering).

  ## Follow-up

  - Per-repo coverage breakdown, if customers ask (same "ship org-level first" precedent as
    ADR-019).
  - False-positive/override tracking — requires a dismiss-and-record-reason flow in the PR check
    itself, out of scope for this MVP.
  ```

- [ ] **Step 10: Commit**

  ```bash
  cd /home/zir0/git/striff-io && git add src/components/MetricsTab.tsx src/styles/global.css \
    && git commit -m "feat: add coverage card and flagged-PR links to metrics dashboard"
  cd /home/zir0/git/striff-api && git add architecture/adr-019-org-metrics-dashboard.md architecture/adr-020-metrics-coverage-and-pr-links.md \
    && git commit -m "docs: add ADR-020 for metrics coverage count and flagged-PR links"
  ```

### Definition of Done

**Functional DoD:**
- Dashboard "Metrics" tab shows a "Coverage" card with a percentage (or "—" pre-data) and trend arrow.
- Dashboard shows a "Recently flagged PRs" card; each entry is a working link to `github.com/{owner}/{repo}/pull/{n}`.
- "Most-flagged repos" list (pre-existing) now renders with visible background/badge styling.
- ADR-020 exists in `../striff-api/architecture/`; ADR-019's Follow-up section links forward to it.

**Code DoD:**

```bash
cd /home/zir0/git/striff-io && npm run build                                                              # expect exit 0
cd /home/zir0/git/striff-io && grep -n "prCheckWebhooksReceivedCount\|recentFlaggedPrs" src/components/MetricsTab.tsx   # expect matches in interface + card render
cd /home/zir0/git/striff-io && grep -n "dashboard-metric-list-link" src/styles/global.css                 # expect 1 match
cd /home/zir0/git/striff-io && git grep -n "TODO:" src/components/MetricsTab.tsx                          # expect 0
ls /home/zir0/git/striff-api/architecture/adr-020-metrics-coverage-and-pr-links.md                        # expect file exists
```

**Cleanliness self-check:**
- [ ] No new rendering path — both new cards use the existing `METRIC_CARDS`/`MetricCardShell` config-array pattern
- [ ] No raw hex/spacing values without a citation — new CSS values match sibling `.dashboard-metric-repo-*` rules exactly (`#f6f8fa`, `0.5rem`, `0.8rem`, etc., copied from `global.css:3184-3206`)
- [ ] Reused `ratePct` for coverage — no second rate helper
- [ ] `target="_blank"` paired with `rel="noopener noreferrer"` on every external link (tab-nabbing protection)
- [ ] Naming matches nearest peers (`FlaggedPr` mirrors `RepoHotspot`; CSS classnames match what JSX already references)
- [ ] No dead code, commented-out code, unused imports left behind
- [ ] Diff is the minimum needed — no new page, no new proxy function, no client-side data refetch logic added

## Maintainability summary

- Reused across all 3 phases: `OrgMetricsService`'s bounded-range-scan + in-memory month-grouping pattern (ADR-019); `MetricCardShell`/`Sparkline`/`TrendArrow`/`METRIC_CARDS` config array (`MetricsTab.tsx`); `ratePct` helper; `TOP_N` constant; existing Mongo document conventions (`BillableRepoEvent`, `ProcessedWebhookDelivery`).
- No new background job, no new REST endpoint, no new Netlify function, no new auth surface, no per-repo drilldown — all explicitly deferred to match ADR-019's precedent of shipping org-level-only first.

## NTH notes (found during codebase mapping, out of scope for this plan)

- `dashboard-metric-list-item`/`-badge` were already referenced by the pre-existing "most-flagged repos" card (`MetricsTab.tsx:266,268`) with zero matching CSS — phase-3 step 5 fixes this as a side effect since the new card needs the same classnames, but flag it explicitly: this was a real bug already live in the current uncommitted `MetricsTab.tsx`/`global.css` working state, not introduced by this plan.
- ADR-019's own "Related finding" section documents an unrelated, higher-severity IDOR gap in `billing-proxy.js`/`stripe-portal.js`/`stripe-checkout.js` (missing installation-ownership check). Not touched by this plan — out of scope, already tracked in ADR-019's own Follow-up.

## Risks

- `npm run build` is the only available compile-check in this project (no `tsc`/lint script) — it won't catch every type error `tsc --noEmit` would. If stricter typechecking is wanted later, that's a separate, pre-existing gap (no `tsconfig.json` in the repo), not something to fix inside this plan's scope.
- `recentFlaggedPrs` assumes `StriffOperationRecord.pullUrl`/`pullNo` are always populated for installationId-tagged operations (verified via `StriffOperationService.java:379-387`, where `installationId`/`pullNo`/`pullUrl` are set together) — if a future code path sets `installationId` without also setting `pullUrl`, links would render empty/broken. No defensive fallback was added since no such code path exists today (see `grep -rn "setInstallationId" src/main/java` — every GitHub-App call site sets all three together).
