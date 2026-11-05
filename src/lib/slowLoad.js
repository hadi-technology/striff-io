/**
 * How long a screen waits before it admits it is slow, in milliseconds.
 *
 * Plain JavaScript so the node tests read the same value the page uses.
 */
export const SLOW_AFTER_MS = 6000;

/**
 * Calls `onSlow` once after `ms` unless the returned function is called first.
 *
 * @param {number} ms
 * @param {() => void} onSlow
 * @param {{ setTimeout: Function, clearTimeout: Function }} [clock] replaceable for a test
 * @returns {() => void} cancels the wait; safe to call after it has fired
 */
export function slowAfter(ms, onSlow, clock = globalThis) {
  const id = clock.setTimeout(onSlow, ms);
  return () => clock.clearTimeout(id);
}
