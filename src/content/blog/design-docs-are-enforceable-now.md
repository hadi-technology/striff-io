---
title: "Design docs matter more than ever. Now they can actually be enforced."
description: "In the AI era, a written design decision steers every generated line — and an unenforced one gets violated at machine speed. Here's how Striff's pipeline extracts structural facts from every PR and turns design-doc decisions into checks."
date: 2026-07-21
---

For twenty years, the design doc had one consumer: *other humans*. You wrote down the boundaries — "the core never depends on plugins," "the Application layer only touches Domain abstractions" — and hoped the next engineer would read it before their first PR.

That world is gone, and it changed in **both directions at once**.

**Docs got more valuable.** Coding agents read your project docs as context — `CLAUDE.md`, `AGENTS.md`, architecture notes, design docs. A decision you write down once now steers *thousands of generated lines*. A constraint you never wrote down simply doesn't exist to the agent generating your code.

**And docs got easier to violate.** The half-life of an unenforced decision was already short when humans shipped a few PRs a day. At AI-assisted volume, a boundary that lives only in a document gets crossed at machine speed — by contributors and agents who never opened it.

## A design decision without a mechanism is a wish

Here's the uncomfortable evidence. When [we scanned 12 major open-source repos](/blog/architectural-findings-in-oss), one of the cleanest findings came from **modular-monolith-with-ddd** — a repository whose *entire purpose* is to demonstrate clean architecture. Its layering rules aren't buried in a wiki; they're the point of the repo. Striff still caught the Application layer specializing a concrete Domain event, in direct violation of the documented rule.

If the flagship documented architecture drifts, yours will too. Not because anyone is careless — because **no step in the merge path ever checks the diff against the decision.**

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The life of an unenforced design decision</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Decided & written</p><p class="bp-flow-desc">“The core must never depend on plugins.” Reviewed, approved, committed to the docs.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Followed — for a while</p><p class="bp-flow-desc">The authors remember it. Early PRs respect it. Nothing checks it.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">Quietly violated</p><p class="bp-flow-desc">A refactor — human or AI-written — adds one edge in the wrong direction. The diff looks clean. It merges.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">4</span><p class="bp-flow-title">The doc is now fiction</p><p class="bp-flow-desc">Reality and the doc disagree. Every future reader — and every agent using it as context — is being misled.</p></div>
</div>
<p class="bp-figure-caption">Step 3 is where review tools should intervene — but a boundary crossing isn't visible in the lines of a diff, so line-level review (human or AI) waves it through.</p>
</div>

The cruelest part is step 4. In the AI era, a stale design doc isn't just unhelpful — it's **actively harmful**, because agents treat it as ground truth and generate more code on top of a fiction.

## How Striff turns decisions into checks

Enforcing a design decision requires two things no diff reader has: an actual **model of the system's structure**, and findings **grounded in facts** rather than plausible-sounding prose. Striff's pipeline is built around exactly that:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The Striff pipeline, per pull request</p>
<div class="bp-flow" style="--bp-flow-cols: 3">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Parse → facts</p><p class="bp-flow-desc">The PR is parsed into components, relationships, and OOP metrics — afferent/efferent coupling, layer depth, every new and deleted edge. Deterministic, not generated.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Score the structure</p><p class="bp-flow-desc">Structural analysis and anomaly detection over the graph: boundary crossings with no prior edge, cycles and near-cycle seeds, coupling spikes on high-dependency nodes.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">3</span><p class="bp-flow-title">Explain — grounded</p><p class="bp-flow-desc">A neurosymbolic layer writes the review note, but every claim must trace back to an extracted fact. No hallucinated architecture commentary.</p></div>
</div>
<p class="bp-figure-caption">The order matters: facts are extracted <em>before</em> any AI writes a word, so the explanation is constrained by the graph — not the other way around.</p>
</div>

"Facts" is not a figure of speech. Here is what stage 1 actually extracted on [apache/pinot #19073](https://github.com/apache/pinot/pull/19073), the PR where the core engine took its first-ever dependency on a plugin:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Extracted facts → finding</p>
<div class="bp-facts">
<div class="bp-facts-line"><span class="bp-facts-key">new_edge</span>        core.util → plugin.inputformat.avro</div>
<div class="bp-facts-line"><span class="bp-facts-key">prior_edges</span>     this direction: <span class="bp-facts-num">0</span>  (first in repo history)</div>
<div class="bp-facts-line"><span class="bp-facts-key">layer_skip</span>      layer 1 → layer 3  (<span class="bp-facts-num">1</span> layer skipped)</div>
<div class="bp-facts-line"><span class="bp-facts-key">afferent</span>        AvroUtils: <span class="bp-facts-num">24</span> dependents on the modified contract</div>
<div class="bp-facts-line"><span class="bp-facts-key">efferent</span>        SegmentProcessorAvroUtils: <span class="bp-facts-num">36 → 44</span></div>
<div class="bp-facts-line"><span class="bp-facts-flag">⚠ HIGH</span>          New directional boundary crossing — plugin boundary reversed</div>
</div>
<p class="bp-figure-caption">Every number is measured from the parsed graph. The finding — and the fix suggestion (invert the dependency, or extract a core-owned interface the plugin implements) — is assembled <strong>from</strong> these facts, so it can't drift into plausible-sounding fiction.</p>
</div>

## Your design doc, as a set of findings

Look at what the classic design-doc rules become when a PR is modeled as a graph change. These are all *real findings from real public PRs*:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Design decision → enforced check</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>The design doc says</th><th>Striff detected, on a real PR</th></tr></thead>
<tbody>
<tr><td>“The core never depends on plugins.”</td><td>First-ever <code>core.util → plugin.avro</code> edge in <strong>Apache Pinot</strong> — flagged HIGH before merge</td></tr>
<tr><td>“Application depends on Domain <em>abstractions</em> only.”</td><td>Application layer specializing a concrete Domain event in <strong>modular-monolith-with-ddd</strong></td></tr>
<tr><td>“Respect the layering — no skipping.”</td><td>A new upward edge skipping <strong>3 layers</strong> in <strong>EF Core</strong>, plus a cyclic dependency seed</td></tr>
<tr><td>“No package cycles.”</td><td>A new cycle through <code>NativeImageHeap</code> in <strong>GraalVM</strong>; near-cycle seeds in <strong>HikariCP</strong></td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">None of these rules is exotic — they're the first page of any architecture doc. What's new is that each one is now <strong>checked on every PR</strong>, instead of remembered on some.</p>
</div>

<div class="bp-callout"><strong>This is the closed loop:</strong> the design doc states the decision, the graph makes it measurable, and every pull request — human-written or AI-written — gets checked against it <em>automatically</em>. Your doc stops being a wish and starts being a gate.</div>

## Write the doc. Then wire it to reality.

If your team is leaning into AI-assisted development, the play is *not* to write fewer docs — it's the opposite. **Write the decisions down, because agents will read them.** Then make sure something structural is watching every PR, because agents (and humans) will also violate them — cleanly, plausibly, three lines at a time.

Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and open your next pull request. Striff extracts the facts and checks the structure automatically — no rule-writing, no config.
