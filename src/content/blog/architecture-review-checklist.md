---
title: "The architecture review checklist: how to catch structural risk in a PR, by hand"
description: "A practical, tool-agnostic checklist for reviewing pull requests for architectural risk: new dependency directions, blast radius, layer skips, cycles, and coupling drift. Plus the free tools that help, and the honest math on what it costs."
date: 2026-05-19
---

Most code review checklists cover correctness, tests, and style. Almost none cover the thing that actually degrades codebases over years: **structure**. Which new dependencies a PR creates, what they point at, and what that does to the shape of the system.

This post is the checklist we wish every team had. It's tool-agnostic and fully manual: everything below can be done with an IDE, `grep`, and patience. (We'll be honest at the end about how much patience.)

## The checklist

Work through this on any PR that adds imports, moves code, or touches shared components, which, in practice, is most nontrivial PRs:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Structural review, step by step</p>
<div class="bp-checklist">
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">1. List the components, not the files</p><p class="bp-check-desc">From the diff, write down every class/module touched and every <em>new import</em>. You're building a mental mini-graph: nodes and new edges. Files are how the diff is displayed; components are what the architecture is made of.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">2. Check each new edge's direction</p><p class="bp-check-desc">For every new import: which package depends on which, and is that direction consistent with your layering? Core importing from a plugin, domain importing from infrastructure, shared utils importing from a feature: each is one line in the diff and a boundary inversion in the graph.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">3. Check for layer skips</p><p class="bp-check-desc">Even when the direction is right, does the edge jump past an intermediate layer (controller straight to repository, bypassing the service)? Skips are how layers erode; each one makes the next easier to justify.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">4. Measure the blast radius of modified contracts</p><p class="bp-check-desc">For every changed public interface, base class, or widely-used component: find-usages and <em>count</em>. A three-line change to something with 24 dependents is a bigger event than a 500-line change to a leaf. Say the number out loud in the review.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">5. Hunt for cycles, including near-cycles</p><p class="bp-check-desc">For each new edge A → B, ask: is there any existing path from B back to A? If yes, this PR closes a cycle. If a path gets within one hop, it plants a <a href="/blog/package-dependency-cycles">near-cycle seed</a>. Flag it now while the fix is one comment.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">6. Watch coupling drift on hot nodes</p><p class="bp-check-desc">Is this PR adding outgoing dependencies to a component that many things already depend on? <a href="/blog/afferent-efferent-coupling-explained">Delta × afferent coupling</a> is the risk number. A +3 on a hub is worth a conversation; a +3 on a leaf is not.</p></div></div>
<div class="bp-check-row"><span class="bp-check-box"></span><div><p class="bp-check-title">7. Ask the trend question</p><p class="bp-check-desc">Is this the second or third PR nudging the same component in the same direction? One convenient import is an exception; three are a new architecture nobody decided on. This is the check that catches drift, and the one that requires memory.</p></div></div>
</div>
<p class="bp-figure-caption">Steps 1–3 need only the diff and the repo. Steps 4–7 need the <em>rest of the graph</em>, which is exactly why they're the ones that get skipped under deadline.</p>
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
<tr><td>A moved class</td><td>What do its dependents import now?</td><td>Dependents now reach across a boundary to follow it</td></tr>
<tr><td>A changed interface or base class</td><td>How many dependents? (Count them.)</td><td>Dozens of dependents on a "trivial" change</td></tr>
<tr><td>A new edge A → B</td><td>Does any path lead from B back to A?</td><td>Yes (cycle), or almost (near-cycle)</td></tr>
<tr><td>Another util added to a "utils" module</td><td>What's this module's coupling trend?</td><td>A hub steadily gaining edges in both directions</td></tr>
<tr><td>A tiny diff on a core component</td><td>What's the blast radius?</td><td>Small diffs on high-dependency nodes hide the biggest surprises</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Every red flag in this table corresponds to a real finding from <a href="/blog/architectural-findings-in-oss">our analysis of merged refactor PRs</a>: contract changes with dozens of dependents, first-ever boundary crossings, a package cycle born in a clean-looking diff.</p>
</div>

## Free tools that help

You can automate slices of this today, no budget required:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The DIY toolbox</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Ecosystem</th><th>See the graph / find cycles</th><th>Enforce known boundaries</th></tr></thead>
<tbody>
<tr><td>Java / JVM</td><td><code>jdeps</code> (ships with the JDK)</td><td><a href="https://www.archunit.org/" target="_blank" rel="noopener">ArchUnit</a> rules in your test suite</td></tr>
<tr><td>JS / TypeScript</td><td><a href="https://github.com/pahen/madge" target="_blank" rel="noopener">madge</a> <code>--circular</code></td><td><a href="https://github.com/sverweij/dependency-cruiser" target="_blank" rel="noopener">dependency-cruiser</a></td></tr>
<tr><td>Python</td><td><a href="https://github.com/thebjorn/pydeps" target="_blank" rel="noopener">pydeps</a></td><td><a href="https://github.com/seddonym/import-linter" target="_blank" rel="noopener">import-linter</a> contracts</td></tr>
<tr><td>.NET</td><td>IDE dependency diagrams</td><td><a href="https://github.com/BenMorris/NetArchTest" target="_blank" rel="noopener">NetArchTest</a></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Rule-enforcement tools are genuinely worth adopting; they lock in the boundaries you already know about. Their limit: someone has to write each rule in advance, and they check <em>rules</em>, not <em>trends</em>. Steps 6 and 7 remain manual.</p>
</div>

## The honest math

Now the part most checklist posts skip. Suppose a competent structural pass (steps 1 through 7, done honestly) takes **15 to 30 minutes** on a nontrivial PR. Simple arithmetic, at 20 minutes average:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Manual structural review, minutes per day</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">5 PRs/day (small team)</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:12%"></div></div><span class="bp-bar-value">~100 min</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">15 PRs/day (AI-assisted team)</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:37%"></div></div><span class="bp-bar-value">~300 min</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">40 PRs/day (org-wide)</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:100%"></div></div><span class="bp-bar-value">~800 min</span></div>
</div>
<p class="bp-figure-caption">Arithmetic, not a study: PR count × 20 minutes. Three hundred minutes is <strong>five senior-engineer hours per day</strong>, and it lands on your most senior people, because they're the only ones holding enough of the graph in their heads to do steps 4–7 at all.</p>
</div>

This is why "we'll just review more carefully" fails as a strategy at [AI-era shipping volume](/blog/architecture-matters-more-not-less). The checklist is sound; the budget doesn't exist. Teams don't skip structural review because they don't care. They skip it because it's the only review activity whose cost scales with the *size of the codebase* rather than the size of the diff.

<div class="bp-callout bp-callout--mint"><strong>Use the checklist either way.</strong> If it convinces your team to look at even steps 1–3 on risky PRs, this post did its job. But notice which steps are mechanical: building the graph, counting dependents, tracing paths, comparing trends. Mechanical work is what computers are for.</div>

Striff automates steps 1 through 7 on every pull request. It parses both sides of the PR into a dependency graph, computes the deltas, checks directions, skips, cycles, and blast radius, and posts only what's [worth a reviewer's attention](/blog/grounded-ai-findings). The judgment stays yours; the 20 minutes don't. Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and run the checklist on your next PR in seconds.
