---
title: "1 in 3 refactor PRs quietly moves the architecture. Nobody's review mentioned it."
description: "We analyzed merged refactor PRs from well-known repos like Presto, Google Cloud DataflowTemplates, Apache Beam, and LINE armeria. A third carried real structural risk: boundary inversions, package cycles, contract rewrites. Here's what that risk looks like, on real Striff diagrams."
date: 2026-07-28
---

Here's a number worth sitting with: **when we analyzed merged refactor-shaped pull requests from popular open-source repos, 1 in 3 changed the architecture in a way that deserved a reviewer's attention.** Boundary inversions. New package cycles. Contracts with dozens of dependents rewritten in passing.

All of these PRs were reviewed. Many had AI review bots active on the very PR. **All of them merged anyway**, because the risk wasn't in the lines of the diff. It was in what the change did to the dependency graph, and no one was looking there.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The experiment</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">2,879</div><div class="bp-stat-label">recent merged PRs surveyed across popular Java, TypeScript, Python, and C# repos</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">91</div><div class="bp-stat-label">refactor-shaped candidates fully analyzed by Striff, end to end</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">1 in 3</div><div class="bp-stat-label">carried HIGH or MEDIUM structural risk that no review mentioned</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">2 in 3</div><div class="bp-stat-label">were structurally clean. Striff posted nothing on those, by design.</div></div>
</div>
<p class="bp-figure-caption">Method: merged PRs from April–July 2026 with structural-change titles (refactor, extract, move, split…) and 2–30 changed files, analyzed with the same public Striff pipeline the <a href="https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen">browser extension</a> uses. Every repo had an AI review bot commenting on the analyzed PR, and none of the findings below appear in those comments. Of 27 flagged PRs we showcase the strongest; we discarded several whose findings were test-module artifacts, because a finding that makes you shrug is <a href="/blog/grounded-ai-findings">a bug in our book</a>.</p>
</div>

If you lead a team, the second number matters as much as the first. A structural reviewer that flags every PR is a noise generator you'll learn to ignore. Striff stayed silent on two thirds of these PRs because there was nothing structural to say. The third where it spoke up is the third that compounds into slow builds, scary refactors, and the rewrite nobody budgeted for.

## What the risk actually looks like

These are real, merged pull requests, shown exactly as Striff rendered them. Each diagram is zoomed to the finding.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">prestodb/presto #28184: four load-bearing contracts modified in one PR</p>
<div class="bp-striff-stage">
<span class="bp-striff-tag">prestodb/presto · PR #28184</span>
<img src="/examples/blog-presto.svg" alt="Striff structural diagram of Presto PR 28184, zoomed on HiveUtil and HiveTableLayoutHandle" loading="lazy" style="width:6965px; transform: translate(-2750px, -365px) scale(0.5);" />
</div>
<div class="bp-striff-find"><span class="bp-sev">HIGH</span><div><strong>Stable contracts modified: 35, 28, 22, and 16 dependents.</strong> <code>HiveUtil</code>, <code>ParquetTypeUtils</code>, <code>Field</code>, and <code>HiveTableLayoutHandle</code> all changed in a single PR. Every dependent of those components inherited the risk, and the diff gave no hint of the blast radius.</div></div>
<p class="bp-figure-caption">This is what "a small change to a shared component" looks like when you can actually see the dependents. Reviewers approved the lines. The graph shows what the lines couldn't: <a href="https://github.com/prestodb/presto/pull/28184" target="_blank" rel="noopener">see the PR</a>.</p>
</div>

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">floci-io/floci #1825: a package cycle is born</p>
<div class="bp-striff-stage">
<span class="bp-striff-tag">floci-io/floci · PR #1825</span>
<img src="/examples/blog-floci.svg" alt="Striff structural diagram of floci PR 1825, zoomed on the CloudFormation provisioner cycle" loading="lazy" style="width:1555px; transform: translate(-385px, -759px) scale(0.55);" />
</div>
<div class="bp-striff-find"><span class="bp-sev">HIGH</span><div><strong>New package-level dependency cycle</strong> through the CloudFormation services, plus two first-ever boundary crossings. From this PR onward, those packages build, test, and break together.</div></div>
<p class="bp-figure-caption">Cycles never announce themselves; they arrive as one convenient import. <a href="/blog/package-dependency-cycles">Why one edge is all it takes</a>, and <a href="https://github.com/floci-io/floci/pull/1825" target="_blank" rel="noopener">the PR itself</a>.</p>
</div>

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">intro-skipper #831: two layers reach straight into the database</p>
<div class="bp-striff-stage">
<span class="bp-striff-tag">intro-skipper/intro-skipper · PR #831</span>
<img src="/examples/blog-introskipper.svg" alt="Striff structural diagram of intro-skipper PR 831, zoomed on the Analyzers to Db boundary crossing" loading="lazy" style="width:8184px; transform: translate(-861px, -409px) scale(0.42);" />
</div>
<div class="bp-striff-find"><span class="bp-sev">HIGH</span><div><strong>First-ever edges from <code>Analyzers</code> and <code>Manager</code> into <code>Db</code></strong>, each skipping two layers. The layering that kept analysis logic away from persistence is now optional, and every future PR can cite this one as precedent.</div></div>
<p class="bp-figure-caption">Layer skips are how architectures erode: each one makes the next easier to justify. <a href="https://github.com/intro-skipper/intro-skipper/pull/831" target="_blank" rel="noopener">See the PR</a>.</p>
</div>

The full flagged set spans repos your team probably knows: [Google Cloud DataflowTemplates](https://github.com/GoogleCloudPlatform/DataflowTemplates/pull/4028) accumulated coupling across 15 components in one PR, [apache/beam](https://github.com/apache/beam/pull/39445) grew a 24-dependent component's reach, [LINE's armeria](https://github.com/line/armeria/pull/6887) piled complexity onto its xDS plugin path, and [oshi](https://github.com/oshi/oshi/pull/3541) watched one class jump from complexity 71 to 111 in a single merge.

## The shape of the problem

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The 64 findings, by type</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Coupling / instability spikes</span><div class="bp-bar-track"><div class="bp-bar" style="width:100%"></div></div><span class="bp-bar-value">20</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Complexity (WMC) growth</span><div class="bp-bar-track"><div class="bp-bar" style="width:100%"></div></div><span class="bp-bar-value">20</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">First-ever boundary crossings</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:65%"></div></div><span class="bp-bar-value">13</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Stable-contract changes</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:30%"></div></div><span class="bp-bar-value">6</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Layer skips</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:20%"></div></div><span class="bp-bar-value">4</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">New package cycles</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:5%"></div></div><span class="bp-bar-value">1</span></div>
</div>
<p class="bp-figure-caption">Every category is invisible in a diff by construction. <a href="/blog/afferent-efferent-coupling-explained">Coupling deltas</a> require the before-and-after graph. "First-ever edge" requires repo history. <a href="/blog/package-dependency-cycles">Cycles</a> require paths through files the PR never touched.</p>
</div>

Notice the mix. It isn't dominated by one exotic detector. It's the everyday mechanics of a codebase getting worse: components quietly gaining dependencies, complexity pooling in hubs, boundaries crossed for the first time. Individually, each one merges without a ripple. Together, at a rate of one risky refactor in three, they are the reason a codebase that felt fast two years ago feels slow today.

## What this means for your team

If your team merges ten refactor-ish PRs a week, this data says roughly three of them are moving your architecture, and the odds that anyone notices in review are low. Not because your reviewers are careless, but because the information isn't in front of them. Blast radius, edge direction, and cycle paths live in the dependency graph, and nobody builds the dependency graph during code review.

Striff builds it on every pull request. It parses both sides of the PR into a component graph, compares them, and posts findings only when the structure actually moved: which contract got riskier, which boundary got crossed, which cycle closed, with the numbers to back each claim. On clean PRs it says nothing at all. Your team keeps its review habits; the graph just stops being invisible.

Every PR in this post is public. Click through, read the reviews, and check our work. Then install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and open your own next pull request. If you're in the two thirds, you'll hear nothing. That's the point.
