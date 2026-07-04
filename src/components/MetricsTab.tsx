// Renders the org-level manager metrics dashboard (structural regressions, review hotspots, PRs
// analyzed, most-flagged repos) for one GitHub App installation. Purely presentational -- the
// parent (Dashboard.tsx) owns fetching from metrics-proxy and passes the result down.
import { createElement, useState } from "react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

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

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous;
  if (previous === 0 && current === 0) {
    return <span class="dashboard-metric-trend dashboard-metric-trend-neutral">flat</span>;
  }
  const pct = previous === 0 ? 100 : Math.round((delta / previous) * 100);
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span class="dashboard-metric-trend dashboard-metric-trend-neutral">
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

function Sparkline<T>({ data, dataKey, color }: { data: T[]; dataKey: keyof T; color: string }) {
  return (
    <div class="dashboard-metric-chart-wrap">
      <ResponsiveContainer width="100%" height={112}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey as string}
            stroke={color}
            strokeWidth={2}
            fill={`url(#spark-${String(dataKey)})`}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricCardShell({
  label,
  description,
  wide,
  children,
}: {
  label: string;
  description: string;
  wide?: boolean;
  children: any;
}) {
  return (
    <div class={`dashboard-metric-card${wide ? " dashboard-metric-card-wide" : ""}`}>
      <p class="dashboard-metric-label">
        {label}
        <span class="dashboard-metric-help" tabIndex={0}>
          <span class="dashboard-metric-help-icon" aria-hidden="true">?</span>
          <span class="dashboard-metric-help-tooltip" role="tooltip">{description}</span>
        </span>
      </p>
      {children}
    </div>
  );
}

export default function MetricsTab({
  data,
  loading,
  error,
}: {
  data: OrgMetricsData | null;
  loading: boolean;
  error: string;
}) {
  // -1 means "no explicit selection yet" -- default to the latest month once data loads.
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(-1);

  if (loading) {
    return (
      <div class="dashboard-loading">
        <div class="dashboard-spinner" aria-hidden="true" />
        <div class="text-slate-500">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return <p class="dashboard-inline-error">{error}</p>;
  }

  if (!data || data.months.length === 0) {
    return (
      <div class="dashboard-empty">
        <p class="text-slate-600">No metrics yet -- check back after Striff has analyzed a few pull requests.</p>
      </div>
    );
  }

  // Defends against an API response that predates ADR-020 (backend deployed after this frontend,
  // or briefly out of sync during rollout) -- without this, `.length` on a missing field throws
  // and blanks the whole tab instead of just omitting the new cards' data.
  const months = data.months.map((m) => ({
    ...m,
    prCheckWebhooksReceivedCount: m.prCheckWebhooksReceivedCount ?? 0,
    recentFlaggedPrs: m.recentFlaggedPrs ?? [],
  }));
  const selectedIndex =
    selectedMonthIndex === -1 || selectedMonthIndex >= months.length
      ? months.length - 1
      : selectedMonthIndex;
  const latest = months[selectedIndex];
  const previous = selectedIndex > 0 ? months[selectedIndex - 1] : latest;

  // cleanPrCount/highRiskPrCount come back as counts (same shape as every other backend field --
  // see MonthlyMetricsDto), not rates. Rate is a display concern, so it's derived here rather
  // than asking the backend to duplicate the same division per month.
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

  // Config array of cards: adding a metric later is a one-entry addition here (plus the matching
  // backend field) rather than a rewrite of this component.
  const METRIC_CARDS: { key: string; label: string; description: string; wide?: boolean; render: () => any }[] = [
    {
      key: "regressions",
      label: "Regressions flagged",
      description:
        "A high-severity structural break Striff traced directly to this PR -- a new dependency cycle, a one-way boundary crossing, a stable component's contract shifting, or a sharp complexity jump. Deliberately rare: most PRs show zero.",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.structuralRegressionCount}</span>
            <TrendArrow current={latest.structuralRegressionCount} previous={previous.structuralRegressionCount} />
          </div>
          <Sparkline data={months} dataKey="structuralRegressionCount" color="var(--danger)" />
        </>
      ),
    },
    {
      key: "hotspots",
      label: "Hotspots flagged",
      description:
        "A lower-severity or anomaly-only finding worth a second look -- coupling or churn signals that don't rise to a confirmed structural regression. Usually zero or one per PR.",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.reviewHotspotCount}</span>
            <TrendArrow current={latest.reviewHotspotCount} previous={previous.reviewHotspotCount} />
          </div>
          <Sparkline data={months} dataKey="reviewHotspotCount" color="var(--brand)" />
        </>
      ),
    },
    {
      key: "cleanRate",
      label: "Clean PR rate",
      description: "Share of analyzed pull requests with zero regressions or hotspots flagged this month.",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{cleanPrRate(latest)}%</span>
            <TrendArrow current={cleanPrRate(latest)} previous={cleanPrRate(previous)} />
          </div>
          <Sparkline data={monthsWithRates} dataKey="cleanPrRate" color="var(--mint)" />
        </>
      ),
    },
    {
      key: "highRiskRate",
      label: "High-risk PR rate",
      description: "Share of analyzed pull requests with at least one regression flagged, the more severe finding type.",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{highRiskPrRate(latest)}%</span>
            <TrendArrow current={highRiskPrRate(latest)} previous={highRiskPrRate(previous)} />
          </div>
          <Sparkline data={monthsWithRates} dataKey="highRiskPrRate" color="var(--danger)" />
        </>
      ),
    },
    {
      key: "prs",
      label: "PRs analyzed",
      description: "Total pull requests Striff reviewed for architecture across every active repo in this installation this month.",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.prsAnalyzedCount}</span>
            <TrendArrow current={latest.prsAnalyzedCount} previous={previous.prsAnalyzedCount} />
          </div>
          <Sparkline data={months} dataKey="prsAnalyzedCount" color="var(--mint)" />
        </>
      ),
    },
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
    {
      key: "repos",
      label: "Most-flagged repos",
      description: "Repos ranked by combined regressions + hotspots this month, with the change versus last month shown per repo.",
      render: () => {
        const prevByRepo = new Map(previous.topFlaggedRepos.map((r) => [`${r.repoOwner}/${r.repoName}`, r.flaggedCount]));
        const maxCount = Math.max(...latest.topFlaggedRepos.map((r) => r.flaggedCount), 1);
        return (
          <>
            {latest.topFlaggedRepos.length > 0 ? (
              <ul class="dashboard-metric-repo-list">
                {latest.topFlaggedRepos.map((r) => {
                  const key = `${r.repoOwner}/${r.repoName}`;
                  const prevCount = prevByRepo.get(key);
                  const delta = prevCount === undefined ? null : r.flaggedCount - prevCount;
                  const deltaClass =
                    delta === null ? "is-new" : delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
                  const deltaLabel =
                    delta === null ? "New" : delta === 0 ? "→ 0" : delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`;
                  return (
                    <li key={key} class="dashboard-metric-repo-row">
                      <div class="dashboard-metric-repo-top">
                        <span class="dashboard-metric-repo-name truncate">{key}</span>
                        <span class="dashboard-metric-repo-count">{r.flaggedCount}</span>
                      </div>
                      <div class="dashboard-metric-repo-bar-track">
                        <div
                          class="dashboard-metric-repo-bar-fill"
                          style={{ width: `${Math.round((r.flaggedCount / maxCount) * 100)}%` }}
                        />
                      </div>
                      <span class={`dashboard-metric-repo-delta ${deltaClass}`}>{deltaLabel}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="dashboard-metric-caption">No flagged repos for the selected month</p>
            )}
          </>
        );
      },
    },
    {
      key: "recentFlagged",
      label: "Recently flagged PRs",
      description:
        "The 10 most recent pull requests this month with a structural regression or review hotspot -- click through to see exactly what was flagged.",
      wide: true,
      render: () => (
        <>
          {latest.recentFlaggedPrs.length > 0 ? (
            <ul class="dashboard-metric-pr-list">
              {latest.recentFlaggedPrs.map((pr) => (
                <li key={pr.pullUrl} class="dashboard-metric-pr-row">
                  <a
                    class="dashboard-metric-pr-link truncate"
                    href={pr.pullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {pr.repoOwner}/{pr.repoName} #{pr.pullNo}
                  </a>
                  <span class="dashboard-metric-pr-badge">
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
  ];

  return (
    <div>
      <div class="dashboard-metric-month-picker">
        <label for="metrics-month-select" class="dashboard-metric-label">Month</label>
        <select
          id="metrics-month-select"
          class="dashboard-metric-month-select"
          value={selectedIndex}
          onChange={(e: any) => setSelectedMonthIndex(Number(e.target.value))}
        >
          {months.map((m, i) => (
            <option key={m.yearMonth} value={i}>
              {formatYearMonth(m.yearMonth)}
            </option>
          ))}
        </select>
      </div>
      <div class="dashboard-metric-grid">
        {METRIC_CARDS.map((card) => (
          <MetricCardShell key={card.key} label={card.label} description={card.description} wide={card.wide}>
            {card.render()}
          </MetricCardShell>
        ))}
      </div>
    </div>
  );
}

function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ratePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
