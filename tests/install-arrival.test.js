import { test } from "node:test";
import assert from "node:assert/strict";

const { arrivalRequest } = await import("../netlify/functions/install-arrival.js");

test("a body of the right shape becomes the API's camel-cased payload", () => {
  assert.deepEqual(
    arrivalRequest({ installation_id: "123", state: "report_card:acme/widgets", first_source: "email", visit_source: null }),
    { installationId: "123", payload: { state: "report_card:acme/widgets", firstSource: "email" } }
  );
  assert.deepEqual(arrivalRequest({ installation_id: 5 }), { installationId: "5", payload: {} });
});

test("a body that does not fit is refused", () => {
  assert.equal(arrivalRequest(null), null);
  assert.equal(arrivalRequest({ installation_id: "12a" }), null);
  assert.equal(arrivalRequest({ installation_id: "../1" }), null);
  assert.equal(arrivalRequest({ installation_id: "1", state: "has space" }), null);
  assert.equal(arrivalRequest({ installation_id: "1", first_source: "x".repeat(101) }), null);
  assert.equal(arrivalRequest({ installation_id: "1", visit_source: 7 }), null);
});
