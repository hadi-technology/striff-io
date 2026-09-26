// The documented-rules post's second rule figure: three rules Striff read out of public
// repositories' own documents, chosen for their shape rather than their verdict. One names the
// only modules a module may use, one binds a document's word to the namespaces it means, and one
// quantifies over every class of a kind.

/**
 * Each row is Striff's own output on the pull request named in `doc`: the quote, the statement,
 * the verdict, and the witness it cited. Every row was checked by hand at that pull request's
 * base and head, and against the default branch, before being put on the page.
 *
 *  - apache/pinot #19534 (base 5771d6a, head e597d09). `pinot-sql-ddl/DESIGN.md:97` says the module
 *    depends only on pinot-spi, pinot-common and calcite-babel (external). Its pom has declared
 *    pinot-query-planner at compile scope since the materialized-view work, and
 *    `MaterializedViewSchemaInferer.java:35-36` imports from it. Broken at both revisions, and the
 *    sentence is still there on master.
 *  - SubtitleEdit/subtitleedit #14997 (base 7398eb9, head 2fe7396). `docs/reference/command-line.md:867`
 *    says seconv uses no GUI runtime. "gui" is bound to Nikse.SubtitleEdit.Controls and
 *    Nikse.SubtitleEdit.Features; `SeConv.csproj` references only LibSE and LibUiLogic, and no seconv
 *    file uses either namespace. Held at both revisions.
 *  - MonoGame-Extended #1199 (base 5105c4f, head fe4728b). `CODING_GUIDELINES.md:83` asks for static
 *    helper classes. Six of the seven `*Helper` types are static; `PrimitivesHelper.cs:8` is an
 *    `internal class`. Broken at both revisions, and on develop.
 *
 * Quotes are the documents' own sentences, with markdown emphasis rendered as text.
 */
export const ruleShapes = [
  {
    verdict: "prior",
    verdictLabel: "Already broken",
    craft: "Only these, nothing else",
    quote: "The compile/reverse logic lives in `pinot-sql-ddl` — a new module that depends only on `pinot-spi` (for `Schema`, `TableConfig`, `FieldSpec`), `pinot-common` (for the AST nodes), and `calcite-babel` (for the parser builder).",
    doc: "apache/pinot · pinot-sql-ddl/DESIGN.md",
    line: 97,
    statement: "nothing in `pinot-sql-ddl` may depend on another module of the repository other than `pinot-spi` or `pinot-common`",
    witness: "`MaterializedViewSchemaInferer` references `RelToPlanNodeConverter` in `pinot-query-planner`",
    logic: [
      [String.raw`\htmlClass{lg-q}{\neg\exists}\, a, b.`, String.raw`\mathrm{in\_unit}(a, \texttt{pinot-sql-ddl})`, String.raw`\wedge\ \mathrm{refs}(a, b)`],
      [String.raw`\wedge\ \mathrm{unit\_of}(b) \notin \{`, String.raw`\texttt{pinot-sql-ddl},`, String.raw`\texttt{pinot-spi},`, String.raw`\texttt{pinot-common}\,\}`]
    ],
    base: false,
    head: false
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    craft: "A word bound to namespaces",
    quote: "`seconv` depends only on Subtitle Edit's core libraries — no Avalonia / GUI runtime:",
    doc: "SubtitleEdit · docs/reference/command-line.md",
    line: 867,
    statement: "nothing in `SeConv.Core` may depend on anything in the GUI, where “GUI” means `Nikse.SubtitleEdit.Controls` and `Nikse.SubtitleEdit.Features`",
    logic: [
      [String.raw`\htmlClass{lg-q}{\neg\exists}\, a, b.`, String.raw`\mathrm{in}(a, \texttt{SeConv.Core})`, String.raw`\wedge\ \mathrm{in\_group}(b, \textsf{gui})`, String.raw`\wedge\ \mathrm{refs}(a, b)`],
      [String.raw`\textsf{gui} \coloneqq \{`, String.raw`\ldots\texttt{Controls},`, String.raw`\ldots\texttt{Features}\,\}`]
    ],
    base: true,
    head: true
  },
  {
    verdict: "prior",
    verdictLabel: "Already broken",
    craft: "Every class of a kind",
    quote: "Helper classes should be static classes with static methods",
    doc: "MonoGame-Extended · CODING_GUIDELINES.md",
    line: 83,
    statement: "every type named `*Helper` is declared `static`",
    witness: "`PrimitivesHelper` is declared `internal class`, not `static`",
    logic: [
      [String.raw`\htmlClass{lg-q}{\forall}\, c.`, String.raw`\mathrm{name\_matches}(c, \texttt{*Helper})`, String.raw`\rightarrow\ \mathrm{modifier}(c, \texttt{static})`]
    ],
    base: false,
    head: false
  }
];
