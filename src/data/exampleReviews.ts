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
    id: "orchardcore",
    language: "C#",
    accent: "blue",
    repo: "OrchardCMS/OrchardCore",
    pr: "#18887",
    prTitle: "Refactor PlacementInfo API and improve placement handling",
    href: "https://github.com/OrchardCMS/OrchardCore/pull/18887",
    summary: "5 findings · 10 components · 15 relationships · MEDIUM risk",
    headline: "God-class remediation, quantified: cut EC by 1 and WMC by ~10 with a named replacement class.",
    body: "This PR adds a new GroupingMetadata struct and wires it into PlacementInfo. Striff traces the resulting coupling growth — EC +9, WMC +50 on PlacementInfo — and prescribes a specific fix: extract a GroupingMetadataHandler and delegate to it.",
    svg: "/examples/orchardcore.svg",
    panzoom: {
      desktop: { scale: 1.05, x: -60, y: -30 },
      mobile: { scale: 0.85, x: -30, y: -15 }
    },
    viewport: {
      desktopHeight: "34rem",
      mobileHeight: "22rem"
    },
    metrics: [
      "10 components in the structural diff",
      "15 relationships across the DisplayManagement package",
      "5 findings including a new package cycle"
    ],
    checkHeader: "Striff doesn't just flag the god-class risk — it quantifies the fix: reduce EC by at least 1 and WMC by ~10 with a named extraction target.",
    checks: [
      {
        level: "danger",
        title: "New package cycle in DisplayManagement",
        body: "Cycle: `Zones` → `Descriptors.ShapeTablePlacementProvider` → `DisplayManagement` → `Descriptors` → `Shapes.ShapeDebugView` → `Shapes` → `Zones`. The cycle spans 6 components this PR touches."
      },
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "New dependency from `OrchardCore.Tests.DisplayManagement.Decriptors` to `OrchardCore.DisplayManagement.Zones` — no prior edge in this direction, and it skips 4 layers."
      },
      {
        level: "warn",
        title: "PlacementInfo complexity surge",
        body: "`PlacementInfo` EC jumped from 6 to 15 and WMC from 28 to 78. Moving `GroupingMetadata` parsing into a dedicated `GroupingMetadataHandler` is projected to cut EC by at least 1 and WMC by ~10."
      },
      {
        level: "warn",
        title: "Complexity growth on GroupingMetadata",
        body: "`GroupingMetadata` WMC grew by 27 (from 0 to 27) as a new component — consider extracting cohesive method groups."
      }
    ],
    highlights: [
      "Extract a `GroupingMetadataHandler` and have `PlacementInfo` delegate to it instead of aggregating `GroupingMetadata` directly.",
      "Break the 6-component package cycle in `DisplayManagement` before it calcifies.",
      "Embed `GroupingMetadata` as a private field constructed by `PlacementLocationBuilder`, making ownership explicit."
    ]
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
  }
];
