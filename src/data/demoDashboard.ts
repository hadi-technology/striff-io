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
  doc("ARCHITECTURE.md", "READ", { extractedContentHash: "b3d91f02", ruleCount: 4, lastExtractedMs: NOW - 21 * DAY, lastExtractedPullNo: "398", readChars: 99908, totalChars: 112480 }),
  doc("CONTRIBUTING.md", "NOT_READ"),
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

const count = (state: string) => documents.filter((d) => d.state === state).length;
const summary = {
  documents: documents.length,
  read: count("READ"),
  outdated: documents.filter((d) => d.outdated).length,
  notRead: count("NOT_READ"),
  screenedOut: count("SCREENED_OUT"),
  retired: count("RETIRED"),
  unreadable: count("UNREADABLE"),
  rules: 11,
  brokenRules: 1,
  alreadyBrokenRules: 1,
  neverChecked: 0,
  excluded: count("EXCLUDED"),
  holdsOnDefaultBranch: 9,
  brokenOnDefaultBranch: 2,
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
    checking(HOLDS(21, "Only `billing` depends on `com.stripe`", "Only the billing module talks to the Stripe SDK; everything else goes through PaymentGateway.", "398", 21),
      "Only the billing module talks to the Stripe SDK"),
    checking(HOLDS(38, "Every class in `billing.providers` implements `PaymentGateway`", "**Providers are plug-ins.** Every payment provider implements `PaymentGateway` ([see the ADR](docs/adr/0007-payments.md)), and _nothing_ else does.", "398", 21),
      "Every payment provider implements `PaymentGateway`"),
    HOLDS(52, "Nothing in `web` depends on `billing.internal`", "The web layer sees the billing API and nothing behind it.", "398", 21),
    checking(HOLDS(38, "Nothing outside `billing.providers` implements `PaymentGateway`", "**Providers are plug-ins.** Every payment provider implements `PaymentGateway` ([see the ADR](docs/adr/0007-payments.md)), and _nothing_ else does.", "398", 21),
      "_nothing_ else does"),
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
      sourceLine: 64,
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
      sourceLine: 71,
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
    history: document_.state === "NOT_READ" ? [] : history,
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
