/**
 * The sample repository the public demo is built on.
 *
 * Everything here is invented. `acme/checkout-service` is not a real repository, its documents are
 * not real documents, and the pull request numbers are not real pull requests. The site's own rule
 * about evidence is that anything presented as a finding must be a finding: this is presented as an
 * example and is labelled as one wherever it appears.
 *
 * What is real is the shape. These are the exact answers the dashboard's API sends, so the demo
 * runs the same components a customer runs, against data of the same form. A view that breaks here
 * breaks there.
 *
 * The repository is deliberately not tidy. It has a document nobody has read, one a screen skipped,
 * one a screen skipped that the team asked to be read anyway, one that says it is superseded, one
 * that could not be read at all, one the team excluded and a folder of drafts it excluded, one
 * edited since it was read, and a rule the team excluded on its own. A demo where everything is
 * green teaches nobody what the product is for.
 */
import { applyRuleStates } from "../lib/ruleStates.js";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The text of the sample ARCHITECTURE.md, as the text endpoint sends it. The rules below cite its
 * lines, so a line added here moves them; the demo test checks that each cited line says what its
 * rule quotes. The fence below is built apart so this comment's own text stays one piece.
 */
const FENCE = "```";
export const ARCH_TEXT = [
  "# Architecture",
  "",
  "Checkout service is a modular monolith in four layers: `api`, `service`, `domain` and `storage`. This page is the source of truth for how they may depend on each other.",
  "",
  "## Layers",
  "",
  "Controllers in `api` call services only and never touch `storage` directly.",
  "**`domain` depends on no other layer**, and stays free of framework annotations.",
  "",
  "Every repository implements `Repository<T>` and lives in `storage`. The old `legacy` module is on its way out. Nothing outside `legacy` imports from it.",
  "",
  "## Events",
  "",
  "Services publish domain events through `EventBus`; handlers in `events` never call controllers. Events are delivered at least once, so every handler must be idempotent.",
  "",
  "## Payments",
  "",
  "Only the billing module talks to the Stripe SDK; everything else goes through PaymentGateway. Each payment provider implements `PaymentGateway` and lives in `payments/providers`.",
  "",
  "Refunds go through `RefundService`, which depends on `PaymentGateway` and never on a provider. Provider calls time out after 5 seconds and are retried twice.",
  "",
  "| Layer | May depend on | Must not depend on |",
  "|---|---|---|",
  "| `api` | `service`, `domain` | `storage` |",
  "| `shared` | nothing | `orders`, `billing`, `payments` |",
  "",
  "## Background jobs",
  "",
  "Scheduled jobs are registered with `CronScheduler` at startup. Jobs must be safe to run twice.",
  "",
  "`CartSessionStore` keeps an open cart for thirty minutes after the last change.",
  "",
  "Every charge is written as a `billing.LedgerEntry` before the provider is called.",
  "",
  "## Flow",
  "",
  `${FENCE}mermaid`,
  "flowchart LR",
  "  api --> service",
  "  service --> domain",
  "  service --> storage",
  FENCE,
  "",
  "## Running locally",
  "",
  "Run `make migrate` before starting the service, and use the `dev` profile. Everything below this line is past what Striff has read of this doc.",
  "",
  "## Glossary",
  "",
  "A **provider** is a payment integration behind `PaymentGateway`; a **ledger entry** is one line of money moved.",
  "",
].join("\n");

/** Striff read this doc up to its last section; the rest is shown below a divider. */
const ARCH_READ = ARCH_TEXT.indexOf("## Running locally");


/** Fixed at module load so every view in one session agrees about "3 minutes ago". */
const NOW = Date.now();

export const DEMO_REPO = "acme/checkout-service";
export const DEMO_BRANCH = "main";
const DEMO_SHA = "a41c9e2f9b1d4c7e2a";

function doc(path: string, state: string, extra: Record<string, unknown> = {}) {
  return {
    path,
    state,
    ruleCount: 0,
    outdated: false,
    lastExtractedMs: null as number | null,
    lastExtractedPullNo: null as string | null,
    lastUsedMs: null as number | null,
    screenedBy: null as string | null,
    screenReason: null as string | null,
    retiredReason: null as string | null,
    currentContentHash: "b3d91f02",
    extractedContentHash: null as string | null,
    brokenRules: 0,
    alreadyBrokenRules: 0,
    excludedBy: null as string | null,
    excludedReason: null as string | null,
    forced: false,
    forcedBy: null as string | null,
    forcedReason: null as string | null,
    readChars: null as number | null,
    totalChars: null as number | null,
    ...extra,
  };
}

const documents = [
  doc("AGENTS.md", "READ", { extractedContentHash: "b3d91f02", ruleCount: 4, brokenRules: 1, lastExtractedMs: NOW - 15 * DAY, lastExtractedPullNo: "412", lastUsedMs: NOW - 2 * DAY }),
  doc("ARCHITECTURE.md", "READ", { extractedContentHash: "b3d91f02", ruleCount: 12, lastExtractedMs: NOW - 21 * DAY, lastExtractedPullNo: "398", readChars: ARCH_READ, totalChars: ARCH_TEXT.length }),
  // Outside the first reading: nothing has changed the code these describe yet, so they are read
  // free when something does. They are listed, never shown as having no rules.
  doc("CONTRIBUTING.md", "OUTSIDE_FIRST_READING", { screenReason: "Read free when a change touches the code it describes." }),
  doc("docs/design/inventory-reservations.md", "OUTSIDE_FIRST_READING", { screenReason: "Read free when a change touches the code it describes." }),
  doc("docs/runbooks/refund-backlog.md", "OUTSIDE_FIRST_READING", { screenReason: "Read free when a change touches the code it describes." }),
  doc("docs/runbooks/oncall.md", "SCREENED_OUT", { screenedBy: "worth_reading", screenReason: "worth_reading: describes who to page, states no rule about the code" }),
  doc("README.md", "SCREENED_OUT", { screenedBy: "worth_reading", screenReason: "worth_reading: describes setup and usage, not how the code is built" }),
  doc("docs/adr/0007-payments.md", "READ", { extractedContentHash: "b3d91f02", ruleCount: 2, alreadyBrokenRules: 1, lastExtractedMs: NOW - 15 * DAY, lastExtractedPullNo: "412", lastUsedMs: NOW - 12 * DAY }),
  doc("docs/adr/0008-read-models.md", "READ", { extractedContentHash: "71cc4ab9", ruleCount: 1, outdated: true, lastExtractedMs: NOW - 22 * DAY, lastExtractedPullNo: "398" }),
  doc("docs/adr/0003-shared-database.md", "RETIRED", { retiredReason: "Superseded by ADR 0007, which gives billing a store of its own." }),
  doc("docs/design/event-flow.md", "UNREADABLE"),
  doc("docs/glossary.md", "SCREENED_OUT", { screenedBy: "worth_reading", screenReason: "worth_reading: defines terms, states no rule about the code", forced: true, forcedBy: "maria-k", forcedReason: "It names the modules the ADRs talk about" }),
  // Excluded by the team: Striff reads neither, and none of their rules is checked. The server
  // counts an excluded doc's rules apart from its rule count, as it does any excluded rule.
  doc("docs/legacy/payments-v1.md", "EXCLUDED", { extractedContentHash: "5e0a7d13", lastExtractedMs: NOW - 60 * DAY, lastExtractedPullNo: "301", excludedBy: "maria-k", excludedReason: "Describes the v1 flow we're retiring" }),
  doc("docs/drafts/read-replicas.md", "EXCLUDED", { extractedContentHash: "c19b02ee", lastExtractedMs: NOW - 30 * DAY, lastExtractedPullNo: "377" }),
  doc("docs/drafts/sagas.md", "EXCLUDED"),
];

const isUnread = (d: { state: string }) => d.state === "NOT_READ" || d.state === "OUTSIDE_FIRST_READING";
const count = (state: string) => documents.filter((d) => d.state === state).length;
const summary = {
  documents: documents.length,
  read: count("READ"),
  outdated: documents.filter((d) => d.outdated).length,
  notRead: count("NOT_READ") + count("OUTSIDE_FIRST_READING"),
  outsideFirstReading: count("OUTSIDE_FIRST_READING"),
  screenedOut: count("SCREENED_OUT"),
  retired: count("RETIRED"),
  unreadable: count("UNREADABLE"),
  rules: 19,
  brokenRules: 1,
  alreadyBrokenRules: 1,
  neverChecked: 1,
  excluded: count("EXCLUDED"),
  holdsOnDefaultBranch: 14,
  brokenOnDefaultBranch: 3,
};

/**
 * The rules each document states, one set per document.
 *
 * Every document has its own, because a demo where five files yield the same five rules is a demo
 * that says nobody wrote it. They are the kinds of sentence a real checkout service's docs hold:
 * a module boundary, a layering rule, an interface every implementation must carry.
 *
 * The counts are arranged, not random. Twenty-one rules: sixteen the code keeps, two a pull
 * request broke, one that was already broken before the change that found it, and two Striff could
 * not answer from the code, which are stored and not listed because a rule nothing has judged says
 * nothing. One quote runs to a paragraph on purpose -- real architecture docs are written in
 * paragraphs, and the cell that has to fold one into a table is the one worth showing.
 */
function rule(
  line: number,
  statement: string,
  quote: string,
  status: string | null,
  onDefaultBranch: string | null,
  pullNo: string | null,
  judgedDaysAgo: number | null
) {
  return {
    factId: `${line}`,
    statement,
    quote,
    sourceLine: line,
    firstSeenMs: NOW - 40 * DAY,
    status,
    pullNo,
    judgedAtMs: judgedDaysAgo === null ? null : NOW - judgedDaysAgo * DAY,
    onDefaultBranch,
  };
}

/**
 * A demo rule with the words of its sentence it checks, as the API sends them: offsets into the
 * quote, so the documents view shows those words in bold inside the whole sentence.
 */
function checking<T extends { quote: string }>(row: T, words: string) {
  const from = row.quote.indexOf(words);
  return from < 0 ? row : { ...row, checkedFrom: from, checkedTo: from + words.length };
}

/** A demo issue on the made-up repository; the demo never opens it. */
function issueAt(number: number, state: "open" | "closed", stateReason: string | null = null) {
  return { number, url: `https://github.com/${DEMO_REPO}/issues/${number}`, state, stateReason };
}

/** A demo finding with the issue it is tracked in. */
function tracked<T extends object>(row: T, issue: ReturnType<typeof issueAt>) {
  return { ...row, issue };
}

const HOLDS = (line: number, statement: string, quote: string, pr = "412", days = 15) =>
  rule(line, statement, quote, "MAINTAINED", "HOLDS", pr, days);

const rulesByDoc: Record<string, ReturnType<typeof rule>[]> = {
  "AGENTS.md": [
    HOLDS(12, "Nothing in `checkout` depends on `legacy`", "Never import from `legacy/` in new code; use the equivalents in `core/`."),
    HOLDS(19, "Only `checkout.store` depends on `org.hibernate`", "Persistence lives in the store package. No other package imports the ORM."),
    // Tracked in an open issue: the demo shows the issue in place of the button.
    tracked(checking(rule(27, "Nothing in `checkout.web` depends on `checkout.store`",
      "Controllers never reach the store directly; everything goes through a service, and the service is the only thing that knows a database exists. This is the rule we break most often under time pressure, and it is the one that costs most to put back, because by the time anyone notices there are a dozen controllers holding a repository and no service layer worth the name.",
      "VIOLATED", "BROKEN", "427", 12), "Controllers never reach the store directly"), issueAt(431, "open")),
    // A second rule from the same sentence, so the demo shows one sentence's rules grouped.
    checking(HOLDS(27, "Only `checkout.service` depends on `checkout.store`",
      "Controllers never reach the store directly; everything goes through a service, and the service is the only thing that knows a database exists. This is the rule we break most often under time pressure, and it is the one that costs most to put back, because by the time anyone notices there are a dozen controllers holding a repository and no service layer worth the name.",
      "427", 12), "the service is the only thing that knows a database exists"),
  ],
  "ARCHITECTURE.md": [
    HOLDS(7, "Nothing in `api` depends on `storage`", "Controllers in `api` call services only and never touch `storage` directly.", "398", 21),
    HOLDS(8, "`domain` depends on nothing in `api`, `service` or `storage`", "`domain` depends on no other layer, and stays free of framework annotations.", "398", 21),
    // Excluded on its own by the team (see demoRules): drawn dashed, with its reason.
    HOLDS(10, "Nothing outside `legacy` depends on `legacy`", "Nothing outside `legacy` imports from it.", "398", 21),
    HOLDS(10, "Every class named `*Repository` implements `Repository`", "Every repository implements `Repository<T>` and lives in `storage`.", "398", 21),
    // Broken on main: drawn red, and tracked in an open issue.
    tracked(rule(10, "Every class named `*Repository` is in `storage`", "Every repository implements `Repository<T>` and lives in `storage`.",
      "VIOLATED", "BROKEN", "427", 12), issueAt(434, "open")),
    HOLDS(14, "Nothing in `events` depends on `api`", "Handlers in `events` never call controllers.", "398", 21),
    HOLDS(18, "Only `billing` depends on `com.stripe`", "Only the billing module talks to the Stripe SDK; everything else goes through PaymentGateway.", "398", 21),
    HOLDS(18, "Every class in `billing.providers` implements `PaymentGateway`", "Each payment provider implements `PaymentGateway` and lives in `payments/providers`.", "398", 21),
    // Never judged on main: drawn as a blue outline.
    rule(20, "`RefundService` depends on `PaymentGateway`, not on a provider", "Refunds go through `RefundService`, which depends on `PaymentGateway` and never on a provider.", null, null, null, null),
    // From a table row and from a diagram line: the whole row, the whole line.
    HOLDS(25, "Nothing in `shared` depends on `orders`, `billing` or `payments`", "`shared` may depend on nothing; it must not depend on `orders`, `billing` or `payments`.", "398", 21),
    HOLDS(39, "`api` depends on `service`", "`api` depends on `service`", "398", 21),
    // The sentence it was read from has since been reworded, so it cannot be placed in the text.
    HOLDS(29, "Only `config` depends on `AppSettings`", "Configuration is read only in `config`, through `AppSettings`.", "398", 21),
  ],
  "docs/adr/0007-payments.md": [
    HOLDS(14, "Nothing in `billing` depends on `checkout`", "Billing knows nothing about checkout. The dependency runs one way."),
    // An issue closed as not planned: the demo offers to ignore the rule instead.
    tracked(rule(44, "Nothing in `billing.webhooks` depends on `web`",
      "Webhook handlers must not depend on the web layer.",
      "PRE_EXISTING", "BROKEN", "427", 12), issueAt(418, "closed", "not_planned")),
  ],
  "docs/adr/0008-read-models.md": [
    HOLDS(11, "Nothing in `reporting` depends on `checkout.store`", "Read models are built from events, never by reaching into the write side.", "398", 22),
  ],
  "docs/legacy/payments-v1.md": [
    HOLDS(9, "Only `checkout` depends on `com.stripe`", "Checkout calls Stripe directly; there is no billing module yet.", "301", 60),
    HOLDS(17, "Nothing in `billing` depends on `ledger`", "Refunds are written straight to the payments table.", "301", 60),
  ],
  "docs/drafts/read-replicas.md": [
    HOLDS(6, "Only `reporting` depends on `checkout.replica`", "Reporting reads from the replica, and nothing else should.", "377", 30),
  ],
};

const history = [
  { kind: "reused", atMs: NOW - 12 * DAY, pullNo: "427", ruleCount: 5, reason: null },
  { kind: "reused", atMs: NOW - 13 * DAY, pullNo: "424", ruleCount: 5, reason: null },
  { kind: "extracted", atMs: NOW - 15 * DAY, pullNo: "412", ruleCount: 5, reason: null },
  { kind: "unreadable", atMs: NOW - 23 * DAY, pullNo: "397", ruleCount: 0, reason: "the read did not finish" },
];

/** The catalogue, as `view=catalog` sends it. */
export const demoCatalog: any = {
  repoOwner: "acme",
  repoName: "checkout-service",
  defaultBranch: DEMO_BRANCH,
  defaultBranchSha: DEMO_SHA,
  lastScanMs: NOW - 3 * 60 * 1000,
  lastAttempt: { atMs: NOW - 3 * 60 * 1000, outcome: "listed", reason: null, documents: documents.length },
  reading: null,
  // An unpaid repository: the first reading is done and the rest is read free as pull requests and
  // pushes touch the code the documents describe. 12 of 15 read: 9 at installation, 3 since.
  status: {
    state: "unpaid",
    offerPaidPlan: true,
    privateRepository: false,
    pausedSinceMs: null,
    documentsRead: documents.length - documents.filter(isUnread).length,
    documentsTotal: documents.length,
    documentsNotRead: documents.filter(isUnread).length,
    readAtInstallation: 9,
    readSince: 3,
    readSinceThroughPullRequests: 2,
    readSinceThroughPushes: 1,
    readByPlan: 0,
  },
  exclusions: [
    { path: "docs/drafts", folder: true, excludedBy: "maria-k", reason: "Drafts aren't decisions yet", atMs: NOW - 9 * DAY },
    { path: "docs/legacy/payments-v1.md", folder: false, excludedBy: "maria-k", reason: "Describes the v1 flow we're retiring", atMs: NOW - 20 * DAY },
  ],
  summary,
  documents,
};

/** The names the docs write that the code no longer has, as `view=type-findings` sends them. */
export const demoStaleNames: any = {
  repoOwner: "acme",
  repoName: "checkout-service",
  documents: 2,
  truncated: false,
  lastSeenMs: NOW - 2 * DAY,
  findings: [
    {
      docPath: "ARCHITECTURE.md",
      name: "CartSessionStore",
      state: "ABSENT",
      issue: issueAt(433, "open"),
      sentence: "`CartSessionStore` keeps an open cart for thirty minutes after the last change.",
      sourceLine: 31,
      namespace: "checkout.cart",
      historicalPath: "src/main/java/com/acme/checkout/cart/CartSessionStore.java",
      siblings: [],
      packageSize: 0,
      movedToNamespace: null,
      movedToPath: null,
      firstSeenMs: NOW - 16 * DAY,
      lastSeenMs: NOW - 2 * DAY,
      removedBySha: "d41e7a2c9b",
      removedByMessage: "Keep carts in the order service",
      removedAtMs: NOW - 17 * DAY,
      removedByUrl: null,
    },
    {
      docPath: "ARCHITECTURE.md",
      name: "billing.LedgerEntry",
      state: "MOVED",
      issue: issueAt(401, "closed", "completed"),
      sentence: "Every charge is written as a `billing.LedgerEntry` before the provider is called.",
      sourceLine: 33,
      namespace: "billing",
      historicalPath: null,
      siblings: [],
      packageSize: 6,
      movedToNamespace: "billing.ledger",
      movedToPath: "src/main/java/com/acme/checkout/billing/ledger/LedgerEntry.java",
      firstSeenMs: NOW - 2 * DAY,
      lastSeenMs: NOW - 2 * DAY,
    },
    {
      docPath: "docs/adr/0007-payments.md",
      name: "PaypalGateway",
      state: "ABSENT",
      sentence: "`PaypalGateway` and `StripeGateway` are the two providers behind `PaymentGateway`.",
      sourceLine: 22,
      namespace: "billing.providers",
      historicalPath: null,
      siblings: ["StripeGateway", "AdyenGateway", "PaymentGateway"],
      packageSize: 3,
      movedToNamespace: null,
      movedToPath: null,
      firstSeenMs: NOW - 40 * DAY,
      lastSeenMs: NOW - 2 * DAY,
    },
  ],
};

/** Every rule of the repository, as `view=rules` sends them. */
const demoRulesRead: any = {
  repoOwner: "acme",
  repoName: "checkout-service",
  defaultBranch: DEMO_BRANCH,
  defaultBranchSha: DEMO_SHA,
  lastScanMs: demoCatalog.lastScanMs,
  lastAttempt: demoCatalog.lastAttempt,
  reading: null,
  summary,
  truncated: false,
  documents: documents
    .filter((d) => (rulesByDoc[d.path] || []).length > 0)
    .map((d) => ({
      document: d,
      // A rule in an excluded doc is sent excluded, and says it is excluded with its doc.
      rules: (rulesByDoc[d.path] || []).map((r, i) => ({
        ...r,
        factId: `${d.path}|${i}`,
        ...(d.state === "EXCLUDED" ? { excluded: true, excludedBy: "excluded" } : {}),
      })),
    })),
  // The exclusion list, as the API sends it beside the catalogue's own.
  excludedPaths: demoCatalog.exclusions.map((e: { path: string; folder: boolean }) => ({ path: e.path, prefix: e.folder })),
};

/**
 * The example's rules as the team has set them: the excluded doc's and the excluded folder's,
 * and one rule excluded on its own. The switches on the demo page change this answer in place,
 * and nothing else.
 */
export const demoRules: any = applyRuleStates(demoRulesRead, { excluded: true, factIds: ["ARCHITECTURE.md|2"] });

/** One document with its rules, as `view=doc` sends it. */
export function demoDoc(path: string): any {
  const document_ = documents.find((d) => d.path === path);
  if (!document_) return null;
  const own = (rulesByDoc[path] || []).map((r, i) => ({ ...r, factId: `${path}|${i}` }));
  return {
    document: document_,
    rules: own,
    history: isUnread(document_) ? [] : history,
  };
}

/** The words each ARCHITECTURE.md rule checks, found in the sample text: rule index, then words. */
const ARCH_WORDS: [number, string][] = [
  [0, "Controllers in `api` call services only and never touch `storage` directly"],
  [1, "`domain` depends on no other layer"],
  [2, "Nothing outside `legacy` imports from it."],
  [3, "Every repository implements `Repository<T>`"],
  [4, "and lives in `storage`."],
  [5, "handlers in `events` never call controllers."],
  [6, "Only the billing module talks to the Stripe SDK"],
  [7, "Each payment provider implements `PaymentGateway`"],
  [8, "Refunds go through `RefundService`, which depends on `PaymentGateway` and never on a provider."],
];

/** Where `words` stand in `text`, or null: UTF-16 offsets, as the text endpoint sends them. */
function spanOf(text: string, words: string) {
  const from = text.indexOf(words);
  return from < 0 ? null : { from, to: from + words.length };
}

/**
 * Where each rule of a document is in its text, in the shape the text endpoint sends: positions
 * only, joined to the rules by factId. A rule whose sentence is not in the text is unplaced.
 */
function placementsFor(path: string, text: string) {
  const rules = (rulesByDoc[path] || []).map((r, i) => ({ ...r, factId: `${path}|${i}` }));
  const placements: any[] = [];
  const unplaced: string[] = [];
  const lines = text.split("\n");
  rules.forEach((r, i) => {
    let span = null;
    let block: { line: number; kind: string } | null = null;
    if (path === "ARCHITECTURE.md") {
      const words = ARCH_WORDS.find(([index]) => index === i);
      if (words) span = spanOf(text, words[1]);
      else if (lines[r.sourceLine - 1]?.startsWith("| `shared`")) block = { line: r.sourceLine, kind: "row" };
      else if (lines[r.sourceLine - 1]?.includes("-->")) block = { line: r.sourceLine, kind: "diagram" };
    } else {
      const at = text.indexOf(r.quote);
      if (at >= 0) {
        const c = r as { checkedFrom?: number; checkedTo?: number };
        span = { from: at + (c.checkedFrom ?? 0), to: at + (c.checkedTo ?? r.quote.length) };
      }
    }
    if (span) placements.push({ factId: r.factId, spans: [span], block: null });
    else if (block) placements.push({ factId: r.factId, spans: [], block });
    else unplaced.push(r.factId);
  });
  return { placements, unplaced };
}

/** A short sample document for a path that is not ARCHITECTURE.md: its rules' sentences, under a title. */
function plainText(path: string): string {
  const title = path.split("/").pop()!.replace(/\.md$/, "").replace(/[-_]/g, " ");
  const rules = rulesByDoc[path] || [];
  const body = rules.map((r) => r.quote).join("\n\n");
  return `# ${title}\n\n${body}\n\nThe rest of this document is prose Striff does not turn into rules.\n`;
}

/**
 * One document's text and where its rules are in it, as `doc/text` sends them, so the Document tab
 * runs on the example with no API behind it.
 */
export function demoDocText(path: string): any {
  const document_ = documents.find((d) => d.path === path);
  if (!document_ || !(rulesByDoc[path] || []).length) return null;
  const text = path === "ARCHITECTURE.md" ? ARCH_TEXT : plainText(path);
  return {
    path,
    contentHash: document_.extractedContentHash,
    format: "markdown",
    state: "OK",
    reason: null,
    commit: DEMO_SHA,
    mainChanged: false,
    text,
    readChars: path === "ARCHITECTURE.md" ? ARCH_READ : null,
    ...placementsFor(path, text),
  };
}

/**
 * The checks Striff ran on the example repository's pull requests, as `view=checks` sends them:
 * newest first, ten a page. Pull requests #412 and #427 are the ones the rules above were judged
 * on, so the two pages agree about what broke what.
 */
const demoCheckList = [
  { pullNo: "431", headline: "Adds a Ledger to billing and routes refunds through it", changed: 6, broken: 0, prior: 1, held: 7, docs: 3, ago: 0.2 * DAY, state: "COMPLETED" },
  { pullNo: "430", headline: "Moves the Stripe client behind PaymentGateway", changed: 3, broken: 0, prior: 0, held: 5, docs: 2, ago: 1.1 * DAY, state: "COMPLETED" },
  { pullNo: "427", headline: "Checkout reads invoice totals from the store directly", changed: 4, broken: 2, prior: 0, held: 6, docs: 3, ago: 12 * DAY, state: "COMPLETED" },
  { pullNo: "425", headline: "Renames OrderRepository and splits its read side", changed: 5, broken: 0, prior: 0, held: 0, docs: 0, ago: 13 * DAY, state: "COMPLETED" },
  { pullNo: "421", headline: "Adds retry with backoff to the webhook handler", changed: 2, broken: 0, prior: 0, held: 3, docs: 1, ago: 14 * DAY, state: "COMPLETED" },
  { pullNo: "418", headline: null, changed: null, broken: 0, prior: 0, held: 0, docs: 0, ago: 14.5 * DAY, state: "FAILED" },
  { pullNo: "412", headline: "Introduces the pricing engine behind a PricingPolicy port", changed: 7, broken: 0, prior: 0, held: 8, docs: 4, ago: 15 * DAY, state: "COMPLETED" },
  { pullNo: "409", headline: "Caches product lookups in the catalog client", changed: 2, broken: 1, prior: 0, held: 2, docs: 1, ago: 17 * DAY, state: "COMPLETED" },
  { pullNo: "405", headline: "Splits notifications out of the order service", changed: 9, broken: 0, prior: 1, held: 6, docs: 3, ago: 19 * DAY, state: "COMPLETED" },
  { pullNo: "402", headline: "Removes the legacy cart session store", changed: 3, broken: 0, prior: 0, held: 4, docs: 2, ago: 21 * DAY, state: "COMPLETED" },
  { pullNo: "398", headline: "Documents the payment flow and its boundaries", changed: 1, broken: 0, prior: 0, held: 9, docs: 5, ago: 22 * DAY, state: "COMPLETED" },
  { pullNo: "396", headline: "Upgrades the HTTP client and its timeouts", changed: 2, broken: 0, prior: 0, held: 0, docs: 0, ago: 24 * DAY, state: "COMPLETED" },
  { pullNo: "391", headline: "Adds an inventory reservation step before payment", changed: 5, broken: 1, prior: 0, held: 5, docs: 2, ago: 26 * DAY, state: "COMPLETED" },
].map((check, i) => ({
  pullNo: check.pullNo,
  pullUrl: `https://github.com/${DEMO_REPO}/pull/${check.pullNo}`,
  headSha: (0x5c2e91a + i * 104729).toString(16).padStart(7, "0") + "e3",
  checkedAtMs: NOW - check.ago,
  state: check.state,
  headline: check.headline,
  changedComponents: check.changed,
  diagrams: check.state === "FAILED" ? 0 : 1,
  rulesBroken: check.broken,
  rulesAlreadyBroken: check.prior,
  rulesHeld: check.held,
  docsRead: check.docs,
}));

/** One page of the example repository's checks. */
export function demoChecks(page: number) {
  const pages = Math.ceil(demoCheckList.length / 10);
  return {
    checks: demoCheckList.slice(page * 10, page * 10 + 10),
    page,
    pages,
    total: demoCheckList.length,
  };
}
