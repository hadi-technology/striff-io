import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.STRIFF_SERVER_KEY = "server-key";
process.env.STRIFF_API_BASE_URL = "https://api.example";
const { repoFromPath, apiPathFor, handler } = await import("../netlify/functions/badge.js");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><title>docs: 42 rules held</title></svg>';
const realFetch = globalThis.fetch;
const realLog = console.log;
let asked;
let logged;

beforeEach(() => {
  asked = [];
  logged = [];
  console.log = (line) => logged.push(line);
  globalThis.fetch = async (url, init) => {
    asked.push({ url, init });
    return new Response(SVG, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300, s-maxage=600", ETag: '"abc"' },
    });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

const get = (path, query = {}, headers = {}) =>
  handler({ httpMethod: "GET", path, queryStringParameters: query, headers });

test("the repository is read from the address as asked and as rewritten", () => {
  assert.deepEqual(repoFromPath("/badge/acme/widgets.svg"), { owner: "acme", name: "widgets" });
  assert.deepEqual(repoFromPath("/.netlify/functions/badge/acme/widgets.svg"), { owner: "acme", name: "widgets" });
  assert.deepEqual(repoFromPath("/badge/acme/my.lib.svg"), { owner: "acme", name: "my.lib" });
});

test("an address no repository could have names none", () => {
  for (const path of [
    "/badge/acme/widgets",
    "/badge/acme/widgets.png",
    "/badge/widgets.svg",
    "/badge/-acme/widgets.svg",
    "/badge/acme/..svg",
    "/badge/acme/.svg",
    "/badge/ac%2Fme/widgets.svg",
    "/badge/acme/%E0%A4%A.svg",
    "",
    undefined,
  ]) {
    assert.equal(repoFromPath(path), null, String(path));
  }
});

test("style, label and token are passed on only when the API could use them", () => {
  const repo = { owner: "acme", name: "widgets" };
  assert.equal(apiPathFor(repo, {}), "/api/v1/public-repos/acme/widgets/badge?from=readme");
  assert.equal(
    apiPathFor(repo, { style: "for-the-badge", label: "striff", token: "0123abcd", preview: "1" }),
    "/api/v1/public-repos/acme/widgets/badge?style=for-the-badge&label=striff&token=0123abcd"
  );
  assert.equal(
    apiPathFor(repo, { style: "plastic", label: "x".repeat(41), token: "../etc", preview: "1" }),
    "/api/v1/public-repos/acme/widgets/badge"
  );
  assert.equal(apiPathFor(repo, { label: "a\u0007b", preview: "1" }), "/api/v1/public-repos/acme/widgets/badge");
});

test("a README's request is forwarded with the server key and marked as one", async () => {
  const res = await get("/badge/acme/widgets.svg", { style: "flat-square" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, SVG);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, "https://api.example/api/v1/public-repos/acme/widgets/badge?style=flat-square&from=readme");
  assert.equal(asked[0].init.headers["X-Server-Key"], "server-key");
  assert.equal(res.headers["Content-Type"], "image/svg+xml; charset=utf-8");
  assert.equal(res.headers["Cache-Control"], "public, max-age=300, s-maxage=600");
  assert.match(res.headers["Netlify-CDN-Cache-Control"], /s-maxage=600/);
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers.ETag, '"abc"');
  assert.deepEqual(JSON.parse(logged[0]), {
    badge: "acme/widgets",
    day: new Date().toISOString().slice(0, 10),
    readme: true,
    variant: "practice",
  });
});

test("a variant the API draws is passed on and logged; any other is dropped", async () => {
  const repo = { owner: "acme", name: "widgets" };
  for (const variant of ["practice", "count", "agent", "held"]) {
    assert.equal(apiPathFor(repo, { variant, preview: "1" }),
      `/api/v1/public-repos/acme/widgets/badge?variant=${variant}`);
  }
  assert.equal(apiPathFor(repo, { variant: "loud", preview: "1" }), "/api/v1/public-repos/acme/widgets/badge");
  assert.equal(apiPathFor(repo, { variant: "COUNT", preview: "1" }), "/api/v1/public-repos/acme/widgets/badge");
  assert.equal(
    apiPathFor(repo, { style: "flat-square", label: "striff", variant: "count", token: "0123abcd" }),
    "/api/v1/public-repos/acme/widgets/badge?style=flat-square&label=striff&variant=count&token=0123abcd&from=readme"
  );

  await get("/badge/acme/widgets.svg", { variant: "agent" });
  await get("/badge/acme/widgets.svg", { variant: "loud" });

  assert.equal(asked[0].url, "https://api.example/api/v1/public-repos/acme/widgets/badge?variant=agent&from=readme");
  assert.equal(JSON.parse(logged[0]).variant, "agent");
  assert.equal(asked[1].url, "https://api.example/api/v1/public-repos/acme/widgets/badge?from=readme");
  assert.equal(JSON.parse(logged[1]).variant, "practice");
});

test("a preview on Striff's own pages is not counted as a README", async () => {
  await get("/badge/acme/widgets.svg", { preview: "1" });

  assert.equal(asked[0].url, "https://api.example/api/v1/public-repos/acme/widgets/badge");
  assert.equal(JSON.parse(logged[0]).readme, false);
});

test("a revalidation is passed on, and an unchanged badge is answered 304", async () => {
  globalThis.fetch = async (url, init) => {
    asked.push({ url, init });
    return new Response(null, { status: 304, headers: { ETag: '"abc"' } });
  };

  const res = await get("/badge/acme/widgets.svg", {}, { "If-None-Match": '"abc"' });

  assert.equal(asked[0].init.headers["If-None-Match"], '"abc"');
  assert.equal(res.statusCode, 304);
  assert.equal(res.body, "");
  assert.equal(res.headers.ETag, '"abc"');
  assert.equal(res.headers["Cache-Control"], "public, max-age=300, s-maxage=600");
});

test("an answer the API could not settle is not kept by the CDN", async () => {
  globalThis.fetch = async () => new Response(SVG, { status: 200, headers: { "Cache-Control": "no-store", ETag: '"n"' } });

  const res = await get("/badge/acme/widgets.svg");

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.headers["Netlify-CDN-Cache-Control"], undefined);
});

test("an API that fails or cannot be reached is never kept", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 429 });
  const limited = await get("/badge/acme/widgets.svg");
  assert.equal(limited.statusCode, 503);
  assert.equal(limited.headers["Cache-Control"], "no-store");

  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const down = await get("/badge/acme/widgets.svg");
  assert.equal(down.statusCode, 503);
  assert.equal(down.headers["Cache-Control"], "no-store");
});

test("nothing but a read is answered, and a bad name never reaches the API", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const res = await handler({ httpMethod: method, path: "/badge/acme/widgets.svg" });
    assert.equal(res.statusCode, 405);
  }
  const bad = await get("/badge/acme/..svg");
  assert.equal(bad.statusCode, 404);
  assert.equal(asked.length, 0);

  const head = await handler({ httpMethod: "HEAD", path: "/badge/acme/widgets.svg", queryStringParameters: {} });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
});
