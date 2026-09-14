---
title: "AI didn't make engineering discipline obsolete. It made it the whole job."
description: "Design doc, then plan, then the agent builds it piece by piece: the companies that make coding agents now tell you to work this way. We surveyed 335 open-source repositories: 63% already hand their agents docs to work from, and only 8% of those check that the code still matches."
date: 2026-09-15
---

*First published in September 2025. Rewritten in September 2026 with our own data: a survey of 335 open-source repositories.*

Here is how a feature gets built at a growing number of companies now. Someone writes a design doc: what the feature does, where it lives, what it must not touch. The architecture doc already says how the system fits together. Then an agent turns the design into an implementation plan, a list of small, checkable tasks, and works through it one task at a time. The next feature starts the same way, from the same documents.

This isn't a fringe workflow. It's what the companies that build coding agents now tell you to do:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What the toolmakers now tell you</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Who</th><th>What they say</th></tr></thead>
<tbody>
<tr><td>GitHub, Spec Kit</td><td>"Instead of coding first and writing docs later, in spec-driven development, you start with a (you guessed it) spec." It "becomes the source of truth your tools and AI agents use to generate, test, and validate code."</td></tr>
<tr><td>Anthropic, Claude Code</td><td>"Explore first, then plan, then code." Have Claude write the spec to a file, then: "Once the spec is complete, start a fresh session to execute it."</td></tr>
<tr><td>Cursor</td><td>"Most new features at Cursor now begin with Agent writing a plan."</td></tr>
<tr><td>OpenAI, Codex</td><td>Execution plans are "thorough design documents, and 'living documents'", an approach that has "enabled Codex to work for more than seven hours from a single prompt."</td></tr>
<tr><td>Google, Conductor for Gemini CLI</td><td>"Plan before you build." Specs and plans "live alongside your code in persistent Markdown files."</td></tr>
<tr><td>AWS, Kiro</td><td>Every feature starts as <code>requirements.md</code>, <code>design.md</code> ("technical architecture, sequence diagrams, and implementation considerations") and <code>tasks.md</code>. Amazon's internal memo, per Reuters: "We're making Kiro our recommended AI-native development tool for Amazon."</td></tr>
<tr><td>Thoughtworks Technology Radar</td><td>Committing instruction files such as AGENTS.md to the repository: <strong>Adopt</strong>. Spec-driven development: "We've seen many developers adopt this style."</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Sources: <a href="https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/" target="_blank" rel="noopener">GitHub</a>, <a href="https://code.claude.com/docs/en/best-practices" target="_blank" rel="noopener">Anthropic</a>, <a href="https://cursor.com/blog/plan-mode" target="_blank" rel="noopener">Cursor</a>, <a href="https://developers.openai.com/cookbook/articles/codex_exec_plans" target="_blank" rel="noopener">OpenAI</a>, <a href="https://developers.googleblog.com/conductor-introducing-context-driven-development-for-gemini-cli/" target="_blank" rel="noopener">Google</a>, <a href="https://kiro.dev/docs/specs/" target="_blank" rel="noopener">Kiro</a> and <a href="https://finance.yahoo.com/news/amazon-pushes-house-ai-coding-002909022.html" target="_blank" rel="noopener">Reuters</a>, <a href="https://www.thoughtworks.com/content/dam/thoughtworks/documents/radar/2025/11/tr_technology_radar_vol_33_en.pdf" target="_blank" rel="noopener">Thoughtworks Radar Vol. 33</a>.</p>
</div>

Birgitta Böckeler put it most plainly on [martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html): "The spec becomes the source of truth for the human and the AI."

## The docs became the program

Look at what that changes. For twenty years a design doc had one reader, the next engineer, and it was allowed to go stale because that engineer could ask someone. Now its main reader is an agent that implements whatever it says, every time, and asks nobody. The documents in your repository have become the instructions your code is built from.

The adoption curve is steep:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Docs for agents, in eighteen months</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">60,000+</div><div class="bp-stat-label">open-source projects had adopted AGENTS.md by December 2025 (Linux Foundation)</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">137k</div><div class="bp-stat-label">GitHub stars for Spec Kit, in thirteen months</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">287k</div><div class="bp-stat-label">GitHub stars for Superpowers, a skills and planning kit for coding agents, in eleven months</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">68%</div><div class="bp-stat-label">of 2,303 agent context files describe the project's architecture</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation" target="_blank" rel="noopener">Linux Foundation</a>; <a href="https://github.com/github/spec-kit" target="_blank" rel="noopener">github/spec-kit</a> and <a href="https://github.com/obra/superpowers" target="_blank" rel="noopener">obra/superpowers</a>, star counts as of September 15, 2026 (OpenSpec has 68k and the BMAD method 53k); <a href="https://arxiv.org/abs/2511.12884" target="_blank" rel="noopener"><em>Agent READMEs</em>, arXiv 2511.12884</a>.</p>
</div>

## Every practice got more load-bearing

There's a comforting story that goes with all this: *AI writes cleaner code than most humans, so the old disciplines matter less now.* I think it has it exactly backwards. Almost no engineering best practice exists to help you *write* code. They exist to help you *change* code later, safely, without holding the whole system in your head:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What each practice is really for</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Tests</p><p class="bp-flow-desc">Not proof of correctness. Confidence to change something six months from now without fear.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Readable code &amp; naming</p><p class="bp-flow-desc">Cheap onboarding for the next reader, who is now as likely to be an agent as a person.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Small PRs</p><p class="bp-flow-desc">Units of change a human can actually hold in their head and meaningfully judge.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">4</span><p class="bp-flow-title">Docs &amp; ADRs</p><p class="bp-flow-desc">Shared memory, and now the instructions agents build from.</p></div>
</div>
<p class="bp-figure-caption">The common denominator: every practice manages the cost and risk of <em>future change</em>. None of them is about typing speed.</p>
</div>

What AI changed is the **volume of change**. If best practices are the machinery for managing change, and AI multiplied change, every one of them became more load-bearing, not less. The industry data agrees:

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

GitClear's connectivity number is the one I keep coming back to. In their words: "New code is less and less woven into the existing codebase." Refactoring, the work that keeps a codebase's shape coherent, has collapsed to under 4% of changed lines. That isn't a story about bad code line by line. It's a story about *system-level* properties degrading while everyone's attention stays at the line level.

## So we measured it ourselves

When I first wrote this post, every number in it was somebody else's. So this time we looked at the repositories this matters most for: 335 active open-source projects whose own documentation describes their architecture. For each one we read the last 30 merged pull requests, and the files, build and config on the default branch.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">335 repositories that wrote their architecture down</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">30%</div><div class="bp-stat-label">of 7,609 merged pull requests show an AI coding agent's involvement (dependency bots excluded)</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">63%</div><div class="bp-stat-label">give their agents docs to work from: AGENTS.md or CLAUDE.md, spec and plan files, or custom agent workflows</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">22%</div><div class="bp-stat-label">keep spec or plan files for agents to build from; 10% use a spec-driven toolkit such as Spec Kit, OpenSpec or Superpowers</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">8%</div><div class="bp-stat-label">of the repos that give agents docs run any tool that checks an architecture rule</div></div>
</div>
<p class="bp-figure-caption">Our survey, September 2026. Active public repositories in Java, Python, C# and TypeScript whose docs state architectural rules; not a random sample of GitHub. AI involvement means a co-author trailer naming an AI tool, a pull request opened by a coding agent, or a "Generated with" footer; that is a floor, since tab completion and chat-assisted edits leave no trace. Architecture checks means ArchUnit, import-linter, dependency-cruiser, NetArchTest and similar, detected from default-branch build, config and CI files, with every hit checked by hand.</p>
</div>

Put those together. In repositories that went to the trouble of writing down their architecture, AI agents are already in roughly one pull request in three. Repos with an AGENTS.md or CLAUDE.md see even more: 38% of their merged pull requests involve an agent, against 18% in repos without one. Nearly two-thirds hand their agents documents to build from. And of those, 92% run nothing that checks an architecture rule. The agents are building from the docs, and nothing checks that the code still matches them.

## The practices that scale themselves, and the one that doesn't

Most of the classic practices have a guardian that scales automatically. Style has linters. Correctness has tests and CI. Even readability has help now, since coding assistants are genuinely good at naming and idiom. Crank the volume up and these hold the line, because the enforcement is mechanical and per-file.

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

The practice with no guardian is **architecture**: what your docs say the system is, which component depends on which, whether boundaries hold, whether the shape is drifting. In a docs-first workflow that is also the practice the agents lean on hardest, because the architecture doc is what they read before they touch anything.

## When the docs are the program, drift is a bug

A stale doc used to cost a confused new hire an afternoon. Now it costs every agent run that reads it, and agents do what the docs say. ETH Zurich's study of AGENTS.md files found that "instructions in the context files are well followed by coding agents." An engineer who documented a 108,000-line codebase for agents reported what happens when those instructions go stale:

<div class="bp-callout bp-callout--amber">"Outdated context documents caused agents to generate code that conflicted with recent refactors." And: "Agents trust documentation, and out-of-date specs can mislead sessions and lead to silent failures." <br><em>— <a href="https://arxiv.org/abs/2602.20478" target="_blank" rel="noopener">Codified Context</a>, arXiv 2602.20478</em></div>

Böckeler saw it in her own tests: given notes describing classes that already existed, the agent "took them as a new specification and generated them all over again, creating duplicates." And keeping the instructions current measurably matters: in a study of AI IDE rule files, compliance rose "from 49.14% to 72.13%" after the rules were updated ([arXiv 2606.12231](https://arxiv.org/abs/2606.12231)). Meanwhile, in a sample of 100 context files, 24% had been generated once and never reviewed again ([arXiv 2606.15828](https://arxiv.org/abs/2606.15828)).

And the docs are drifting faster than anyone is watching them:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Output scaled. Oversight didn't.</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Output</th><th>Oversight</th></tr></thead>
<tbody>
<tr><td><strong>+23%</strong> pull requests merged on GitHub per month, year over year</td><td><strong>+91%</strong> PR review time on high-AI-adoption teams</td></tr>
<tr><td><strong>+98%</strong> pull requests merged on high-AI-adoption teams</td><td><strong>4.6x</strong> longer wait before an AI-generated PR gets reviewed</td></tr>
<tr><td><strong>+154%</strong> average PR size on the same teams</td><td><strong>8%</strong> of repositories that give agents docs check any architecture rule</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Sources: Octoverse 2025; Faros AI; <a href="https://linearb.io/resources/software-engineering-benchmarks-report" target="_blank" rel="noopener">LinearB 2026 benchmarks</a> (8.1M pull requests; a vendor study); our survey above. Writing stopped being the bottleneck. <em>Noticing what the writing did to the system</em> still is.</p>
</div>

The mechanism is simple. A diff shows you lines. It does not show you that those lines made a sentence in your own README false, or created the first-ever edge from your core into a plugin. That information lives in the relationship between this change and everything around it: other files, other documents, every change before it. It is structurally absent from the thing your reviewers are reading. Here is a real one:

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
<p class="bp-figure-caption">Ericsson/ecchronos <a href="https://github.com/Ericsson/ecchronos/pull/1786">#1786</a>, a real pull request. The call moved to a new class, <code>SchemaRefresher</code>; the sentence on the right did not move with it. It sits in a file the diff does not contain, so no amount of careful diff-reading surfaces it, and as of September 2026 it is still on <code>master</code>. The next agent asked to work on <code>NodeWorker</code> reads that sentence first. <a href="/blog/design-docs-are-enforceable-now">The whole story</a>.</p>
</div>

This is not a story about careless review. That pull request was reviewed and approved by people who are good at their jobs. The information simply was not in front of them.

## The bill comes due quietly

The failure mode isn't dramatic. Nothing crashes. The docs drift one clean-looking PR at a time, the agents keep building from them, and the codebase accumulates coupling, cycles and duplicated responsibilities until the symptoms surface as things nobody connects back to architecture: builds got slow, onboarding takes months, every estimate has a fudge factor.

<div class="bp-callout bp-callout--amber"><strong>Teams that ship faster while their structural oversight stays flat aren't being efficient. They're borrowing.</strong> The loan comes due as a system that technically passes every check while becoming harder to change every week, and by the time it's obvious, the cheap moment to fix it is hundreds of merges in the past.</div>

## So what do you actually do?

Keep every practice you already have, and keep writing the design docs, specs and plans: that is the right way to work with agents. But be honest about the gap. If the docs are what your agents build from, the docs have to stay true, and in 92% of the repositories that hand their agents docs, nothing checks that they do.

Closing that gap doesn't mean hiring architects to trace dependencies by hand, and it certainly doesn't mean slowing your team down to pre-AI speed. It means giving the one unguarded practice the same thing every other practice already has: **an automatic, per-PR guardian.**

That's what Striff is. It reads the architecture your docs already describe, turns every checkable sentence into a rule, and evaluates each one at both revisions of every pull request. A rule can be as plain as where a class lives or as sharp as *"the domain module must not depend on infrastructure"*: if your team wrote it down, the pull request that breaks it is told which sentence it broke, quoted from the file it lives in. Every pull request also gets a diagram of what changed.

The bar is deliberately high, and the consequence is that it is quiet. That is the same bargain your linter makes: you trust it because it does not shout. Your linter guards style, your CI guards correctness, and the documents your agents build from finally get a guardian of their own, at whatever speed your team ships.

[Install the GitHub App](https://github.com/apps/striff-app/installations/new) and open your next pull request.
