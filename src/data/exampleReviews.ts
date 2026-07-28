export type ExampleCheckLevel = "danger" | "warn" | "note";

export type AiToolFinding = {
  severity: "danger" | "warn";
  severityLabel: string;
  title: string;
  body: string;
};

export type AiToolData = {
  name: string;
  findings: AiToolFinding[];
  verdict: string;
  missed: string;
};

/** The one finding per PR that makes an architecture-minded reviewer stop scrolling. */
export type HeroFinding = {
  stat: string;
  statLabel: string;
  title: string;
  body: string;
};

/** Stat tiles rendered as the head-to-head scoreboard above the findings lanes. */
export type ScoreboardTile = {
  value: string;
  label: string;
  tone: "striff" | "other" | "overlap";
};

export type ExampleReview = {
  id: string;
  language: string;
  accent: "blue" | "emerald" | "amber" | "rose";
  repo: string;
  pr: string;
  prTitle: string;
  href: string;
  summary: string;
  headline: string;
  body: string;
  svg: string;
  panzoom: {
    desktop: {
      scale: number;
      x: number;
      y: number;
    };
    mobile: {
      scale: number;
      x: number;
      y: number;
    };
  };
  viewport: {
    desktopHeight: string;
    mobileHeight: string;
  };
  metrics: string[];
  checkHeader: string;
  scoreboard: ScoreboardTile[];
  hero: HeroFinding;
  checks: Array<{
    level: ExampleCheckLevel;
    title: string;
    body: string;
  }>;
  highlights: string[];
  aiTool?: AiToolData;
};

export const exampleReviews: ExampleReview[] = [
  {
    id: "pinot",
    language: "Java",
    accent: "rose",
    repo: "apache/pinot",
    pr: "#19073",
    prTitle: "Generate Avro schemas from Pinot logical data types",
    href: "https://github.com/apache/pinot/pull/19073",
    summary: "7 findings \u00b7 9 components \u00b7 HIGH risk",
    headline: "The core engine took its first dependency on a plugin.",
    body: "This PR teaches Pinot to generate Avro schemas from logical data types. Copilot reviewed the code. Striff caught the direction of the change: org.apache.pinot.core.util now depends on org.apache.pinot.plugin.inputformat.avro, the first edge ever from the core into the Avro plugin package. Plugin boundaries exist so the core never knows about plugins; this PR quietly reversed that.",
    svg: "/examples/pinot.svg",
    panzoom: {
      desktop: { scale: 3.2, x: -1622, y: -253 },
      mobile: { scale: 3.4, x: -794, y: -79 }
    },
    viewport: {
      desktopHeight: "30rem",
      mobileHeight: "19rem"
    },
    metrics: [
      "9 components in the structural diff",
      "7 findings including 2 HIGH severity",
      "First core-to-plugin edge in this direction"
    ],
    checkHeader: "Copilot reviewed the implementation. Striff flagged the inverted plugin boundary before merge.",
    scoreboard: [
      { value: "7", label: "findings posted on the live PR", tone: "striff" },
      { value: "0", label: "prior edges from `core.util` into the Avro plugin", tone: "other" },
      { value: "24", label: "dependents on `AvroUtils`, the contract this PR touches", tone: "overlap" }
    ],
    hero: {
      stat: "0",
      statLabel: "prior dependencies from Pinot's core into the Avro plugin package",
      title: "New directional boundary crossing",
      body: "`SegmentProcessorAvroUtils` in `core.util` now calls directly into `plugin.inputformat.avro`. Plugin boundaries exist so the core never depends on a plugin; this edge reverses that direction for the first time, and skips a layer on the way."
    },
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `org.apache.pinot.core.util` to `org.apache.pinot.plugin.inputformat.avro`, with no prior edge in this direction."
      },
      {
        level: "danger",
        title: "Stable contract modified: 24 dependents",
        body: "`AvroUtils` has afferent coupling of 24. Changes to this component impact at least 24 dependents in the parsed scope."
      },
      {
        level: "warn",
        title: "Layer skip on the new edge",
        body: "The new core-to-plugin edge jumps from `core.util` (layer 1) to `plugin.inputformat.avro` (layer 3), skipping a layer."
      }
    ],
    highlights: [
      "Invert the dependency: move the shared Avro schema logic into a core-owned module, or extract an interface the plugin implements.",
      "Watch `SegmentProcessorAvroUtils` (efferent coupling 36 to 44): it is becoming the bridge between core and plugin code."
    ],
    aiTool: {
      name: "Copilot",
      findings: [
        { severity: "warn", severityLabel: "Perf", title: "Unnecessary per-element conversion for BigDecimal columns", body: "`convertValue()` takes the per-element path for all BYTES element schemas, forcing a list allocation for big-decimal multi-value columns that the registered conversion could pass through zero-copy." }
      ],
      verdict: "Copilot's review focused on the implementation: a zero-copy optimization for BigDecimal multi-value columns.",
      missed: "Striff caught the direction of the change: the first dependency ever from Pinot's core into the Avro plugin package, plus a 24-dependent contract quietly modified."
    }
  },
  {
    id: "celery",
    language: "Python",
    accent: "amber",
    repo: "celery/celery",
    pr: "#10418",
    prTitle: "Preserve absolute event timestamps in Gossip",
    href: "https://github.com/celery/celery/pull/10418",
    summary: "4 findings · 7 components · HIGH risk",
    headline: "A timestamp fix that wired the smoke suite four layers deep into Celery's core.",
    body: "This PR stops Gossip from losing absolute event timestamps. The fix is fine. The new smoke tests are the story: t.smoke.tests now imports celery.utils and celery.worker.consumer directly, two dependency directions that never existed before, one of them jumping from the test layer straight to a utility layer four levels down.",
    svg: "/examples/celery.svg",
    panzoom: {
      desktop: { scale: 1.89, x: -320, y: -444 },
      mobile: { scale: 2.13, x: -185, y: -152 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "17rem"
    },
    metrics: [
      "7 components in the structural diff",
      "4 findings including 2 HIGH severity",
      "2 new boundary crossings from the smoke suite"
    ],
    checkHeader: "No AI reviewer was on this PR. Striff flagged both new boundary crossings and the 3-layer skip before merge.",
    scoreboard: [
      { value: "4", label: "findings posted on the live PR", tone: "striff" },
      { value: "2", label: "brand-new dependency directions from the smoke suite", tone: "other" },
      { value: "3", label: "layers skipped by the deepest new edge", tone: "overlap" }
    ],
    hero: {
      stat: "3",
      statLabel: "layers skipped by the new edge from the smoke suite into `celery.utils`",
      title: "New directional boundary crossing",
      body: "`t.smoke.tests` now depends on `celery.utils` and `celery.worker.consumer` directly, with no prior edge in either direction. Smoke suites coupled to internals break every time the internals move."
    },
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `t.smoke.tests` to `celery.utils`, with no prior edge in this direction."
      },
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `t.smoke.tests` to `celery.worker.consumer`, with no prior edge in this direction."
      },
      {
        level: "warn",
        title: "Layer skip: 3 layers",
        body: "The new edge from `t.smoke.tests` (layer 0) to `celery.utils` (layer 4) skips 3 layers of the codebase's layering."
      }
    ],
    highlights: [
      "Route smoke-test assertions through Celery's public testing helpers instead of importing `celery.utils` internals.",
      "If smoke tests must reach internals, isolate the imports in one fixture module so the coupling stays contained."
    ]
  },
  {
    id: "typeorm",
    language: "TypeScript",
    accent: "emerald",
    repo: "typeorm/typeorm",
    pr: "#12647",
    prTitle: "fix: remove require() calls that break bundlers",
    href: "https://github.com/typeorm/typeorm/pull/12647",
    summary: "4 findings · 7 components · HIGH risk",
    headline: "A bundler fix that rewired two mobile drivers into the platform layer.",
    body: "This PR removes require() calls so bundlers can statically analyze TypeORM. Qodo caught real code-level issues. Striff caught the structural side effect: the React Native and Expo drivers now depend directly on src.platform, two boundary crossings with no prior edge in that direction, each skipping a layer.",
    svg: "/examples/typeorm.svg",
    panzoom: {
      desktop: { scale: 2.4, x: -205, y: -366 },
      mobile: { scale: 2.7, x: -127, y: -112 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "16rem"
    },
    metrics: [
      "7 components in the structural diff",
      "4 findings including 2 HIGH severity",
      "2 new boundary crossings into src.platform"
    ],
    checkHeader: "Qodo caught the implementation issues. Striff found the architectural risk no diff-based tool could see.",
    scoreboard: [
      { value: "4", label: "findings posted on the live PR", tone: "striff" },
      { value: "2", label: "new driver-to-platform boundary crossings", tone: "other" },
      { value: "0", label: "overlap with Qodo's 7 review comments", tone: "overlap" }
    ],
    hero: {
      stat: "2",
      statLabel: "brand-new dependency directions introduced by this PR",
      title: "Drivers rewired into `src.platform`",
      body: "`ReactNativeDriver` and `ExpoDriver` now load their modules through `PlatformTools`. Convenient, but it points the driver layer at the platform layer for the first time, and both new edges skip an intermediate layer on the way."
    },
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `src.driver.react-native` to `src.platform`, with no prior edge in this direction."
      },
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `src.driver.expo` to `src.platform`, with no prior edge in this direction."
      },
      {
        level: "warn",
        title: "Layer skip on both new edges",
        body: "Both edges jump from the driver layer (layer 1) straight to `src.platform` (layer 3), bypassing the intermediate layer."
      }
    ],
    highlights: [
      "Decide whether drivers should call `PlatformTools.load` directly, or route module loading through the existing connector path.",
      "If the new direction is intended, encode it in the layering rules so the next PR is checked against it.",
      "Fix the dynamic require in `PlatformTools.load` that Qodo flagged before it ships in bundled apps."
    ],
    aiTool: {
      name: "Qodo",
      findings: [
        { severity: "danger", severityLabel: "Bug", title: "Dynamic require blocks bundlers", body: "`PlatformTools.load` calls `require(name)` with a runtime variable, which bundlers cannot statically analyze. Any driver using it can fail in bundled apps." },
        { severity: "warn", severityLabel: "Rule", title: "ExpoDriver masks load errors", body: "A bare catch collapses every failure while loading `expo-sqlite` into DriverPackageNotInstalledError, discarding the original cause." },
        { severity: "warn", severityLabel: "Rule", title: "Browser PlatformTools.load() uses require", body: "The browser template now calls `require(name)`, inconsistent with the rest of the browser-only stubs and likely to fail in browser builds." },
        { severity: "warn", severityLabel: "Bug", title: "Misleading Expo error hint", body: "Users with a custom driver override still get told to upgrade to Expo SDK v52+ when `openDatabaseAsync` is missing." },
        { severity: "warn", severityLabel: "Bug", title: "Expo tests removed", body: "The PR deletes the unit tests that exercised `ExpoDriver.loadDependencies`, leaving the changed loading logic without regression coverage." }
      ],
      verdict: "Qodo caught real implementation issues: a dynamic require that defeats bundlers, masked load errors, a misleading error hint, and deleted tests.",
      missed: "Striff caught the structural side effect: two brand-new boundary crossings from the driver layer into src.platform, each skipping a layer."
    }
  },
  {
    id: "efcore",
    language: "C#",
    accent: "blue",
    repo: "dotnet/efcore",
    pr: "#38676",
    prTitle: "Handle out-of-order split include rows during concurrent inserts",
    href: "https://github.com/dotnet/efcore/pull/38676",
    summary: "8 findings \u00b7 11 components \u00b7 HIGH risk",
    headline: "A concurrency fix that pointed the query internals back at the root namespace.",
    body: "This PR fixes split-include queries dropping child rows under concurrent inserts. Copilot reviewed the code. Striff caught the structure: SplitQueryResultCoordinator in Query.Internal now depends on the root Microsoft.EntityFrameworkCore namespace, where the PR's new DbQueryConcurrencyException lives. That direction never existed before, it skips 3 layers, and it leaves the query namespaces one step from a full cycle.",
    svg: "/examples/efcore.svg",
    panzoom: {
      desktop: { scale: 3.2, x: -1338, y: -2 },
      mobile: { scale: 3.4, x: -657, y: 42 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "17rem"
    },
    metrics: [
      "11 components in the structural diff",
      "8 findings including 1 HIGH severity",
      "1 near-cycle across the query namespaces"
    ],
    checkHeader: "Copilot caught the implementation issues. Striff found the architectural risk no diff-based tool could see.",
    scoreboard: [
      { value: "8", label: "findings posted on the live PR", tone: "striff" },
      { value: "3", label: "layers skipped by the new upward edge", tone: "other" },
      { value: "0", label: "overlap with Copilot's review comments", tone: "overlap" }
    ],
    hero: {
      stat: "3",
      statLabel: "layers skipped by the new edge from `Query.Internal` to the root namespace",
      title: "New directional boundary crossing",
      body: "`SplitQueryResultCoordinator` now depends on the root `Microsoft.EntityFrameworkCore` namespace, with no prior edge in this direction. Combined with the existing path from the root through `Query` into `Query.Internal`, the namespaces are one step from a full cycle."
    },
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `Microsoft.EntityFrameworkCore.Query.Internal` to `Microsoft.EntityFrameworkCore`, with no prior edge in this direction."
      },
      {
        level: "warn",
        title: "Layer skip: 3 layers",
        body: "The new edge jumps from `Query.Internal` (layer 8) straight to the root namespace (layer 12), skipping 3 layers."
      },
      {
        level: "note",
        title: "Cyclic dependency seed",
        body: "The new edge, combined with the existing path from the root through `Query` to `Query.Internal`, almost creates a namespace cycle."
      }
    ],
    highlights: [
      "Consider declaring `DbQueryConcurrencyException` beside the internals that throw it, or routing it through the existing exception surface.",
      "If internals must reference the root namespace, document the allowed direction so the cycle never closes."
    ],
    aiTool: {
      name: "Copilot",
      findings: [
        { severity: "danger", severityLabel: "Bug", title: "Hard-coded IntTypeMapping on COUNT(*)", body: "`CreateChildCountAccessor` bypasses provider-specific type mapping, which can produce incorrect SQL typing or runtime cast failures on non-SQL Server providers." },
        { severity: "warn", severityLabel: "Bug", title: "Bare catch swallows translation bugs", body: "All exceptions fall back silently to streaming correlation, which can hide real failures and reintroduce the silent child-loss behavior under concurrency." },
        { severity: "warn", severityLabel: "Bug", title: "Static mutable test state", body: "The regression tests coordinate through process-wide statics; xUnit's parallel execution can make the InlineData cases interfere and turn flaky." },
        { severity: "warn", severityLabel: "Bug", title: "Inconsistent orphan verification", body: "`VerifyNoOrphanedChildRows()` runs for `SplitQueryingEnumerable` but not `GroupBySplitQueryingEnumerable`, leaving the new exception behavior inconsistent across split-query enumerables." }
      ],
      verdict: "Copilot caught real implementation issues: a hard-coded type mapping, a bare catch, flaky static test state, and inconsistent orphan verification.",
      missed: "Striff caught the structural side effect: a brand-new upward edge from Query.Internal to the root namespace, 3 layers up, one step from a namespace cycle."
    }
  }
];
