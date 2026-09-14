---
title: "AI didn't make engineering discipline obsolete. It made it the whole job."
description: "We looked at 335 active open-source repositories whose docs describe their own architecture. AI coding agents show up in 30% of their merged pull requests, 59% hand those agents a context file describing the code, and 7% run anything that checks the code still matches it."
date: 2026-09-15
---

*First published in September 2025. Rewritten in September 2026 with our own data: a survey of 335 open-source repositories.*

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

Now ask: what did AI coding tools actually change? Not correctness per line, not fundamentally. What they changed is **volume of change**. Refactors that would have been postponed forever now happen in an afternoon, because generating the code is no longer the expensive part.

If best practices are the machinery for managing change, and AI multiplied change, then every one of those practices became *more* load-bearing, not less. Tests matter more because more code lands between human readings. Naming matters more because more code is read by people who didn't write it, including the models generating the next change on top of it. Docs matter more because [they're now read by agents as well as people](/blog/design-docs-are-enforceable-now).

The industry data backs this up:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What the industry data shows</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">+23%</div><div class="bp-stat-label">pull requests merged on GitHub per month, year over year (Octoverse 2025)</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">+91%</div><div class="bp-stat-label">PR review time on teams with high AI adoption, alongside 98% more PRs merged (Faros AI, 10,000+ developers)</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">−35%</div><div class="bp-stat-label">how often new code connects to existing functions, since 2023 (GitClear, 623M changes)</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">3.8%</div><div class="bp-stat-label">of changed lines are moved, refactored code in 2026, down from 13% in 2023 (GitClear)</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/" target="_blank" rel="noopener">GitHub Octoverse 2025</a>; <a href="https://www.faros.ai/blog/ai-software-engineering" target="_blank" rel="noopener">Faros AI, <em>The AI Productivity Paradox</em></a> (a vendor study; correlations across teams); <a href="https://www.gitclear.com/the_ai_code_quality_maintainability_gap" target="_blank" rel="noopener">GitClear, June 2026</a>. And <a href="https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf" target="_blank" rel="noopener">Google's 2025 DORA report</a>: AI adoption "now improves software delivery throughput… However, it still increases delivery instability."</p>
</div>

GitClear's connectivity number is the one I keep coming back to. New code is being written, and merged, while calling into the existing codebase less and less. In their words: "New code is less and less woven into the existing codebase." Refactoring, the work that keeps a codebase's shape coherent, has collapsed to under 4% of changed lines. None of that is a story about bad code line by line. It's a story about *system-level* properties degrading while everyone's attention stays at the line level.

## So we measured it ourselves

When I first wrote this post, every number in it was somebody else's. So this time we looked at the repositories that care most: 335 active open-source projects whose own documentation describes their architecture, the exact projects that wrote down how their code is supposed to fit together. For each one we read the last 30 merged pull requests and the build and config files on the default branch.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">335 repositories that wrote their architecture down</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">30%</div><div class="bp-stat-label">of 7,609 merged pull requests show an AI coding agent's involvement (dependency bots excluded)</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">59%</div><div class="bp-stat-label">hand their coding agents a context file: AGENTS.md, CLAUDE.md, Copilot instructions and the like</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">38% vs 18%</div><div class="bp-stat-label">AI-involved share of merged PRs, in repos with an AGENTS.md or CLAUDE.md vs repos without</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">7%</div><div class="bp-stat-label">run any tool that checks an architecture rule: ArchUnit, import-linter, dependency-cruiser, NetArchTest and the rest</div></div>
</div>
<p class="bp-figure-caption">Our survey, September 2026. Active public repositories in Java, Python, C# and TypeScript whose docs state architectural rules; not a random sample of GitHub. AI involvement means a co-author trailer naming an AI tool, a pull request opened by a coding agent, or a "Generated with" footer. That is a floor: tab completion and chat-assisted edits leave no trace. Enforcement was detected from default-branch build, config and CI files, and every hit was checked by hand. The 38% vs 18% split is a correlation, not a cause.</p>
</div>

Put those together. In repositories that went to the trouble of writing down their architecture, AI agents are already in roughly one pull request in three, and in more than half of those repositories the agents are handed a context file about the code; [two in three such files describe its architecture](https://arxiv.org/abs/2511.12884). Yet 93% of the same repositories run nothing that checks an architecture rule. In 180 of them, the agents get a context file and nothing checks whether the code still matches what the docs say.

## The practices that scale themselves, and the one that doesn't

Not all best practices are equally at risk, because not all of them depend on a human paying attention.

Most of the classics have a guardian that scales automatically. Style has linters. Correctness has tests and CI. Even readability has help now, since coding assistants are genuinely good at naming and idiom. Crank the volume up and these hold the line, because the enforcement is mechanical and per-file.

But look at what's left unguarded:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every practice has a guardian. Except one.</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Practice</th><th>Who enforces it</th><th>Holds as volume grows?</th></tr></thead>
<tbody>
<tr><td>Consistent style &amp; formatting</td><td>Linters, formatters</td><td><span class="bp-yes">✓ Automatic</span></td></tr>
<tr><td>Correctness</td><td>Tests, CI, type systems</td><td><span class="bp-yes">✓ Automatic</span></td></tr>
<tr><td>Readable code, good names</td><td>Review norms + coding assistants</td><td><span class="bp-yes">✓ Mostly</span></td></tr>
<tr><td>Small, focused diffs</td><td>Team norms</td><td><span class="bp-yes">✓ If you insist</span></td></tr>
<tr><td>What your docs say about the code</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Goes stale silently</span></td></tr>
<tr><td>Dependency direction &amp; boundaries</td><td><em>Nobody</em>, in 93% of the repos above</td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
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
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Output</th><th>Oversight</th></tr></thead>
<tbody>
<tr><td><strong>+23%</strong> pull requests merged on GitHub per month, year over year</td><td><strong>+91%</strong> PR review time on high-AI-adoption teams</td></tr>
<tr><td><strong>+98%</strong> pull requests merged on high-AI-adoption teams</td><td><strong>4.6x</strong> longer wait before an AI-generated PR gets reviewed</td></tr>
<tr><td><strong>+154%</strong> average PR size on the same teams</td><td><strong>7%</strong> of repositories that wrote their architecture down check any of it</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Sources: Octoverse 2025; Faros AI; <a href="https://linearb.io/resources/software-engineering-benchmarks-report" target="_blank" rel="noopener">LinearB 2026 benchmarks</a> (8.1M pull requests; a vendor study); our survey above. Writing stopped being the bottleneck. <em>Noticing what the writing did to the system</em> still is.</p>
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
<p class="bp-figure-caption">Ericsson/ecchronos <a href="https://github.com/Ericsson/ecchronos/pull/1786">#1786</a>, a real pull request. The call moved to a new class, <code>SchemaRefresher</code>; the sentence on the right did not move with it. It sits in a file the diff does not contain, so no amount of careful diff-reading surfaces it, and as of September 2026 it is still on <code>master</code>. <a href="/blog/design-docs-are-enforceable-now">The whole story</a>.</p>
</div>

This is not a story about careless review. That pull request was reviewed and approved by people who are good at their jobs. The information simply was not in front of them.

## The bill comes due quietly

The failure mode of high-volume AI development isn't dramatic. Nothing crashes. The failure mode is a codebase that accumulates coupling, cycles, and misplaced responsibilities one clean-looking PR at a time, until one day the symptoms surface as things nobody connects back to architecture: builds got slow. Onboarding takes months. Every estimate has a fudge factor because every change touches more than it should.

<div class="bp-callout bp-callout--amber"><strong>Teams that ship faster while their structural oversight stays flat aren't being efficient. They're borrowing.</strong> The loan comes due as a system that technically passes every check while becoming harder to change every week, and by the time it's obvious, the cheap moment to fix it is hundreds of merges in the past.</div>

## So what do you actually do?

Keep every practice you already have. They matter more now, not less; that's the whole first half of this post. But be honest about the gap: in 93% of the repositories that wrote their architecture down, nothing is watching the graph.

Closing that gap doesn't mean hiring architects to trace dependencies by hand, and it certainly doesn't mean slowing your team down to pre-AI speed. It means giving the one unguarded practice the same thing every other practice already has: **an automatic, per-PR guardian.**

That's what Striff is. It reads the architecture your docs already describe, turns every checkable sentence into a rule, and evaluates each one at both revisions of every pull request. A rule can be as plain as where a class lives or as sharp as *"the domain module must not depend on infrastructure"*: if your team wrote it down, the pull request that breaks it is told which sentence it broke, quoted from the file it lives in. Every pull request also gets a diagram of what changed.

The bar is deliberately high, and the consequence is that it is quiet. That is the same bargain your linter makes: you trust it because it does not shout. Your linter guards style, your CI guards correctness, and what you wrote down about the shape of the system finally gets a guardian of its own, at whatever speed your team ships.

[Install the GitHub App](https://github.com/apps/striff-app/installations/new) and open your next pull request.
