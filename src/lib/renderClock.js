/**
 * The time and date format a rendered page uses.
 *
 * A page built ahead of time is rendered once at build and again in the reader's browser, and the
 * two must agree or React throws the built markup away. Dates are written in en-US and in UTC, and
 * "now" is the build's, wherever there is no browser and while a built page is being hydrated
 * (between freezeClock and thawClock). Otherwise the reader's own locale, time zone and clock.
 */

/** @type {number | null} */
let frozenAt = null;

/** Renders with the build's clock and format until thawClock, so hydration matches the build. */
export function freezeClock(nowMs) {
  frozenAt = nowMs;
}

/** Back to the reader's clock, locale and time zone. */
export function thawClock() {
  frozenAt = null;
}

function frozen() {
  return frozenAt != null || typeof window === "undefined";
}

/** Milliseconds since the epoch: the build's while frozen, the reader's otherwise. */
export function clockNow() {
  return frozenAt ?? Date.now();
}

/**
 * A date, formatted as toLocaleDateString would, in en-US and UTC while frozen.
 *
 * @param {number} ms
 * @param {Intl.DateTimeFormatOptions} options
 */
export function formatDay(ms, options) {
  return frozen()
    ? new Date(ms).toLocaleDateString("en-US", { ...options, timeZone: "UTC" })
    : new Date(ms).toLocaleDateString(undefined, options);
}
