---
title: "Afferent and efferent coupling, explained with numbers from real codebases"
description: "What afferent coupling (Ca) and efferent coupling (Ce) actually measure, why the instability metric matters, and how to read coupling numbers — illustrated with real values from Spring Framework and Apache Pinot."
date: 2025-11-18
---

Every architecture tool eventually shows you two numbers: **afferent coupling** and **efferent coupling**. Most engineers nod, vaguely recall the definitions point in opposite directions, and move on. That's a shame — because these two numbers, read together, are the closest thing software has to a *blood pressure reading* for a component.

Here's what they measure, why they matter, and — using **real values from Spring Framework and Apache Pinot** — how to tell a healthy number from a warning sign.

## The two directions

Both metrics count dependencies on a single component (a class, or a package). The only difference is which way the arrows point.

**Afferent coupling (Ca)** — arrows *in*. How many components depend on **you**. This is your *blast radius*: if you change, this is how many places can break.

**Efferent coupling (Ce)** — arrows *out*. How many components **you** depend on. This is your *exposure*: every outgoing arrow is a reason you might be forced to change.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Afferent vs. efferent — same node, opposite questions</p>
<svg class="bp-diagram" viewBox="0 0 820 300" role="img" aria-label="Two diagrams. Left: five arrows point inward to a node labeled AvroUtils, illustrating afferent coupling — who depends on you. Right: arrows point outward from a node labeled AbstractBeanFactory, illustrating efferent coupling — what you depend on.">
<defs>
<marker id="ceArrIn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/></marker>
<marker id="ceArrOut" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d97706"/></marker>
</defs>
<text x="205" y="34" font-size="13" font-weight="700" fill="#1d4ed8" text-anchor="middle">AFFERENT (Ca) — who depends on you</text>
<line class="bp-edge-draw" x1="70" y1="90" x2="150" y2="140" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="60" y1="160" x2="148" y2="160" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="70" y1="230" x2="150" y2="180" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="205" y1="70" x2="205" y2="128" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="205" y1="250" x2="205" y2="192" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<rect x="152" y="132" width="106" height="56" rx="10" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
<text x="205" y="156" font-size="11.5" class="bp-mono" fill="#1d4ed8" text-anchor="middle">AvroUtils</text>
<text x="205" y="174" font-size="10.5" fill="#3b82f6" text-anchor="middle">Ca = 24</text>
<text x="205" y="284" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">Change this → 24 places can break</text>
<text x="612" y="34" font-size="13" font-weight="700" fill="#b45309" text-anchor="middle">EFFERENT (Ce) — what you depend on</text>
<line class="bp-edge-draw" x1="660" y1="140" x2="742" y2="92" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="668" y1="160" x2="755" y2="160" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="660" y1="180" x2="742" y2="228" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="612" y1="128" x2="612" y2="72" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="612" y1="192" x2="612" y2="248" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="564" y1="140" x2="482" y2="92" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="556" y1="160" x2="470" y2="160" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<rect x="512" y="132" width="200" height="56" rx="10" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
<text x="612" y="156" font-size="11.5" class="bp-mono" fill="#92400e" text-anchor="middle">AbstractBeanFactory</text>
<text x="612" y="174" font-size="10.5" fill="#b45309" text-anchor="middle">Ce = 102</text>
<text x="612" y="284" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">102 reasons this class might be forced to change</text>
</svg>
<p class="bp-figure-caption">Both numbers are real: <code>AvroUtils</code> has an afferent coupling of <strong>24</strong> in Apache Pinot's parsed scope; <code>AbstractBeanFactory</code> reached an efferent coupling of <strong>102</strong> in Spring Framework. Both come from PRs <a href="/blog/architectural-findings-in-oss">we analyzed with Striff</a>.</p>
</div>

The definitions go back to Robert C. Martin's package-design metrics, which also give us the derived number worth knowing: **instability**, *I = Ce / (Ce + Ca)*. A component with high Ca and low Ce is *stable* (hard to justify changing, easy to depend on). One with high Ce and low Ca is *unstable* (free to change, dangerous to depend on). Neither is bad on its own — **problems start when a component is high on both axes at once.**

## The four quadrants

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Reading Ca and Ce together</p>
<div class="bp-quad">
<div class="bp-quad-cell bp-quad-cell--brand"><span class="bp-quad-tag">High Ca · Low Ce</span><p class="bp-quad-title">Stable core</p><p class="bp-quad-desc">Interfaces, domain types, shared contracts. Everyone depends on them; they depend on little. <em>Healthy — but every change here is expensive by design.</em></p></div>
<div class="bp-quad-cell bp-quad-cell--danger"><span class="bp-quad-tag">High Ca · High Ce</span><p class="bp-quad-title">The danger zone</p><p class="bp-quad-desc">Many dependents <em>and</em> many dependencies: god classes, "utils" dumping grounds, accidental bridges. Fragile to change, impossible to avoid. <code>AbstractBeanFactory</code> lives here.</p></div>
<div class="bp-quad-cell"><span class="bp-quad-tag">Low Ca · Low Ce</span><p class="bp-quad-title">Quiet leaf</p><p class="bp-quad-desc">Self-contained helpers and features. Change freely — almost nothing can break.</p></div>
<div class="bp-quad-cell bp-quad-cell--amber"><span class="bp-quad-tag">Low Ca · High Ce</span><p class="bp-quad-title">Orchestrator</p><p class="bp-quad-desc">Controllers, entry points, wiring code. Volatile but safe — nothing depends on them, so their churn doesn't ripple.</p></div>
</div>
<div class="bp-quad-axis"><span>↑ rows: afferent coupling (Ca)</span><span>columns: efferent coupling (Ce) →</span></div>
<p class="bp-figure-caption">The quadrant a component sits in matters more than either raw number. A Ce of 40 on an orchestrator is Tuesday; a Ce of 40 on a stable core component means <strong>every one of its many dependents inherits 40 new reasons to break</strong>.</p>
</div>

## Why the *delta* beats the absolute number

Here's where most static-analysis dashboards go wrong: they report absolute values and let you stare at them. But an absolute coupling number without context is nearly meaningless — Spring's `AbstractBeanFactory` has had high coupling for fifteen years and Spring works fine. What matters is **where a change happens, and which direction it's trending**.

The real Spring finding makes the point:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The same +3 delta, two very different meanings</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Leaf helper, Ce 5 → 8</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:8%"></div></div><span class="bp-bar-value">low risk</span></div>
<div class="bp-bar-row"><span class="bp-bar-label"><code>AbstractBeanFactory</code>, Ce 99 → 102</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:100%"></div></div><span class="bp-bar-value">flagged</span></div>
</div>
<p class="bp-figure-caption">Both changes add 3 outgoing dependencies. The first is noise. The second lands on a class <strong>hundreds of components depend on</strong> — so all of them inherit three new transitive reasons to break. Same diff-size, wildly different blast radius. Risk = <em>delta × afferent coupling</em>, not delta alone.</p>
</div>

The Pinot example shows the same logic on the other axis. In [apache/pinot #19073](https://github.com/apache/pinot/pull/19073), `SegmentProcessorAvroUtils` grew its efferent coupling from **36 to 44** in one PR — while sitting next to `AvroUtils`, a contract with **24 dependents**, which the same PR modified. Either number alone is unremarkable. Together they describe a class *becoming a bridge* between the core engine and a plugin — which is exactly what Striff flagged, and exactly what [Copilot's line-level review of the same PR](/blog/architectural-findings-in-oss) had no way to see.

## How to use these numbers on a real team

Skip the thresholds. Rules like "Ce must stay under 20" produce arguments, not architecture. What works:

- **Watch high-Ca components like production config.** Any PR that touches a component with dozens of dependents deserves a closer look — *especially* when the diff looks trivial. Small diffs on high-Ca nodes are where blast-radius accidents live.
- **Treat Ce growth on stable components as a smell.** A stable core component that keeps gaining outgoing dependencies is migrating toward the danger-zone quadrant, one convenient import at a time.
- **Track trends, not snapshots.** Coupling that grew 99 → 102 this month and 96 → 99 last month is a *direction*, and directions compound. This matters double [when AI tools multiply your PR volume](/blog/architecture-matters-more-not-less) — drift that took a year now takes a quarter.

<div class="bp-callout"><strong>The uncomfortable part: nobody computes this during review.</strong> Ca and Ce aren't in the diff. GitHub doesn't show them. To know that a three-line change grew coupling on a 24-dependent contract, someone has to build the dependency graph of both sides of the PR and compare — per pull request. No human does this by hand, which is why coupling regressions ship silently.</div>

That's the part Striff automates: it parses every PR into a component graph, computes Ca, Ce, and the deltas on the spot, and flags only the changes whose *position* makes them risky — a coupling spike on a high-dependency node, not a helper gaining its fifth import. Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and the numbers in this post show up on your own pull requests, automatically.
