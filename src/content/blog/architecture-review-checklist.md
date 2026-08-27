---
title: "The architecture review checklist: catching structural risk in a pull request, by hand"
description: "A tool-agnostic checklist for reviewing pull requests for architectural risk — new dependency directions, blast radius, module internals, cycles, and the decisions your own docs already made. Plus the free tools that cover parts of it, and an honest accounting of which steps a machine can take off you and which it cannot."
date: 2026-08-12
---

Most review checklists cover correctness, tests, and style. Almost none cover the thing that actually degrades a codebase over years: **structure.** Which new dependencies a change creates, what they point at, and what that does to the shape of the system.

This is the checklist we wish every team had. It is tool-agnostic and fully manual: everything below can be done with an IDE, `grep`, and patience. At the end we are honest about how much patience, and about which steps can be handed to a machine and which cannot.

## The checklist

Work through this on any change that adds imports, moves code, or touches shared components — which, in practice, is most non-trivial changes.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Structural review, step by step</p>
<div class="bp-checklist">
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">1. List the components, not the files</p><p class="bp-check-desc">From the diff, write down every class or module touched and every <em>new import</em>. You are building a mental mini-graph: nodes and new edges. Files are how the diff is displayed; components are what the architecture is made of.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">2. Check each new edge's direction</p><p class="bp-check-desc">For every new import: which package depends on which, and is that direction consistent with your layering? Core importing from a plugin, domain importing from infrastructure, shared utilities importing from a feature — each is one line in the diff and a boundary inversion in the graph.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">3. Ask whether the target was meant to be reachable</p><p class="bp-check-desc">Even when the direction is right, is the thing being imported part of that module's <em>public</em> surface, or one of its internals? A reach past a module's front door is how two modules stop being two modules.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">4. Measure the blast radius of modified contracts</p><p class="bp-check-desc">For every changed public interface, base class, or widely-used type: find-usages and <em>count</em>. A three-line change to something with twelve dependents is a bigger event than a five-hundred-line change to a leaf. Say the number out loud in the review.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">5. Hunt for cycles, including near-cycles</p><p class="bp-check-desc">For each new edge A → B, ask: is there any existing path from B back to A? If yes, this change closes a cycle. If a path gets within one hop, it plants a <a href="/blog/package-dependency-cycles">near-cycle seed</a>. Flag it now, while the fix is one comment.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">6. Check it against what you already wrote down</p><p class="bp-check-desc">Open the ADR, the ARCHITECTURE.md, the README section that covers this area. Does the change contradict a sentence in it? This is the highest-value check on the list and the one skipped most reliably, because it means reading a file that is not in the diff.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">7. Ask the trend question</p><p class="bp-check-desc">Is this the second or third change nudging the same component in the same direction? One convenient import is an exception; three are a new architecture nobody decided on. This is the check that catches drift, and the one that requires memory rather than analysis.</p></div></div>
</div>
<p class="bp-figure-caption">Steps 1 to 3 need only the diff and the repository. Steps 4 to 7 need the <em>rest of the system</em> — every file the change did not touch, every document nobody opened, and in step 7, every previous change. Which is exactly why they are the ones that get skipped under deadline.</p>
</div>

## The cheat sheet

The compressed version, for pinning next to your review queue:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Signal → question → red flag</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>You see in the diff</th><th>You ask</th><th>Red flag</th></tr></thead>
<tbody>
<tr><td>A new import</td><td>Which way does this edge point?</td><td>Toward a plugin, a feature, or anything "above" the importer</td></tr>
<tr><td>An import of something named <code>internal</code>, <code>impl</code>, or similar</td><td>Was this meant to be reachable from here?</td><td>A module's internals being consumed from outside it</td></tr>
<tr><td>A moved class</td><td>What do its dependents import now?</td><td>Dependents now reaching across a boundary to follow it</td></tr>
<tr><td>A changed interface or base class</td><td>How many dependents? (Count them.)</td><td>A double-digit count on a "trivial" change</td></tr>
<tr><td>A new edge A → B</td><td>Does any path lead from B back to A?</td><td>Yes (cycle), or almost (near-cycle)</td></tr>
<tr><td>A change in an area your docs describe</td><td>Does any sentence there now read false?</td><td>The doc and the code disagree, and only the doc will be believed</td></tr>
<tr><td>A tiny diff on a core component</td><td>What is the blast radius?</td><td>Small diffs on high fan-in nodes hide the biggest surprises</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Every row here corresponds to something we have watched happen in <a href="/blog/architectural-findings-in-oss">real open-source pull requests</a>: a public interface losing a method twelve things depend on, a first-ever edge between two packages, a README describing methods that no longer exist.</p>
</div>

## Free tools that cover part of it

You can automate slices of this today, with no budget:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The DIY toolbox</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Ecosystem</th><th>See the graph / find cycles</th><th>Enforce boundaries you can name in advance</th></tr></thead>
<tbody>
<tr><td>Java / JVM</td><td><code>jdeps</code> (ships with the JDK)</td><td><a href="https://www.archunit.org/" target="_blank" rel="noopener">ArchUnit</a> rules in your test suite</td></tr>
<tr><td>JS / TypeScript</td><td><a href="https://github.com/pahen/madge" target="_blank" rel="noopener">madge</a> <code>--circular</code></td><td><a href="https://github.com/sverweij/dependency-cruiser" target="_blank" rel="noopener">dependency-cruiser</a></td></tr>
<tr><td>Python</td><td><a href="https://github.com/thebjorn/pydeps" target="_blank" rel="noopener">pydeps</a></td><td><a href="https://github.com/seddonym/import-linter" target="_blank" rel="noopener">import-linter</a> contracts</td></tr>
<tr><td>.NET</td><td>IDE dependency diagrams</td><td><a href="https://github.com/BenMorris/NetArchTest" target="_blank" rel="noopener">NetArchTest</a></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Rule-enforcement tools are genuinely worth adopting; they lock in the boundaries you already know about. Their two limits: someone has to write each rule in advance and keep it in sync, and they answer about the codebase rather than about <em>this change</em> — a cycle that already existed and a cycle this pull request just closed look identical to them.</p>
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
<p class="bp-figure-caption">Arithmetic, not a study: count × twenty minutes, and the twenty is our estimate, not a measurement. Three hundred minutes is five senior-engineer hours a day, and it lands on your most senior people, because they are the only ones holding enough of the graph in their heads to do steps 4 to 7 at all.</p>
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
<tr><td>2. Edge direction, first-ever crossings</td><td><span class="bp-yes">✓ Fully</span></td><td>"Has this direction existed before" is a lookup, not a judgment.</td></tr>
<tr><td>3. Reaching into internals</td><td><span class="bp-yes">✓ Fully</span></td><td>Module layout is in the repository; the comparison is mechanical.</td></tr>
<tr><td>4. Blast radius of a changed contract</td><td><span class="bp-yes">✓ Fully</span></td><td>Counting dependents is counting. Deciding whether twelve is acceptable is yours.</td></tr>
<tr><td>5. Cycles and near-cycles</td><td><span class="bp-yes">✓ Fully</span></td><td>Path-finding over a graph. The only hard part is having the graph.</td></tr>
<tr><td>6. Contradicting your own docs</td><td><span class="bp-yes">✓ Mostly</span></td><td>A sentence that names real components and asserts a structural relation can be turned into a query and run. A sentence about intent, taste, or process cannot, and should not be guessed at.</td></tr>
<tr><td>7. The trend question</td><td><span class="bp-no">✗ Not really</span></td><td>"Is this the third change pushing the same way" needs a judgment about whether three instances constitute a direction. Tools can show you history; deciding it is a pattern is a human call, and pretending otherwise generates noise.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The split is not about difficulty. Steps 1 to 5 have a right answer that a program can compute. Step 6 has a right answer for the subset of sentences that are actually about structure. Step 7 does not have one.</p>
</div>

<div class="bp-callout bp-callout--mint"><strong>Use the checklist either way.</strong> If it gets your team to do even steps 1 to 3 on risky changes, this post did its job. But notice which parts are mechanical — building the graph, counting dependents, tracing paths, re-reading the doc nobody re-reads. Mechanical work is what computers are for; the judgment about whether the number is acceptable stays where it belongs.</div>

That mechanical half is what we automate: both revisions parsed into a component graph, compared, and checked — against structural questions the diff cannot answer, and against the [rules already written in your own documentation](/blog/design-docs-are-enforceable-now). On most pull requests it will report clean and tell you what it looked at. [Install it](https://github.com/apps/striff-app/installations/new) and run the checklist on your next one in about half a minute.
