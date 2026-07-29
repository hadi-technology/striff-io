---
title: "How we stop our AI reviewer from making things up"
description: "AI code review has a trust problem: plausible-sounding claims nobody can verify. Here's Striff's answer, a facts-first, neurosymbolic pipeline where the graph is measured before the AI writes a word, plus the findings we deliberately refuse to post."
date: 2026-03-10
---

The most common complaint about AI code review isn't that it misses things. It's the opposite: **it says too much, too confidently, about too little.** Plausible-sounding comments that don't survive a second look. Speculation dressed as analysis. Enough noise that developers do the rational thing: they stop reading the bot.

This is a real adoption killer, and it can't be fixed with a better prompt. So when we built Striff, we made a structural decision: **the AI is not allowed to be the source of any claim.** Here's what that means concretely, including the findings we deliberately *don't* post, and a bug that proved the design right.

## Prose-first vs. facts-first

The standard way to build an AI reviewer is prose-first: hand the diff (plus retrieved context) to a language model and let it write what it notices. The output quality *is* the model's judgment; there's nothing underneath to check against. When it's right, it's useful. When it's wrong, **it's wrong in fluent, confident English**, and the reviewer has to redo the analysis just to find out which one they got.

Striff inverts the order. The measurement happens *before* any AI is involved, and the AI's job is reduced to narrating results it cannot alter:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Two pipelines, opposite trust models</p>
<div class="bp-legend" style="margin-top:0;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#d97706">Prose-first (the standard approach)</span></div>
<div class="bp-flow" style="--bp-flow-cols: 3">
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">1</span><p class="bp-flow-title">Diff + context</p><p class="bp-flow-desc">The PR text and whatever retrieval surfaces.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">2</span><p class="bp-flow-title">LLM reads &amp; judges</p><p class="bp-flow-desc">One step is both the analysis and the source of truth. Nothing exists to verify it against.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">Fluent prose</p><p class="bp-flow-desc">Right or wrong, it reads the same. The reviewer inherits the verification work.</p></div>
</div>
<div class="bp-legend" style="margin-top:1.1rem;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#2563eb">Facts-first (Striff)</span></div>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Parse</p><p class="bp-flow-desc">Both sides of the PR are parsed into a component graph. Deterministic, no AI.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Measure</p><p class="bp-flow-desc">Coupling, new and deleted edges, layer depths, cycle paths: computed, not generated.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Detect</p><p class="bp-flow-desc">Structural rules and anomaly scoring run over the measured graph and produce the findings.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">4</span><p class="bp-flow-title">Narrate</p><p class="bp-flow-desc">Only now does an LLM write, constrained to the extracted facts. It phrases; it doesn't discover.</p></div>
</div>
<p class="bp-figure-caption">The neurosymbolic split: symbolic layers (1–3) own <em>truth</em>, the neural layer (4) owns <em>readability</em>. A hallucination in step 4 would have to contradict its own input, and gets caught against the facts, not the reviewer's patience.</p>
</div>

## What "grounded" looks like on a real finding

Abstract claims about grounding are cheap, so here's the actual anatomy of one finding from [apache/pinot #19073](https://github.com/apache/pinot/pull/19073). Every load-bearing phrase in the note maps to a measured fact:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every claim traces to a fact</p>
<div class="bp-facts" style="margin-bottom:0.9rem">
<div class="bp-facts-line"><span class="bp-facts-key">① new_edge</span>     core.util → plugin.inputformat.avro</div>
<div class="bp-facts-line"><span class="bp-facts-key">② prior_edges</span>  this direction: <span class="bp-facts-num">0</span></div>
<div class="bp-facts-line"><span class="bp-facts-key">③ layer_skip</span>   layer 1 → layer 3</div>
<div class="bp-facts-line"><span class="bp-facts-key">④ afferent</span>     AvroUtils: <span class="bp-facts-num">24</span> dependents</div>
</div>
<div class="bp-annot"><mark><code>SegmentProcessorAvroUtils</code> in <code>core.util</code> now calls directly into <code>plugin.inputformat.avro</code></mark><sup>①</sup>, <mark class="bp-m-danger">the first edge ever in this direction</mark><sup>②</sup>, <mark class="bp-m-amber">skipping a layer on the way</mark><sup>③</sup>. It also modifies <mark class="bp-m-mint">a contract that at least 24 components depend on</mark><sup>④</sup>.</div>
<p class="bp-figure-caption">If a fact isn't in the extracted set, the sentence can't say it. The model can't claim "this creates a cycle" unless the cycle detector found one, and can't cite "24 dependents" unless the parser counted 24. Phrasing is neural; every number and every edge is symbolic.</p>
</div>

This design has a second benefit that pure-LLM systems can't offer: **when we're wrong, we're debuggably wrong.** Recently our C# parser had a bug where generic types were registered under their parameterized names and dropped out of the graph, which meant some findings were built on missing edges. Because the fact layer is deterministic, this was an ordinary software bug: reproducible, testable, fixed at the parser level, and verified by re-scanning. You cannot do that with a hallucination. There's no failing test for "the model felt confident."

## The findings we refuse to post

Grounding kills fabricated claims, but there's a second species of noise: findings that are **structurally true and practically useless**. A fact-based system can generate these all day, so the quality bar has to be about *decision relevance*, not just truth. Some patterns we've deliberately suppressed or downranked:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">True, but not worth your attention</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Pattern</th><th>Structurally true?</th><th>Posted?</th></tr></thead>
<tbody>
<tr><td>"Production code depends on test modules" when the edge is an artifact of how test helpers are laid out</td><td><span class="bp-yes">✓ Yes</span></td><td><span class="bp-no">✗ No</span>. We hit exactly this scanning FastAPI, and it read as a false positive. It was suppressed, not defended.</td></tr>
<tr><td>Small coupling deltas on leaf components nothing depends on</td><td><span class="bp-yes">✓ Yes</span></td><td><span class="bp-no">✗ No</span>. A +3 on a quiet leaf is churn, not risk. It feeds the trend data instead.</td></tr>
<tr><td>High absolute coupling that's been stable for years</td><td><span class="bp-yes">✓ Yes</span></td><td><span class="bp-no">✗ No</span>. <a href="/blog/afferent-efferent-coupling-explained">Deltas on high-dependency nodes</a> matter; old news doesn't.</td></tr>
<tr><td>A first-ever boundary crossing, a new cycle, a contract change with dozens of dependents</td><td><span class="bp-yes">✓ Yes</span></td><td><span class="bp-yes">✓ Yes</span>. Severity-ranked, few in number.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">On real public PRs, Striff posts <strong>4 to 8 findings per pull request</strong>, not forty. A finding that makes a reviewer shrug costs more trust than a finding we skip.</p>
</div>

<div class="bp-callout"><strong>Our operating rule: a false or irrelevant finding is a bug, not a difference of opinion.</strong> When a scan surfaces something technically-true-but-useless, the fix goes into the detection layer, the same way a crash would. Trust in a review bot is spent in single comments and earned back in months.</div>

## Why this matters more right now

AI assistants are pushing PR volume up across the industry, and automated review comments are multiplying in the same feeds. The scarce resource is no longer *analysis*. It's **developer attention and trust**. A reviewer tool only works if engineers still read it in month six.

That's the bet behind the facts-first design: fewer findings, every one traceable to a measured property of your dependency graph, in the PR where the risk appears. [When we analyzed merged refactor PRs from popular repos](/blog/architectural-findings-in-oss), the structural risks Striff surfaced appeared in nobody else's review, human or bot, because nobody else was measuring the graph.

See what the pipeline extracts from your own code: install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and open any pull request. Every claim it makes, you can check.
