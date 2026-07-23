# Dashboard MVP — Click-Through to Flagged PRs (Backend) Implementation Plan

**Related plans:** phase-1, phase-2 (this file), phase-3

**Depends on:** phase-1 (must be implemented first — this phase adds a further field to `MonthlyMetricsDto` and calls `buildMonth` with the signature phase-1 already changed)

**Goal:** Org metrics API response includes, per month, the most-recently-flagged PRs with a direct link to each PR on GitHub — so a click on a "regressions flagged" count leads to actual evidence, not just an aggregate.

**Architecture:** `StriffOperationRecord` already stores `pullUrl`/`pullNo` (sourced from the GitHub webhook's `pull_request.html_url`/`number` at analysis time — `StriffOperationService.java:379-387`) for every GitHub-App-triggered operation. `OrgMetricsService.buildMonth` already iterates every operation and already computes per-operation flagged status (`repoRegressions`/`repoHotspots`) to build `topFlaggedRepos` — this phase captures that same per-operation data into a new `FlaggedPrDto` list instead of only a per-repo count, sorted most-recent-first, capped at the same `TOP_N` used for `topFlaggedRepos`. No new query, no new collection.

**Working directory for all commands:** `/home/zir0/git/striff-api`

**Maintainability expectations:**
- Reuse the existing per-operation loop in `buildMonth` — do not add a second pass over `monthOps`.
- Reuse `TOP_N` (`OrgMetricsService.java:40`) rather than introducing a second magic cap.
- Match `RepoHotspotDto`'s record shape/javadoc style for the new `FlaggedPrDto`.
- Every change must leave the codebase cleaner or equally clean — never worse.

---

## Phase 2 — `FlaggedPrDto` + `recentFlaggedPrs` in the monthly response

**Objective:** `MonthlyMetricsDto.recentFlaggedPrs` returns up to 5 most-recently-created flagged PRs for the month, each with `pullUrl` for the frontend to link to.

**Problem:** `OrgMetricsService.buildMonth` (`OrgMetricsService.java:93-143`) already knows, per operation, whether it was flagged (`flagged = repoRegressions + repoHotspots > 0`, line 117-118) and already has `op.getPullUrl()`/`op.getPullNo()`/`op.getBaseRepoOwner()`/`op.getBaseRepoName()`/`op.getCreatedAtMs()` in scope — but today that data is thrown away after updating `flaggedCountByRepo`. The dashboard (`MetricsTab.tsx`) can show "12 regressions flagged" with no way to see which 12 PRs, forcing a customer to trust the count instead of verifying it.

**Files changed:**
- Create: `src/main/java/com/hadi/striff/metrics/dto/FlaggedPrDto.java`
- Modify: `src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java` (add field — depends on phase-1's version of this file)
- Modify: `src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:93-143` (`buildMonth`) — depends on phase-1's version of this file
- Test: `src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java` — depends on phase-1's version of this file

### Steps

- [ ] **Step 1: Create the new DTO (non-behavioral, no TDD)**

  ```java
  // src/main/java/com/hadi/striff/metrics/dto/FlaggedPrDto.java
  package com.hadi.striff.metrics.dto;

  /**
   * One PR flagged with a structural regression and/or review hotspot this month, most-recent
   * first, capped at the same top-N as {@link RepoHotspotDto}. Links the dashboard directly to the
   * PR that triggered the flag (see ADR-020) -- {@code pullUrl}/{@code pullNo} are
   * {@code StriffOperationRecord.pullUrl}/{@code pullNo}, sourced from the GitHub webhook payload at
   * analysis time.
   */
  public record FlaggedPrDto(
          String repoOwner,
          String repoName,
          String pullNo,
          String pullUrl,
          int regressionCount,
          int hotspotCount,
          long createdAtMs) {
  }
  ```

- [ ] **Step 2 (TDD): Write the failing test**

  Update `src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java`. Add import:

  ```java
  import com.hadi.striff.metrics.dto.FlaggedPrDto;
  ```

  Update the `operation()` helper (currently `OrgMetricsServiceTest.java:165-173`) to set `pullNo`/`pullUrl` so assertions have real values to check:

  ```java
  private static StriffOperationRecord operation(String repoOwner, String repoName, long createdAtMs) {
      StriffOperationRecord op = new StriffOperationRecord();
      op.setOperationId(UUID.randomUUID().toString());
      op.setInstallationId(INSTALLATION_ID);
      op.setBaseRepoOwner(repoOwner);
      op.setBaseRepoName(repoName);
      op.setCreatedAtMs(createdAtMs);
      op.setPullNo("7");
      op.setPullUrl("https://github.com/" + repoOwner + "/" + repoName + "/pull/7");
      return op;
  }
  ```

  Add a new test after `groupsCountsByMonthAndRanksFlaggedRepos`:

  ```java
  @Test
  public void recentFlaggedPrsAreMostRecentFirstAndExcludeCleanPrs() {
      when(installationRepository.findByInstallationId(INSTALLATION_ID)).thenReturn(Optional.empty());
      when(billableRepoEventRepository.findByInstallationIdAndDisconnectedAtMs(INSTALLATION_ID, 0L))
              .thenReturn(List.of());
      when(prCheckWebhookEventRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual(anyLong(), anyLong()))
              .thenReturn(List.of());

      long earlier = System.currentTimeMillis() - 60_000;
      long later = System.currentTimeMillis();
      StriffOperationRecord flaggedEarlier = operation("acme", "repo1", earlier);
      StriffOperationRecord flaggedLater = operation("acme", "repo2", later);
      StriffOperationRecord clean = operation("acme", "repo3", later);
      when(operationRepository.findByInstallationIdAndCreatedAtMsGreaterThanEqual(anyLong(), anyLong()))
              .thenReturn(List.of(flaggedEarlier, flaggedLater, clean));

      when(aiReviewResultRepository.findAllByOperationIdIn(
              List.of(flaggedEarlier.getOperationId(), flaggedLater.getOperationId(), clean.getOperationId())))
              .thenReturn(List.of(
                      review(flaggedEarlier.getOperationId(), List.of(surfacedItem(SurfacedReviewPriority.STRUCTURAL_REGRESSION))),
                      review(flaggedLater.getOperationId(), List.of(surfacedItem(SurfacedReviewPriority.REVIEW_HOTSPOT))),
                      review(clean.getOperationId(), List.of(surfacedItem(SurfacedReviewPriority.INFORMATIONAL_SIGNAL)))));

      OrgMetricsService service = new OrgMetricsService(installationRepository, operationRepository,
              aiReviewResultRepository, billableRepoEventRepository, prCheckWebhookEventRepository);

      List<FlaggedPrDto> recentFlaggedPrs = service.getOrgMetrics(INSTALLATION_ID, 1).months().get(0).recentFlaggedPrs();

      // clean PR excluded; flaggedLater (more recent createdAtMs) sorts before flaggedEarlier
      assertThat(recentFlaggedPrs).hasSize(2);
      assertThat(recentFlaggedPrs.get(0).repoName()).isEqualTo("repo2");
      assertThat(recentFlaggedPrs.get(0).hotspotCount()).isEqualTo(1);
      assertThat(recentFlaggedPrs.get(0).regressionCount()).isZero();
      assertThat(recentFlaggedPrs.get(0).pullUrl()).isEqualTo("https://github.com/acme/repo2/pull/7");
      assertThat(recentFlaggedPrs.get(1).repoName()).isEqualTo("repo1");
      assertThat(recentFlaggedPrs.get(1).regressionCount()).isEqualTo(1);
  }
  ```

- [ ] **Step 3 (TDD): Run the test — confirm it fails for the right reason**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest`
  Expected: FAIL — compile error, `MonthlyMetricsDto.recentFlaggedPrs()` does not exist yet.

- [ ] **Step 4: Add the field to `MonthlyMetricsDto`**

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
   *
   * <p>{@code recentFlaggedPrs} is the same top-N-by-count ranking used for {@code topFlaggedRepos},
   * but per-PR instead of per-repo, most-recent-first -- gives the dashboard a direct link to the PR
   * evidence behind a flagged count instead of only an aggregate. See ADR-020.
   */
  public record MonthlyMetricsDto(
          String yearMonth,
          int structuralRegressionCount,
          int reviewHotspotCount,
          int prsAnalyzedCount,
          int cleanPrCount,
          int highRiskPrCount,
          int prCheckWebhooksReceivedCount,
          List<RepoHotspotDto> topFlaggedRepos,
          List<FlaggedPrDto> recentFlaggedPrs) {
  }
  ```

- [ ] **Step 5: Collect and rank flagged PRs in `buildMonth`**

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java -- add import
  import com.hadi.striff.metrics.dto.FlaggedPrDto;
  import java.util.Comparator;
  ```

  ```java
  // src/main/java/com/hadi/striff/metrics/OrgMetricsService.java:93-143 (full replacement)
  private MonthlyMetricsDto buildMonth(String yearMonth, List<StriffOperationRecord> monthOps,
                                        Map<String, AIReviewResult> reviewsByOperationId,
                                        int webhooksReceivedCount) {
      int regressionCount = 0;
      int hotspotCount = 0;
      int cleanPrCount = 0;
      int highRiskPrCount = 0;
      Map<String, Integer> flaggedCountByRepo = new HashMap<>();
      List<FlaggedPrDto> flaggedPrs = new ArrayList<>();

      for (StriffOperationRecord op : monthOps) {
          AIReviewResult review = reviewsByOperationId.get(op.getOperationId());
          if (review == null) {
              continue;
          }
          int repoRegressions = 0;
          int repoHotspots = 0;
          for (SurfacedReviewItem item : review.getSurfacedItems()) {
              if (item.priority() == SurfacedReviewPriority.STRUCTURAL_REGRESSION) {
                  repoRegressions++;
              } else if (item.priority() == SurfacedReviewPriority.REVIEW_HOTSPOT) {
                  repoHotspots++;
              }
          }
          regressionCount += repoRegressions;
          hotspotCount += repoHotspots;
          int flagged = repoRegressions + repoHotspots;
          if (flagged > 0) {
              String repoKey = op.getBaseRepoOwner() + "/" + op.getBaseRepoName();
              flaggedCountByRepo.merge(repoKey, flagged, Integer::sum);
              flaggedPrs.add(new FlaggedPrDto(op.getBaseRepoOwner(), op.getBaseRepoName(), op.getPullNo(),
                      op.getPullUrl(), repoRegressions, repoHotspots, op.getCreatedAtMs()));
          } else {
              // "Clean" mirrors the same regression+hotspot definition "flagged" already uses
              // above -- a PR with only an Informational Signal still counts as clean, since
              // informational items never counted toward "flagged" either.
              cleanPrCount++;
          }
          if (repoRegressions > 0) {
              highRiskPrCount++;
          }
      }

      List<RepoHotspotDto> topFlaggedRepos = flaggedCountByRepo.entrySet().stream()
              .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
              .limit(TOP_N)
              .map(e -> {
                  String[] ownerName = e.getKey().split("/", 2);
                  return new RepoHotspotDto(ownerName[0], ownerName.length > 1 ? ownerName[1] : "", e.getValue());
              })
              .toList();

      List<FlaggedPrDto> recentFlaggedPrs = flaggedPrs.stream()
              .sorted(Comparator.comparingLong(FlaggedPrDto::createdAtMs).reversed())
              .limit(TOP_N)
              .toList();

      return new MonthlyMetricsDto(yearMonth, regressionCount, hotspotCount, monthOps.size(),
              cleanPrCount, highRiskPrCount, webhooksReceivedCount, topFlaggedRepos, recentFlaggedPrs);
  }
  ```

- [ ] **Step 6 (TDD): Run the test — confirm it now passes**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest`
  Expected: PASS, all tests green including `recentFlaggedPrsAreMostRecentFirstAndExcludeCleanPrs`.

- [ ] **Step 7: Run the full affected test set + Checkstyle/SpotBugs**

  Run: `cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest,OrgMetricsControllerTest,GitHubAppServiceTest`
  Expected: PASS.

  Run: `cd /home/zir0/git/striff-api && mvn package -DskipTests`
  Expected: BUILD SUCCESS, 0 violations in touched files. (Checkstyle/SpotBugs `check` goals are bound to the `package` phase with the project's real config — `striffcheckstyleconfig.xml` / `spotbugs_exclude.xml`, see `pom.xml:314-342`. Running `mvn checkstyle:check spotbugs:check` directly invokes default rules instead and produces ~12,782 unrelated pre-existing violations repo-wide — do not use that form.)

- [ ] **Step 8: Commit**

  ```bash
  cd /home/zir0/git/striff-api && git add \
    src/main/java/com/hadi/striff/metrics/dto/FlaggedPrDto.java \
    src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java \
    src/main/java/com/hadi/striff/metrics/OrgMetricsService.java \
    src/test/java/com/hadi/striff/metrics/OrgMetricsServiceTest.java \
    && git commit -m "feat: surface recently-flagged PRs with GitHub links in org metrics"
  ```

### Definition of Done

**Functional DoD:**
- `GET /api/v1/organizations/{id}/metrics` response includes `months[].recentFlaggedPrs`, each with a real `pullUrl`.
- List excludes clean PRs (zero regressions + zero hotspots), most-recent first, capped at 5.
- A PR with both a regression and a hotspot appears once with both counts populated, not twice.

**Code DoD:**

```bash
cd /home/zir0/git/striff-api && mvn test -Dtest=OrgMetricsServiceTest,OrgMetricsControllerTest,GitHubAppServiceTest   # expect BUILD SUCCESS
cd /home/zir0/git/striff-api && mvn package -DskipTests                                                              # expect BUILD SUCCESS (runs Checkstyle/SpotBugs with project's real config, bound to package phase — see pom.xml:314-342; do NOT use `mvn checkstyle:check spotbugs:check`, it invokes default rules and produces ~12,782 unrelated pre-existing violations repo-wide)
cd /home/zir0/git/striff-api && grep -n "recentFlaggedPrs" src/main/java/com/hadi/striff/metrics/dto/MonthlyMetricsDto.java   # expect 1 match
cd /home/zir0/git/striff-api && git grep -n "TODO:" src/main/java/com/hadi/striff/metrics/dto/FlaggedPrDto.java src/main/java/com/hadi/striff/metrics/OrgMetricsService.java   # expect 0
```

**Cleanliness self-check:**
- [ ] TDD followed — failing test written and confirmed red before implementation
- [ ] No raw numbers where `TOP_N` already exists — reused, not duplicated
- [ ] No second pass over `monthOps` added — flagged-PR collection happens inline in the existing loop
- [ ] Naming matches nearest peer (`RepoHotspotDto`)
- [ ] No new file created where an existing one could house the change (DTO/service edits are in-place; only the new record type is a new file, matching how `RepoHotspotDto` also got its own file)
- [ ] No dead code, commented-out code, unused imports left behind
- [ ] Diff is the minimum needed — no pagination, no per-repo drilldown, no new endpoint
