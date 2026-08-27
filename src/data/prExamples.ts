/**
 * The /examples gallery: four public pull requests, and the output Striff produced on them.
 *
 * Everything in this file is quoted from a real analysis of a real pull request, and every
 * claim in it was checked by hand against the two revisions named in `revisions` before it
 * was allowed onto the page. `audit` is that check, written down. If a row cannot be
 * reproduced by following its own audit lines, it does not belong here.
 *
 * Two rules that were learned the hard way while assembling this:
 *
 *  1. Check the BASE revision, not only the head. "This edge is new" and "this namespace is
 *     gone" are both claims about what the code looked like before.
 *  2. Check the diagram too, not only the text on the page. The rendered SVG carries the
 *     review notes inside it; a note that cannot be verified disqualifies the whole image,
 *     because a reader can zoom in and read it. Two otherwise excellent candidates were
 *     dropped for exactly that.
 */

/** Which kind of thing the example is showing. Drives the badge colour only. */
export type PrExampleKind = "contract" | "boundary" | "cycle" | "docs";

/** One block of output, quoted verbatim from the analysis. */
export type PrExampleOutput = {
  /** DETECTOR severity, or the word the check itself used. */
  severity: "HIGH" | "MEDIUM" | "LOW" | "EVIDENCE";
  title: string;
  body: string;
  /** The suggested direction, when the run produced one. Quoted verbatim. */
  fix?: string;
};

/** One documented rule, its citation, and what the evaluator returned. */
export type PrExampleRule = {
  doc: string;
  quote: string;
  statement: string;
  verdict: "HOLDS";
  /** Where the declaration actually is, as read by hand at the head revision. */
  found: string;
};

export type PrExample = {
  id: string;
  kind: PrExampleKind;
  kindLabel: string;
  repo: string;
  pr: string;
  prTitle: string;
  prState: "Open" | "Merged";
  href: string;
  /** One sentence, legible to somebody who has never seen this repository. */
  lede: string;
  /** The run's own one-line summary of the diff it looked at. Verbatim. */
  headline: string;
  svg: string;
  /** How the diagram opens. Fractions of the image, so the same point at any stage width. */
  panzoom: {
    focus: { x: number; y: number };
    desktopScale: number;
    mobileScale: number;
  };
  viewport: { desktopHeight: string; mobileHeight: string };
  revisions: { baseLabel: string; base: string; headLabel: string; head: string; compare: string };
  outputs: PrExampleOutput[];
  rules?: PrExampleRule[];
  /** Present when the run recorded the finding as evidence rather than raising it. */
  quietNote?: string;
  /** What was checked by hand, and what was found. Each line is independently reproducible. */
  audit: string[];
};

export const prExamples: PrExample[] = [
  {
    id: "smallrye-1424",
    kind: "contract",
    kindLabel: "Contract change",
    repo: "smallrye/smallrye-graphql",
    pr: "#1424",
    prTitle: "#1423: add GraphQLResult and wrap successful result",
    prState: "Open",
    href: "https://github.com/smallrye/smallrye-graphql/pull/1424",
    lede: "Two accessors on a schema model class were renamed. The rename is one line in the diff. The number of components that depend on the class is not in the diff at all.",
    headline: "1 structural regression detected",
    svg: "/examples/smallrye-graphql-1424.svg",
    panzoom: { focus: { x: 0.575, y: 0.65 }, desktopScale: 2.4, mobileScale: 2.4 },
    viewport: { desktopHeight: "32rem", mobileHeight: "12rem" },
    revisions: {
      baseLabel: "base",
      base: "6e20902",
      headLabel: "head",
      head: "ee8436b",
      compare: "https://github.com/smallrye/smallrye-graphql/compare/6e20902ba83b5c62013df61d6eb9711931b1a9e0...t1:smallrye-graphql:ee8436b9614a1fae350fc5f299e711ac20d30293"
    },
    outputs: [
      {
        severity: "HIGH",
        title: "Breaking contract change in Wrapper",
        body: "`Wrapper` removed public methods `isNotEmpty()` and `setNotEmpty(boolean)`. 12 components depend on this type, and the removal may cause compilation or runtime failures in those dependents. This is a stable contract change that should be coordinated across the codebase.",
        fix: "Restore the removed methods `isNotEmpty()` and `setNotEmpty(boolean)` in `Wrapper` and deprecate them instead, or update all 12 known dependents (e.g., `AbstractHelper`, `DefaultMapAdapter`, `DataFetcherFactory`, `Bootstrap`) to use the new `isNonNull()`/`setNonNull(boolean)` equivalents before removal."
      }
    ],
    audit: [
      "`Wrapper.java`, in the `common/schema-model` module, declares `setNotEmpty(boolean)` and `isNotEmpty()` at the base revision. At the head revision it declares `setNonNull(boolean)` and `isNonNull()` instead — and neither of the two methods the check names.",
      "Twelve files under `src/main` reference `Wrapper` at both revisions — the same count the check reports.",
      "All four dependents the suggested fix names — `AbstractHelper`, `DefaultMapAdapter`, `DataFetcherFactory`, `Bootstrap` — reference `Wrapper` at the head revision.",
      "The rename is the pull request's own work: the commit that performs it is on the branch, and the base revision is the merge base, so nothing here is an artefact of the branch being behind.",
      "Only two `isNotEmpty()` calls survive anywhere in the repository at the head revision, and both are AssertJ string assertions in integration tests that have nothing to do with this class."
    ]
  },
  {
    id: "citrus-370",
    kind: "cycle",
    kindLabel: "A loop closed",
    repo: "citrusframework/citrus-simulator",
    pr: "#370",
    prTitle: "feat: persist only failed scenarios",
    prState: "Open",
    href: "https://github.com/citrusframework/citrus-simulator/pull/370",
    lede: "A listener class gained a constructor parameter so it could read a configuration flag. That one parameter is the last edge of a loop that runs through four packages.",
    headline: "7 components, 13 relationships, no items surfaced (2 evidence-only findings)",
    svg: "/examples/citrus-simulator-370.svg",
    panzoom: { focus: { x: 0.66, y: 0.60 }, desktopScale: 1, mobileScale: 1 },
    viewport: { desktopHeight: "38rem", mobileHeight: "22rem" },
    revisions: {
      baseLabel: "base",
      base: "c658ef8",
      headLabel: "head",
      head: "51917ce",
      compare: "https://github.com/citrusframework/citrus-simulator/compare/c658ef84ef5cabba71bf8b7a99ebce664a9aa785...postfinance:citrus-simulator:51917ce9913122728aa9f756a1af203510507a57"
    },
    outputs: [
      {
        severity: "LOW",
        title: "New directional dependency",
        body: "New dependency from `org.citrusframework.simulator.listener` to `org.citrusframework.simulator.config`, with no prior edge in this direction."
      },
      {
        severity: "MEDIUM",
        title: "Package cycle detected",
        body: "A dependency cycle among 11 packages (37 edges) already turned before this PR, which adds org.citrusframework.simulator.listener -> org.citrusframework.simulator.config to it."
      }
    ],
    quietNote:
      "Both of these were recorded as evidence behind the diagram. Neither was raised as an item on the check — the loop was already turning, and this change adds an edge to it rather than creating it.",
    audit: [
      "At the base revision, no file in `org.citrusframework.simulator.listener` references `org.citrusframework.simulator.config`. At the head revision, `SimulatorStatusListener` imports `SimulatorConfigurationProperties`.",
      "The way back was already there, in production sources only, at the base revision: `SimulatorConfigurer` (config) imports `ScenarioMapper` (scenario.mapper); `ScenarioMappers` imports `HttpOperationScenario` (http); `SimulatorRestAutoConfiguration` imports `SimulatorMessageListener` (listener).",
      "Those three edges plus the one this pull request adds form a closed loop: config → scenario.mapper → http → listener → config.",
      "Rebuilding the package graph from imports independently puts both `listener` and `config` inside one strongly connected component at the base revision, which is what the second finding says: the cycle predates the change."
    ]
  },
  {
    id: "smallrye-2083",
    kind: "boundary",
    kindLabel: "Boundary crossing",
    repo: "smallrye/smallrye-graphql",
    pr: "#2083",
    prTitle: "Add custom scalar support to client value formatter",
    prState: "Open",
    href: "https://github.com/smallrye/smallrye-graphql/pull/2083",
    lede: "Two files changed. One of them is a formatting helper inside the client, and it started importing types that are declared in the server module.",
    headline: "11 components, 13 relationships, no items surfaced (1 evidence-only finding)",
    svg: "/examples/smallrye-graphql-2083.svg",
    panzoom: { focus: { x: 0.55, y: 0.58 }, desktopScale: 1.2, mobileScale: 1.2 },
    viewport: { desktopHeight: "32rem", mobileHeight: "10rem" },
    revisions: {
      baseLabel: "base",
      base: "c48e433",
      headLabel: "head",
      head: "b2484d4",
      compare: "https://github.com/smallrye/smallrye-graphql/compare/c48e4330495cd4fe8374326cf26a014caaff7615...sap-ali:smallrye-graphql:b2484d4f130443119cc841c00635c2a38fb66749"
    },
    outputs: [
      {
        severity: "LOW",
        title: "New directional dependency",
        body: "New dependency from `io.smallrye.graphql.client.impl.core.utils` to `io.smallrye.graphql.api`, with no prior edge in this direction."
      }
    ],
    quietNote:
      "This is the quiet end of the output. One evidence-only finding, nothing raised on the check, and a diagram that puts the new edge in front of you without anybody having to argue about it.",
    audit: [
      "The pull request changes exactly two files: `ValueFormatter.java` and its test.",
      "At the base revision the package `io.smallrye.graphql.client.impl.core.utils` holds one production file and one test file, and neither mentions `io.smallrye.graphql.api`.",
      "At the head revision `ValueFormatter` imports `CustomFloatScalar`, `CustomIntScalar` and `CustomStringScalar`, and branches on all three when formatting a value.",
      "Those three types are declared under `server/api/src/main/java/io/smallrye/graphql/api/` — a different Maven module from the client implementation that now reaches for them."
    ]
  },
  {
    id: "spring-ai-session-33",
    kind: "docs",
    kindLabel: "Documented rules",
    repo: "spring-ai-community/spring-ai-session",
    pr: "#33",
    prTitle: "Add runtime branch isolation to SessionMemoryAdvisor",
    prState: "Open",
    href: "https://github.com/spring-ai-community/spring-ai-session/pull/33",
    lede: "Nineteen sentences from this repository's own docs folder became checkable rules on this pull request. All nineteen held. Six of them are below, with the sentence each one came from.",
    headline: "2 components, 2 relationships, no structural anomalies",
    svg: "/examples/spring-ai-session-33.svg",
    panzoom: { focus: { x: 0.5, y: 0.79 }, desktopScale: 1, mobileScale: 1 },
    viewport: { desktopHeight: "34rem", mobileHeight: "21rem" },
    revisions: {
      baseLabel: "base",
      base: "b283ba5",
      headLabel: "head",
      head: "0e70aa2",
      compare:
        "https://github.com/spring-ai-community/spring-ai-session/compare/b283ba585395a6b9717f77b2487b68beac0773de...AdepuSriCharan:spring-ai-session:0e70aa2821e965a12139841e43527a9de9a0c422"
    },
    outputs: [],
    rules: [
      {
        doc: "docs/session-management/multi-agent.md",
        quote:
          "To apply branch isolation automatically inside `SessionMemoryAdvisor`, configure the `eventFilter` on the builder:",
        statement: "SessionMemoryAdvisor depends on EventFilter",
        verdict: "HOLDS",
        found: "SessionMemoryAdvisor.java imports EventFilter and holds one as a field"
      },
      {
        doc: "docs/session-management/cross-session-recall.md",
        quote: "The term count is capped at 20 per call (`CrossSessionRecallTools.MAX_QUERY_TERMS`).",
        statement: "CrossSessionRecallTools declares `MAX_QUERY_TERMS` as a field",
        verdict: "HOLDS",
        found: "CrossSessionRecallTools.java line 75, `static final int MAX_QUERY_TERMS = 20`"
      },
      {
        doc: "docs/session-management/compaction.md",
        quote: "All four strategies share a common safety rule enforced by `CompactionUtils.snapToTurnStart`:",
        statement: "CompactionUtils declares `snapToTurnStart` as a method",
        verdict: "HOLDS",
        found: "CompactionUtils.java line 99"
      },
      {
        doc: "docs/session-management/recall-storage.md",
        quote: "Events dropped from the active window are flagged `SessionEvent.isArchived()` and kept in the log.",
        statement: "SessionEvent declares `isArchived` as a method",
        verdict: "HOLDS",
        found: "SessionEvent.java line 153"
      },
      {
        doc: "docs/session-management/recall-storage.md",
        quote:
          "Page size defaults to `EventFilter.DEFAULT_PAGE_SIZE` (10) and is configurable via the builder (`SessionEventTools.builder(sessionService).pageSize(20).build()`).",
        statement:
          "EventFilter declares `DEFAULT_PAGE_SIZE` as a field, and SessionEventTools declares `builder` as a method",
        verdict: "HOLDS",
        found: "EventFilter.java line 133 (`= 10`); SessionEventTools.java line 87"
      },
      {
        doc: "docs/session-management/compaction.md",
        quote:
          "This ensures `tokensEstimatedSaved` in `CompactionResult` accurately reflects the full cost of removed events, including tool-heavy turns.",
        statement: "CompactionResult declares `tokensEstimatedSaved` as a field",
        verdict: "HOLDS",
        found: "CompactionResult.java line 31, a component of the record"
      }
    ],
    quietNote:
      "Nineteen rules, nineteen held, nothing raised. That is the ordinary result, and a page that only showed you the other kind would be lying about how often this fires.",
    audit: [
      "Every sentence above appears verbatim in the file it is attributed to, at the head revision, once whitespace from the Markdown line wrapping is normalised.",
      "Every declaration each rule asserts was read by hand in the source at the head revision; the file and line are printed beside it.",
      "Every quote is prose from the documentation, not a code sample lifted out of a fenced block.",
      "The base revision is the merge base of the pull request, so the comparison is the branch's own work and nothing else."
    ]
  }
];

/**
 * The sample this page was drawn from. Stated because four hand-picked examples say nothing
 * about how often any of this fires, and the honest answer is: most of the time, nothing.
 */
export const prExampleSample = {
  pullRequests: 79,
  repositories: 27,
  noFinding: 45
};
