---
title: "The architecture review checklist: catching structural risk in a pull request, by hand"
description: "A checklist for reviewing pull requests for architectural risk: what your own docs already decided, new dependency directions, reaches into module internals, blast radius and cycles. With an honest accounting of which steps a machine can take off you and which it cannot."
date: 2026-08-12
category: "Architecture"
---

Most review checklists cover correctness, tests, and style. Almost none cover the thing that actually degrades a codebase over years: **structure.** Which new dependencies a change creates, what they point at, and whether the system still matches what its own documentation says about it.

This is the checklist we wish every team had. It is fully manual: everything below can be done with an IDE, a search box, and patience. At the end we are honest about how much patience, and about which steps can be handed to a machine and which cannot.

## The checklist

Work through this on any change that adds imports, moves code, or touches shared components. In practice, that is most non-trivial changes.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Structural review, step by step</p>
<div class="bp-checklist">
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">1. List the components, not the files</p><p class="bp-check-desc">From the diff, write down every class or module touched and every <em>new import</em>. You are building a mental mini-graph: nodes and new edges. Files are how the diff is displayed; components are what the architecture is made of.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">2. Read what your docs already say about them</p><p class="bp-check-desc">Open the README, the architecture notes, the ADRs and the agent instruction files (<code>AGENTS.md</code>, <code>CLAUDE.md</code>) that describe the components on your list. For every sentence that names one of them (where it lives, what it calls, what it must never depend on), ask whether it is still true after this change. This is the highest-value step on the list and the one skipped most reliably, because the sentence that just became false sits in a file the diff does not contain.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">3. Check each new edge's direction</p><p class="bp-check-desc">For every new import: which package depends on which, and is that direction consistent with your layering? Core importing from a plugin, domain importing from infrastructure, shared utilities importing from a feature: each is one line in the diff and a boundary inversion in the graph.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">4. Ask whether the target was meant to be reachable</p><p class="bp-check-desc">Even when the direction is right, is the thing being imported part of that module's <em>public</em> surface, or one of its internals? A reach past a module's front door is how two modules stop being two modules.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">5. Measure the blast radius of modified contracts</p><p class="bp-check-desc">For every changed public interface, base class, or widely used type: find usages and <em>count</em>. A three-line change to something with twelve dependents is a bigger event than a five-hundred-line change to a leaf. Say the number out loud in the review.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">6. Hunt for cycles, including near-cycles</p><p class="bp-check-desc">For each new edge A → B, ask: is there any existing path from B back to A? If yes, this change closes a cycle. If a path gets within one hop, it plants a near-cycle seed. Flag it now, while the fix is one comment.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">7. Ask the trend question</p><p class="bp-check-desc">Is this the second or third change nudging the same component in the same direction? One convenient import is an exception; three are a new architecture nobody decided on. This is the step that catches drift, and the one that needs memory rather than analysis.</p></div></div>
</div>
<p class="bp-figure-caption">Steps 1, 3 and 4 need only the diff and the repository. Steps 2, 5, 6 and 7 need the <em>rest of the system</em>: every document nobody opened, every file the change did not touch, and in step 7, every previous change. That is exactly why they are the ones that get skipped under deadline.</p>
</div>

## What step 2 looks like on a real pull request

Step 2 sounds like diligence. It is really a search problem, and a real example shows why.

Ericsson's ecChronos documents its `core.impl` module class by class. Line 136 of that module's README says that `NodeWorker` *"Calls `RepairScheduler.putConfigurations()` to keep jobs up to date."* Pull request [#1786](https://github.com/Ericsson/ecchronos/pull/1786) touched 27 files and, along the way, handed that call to `SchemaRefresher`. After it, `NodeWorker` does not reference `RepairScheduler` at all.

A reviewer working from the diff sees `NodeWorker.java` lose one field and gain another, which is a clean refactor. Nothing in the diff says that a README in another directory now describes the old design. Finding that out means knowing the sentence exists, which means having read every document that mentions every class on your step 1 list. The pull request merged, and at the time of writing the README still says it. [The full story, and how it was caught, is here](/blog/design-docs-are-enforceable-now).

## The cheat sheet

The compressed version, for pinning next to your review queue:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Signal → question → red flag</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>You see in the diff</th><th>You ask</th><th>Red flag</th></tr></thead>
<tbody>
<tr><td>A change to a component your docs describe</td><td>Does any sentence about it now read false?</td><td>The doc and the code disagree, and the doc is what the next reader, or agent, will believe</td></tr>
<tr><td>A new import</td><td>Which way does this edge point?</td><td>Toward a plugin, a feature, or anything "above" the importer</td></tr>
<tr><td>An import of something named <code>internal</code>, <code>impl</code>, or similar</td><td>Was this meant to be reachable from here?</td><td>A module's internals being consumed from outside it</td></tr>
<tr><td>A moved class, or work moved between classes</td><td>What do its dependents import now, and which docs still describe the old home?</td><td>Dependents reaching across a boundary to follow it, or a doc describing a design that is gone</td></tr>
<tr><td>A changed interface or base class</td><td>How many dependents? (Count them.)</td><td>A double-digit count on a "trivial" change</td></tr>
<tr><td>A new edge A → B</td><td>Does any path lead from B back to A?</td><td>Yes (cycle), or almost (near-cycle)</td></tr>
<tr><td>A tiny diff on a core component</td><td>What is the blast radius?</td><td>Small diffs on high fan-in nodes hide the biggest surprises</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Every row here is something that happens in ordinary, well-reviewed pull requests. The first is the one this post opened with: <a href="/blog/design-docs-are-enforceable-now">a README still crediting a class with work a refactor took away from it</a>.</p>
</div>

## The honest math

Now the part most checklist posts skip. Suppose a competent structural pass, done honestly, takes fifteen to thirty minutes on a non-trivial change. At twenty minutes average:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Manual structural review, minutes per day</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">5 pull requests/day</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:12%"></div></div><span class="bp-bar-value">~100 min</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">15 pull requests/day</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:37%"></div></div><span class="bp-bar-value">~300 min</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">40 pull requests/day</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:100%"></div></div><span class="bp-bar-value">~800 min</span></div>
</div>
<p class="bp-figure-caption">Arithmetic, not a study: count × twenty minutes, and the twenty is our estimate, not a measurement. Three hundred minutes is five senior-engineer hours a day, and it lands on your most senior people, because they are the only ones holding enough of the documents and the graph in their heads to do steps 2 and 5 to 7 at all.</p>
</div>

This is why "we will just review more carefully" fails as a strategy at [current shipping volume](/blog/architecture-matters-more-not-less). The checklist is sound; the budget does not exist. Teams do not skip structural review because they do not care. They skip it because it is the only review activity whose cost scales with the size of the *codebase* rather than the size of the *diff*.

## Which steps a machine can take, and which it cannot

Be suspicious of anyone who tells you all seven are automatable. Here is the honest split:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Mechanical, and not</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Step</th><th>Automatable?</th><th>Why</th></tr></thead>
<tbody>
<tr><td>1. List components and new edges</td><td><span class="bp-yes">✓ Fully</span></td><td>Parsing two revisions and diffing the graph is exactly a computer's job.</td></tr>
<tr><td>2. Contradicting your own docs</td><td><span class="bp-yes">✓ Mostly</span></td><td>A sentence that names real components and says where they live or what they depend on can be turned into a query and run at both revisions. A sentence about intent, taste or process cannot, and should be left out rather than guessed at.</td></tr>
<tr><td>3. Edge direction, first-ever crossings</td><td><span class="bp-yes">✓ Fully</span></td><td>"Has this direction existed before" is a lookup, not a judgment.</td></tr>
<tr><td>4. Reaching into internals</td><td><span class="bp-yes">✓ Fully</span></td><td>Module layout is in the repository; the comparison is mechanical.</td></tr>
<tr><td>5. Blast radius of a changed contract</td><td><span class="bp-yes">✓ Fully</span></td><td>Counting dependents is counting. Deciding whether twelve is acceptable is yours.</td></tr>
<tr><td>6. Cycles and near-cycles</td><td><span class="bp-yes">✓ Fully</span></td><td>Path-finding over a graph. The only hard part is having the graph.</td></tr>
<tr><td>7. The trend question</td><td><span class="bp-no">✗ Not really</span></td><td>"Is this the third change pushing the same way" needs a judgment about whether three instances make a direction. Tools can show you history; deciding it is a pattern is a human call, and pretending otherwise generates noise.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The split is not about difficulty. Steps 1 and 3 to 6 have a right answer a program can compute. Step 2 has one for every sentence that is actually about structure, and that is most of them: in a scan of 74 public pull requests, 1,394 of the 1,912 rules read out of their docs could be answered from the parsed code. Step 7 does not have a right answer.</p>
</div>

<div class="bp-callout bp-callout--mint"><strong>Use the checklist either way.</strong> If it gets your team to do even steps 1 to 3 on risky changes, this post did its job. But notice which parts are mechanical: building the graph, counting dependents, tracing paths, re-reading the doc nobody re-reads. Mechanical work is what computers are for; the judgment about whether the answer is acceptable stays where it belongs.</div>

Step 2 is the one we automate. The sentences in your own documentation are read as rules and [checked at both revisions of every pull request](/blog/design-docs-are-enforceable-now), and every pull request gets a diagram of the components it touched and how they connect, which is most of step 1 done before you open the diff. If your layering matters, write it down (*"`domain` does not depend on `infrastructure`"*) and step 3 is checked for that rule on every change too. On most pull requests nothing breaks a rule, and the check lists what it looked at. [Install the GitHub App](https://github.com/apps/striff-app/installations/new) and keep the rest of the checklist for the steps that need you.
