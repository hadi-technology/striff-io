export type ExampleCheckLevel = "danger" | "warn" | "note";

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
};

export const exampleReviews: ExampleReview[] = [
  {
    id: "java",
    language: "Java",
    accent: "blue",
    repo: "spring-projects/spring-boot",
    pr: "#50455",
    prTitle: "Generalize port file writing support",
    href: "https://github.com/spring-projects/spring-boot/pull/50455",
    summary: "2 detector findings · 7 components · 6 relationships",
    headline: "A new event path crosses package boundaries around port binding.",
    body: "This is a strong Java example because the line diff looks tidy, but Striff immediately shows the new event-oriented shape spanning boot context and web-server packages.",
    svg: "/examples/java.svg",
    panzoom: {
      desktop: { scale: 1.08, x: -18, y: -8 },
      mobile: { scale: 0.94, x: -8, y: -4 }
    },
    viewport: {
      desktopHeight: "30rem",
      mobileHeight: "18rem"
    },
    metrics: [
      "7 components in the focused structural diff",
      "6 changed relationships across 3 package clusters",
      "2 high-severity directional boundary findings"
    ],
    checkHeader: "Boundary movement and a new public writer path deserve review before merge.",
    checks: [
      {
        level: "danger",
        title: "New directional boundary crossing",
        body: "`org.springframework.boot.context` now points into `org.springframework.boot.context.event`, which did not exist before this PR."
      },
      {
        level: "danger",
        title: "Second boundary crossing through web server context",
        body: "`org.springframework.boot.web.server.context` also now points into `org.springframework.boot.context.event`, expanding the event surface."
      },
      {
        level: "warn",
        title: "Writer class is becoming a coordination point",
        body: "`NetworkServerPortFileWriter` lands as a public, fairly heavy class, making it a likely coupling magnet if more behaviors collect there."
      }
    ],
    highlights: [
      "Review `NetworkServerPortFileWriter` as the new central node.",
      "Check whether `PortBound` belongs in the event package or behind a narrower abstraction.",
      "Confirm `WebServerInitializedEvent` is still the right owner for this event flow."
    ]
  },
  {
    id: "python",
    language: "Python",
    accent: "emerald",
    repo: "PrefectHQ/prefect",
    pr: "#22018",
    prTitle: "Add delete flow run automation action",
    href: "https://github.com/PrefectHQ/prefect/pull/22018",
    summary: "7 components · 2 relationships · duplicated delete-flow concept",
    headline: "Delete-flow behavior now exists in parallel event and server namespaces.",
    body: "This Python PR is valuable because it shows how Striff can call out architectural duplication and blurred ownership even when there are few edges in the raw diff.",
    svg: "/examples/python.svg",
    panzoom: {
      desktop: { scale: 1.08, x: -34, y: -10 },
      mobile: { scale: 0.98, x: -18, y: -6 }
    },
    viewport: {
      desktopHeight: "23rem",
      mobileHeight: "15rem"
    },
    metrics: [
      "7 components in the structural diff",
      "2 changed relationships around flow-run actions",
      "4 highlighted components in the review pass"
    ],
    checkHeader: "The main concern is boundary blur, not line-level complexity.",
    checks: [
      {
        level: "danger",
        title: "Parallel `DeleteFlowRun` types now exist",
        body: "Event-layer and server-layer delete actions now live side by side, which increases the chance of drift and duplicated semantics."
      },
      {
        level: "warn",
        title: "Client, server, and event responsibilities are touching",
        body: "`OrchestrationClient`, `DeleteFlowRun`, and `FlowRunAction` now form a tighter cluster around the same behavior."
      },
      {
        level: "note",
        title: "Good review question",
        body: "Should delete-flow semantics have one source of truth rather than separate layer-specific types?"
      }
    ],
    highlights: [
      "Compare the two `DeleteFlowRun` classes before approving the abstraction split.",
      "Check whether `OrchestrationClient.delete_flow_run` should remain the primary seam.",
      "Use the diff to see whether event actions are depending on server concerns too directly."
    ]
  },
  {
    id: "typescript",
    language: "TypeScript",
    accent: "amber",
    repo: "vitest-dev/vitest",
    pr: "#10362",
    prTitle: "feat(reporters): add fileTemplate option to JUnit reporter",
    href: "https://github.com/vitest-dev/vitest/pull/10362",
    summary: "7 components · 4 relationships · reporter template surface expansion",
    headline: "A smaller refactor still grows the reporter's template surface in meaningful ways.",
    body: "This TypeScript example is good because the diagram stays compact and legible while still surfacing how one reporter class is anchoring several new template interfaces.",
    svg: "/examples/typescript.svg",
    panzoom: {
      desktop: { scale: 1.0, x: 0, y: 0 },
      mobile: { scale: 0.92, x: 0, y: 0 }
    },
    viewport: {
      desktopHeight: "22rem",
      mobileHeight: "14rem"
    },
    metrics: [
      "7 components in the diff",
      "4 relationships anchored on `JUnitReporter`",
      "3 highlighted components in the review pass"
    ],
    checkHeader: "The reviewer can focus on one hotspot instead of reading the whole reporter file first.",
    checks: [
      {
        level: "danger",
        title: "`JUnitReporter` remains the hotspot",
        body: "Complexity dropped, but the class is still much heavier than the repo norm and remains the main coordination point for this reporter path."
      },
      {
        level: "warn",
        title: "New template interfaces widen the surface area",
        body: "`SuiteNameTemplateVariables` and `FileTemplateVariables` extend the local abstraction set around JUnit formatting."
      },
      {
        level: "note",
        title: "Good review question",
        body: "Is the new template surface converging toward a coherent reporter model, or are narrowly-scoped interfaces starting to fragment the design?"
      }
    ],
    highlights: [
      "Start at `JUnitReporter` and inspect the new spokes first.",
      "Check whether `FileTemplateVariables` is a stable abstraction or a one-off convenience type.",
      "Use the structural diff to reason about future reporter option growth."
    ]
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
