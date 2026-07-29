---
title: "We scanned 175 PRs from repos that use AI code reviewers. Here are 20 where Striff caught what the bots missed."
description: "CodeRabbit, Greptile, Gemini, Sourcery, and Copilot were already reviewing these merged PRs — in Presto, Google Cloud, Apache Beam, LINE, and more. Striff found 64 structural issues; 63 appear nowhere in the bots' comments. Every PR is public; check our work."
date: 2026-07-28
---

AI code reviewers are everywhere now. So we ran an experiment with a simple, falsifiable premise: **take merged PRs from repos where an AI reviewer was demonstrably active — commenting on the very PR we analyze — and see what Striff's structural analysis finds that the bot's review didn't.**

Not cherry-picked repos with no review tooling. Repos that already pay for, or actively run, CodeRabbit, Greptile, Gemini Code Assist, Sourcery, or GitHub Copilot review.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The funnel</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">2,879</div><div class="bp-stat-label">recent merged PRs surveyed where an AI review bot commented</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">175</div><div class="bp-stat-label">structurally-biased candidates put through Striff's full pipeline</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">27</div><div class="bp-stat-label">PRs with HIGH or MEDIUM structural findings</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">20</div><div class="bp-stat-label">handpicked below — after discarding our own noise</div></div>
</div>
<p class="bp-figure-caption">Method: GitHub search for merged PRs (April–July 2026) with comments from CodeRabbit, Greptile, Gemini Code Assist, Sourcery, Qodo, or Copilot review, in Java/TypeScript/Python/C# repos; filtered to structural-change titles (refactor, extract, move, split…) and 2–30 changed files; analyzed with the same public Striff pipeline the <a href="https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen">browser extension</a> uses. Of the 27 flagged PRs we <strong>discarded 7</strong>: five whose findings were test-module artifacts, one sub-threshold coupling trend, and one to cap repo diversity. The same noise bar <a href="/blog/grounded-ai-findings">we hold the product to</a> applies to our marketing.</p>
</div>

## The 20 pull requests

Every row is a public, merged PR. The AI reviewer column is who actually commented on that PR; the findings column is what Striff's graph analysis flagged that never appeared in those comments.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Striff-only findings, in repos with AI review running</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Pull request</th><th>AI reviewer on the PR</th><th>What Striff flagged</th></tr></thead>
<tbody>
<tr><td><a href="https://github.com/prestodb/presto/pull/28184" target="_blank" rel="noopener">prestodb/presto #28184</a> <em>(16.7k★)</em></td><td>Copilot, Sourcery</td><td><strong>4 HIGH</strong> stable-contract changes: <code>HiveUtil</code> (35 dependents), <code>ParquetTypeUtils</code> (28), <code>Field</code> (22), <code>HiveTableLayoutHandle</code> (16) all modified in one PR</td></tr>
<tr><td><a href="https://github.com/Gitlawb/openclaude/pull/2008" target="_blank" rel="noopener">Gitlawb/openclaude #2008</a> <em>(30.4k★)</em></td><td>CodeRabbit (19 comments)</td><td>First-ever dependency from <code>services.api.openaiShim</code> back into its parent <code>services.api</code> package</td></tr>
<tr><td><a href="https://github.com/floci-io/floci/pull/1825" target="_blank" rel="noopener">floci-io/floci #1825</a> <em>(18k★)</em></td><td>Greptile</td><td><strong>New package-level dependency cycle</strong> through the CloudFormation services, plus two first-ever boundary crossings</td></tr>
<tr><td><a href="https://github.com/floci-io/floci/pull/2015" target="_blank" rel="noopener">floci-io/floci #2015</a> <em>(18k★)</em></td><td>Greptile</td><td>First <code>lifecycle → services.elbv2</code> edge in repo history; <code>ElbV2Service</code> complexity now 290</td></tr>
<tr><td><a href="https://github.com/GoogleCloudPlatform/DataflowTemplates/pull/4028" target="_blank" rel="noopener">GoogleCloudPlatform/DataflowTemplates #4028</a></td><td>Gemini Code Assist</td><td><strong>15 MEDIUM</strong> findings in one PR: coupling and complexity climbing across the JDBC-to-Spanner path (<code>PostgreSQLDialectAdapter</code> Ce 62→78)</td></tr>
<tr><td><a href="https://github.com/rommapp/romm/pull/3986" target="_blank" rel="noopener">rommapp/romm #3986</a> <em>(11.5k★)</em></td><td>Greptile, Copilot</td><td>New cache-writer hub forming in the scanner path</td></tr>
<tr><td><a href="https://github.com/HMCL-dev/HMCL/pull/6349" target="_blank" rel="noopener">HMCL-dev/HMCL #6349</a> <em>(9.7k★)</em></td><td>Gemini Code Assist (16 comments)</td><td>Installer UI pages each gained 5 outgoing dependencies (<code>AbstractInstallersPage</code> Ce 50→55)</td></tr>
<tr><td><a href="https://github.com/apache/beam/pull/39445" target="_blank" rel="noopener">apache/beam #39445</a> <em>(8.6k★)</em></td><td>Gemini Code Assist</td><td>Two new serializer classes plus coupling growth on <code>GcsOptions</code>, a 24-dependency component</td></tr>
<tr><td><a href="https://github.com/oshi/oshi/pull/3541" target="_blank" rel="noopener">oshi/oshi #3541</a> <em>(5.3k★)</em></td><td>CodeRabbit</td><td><code>MacCentralProcessor</code> complexity jumped 71→111 and coupling 62→70 in a single PR</td></tr>
<tr><td><a href="https://github.com/line/armeria/pull/6887" target="_blank" rel="noopener">line/armeria #6887</a> <em>(5.1k★)</em></td><td>CodeRabbit</td><td>5 findings: the xDS plugin path accumulating complexity and outgoing dependencies</td></tr>
<tr><td><a href="https://github.com/ArcReel/ArcReel/pull/1434" target="_blank" rel="noopener">ArcReel/ArcReel #1434</a> <em>(3.7k★)</em></td><td>CodeRabbit (12 comments), Gemini</td><td><strong>3 HIGH</strong>: first-ever <code>hooks → utils</code>, <code>canvas → hooks</code>, and <code>shared → hooks</code> edges — the frontend layering inverted in one merge</td></tr>
<tr><td><a href="https://github.com/intro-skipper/intro-skipper/pull/831" target="_blank" rel="noopener">intro-skipper/intro-skipper #831</a> <em>(2.6k★)</em></td><td>Sourcery, Copilot</td><td>Analyzers and Manager both reached directly into <code>Db</code> for the first time, skipping 2 layers each</td></tr>
<tr><td><a href="https://github.com/deepmodeling/deepmd-kit/pull/5786" target="_blank" rel="noopener">deepmodeling/deepmd-kit #5786</a> <em>(2k★)</em></td><td>CodeRabbit (7 comments)</td><td>New backend factory forming as a complexity hub</td></tr>
<tr><td><a href="https://github.com/fossasia/eventyay/pull/4568" target="_blank" rel="noopener">fossasia/eventyay #4568</a> <em>(1.6k★)</em></td><td>Copilot, Sourcery</td><td>New <code>SubmissionStatsMixin</code> born with WMC 78 — a god-class on day one</td></tr>
<tr><td><a href="https://github.com/Runfusion/Fusion/pull/2489" target="_blank" rel="noopener">Runfusion/Fusion #2489</a> <em>(1k★)</em></td><td>CodeRabbit, Greptile</td><td>New <code>SelfHealingGitEvidence</code> class born with WMC 77</td></tr>
<tr><td><a href="https://github.com/scalar-labs/scalardb/pull/3667" target="_blank" rel="noopener">scalar-labs/scalardb #3667</a></td><td>Gemini, Copilot</td><td>New abstract transaction-provider hub in the core provider path</td></tr>
<tr><td><a href="https://github.com/deepmodeling/dpdata/pull/1051" target="_blank" rel="noopener">deepmodeling/dpdata #1051</a></td><td>CodeRabbit</td><td><code>LMDBFormat</code> born at <strong>WMC 210</strong>, plus a first-ever <code>lmdb → dpdata</code> upward edge</td></tr>
<tr><td><a href="https://github.com/openwong2kim/wmux/pull/686" target="_blank" rel="noopener">openwong2kim/wmux #686</a></td><td>CodeRabbit (8 comments)</td><td>New edge from <code>playwright.tools</code> up to <code>mcp</code> root — first in this direction, skipping 4 layers</td></tr>
<tr><td><a href="https://github.com/receptron/mulmoclaude/pull/2590" target="_blank" rel="noopener">receptron/mulmoclaude #2590</a></td><td>CodeRabbit (11 comments), Sourcery</td><td>First <code>server.system → server.utils</code> edge, skipping 2 layers</td></tr>
<tr><td><a href="https://github.com/pkuehnel/TeslaSolarCharger/pull/2816" target="_blank" rel="noopener">pkuehnel/TeslaSolarCharger #2816</a></td><td>Gemini Code Assist</td><td>First-ever boundary crossing out of the solar-value-gathering template services</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption"><strong>20 PRs · 19 repos · 64 structural findings (21 HIGH) · 5 different AI review tools.</strong> We searched every bot comment on every PR above for these findings. Full disclosure: there is exactly <strong>one partial overlap</strong> — on the HMCL PR, Gemini raised a qualitative "tight coupling" concern about the same class Striff measured (Ce 50→55). The other <strong>63 findings appear in none of the bots' comments</strong>. The bots caught real implementation issues; the dependency-graph movement was invisible to them.</p>
</div>

## What the findings look like in aggregate

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
<p class="bp-figure-caption">Every category is invisible in a diff by construction: <a href="/blog/afferent-efferent-coupling-explained">coupling deltas</a> require the before/after graph, "first-ever edge" requires repo history, and <a href="/blog/package-dependency-cycles">cycles</a> require paths through files the PR never touched.</p>
</div>

Notice what's *not* here: the near-total disjointness isn't because the bots did badly. CodeRabbit left 19 comments on openclaude's PR, Gemini left 16 on HMCL's — real, useful, line-level reviews. **The two tool classes read different objects.** The bots read the implementation; Striff reads the change to the dependency graph, with repo history attached.

## The deepest head-to-head: same PR, both reviews in full

The sweep shows breadth; for depth, here are three PRs where we published Striff's full analysis next to the AI reviewer's, finding by finding:

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
<p class="bp-figure-caption">These three are dissected interactively — live diagrams, every finding, both tools' comments — in <a href="/#examples">the examples on our homepage</a>.</p>
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

## Where this started: the 12-repo scan

This sweep extends an earlier experiment: a **12-repo structural scan** of major Java codebases — Apache Kafka, Oracle GraalVM, Spring Framework, Redis Jedis, Trino, HikariCP, Liquibase, and more — that produced **95 findings, 31 high-risk**, from PRs whose diffs all looked routine. Four patterns kept repeating, and they're the same ones in the table above:

**Coupling spikes on shared components.** In **Spring Framework**, a seemingly simple change grew `AbstractBeanFactory`'s efferent coupling from **99 to 102** — on a core class *hundreds of components depend on*. The diff: three clean lines.

**Package-level dependency cycles.** **GraalVM** PR #13734 introduced a new package cycle through `NativeImageHeap`. No individual file diff shows a circular path.

**Layer violations.** In **modular-monolith-with-ddd** — a repository *explicitly built to demonstrate clean architecture* — Striff caught the Application layer specializing a concrete Domain event, violating the rule that Application depends on Domain *abstractions* only.

**Near-cycles.** **HikariCP** showed new edges that don't close a cycle on their own but, combined with existing paths, come one edge away. Caught now: a trivial fix. Left alone: the cycle a team dreads.

## Two tools, two objects

This is why the overlap keeps coming up zero. Each tool class is built to see a different representation of the same PR:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What each tool is built to see</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Review dimension</th><th>AI reviewers (CodeRabbit, Greptile, Gemini, Sourcery, Copilot, Qodo)</th><th>Striff</th></tr></thead>
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

<div class="bp-callout bp-callout--mint"><strong>The takeaway isn't "Striff instead of AI review" — it's that the two are complementary by construction.</strong> The 20 repos above are getting real value from their AI reviewers. They're also merging boundary inversions, contract rewrites, and package cycles that no diff-reading tool — human or AI — can see. On the evidence, you want both layers.</div>

## Check our work, then run it on yours

Every PR in this post is public and merged; click any link and read the bot's comments yourself. Then reproduce the experiment on your own code: install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and open your next pull request. The structural analysis runs automatically, right next to whatever AI reviewer you already use — no config needed.
