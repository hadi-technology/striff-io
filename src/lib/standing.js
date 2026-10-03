/**
 * How a documented rule stands, in one answer: the default branch's standing where anything has
 * judged it there, and the last pull request's verdict where nothing has.
 *
 * Plain JavaScript so the build's report loader and the node tests read the same answer the
 * rules table shows.
 *
 * @param {{ status: string | null, onDefaultBranch: string | null }} row
 * @returns {"holds" | "broken" | "unchecked" | "unclear"}
 */
export function standing(row) {
  if (row.onDefaultBranch === "HOLDS") return "holds";
  if (row.onDefaultBranch === "BROKEN") return "broken";
  if (row.onDefaultBranch === "UNCLEAR") return "unclear";
  if (row.status === "MAINTAINED" || row.status === "RESTORED") return "holds";
  if (row.status === "VIOLATED" || row.status === "PRE_EXISTING") return "broken";
  if (row.status === "UNCLEAR") return "unclear";
  return "unchecked";
}
