// Shared by the homepage hero and the flagship blog post, so the two can never drift.

/**
 * The hero check card: three of the thirty-nine rules Striff read out of ecchronos'
 * own documents and answered on PR #1786. Verified by hand against both revisions at
 * base d188eb1b33 and head 0288412016 before being put on the page.
 *
 *  - Violated is a real differential result. `NodeWorker.java` imports and calls
 *    `RepairScheduler.putConfigurations()` at base (import line 29, call line 209) and
 *    carries no reference to it at head, while `core.impl/README.md:136` still
 *    documents the call.
 *  - The two held rows are here because they show the extractor doing something a
 *    keyword match cannot. The first resolves the general term "from `utils`" into the
 *    full package path the type actually sits in. The second reads one sentence naming
 *    two types with a slash into two conjoined rules, and reads "subclasses" as a
 *    reference. Both were confirmed in source: ConnectionType.java:15 declares the
 *    package, VnodeRepairTask.java:52 and IncrementalRepairTask.java:43 extend RepairTask.
 *
 * The mix is not curated for drama. Across 1,912 documented-rule outcomes in our own
 * sample the split runs about 70% held, 27% unanswered, 2% pre-existing and well under
 * 1% violated, which is why the tally shows all four numbers rather than one.
 */

/*
 * Each row also carries the sentence's formal rule, typeset as first-order logic. It is
 * the rule-language query (striff-api ADR-024) read as a formula: refs(x, y, k) is a
 * reference of any kind k, "expect: true" becomes an existential over it, a placement
 * rule is set membership, and a family sentence ("A / B are subclasses") is a universal
 * over the named members, exactly the one-rule-per-member expansion the extractor does.
 * The stored verdicts keep the statement, not the query, so these are written from the
 * statements in ADR-024's shapes. base/head: is the formula satisfied at each revision.
 */

/** The two revisions of Ericsson/ecchronos #1786 every rule was evaluated at. */
export const baseSha = "d188eb1";
export const headSha = "0288412";

export const ecchronosRules = [
  {
    verdict: "violated",
    verdictLabel: "Violated",
    quote: "Calls `RepairScheduler.putConfigurations()` to keep jobs up to date",
    doc: "core.impl/README.md",
    line: 136,
    statement: "`NodeWorker` depends on `RepairScheduler`",
    logic: [[String.raw`\htmlClass{lg-q}{\exists} k.`, String.raw`\mathrm{refs}(\mathtt{NodeWorker},`, String.raw`\mathtt{RepairScheduler}, k)`]],
    base: true,
    head: false
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    craft: "General term resolved",
    quote: "The `ConnectionType` enum (from `utils`) defines the three ecChronos control modes:",
    doc: "connection/README.md",
    line: 57,
    statement: "`ConnectionType` is in `com.\u200bericsson.\u200bbss.\u200bcassandra.\u200becchronos.\u200butils.\u200benums.\u200bconnection`",
    logic: [[String.raw`\mathtt{ConnectionType}`, String.raw`\in \ldots\mathtt{utils.enums.connection}`]],
    base: true,
    head: true
  },
  {
    verdict: "held",
    verdictLabel: "Held",
    craft: "One sentence, two rules",
    quote: "`VnodeRepairTask` / `IncrementalRepairTask` \u2014 Concrete `RepairTask` subclasses for vnode and incremental repair respectively.",
    doc: "core.impl/README.md",
    line: 65,
    statement: "`VnodeRepairTask` depends on `RepairTask`, and `IncrementalRepairTask` depends on `RepairTask`",
    logic: [
      [String.raw`\htmlClass{lg-q}{\forall} t \in \{\mathtt{VnodeRepairTask},`, String.raw`\mathtt{IncrementalRepairTask}\}.`],
      [String.raw`\htmlClass{lg-q}{\exists} k.`, String.raw`\mathrm{refs}(t,`, String.raw`\mathtt{RepairTask}, k)`]
    ],
    base: true,
    head: true
  }
];
