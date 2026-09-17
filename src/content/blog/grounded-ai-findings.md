---
title: "Every Striff finding comes with a receipt"
description: "AI review comments are easy to write and hard to trust. What a Striff check on your pull request actually says, where each line of it comes from, and how to verify any of it yourself in under a minute."
date: 2026-08-24
category: "Product"
cover: "receipt"
---

Most developers have the same experience with AI code review. The comments sound right. Some of them are right. You cannot tell which without redoing the analysis yourself, so after a few weeks you stop reading them.

A better prompt does not fix that, because the problem is not how the model writes. It is that the model's opinion *is* the finding, and there is nothing underneath it to check. So Striff works the other way round, with one rule we hold everything to:

<div class="bp-callout"><strong>The AI is never the source of a claim.</strong> Every statement in a Striff check is either a sentence quoted from your own docs, with its file and line, or a fact computed from your code at the two revisions of the pull request. A language model reads the docs and writes the sentences. It never decides what is true.</div>

Here is what that looks like from your side of the pull request.

## What lands on your pull request

When you open a pull request in a repository with Striff installed, a check appears beside your CI. It has four parts, the same four you can see [on the homepage](/#report):

- **A review summary.** A few sentences on what the change does structurally: what gained or lost a dependency, what public surface moved.
- **Top review items.** Only the things worth your attention, which in practice means places where the change contradicts your own documentation.
- **Documented rules.** Every rule from your docs that Striff could check, each with the sentence it came from and whether this change kept it or broke it.
- **A diagram of the change.** The classes the pull request touched, what they gained and lost, and how they connect.

None of it needs configuring. The rules come from the READMEs, ADRs, `ARCHITECTURE.md` and agent instruction files already in the repository.

## Who decides what

A check is built in four steps. Two use a language model, and neither of those can put a finding in front of you:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Where the language model is allowed in</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Step</th><th>Done by</th><th>Can it add a finding?</th></tr></thead>
<tbody>
<tr><td>Parse both revisions of your code</td><td>A parser, the way a compiler would</td><td><span class="bp-no">✗</span> It produces the facts everything else is checked against.</td></tr>
<tr><td>Read your docs and propose rules</td><td>Language model</td><td><span class="bp-no">✗</span> It only proposes. A rule that names a class or package your code does not contain is thrown away before it is ever checked, so the model cannot invent a violation by inventing a name.</td></tr>
<tr><td>Check each rule at the base and the head</td><td>A program</td><td><span class="bp-yes">✓</span> This is the only step that produces a verdict. Only a rule that held before the change and fails after it counts against the change.</td></tr>
<tr><td>Write the summary and the notes</td><td>Language model</td><td><span class="bp-no">✗</span> It phrases what was computed. A sentence that asserts something the comparison did not find is dropped, and the computed statement is shown instead.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The model proposes and the program decides. When the model gets something wrong, the mistake has to contradict the code or the docs it was given, which a program can catch. You do not have to.</p>
</div>

This also means that when Striff is wrong, it is wrong the way ordinary software is wrong. A bad verdict traces back to a sentence, a rule and two parsed facts, so it can be reproduced, fixed and tested. There is no equivalent for "the model felt confident".

[Ericsson's ecChronos #1786](/blog/design-docs-are-enforceable-now) is the walkthrough of one such finding end to end: the doc sentence, the rule it became, and the two lookups in the public commit history that anyone can redo themselves in under a minute. This post is about the mechanism that makes that walkthrough trustworthy; that one is about the specific pull request.

## What it will not tell you

Being true is not enough to earn a line in your check. The bar is one question: *does the reviewer already know this from the diff or the diagram?*

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">True, and still not a finding</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Candidate</th><th>True?</th><th>In your check?</th></tr></thead>
<tbody>
<tr><td>"This pull request adds an import"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> It is a line of the diff. Restating the diff is not analysis.</td></tr>
<tr><td>"Coupling on this class went up by 4"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> The number is on the class in the diagram. On its own it implies no action. <a href="/blog/afferent-efferent-coupling-explained">Why a coupling delta is not a finding</a>.</td></tr>
<tr><td>"This package now depends on that one", when your docs say nothing about either</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> Possibly exactly what you intended. With no rule your team wrote down, a tool can only guess, so the new edge is drawn on the diagram instead.</td></tr>
<tr><td>"This change made a sentence in your README false"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-yes">✓</span> It needs your docs and the code at both revisions. The diff contains neither, which is why nobody caught it.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">There is no battery of generic heuristics grading the shape of your code. A rule nobody on your team wrote down is a rule nobody on your team agreed to. If you want something checked, write it in your docs.</p>
</div>

## It only reports what it can verify

The other half of not making things up is not *implying* things. A pass/fail check can put "we looked and it is fine" and "we could not look" behind the same green tick, and a green tick is exactly what a reviewer trusts. Striff does not do that. It is a best-effort check: a rule it cannot answer from the code is left out of the results, never shown as passing. Every rule it does report has one of four outcomes:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every rule it reports is one of four</p>
<div class="bp-outcomes">
<div class="bp-outcome bp-outcome--danger"><p class="bp-outcome-name">Violated</p><p class="bp-outcome-desc">Held before this change, fails after it. The only outcome blamed on the pull request.</p></div>
<div class="bp-outcome bp-outcome--amber"><p class="bp-outcome-name">Already broken</p><p class="bp-outcome-desc">Broken in the code Striff checked, not by this change. Shown on its own line, never blamed on the author, and never passed off as a pass.</p></div>
<div class="bp-outcome bp-outcome--mint"><p class="bp-outcome-name">Held</p><p class="bp-outcome-desc">This change keeps it: nothing in this pull request breaks it. It is not a claim about the rest of the codebase.</p></div>
<div class="bp-outcome bp-outcome--brand"><p class="bp-outcome-name">Restored</p><p class="bp-outcome-desc">Broken before, true after: the change fixed something the docs promised.</p></div>
</div>
<p class="bp-figure-caption">A source parser sees less than a compiler: no generated methods, no annotations, no reflection. Say your docs mention <code>Order.total()</code> and <code>Order</code> is a Java record. The compiler generates <code>total()</code>, so the parser never sees it. "The method is missing" would be false, and "the rule held" would be a guess. So Striff says neither, and leaves that rule out.</p>
</div>

That makes Striff best-effort by design. It can miss a rule a compiler would have answered. What it will not do is tell you a rule held when it could not see whether it did.

## What you get out of it

Fewer comments, and every one of them checkable. In [the largest public window we've measured so far](/blog/design-docs-are-enforceable-now), that quietness held up at scale rather than being an artifact of a small sample. When a check that quiet says something, it is worth reading, and you can verify it faster than you could argue with it.

It also changes what your docs are for. A sentence in your README stops being a hope and becomes a rule, checked on every pull request, whether a person or a coding agent wrote the code. [Here is how to write docs Striff can check](/blog/design-docs-are-enforceable-now#writing-docs-that-can-be-checked), though it reads the docs you already have without any changes.

## Try it on a pull request you know

The quickest test is a pull request whose history you already know, so you can judge every line of the check yourself.

- **Your public repositories are free.** [Install the GitHub App](https://github.com/apps/striff-app/installations/new) and open a pull request. Rules, diagram and review notes, on every PR.
- **Someone else's public pull request.** The [free Chrome extension](/#extension) shows the same review in a tab beside Files changed, without installing anything on the repository.
- **Private repositories** start at $29 a month. [See pricing](/pricing).
