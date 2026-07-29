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
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">1 in 3</div><div class="bp-stat-label">merged refactor PRs carried unreviewed structural risk (our own analysis)</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://www.gitclear.com/ai_assistant_code_quality_2025_research" target="_blank" rel="noopener">GitClear AI Code Quality research</a>, <a href="https://dora.dev/research/2024/dora-report/" target="_blank" rel="noopener">Google's 2024 DORA report</a>, <a href="https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness/" target="_blank" rel="noopener">GitHub Copilot research</a>, and <a href="/blog/architectural-findings-in-oss">our analysis of merged refactor PRs</a>.</p>
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
<tr><td>Dependency direction &amp; boundaries</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
<tr><td>Coupling staying in check</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
<tr><td>No dependency cycles</td><td><em>Nobody</em></td><td><span class="bp-no">✗ Erodes silently</span></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The unguarded rows share a property: they're <strong>global</strong>. You cannot check them by looking at one file, one diff, or one PR. They exist only in the relationships <em>between</em> components, which is exactly what per-file tooling can't see.</p>
</div>

This is the transition the comforting story misses. The practices that survived the volume increase are the *local* ones. The practice with no guardian is **architecture**: which component depends on which, whether boundaries hold, whether the system's shape is drifting. And architecture is the practice where damage compounds hardest, because you can't refactor your way out of a shape problem one file at a time.

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

That proxy is now broken, and here's the mechanism. A diff shows you lines. It does not show you that those lines created the first-ever edge from your core into a plugin, or closed a cycle across five packages, or modified a contract with 35 dependents. That information lives in the relationship between this change and every change before it. It is structurally absent from the thing your reviewers are reading:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The same PR, two representations</p>
<svg class="bp-diagram" viewBox="0 0 820 330" role="img" aria-label="Left: a diff view showing three added lines with all checks passing. Right: a dependency graph view where the same change draws a new red edge that completes a package cycle.">
<rect x="10" y="14" width="380" height="300" rx="14" fill="#ffffff" stroke="#cbd5e1"/>
<text x="30" y="46" font-size="13" font-weight="700" fill="#0f172a">What review sees</text>
<rect x="30" y="62" width="340" height="26" rx="6" fill="#f1f5f9"/>
<text x="42" y="79" font-size="12" class="bp-mono" fill="#475569">refactor: extract schema utils · +3 -0</text>
<rect x="30" y="98" width="340" height="22" rx="4" fill="#dcfce7"/>
<text x="42" y="113" font-size="11.5" class="bp-mono" fill="#166534">+ import ImageHeapUtils</text>
<rect x="30" y="124" width="340" height="22" rx="4" fill="#dcfce7"/>
<text x="42" y="139" font-size="11.5" class="bp-mono" fill="#166534">+ layout = ImageHeapUtils.pack(obj)</text>
<rect x="30" y="150" width="340" height="22" rx="4" fill="#dcfce7"/>
<text x="42" y="165" font-size="11.5" class="bp-mono" fill="#166534">+ return layout</text>
<text x="30" y="207" font-size="12.5" fill="#059669" font-weight="700">✓ Tests passing</text>
<text x="30" y="231" font-size="12.5" fill="#059669" font-weight="700">✓ Lint clean</text>
<text x="30" y="255" font-size="12.5" fill="#059669" font-weight="700">✓ Review approved</text>
<text x="30" y="296" font-size="11.5" fill="#64748b" font-style="italic">Three clean lines. Nothing to flag.</text>
<rect x="430" y="14" width="380" height="300" rx="14" fill="#ffffff" stroke="#cbd5e1"/>
<text x="450" y="46" font-size="13" font-weight="700" fill="#0f172a">What the graph sees</text>
<defs>
<marker id="bpArrowGray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
<marker id="bpArrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker>
</defs>
<line x1="533" y1="112" x2="620" y2="180" stroke="#94a3b8" stroke-width="2" marker-end="url(#bpArrowGray)"/>
<line x1="640" y1="196" x2="716" y2="126" stroke="#94a3b8" stroke-width="2" marker-end="url(#bpArrowGray)"/>
<path class="bp-edge-draw" d="M 700 100 C 660 52 570 52 528 92" fill="none" stroke="#dc2626" stroke-width="2.5" marker-end="url(#bpArrowRed)"/>
<rect x="470" y="86" width="96" height="34" rx="8" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
<text x="518" y="107" font-size="12" class="bp-mono" fill="#1d4ed8" text-anchor="middle">core.graph</text>
<rect class="bp-node-pulse" x="586" y="176" width="88" height="34" rx="8" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
<text x="630" y="197" font-size="12" class="bp-mono" fill="#b91c1c" text-anchor="middle">core.heap</text>
<rect x="676" y="86" width="96" height="34" rx="8" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
<text x="724" y="107" font-size="12" class="bp-mono" fill="#475569" text-anchor="middle">core.meta</text>
<g class="bp-late">
<rect x="460" y="238" width="330" height="52" rx="8" fill="#fef2f2" stroke="#fecaca"/>
<text x="476" y="260" font-size="12" font-weight="700" fill="#b91c1c">⚠ New package-level dependency cycle</text>
<text x="476" y="279" font-size="11.5" fill="#7f1d1d">heap → meta → graph → heap · new with this PR</text>
</g>
</svg>
<p class="bp-figure-caption">The red edge exists only in the relationship between this change and the edges that were already there. No amount of careful diff-reading surfaces it, because it isn't in the diff.</p>
</div>

And this is exactly the pattern our own data shows in the wild: [when we analyzed merged refactor PRs from popular open-source repos](/blog/architectural-findings-in-oss), a third of them moved the dependency graph in ways that deserved attention. Contracts with dozens of dependents rewritten. First-ever boundary crossings. A package cycle, born in a PR whose diff looked immaculate. All reviewed. All merged.

## The bill comes due quietly

The failure mode of high-volume AI development isn't dramatic. Nothing crashes. The failure mode is a codebase that accumulates coupling, cycles, and misplaced responsibilities one clean-looking PR at a time, until one day the symptoms surface as things nobody connects back to architecture: builds got slow. Onboarding takes months. Every estimate has a fudge factor because every change touches more than it should.

<div class="bp-callout bp-callout--amber"><strong>Teams that ship 10x faster while their structural oversight stays flat aren't being efficient. They're borrowing.</strong> The loan comes due as a system that technically passes every check while becoming harder to change every week, and by the time it's obvious, the cheap moment to fix it is hundreds of merges in the past.</div>

## So what do you actually do?

Keep every practice you already have. They matter more now, not less; that's the whole first half of this post. But be honest about the gap: nothing in your current setup is watching the graph.

Closing that gap doesn't mean hiring architects to trace dependencies by hand, and it certainly doesn't mean slowing your team down to pre-AI speed. It means giving the one unguarded practice the same thing every other practice already has: **an automatic, per-PR guardian.**

That's what Striff is. It models every pull request as a change to your dependency graph, compares before and after, and speaks up only when the structure actually moves: a coupling spike on a component everything depends on, a first-ever boundary crossing, a cycle forming. On clean PRs it stays silent. Your linter guards style, your CI guards correctness, and the graph finally gets a guardian of its own, at whatever speed your team ships.

Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and run it on your next pull request. It takes about thirty seconds, and the architecture layer of your codebase stops being the one thing nobody's watching.
