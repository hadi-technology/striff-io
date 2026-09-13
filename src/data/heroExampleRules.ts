// The homepage hero's rule card is an illustrative example, not a real run. The repository
// (acme/checkout-service), its documents, classes, packages and counts are invented to show the
// kind of rule a team's docs already state and what Striff reports on a pull request. Every real
// example on the site (the report, the diagram section and the flagship post) uses the real
// Ericsson/ecchronos run in ecchronosRules.ts and the homepage's own report data.
//
// Each rule carries its formula, typeset under the plain reading: one line of KaTeX chunks, so
// a long formula wraps only between chunks.

export const heroExampleRepo = "acme/checkout-service";

/** Illustrative counts for the example card: one rule broken, the rest held. */
export const heroExampleTally = { broken: 1, held: 41 };

export const heroExampleRules = [
  {
    verdict: "violated",
    verdictLabel: "Broken by this PR",
    craft: "Agent instructions",
    quote: "Never import from `legacy/` in new code; use the equivalents in `core/`.",
    doc: "AGENTS.md",
    line: 18,
    statement: "Nothing in `checkout` depends on `legacy`",
    witness: "`CartService` now imports `legacy.pricing.PriceCalculator`",
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
    verdictLabel: "Held",
    craft: "Vendor boundary",
    quote: "Only the `billing` module talks to the Stripe SDK; everything else goes through `PaymentGateway`.",
    doc: "docs/adr/0007-payments.md",
    line: 12,
    statement: "Only `billing` depends on `com.stripe`",
    logic: [[
      String.raw`\htmlClass{lg-q}{\forall}\, c, d.`,
      String.raw`(\mathrm{refs}(c, d)`,
      String.raw`\wedge\ \mathrm{in}(d, \mathtt{com.stripe}))`,
      String.raw`\rightarrow\ \mathrm{in}(c, \mathtt{billing})`
    ]],
    base: true,
    head: true
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    craft: "Layering",
    quote: "The domain layer never depends on infrastructure.",
    doc: "ARCHITECTURE.md",
    line: 42,
    statement: "Nothing in `domain` depends on `infrastructure`",
    logic: [[
      String.raw`\htmlClass{lg-q}{\neg\exists}\, c, d.`,
      String.raw`\mathrm{in}(c, \mathtt{domain})`,
      String.raw`\wedge\ \mathrm{in}(d, \mathtt{infrastructure})`,
      String.raw`\wedge\ \mathrm{refs}(c, d)`
    ]],
    base: true,
    head: true
  }
];
