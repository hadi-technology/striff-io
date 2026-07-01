// Renders the org-level manager metrics dashboard (structural regressions, review hotspots, PRs
// analyzed, most-flagged repos) for one GitHub App installation. Purely presentational -- the
// parent (Dashboard.tsx) owns fetching from metrics-proxy and passes the result down.
import { createElement, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export interface RepoHotspot {
  repoOwner: string;
  repoName: string;
  flaggedCount: number;
}

export interface MonthlyMetrics {
  yearMonth: string;
  structuralRegressionCount: number;
  reviewHotspotCount: number;
  prsAnalyzedCount: number;
  topFlaggedRepos: RepoHotspot[];
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

function Sparkline({ months, dataKey, color }: { months: MonthlyMetrics[]; dataKey: keyof MonthlyMetrics; color: string }) {
  return (
    <div class="dashboard-metric-chart-wrap">
      <ResponsiveContainer width="100%" height={56}>
        <AreaChart data={months} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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

function MetricCardShell({ label, children }: { label: string; children: any }) {
  return (
    <div class="dashboard-metric-card">
      <p class="dashboard-metric-label">{label}</p>
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

  const months = data.months;
  const selectedIndex =
    selectedMonthIndex === -1 || selectedMonthIndex >= months.length
      ? months.length - 1
      : selectedMonthIndex;
  const latest = months[selectedIndex];
  const previous = selectedIndex > 0 ? months[selectedIndex - 1] : latest;

  // Config array of cards: adding a metric later is a one-entry addition here (plus the matching
  // backend field) rather than a rewrite of this component.
  const METRIC_CARDS: { key: string; label: string; render: () => any }[] = [
    {
      key: "regressions",
      label: "Structural regressions",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.structuralRegressionCount}</span>
            <TrendArrow current={latest.structuralRegressionCount} previous={previous.structuralRegressionCount} />
          </div>
          <Sparkline months={months} dataKey="structuralRegressionCount" color="var(--danger)" />
        </>
      ),
    },
    {
      key: "hotspots",
      label: "Review hotspots",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.reviewHotspotCount}</span>
            <TrendArrow current={latest.reviewHotspotCount} previous={previous.reviewHotspotCount} />
          </div>
          <Sparkline months={months} dataKey="reviewHotspotCount" color="var(--brand)" />
        </>
      ),
    },
    {
      key: "prs",
      label: "PRs analyzed",
      render: () => (
        <>
          <div class="dashboard-metric-value-row">
            <span class="dashboard-metric-value">{latest.prsAnalyzedCount}</span>
            <TrendArrow current={latest.prsAnalyzedCount} previous={previous.prsAnalyzedCount} />
          </div>
          <Sparkline months={months} dataKey="prsAnalyzedCount" color="var(--mint)" />
        </>
      ),
    },
    {
      key: "repos",
      label: "Most-flagged repos",
      render: () => {
        const prevByRepo = new Map(previous.topFlaggedRepos.map((r) => [`${r.repoOwner}/${r.repoName}`, r.flaggedCount]));
        return (
          <>
            {latest.topFlaggedRepos.length > 0 ? (
              <>
                <div class="dashboard-metric-chart-wrap">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      data={latest.topFlaggedRepos}
                      layout="vertical"
                      margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="repoName" width={90} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="flaggedCount" fill="var(--brand)" radius={4} isAnimationActive animationDuration={700} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul class="dashboard-metric-list">
                  {latest.topFlaggedRepos.map((r) => {
                    const key = `${r.repoOwner}/${r.repoName}`;
                    const prevCount = prevByRepo.get(key);
                    const badge = prevCount === undefined ? "New" : `${r.flaggedCount - prevCount >= 0 ? "+" : ""}${r.flaggedCount - prevCount}`;
                    return (
                      <li key={key} class="dashboard-metric-list-item">
                        <span class="truncate">{key}</span>
                        <span class="dashboard-metric-list-badge">{badge}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p class="dashboard-metric-caption">No flagged repos for the selected month</p>
            )}
          </>
        );
      },
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
          <MetricCardShell key={card.key} label={card.label}>
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
