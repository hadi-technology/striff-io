---
title: "AI didn't make engineering discipline obsolete. It made it the whole job."
description: "Tests, small PRs, readable code, documentation: every engineering best practice just got more valuable, because every one of them is about managing change, and change is what AI multiplied. But one practice has no guardian at all, and it's the one that decides whether your codebase survives the next two years."
date: 2025-09-02
---

There's a story making the rounds in engineering circles, and I understand why it's comforting: *AI writes cleaner code than most humans, so the old disciplines matter less now.* Fewer reviews. Lighter process. Let the tools carry it.

I think that story has it exactly backwards, and I want to walk through why, starting not with architecture but with the humble stuff: tests, naming, small pull requests. The things every senior engineer preaches and every deadline erodes.

## Best practices were never about writing code

Here's the thing about engineering best practices that gets forgotten: almost none of them exist to help you *write* code. They exist to help you *change* code later, safely, without holding the whole system in your head.

Think about what each one actually buys:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What each practice is really for</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Tests</p><p class="bp-flow-desc">Not proof of correctness. Confidence to change something six months from now without fear.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Readable code &amp; naming</p><p class="bp-flow-desc">Cheap onboarding for the next person, who is usually you, later, with no memory of why.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Small PRs</p><p class="bp-flow-desc">Units of change a human can actually hold in their head and meaningfully judge.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">4</span><p class="bp-flow-title">Docs &amp; ADRs</p><p class="bp-flow-desc">Shared memory. The decisions that outlive the people and conversations that made them.</p></div>
</div>
<p class="bp-figure-caption">The common denominator: every practice manages the cost and risk of <em>future change</em>. None of them is about typing speed.</p>
</div>

Now ask: what did AI coding tools actually change? Not correctness per line, not fundamentally. What they changed is **volume of change**. Teams that shipped five PRs a day ship fifteen. Refactors that would have been postponed forever now happen in an afternoon, because generating the code is no longer the expensive part.

If best practices are the machinery for managing change, and AI just multiplied change, then every one of those practices became *more* load-bearing, not less. Tests matter more because more code lands between human readings. Naming matters more because more code is read by people who didn't write it, including the models generating the next change on top of it. Docs matter more because [they're now consumed by agents as well as people](/blog/design-docs-are-enforceable-now).

The data backs this up, and it's not subtle:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What the industry data shows</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">8x</div><div class="bp-stat-label">increase in duplicated code blocks in 2024 vs. two years prior (GitClear, 211M changed lines)</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">-7.2%</div><div class="bp-stat-label">delivery stability per 25% increase in AI adoption (Google DORA 2024)</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">46%</div><div class="bp-stat-label">of code in Copilot-enabled files is AI-written (GitHub research)</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">2024</div><div class="bp-stat-label">the first year copy-pasted code exceeded refactored code, in GitClear's corpus</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://www.gitclear.com/ai_assistant_code_quality_2025_research" target="_blank" rel="noopener">GitClear AI Code Quality research</a>, <a href="https://dora.dev/research/2024/dora-report/" target="_blank" rel="noopener">Google's 2024 DORA report</a>, and <a href="https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness/" target="_blank" rel="noopener">GitHub Copilot research</a>. Every figure here is somebody else's; we have not run a study of our own on this and are not going to invent one.</p>
</div>

GitClear's number is the one I keep coming back to. Across 211 million changed lines, 2024 was the first year that **copy-pasted code exceeded refactored code**. Duplication rising in lockstep with AI assistance. That isn't a story about bad code. It's a story about *system-level* properties degrading while everyone's attention stays at the line level.

## The practices that scale themselves, and the one that doesn't

Here's where it gets interesting. Not all best practices are equally at risk, because not all of them depend on a human paying attention.

Most of the classics have a guardian that scales automatically. Style has linters. Correctness has tests and CI. Even readability has help now, since coding assistants are genuinely good at naming and idiom. Crank the volume to 10x, and these hold the line, because the enforcement is mechanical and per-file.

But look at what's left unguarded:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every practice has a guardian. Except one.</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Practice</th><th>Who enforces it</th><th>Holds at 10x volume?</th></tr></thead>
<tbody>
<tr><td>Consistent style &amp; formatting</td><td>Linters, formatters</td><td><span class="bp-yes">✓ Automatic</span></td></tr>
<tr><td>Correctness</td><td>Tests, CI, type systems</td><td><span class="bp-yes">✓ Automatic</span></td></tr>
<tr><td>Readable code, good names</td><td>Review norms + coding assistants</td><td><span class="bp-yes">✓ Mostly</span></td></tr>
<tr><td>Small, focused diffs</td><td>Team norms</td><td><span class="bp-yes">✓ If you insist</span></td></tr>
<tr><td>What your docs say about the code</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Goes stale silently</span></td></tr>
<tr><td>Dependency direction &amp; boundaries</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
<tr><td>Modules keeping their internals private</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
<tr><td>No dependency cycles</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The unguarded rows share a property: they're <strong>global</strong>. You cannot check them by looking at one file, one diff, or one PR. They exist only in the relationships <em>between</em> components, which is exactly what per-file tooling can't see.</p>
</div>

This is the transition the comforting story misses. The practices that survived the volume increase are the *local* ones. The practice with no guardian is **architecture**: what your docs say the system is, which component depends on which, whether boundaries hold, whether the shape is drifting. And architecture is the practice where damage compounds hardest, because you can't refactor your way out of a shape problem one file at a time.

## Why architecture decays at exactly AI speed

Before AI tools, there was an accidental safety mechanism nobody designed: the speed of human typing. Code changed about as fast as a senior engineer could keep a mental model of it. Reading diffs was a workable proxy for "is the system still healthy?" because the system changed slowly enough for a head to track.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Output scaled. Oversight didn't.</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Code written, before AI</span><div class="bp-bar-track"><div class="bp-bar" style="width:22%"></div></div><span class="bp-bar-value">1x</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Code written, with AI</span><div class="bp-bar-track"><div class="bp-bar" style="width:100%"></div></div><span class="bp-bar-value">3-10x</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Architectural review capacity, before</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:22%"></div></div><span class="bp-bar-value">1x</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Architectural review capacity, now</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:22%"></div></div><span class="bp-bar-value">1x</span></div>
</div>
<p class="bp-figure-caption">The bottleneck on writing disappeared. The bottleneck on <em>noticing what the writing did to the system</em> is still one human head, reading diffs.</p>
</div>

That proxy is now broken, and here's the mechanism. A diff shows you lines. It does not show you that those lines made a sentence in your own README false, or created the first-ever edge from your core into a plugin, or closed a cycle across five packages. That information lives in the relationship between this change and everything around it: other files, other documents, every change before it. It is structurally absent from the thing your reviewers are reading. Here is a real one:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The same pull request, two representations</p>
<svg class="bp-diagram" viewBox="0 0 860 330" role="img" aria-label="Left: the diff of NodeWorker.java in Ericsson/ecchronos pull request 1786, which removes its RepairScheduler field and adds a SchemaRefresher field; the pull request was approved and merged. Right: lines 133 to 137 of the module's README, not part of the diff, which still say NodeWorker calls RepairScheduler.putConfigurations(), flagged as a violated documented rule.">
<rect x="10" y="14" width="400" height="300" rx="14" fill="#ffffff" stroke="#cbd5e1"/>
<text x="30" y="46" font-size="13" font-weight="700" fill="#0f172a">What review sees</text>
<rect x="30" y="62" width="360" height="26" rx="6" fill="#f1f5f9"/>
<text x="42" y="79" font-size="11.5" class="bp-mono" fill="#475569">multithreads/NodeWorker.java · +9 −150</text>
<rect x="30" y="98" width="360" height="22" rx="4" fill="#fee2e2"/>
<text x="40" y="113" font-size="10.5" class="bp-mono" fill="#991b1b">− import …repair.scheduler.RepairScheduler;</text>
<rect x="30" y="124" width="360" height="22" rx="4" fill="#fee2e2"/>
<text x="40" y="139" font-size="10.5" class="bp-mono" fill="#991b1b">− private final RepairScheduler myRepairScheduler;</text>
<rect x="30" y="150" width="360" height="22" rx="4" fill="#dcfce7"/>
<text x="40" y="165" font-size="10.5" class="bp-mono" fill="#166534">+ private final SchemaRefresher mySchemaRefresher;</text>
<rect x="30" y="176" width="360" height="22" rx="4" fill="#dcfce7"/>
<text x="40" y="191" font-size="10.5" class="bp-mono" fill="#166534">+ mySchemaRefresher.onTableCreated(myNode, tableEvent);</text>
<text x="30" y="234" font-size="12.5" fill="#059669" font-weight="700">✓ Review approved</text>
<text x="30" y="258" font-size="12.5" fill="#059669" font-weight="700">✓ Merged</text>
<text x="30" y="296" font-size="11.5" fill="#64748b" font-style="italic">A clean refactor. Nothing to flag.</text>
<rect x="450" y="14" width="400" height="300" rx="14" fill="#ffffff" stroke="#cbd5e1"/>
<text x="470" y="46" font-size="13" font-weight="700" fill="#0f172a">What the README still says</text>
<rect x="470" y="62" width="360" height="26" rx="6" fill="#f1f5f9"/>
<text x="482" y="79" font-size="11.5" class="bp-mono" fill="#475569">core.impl/README.md · not in the diff</text>
<text x="482" y="113" font-size="10" class="bp-mono" fill="#94a3b8">133</text>
<text x="512" y="113" font-size="11" fill="#334155"><tspan font-weight="700" class="bp-mono">NodeWorker</tspan> — A continuously-running background thread…</text>
<text x="482" y="135" font-size="10" class="bp-mono" fill="#94a3b8">134</text>
<text x="512" y="135" font-size="11" fill="#334155">- Discovers all replicated tables for its node</text>
<text x="482" y="157" font-size="10" class="bp-mono" fill="#94a3b8">135</text>
<text x="512" y="157" font-size="11" fill="#334155">- Fetches repair configurations per table</text>
<rect class="bp-node-pulse" x="472" y="166" width="358" height="40" rx="6" fill="#fef2f2" stroke="#fca5a5"/>
<text x="482" y="182" font-size="10" class="bp-mono" fill="#b91c1c">136</text>
<text x="512" y="182" font-size="11" fill="#7f1d1d">- Calls <tspan class="bp-mono">RepairScheduler.putConfigurations()</tspan></text>
<text x="524" y="198" font-size="11" fill="#7f1d1d">to keep jobs up to date</text>
<text x="482" y="226" font-size="10" class="bp-mono" fill="#94a3b8">137</text>
<text x="512" y="226" font-size="11" fill="#334155">- Loops on a configurable refresh interval</text>
<g class="bp-late">
<rect x="470" y="242" width="360" height="54" rx="8" fill="#fef2f2" stroke="#fecaca"/>
<text x="484" y="264" font-size="12" font-weight="700" fill="#b91c1c">✗ Violated: NodeWorker depends on RepairScheduler</text>
<text x="484" y="283" font-size="11.5" fill="#7f1d1d">True at the base revision, false after this change</text>
</g>
</svg>
<p class="bp-figure-caption">Ericsson/ecchronos <a href="https://github.com/Ericsson/ecchronos/pull/1786">#1786</a>, a real pull request. The call moved to a new class, <code>SchemaRefresher</code>; the sentence on the right did not move with it. It sits in a file the diff does not contain, so no amount of careful diff-reading surfaces it, and it is still on <code>master</code>. <a href="/blog/design-docs-are-enforceable-now">The whole story</a>.</p>
</div>

This is not a story about careless review. That pull request was reviewed and approved by people who are good at their jobs. The information simply was not in front of them.

## The bill comes due quietly

The failure mode of high-volume AI development isn't dramatic. Nothing crashes. The failure mode is a codebase that accumulates coupling, cycles, and misplaced responsibilities one clean-looking PR at a time, until one day the symptoms surface as things nobody connects back to architecture: builds got slow. Onboarding takes months. Every estimate has a fudge factor because every change touches more than it should.

<div class="bp-callout bp-callout--amber"><strong>Teams that ship 10x faster while their structural oversight stays flat aren't being efficient. They're borrowing.</strong> The loan comes due as a system that technically passes every check while becoming harder to change every week, and by the time it's obvious, the cheap moment to fix it is hundreds of merges in the past.</div>

## So what do you actually do?

Keep every practice you already have. They matter more now, not less; that's the whole first half of this post. But be honest about the gap: nothing in your current setup is watching the graph.

Closing that gap doesn't mean hiring architects to trace dependencies by hand, and it certainly doesn't mean slowing your team down to pre-AI speed. It means giving the one unguarded practice the same thing every other practice already has: **an automatic, per-PR guardian.**

That's what Striff is. It reads the architecture your docs already describe, turns every checkable sentence into a rule, and evaluates each one at both revisions of every pull request. A rule can be as plain as where a class lives or as sharp as *"the domain module must not depend on infrastructure"*: if your team wrote it down, the pull request that breaks it is told which sentence it broke, quoted from the file it lives in. Every pull request also gets a diagram of what changed and review notes on the components it touched.

The bar is deliberately high, and the consequence is that it is quiet. That is the same bargain your linter makes: you trust it because it does not shout. Your linter guards style, your CI guards correctness, and what you wrote down about the shape of the system finally gets a guardian of its own, at whatever speed your team ships.

[Install the GitHub App](https://github.com/apps/striff-app/installations/new) and open your next pull request.
