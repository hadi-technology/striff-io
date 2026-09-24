// The documented-rules post: three rules from GitExtensions' own agent documentation.

/**
 * All three come from the real run on gitextensions#13277, at base 9b340fc and head a86e9a7, and
 * were checked by hand against that tree before being put on the page.
 *
 *  - The first fails at both revisions. `src/app/GitCommands/AsyncLoader.cs` opens with
 *    `using GitUI;` on line 1 and `GitConfigSettingsBase.cs` does the same on line 6, so the rule
 *    was already broken when the pull request opened rather than broken by it. Both satisfaction
 *    facts show it.
 *  - The second and third hold, and they are here because a figure showing only failures teaches
 *    nothing about what the check does the rest of the time, which is almost all of the time. The
 *    second also shows one terse sentence becoming two independent rules; the third is read out of
 *    an agent skill file rather than prose documentation.
 */
export const baseSha = "9b340fc";
export const headSha = "a86e9a7";

export const gitextensionsRules = [
  {
    verdict: "prior",
    verdictLabel: "Already broken",
    quote: "**NEVER** add a dependency that reverses the arrow direction (e.g. `GitCommands` must not reference `GitUI`).",
    doc: "copilot-docs/L1-conceptual/architecture-overview.md",
    line: 62,
    statement: "nothing in `GitCommands` may depend on `GitUI`",
    logic: [[String.raw`\htmlClass{lg-q}{\neg\exists} a, b.`, String.raw`\mathrm{in}(a, \mathtt{GitCommands})`, String.raw`\wedge\ \mathrm{in}(b, \mathtt{GitUI})`, String.raw`\wedge\ \mathrm{refs}(a, b)`]],
    witness: "`GitCommands/AsyncLoader.cs:1` — `using GitUI;`",
    base: false,
    head: false
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    quote: "**NEVER** `ClassicAssert`, **never** Moq.",
    doc: "copilot-docs/L2-core-platform/testing-guide.md",
    line: 46,
    statement: "nothing in this codebase may import `Moq`",
    craft: "one sentence, two rules",
    logic: [[String.raw`\htmlClass{lg-q}{\neg\exists} a.`, String.raw`\mathrm{refs}(a, \mathtt{Moq})`]],
    base: true,
    head: true
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    quote: "Never use `[DataTestMethod]` (that's MSTest);",
    doc: ".github/skills/run-tests/SKILL.md",
    line: 35,
    statement: "there may be no type annotated with `DataTestMethod`",
    craft: "read from an agent skill file",
    logic: [[String.raw`\htmlClass{lg-q}{\neg\exists} a.`, String.raw`\mathrm{annotated}(a, \mathtt{DataTestMethod})`]],
    base: true,
    head: true
  }
];
