import { test } from "node:test";
import assert from "node:assert/strict";

const { classifyVisitSource, reportRepoFromPath, withInstallState } = await import("../src/lib/visitSource.js");

const visit = (href, referrer) => classifyVisitSource({ href, referrer });

test("a ref Striff writes wins over the referrer", () => {
  for (const ref of ["badge", "check", "report", "email"]) {
    assert.equal(visit(`https://striff.io/acme/widgets?ref=${ref}`, "https://github.com/acme/widgets"), ref);
  }
  assert.equal(visit("https://striff.io/acme/widgets?ref=BADGE", ""), "badge");
  assert.equal(visit("https://striff.io/dashboard?repo=acme/secret&ref=badge", ""), "badge");
});

test("a ref Striff does not write is ignored", () => {
  assert.equal(visit("https://striff.io/acme/widgets?ref=hn", ""), "direct");
  assert.equal(visit("https://striff.io/acme/widgets?ref=", "https://news.ycombinator.com/"), "external");
});

test("GitHub's pull requests, repository pages and the rest are told apart", () => {
  const here = "https://striff.io/acme/widgets";
  assert.equal(visit(here, "https://github.com/acme/widgets/pull/12"), "github_pr");
  assert.equal(visit(here, "https://github.com/acme/widgets/pull/12/files#diff-1"), "github_pr");
  assert.equal(visit(here, "https://github.com/acme/widgets"), "github_readme");
  assert.equal(visit(here, "https://github.com/acme/widgets#readme"), "github_readme");
  assert.equal(visit(here, "https://github.com/acme/widgets/blob/main/README.md"), "github_readme");
  assert.equal(visit(here, "https://github.com/acme/widgets/tree/main/docs"), "github_readme");
  assert.equal(visit(here, "https://github.com/"), "github");
  assert.equal(visit(here, "https://github.com/acme"), "github");
  assert.equal(visit(here, "https://github.com/acme/widgets/pulls"), "github");
  assert.equal(visit(here, "https://github.com/acme/widgets/issues/3"), "github");
});

test("another site is external, none is direct, and an unreadable referrer counts as none", () => {
  const here = "https://striff.io/";
  assert.equal(visit(here, "https://news.ycombinator.com/item?id=1"), "external");
  assert.equal(visit(here, "https://gist.github.com/acme/1"), "external");
  assert.equal(visit(here, ""), "direct");
  assert.equal(visit(here, null), "direct");
  assert.equal(visit(here, "not a url"), "direct");
});

test("a page reached from this site says nothing new about where the visit came from", () => {
  assert.equal(visit("https://striff.io/pricing", "https://striff.io/"), null);
  assert.equal(visit("https://striff.io/pricing?ref=email", "https://striff.io/"), "email");
});

test("a report page is /<owner>/<repo>, never one of the site's own pages", () => {
  assert.equal(reportRepoFromPath("/acme/widgets"), "acme/widgets");
  assert.equal(reportRepoFromPath("/acme/widgets/"), "acme/widgets");
  assert.equal(reportRepoFromPath("/acme/my.repo_x-1"), "acme/my.repo_x-1");
  assert.equal(reportRepoFromPath("/blog/some-post"), null);
  assert.equal(reportRepoFromPath("/contact/thanks"), null);
  assert.equal(reportRepoFromPath("/pricing"), null);
  assert.equal(reportRepoFromPath("/"), null);
  assert.equal(reportRepoFromPath("/acme/widgets/extra"), null);
  assert.equal(reportRepoFromPath("/-acme/widgets"), null);
  assert.equal(reportRepoFromPath("/acme/.."), null);
  assert.equal(reportRepoFromPath("/acme/%E0%A4%A"), null);
});

test("UTM tags on outreach links classify as email, and linkedin as linkedin", () => {
  const here = "https://striff.io/?utm_source=outreach&utm_medium=email&utm_campaign=stale_docs";
  assert.equal(visit(here, ""), "email");
  assert.equal(visit("https://striff.io/?utm_medium=EMAIL", "https://mail.google.com/"), "email");
  assert.equal(visit("https://striff.io/?utm_source=outreach", ""), "email");
  assert.equal(visit("https://striff.io/?utm_source=linkedin", ""), "linkedin");
});

test("a ref still wins over UTM tags, and other UTM tags change nothing", () => {
  assert.equal(visit("https://striff.io/?ref=badge&utm_medium=email", ""), "badge");
  assert.equal(visit("https://striff.io/?utm_source=newsletter&utm_medium=social", ""), "direct");
});

test("an install link with no state gets site.<location>; one with a state is left alone", () => {
  const link = "https://github.com/apps/striffs/installations/new";
  assert.equal(withInstallState(link, "hero"), `${link}?state=site.hero`);
  assert.equal(withInstallState(`${link}?x=1`, "pricing_card"), `${link}?x=1&state=site.pricing_card`);
  assert.equal(withInstallState(link, "How It Works!"), `${link}?state=site.how_it_works_`);
  const stated = `${link}?state=report_card%3Aacme%2Fwidgets`;
  assert.equal(withInstallState(stated, "hero"), stated);
  assert.equal(withInstallState("not a url", "hero"), "not a url");
});
