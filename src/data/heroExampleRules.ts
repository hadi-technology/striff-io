// The homepage hero's rule card is an illustrative example, not a real run. The repository
// (acme/checkout-service), its documents, classes, packages and counts are invented to show the
// kind of rule a team's docs already state and what Striff reports on a pull request. The
// homepage's check section shows the same invented pull request in full (sampleRules in
// pages/index.astro); the flagship post uses the real Ericsson/ecchronos run in ecchronosRules.ts.
//
// Each rule carries its formula, typeset under the plain reading: one line of KaTeX chunks, so
// a long formula wraps only between chunks.

export const heroExampleRepo = "acme/checkout-service";

/** Illustrative counts for the example card: one rule broken, the rest held. The check section
 * shows the same pull request and lists all eight (sampleRules in pages/index.astro). */
export const heroExampleTally = { broken: 1, held: 7 };

export const heroExampleRules = [
  {
    verdict: "violated",
    verdictLabel: "Broken",
    craft: "Agent instructions",
    quote: "Never import from `legacy/` in new code; use the equivalents in `core/`.",
    doc: "AGENTS.md",
    line: 18,
    statement: "Nothing in `checkout` depends on `legacy`",
    witness: "`CsvExporter`, new in this pull request, imports `legacy.pricing.PriceCalculator`",
    logic: [[
      String.raw`\htmlClass{lg-q}{\neg\exists}\, c, d.`,
      String.raw`\mathrm{in}(c, \mathtt{checkout})`,
      String.raw`\wedge\ \mathrm{in}(d, \mathtt{legacy})`,
      String.raw`\wedge\ \mathrm{refs}(c, d)`
    ]],
    base: true,
    head: false
  },
  {
    verdict: "held",
    verdictLabel: "Holds",
    craft: "Layering",
    quote: "`core` never depends on feature modules such as `checkout`.",
    doc: "ARCHITECTURE.md",
    line: 22,
    statement: "Nothing in `core` depends on `checkout`",
    logic: [[
      String.raw`\htmlClass{lg-q}{\neg\exists}\, c, d.`,
      String.raw`\mathrm{in}(c, \mathtt{core})`,
      String.raw`\wedge\ \mathrm{in}(d, \mathtt{checkout})`,
      String.raw`\wedge\ \mathrm{refs}(c, d)`
    ]],
    base: true,
    head: true
  },
  {
    verdict: "held",
    verdictLabel: "Holds",
    craft: "Payments ADR",
    quote: "Only the `billing` module talks to the Stripe SDK.",
    doc: "docs/adr/0007-payments.md",
    line: 13,
    statement: "Nothing in `checkout` depends on `com.stripe`",
    logic: [[
      String.raw`\htmlClass{lg-q}{\neg\exists}\, c, d.`,
      String.raw`\mathrm{in}(c, \mathtt{checkout})`,
      String.raw`\wedge\ \mathrm{in}(d, \mathtt{com.stripe})`,
      String.raw`\wedge\ \mathrm{refs}(c, d)`
    ]],
    base: true,
    head: true
  }
];
