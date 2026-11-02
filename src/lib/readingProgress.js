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

/**
 * Whether a run shows progress at all. A person's reading does, and so does a repository's first
 * reading. The nightly sweep over owed documents never does; nor does a run Striff started itself
 * when nothing is waiting to be read, since there is nothing for it to report.
 */
export function showsProgress(reading, waiting) {
  const askedBy = reading?.askedBy;
  if (askedBy === "sweep") return false;
  if (askedBy === "install" && !(waiting > 0)) return false;
  return true;
}
