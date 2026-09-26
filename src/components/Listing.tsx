/**
 * Work happening somewhere else, shown as work rather than described as work.
 *
 * A paragraph saying "this is loading, it refreshes every few seconds" asks the reader to believe
 * a claim about the page. Shapes where the content will be say the same thing without asking, and
 * they say it continuously: as long as the shapes are moving, something is still expected.
 *
 * When the page stops watching, the shapes stop too and say so. Animation that never resolves is
 * a lie told slowly.
 *
 * @param what the thing being waited for, in the middle of a sentence
 * @param stale whether the page has given up watching for it
 * @param onLookAgain looks again now, where the page has given up
 */
export default function Listing({
  what,
  stale,
  onLookAgain,
}: {
  what: string;
  stale?: boolean;
  onLookAgain?: () => void;
}) {
  if (stale) {
    return (
      <div className="listing is-stale" role="status">
        <p className="listing-line">
          Striff has not listed {what} yet. The work is queued and can sit behind other
          repositories; it is not lost.
        </p>
        {onLookAgain && (
          <button type="button" className="dashboard-button dashboard-button-secondary" onClick={onLookAgain}>
            Look again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="listing" role="status" aria-live="polite">
      <p className="listing-line">
        <span className="listing-spinner" aria-hidden="true" />
        Striff is listing {what}. They appear here as soon as it has them.
      </p>
      <div className="listing-rows" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="listing-row" key={row} style={{ animationDelay: `${row * 120}ms` }}>
            <span className="listing-bar is-name" />
            <span className="listing-bar is-meta" />
          </div>
        ))}
      </div>
    </div>
  );
}
