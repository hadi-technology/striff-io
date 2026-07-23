# Dashboard MVP — Coverage Metric (Backend Foundation) Implementation Plan

**Related plans:** phase-1 (this file), phase-2, phase-3

**Goal:** Record every GitHub PR-check webhook event durably at receipt time, and surface `prsAnalyzed / prCheckWebhooksReceived` as a per-month coverage count in the org metrics API response.

**Architecture:** New minimal Mongo collection (`pr_check_webhook_events`) written in `GitHubAppService.handlePullRequest` — before the event is enqueued for analysis, so the count survives billing gates, queue failures, or analysis errors downstream. `OrgMetricsService` queries it the same way it already queries `StriffOperationRecord` (bounded range scan on a compound index, grouped by month in memory) and adds the count to `MonthlyMetricsDto`. No new job, no new auth surface — reuses every existing pattern in ADR-019.

**Working directory for all commands:** `/home/zir0/git/striff-api`

**Maintainability expectations:**
- Reuse `OrgMetricsService`'s existing month-grouping/window-query pattern (`StriffOperationRecordRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual` — `OrgMetricsService.java:66-67`) — do not invent a different aggregation shape for the new collection.
- Match `BillableRepoEvent` / `ProcessedWebhookDelivery` conventions for the new Mongo document (plain getters/setters, `@Document`, `@CompoundIndex`).
- No new field, count, or index without a citation to why it's needed.
- Every change must leave the codebase cleaner or equally clean — never worse.

---

## Phase 1 — PR-check webhook receipt tracking + coverage count in API response

**Objective:** `GET /api/v1/organizations/{id}/metrics` returns `prCheckWebhooksReceivedCount` per month, counting every `pull_request` webhook event with action `opened`/`synchronize`/`reopened` GitHub sent for that installation — independent of whether analysis completed.

**Problem:** Today `MonthlyMetricsDto.prsAnalyzedCount` (`MonthlyMetricsDto.java:20`, populated at `OrgMetricsService.java:141` as `monthOps.size()`) counts only operations that got far enough to persist a `StriffOperationRecord`. If a webhook event never reaches that point — billing gate rejects it, the Redis queue drops it, `DefaultAppAnalysisGateway.analyzePullRequest` throws before `StriffOperationService.generateGitHubStriffs` persists — that PR silently vanishes from every dashboard number. There is no durable record of "a PR-check webhook was received" independent of analysis outcome: `ProcessedWebhookDelivery` (`ProcessedWebhookDelivery.java`) is a TTL-expiring dedup key only (`expiresAt` with `expireAfterSeconds = 0`, 1-hour retention — `GitHubWebhookDedupService.java:15`), not a durable per-installation count.

**Files changed:**
- Create: `src/main/java/com/hadi/striff/app/PrCheckWebhookEvent.java`
- Create: `src/main/java/com/hadi/striff/app/PrCheckWebhookEventRepository.java`
- Modify: `src/main/java/com/hadi/striff/app/GitHubAppService.java:42-54` (constructor), `:72-100` (`handlePullRequest`)
- Modify: `src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java` (add field)
- Modify: `src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:49-57` (constructor), `:59-91` (`getOrgMetrics`), `:93-143` (`buildMonth`)
- Test: `src/test/java/com/hadi/striff/app/GitHubAppServiceTest.java`
- Test: `src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java`

### Steps

- [ ] **Step 1: Create the new Mongo document (non-behavioral — plain data holder, no TDD)**

  ```java
  // src/main/java/com/hadi/striff/app/PrCheckWebhookEvent.java
  package com.hadi.striff.app;

  import org.springframework.data.annotation.Id;
  import org.springframework.data.mongodb.core.index.CompoundIndex;
  import org.springframework.data.mongodb.core.index.CompoundIndexes;
  import org.springframework.data.mongodb.core.mapping.Document;

  /**
   * One GitHub {@code pull_request} webhook event that should trigger analysis (opened/synchronize/
   * reopened), recorded at receipt time in {@link GitHubAppService#handlePullRequest} -- before
   * enqueueing -- independent of whether analysis actually completes. Backs the org metrics
   * "coverage" count: if this and {@code MonthlyMetricsDto.prsAnalyzedCount} diverge, PRs were
   * silently skipped somewhere downstream (billing gate, queue failure, analysis error). See ADR-020.
   */
  @Document(collection = "pr_check_webhook_events")
  @CompoundIndexes({
          @CompoundIndex(name = "idx_pr_check_installation_created", def = "{'installationId': 1, 'createdAtMs': 1}")
  })
  public class PrCheckWebhookEvent {

      @Id
      private String id;

      private long installationId;
      private long createdAtMs;

      public String getId() {
          return id;
      }

      public void setId(String id) {
          this.id = id;
      }

      public long getInstallationId() {
          return installationId;
      }

      public void setInstallationId(long installationId) {
          this.installationId = installationId;
      }

      public long getCreatedAtMs() {
          return createdAtMs;
      }

      public void setCreatedAtMs(long createdAtMs) {
          this.createdAtMs = createdAtMs;
      }
  }
  ```

- [ ] **Step 2: Create the repository (non-behavioral, no TDD)**

  ```java
  // src/main/java/com/hadi/striff/app/PrCheckWebhookEventRepository.java
  package com.hadi.striff.app;

  import org.springframework.data.mongodb.repository.MongoRepository;

  import java.util.List;

  public interface PrCheckWebhookEventRepository extends MongoRepository<PrCheckWebhookEvent, String> {

      /**
       * Backs the org metrics coverage count: events for one installation received on or after a
       * cutoff, served by the {@code {installationId, createdAtMs}} compound index -- same query
       * shape as {@code StriffOperationRecordRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual}.
       */
      List<PrCheckWebhookEvent> findByInstallationIdAndCreatedAtMsGreaterThanEqual(long installationId, long createdAtMsFrom);
  }
  ```

- [ ] **Step 3 (TDD): Write the failing test for webhook recording**

  Add to `src/test/java/com/hadi/striff/app/GitHubAppServiceTest.java`. First add the mock field and update `setUp()`:

  ```java
  // src/test/java/com/hadi/striff/app/GitHubAppServiceTest.java:31-44
  @Mock private GitHubAppWebhookVerifier verifier;
  @Mock private GitHubEventQueue eventQueue;
  @Mock private InstallationRepository installationRepository;
  @Mock private RepoBillingService repoBillingService;
  @Mock private BillingService billingService;
  @Mock private PrCheckWebhookEventRepository prCheckWebhookEventRepository;

  private GitHubAppService service;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @BeforeEach
  void setUp() {
      service = new GitHubAppService(objectMapper, verifier, eventQueue,
              installationRepository, repoBillingService, billingService, prCheckWebhookEventRepository);
  }
  ```

  Append one line as the last statement in each of these three existing test bodies (`GitHubAppServiceTest.java:49-59` `handlePullRequest_openedAction_queuesCheckRun`, `:61-69` `handlePullRequest_synchronizeAction_queuesCheckRun`, `:71-79` `handlePullRequest_reopenedAction_queuesCheckRun`) — no other line in these three methods changes:

  ```java
  verify(prCheckWebhookEventRepository).save(any(PrCheckWebhookEvent.class));
  ```

  Add two new test methods right after `handlePullRequest_labeledAction_noQueue` (~line 109):

  ```java
  @Test
  void handlePullRequest_closedNotMerged_noWebhookEventRecorded() throws Exception {
      String payload = prPayload("closed", false, false);

      service.handlePullRequest(payload, "delivery-14");

      verify(prCheckWebhookEventRepository, never()).save(any());
  }

  @Test
  void handlePullRequest_labeledAction_noWebhookEventRecorded() throws Exception {
      String payload = prPayload("labeled", false, false);

      service.handlePullRequest(payload, "delivery-15");

      verify(prCheckWebhookEventRepository, never()).save(any());
  }
  ```

- [ ] **Step 4 (TDD): Run the test — confirm it fails for the right reason**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=GitHubAppServiceTest`
  Expected: FAIL — compile error, `PrCheckWebhookEventRepository` constructor arg not accepted by `GitHubAppService(...)` (7 args passed, 6 accepted).

- [ ] **Step 5: Wire the repository into `GitHubAppService` and record the event**

  Add one field and one constructor param (`GitHubAppService.java:44-54`) — everything else in the
  class (imports, other fields, other methods) is unchanged:

  ```java
  // src/main/java/com/hadi/striff/app/GitHubAppService.java:44-54
  private final ObjectMapper objectMapper;
  private final GitHubAppWebhookVerifier verifier;
  private final GitHubEventQueue eventQueue;
  private final InstallationRepository installationRepository;
  private final RepoBillingService repoBillingService;
  private final BillingService billingService;
  private final PrCheckWebhookEventRepository prCheckWebhookEventRepository;

  public GitHubAppService(ObjectMapper objectMapper,
                          GitHubAppWebhookVerifier verifier,
                          GitHubEventQueue eventQueue,
                          InstallationRepository installationRepository,
                          RepoBillingService repoBillingService,
                          BillingService billingService,
                          PrCheckWebhookEventRepository prCheckWebhookEventRepository) {
      this.objectMapper = objectMapper;
      this.verifier = verifier;
      this.eventQueue = eventQueue;
      this.installationRepository = installationRepository;
      this.repoBillingService = repoBillingService;
      this.billingService = billingService;
      this.prCheckWebhookEventRepository = prCheckWebhookEventRepository;
  }
  ```

  Then update `handlePullRequest` (`GitHubAppService.java:72-100`):

  ```java
  // src/main/java/com/hadi/striff/app/GitHubAppService.java:72-100
  void handlePullRequest(String payload, String deliveryId) throws Exception {
      PullRequestEvent event = objectMapper.readValue(payload, PullRequestEvent.class);
      repoBillingService.touchRepository(event.installation().id(), event.repository());
      if ("closed".equalsIgnoreCase(event.action()) && event.pull_request() != null && event.pull_request().merged()) {
          handleMergedPullRequest(event, deliveryId);
          return;
      }
      if (!PR_CHECK_ACTIONS.contains(event.action())) {
          return;
      }
      long now = System.currentTimeMillis();
      recordPrCheckWebhookEvent(event.installation().id(), now);
      eventQueue.enqueue(new GitHubQueuedJob.CheckRun(
              UUID.randomUUID().toString(),
              new AppAnalysisRequest(
                      event.installation().id(),
                      event.repository().id(),
                      event.repository().owner().login(),
                      event.repository().name(),
                      event.repository().privateRepo(),
                      event.pull_request().number(),
                      event.pull_request().updated_at(),
                      event.sender() == null ? null : event.sender().login(),
                      event.pull_request().head().sha(),
                      event.pull_request().base().sha(),
                      event.pull_request().html_url(),
                      deliveryId),
              0,
              now));
  }

  private void recordPrCheckWebhookEvent(long installationId, long nowMs) {
      PrCheckWebhookEvent webhookEvent = new PrCheckWebhookEvent();
      webhookEvent.setInstallationId(installationId);
      webhookEvent.setCreatedAtMs(nowMs);
      prCheckWebhookEventRepository.save(webhookEvent);
  }
  ```

- [ ] **Step 6 (TDD): Run the test — confirm it now passes**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=GitHubAppServiceTest`
  Expected: PASS, all 17 tests green.

- [ ] **Step 7: Add the field to `MonthlyMetricsDto` (non-behavioral, no TDD)**

  ```java
  // src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java
  package com.hadi.striff.metrics.dto;

  import java.util.List;

  /**
   * One month's worth of org metrics dashboard data, as returned in {@link OrgMetricsResponse#months()}.
   *
   * <p>{@code cleanPrCount} and {@code highRiskPrCount} are counts, not rates -- the frontend divides by
   * {@code prsAnalyzedCount} to render a rate, matching how every other card in this DTO already leaves
   * formatting/derivation to the frontend. See ADR-019.
   *
   * <p>{@code prCheckWebhooksReceivedCount} is the count of GitHub {@code pull_request} webhook events
   * (opened/synchronize/reopened) received for this installation this month, recorded independent of
   * whether analysis completed. Comparing it to {@code prsAnalyzedCount} surfaces PRs Striff silently
   * skipped. See ADR-020.
   */
  public record MonthlyMetricsDto(
          String yearMonth,
          int structuralRegressionCount,
          int reviewHotspotCount,
          int prsAnalyzedCount,
          int cleanPrCount,
          int highRiskPrCount,
          int prCheckWebhooksReceivedCount,
          List<RepoHotspotDto> topFlaggedRepos) {
  }
  ```

- [ ] **Step 8 (TDD): Write the failing test for coverage-count wiring**

  Update `src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java`. Add the import, mock field, and constructor call:

  ```java
  // src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java -- add import near top
  import com.hadi.striff.app.PrCheckWebhookEvent;
  import com.hadi.striff.app.PrCheckWebhookEventRepository;
  ```

  ```java
  // src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java:39-46
  @Mock
  private InstallationRepository installationRepository;
  @Mock
  private StriffOperationRecordRepository operationRepository;
  @Mock
  private AIReviewResultRepository aiReviewResultRepository;
  @Mock
  private BillableRepoEventRepository billableRepoEventRepository;
  @Mock
  private PrCheckWebhookEventRepository prCheckWebhookEventRepository;
  ```

  Every `new OrgMetricsService(installationRepository, operationRepository, aiReviewResultRepository, billableRepoEventRepository)` call site in this file (3 occurrences: `groupsCountsByMonthAndRanksFlaggedRepos`, `handlesUnknownInstallationGracefully`, `highRiskPrCountReflectsStructuralRegressionsOnlyAndIgnoresEmptySurfacedItems`) becomes:

  ```java
  OrgMetricsService service = new OrgMetricsService(installationRepository, operationRepository,
          aiReviewResultRepository, billableRepoEventRepository, prCheckWebhookEventRepository);
  ```

  Add one new test after `groupsCountsByMonthAndRanksFlaggedRepos`:

  ```java
  @Test
  public void countsPrCheckWebhookEventsReceivedPerMonthIndependentOfAnalysisOutcome() {
      when(installationRepository.findByInstallationId(INSTALLATION_ID)).thenReturn(Optional.empty());
      when(operationRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual(anyLong(), anyLong()))
              .thenReturn(List.of());
      when(billableRepoEventRepository.findByInstallationIdAndDisconnectedAtMs(INSTALLATION_ID, 0L))
              .thenReturn(List.of());

      long now = System.currentTimeMillis();
      when(prCheckWebhookEventRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual(anyLong(), anyLong()))
              .thenReturn(List.of(webhookEvent(now), webhookEvent(now), webhookEvent(now)));

      OrgMetricsService service = new OrgMetricsService(installationRepository, operationRepository,
              aiReviewResultRepository, billableRepoEventRepository, prCheckWebhookEventRepository);

      MonthlyMetricsDto latest = service.getOrgMetrics(INSTALLATION_ID, 1).months().get(0);

      // 3 webhook events received, 0 StriffOperationRecords created -- all 3 were silently skipped
      assertThat(latest.prCheckWebhooksReceivedCount()).isEqualTo(3);
      assertThat(latest.prsAnalyzedCount()).isZero();
  }

  private static PrCheckWebhookEvent webhookEvent(long createdAtMs) {
      PrCheckWebhookEvent event = new PrCheckWebhookEvent();
      event.setInstallationId(INSTALLATION_ID);
      event.setCreatedAtMs(createdAtMs);
      return event;
  }
  ```

- [ ] **Step 9 (TDD): Run the test — confirm it fails for the right reason**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest`
  Expected: FAIL — compile error, `OrgMetricsService` constructor doesn't accept a 5th argument yet.

- [ ] **Step 10: Wire coverage counting into `OrgMetricsService`**

  Add two imports (`OrgMetricsService.java:3-4`, alongside the existing `com.hadi.striff.ai.model.*`
  imports):

  ```java
  import com.hadi.striff.app.PrCheckWebhookEvent;
  import com.hadi.striff.app.PrCheckWebhookEventRepository;
  ```

  Add one field and one constructor param (`OrgMetricsService.java:44-57`) — everything else
  (other imports, `TOP_N`, other fields) is unchanged:

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:44-57
  private final InstallationRepository installationRepository;
  private final StriffOperationRecordRepository operationRepository;
  private final AIReviewResultRepository aiReviewResultRepository;
  private final BillableRepoEventRepository billableRepoEventRepository;
  private final PrCheckWebhookEventRepository prCheckWebhookEventRepository;

  public OrgMetricsService(InstallationRepository installationRepository,
                            StriffOperationRecordRepository operationRepository,
                            AIReviewResultRepository aiReviewResultRepository,
                            BillableRepoEventRepository billableRepoEventRepository,
                            PrCheckWebhookEventRepository prCheckWebhookEventRepository) {
      this.installationRepository = installationRepository;
      this.operationRepository = operationRepository;
      this.aiReviewResultRepository = aiReviewResultRepository;
      this.billableRepoEventRepository = billableRepoEventRepository;
      this.prCheckWebhookEventRepository = prCheckWebhookEventRepository;
  }
  ```

  Update the class javadoc (`OrgMetricsService.java:29-36`) to add one sentence:

  ```java
  * {@code prCheckWebhooksReceivedCount} (ADR-020) uses the identical query shape against
  * {@link PrCheckWebhookEvent}.
  ```

  Update `getOrgMetrics` (`OrgMetricsService.java:59-91`, full replacement — the method body changes
  throughout, not just one line):

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:59-91
  public OrgMetricsResponse getOrgMetrics(long installationId, int months) {
      Installation installation = installationRepository.findByInstallationId(installationId).orElse(null);
      String accountLogin = installation != null ? installation.getAccountLogin() : null;

      List<String> yearMonths = lastNYearMonths(months);
      long cutoffMs = monthStartMs(yearMonths.get(0));

      List<StriffOperationRecord> operations =
              operationRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual(installationId, cutoffMs);

      Map<String, AIReviewResult> reviewsByOperationId = operations.isEmpty()
              ? Map.of()
              : aiReviewResultRepository
                      .findAllByOperationIdIn(operations.stream().map(StriffOperationRecord::getOperationId).toList())
                      .stream()
                      .collect(Collectors.toMap(AIReviewResult::getOperationId, r -> r, (a, b) -> a));

      Map<String, List<StriffOperationRecord>> operationsByMonth = operations.stream()
              .collect(Collectors.groupingBy(op -> YEAR_MONTH.format(Instant.ofEpochMilli(op.getCreatedAtMs()))));

      Map<String, Long> webhooksReceivedByMonth = prCheckWebhookEventRepository
              .findByInstallationIdAndCreatedAtMsGreaterThanEqual(installationId, cutoffMs)
              .stream()
              .collect(Collectors.groupingBy(
                      e -> YEAR_MONTH.format(Instant.ofEpochMilli(e.getCreatedAtMs())), Collectors.counting()));

      List<MonthlyMetricsDto> monthDtos = new ArrayList<>();
      for (String yearMonth : yearMonths) {
          monthDtos.add(buildMonth(yearMonth, operationsByMonth.getOrDefault(yearMonth, List.of()), reviewsByOperationId,
                  webhooksReceivedByMonth.getOrDefault(yearMonth, 0L).intValue()));
      }

      List<ActiveRepoDto> activeRepos = billableRepoEventRepository
              .findByInstallationIdAndDisconnectedAtMs(installationId, ACTIVE_EVENT_DISCONNECTED_AT_MS)
              .stream()
              .map(this::toActiveRepoDto)
              .toList();

      return new OrgMetricsResponse(installationId, accountLogin, monthDtos, activeRepos);
  }
  ```

  `buildMonth`'s loop body (`OrgMetricsService.java:95-140`, computing `regressionCount`,
  `hotspotCount`, `cleanPrCount`, `highRiskPrCount`, `flaggedCountByRepo`, `topFlaggedRepos`) is
  untouched by this phase — phase-2 modifies that body. Only the signature (line 93) and the
  `return` (line 141) change:

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:93
  private MonthlyMetricsDto buildMonth(String yearMonth, List<StriffOperationRecord> monthOps,
                                        Map<String, AIReviewResult> reviewsByOperationId,
                                        int webhooksReceivedCount) {
  ```

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:141
      return new MonthlyMetricsDto(yearMonth, regressionCount, hotspotCount, monthOps.size(),
              cleanPrCount, highRiskPrCount, webhooksReceivedCount, topFlaggedRepos);
  ```

- [ ] **Step 11 (TDD): Run the test — confirm it now passes**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest`
  Expected: PASS, all tests green including the new `countsPrCheckWebhookEventsReceivedPerMonthIndependentOfAnalysisOutcome`.

- [ ] **Step 12: Run the full affected test set + Checkstyle/SpotBugs**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=GitHubAppServiceTest,OrgMetricsServiceTest,OrgMetricsControllerTest`
  Expected: PASS. `OrgMetricsControllerTest` mocks `OrgMetricsService` entirely (`OrgMetricsControllerTest.java:31`) so its constructor signature change doesn't affect it.

  Run: `cd /home/zir0/git/striff-api && mvn package -DskipTests`
  Expected: BUILD SUCCESS, 0 violations. (Not `mvn checkstyle:check spotbugs:check` directly —
  that invokes default rulesets and reports ~12,782 unrelated pre-existing violations repo-wide.
  Both plugins are bound to the `package` phase with the project's real config — see
  `pom.xml:314-342` — so `mvn package -DskipTests` is what actually reproduces CI's check.)

- [ ] **Step 13: Commit**

  ```bash
  cd /home/zir0/git/striff-api && git add \
    src/main/java/com/hadi/striff/app/PrCheckWebhookEvent.java \
    src/main/java/com/hadi/striff/app/PrCheckWebhookEventRepository.java \
    src/main/java/com/hadi/striff/app/GitHubAppService.java \
    src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java \
    src/main/java/com/hadi/striff/metrics/OrgMetricsService.java \
    src/test/java/com/hadi/striff/app/GitHubAppServiceTest.java \
    src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java \
    && git commit -m "feat: record PR-check webhook receipts, surface coverage count in org metrics"
  ```

### Definition of Done

**Functional DoD:**
- `GET /api/v1/organizations/{id}/metrics` response includes `prCheckWebhooksReceivedCount` per month.
- A PR-check webhook that never becomes a `StriffOperationRecord` (billing gate, queue drop, analysis error) still increments this count, proving the coverage gap is now visible.
- `handlePullRequest` records exactly one `PrCheckWebhookEvent` per `opened`/`synchronize`/`reopened` action, zero for `closed`-not-merged and non-PR-check actions.

**Code DoD:**

```bash
cd /home/zir0/git/striff-api && mvn test -Dtest=GitHubAppServiceTest,OrgMetricsServiceTest,OrgMetricsControllerTest   # expect BUILD SUCCESS
cd /home/zir0/git/striff-api && mvn package -DskipTests                                                              # expect BUILD SUCCESS (Checkstyle+SpotBugs bound at package phase)
cd /home/zir0/git/striff-api && grep -n "prCheckWebhooksReceivedCount" src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java   # expect 1 match
cd /home/zir0/git/striff-api && git grep -n "TODO:" src/main/java/com/hadi/striff/app/PrCheckWebhookEvent.java src/main/java/com/hadi/striff/app/GitHubAppService.java src/main/java/com/hadi/striff/metrics/OrgMetricsService.java   # expect 0
```

**Cleanliness self-check:**
- [ ] TDD followed for behavioral changes (webhook recording, service wiring) — failing test written and confirmed red before implementation
- [ ] Non-TDD steps (new Mongo document, new DTO field) documented as non-behavioral in their step headers
- [ ] No raw numbers/strings where an existing constant/pattern applies — new collection name and index shape mirror `BillableRepoEvent`
- [ ] No duplicated logic — new repository query method matches `StriffOperationRecordRepository`'s existing shape exactly
- [ ] Naming matches nearest peers (`ProcessedWebhookDelivery`, `BillableRepoEvent`, `StriffOperationRecordRepository`)
- [ ] No new file created where an existing one could house the change (DTO/service edits are in-place)
- [ ] No dead code, commented-out code, unused imports, or stray `console.log`/`System.out` left behind
- [ ] Diff is the minimum needed — no repo-level breakdown, no new job, no new auth surface added
