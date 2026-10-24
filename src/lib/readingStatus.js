/**
 * What the documents view says about how far Striff has read a repository, from the `status` the
 * catalogue carries. Plain JavaScript so the node tests read the same words the page shows.
 *
 * Reading grows for free as a team works, so a repository with unread documents is never presented
 * as stuck: the count is always "N of M read so far", the paid plan is offered only as a way not
 * to wait, and nothing here names a limit, a budget or a number of documents Striff stops at.
 *
 * A line is a list of parts, a string or `{ b }` for the words that are bold, so the page draws
 * them without parsing markup.
 */

/** The states whose growth line is drawn with a bar: the repository is read as its team works. */
const GROWING = new Set(["unpaid"]);

/** A date as the header writes it: "12 Nov", with the year when it is not this one. */
export function paidUntilDate(ms, now = Date.now()) {
  const date = new Date(ms);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/**
 * The header for a status.
 *
 * @param {object | null | undefined} status the catalogue's `status`
 * @param {number} [now] the time to date a pause against
 * @returns {null | { line: (string | { b: string })[], offer: boolean, subscribe: boolean,
 *     growth: null | { read: number, total: number, text: string, bar: boolean } }}
 *     null where there is nothing new to say: no status, or a repository whose visibility is
 *     not known.
 */
export function readingHeader(status, now = Date.now()) {
  if (!status || !status.state) return null;
  const read = status.documentsRead ?? 0;
  const total = status.documentsTotal ?? 0;
  const notRead = status.documentsNotRead ?? Math.max(0, total - read);
  let line;
  let subscribe = false;
  switch (status.state) {
    case "unpaid":
      line = [
        "Striff has read ",
        { b: `${read} of your ${total} documents` },
        ", starting with the ones most tied to your code. Every pull request and push reads the documents about the code it changes, ",
        { b: "free" },
        ", so this keeps growing as your team works.",
      ];
      break;
    case "unpaid_waiting":
      line = ["Striff reads this repository's most important documents when its first pull request or push arrives."];
      break;
    case "unpaid_reading":
      // The reading in progress is drawn by the reading control; this says what it is.
      line = ["Striff is reading this repository's most important documents."];
      break;
    case "private_no_plan":
      line = ["Striff starts reading this repository's documents and checking its pull requests when you subscribe."];
      subscribe = true;
      break;
    case "private_paused":
      line = [
        status.pausedSinceMs
          ? `Paused: this repository's plan ended on ${paidUntilDate(status.pausedSinceMs, now)}. Its rules show how they stood then.`
          : "Paused: this repository's plan has ended. Its rules show how they stood then.",
      ];
      subscribe = true;
      break;
    case "paid_waiting_for_pull_request":
      line = ["Striff reads this repository's documents when its first pull request is checked."];
      break;
    case "paid_reading":
      line = [`Striff is reading the other ${notRead} documents: ${read} read so far.`];
      break;
    case "paid_all_read":
      line = [`Striff has read all ${total} documents.`];
      break;
    default:
      // A state a newer server invented: say nothing rather than something untrue.
      return null;
  }

  let growth = null;
  if (GROWING.has(status.state) && total > 0) {
    const atInstall = status.readAtInstallation ?? 0;
    const since = status.readSince ?? 0;
    growth = {
      read,
      total,
      bar: true,
      text: `${atInstall} read at installation${since > 0 ? `, ${since} more since through pull requests and pushes` : ""}.`,
    };
  } else if (status.state === "paid_all_read" && total > 0) {
    growth = { read: total, total, bar: false, text: `${total} read` };
  }

  return {
    line,
    offer: status.state === "unpaid" && status.offerPaidPlan === true,
    subscribe,
    growth,
  };
}
