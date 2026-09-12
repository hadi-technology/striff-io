// Renders the org-level manager metrics dashboard (documented rules broken, held and already
// broken, PRs that broke no rule, PRs analyzed, coverage, most-flagged repos) for one GitHub App
// installation. Purely presentational -- the parent (Dashboard.tsx) owns fetching from
// metrics-proxy and passes the result down.
import { createElement } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

export interface FlaggedRepo {
  repoOwner: string;
  repoName: string;
  flaggedCount: number;
}

export interface FlaggedPr {
  repoOwner: string;
  repoName: string;
  pullNo: string;
  pullUrl: string;
  // Optional: older backend deploys may not send this yet (same defend-against-schema-drift
  // pattern as prCheckWebhooksReceivedCount below) -- render the row without a title rather than
  // breaking on it.
  pullTitle?: string;
  // How many documented rules this PR broke. Optional: older backend deploys don't send it.
  docRuleViolationCount?: number;
  // Still sent by the API for compatibility, never rendered: every flag now comes from a
  // documented rule, so docRuleViolationCount carries the signal on its own.
  regressionCount?: number;
  hotspotCount?: number;
  createdAtMs: number;
}

export interface MonthlyMetrics {
  yearMonth: string;
  prsAnalyzedCount: number;
  // PRs that broke no documented rule (and had nothing else flagged).
  cleanPrCount: number;
  prCheckWebhooksReceivedCount: number;
  // Documented-rule verdict counts per month. Optional: older backend deploys don't send them.
  docRulesHeldCount?: number;
  docRulesViolatedCount?: number;
  docRulesPreExistingCount?: number;
  topFlaggedRepos: FlaggedRepo[];
  recentFlaggedPrs: FlaggedPr[];
  // Still sent by the API for compatibility, never rendered. Past months hold values from before
  // every flag came from a documented rule, so charting them would show a change of method as a
  // trend.
  structuralRegressionCount?: number;
  reviewHotspotCount?: number;
  highRiskPrCount?: number;
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

// Caps how much history the charts ever render, even if the backend returns more -- keeps the
// x-axis readable and matches the "last 6 months" framing used across the tab.
const MAX_HISTORY_MONTHS = 6;

// "up" means an increasing value is the improvement (clean rate, coverage); "down" means a
// decreasing value is the improvement (rules broken, rules already broken). Metrics with no
// inherent direction (PR volume) pass undefined and render a neutral, uncolored arrow.
type Direction = "up" | "down";

function trendTone(delta: number, direction?: Direction): "good" | "bad" | "neutral" {
  if (delta === 0 || !direction) return "neutral";
  const improving = direction === "up" ? delta > 0 : delta < 0;
  return improving ? "good" : "bad";
}

// Tailwind's content scanner only keeps a CSS class if it finds that exact string, unbroken,
// somewhere in the source -- interpolating the tone into a template literal never spells the
// full class name out, so it gets silently purged from the production build. Looking it up in a
// static map instead means every class name Tailwind needs to see is written out literally here.
const TOOLTIP_TONE_CLASS: Record<"good" | "bad" | "neutral", string> = {
  good: "tone-good",
  bad: "tone-bad",
  neutral: "tone-neutral",
};

// Cycled per repo line/legend entry in the "most-flagged repos over time" chart -- distinct enough at
// a glance without trying to carry the good/bad semantics the single-metric charts use.
const REPO_PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function repoKey(r: { repoOwner: string; repoName: string }): string {
  return `${r.repoOwner}/${r.repoName}`;
}

function repoGitHubUrl(r: { repoOwner: string; repoName: string }): string {
  return `https://github.com/${r.repoOwner}/${r.repoName}`;
}

// The backend stores the GitHub *API* pull URL (api.github.com/repos/.../pulls/N), which serves
// JSON -- opening it in a browser shows a 404 error page. Rewrite to the human-facing PR page;
// anything already in html form passes through untouched.
function prHtmlUrl(pullUrl: string): string {
  const m = pullUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/);
  return m ? `https://github.com/${m[1]}/pull/${m[2]}` : pullUrl;
}

// month/year label shown on the x-axis -- only spells out the year on the first point or on a
// January boundary, since 6 months can straddle a year change (e.g. Nov -> Apr).
function chartMonthLabel(yearMonth: string, includeYear: boolean): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString(undefined, { month: "short" });
  return includeYear ? `${label} '${year.slice(2)}` : label;
}

function fullMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Used to caption the two list cards (recently flagged PRs), which are scoped to the latest
// month only -- unlike the numeric cards above them, which show a 6-month total.
function shortMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Builds the tooltip renderer for one chart. Closes over the prepared series so it can look up
// the prior month's value by index and surface a month-over-month delta on hover, rather than
// just restating the point already visible on the chart.
function makeChartTooltip(
  series: Array<Record<string, any>>,
  dataKey: string,
  direction: Direction | undefined,
  formatValue: (v: number) => string
) {
  return function ChartTooltip({ active, payload }: any) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    const idx = row.__idx as number;
    const value = row[dataKey] as number;
    const prevValue = idx > 0 ? (series[idx - 1][dataKey] as number) : null;
    let deltaNode = null;
    if (prevValue !== null) {
      const delta = value - prevValue;
      const flat = delta === 0;
      const pct = prevValue === 0 ? (value === 0 ? 0 : 100) : Math.round((delta / prevValue) * 100);
      const tone = trendTone(delta, direction);
      deltaNode = (
        <span className={`dashboard-chart-tooltip-delta ${TOOLTIP_TONE_CLASS[tone]}`}>
          {flat ? "→ flat vs prior month" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs prior month`}
        </span>
      );
    }
    return (
      <div className="dashboard-chart-tooltip">
        <div className="dashboard-chart-tooltip-month">{row.__fullLabel}</div>
        <div className="dashboard-chart-tooltip-value">{formatValue(value)}</div>
        {deltaNode}
      </div>
    );
  };
}

// Tooltip for the multi-repo trend chart: one row per repo with a nonzero count that month,
// ranked highest-first so the repo driving the hover point is always on top.
function RepoTrendTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const rows = [...payload].filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value);
  if (rows.length === 0) return null;
  return (
    <div className="dashboard-chart-tooltip dashboard-chart-tooltip-multi">
      <div className="dashboard-chart-tooltip-month">{payload[0].payload.__fullLabel}</div>
      <ul className="dashboard-chart-tooltip-repo-list">
        {rows.map((p: any) => (
          <li key={p.dataKey}>
            <span className="dashboard-chart-tooltip-swatch" style={{ background: p.color }} />
            <span className="dashboard-chart-tooltip-repo-name truncate">{p.dataKey}</span>
            <span className="dashboard-chart-tooltip-repo-count">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricChart({
  data,
  dataKey,
  color,
  direction,
  formatValue = (v) => String(v),
}: {
  data: Array<Record<string, any>>;
  dataKey: string;
  color: string;
  direction?: Direction;
  formatValue?: (v: number) => string;
}) {
  // A point-scale x-axis with one month renders as a lone floating dot -- show a caption until
  // there's a second month to draw a line through.
  if (data.length < 2) {
    return <p className="dashboard-metric-caption">Trend chart appears after a second month of data</p>;
  }
  const values = data.map((d) => d[dataKey] as number);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const gradientId = `chart-${dataKey}`;
  const ChartTooltip = makeChartTooltip(data, dataKey, direction, formatValue);
  return (
    <div className="dashboard-metric-chart-wrap">
      <ResponsiveContainer width="100%" height={188}>
        <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(31, 35, 40, 0.08)" vertical={false} />
          <XAxis dataKey="__label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#57606a" }} dy={6} />
          {values.length > 1 && <ReferenceLine y={avg} stroke={color} strokeOpacity={0.35} strokeDasharray="4 4" />}
          <Tooltip content={ChartTooltip} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, stroke: color, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 5 }}
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
    <div className={`dashboard-metric-card${wide ? " dashboard-metric-card-wide" : ""}`}>
      <p className="dashboard-metric-label">
        {label}
        <span className="dashboard-metric-help" tabIndex={0}>
          <span className="dashboard-metric-help-icon" aria-hidden="true">?</span>
          <span className="dashboard-metric-help-tooltip" role="tooltip">{description}</span>
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
  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner" aria-hidden="true" />
        <div className="text-slate-500">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return <p className="dashboard-inline-error">{error}</p>;
  }

  if (!data || data.months.length === 0) {
    return (
      <div className="dashboard-empty">
        <p className="text-slate-600">No metrics yet -- check back after Striff has analyzed a few pull requests.</p>
      </div>
    );
  }

  // Defends against an API response that predates a newer field (backend deployed after this
  // frontend, or briefly out of sync during rollout) -- without this, `.length` on a missing field
  // throws and blanks the whole tab instead of just omitting the new cards' data.
  // A backend that predates documented-rule counts sends none of these fields at all -- show "no data"
  // on those cards rather than a misleading zero, the same way Coverage handles its field.
  const hasDocData = data.months.some((m) => m.docRulesHeldCount !== undefined || m.docRulesViolatedCount !== undefined);
  const allMonths = data.months.map((m) => ({
    ...m,
    prCheckWebhooksReceivedCount: m.prCheckWebhooksReceivedCount ?? 0,
    docRulesHeldCount: m.docRulesHeldCount ?? 0,
    docRulesViolatedCount: m.docRulesViolatedCount ?? 0,
    docRulesPreExistingCount: m.docRulesPreExistingCount ?? 0,
    recentFlaggedPrs: m.recentFlaggedPrs ?? [],
  }));
  const months = allMonths.slice(-MAX_HISTORY_MONTHS);
  const latest = months[months.length - 1];
  const latestMonthLabel = shortMonthYear(latest.yearMonth);

  // cleanPrCount comes back as a count (same shape as every other backend field), not a rate. Rate
  // is a display concern, so it's derived here rather than asking the backend to duplicate the
  // same division per month.
  const cleanPrRate = (m: MonthlyMetrics) => ratePct(m.cleanPrCount, m.prsAnalyzedCount);
  // Coverage divides by webhooks *received*, not PRs analyzed -- the denominator here is the count
  // of PR-check webhook events GitHub sent, independent of whether analysis completed.
  const coverageRate = (m: MonthlyMetrics) => ratePct(m.prsAnalyzedCount, m.prCheckWebhooksReceivedCount);
  // "Checked" is held + violated + pre-existing: rules Striff could not answer are not in the backend
  // counts at all, so the rate is over rules that actually got a verdict.
  const docChecked = (m: MonthlyMetrics) =>
    (m.docRulesHeldCount ?? 0) + (m.docRulesViolatedCount ?? 0) + (m.docRulesPreExistingCount ?? 0);
  const docHeldRate = (m: MonthlyMetrics) => ratePct(m.docRulesHeldCount ?? 0, docChecked(m));

  // The headline number on every card is a 6-month total, not a single month's value -- a lone
  // number sitting on top of a 6-month chart read ambiguously otherwise. Rate cards can't just sum
  // monthly percentages (that's not a valid average), so they re-derive the rate from summed counts
  // across the window instead -- the same weighted-average approach the backend would use.
  // Only the fields this tab renders are summable, so it can never come to depend on the legacy
  // fields the API still sends for compatibility.
  type SummedField =
    | "prsAnalyzedCount"
    | "cleanPrCount"
    | "prCheckWebhooksReceivedCount"
    | "docRulesHeldCount"
    | "docRulesViolatedCount"
    | "docRulesPreExistingCount";
  const sumField = (field: SummedField) => months.reduce((total, m) => total + (m[field] ?? 0), 0);
  const windowPrsAnalyzed = sumField("prsAnalyzedCount");
  const windowCleanPrs = sumField("cleanPrCount");
  const windowWebhooksReceived = sumField("prCheckWebhooksReceivedCount");
  const windowCleanPrRate = ratePct(windowCleanPrs, windowPrsAnalyzed);
  const windowCoverageRate = ratePct(windowPrsAnalyzed, windowWebhooksReceived);
  const windowDocHeld = sumField("docRulesHeldCount");
  const windowDocViolated = sumField("docRulesViolatedCount");
  const windowDocPreExisting = sumField("docRulesPreExistingCount");
  const windowDocChecked = windowDocHeld + windowDocViolated + windowDocPreExisting;
  const windowDocHeldRate = ratePct(windowDocHeld, windowDocChecked);

  // Chart series shared by every card below: each point carries its own axis label, tooltip
  // label, and index so MetricChart's tooltip can look up "the prior point" without re-deriving
  // month math per metric.
  const series = months.map((m, i) => ({
    ...m,
    cleanPrRate: cleanPrRate(m),
    coverageRate: coverageRate(m),
    docHeldRate: docHeldRate(m),
    __idx: i,
    __label: chartMonthLabel(m.yearMonth, i === 0 || m.yearMonth.endsWith("-01")),
    __fullLabel: fullMonthLabel(m.yearMonth),
  }));

  const rangeLabel =
    months.length > 1 ? `${fullMonthLabel(months[0].yearMonth)} to ${fullMonthLabel(latest.yearMonth)}` : fullMonthLabel(latest.yearMonth);

  // Union of every repo that cracked a month's top-flagged list anywhere in the window -- since
  // topFlaggedRepos is a per-month top-N, a reshuffling top spot can surface more than N distinct
  // repos across 6 months even though no single month ever lists more than its own top few.
  const repoMeta = new Map<string, FlaggedRepo>();
  months.forEach((m) => m.topFlaggedRepos.forEach((r) => repoMeta.set(repoKey(r), r)));
  const repoTotals = new Map<string, number>();
  months.forEach((m) =>
    m.topFlaggedRepos.forEach((r) => repoTotals.set(repoKey(r), (repoTotals.get(repoKey(r)) ?? 0) + r.flaggedCount))
  );
  const orderedRepoKeys = [...repoMeta.keys()].sort((a, b) => (repoTotals.get(b) ?? 0) - (repoTotals.get(a) ?? 0));
  const repoTrendSeries = months.map((m, i) => {
    const byKey = new Map(m.topFlaggedRepos.map((r) => [repoKey(r), r.flaggedCount]));
    const row: Record<string, any> = { __label: series[i].__label, __fullLabel: series[i].__fullLabel };
    orderedRepoKeys.forEach((key) => {
      row[key] = byKey.get(key) ?? 0;
    });
    return row;
  });

  // The latest month's flagged PRs, ranked by how many documented rules each broke (most first,
  // then most recent). A row with no broken rule is left out: the rule count is the only thing
  // this list reports, and a flag without one predates rule-derived flags.
  const rulePrs = latest.recentFlaggedPrs
    .filter((pr) => (pr.docRuleViolationCount ?? 0) > 0)
    .sort((a, b) => (b.docRuleViolationCount ?? 0) - (a.docRuleViolationCount ?? 0) || b.createdAtMs - a.createdAtMs);

  const noDocData = <p className="dashboard-metric-caption">No documented-rule data yet for this installation</p>;

  // Config arrays of cards: adding a metric later is a one-entry addition here (plus the matching
  // backend field) rather than a rewrite of this component.
  type MetricCard = { key: string; label: string; description: string; wide?: boolean; render: () => any };

  // Documented rules lead the tab: every flag on it comes from one.
  const RULE_CARDS: MetricCard[] = [
    {
      key: "docViolated",
      label: "Documented rules broken",
      description:
        "Rules from your own documentation that a pull request broke: true before the change, false after it. The check quotes the sentence and the line it came from. Rules already broken before a PR are counted separately and never charged to it.",
      render: () =>
        hasDocData ? (
          <>
            <div className="dashboard-metric-value-row">
              <span className="dashboard-metric-value">{windowDocViolated}</span>
            </div>
            <MetricChart data={series} dataKey="docRulesViolatedCount" color="var(--danger)" direction="down" />
          </>
        ) : (
          noDocData
        ),
    },
    {
      key: "docHeld",
      label: "Documented rules held",
      description:
        "Share of documented-rule checks where the pull request kept the rule: nothing in it broke the rule. Checked is held plus broken plus already broken; rules Striff could not answer are left out rather than counted as a pass.",
      render: () =>
        hasDocData ? (
          <>
            <div className="dashboard-metric-value-row">
              <span className="dashboard-metric-value">{windowDocHeldRate}%</span>
            </div>
            <p className="dashboard-metric-value-caption">{windowDocChecked} checked</p>
            <MetricChart data={series} dataKey="docHeldRate" color="var(--mint)" direction="up" formatValue={(v) => `${v}%`} />
          </>
        ) : (
          noDocData
        ),
    },
    {
      key: "docPreExisting",
      label: "Documented rules already broken",
      description:
        "Rules your documentation states that were already broken in the code Striff checked, not by the pull request that checked them. Reported so they are never mistaken for a pass, and never charged to that pull request.",
      render: () =>
        hasDocData ? (
          <>
            <div className="dashboard-metric-value-row">
              <span className="dashboard-metric-value">{windowDocPreExisting}</span>
            </div>
            <MetricChart data={series} dataKey="docRulesPreExistingCount" color="#d97706" direction="down" />
          </>
        ) : (
          noDocData
        ),
    },
    {
      key: "cleanRate",
      label: "PRs that broke no rule",
      description: "Share of analyzed pull requests that broke none of your documented rules, over the last 6 months.",
      render: () => (
        <>
          <div className="dashboard-metric-value-row">
            <span className="dashboard-metric-value">{windowCleanPrRate}%</span>
          </div>
          <MetricChart data={series} dataKey="cleanPrRate" color="var(--mint)" direction="up" formatValue={(v) => `${v}%`} />
        </>
      ),
    },
  ];

  const ACTIVITY_CARDS: MetricCard[] = [
    {
      key: "prs",
      label: "PRs analyzed",
      description: "Total pull requests Striff checked across every active repo in this installation.",
      render: () => (
        <>
          <div className="dashboard-metric-value-row">
            <span className="dashboard-metric-value">{windowPrsAnalyzed}</span>
          </div>
          <MetricChart data={series} dataKey="prsAnalyzedCount" color="var(--mint)" direction="up" />
        </>
      ),
    },
    {
      key: "coverage",
      label: "Coverage",
      description:
        "Share of GitHub PR-check webhook events (opened, updated, reopened) that completed analysis, over the last 6 months. Below 100% may mean PRs were skipped -- check billing status or repo connection.",
      render: () => {
        // Months before this metric shipped have no webhook-receipt data at all (there is no
        // backfill) -- show "no data" rather than a misleading 0%.
        const hasData = windowWebhooksReceived > 0;
        return (
          <>
            <div className="dashboard-metric-value-row">
              <span className="dashboard-metric-value">{hasData ? `${windowCoverageRate}%` : "–"}</span>
            </div>
            {hasData ? (
              <MetricChart data={series} dataKey="coverageRate" color="var(--brand)" direction="up" formatValue={(v) => `${v}%`} />
            ) : (
              <p className="dashboard-metric-caption">No webhook data yet for this installation</p>
            )}
          </>
        );
      },
    },
    {
      key: "repoTrend",
      label: "Most-flagged repos over time",
      description:
        "Every repo that has been among a month's most-flagged at any point in the last 6 months, tracked month by month. A flag is a documented rule one of the repo's pull requests broke. A repo can show a lower or zero count in months it wasn't in that month's own top list.",
      wide: true,
      render: () => {
        if (orderedRepoKeys.length === 0) {
          return <p className="dashboard-metric-caption">No flagged repos in this window</p>;
        }
        return (
          <>
            {repoTrendSeries.length < 2 ? (
              <p className="dashboard-metric-caption">Trend chart appears after a second month of data</p>
            ) : (
            <div className="dashboard-metric-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={repoTrendSeries} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
                  <CartesianGrid stroke="rgba(31, 35, 40, 0.08)" vertical={false} />
                  <XAxis dataKey="__label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#57606a" }} dy={6} />
                  <Tooltip content={RepoTrendTooltip} cursor={{ stroke: "rgba(31, 35, 40, 0.25)", strokeWidth: 1, strokeDasharray: "3 3" }} />
                  {orderedRepoKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={REPO_PALETTE[i % REPO_PALETTE.length]}
                      strokeWidth={2.25}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive
                      animationDuration={700}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
            <ul className="dashboard-metric-repo-legend">
              {orderedRepoKeys.map((key, i) => {
                const meta = repoMeta.get(key)!;
                return (
                  <li key={key}>
                    <span
                      className="dashboard-metric-repo-legend-swatch"
                      style={{ background: REPO_PALETTE[i % REPO_PALETTE.length] }}
                    />
                    <a
                      className="dashboard-metric-repo-legend-link truncate"
                      href={repoGitHubUrl(meta)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {key}
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        );
      },
    },
    {
      key: "recentFlagged",
      label: "PRs that broke a rule",
      description:
        "This month's recent pull requests that broke at least one documented rule, the most rules broken first -- click through to see each rule and the sentence it came from.",
      wide: true,
      render: () => (
        <>
          <p className="dashboard-metric-value-caption">{latestMonthLabel}</p>
          {!hasDocData ? (
            noDocData
          ) : rulePrs.length > 0 ? (
            <ul className="dashboard-metric-pr-list">
              {rulePrs.map((pr) => {
                const ruleCount = pr.docRuleViolationCount ?? 0;
                return (
                  <li key={pr.pullUrl} className="dashboard-metric-pr-row">
                    <div className="dashboard-metric-pr-main">
                      <a
                        className="dashboard-metric-pr-link truncate"
                        href={prHtmlUrl(pr.pullUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {pr.repoOwner}/{pr.repoName} #{pr.pullNo}
                      </a>
                      {pr.pullTitle && <p className="dashboard-metric-pr-title truncate">{pr.pullTitle}</p>}
                    </div>
                    <span className="dashboard-metric-pr-badges">
                      <span className="dashboard-metric-pr-badge is-rule">
                        {ruleCount} rule{ruleCount === 1 ? "" : "s"} broken
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dashboard-metric-caption">No pull request broke a documented rule this month</p>
          )}
        </>
      ),
    },
  ];

  const renderCard = (card: MetricCard) => (
    <MetricCardShell key={card.key} label={card.label} description={card.description} wide={card.wide}>
      {card.render()}
    </MetricCardShell>
  );

  return (
    <div>
      <div className="dashboard-metric-window">
        <span className="dashboard-metric-window-title">Last {months.length} month{months.length === 1 ? "" : "s"}</span>
        <span className="dashboard-metric-window-range">{rangeLabel}</span>
      </div>
      <p className="dashboard-metric-section-title is-first">Documented rules</p>
      <div className="dashboard-metric-grid">{RULE_CARDS.map(renderCard)}</div>
      <p className="dashboard-metric-section-title">Pull requests</p>
      <div className="dashboard-metric-grid">{ACTIVITY_CARDS.map(renderCard)}</div>
    </div>
  );
}

function ratePct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
