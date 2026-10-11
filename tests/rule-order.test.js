import { test } from "node:test";
import assert from "node:assert/strict";

const { limitsTheCode } = await import("../src/lib/ruleOrder.js");

const limits = (statement) => limitsTheCode({ statement });

test("a rule that forbids, restricts or confines limits the code", () => {
  for (const statement of [
    "`AIReviewService` may not depend on `LlmAgentClient`",
    "AIReviewService may not depend on LlmAgentClient",
    "nothing in dolphinscheduler-extract/dolphinscheduler-extract-base may depend on dolphinscheduler-common",
    "Nothing in `checkout.web` depends on `checkout.store`",
    "Nothing outside `billing.providers` implements `PaymentGateway`",
    "anything outside `core` may only depend on `api`",
    "Only `checkout.store` depends on `org.hibernate`",
    "`Line` is internal to its module",
    "Every class in `billing.providers` implements `PaymentGateway`",
    "`core` must not depend on itself, directly or through others",
    "no dependency of any `web` class may reach `db`",
  ]) {
    assert.equal(limits(statement), true, statement);
  }
});

test("a rule that states what the code has does not", () => {
  for (const statement of [
    "RectangularSection has `Xi`",
    "MantisStream has a `source` method",
    "`FlowEngine` depends on `FlowExecutor`",
    "`Every` implements `Chainable`",
    "`SecretProviderFactory` extends `Factory`",
    "`Cache` must keep its `id` field",
  ]) {
    assert.equal(limits(statement), false, statement);
  }
});

test("code names are never read as the words of a limit, quoted or not", () => {
  assert.equal(limits("`Only` has a `get` method"), false);
  assert.equal(limits("NoOp has a run method"), false);
  assert.equal(limits("OnlyOnce depends on Never.Mind"), false);
  assert.equal(limits(""), false);
  assert.equal(limits(undefined), false);
});
