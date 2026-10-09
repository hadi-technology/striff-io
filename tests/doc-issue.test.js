import test from "node:test";
import assert from "node:assert/strict";
import { brokenRulePrompt, issueUrl, staleNameIssueUrl, staleNamePrompt } from "../src/components/docIssue.ts";

const absent = {
  name: "org.eolang.parser.Program",
  state: "ABSENT",
  sentence: "The class `org.eolang.parser.Program` is responsible for making XSLT transformations.",
  sourceLine: 108,
  historicalPath: "eo-parser/src/main/java/org/eolang/parser/Program.java",
  movedToNamespace: null,
  movedToPath: null,
  removedByUrl: "https://github.com/objectionary/eo/commit/2a992cc",
  removedByMessage: "#184 Program and Pack removed",
};

test("a prompt for a name the code lacks checks first, edits docs only and opens a pull request", () => {
  const prompt = staleNamePrompt("objectionary", "eo", "eo-maven-plugin/README.md", absent, "master");

  assert.match(prompt, /objectionary\/eo \(branch `master`\)/);
  assert.match(prompt, /`eo-maven-plugin\/README\.md`, line 108/);
  assert.match(prompt, /> The class org\.eolang\.parser\.Program is responsible/);
  assert.match(prompt, /removed by https:\/\/github\.com\/objectionary\/eo\/commit\/2a992cc/);
  assert.match(prompt, /Search the current tree for `Program` as an exact token/);
  assert.match(prompt, /report that the finding is wrong/);
  assert.match(prompt, /Do not recreate the type/);
  assert.match(prompt, /Edit documentation only/);
  assert.doesNotMatch(prompt, /pull request|push|fork|remote|Striff \(https/i);
});

test("a prompt for a renamed name says what to write instead", () => {
  const prompt = staleNamePrompt("yegor256", "takes", "README.md",
    { ...absent, name: "org.takes.rs.RsJSON", state: "RENAMED", renamedTo: "RsJson",
      renamedToPath: "src/main/java/org/takes/rs/RsJson.java" }, "master");

  assert.match(prompt, /Replace `RsJSON` with `RsJson`/);
  assert.doesNotMatch(prompt, /Do not recreate the type/);
});

test("the issue link opens on the repository's default branch", () => {
  const url = new URL(staleNameIssueUrl("objectionary", "eo", "eo-maven-plugin/README.md", absent, "master"));

  assert.equal(url.pathname, "/objectionary/eo/issues/new");
  assert.match(url.searchParams.get("body"), /blob\/master\/eo-maven-plugin\/README\.md#L108/);
  assert.match(url.searchParams.get("body"),
    /Opened from the \[Striff dashboard\]\(https:\/\/striff\.io\/\?utm_source=github/);
});

test("a prompt for a broken rule checks first and changes no code on its own", () => {
  const prompt = brokenRulePrompt("acme", "checkout-service", "ARCHITECTURE.md", {
    statement: "nothing in web may depend on store",
    quote: "Controllers never reach the store directly.",
    sourceLine: 12,
    status: "VIOLATED",
    pullNo: "427",
    judgedAtMs: null,
    onDefaultBranch: "BROKEN",
  }, "main");

  assert.match(prompt, /`ARCHITECTURE\.md`, line 12/);
  assert.match(prompt, /> Controllers never reach the store directly\./);
  assert.match(prompt, /kept this rule before pull request #427 and not after/);
  assert.match(prompt, /report that the finding is wrong/);
  assert.match(prompt, /Read pull request #427/);
  assert.match(prompt, /Edit documentation only/);
  assert.match(prompt, /do not change any code/);
  assert.doesNotMatch(prompt, /open a pull request|push|fork|remote/i);
});

test("a stale name's issue ends with a hidden line naming the doc and the name", () => {
  const body = new URL(staleNameIssueUrl("objectionary", "eo", "eo-maven-plugin/README.md", absent, "master"))
    .searchParams.get("body");

  assert.ok(body.endsWith("<!-- striff:finding stale-name:eo-maven-plugin/README.md:org.eolang.parser.Program -->"), body);
});

test("a rule's issue ends with a hidden line naming the rule, and keeps its title", () => {
  const url = new URL(issueUrl("acme", "checkout-service", "ARCHITECTURE.md", {
    factId: "ARCHITECTURE.md|3f9a12c4be01",
    statement: "Nothing in `web` depends on `store`",
    quote: "Controllers never reach the store directly.",
    sourceLine: 12,
    status: "VIOLATED",
    pullNo: "427",
    judgedAtMs: null,
    onDefaultBranch: "BROKEN",
  }, "main"));

  assert.ok(url.searchParams.get("body").endsWith("<!-- striff:finding rule:ARCHITECTURE.md|3f9a12c4be01 -->"));
  assert.equal(url.searchParams.get("title"), "Docs and code disagree: Nothing in web depends on store");
});

test("a rule with no identity gets no hidden line", () => {
  const url = new URL(issueUrl("acme", "checkout-service", "ARCHITECTURE.md", {
    statement: "Nothing in `web` depends on `store`", quote: null, sourceLine: null, status: "VIOLATED",
    pullNo: null, judgedAtMs: null, onDefaultBranch: null,
  }, "main"));

  assert.doesNotMatch(url.searchParams.get("body"), /striff:finding/);
});

test("a stale name's issue keeps its title shape", () => {
  const url = new URL(staleNameIssueUrl("objectionary", "eo", "eo-maven-plugin/README.md", absent, "master"));

  assert.equal(url.searchParams.get("title"),
    "Stale name in eo-maven-plugin/README.md: org.eolang.parser.Program is gone");
});
