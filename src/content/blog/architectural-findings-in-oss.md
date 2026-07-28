---
title: "We ran Striff and AI code reviewers on the same PRs. Here's what each one caught."
description: "Copilot and Qodo reviewed real PRs in Apache Pinot, TypeORM, and EF Core. So did Striff. The overlap between what they flagged: zero. Plus what a 12-repo structural scan of Kafka, GraalVM, and Spring found."
date: 2025-06-13
---

We wanted to answer a simple question with data instead of positioning: **when an AI code reviewer and Striff look at the same pull request, do they find the same things?**

So we ran two experiments. First, a **12-repo structural scan** of major open-source Java codebases — Apache Kafka, Oracle GraalVM, Spring Framework, Trino, HikariCP, and more — analyzing real PRs with Striff's full pipeline. Second, a set of **live head-to-head PRs** where an AI reviewer (GitHub Copilot or Qodo) had already posted its review, and we ran Striff on the identical diff.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The scoreboard</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">12</div><div class="bp-stat-label">major OSS repos scanned, one real PR each</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">95</div><div class="bp-stat-label">structural findings across those 12 PRs</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">31</div><div class="bp-stat-label">high-risk issues invisible in the file diff</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">0</div><div class="bp-stat-label">overlapping findings between Striff and the AI reviewers on head-to-head PRs</div></div>
</div>
<p class="bp-figure-caption">Every PR referenced below is public — repos include Apache Pinot, TypeORM, EF Core, Apache Kafka, Oracle GraalVM, Spring Framework, Redis Jedis, Trino, HikariCP, and Liquibase.</p>
</div>

That last number is the interesting one. **Zero overlap.** Not because either tool did a bad job — because they are reading *different objects*.

## The head-to-head PRs

Three PRs where an AI reviewer and Striff both posted reviews on the exact same code:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Same PR, different findings</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Pull request</th><th>The AI reviewer flagged</th><th>Striff flagged</th></tr></thead>
<tbody>
<tr><td><a href="https://github.com/apache/pinot/pull/19073" target="_blank" rel="noopener">apache/pinot #19073</a></td><td><strong>Copilot:</strong> one perf note — a zero-copy optimization for BigDecimal multi-value columns</td><td><strong>7 findings, 2 HIGH</strong> — the first dependency ever from Pinot's core into the Avro plugin package, plus a modified contract with 24 dependents</td></tr>
<tr><td><a href="https://github.com/typeorm/typeorm/pull/12647" target="_blank" rel="noopener">typeorm/typeorm #12647</a></td><td><strong>Qodo:</strong> 7 code-level comments — a bundler-breaking dynamic <code>require</code>, masked load errors, deleted tests</td><td><strong>4 findings, 2 HIGH</strong> — drivers rewired into <code>src.platform</code>, two new boundary crossings, a layer skip on both new edges</td></tr>
<tr><td><a href="https://github.com/dotnet/efcore/pull/38676" target="_blank" rel="noopener">dotnet/efcore #38676</a></td><td><strong>Copilot:</strong> implementation issues — a hard-coded type mapping on <code>COUNT(*)</code>, a bare catch, flaky static test state</td><td><strong>8 findings, 1 HIGH</strong> — a new upward edge skipping 3 layers, plus a cyclic dependency seed</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Overlap between the two columns, across all three PRs: <strong>zero findings</strong>. The AI reviewers read the implementation; Striff read the structure. Both were right.</p>
</div>

The Pinot case is worth seeing, because it's the cleanest example of a finding that *cannot* exist in a diff:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">apache/pinot #19073 — the core takes its first dependency on a plugin</p>
<svg class="bp-diagram" viewBox="0 0 820 300" role="img" aria-label="Dependency diagram: Pinot's core.util package draws a new red edge to the Avro plugin package, reversing the plugin boundary for the first time. The AvroUtils contract with 24 dependents is highlighted.">
<defs>
<marker id="bpArrowGray2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
<marker id="bpArrowRed2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker>
</defs>
<text x="130" y="36" font-size="12" font-weight="700" fill="#64748b" text-anchor="middle">CORE ENGINE</text>
<text x="660" y="36" font-size="12" font-weight="700" fill="#64748b" text-anchor="middle">PLUGINS</text>
<line x1="395" y1="20" x2="395" y2="280" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 5"/>
<line x1="590" y1="120" x2="250" y2="94" stroke="#94a3b8" stroke-width="2" marker-end="url(#bpArrowGray2)"/>
<line x1="590" y1="140" x2="250" y2="182" stroke="#94a3b8" stroke-width="2" marker-end="url(#bpArrowGray2)"/>
<path class="bp-edge-draw" d="M 252 116 C 380 150 480 148 586 132" fill="none" stroke="#dc2626" stroke-width="3" marker-end="url(#bpArrowRed2)"/>
<rect x="60" y="72" width="192" height="52" rx="10" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
<text x="156" y="94" font-size="12.5" class="bp-mono" fill="#1d4ed8" text-anchor="middle">core.util</text>
<text x="156" y="112" font-size="11" fill="#3b82f6" text-anchor="middle">SegmentProcessorAvroUtils</text>
<rect x="60" y="160" width="192" height="44" rx="10" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
<text x="156" y="186" font-size="12.5" class="bp-mono" fill="#475569" text-anchor="middle">core.segment</text>
<rect class="bp-node-pulse" x="590" y="98" width="180" height="52" rx="10" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
<text x="680" y="120" font-size="12.5" class="bp-mono" fill="#92400e" text-anchor="middle">plugin.avro</text>
<text x="680" y="138" font-size="11" fill="#b45309" text-anchor="middle">AvroUtils · 24 dependents</text>
<g class="bp-late">
<rect x="60" y="228" width="590" height="52" rx="8" fill="#fef2f2" stroke="#fecaca"/>
<text x="76" y="250" font-size="12" font-weight="700" fill="#b91c1c">⚠ New directional boundary crossing</text>
<text x="76" y="269" font-size="11.5" fill="#7f1d1d">0 prior edges from core.util into the Avro plugin — this PR reverses the plugin boundary</text>
</g>
<text x="418" y="186" font-size="11" fill="#94a3b8" font-style="italic">gray = existing edges (plugins depend on core)</text>
</svg>
<p class="bp-figure-caption">Plugin boundaries exist so the core never knows about plugins. This PR quietly reversed that direction for the first time in the repo's history — and skipped a layer on the way. Copilot's review of the same diff: one performance suggestion.</p>
</div>

## What the 12-repo scan turned up

The head-to-heads show the *kind* of thing diff review misses; the scan shows it's **systematic**. Four patterns kept repeating:

**Coupling spikes on shared components.** In **Spring Framework**, a seemingly simple change grew `AbstractBeanFactory`'s efferent coupling from **99 to 102** — on a core class *hundreds of components depend on*. The diff: three clean lines.

**Package-level dependency cycles.** **GraalVM** PR #13734 introduced a new package cycle through `NativeImageHeap`. Cycles compound: slower builds, harder testing, riskier refactors. No individual file diff shows a circular path.

**Layer violations.** In **modular-monolith-with-ddd** — a repository *explicitly built to demonstrate clean architecture* — Striff caught the Application layer specializing a concrete Domain event, violating the rule that Application depends on Domain *abstractions* only.

**Near-cycles.** **HikariCP** showed new edges that don't close a cycle on their own but, combined with existing paths, come one edge away. Caught now: a trivial fix. Left alone: the cycle a team dreads.

<div class="bp-callout"><strong>The common thread: every one of these 12 file diffs looked normal.</strong> Clean code, green tests, an approving line-level review. The risk existed only in how the change repositioned components inside the system's dependency graph.</div>

## Two tools, two objects

This is why the overlap was zero. Each tool class is built to see a different representation of the same PR:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What each tool is built to see</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Review dimension</th><th>AI reviewers (Copilot, Qodo, CodeRabbit, Claude)</th><th>Striff</th></tr></thead>
<tbody>
<tr><td>Logic bugs & edge cases</td><td><span class="bp-yes">✓ Strong</span></td><td><span class="bp-no">✗ Not its job</span></td></tr>
<tr><td>Style, idioms, naming</td><td><span class="bp-yes">✓ Strong</span></td><td><span class="bp-no">✗ Not its job</span></td></tr>
<tr><td>Test coverage gaps</td><td><span class="bp-yes">✓ Strong</span></td><td><span class="bp-no">✗ Not its job</span></td></tr>
<tr><td>Coupling trends on shared components</td><td><span class="bp-no">✗ Not in the diff</span></td><td><span class="bp-yes">✓ Core capability</span></td></tr>
<tr><td>New dependency cycles</td><td><span class="bp-no">✗ Not in the diff</span></td><td><span class="bp-yes">✓ Core capability</span></td></tr>
<tr><td>Boundary & layer violations</td><td><span class="bp-no">✗ Not in the diff</span></td><td><span class="bp-yes">✓ Core capability</span></td></tr>
<tr><td>Blast radius of a contract change</td><td><span class="bp-no">✗ Not in the diff</span></td><td><span class="bp-yes">✓ Core capability</span></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">AI reviewers treat a PR as <em>text in files</em>. Striff treats it as what it actually is: <strong>a change to a graph</strong> of components and relationships. Different representation, disjoint findings.</p>
</div>

<div class="bp-callout bp-callout--mint"><strong>The takeaway isn't "Striff instead of AI review" — it's that the two are complementary by construction.</strong> Use AI reviewers for code-level issues. Use Striff for the structural ones neither humans nor LLMs can see in a diff. On the evidence above, neither replaces the other.</div>

## Try it yourself

Every finding in this post came from a real PR in a real production codebase, and you can reproduce the experiment on your own code: install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and open your next pull request. The structural analysis runs automatically, right next to whatever AI reviewer you already use — no config needed.
