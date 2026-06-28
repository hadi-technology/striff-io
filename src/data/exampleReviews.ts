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
        title: "Test class with high efferent coupling",
        body: "`ECDSAPublicKeyTest` is a new test with efferent coupling of 10. Tests this coupled to production internals tend to break with every refactor."
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
        { severity: "warn", severityLabel: "Major", title: "Use ceiling conversion for byte length", body: "Bit-to-byte conversion should use ceiling division, not truncation, to handle partial bytes." },
        { severity: "warn", severityLabel: "Major", title: "Defaulting to 32 bytes breaks non-P-256 keys", body: "Hardcoding 32 bytes works for P-256 but silently corrupts ES384 and ES512 serialization." },
        { severity: "warn", severityLabel: "Major", title: "Wrong algorithm in ES384/ES512 tests", body: "Test expected lengths and algorithm names don't match the curve being tested." }
      ],
      verdict: "CodeRabbit caught real implementation bugs — the test file won't compile as written, the math is wrong for non-P-256 keys, and the test fixtures contradict the algorithms they're testing.",
      missed: "Striff caught what happens after merge: a 5-package cycle in the crypto layer, and a quiet 5-point WMC growth on a class 220 other components depend on."
    }
  },
  {
    id: "mediatr",
    language: "C#",
    accent: "blue",
    repo: "jbogard/MediatR",
    pr: "#1157",
    prTitle: "Fix: cryptic \"No constructor\" error when ILoggerFactory not registered",
    href: "https://github.com/LuckyPennySoftware/MediatR/pull/1157",
    summary: "3 findings · 5 components · MEDIUM risk",
    headline: "Two missing generic parameters. One new cross-package dependency.",
    body: "MediatR is the most widely-used CQRS library in .NET. This PR touches its DI wiring — exactly the kind of change where one missing generic parameter quietly breaks every consumer. Copilot caught the implementation bugs. Striff caught what the package diagram now looks like: Registration imports Licensing for the first time.",
    svg: "/examples/mediatr.svg",
    panzoom: {
      desktop: { scale: 1.2, x: -40, y: -20 },
      mobile: { scale: 1.0, x: -20, y: -10 }
    },
    viewport: {
      desktopHeight: "28rem",
      mobileHeight: "18rem"
    },
    metrics: [
      "5 components in the structural diff",
      "3 findings including 1 boundary crossing",
      "Copilot posted 7 inline review comments"
    ],
    checkHeader: "Copilot caught the missing parameters and the dead code. Striff caught what the package diagram now looks like.",
    checks: [
      {
        level: "danger",
        title: "New cross-package dependency: Registration → Licensing",
        body: "`MediatR.Registration.ServiceRegistrar` now depends on `MediatR.Licensing.LicenseAccessor` and `LicenseValidator`. The Registration package previously had no edges into Licensing — should registration logic know about licensing?"
      },
      {
        level: "warn",
        title: "Cross-package licensing dependency",
        body: "The fix wires `ServiceRegistrar` directly to licensing types, mixing registration concerns with license validation. Both packages still work, but the boundary between them just got softer."
      }
    ],
    highlights: [
      "Review whether Registration should import Licensing directly, or if licensing validation should be injected via interface.",
      "Consider whether the licensing check belongs in the DI registration path at all — this couples two separate concerns.",
      "The fix works, but it creates a structural dependency that will outlast the bug it fixes."
    ],
    aiTool: {
      name: "Copilot",
      findings: [
        { severity: "danger", severityLabel: "Bug", title: "Missing type parameter in TryAddSingleton<LicenseAccessor>", body: "Registers nothing because the generic parameter is omitted. Will not register `LicenseAccessor` in the DI container correctly." },
        { severity: "danger", severityLabel: "Bug", title: "Missing type parameter in TryAddSingleton<LicenseValidator>", body: "Same bug, second location. `LicenseValidator` won't be registered correctly either." },
        { severity: "warn", severityLabel: "Logic", title: "Exception message implies ordering that isn't required", body: "Says \"before AddMediatR()\" but registration order doesn't actually matter as long as ILoggerFactory is registered before resolution." },
        { severity: "warn", severityLabel: "Gap", title: "No test for the new exception path", body: "Adding a focused test that omits logging and asserts the thrown message would prevent regressions." },
        { severity: "warn", severityLabel: "Dead code", title: "Unreachable fallback branch", body: "`MediatRServiceConfiguration` is always registered just above, so the `?? new LicenseAccessor(...)` branch is unreachable." },
        { severity: "warn", severityLabel: "Inconsistency", title: "PR description and implementation diverge", body: "The described simplification was not applied to the second method." },
        { severity: "danger", severityLabel: "Bug", title: "Bare DI registrations will hit the same cryptic error", body: "`LicenseAccessor` and `LicenseValidator` registered without factory lambdas will fail with exactly the bug this PR is fixing." }
      ],
      verdict: "Copilot found seven implementation issues — two missing generic parameters that silently break DI registration, dead code, and a misleading exception message.",
      missed: "Striff found what the package diagram now looks like: Registration imports Licensing for the first time. Both reviews matter on a PR like this."
    }
  },
  {
    id: "arcadedb",
    language: "Java",
    accent: "amber",
    repo: "ArcadeData/arcadedb",
    pr: "#4572",
    prTitle: "fix(#4550): guard RemoteHttpComponent.getLeaderAddress against null",
    href: "https://github.com/ArcadeData/arcadedb/pull/4572",
    summary: "4 findings · 6 components · MEDIUM risk",
    headline: "Bug fix scope: 3 lines. Architectural scope: 8 hops.",
    body: "A small null-guard fix drags in a large architectural cost. Gemini caught the next null-related crash. Striff caught the 8-hop dependency cycle the test scaffolding introduced — a structural debt that survives the bug fix and stays in the codebase.",
    svg: "/examples/arcadedb.svg",
    panzoom: {
      desktop: { scale: 1.3, x: -80, y: -40 },
      mobile: { scale: 1.1, x: -40, y: -20 }
    },
    viewport: {
      desktopHeight: "30rem",
      mobileHeight: "20rem"
    },
    metrics: [
      "6 components in the structural diff",
      "4 findings including 2 HIGH severity",
      "8-hop dependency cycle spanning gremlin and remote packages"
    ],
    checkHeader: "Gemini caught the next null-related crash. Striff caught the 8-hop cycle the test scaffolding introduced.",
    checks: [
      {
        level: "danger",
        title: "New 8-hop package cycle",
        body: "Cycle: `gremlin.service` → `remote` → `RemoteHttpComponentTest` → `RemoteDatabaseTest` → `gremlin` → `ArcadeGraphRemoteTraversalTest` → `ArcadeGraphFactory` → `RemoteServerTest` → `gremlin.service`. The fix was three lines. The cycle spans eight types across two packages."
      },
      {
        level: "danger",
        title: "10 dependents on the modified component",
        body: "`RemoteHttpComponent` has afferent coupling of 10. The PR's null-guard changes its return contract from \"always an address\" to \"address or null\" — every dependent now needs to handle null, even if the compiler doesn't force them to."
      }
    ],
    highlights: [
      "The 8-hop cycle is structural debt — it will survive the bug fix and stay in the codebase.",
      "Review whether the test scaffolding can be decoupled from the gremlin service package.",
      "Check that all 10 dependents of RemoteHttpComponent handle the new null return path."
    ],
    aiTool: {
      name: "Gemini",
      findings: [
        { severity: "warn", severityLabel: "Medium", title: "Empty remoteAddresses array can throw IllegalArgumentException", body: "If both `leaderAddress` is null and there are no replica addresses, the empty array passed to `Cluster.Builder.addContactPoints` will throw." }
      ],
      verdict: "Gemini caught the next null-related crash — the empty array edge case that the null-guard doesn't cover.",
      missed: "Striff caught the 8-hop dependency cycle the test scaffolding introduced — a structural debt that survives the bug fix."
    }
  },
  {
    id: "uikit",
    language: "TypeScript",
    accent: "emerald",
    repo: "acronis/uikit",
    pr: "#452",
    prTitle: "feat(chart): add Chart component (ported from ui-legacy)",
    href: "https://github.com/acronis/uikit/pull/452",
    summary: "2 findings · 4 components · HIGH risk",
    headline: "Migration plan: in progress. PR: quietly reversing direction.",
    body: "A component port from ui-legacy to ui-react looks clean in the file diff. Copilot saw an XSS injection path and three smaller correctness issues. Striff saw the migration plan moving in the wrong direction — legacy code reaching into the new package before it's officially released.",
    svg: "/examples/uikit.svg",
    panzoom: {
      desktop: { scale: 1.25, x: -50, y: -25 },
      mobile: { scale: 1.05, x: -25, y: -12 }
    },
    viewport: {
      desktopHeight: "26rem",
      mobileHeight: "16rem"
    },
    metrics: [
      "4 components in the structural diff",
      "2 findings including 1 boundary crossing",
      "Copilot posted 5 inline review comments"
    ],
    checkHeader: "Copilot saw an XSS injection path and a key collision. Striff saw the migration plan moving in the wrong direction.",
    checks: [
      {
        level: "danger",
        title: "Legacy reaching into new code",
        body: "`ui-legacy.src.components.ui` now imports from `ui-react.src.components.ui.chart`. The migration plan documents this component as \"not yet shipped\" — but legacy code reaching into the new package makes the migration harder to finish."
      },
      {
        level: "warn",
        title: "Premature cross-package import",
        body: "The new chart component isn't released yet, but `ui-legacy` is already importing it. Worth confirming this is intentional and not a quiet step backward in the migration."
      }
    ],
    highlights: [
      "Remove the import from `ui-legacy` to `ui-react` chart until the component is officially released.",
      "Replace with a placeholder or feature-flagged stub to keep the migration plan on track.",
      "Review whether the XSS risk in `ChartStyle` needs to be fixed before the port ships."
    ],
    aiTool: {
      name: "Copilot",
      findings: [
        { severity: "danger", severityLabel: "XSS", title: "dangerouslySetInnerHTML injection risk", body: "`ChartStyle` uses `dangerouslySetInnerHTML` to inject CSS from public props. Untrusted input could inject `</style>` and execute scripts. React can safely render CSS as a text node instead." },
        { severity: "warn", severityLabel: "Bug", title: "formatter receives wrong argument", body: "Typed to receive the full tooltip `payload` array, but the implementation passes `item.payload` (a single datum). Breaks consumers that need the full series list." },
        { severity: "warn", severityLabel: "Bug", title: "{item.value && ...} hides zero values", body: "0 is falsy and gets filtered out of tooltips. Valid zero data points disappear." },
        { severity: "warn", severityLabel: "Bug", title: "id prop not forwarded to underlying <div>", body: "Breaks `aria-labelledby` and anchor linking despite extending `React.ComponentProps<'div'>`." },
        { severity: "warn", severityLabel: "Bug", title: "React key collisions", body: "`key={item.value}` isn't guaranteed unique — duplicated series names cause incorrect updates." }
      ],
      verdict: "Copilot found an XSS injection path, a formatter bug, falsy-zero filtering, and two other correctness issues in the new component.",
      missed: "Striff found the migration plan moving in the wrong direction — legacy code reaching into the new package before it's shipped."
    }
  },
  {
    id: "mastra",
    language: "TypeScript",
    accent: "rose",
    repo: "mastra-ai/mastra",
    pr: "#16658",
    prTitle: "Auth0 session options integration",
    href: "https://github.com/mastra-ai/mastra/pull/16658",
    summary: "3 findings · 8 components · 5 relationships · HIGH risk",
    headline: "Type-safe. Just not architecturally bounded.",
    body: "This PR integrates Auth0 session management. CodeRabbit found a process-local OAuth state store that won't scale and a cookie regex bug. Striff found the example agent reaching directly into the Auth0 package internals — a boundary violation that couples example code to a specific auth implementation.",
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
      "3 findings including 1 HIGH severity boundary crossing"
    ],
    checkHeader: "CodeRabbit found the OAuth state store bug and the cookie regex. Striff found the example code reaching into Auth0 internals.",
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
        body: "The PR introduces a dependency on `StatePayload` from the auth0 package. Moving it to shared types would avoid the boundary crossing."
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
        { severity: "danger", severityLabel: "Major", title: "Process-local OAuth state store won't scale", body: "This map only works when `/authorize` and `/callback` hit the same process. In load-balanced or serverless deployments, valid logins will intermittently fail with invalid/expired state." },
        { severity: "warn", severityLabel: "Major", title: "Cookie regex matching bug", body: "The current regex will also match prefixed names like `xauth0_session=...`, and custom cookie names containing regex metacharacters will parse incorrectly." },
        { severity: "warn", severityLabel: "Minor", title: "AUTH0_REDIRECT_URI not cleared in test suite", body: "The constructor reads this env var, but test hooks never reset it. If another test file sets it, the SSO cases become order-dependent." }
      ],
      verdict: "CodeRabbit found a production scalability bug (process-local state store), a cookie parsing bug, and a test isolation issue.",
      missed: "Striff found the example code reaching into Auth0 package internals — boundaries that aren't enforced by the compiler or caught by line-level review."
    }
  }
];
