import { Fragment } from "react";
import { brokenBy, shortName } from "../lib/brokenBy.js";

/** A name as code, shortened, with the whole name on hover and a place to break after each dot or underscore. */
function Name({ name }: { name: string }) {
  const parts = shortName(name).split(/(?<=[._])/);
  return (
    <code title={name}>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {at > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </code>
  );
}

/**
 * What a broken rule is broken by: the names the verdict cited, under the rule. A source that
 * reaches one name is one line; a source that reaches several is its name and a line for each. Draws
 * nothing where the server sent no witness, so a rule that cited none carries no claim of its own
 * about why it is broken.
 */
export default function BrokenBy({ evidence }: { evidence?: string[] | null }) {
  const { lines, more } = brokenBy(evidence);
  if (lines.length === 0) return null;
  return (
    <span className="broken-by">
      <span className="broken-by-label">Broken by</span>
      {lines.map((line) => (
        <span key={line.from} className="broken-by-line">
          {line.text ? line.from : <Name name={line.from} />}
          {line.to.length === 1 && line.moreTo === 0 && (
            <>
              {" → "}
              <Name name={line.to[0]} />
            </>
          )}
          {(line.to.length > 1 || line.moreTo > 0) &&
            line.to.map((to) => (
              <span key={to} className="broken-by-to">
                <span aria-hidden="true">→</span>
                <Name name={to} />
              </span>
            ))}
          {(line.to.length > 1 || line.moreTo > 0) && line.moreTo > 0 && (
            <span className="broken-by-to">and {line.moreTo} more</span>
          )}
        </span>
      ))}
      {more > 0 && <span className="broken-by-line">and {more} more</span>}
    </span>
  );
}
