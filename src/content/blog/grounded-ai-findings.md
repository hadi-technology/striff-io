---
title: "The reviewer is not allowed to be the source of any claim"
description: "AI code review has a trust problem: fluent, plausible statements nobody can check. The fix is not a better prompt. It is an architecture where a language model reads your docs and phrases the result, and everything in between, every rule and every verdict, is computed from two parsed revisions."
date: 2026-08-24
---

The common complaint about AI code review is not that it misses things. It is the opposite: **it says too much, too confidently, about too little.** Plausible comments that do not survive a second look. Speculation with the cadence of analysis. Enough of it that developers do the rational thing and stop reading the bot.

That is an adoption problem, not a prompt problem, and it cannot be fixed by asking the model to be more careful. So the design decision we made is structural: **a language model is never the source of a claim.** Everything below is what that costs and what it buys, including the findings we deliberately do not produce.

## Prose-first versus facts-first

The default way to build an AI reviewer is prose-first. Hand the diff, plus whatever retrieval surfaces, to a model and let it write what it notices. The output *is* the model's judgment; there is nothing underneath to check it against. When it is right, it is useful. When it is wrong, **it is wrong in fluent, confident English**, and the reviewer has to redo the analysis to find out which one they got.

Inverting that order means the measurement happens in a program, and the model is confined to the two jobs it is actually good at: reading prose, and writing it.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Two pipelines, opposite trust models</p>
<div class="bp-legend" style="margin-top:0;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#d97706">Prose-first</span></div>
<div class="bp-flow" style="--bp-flow-cols: 3">
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">1</span><p class="bp-flow-title">Diff + context</p><p class="bp-flow-desc">The pull request text and whatever retrieval surfaces.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">2</span><p class="bp-flow-title">The model reads and judges</p><p class="bp-flow-desc">One step is both the analysis and the source of truth. Nothing exists to verify it against.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">Fluent prose</p><p class="bp-flow-desc">Right or wrong, it reads the same. The reviewer inherits the verification work.</p></div>
</div>
<div class="bp-legend" style="margin-top:1.1rem;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#2563eb">Facts-first: computed</span><span class="bp-chip" style="--bp-chip-color:#059669">Language model</span></div>
<div class="bp-flow" style="--bp-flow-cols: 5">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Parse</p><p class="bp-flow-desc">Both revisions become a compiler-grade model of the code.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">2</span><p class="bp-flow-title">Read</p><p class="bp-flow-desc">A model reads your docs and proposes candidate rules.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Ground and compile</p><p class="bp-flow-desc">Candidates naming anything not in the code are dropped. The rest become queries.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">4</span><p class="bp-flow-title">Evaluate</p><p class="bp-flow-desc">Every query, and fourteen structural checks, run at both revisions.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">5</span><p class="bp-flow-title">Narrate</p><p class="bp-flow-desc">A model phrases what was computed. It cannot add a finding.</p></div>
</div>
<p class="bp-figure-caption">Two of the five steps use a language model, and neither decides anything. Step 2 proposes; step 3 throws away every proposal that does not match real code. Step 5 phrases a verdict that already exists. A fabrication in either has to contradict its own input, which makes it catchable by a program instead of by the reviewer's patience.</p>
</div>

Some of what a reviewer might expect to be under the hood here is not, on purpose. There is no learned model scoring which parts of the graph look unusual. We built one, ran it, and removed it: nothing a user could see depended on its output, and a score nobody can interrogate is exactly the kind of authority this design exists to refuse. What is left is smaller and entirely inspectable.

## Every claim traces to something you can look up

Abstract claims about grounding are cheap, so here is a real one, decomposed. Ericsson's ecChronos documents its `core.impl` module class by class, and pull request [#1786](https://github.com/Ericsson/ecchronos/pull/1786) made one of those sentences false.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Prose in, facts under, one sentence out</p>
<div class="bp-facts" style="margin-bottom:0.9rem">
<div class="bp-facts-line"><span class="bp-facts-key">① doc </span>  core.impl/README.md:136</div>
<div class="bp-facts-line"><span class="bp-facts-key">  says</span>  "Calls RepairScheduler.putConfigurations() to keep jobs up to date"</div>
<div class="bp-facts-line"><span class="bp-facts-key">② rule</span>  refs("NodeWorker", "RepairScheduler", "_")  expect: true</div>
<div class="bp-facts-line"><span class="bp-facts-key">③ base</span>  holds: NodeWorker.java:209 calls putConfigurations(…)</div>
<div class="bp-facts-line"><span class="bp-facts-key">④ head</span>  fails: NodeWorker has no reference to RepairScheduler</div>
</div>

$$
\begin{gathered}
\varphi \coloneqq \htmlClass{lg-q}{\exists} k.\ \mathrm{refs}(\mathtt{NodeWorker},\ \mathtt{RepairScheduler},\ k) \\[8pt]
\mathcal{M}_{\mathrm{base}} \htmlClass{sat}{\models} \varphi \qquad \mathcal{M}_{\mathrm{head}} \htmlClass{unsat}{\nvDash} \varphi
\end{gathered}
$$

<div class="bp-annot"><mark><code>NodeWorker</code> no longer depends on <code>RepairScheduler</code></mark><sup>②④</sup>, which <mark class="bp-m-danger"><code>core.impl/README.md</code> line 136 says it calls</mark><sup>①</sup>. It did at the base revision<sup>③</sup>.</div>
<p class="bp-figure-caption">Step ② is the only neural part: a model read a bullet point and proposed a rule, the query in the rule language, which is the formula φ above. It survived grounding because both names resolve to real types in the parsed code. Steps ③ and ④ evaluate φ against the model of the code at each revision: satisfied at base, not at head. The sentence at the bottom can only be assembled from those two facts. The verdict is symbolic; only the word order is neural.</p>
</div>

Structural findings work the same way without the document. When [Activiti/activiti-cloud #2552](https://github.com/Activiti/activiti-cloud/pull/2552) removes `getIntegrationRequest()` from the public interface `IntegrationResult`, the finding says twelve components in the parsed scope depend on that type, because the comparison counted twelve. It cannot say "this will break the build", because nothing computed that. **If a fact is not in the extracted set, the sentence cannot contain it.**

The second benefit is less obvious and matters more over time: **when this is wrong, it is wrong in a debuggable way.** A parser defect that dropped references to parameterised types produced findings built on missing edges. Because the fact layer is deterministic, that was an ordinary software bug: reproducible, testable, fixed in the parser, verified by re-running the corpus. There is no equivalent workflow for "the model felt confident". You cannot write a failing test for a vibe.

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
<tr><td>"This change made a sentence in your README false" / "this edge closes a package cycle" / "this interface lost a method 12 things depend on"</td><td><span class="bp-yes">✓</span></td><td><span class="bp-yes">✓</span> Each needs a document, or the whole graph at both revisions, or both.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">The retired rows were not marginal. Metric-delta findings were about two thirds of everything the product emitted before they were cut. The metrics themselves are untouched: they still order the report and sit next to each component on the diagram. What they lost was the right to a row of their own.</p>
</div>

<div class="bp-callout"><strong>A false or irrelevant finding is a bug, not a difference of opinion.</strong> When a run surfaces something technically true and useless, the fix goes into the detection layer the way a crash would. Trust in a review tool is spent one comment at a time and earned back over months, and the exchange rate is bad.</div>

## Five outcomes, because two is a lie

The other half of not making things up is not *implying* things you never checked.

A boolean collapses "we checked and it is clean" into the same value as "we could not look". In front of a maintainer that collapse is worse than silence, because silence is not trusted and a green tick is. So every documented rule reports one of five outcomes:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Every rule reports one of five</p>
<div class="bp-outcomes">
<div class="bp-outcome bp-outcome--danger"><p class="bp-outcome-name">Violated</p><p class="bp-outcome-desc">True at the base revision, false at yours, with the witness named. Every rule runs at both revisions, so this row is the change's doing and nobody else's.</p></div>
<div class="bp-outcome bp-outcome--amber"><p class="bp-outcome-name">Pre-existing</p><p class="bp-outcome-desc">False at both revisions, with a witness. Its own row, because failing a pull request for inherited debt gets a check switched off, and folding it in with the passes puts a green tick on a rule the codebase breaks.</p></div>
<div class="bp-outcome bp-outcome--mint"><p class="bp-outcome-name">Held</p><p class="bp-outcome-desc">Not broken anywhere in the model this change produces, not merely nowhere the change touched.</p></div>
<div class="bp-outcome bp-outcome--brand"><p class="bp-outcome-name">Restored</p><p class="bp-outcome-desc">False at base, true at head: the change fixed something the docs promised. The only outcome that congratulates an author, so it is withheld when the same pull request also wrote the sentence.</p></div>
<div class="bp-outcome bp-outcome--slate"><p class="bp-outcome-name">Couldn't check</p><p class="bp-outcome-desc">The rule names something the parsed model does not contain, or asks about a relation this language does not populate. Counted underneath the list: no tick, and never a pass.</p></div>
</div>
<p class="bp-figure-caption">The last outcome exists because a source parser sees less than a compiler: no generated members, no annotations, no reflection, no string literals. A tool that renders those blind spots as a pass is lying at exactly the moment you are trusting it most.</p>
</div>

Each outcome is nothing more than a pair of facts: whether the code at the base revision satisfies the rule, and whether the code at head does. Written out, the whole scheme fits in five lines.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The same five, formally</p>

$$
\begin{array}{lcc}
 & \mathcal{M}_{\mathrm{base}} & \mathcal{M}_{\mathrm{head}} \\[3pt] \hline
\textsf{Violated} & \htmlClass{sat}{\models}\,\varphi & \htmlClass{unsat}{\nvDash}\,\varphi \\
\textsf{Pre-existing} & \htmlClass{unsat}{\nvDash}\,\varphi & \htmlClass{unsat}{\nvDash}\,\varphi \\
\textsf{Restored} & \htmlClass{unsat}{\nvDash}\,\varphi & \htmlClass{sat}{\models}\,\varphi \\
\textsf{Held} & \htmlClass{sat}{\models}\,\varphi & \htmlClass{sat}{\models}\,\varphi \\[3pt] \hline
\textsf{Couldn't check} & \varphi\ \text{undefined over}\ \mathcal{M} & \varphi\ \text{undefined over}\ \mathcal{M}
\end{array}
$$

<p class="bp-figure-caption">Each column is the model of the code parsed at that revision, and φ is the rule. Only the first row is attributed to the change: that attribution is all "differential evaluation" means. The last row is not a truth value at all. φ names something the model does not contain, so neither ⊨ nor ⊭ is defined, and the rule is counted rather than passed.</p>
</div>

That last outcome is not theoretical, and it is not rare. In one real repository, the documentation refers to a method `currentTurnCount()` on a type called `CompactionRequest`. That type is a Java record with a `currentTurnCount` component, so the accessor is generated by the compiler and a source parser never sees it. "The method is missing" would be false. "The rule held" would be worse. The system says it could not tell, and says why.

Across a scan of 74 public pull requests, 518 of 1,912 rule evaluations came back as couldn't check. A tool that folded those into the passes would have shown 1,862 green ticks, and more than a quarter of them would have been guesses.

## Why this matters more every quarter

Coding assistants are pushing pull request volume up, and automated review comments are multiplying in the same feeds. The scarce resource is no longer analysis. It is **attention and trust**, and a review tool only works if engineers still read it in month six.

That is the whole bet: fewer claims, each one traceable to a sentence quoted verbatim from a file in your repository or to a measured property of your dependency graph, delivered in the pull request where the risk appears. [Across 1,912 documented-rule evaluations](/blog/design-docs-are-enforceable-now), that produced exactly one violation, and it was a real one. Across thirty open-source pull requests, it produced thirteen structural findings and twenty-one silent checks.

[Install the check](https://github.com/apps/striff-app/installations/new) and open your next pull request. Every claim it makes is one you can go and verify, which is the only property that matters.
