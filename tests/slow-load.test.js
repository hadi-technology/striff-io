import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { SLOW_AFTER_MS, slowAfter } from "../src/lib/slowLoad.js";

test("a screen that is still loading after the wait says so, once", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let said = 0;
  slowAfter(SLOW_AFTER_MS, () => { said += 1; });
  mock.timers.tick(SLOW_AFTER_MS - 1);
  assert.equal(said, 0);
  mock.timers.tick(1);
  mock.timers.tick(SLOW_AFTER_MS * 3);
  assert.equal(said, 1);
  mock.timers.reset();
});

test("a screen that loads in time never says it", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  let said = 0;
  const cancel = slowAfter(SLOW_AFTER_MS, () => { said += 1; });
  mock.timers.tick(SLOW_AFTER_MS - 1);
  cancel();
  mock.timers.tick(SLOW_AFTER_MS * 2);
  assert.equal(said, 0);
  mock.timers.reset();
});
