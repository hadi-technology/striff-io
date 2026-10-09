// The rules tally of each repository on the home page's strip, read from its live public report
// when the site is built.
//
// Each repository costs two reads through the public page's proxy: the document catalog, for the
// rules that hold and are broken on the default branch, and the type findings, for the names the
// docs write that the code no longer has. A read that fails, times out or answers something unexpected
// leaves that repository on its hand-taken snapshot; the build never fails over this.

const PROXY = "https://striff.io/.netlify/functions/public-repo-proxy";
const TIMEOUT_MS = 8000;

/**
 * The tally a report's two answers add up to, or null where they are not the shape expected.
 *
 * @param {any} catalog the catalog view's answer
 * @param {any} typeFindings the type-findings view's answer
 * @returns {{ held: number, broken: number, staleNames: number, rules: number } | null}
 */
export function tallyFrom(catalog, typeFindings) {
  const s = catalog && catalog.summary;
  const findings = typeFindings && typeFindings.findings;
  const count = (n) => (Number.isFinite(n) && n >= 0 ? n : null);
  if (!s || !Array.isArray(findings)) return null;
  const holds = count(s.holdsOnDefaultBranch);
  const broken = count(s.brokenOnDefaultBranch);
  if (holds === null || broken === null) return null;
  return { held: holds, broken, staleNames: findings.length, rules: count(s.rules) || 0 };
}

/**
 * One view of one repository's report, parsed, or a thrown error.
 *
 * @param {typeof fetch} fetchImpl
 * @param {{ owner: string, repo: string }} r
 * @param {string} view
 */
async function readView(fetchImpl, r, view) {
  const query = new URLSearchParams({ owner: r.owner, repo: r.repo, view });
  const response = await fetchImpl(`${PROXY}?${query}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${view} answered ${response.status}`);
  return response.json();
}

/**
 * The repositories to show, each with the tally to show and where it came from. A repository
 * whose live report has neither a rule nor a finding is left out: there is nothing on it to see.
 * One whose report could not be read keeps its snapshot.
 *
 * @template {{ owner: string, repo: string, snapshot: { held: number, broken: number, staleNames: number } }} R
 * @param {R[]} repos
 * @param {{ fetchImpl?: typeof fetch, log?: (message: string) => void }} [options]
 * @returns {Promise<Array<R & { tally: { held: number, broken: number, staleNames: number, rules?: number }, live: boolean }>>}
 */
export async function loadTallies(repos, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const log = options.log || ((message) => console.warn(message));
  const read = await Promise.all(repos.map(async (r) => {
    try {
      const [catalog, typeFindings] = await Promise.all([
        readView(fetchImpl, r, "catalog"),
        readView(fetchImpl, r, "type-findings"),
      ]);
      const tally = tallyFrom(catalog, typeFindings);
      if (!tally) throw new Error("the report's answer was not the shape expected");
      return { ...r, tally, live: true };
    } catch (error) {
      log(`[ossTally] ${r.owner}/${r.repo}: using the snapshot (${error && error.message ? error.message : error})`);
      return { ...r, tally: r.snapshot, live: false };
    }
  }));
  return read.filter((r) => !r.live || r.tally.rules + r.tally.staleNames > 0);
}
