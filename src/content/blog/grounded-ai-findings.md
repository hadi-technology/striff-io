---
title: "The reviewer is not allowed to be the source of any claim"
description: "AI code review has a trust problem: fluent, plausible statements nobody can check. The fix is not a better prompt. It is an architecture where every fact is computed from two parsed revisions before a language model is handed anything, and the model's only job is to phrase what was already decided."
date: 2026-08-24
---

The common complaint about AI code review is not that it misses things. It is the opposite: **it says too much, too confidently, about too little.** Plausible comments that do not survive a second look. Speculation with the cadence of analysis. Enough of it that developers do the rational thing and stop reading the bot.

That is an adoption problem, not a prompt problem, and it cannot be fixed by asking the model to be more careful. So the design decision we made is structural: **a language model is never the source of a claim.** Everything below is what that costs and what it buys, including the findings we deliberately do not produce.

## Prose-first versus facts-first

The default way to build an AI reviewer is prose-first. Hand the diff, plus whatever retrieval surfaces, to a model and let it write what it notices. The output *is* the model's judgment; there is nothing underneath to check it against. When it is right, it is useful. When it is wrong, **it is wrong in fluent, confident English**, and the reviewer has to redo the analysis to find out which one they got.

Inverting that order means the measurement happens before any model is involved, and the model's job shrinks to narrating results it cannot alter.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Two pipelines, opposite trust models</p>
<div class="bp-legend" style="margin-top:0;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#d97706">Prose-first (the standard approach)</span></div>
<div class="bp-flow" style="--bp-flow-cols: 3">
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">1</span><p class="bp-flow-title">Diff + context</p><p class="bp-flow-desc">The pull request text and whatever retrieval surfaces.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">2</span><p class="bp-flow-title">The model reads and judges</p><p class="bp-flow-desc">One step is both the analysis and the source of truth. Nothing exists to verify it against.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">Fluent prose</p><p class="bp-flow-desc">Right or wrong, it reads the same. The reviewer inherits the verification work.</p></div>
</div>
<div class="bp-legend" style="margin-top:1.1rem;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#2563eb">Facts-first</span></div>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Parse</p><p class="bp-flow-desc">Both revisions are parsed into a component graph. Deterministic. No model.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">Compare</p><p class="bp-flow-desc">Edges added and removed, fan-in per type, namespaces entered, cycle paths, public members gained and lost. Computed, not generated.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Decide</p><p class="bp-flow-desc">Structural checks and documented rules run as programs over the compared graph. This step produces the findings, and it is a program.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">4</span><p class="bp-flow-title">Phrase</p><p class="bp-flow-desc">Only now does a model write, constrained to the extracted facts. It phrases; it does not discover.</p></div>
</div>
<p class="bp-figure-caption">Steps 1 to 3 own <em>truth</em>. Step 4 owns <em>readability</em>. A fabrication in step 4 has to contradict its own input, which makes it catchable by a program instead of by the reviewer's patience.</p>
</div>

Some of what a reviewer might expect to be under the hood here is not, on purpose. There is no learned model scoring which parts of the graph look unusual. We built one, ran it, and removed it: nothing a user could see depended on its output, and a score nobody can interrogate is exactly the kind of authority this design exists to refuse. What is left is smaller and entirely inspectable.

## Every claim traces to something you can look up

Abstract claims about grounding are cheap, so here is a real one, decomposed. [Activiti/activiti-cloud #2552](https://github.com/Activiti/activiti-cloud/pull/2552) removes a method from two public interfaces.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Facts first, sentence second</p>
<div class="bp-facts" style="margin-bottom:0.9rem">
<div class="bp-facts-line"><span class="bp-facts-key">① type</span>      org.activiti.cloud.api.process.model.IntegrationResult</div>
<div class="bp-facts-line"><span class="bp-facts-key">② removed</span>   public method <code>getIntegrationRequest()</code>, present at base, absent at head</div>
<div class="bp-facts-line"><span class="bp-facts-key">③ fan-in</span>    <span class="bp-facts-num">12</span> components in the parsed scope reference this type</div>
<div class="bp-facts-line"><span class="bp-facts-key">④ kind</span>      declared <code>interface</code>, so the method is not optional for implementers</div>
</div>
<div class="bp-annot"><mark><code>IntegrationResult</code> removed public method <code>getIntegrationRequest()</code></mark><sup>①②</sup>. <mark class="bp-m-danger">12 components in the parsed scope depend on this type</mark><sup>③</sup>.</div>
<p class="bp-figure-caption">If a fact is not in the extracted set, the sentence cannot contain it. The narration cannot say "this will break the build" because nothing computed that, and it cannot say "12 dependents" unless the comparison counted twelve. The number is symbolic; only the word order is neural.</p>
</div>

The second benefit is less obvious and matters more over time: **when this is wrong, it is wrong in a debuggable way.** A parser defect that dropped references to parameterised types produced findings built on missing edges. Because the fact layer is deterministic, that was an ordinary software bug — reproducible, testable, fixed in the parser, verified by re-running the corpus. There is no equivalent workflow for "the model felt confident". You cannot write a failing test for a vibe.

## The findings we refuse to produce

Grounding kills fabrication. It does nothing about the second species of noise: claims that are **structurally true and practically useless**. A fact-based system can generate those all day, which means the quality bar has to be about decision relevance, not truth.

The bar is one question: *does a reviewer already know this from the diff or from the diagram?*

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">True, and still not a finding</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Candidate</th><th>True?</th><th>Reported as a finding?</th></tr></thead>
<tbody>
<tr><td>"Efferent coupling on this component grew by 4"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> A metric delta implies no action on its own, a linter reports it better, and the number is already printed on the component. <a href="/blog/afferent-efferent-coupling-explained">Why a coupling delta is not a finding</a>.</td></tr>
<tr><td>"Weighted method complexity rose 36% in this class"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> Same reason. The class got bigger; the diff already showed you that.</td></tr>
<tr><td>"This pull request adds an import"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> It is a line of the diff. Being able to restate the diff is not analysis.</td></tr>
<tr><td>"Production code depends on test code" where the edge is an artefact of how test helpers are laid out</td><td><span class="bp-yes">✓</span></td><td><span class="bp-no">✗</span> Suppressed rather than defended, after it read as a false positive on a real repository.</td></tr>
<tr><td>"This edge closes a package cycle" / "this interface lost a method 12 things depend on" / "this contradicts a sentence in your README"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-yes">✓</span> Each requires the whole graph, or a document, or both.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The retired rows were not marginal. Metric-delta findings were about two thirds of everything the product emitted before they were cut. The metrics themselves are untouched — they still order the report and sit next to each component on the diagram. What they lost was the right to a row of their own.</p>
</div>

<div class="bp-callout"><strong>A false or irrelevant finding is a bug, not a difference of opinion.</strong> When a run surfaces something technically true and useless, the fix goes into the detection layer the way a crash would. Trust in a review tool is spent one comment at a time and earned back over months, and the exchange rate is bad.</div>

## Four outcomes, because two is a lie

The other half of not making things up is not *implying* things you never checked.

A boolean collapses "we checked and it is clean" into the same value as "we could not look". In front of a maintainer that collapse is worse than silence, because silence is not trusted and a green tick is. So every documented rule reports one of four outcomes:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every rule reports one of four</p>
<div class="bp-outcomes">
<div class="bp-outcome bp-outcome--danger"><p class="bp-outcome-name">Broken by this change</p><p class="bp-outcome-desc">A witness of the forbidden shape, named, and absent at the base revision. Every rule runs at both revisions, so this row is the change's doing and nobody else's.</p></div>
<div class="bp-outcome bp-outcome--amber"><p class="bp-outcome-name">Already broken</p><p class="bp-outcome-desc">Broken at head and at base. Its own row, because a check that fails a pull request for inherited debt is a check that gets switched off, and because folding it in with the passes puts a green tick on a rule the codebase violates.</p></div>
<div class="bp-outcome bp-outcome--mint"><p class="bp-outcome-name">Holds</p><p class="bp-outcome-desc">The query returned nothing anywhere in the graph, not merely nowhere the change touched. Reported with the number of components actually examined, because a rule checked across four hundred and a rule guarding one declaration are not the same assurance.</p></div>
<div class="bp-outcome bp-outcome--slate"><p class="bp-outcome-name">Could not be checked</p><p class="bp-outcome-desc">The rule names something the parsed model does not contain, or asks about a relation this language does not populate. Counted underneath the table: no row, no tick, and never a pass.</p></div>
</div>
<p class="bp-figure-caption">The fourth outcome exists because a source parser sees less than a compiler — no generated members, no annotations, no reflection, no string literals. A tool that renders those blind spots as a pass is lying at exactly the moment you are trusting it most.</p>
</div>

That last outcome is not theoretical. In one real repository, the documentation refers to a method `currentTurnCount()` on a type called `CompactionRequest`. That type is a Java record with a `currentTurnCount` component, so the accessor is generated by the compiler and a source parser never sees it. "The method is missing" would be false. "The rule passed" would be worse. The system says it could not tell, and says why.

## Why this matters more every quarter

Coding assistants are pushing pull request volume up, and automated review comments are multiplying in the same feeds. The scarce resource is no longer analysis. It is **attention and trust**, and a review tool only works if engineers still read it in month six.

That is the whole bet: fewer claims, each one traceable to a measured property of your dependency graph or to a sentence quoted verbatim from a file in your repository, delivered in the pull request where the risk appears. [Across thirty real open-source pull requests](/blog/architectural-findings-in-oss), that produced thirteen findings and twenty-one silent checks, and we published all of them, including the two we grade as weak.

[Install the check](https://github.com/apps/striff-app/installations/new) and open your next pull request. Every claim it makes is one you can go and verify, which is the only property that matters.
