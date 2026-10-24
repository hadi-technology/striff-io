/**
 * What an in-progress reading says about how much is left, from the numbers the run itself records.
 *
 * A reading reads the documents it selected, and nothing else is "left": the catalogue's count of
 * unread documents includes ones the reading will never touch, so it is never a fallback. Where the
 * run has recorded no selection yet the words say only that it is in progress.
 */

/** Documents the reading has left, when it says; null otherwise, and then no number is shown. */
export function selectedLeft(reading) {
  const left = reading?.docsSelectedLeft;
  return typeof left === "number" && left > 0 ? left : null;
}

/** The tooltip over "In progress". */
export function progressTitle(reading) {
  if (reading?.state === "queued") return "This reading is queued behind other work and starts on its own.";
  const selected = reading?.docsSelected;
  const left = reading?.docsSelectedLeft;
  if (typeof selected === "number" && typeof left === "number" && selected >= left) {
    return `Striff is reading this repository's documents: ${selected - left} of ${selected} read so far.`;
  }
  return "Striff is reading this repository's documents.";
}
