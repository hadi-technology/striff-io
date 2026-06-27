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
    id: "jans",
    language: "Java",
    accent: "rose",
    repo: "JanssenProject/jans",
    pr: "#14256",
    prTitle: "fix: P-256 signature with X or Y curve < 32 bytes (RFC 7518)",
    href: "https://github.com/JanssenProject/jans/pull/14256",
    summary: "7 findings · 6 components · 9 relationships · HIGH risk",
    headline: "Core crypto class with 220 dependents modified — and a new package cycle.",
    body: "This PR fixes a crypto bug, but Striff reveals the blast radius: SignatureAlgorithm (220 dependents) and Base64Util (44 dependents) both gained complexity and coupling, while the change introduces a circular dependency across 5 crypto packages.",
    svg: "/examples/jans.svg",
    panzoom: {
      desktop: { scale: 1.3, x: -60, y: -30 },
      mobile: { scale: 1.1, x: -30, y: -15 }
    },
    viewport: {
      desktopHeight: "32rem",
      mobileHeight: "20rem"
    },
    metrics: [
      "6 components in the structural diff",
      "9 relationships across 5 crypto packages",
      "7 findings including 3 HIGH severity"
    ],
    checkHeader: "CodeRabbit caught the implementation bugs. Striff found the architectural risk no other tool could see.",
    checks: [
      {
        level: "danger",
        title: "New package cycle in crypto packages",
        body: "Dependency cycle: `crypto` → `crypto.signature` → `configuration` → `jwk` → `util` → `crypto`. Package cycles break modularity and make future refactoring risky."
      },
      {
        level: "danger",
        title: "Stable contract modified — 220 dependents",
        body: "`SignatureAlgorithm` has afferent coupling of 220. Any change to this class ripples across the entire auth server. WMC also grew by 5."
      },
      {
        level: "danger",
        title: "Stable contract modified — 44 dependents",
        body: "`Base64Util` has afferent coupling of 44. WMC grew from 17 to 22, making this utility harder to test and maintain."
      },
      {
        level: "warn",
        title: "Coupling spike on both core classes",
        body: "`SignatureAlgorithm` EC grew from 62 to 63. `Base64Util` EC grew from 8 to 9. Both are heading in the wrong direction."
      }
    ],
    highlights: [
      "Review whether the package cycle can be broken before merge — it will only get harder later.",
      "Assess whether 220 dependents on SignatureAlgorithm is acceptable, or if responsibilities should be split.",
      "Check that the WMC increase on Base64Util is justified, not accidental complexity."
    ],
    aiTool: {
      name: "CodeRabbit",
      findings: [
        { severity: "danger", severityLabel: "Critical", title: "Missing assertThrows import", body: "Test file will not compile — `assertThrows` is used but never imported." },
        { severity: "warn", severityLabel: "Major", title: "Use ceiling conversion for byte length", body: "Bit-to byte conversion should use ceiling division, not truncation, to handle partial bytes." },
        { severity: "warn", severityLabel: "Major", title: "Defaulting to 32 bytes breaks non-P-256 keys", body: "Hardcoding 32 bytes works for P-256 but silently corrupts ES384 and ES512 serialization." },
        { severity: "warn", severityLabel: "Major", title: "Wrong algorithm in ES384/ES512 tests", body: "Test expected lengths and algorithm names don't match the curve being tested." }
      ],
      verdict: "CodeRabbit caught real implementation bugs — missing imports, wrong math, broken tests.",
      missed: "But it didn't detect the package cycle, the 220-dependents blast radius, or the coupling spike."
    }
  },
  {
    id: "phoenix",
    language: "Java",
    accent: "amber",
    repo: "apache/phoenix",
    pr: "#2527",
    prTitle: "PHOENIX-7919: Support EXPLAIN FORMAT JSON",
    href: "https://github.com/apache/phoenix/pull/2527",
    summary: "5 findings · 11 components · 22 relationships · HIGH risk",
    headline: "A simple EXPLAIN feature creates a 40-node dependency cycle.",
    body: "Copilot caught style violations (line length). Striff found that this PR introduces a massive package-level cycle spanning 40 packages across the entire codebase — plus a new class with 16 outgoing dependencies on its first day.",
    svg: "/examples/phoenix.svg",
    panzoom: {
      desktop: { scale: 1.5, x: -120, y: -80 },
      mobile: { scale: 1.2, x: -60, y: -40 }
    },
    viewport: {
      desktopHeight: "34rem",
      mobileHeight: "22rem"
    },
    metrics: [
      "11 components in the structural diff",
      "22 relationships changed",
      "5 findings including 2 HIGH severity"
    ],
    checkHeader: "Copilot flagged line-length violations. Striff found a 40-node dependency cycle.",
    checks: [
      {
        level: "danger",
        title: "New package cycle — 40 packages involved",
        body: "Cycle: `mapreduce.index` → `compile.LimitCompiler` → `index` → `compile.ProjectionCompiler` → ... → `mapreduce.index`. This cycle spans nearly the entire codebase."
      },
      {
        level: "danger",
        title: "Stable contract modified — PhoenixStatement (83 dependents)",
        body: "`PhoenixStatement` has afferent coupling of 83. EC grew from 354 to 356 — changes here impact 83+ components."
      },
      {
        level: "warn",
        title: "New component with 16 outgoing dependencies",
        body: "`ExplainJsonRenderer` is a brand-new class with 16 outgoing dependencies. Consider extracting responsibilities before it becomes a coupling magnet."
      },
      {
        level: "warn",
        title: "Coupling spike on ExecutableExplainStatement",
        body: "EC grew from 45 to 48. The statement execution class is accumulating dependencies rapidly."
      }
    ],
    highlights: [
      "The 40-node cycle is the top priority — it will compound maintenance cost for years.",
      "Decide whether ExplainJsonRenderer's 16 dependencies are justified or should be split.",
      "PhoenixStatement at 356 EC and 83 AC is a structural hotspot — any change is high-risk."
    ],
    aiTool: {
      name: "Copilot",
      findings: [
        { severity: "warn", severityLabel: "Style", title: "Javadoc line exceeds 100 characters", body: "Multiple Javadoc lines exceed the Checkstyle LineLength limit of 100 characters." },
        { severity: "warn", severityLabel: "Style", title: "Import ordering violation", body: "Imports are not sorted according to the project's Checkstyle configuration." },
        { severity: "warn", severityLabel: "Style", title: "Missing @since tag on new public API", body: "New public methods in EXPLAIN FORMAT JSON should have `@since` Javadoc tags." }
      ],
      verdict: "Copilot caught style and documentation violations — useful for Checkstyle compliance.",
      missed: "But it completely missed the 40-node dependency cycle and the new component with 16 outgoing dependencies."
    }
  },
  {
    id: "workwell",
    language: "TypeScript",
    accent: "blue",
    repo: "Taleef7/workwell",
    pr: "#115",
    prTitle: "feat(replatform): Postgres ceiling adapter + critical fix",
    href: "https://github.com/Taleef7/workwell/pull/115",
    summary: "4 findings · 19 components · 14 relationships · MEDIUM risk",
    headline: "Postgres adapter crosses boundary into the stores layer — and two new stores arrive heavy.",
    body: "Codex found an implementation edge case (null handling). Striff found that the new Postgres adapter creates a directional boundary crossing from `stores.postgres` back into `stores`, and both new store classes arrive with high outgoing coupling.",
    svg: "/examples/workwell.svg",
    panzoom: {
      desktop: { scale: 1.3, x: -80, y: -40 },
      mobile: { scale: 1.1, x: -40, y: -20 }
    },
    viewport: {
      desktopHeight: "30rem",
      mobileHeight: "18rem"
    },
    metrics: [
      "19 components in the structural diff",
      "14 relationships across the stores layer",
      "4 findings including 1 HIGH severity"
    ],
    checkHeader: "Codex found a null-handling edge case. Striff found the architectural boundary violation.",
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "`backend-ts.src.stores.postgres` now depends on `backend-ts.src.stores` — no prior edge existed in this direction. The implementation layer is reaching back into the interface layer."
      },
      {
        level: "warn",
        title: "New component with 15 outgoing dependencies",
        body: "`PgRunStore` arrives with 15 outgoing dependencies and WMC of 11. Consider whether this coupling is necessary or responsibilities should be extracted."
      },
      {
        level: "warn",
        title: "New component with 12 outgoing dependencies",
        body: "`PgOutcomeStore` arrives with 12 outgoing dependencies. New classes with high EC tend to become coupling magnets."
      }
    ],
    highlights: [
      "Review whether the `postgres → stores` dependency direction is intentional or a layering mistake.",
      "Assess whether PgRunStore's 15 dependencies can be reduced by splitting responsibilities.",
      "Check that the store interfaces are not being leaked into the Postgres implementation."
    ],
    aiTool: {
      name: "Codex",
      findings: [
        { severity: "warn", severityLabel: "P2", title: "Return null for malformed run IDs", body: "The `handleRuns` adapter route should return null instead of throwing when it encounters a malformed run ID." }
      ],
      verdict: "Codex found a valid implementation edge case in the adapter route handling.",
      missed: "But it didn't see the boundary crossing from postgres to stores, or the two new stores arriving with 12-15 dependencies each."
    }
  },
  {
    id: "mastra",
    language: "TypeScript",
    accent: "emerald",
    repo: "mastra-ai/mastra",
    pr: "#16658",
    prTitle: "Auth0 session options integration",
    href: "https://github.com/mastra-ai/mastra/pull/16658",
    summary: "1 finding · 8 components · 5 relationships · HIGH risk",
    headline: "Example agent crosses into the Auth0 package — creating unintended tight coupling.",
    body: "This PR integrates Auth0 session management. Striff detected that the examples agent now depends directly on the auth0 package internals — a boundary violation that couples example code to a specific auth implementation.",
    svg: "/examples/mastra.svg",
    panzoom: {
      desktop: { scale: 1.2, x: -40, y: -20 },
      mobile: { scale: 1.0, x: -20, y: -10 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "16rem"
    },
    metrics: [
      "8 components in the structural diff",
      "5 relationships in the auth layer",
      "1 HIGH severity boundary crossing"
    ],
    checkHeader: "Striff found the architectural risk: example code tightly coupled to auth package internals.",
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "`examples.agent.src.mastra.auth` now depends on `auth.auth0.src` — no prior edge in this direction. Example code is reaching directly into the Auth0 package."
      },
      {
        level: "warn",
        title: "Session config increases coupling (EC +3, instability +0.13)",
        body: "The new `MastraAuthAuth0SessionOptions` interface aggregates into `MastraAuthAuth0Options`, increasing coupling and instability in the auth module."
      },
      {
        level: "note",
        title: "Encapsulate StatePayload in shared types",
        body: "The PR introduces a dependency on `StatePayload` from the auth0 package. Consider moving it to shared types to avoid the boundary crossing."
      }
    ],
    highlights: [
      "Move `StatePayload` to a shared types package to break the boundary crossing.",
      "Review whether the examples agent should depend on auth abstractions, not Auth0 specifics.",
      "Assess whether the instability increase (+0.13) is acceptable for the auth module."
    ],
    aiTool: {
      name: "CodeRabbit",
      findings: [
        { severity: "warn", severityLabel: "Major", title: "Session config type assertion needed", body: "The `MastraAuthAuth0SessionOptions` should use a type assertion or generic constraint rather than a loose cast." },
        { severity: "warn", severityLabel: "Minor", title: "Missing JSDoc on new auth0 options", body: "New configuration options should have JSDoc comments for IDE autocomplete." }
      ],
      verdict: "CodeRabbit found type safety and documentation issues in the new configuration.",
      missed: "But it didn't detect the boundary crossing from examples into the auth0 package, or the coupling increase."
    }
  },
  {
    id: "csharp",
    language: "C#",
    accent: "rose",
    repo: "AvaloniaUI/Avalonia",
    pr: "#21310",
    prTitle: "Improve composition hit testing performance with per-visual AABBs",
    href: "https://github.com/AvaloniaUI/Avalonia/pull/21310",
    summary: "Focused 7-component subdiagram · rendering-path review",
    headline: "Hit-testing logic thickens inside the rendering path and adjacent composition types.",
    body: "The full PR is larger, so this example uses a focused subdiagram around the hit-test tree and renderer-facing components to keep the architecture story readable.",
    svg: "/examples/csharp.svg",
    panzoom: {
      desktop: { scale: 1.14, x: -178, y: -18 },
      mobile: { scale: 1.0, x: -66, y: -10 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "16rem"
    },
    metrics: [
      "Focused 7-component subdiagram for the homepage",
      "Review centers on hit-test tree, renderer, and composition target",
      "9 highlighted components in the full review output"
    ],
    checkHeader: "The diagram narrows a bigger C# PR down to the renderer-facing cluster that actually matters for review.",
    checks: [
      {
        level: "danger",
        title: "`CompositionHitTestAabbTree` is the new center of gravity",
        body: "The review highlights the hit-test tree as the critical component in this change set, which is exactly where reviewers should start."
      },
      {
        level: "warn",
        title: "Renderer-path neighbors are pulled into the same cluster",
        body: "`CompositionContainerVisual`, `CompositionTarget`, and `CompositingRenderer` all become part of the same focused review surface."
      },
      {
        level: "note",
        title: "Good review question",
        body: "Does the new AABB-tree logic stay a contained performance layer, or is it starting to absorb responsibilities from the surrounding renderer path?"
      }
    ],
    highlights: [
      "Use the focused subdiagram instead of the full 14-component graph on the homepage.",
      "Start with `CompositionHitTestAabbTree`, then inspect how it touches the target and renderer types.",
      "Check whether comparer/candidate internals are staying private implementation details."
    ]
  }
];
