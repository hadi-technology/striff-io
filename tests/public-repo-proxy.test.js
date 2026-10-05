import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";
const { apiPathFor, handler } = await import("../netlify/functions/public-repo-proxy.js");

const realFetch = globalThis.fetch;
let asked;

beforeEach(() => {
  asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("each view the page reads maps to its API path", () => {
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets" }), "/api/v1/public-repos/acme/widgets");
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets", view: "checks", page: "2" }),
    "/api/v1/public-repos/acme/widgets/checks?page=2");
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets", view: "catalog" }),
    "/api/v1/public-repos/acme/widgets/doc-catalog");
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets", view: "rules" }),
    "/api/v1/public-repos/acme/widgets/doc-catalog/rules");
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets", view: "type-findings" }),
    "/api/v1/public-repos/acme/widgets/doc-catalog/type-findings");
  assert.equal(apiPathFor({ owner: "acme", repo: "widgets", view: "doc", path: "docs/a b.md", version: "abc123" }),
    "/api/v1/public-repos/acme/widgets/doc-catalog/doc?path=docs%2Fa+b.md&version=abc123");
});

test("a name no repository could have, or a view the page does not read, goes nowhere", () => {
  for (const params of [
    { owner: "../..", repo: "widgets" },
    { owner: "acme", repo: ".." },
    { owner: "acme", repo: "a/b" },
    { owner: "-acme", repo: "widgets" },
    { owner: "acme" },
    { owner: "acme", repo: "widgets", view: "exclusions" },
    { owner: "acme", repo: "widgets", view: "__proto__" },
    { owner: "acme", repo: "widgets", view: "checks", page: "-1" },
    { owner: "acme", repo: "widgets", view: "doc" },
    { owner: "acme", repo: "widgets", view: "doc", path: "a.md", version: "../x" },
  ]) {
    assert.equal(apiPathFor(params), null, JSON.stringify(params));
  }
});

test("a read is forwarded with the server key and kept for a minute", async () => {
  const res = await handler({ httpMethod: "GET", queryStringParameters: { owner: "acme", repo: "widgets", view: "catalog" } });

  assert.equal(res.statusCode, 200);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, "https://api.example/api/v1/public-repos/acme/widgets/doc-catalog");
  assert.equal(asked[0].init.headers["X-Server-Key"], "server-key");
  assert.equal(res.headers["Cache-Control"], "public, max-age=60");
  assert.equal(res.headers["X-Robots-Tag"], "noindex");
});

test("a refusal is passed on and never kept", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });

  const res = await handler({ httpMethod: "GET", queryStringParameters: { owner: "acme", repo: "private" } });

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("nothing but a read is forwarded", async () => {
  for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
    const res = await handler({ httpMethod: method, queryStringParameters: { owner: "acme", repo: "widgets" } });
    assert.equal(res.statusCode, 405);
  }
  const bad = await handler({ httpMethod: "GET", queryStringParameters: { owner: "acme", repo: "..", view: "catalog" } });
  assert.equal(bad.statusCode, 404);
  assert.equal(asked.length, 0);
});

test("an API that cannot be reached is a 502, not an empty page", async () => {
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };

  const res = await handler({ httpMethod: "GET", queryStringParameters: { owner: "acme", repo: "widgets" } });

  assert.equal(res.statusCode, 502);
});

