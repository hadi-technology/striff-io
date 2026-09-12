// Shared fake dataset for marketing surfaces that preview the org metrics dashboard --
// used by the engineering-manager carousel on the homepage and by
// src/pages/screenshot-metrics.astro (kept for one-off screenshot capture). Centralized here so
// both stay in sync instead of drifting copies of the same fixture.
//
// Kept internally consistent the way the API computes it: a flagged pull request is one that
// broke at least one documented rule, clean pull requests are the rest, and a repo's flagged
// count is the rules its pull requests broke that month.
import type { OrgMetricsData } from "../components/MetricsTab";

export const orgMetricsPreviewData: OrgMetricsData = {
  installationId: 1,
  accountLogin: "acme-corp",
  activeRepos: [
    { repoOwner: "acme-corp", repoName: "core-api", active: true },
    { repoOwner: "acme-corp", repoName: "billing-service", active: true },
    { repoOwner: "acme-corp", repoName: "web-app", active: true },
  ],
  // topFlaggedRepos deliberately reshuffles which repos make the monthly top list (auth-service,
  // notifications-service and search-indexer rotate in and out) so the "repos with broken rules
  // over time" chart renders its more-than-five-distinct-repos case, not just a static top 5.
  months: [
    {
      yearMonth: "2026-02",
      prsAnalyzedCount: 61,
      cleanPrCount: 57,
      prCheckWebhooksReceivedCount: 66,
      docRulesHeldCount: 96,
      docRulesViolatedCount: 4,
      docRulesPreExistingCount: 9,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "billing-service", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "web-app", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "auth-service", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [],
    },
    {
      yearMonth: "2026-03",
      prsAnalyzedCount: 68,
      cleanPrCount: 63,
      prCheckWebhooksReceivedCount: 72,
      docRulesHeldCount: 108,
      docRulesViolatedCount: 5,
      docRulesPreExistingCount: 9,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 2 },
        { repoOwner: "acme-corp", repoName: "billing-service", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "worker-queue", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "web-app", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [],
    },
    {
      yearMonth: "2026-04",
      prsAnalyzedCount: 74,
      cleanPrCount: 70,
      prCheckWebhooksReceivedCount: 80,
      docRulesHeldCount: 121,
      docRulesViolatedCount: 5,
      docRulesPreExistingCount: 8,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 3 },
        { repoOwner: "acme-corp", repoName: "notifications-service", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "billing-service", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [],
    },
    {
      yearMonth: "2026-05",
      prsAnalyzedCount: 79,
      cleanPrCount: 76,
      prCheckWebhooksReceivedCount: 84,
      docRulesHeldCount: 134,
      docRulesViolatedCount: 3,
      docRulesPreExistingCount: 7,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "search-indexer", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "notifications-service", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [],
    },
    {
      yearMonth: "2026-06",
      prsAnalyzedCount: 85,
      cleanPrCount: 83,
      prCheckWebhooksReceivedCount: 89,
      docRulesHeldCount: 142,
      docRulesViolatedCount: 2,
      docRulesPreExistingCount: 6,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 1 },
        { repoOwner: "acme-corp", repoName: "web-app", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [],
    },
    {
      yearMonth: "2026-07",
      prsAnalyzedCount: 58,
      cleanPrCount: 55,
      prCheckWebhooksReceivedCount: 65,
      docRulesHeldCount: 151,
      docRulesViolatedCount: 4,
      docRulesPreExistingCount: 5,
      topFlaggedRepos: [
        { repoOwner: "acme-corp", repoName: "core-api", flaggedCount: 3 },
        { repoOwner: "acme-corp", repoName: "billing-service", flaggedCount: 1 },
      ],
      recentFlaggedPrs: [
        {
          repoOwner: "acme-corp",
          repoName: "core-api",
          pullNo: "412",
          pullUrl: "https://github.com/acme-corp/core-api/pull/412",
          pullTitle: "Merge auth and billing request pipelines",
          docRuleViolationCount: 1,
          createdAtMs: Date.now(),
        },
        {
          repoOwner: "acme-corp",
          repoName: "billing-service",
          pullNo: "411",
          pullUrl: "https://github.com/acme-corp/billing-service/pull/411",
          pullTitle: "Read ledger tables directly from the invoice webhook consumer",
          docRuleViolationCount: 1,
          createdAtMs: Date.now() - 1 * 24 * 60 * 60 * 1000,
        },
        {
          repoOwner: "acme-corp",
          repoName: "core-api",
          pullNo: "409",
          pullUrl: "https://github.com/acme-corp/core-api/pull/409",
          pullTitle: "Introduce direct DB call from the notifications module",
          docRuleViolationCount: 2,
          createdAtMs: Date.now() - 3 * 24 * 60 * 60 * 1000,
        },
      ],
    },
  ],
};
