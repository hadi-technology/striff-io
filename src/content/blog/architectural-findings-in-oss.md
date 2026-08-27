---
title: "Thirty open-source pull requests, thirteen findings, twenty-one silent checks"
description: "A structural reviewer that flags every pull request is a reviewer nobody reads. Here is the complete output of a quiet one across thirty real pull requests in eleven public repositories: all thirteen findings, all forty-nine documented-rule verdicts, the two findings we grade as weak, and the six questions it declined to answer."
date: 2026-08-26
---

The interesting number for an automated reviewer is not how much it finds. It is **how often it says nothing.**

That number is easy to hide and easy to fake, so here it is measured, on a window of thirty real pull requests from eleven public repositories, analysed with the same pipeline that runs on a live one. Twenty-one of the thirty produced nothing at all. This post is every finding from the other nine, every documented rule the same window evaluated, the two findings we think were weak and why, and the ones the system declined to answer.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The window</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">30</div><div class="bp-stat-label">pull requests analysed, across 11 public repositories</div></div>
<div class="bp-stat bp-stat--mint"><div class="bp-stat-value">21</div><div class="bp-stat-label">produced no structural finding at all</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">13</div><div class="bp-stat-label">structural findings in total, spread over the other nine</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">36</div><div class="bp-stat-label">distinct rules read out of the repositories' own documentation</div></div>
</div>
<p class="bp-figure-caption">Thirty analyses is a window, not a study, and it is drawn from repositories that happened to have open or recent pull requests when the window ran. It is small enough to list exhaustively, which is the point: everything below is the whole output, not the highlights.</p>
</div>

## What has to be true before something is a finding

The bar is a single question: **does a reviewer already know this from the diff or from the diagram?**

An added import is in the diff. A class that grew is in the diff. A component's coupling number is printed on the component, on the diagram, next to the component. None of those needs a finding, because a finding is a claim on someone's attention, and a claim you can already see costs trust without buying anything.

What survives that bar is the set of things that require the *whole graph* — both revisions of it — to know:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What each structural check is looking for</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Check</th><th>Looks for</th><th>Why the diff can't show it</th></tr></thead>
<tbody>
<tr><td>Package cycles</td><td>a dependency cycle between packages that this change completes or joins</td><td>the closing edge is one line; the loop runs through files the change never touched</td></tr>
<tr><td>Cycle seeds</td><td>a new edge closing a short cycle against a route that already existed</td><td>requires the route, which is not in the diff</td></tr>
<tr><td>Boundary crossings</td><td>a new dependency between packages, or one inverting an existing edge</td><td>"first ever in this direction" is a fact about every prior revision</td></tr>
<tr><td>Module boundaries</td><td>a new dependency reaching into another module's internal package</td><td>the diff shows the import, not that the target was internal</td></tr>
<tr><td>Production → test edges</td><td>production code newly depending on test-only code</td><td>requires knowing which side of the line each component sits on</td></tr>
<tr><td>Public contract stability</td><td>public methods removed from a type many others depend on</td><td>the removal is visible; <em>how many things depend on the type</em> is not</td></tr>
<tr><td>Abstraction contracts</td><td>a member added to an abstraction that its existing implementers must now supply</td><td>the implementers are elsewhere</td></tr>
<tr><td>Interface downgrades</td><td>a dependency moved off an abstraction onto a concrete class</td><td>looks like a one-word type change in the diff</td></tr>
<tr><td>Component scope</td><td>a class reaching into a namespace it had never used</td><td>"had never" is history, not diff</td></tr>
<tr><td>Documented rules</td><td>a change contradicting something this repository's own docs say about the code</td><td>the sentence is in a different file, usually one nobody opened</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Every row shares one property: answering it means holding both revisions of the dependency graph at once. That is the entire scope of the product, and the reason the check is silent so often — most pull requests do not move the graph.</p>
</div>

## All thirteen

### An interface quietly lost a method that twelve things depend on

[Activiti/activiti-cloud #2552](https://github.com/Activiti/activiti-cloud/pull/2552) is titled *"Remove integration request from integration result and integration error"*, so the removal is not a secret. What the diff does not say is the size of the surface it removes from.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The finding, and the facts under it</p>
<div class="bp-facts">
<div class="bp-facts-line"><span class="bp-facts-key">type </span>  org.activiti.cloud.api.process.model.<strong>IntegrationResult</strong> (interface)</div>
<div class="bp-facts-line"><span class="bp-facts-key">diff </span>  <span class="bp-facts-neg">−</span> IntegrationRequest getIntegrationRequest();</div>
<div class="bp-facts-line"><span class="bp-facts-key">fanin</span>  <span class="bp-facts-num">12</span> components in the parsed scope depend on this type</div>
<div class="bp-facts-line">&nbsp;</div>
<div class="bp-facts-line"><span class="bp-facts-key">type </span>  org.activiti.cloud.api.process.model.<strong>IntegrationError</strong> (interface)</div>
<div class="bp-facts-line"><span class="bp-facts-key">diff </span>  <span class="bp-facts-neg">−</span> IntegrationRequest getIntegrationRequest();</div>
<div class="bp-facts-line"><span class="bp-facts-key">fanin</span>  <span class="bp-facts-num">9</span> components in the parsed scope depend on this type</div>
<div class="bp-facts-line">&nbsp;</div>
<div class="bp-facts-line"><span class="bp-facts-flag">⚠ Public contract stability</span>  two interfaces, one method each, 21 dependents between them</div>
</div>
<p class="bp-figure-caption">The removal is deliberate and the pull request is doing exactly what its title says. The finding is not "this is wrong"; it is <strong>the count</strong>, delivered at the moment a reviewer is deciding how carefully to read the rest of the change. Twelve is a different review from two.</p>
</div>

### A query builder reached into two packages it had never touched

[opensearch-project/neural-search #1962](https://github.com/opensearch-project/neural-search/pull/1962) wires two new score normalizers into fused mode. `HybridQueryBuilder` picks up imports from the `fusion` and `processor.normalization` packages — two namespaces it had never referenced, on top of the four it already worked across.

Each import is one line, and each is obviously necessary for the feature. The finding is not about the lines. It is that a component whose job was building queries now also resolves normalization strategies, and the evidence for that is a count of namespaces before and after, which nothing in the diff carries. The sibling pull request, [#1948](https://github.com/opensearch-project/neural-search/pull/1948), did the same thing to `HybridFusionOrchestrator`: two established namespaces, a third one entered.

### Two types changed packages, and the check said so without calling it a defect

[kmgowda/SBK #492](https://github.com/kmgowda/SBK/pull/492) moved `RemoteRuntimeFiles` and its inner `IoOperation` from `io.gem.api.impl` to `io.gem.agent` — a git rename, which in a diff viewer is a file that disappears and a file that appears.

<div class="bp-callout"><strong>Type relocations are reported as context, not as a defect.</strong> Moving a class is usually correct and often overdue. But a relocation silently rewrites every edge into and out of that type, so the reviewer who does not notice the move is reading a graph that no longer exists. The check names what moved and where it went, and stops there.</div>

The same pull request produced the one genuinely interesting finding in it: `SbkGemBenchmark`, which had worked across ten namespaces, now reaches into two more. That is what a relocation does when the thing that moved is still needed where it was.

### Four more edges and a removal

[micronaut-serialization #1327](https://github.com/micronaut-projects/micronaut-serialization/pull/1327) put the first dependencies from two source-generation packages onto the naming-strategy package. [smallrye-graphql #2083](https://github.com/smallrye/smallrye-graphql/pull/2083) put the first edge from the client's value formatter onto the public API package, by importing three custom scalar types. [micronaut-serialization #1389](https://github.com/micronaut-projects/micronaut-serialization/pull/1389) deleted `openReferenceScope()` and the inner `ReferenceScope` interface from `PropertyReferenceManager`, a type nine components in scope depend on.

All low or medium. All one or two lines of check output. That is the entire structural yield of thirty pull requests, and if it feels thin, it is supposed to: the alternative is a reviewer with something to say every time, which is the same thing as having nothing to say.

### The two we would grade as weak

Two of the thirteen were the same shape, and we would rather point at them than wait for you to find them.

[smallrye-graphql #1424](https://github.com/smallrye/smallrye-graphql/pull/1424) was reported as `Wrapper` removing the public methods `isNotEmpty()` and `setNotEmpty(boolean)`, against twelve dependents. [smallrye-graphql #1690](https://github.com/smallrye/smallrye-graphql/pull/1690) was reported as `Directives` removing a `buildDirectiveInstances` overload, against five.

Both are true. Both are also **renames**. `setNotEmpty` became `setNonNull`; the callback parameter on `buildDirectiveInstances` became an `Annotations` object. In each case the same pull request updated every caller it owned, which is precisely what a competent author does, and the finding is telling a reviewer to go check something the diff already handled.

<div class="bp-callout bp-callout--amber"><strong>A removal and a rename look identical to a graph.</strong> The type's public surface lost a name and the fan-in count is real; what the graph cannot see is that an adjacent name arrived to replace it and the callers moved across in the same commit. Two of thirteen findings in this window were that. We would rather show you the miss rate than round it off, and a reader deciding whether to install something is entitled to know which of its outputs are weakest.</div>

## The other half: the rules the repositories wrote themselves

The structural checks above are ours. The more interesting ones are the repository's own, because a maintainer does not argue with a sentence they wrote.

The system reads the markdown already in the repository, turns statements about the code into checkable rules, and evaluates each one against the graph at both revisions. Across this window, seven of the eleven repositories yielded rules; four yielded none, because they had no documentation that said anything checkable about their own structure.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">49 rule evaluations across 30 pull requests</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Holds</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:100%"></div></div><span class="bp-bar-value">39</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Could not be answered</span><div class="bp-bar-track"><div class="bp-bar" style="width:15%"></div></div><span class="bp-bar-value">6</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Already broken, before this change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:10%"></div></div><span class="bp-bar-value">4</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Broken <em>by</em> this change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:0%"></div></div><span class="bp-bar-value">0</span></div>
</div>
<p class="bp-figure-caption">Zero, in this window. A documented rule broken by the pull request under review is a rare event, and a tool that produced them at a comfortable rate would be producing them wrongly. The other three rows are the ones that do the work.</p>
</div>

### A rule that holds is the product working

OneBusAway's `gtfs-modules` documents a customisation recipe, and one line of it is a statement about the model:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">A negative fact, checked</p>
<div class="bp-facts">
<div class="bp-facts-line"><span class="bp-facts-key">doc  </span>  docs/index.md</div>
<div class="bp-facts-line"><span class="bp-facts-key">quote</span>  "<span class="bp-facts-quote">The <code>extra_stop_info</code> field isn't included in the <code>Stop</code> data model by default.</span>"</div>
<div class="bp-facts-line"><span class="bp-facts-key">rule </span>  Stop does not declare <code>extra_stop_info</code> as a field</div>
<div class="bp-facts-line"><span class="bp-facts-flag" style="background:#059669">✓ HOLDS</span>  checked at both revisions of three separate pull requests</div>
</div>
<p class="bp-figure-caption">This is the shape most documented rules have, and it is the one people underrate. The sentence exists because someone will eventually want that field. The day somebody adds it to <code>Stop</code> to save a subclass, the recipe underneath becomes wrong, and this row turns over. Until then it is a green tick on a promise the project made in writing.</p>
</div>

### A rule already broken gets its own row, and not the author's name on it

The `openmrs-module-fhir2` module states the intent of its service layer plainly in its README: *"`Service` classes should depend only on the interfaces of `Translator`s and `Dao`s, to enable the implementations of these classes to be swapped at runtime."*

Read literally, that is broken today, and it was broken before the pull requests we analysed. `FhirPatientServiceImpl` depends on `SearchQueryInclude` and `SearchQuery`, which are neither translators nor DAOs, and every service implementation extends the concrete `BaseFhirService`.

<div class="bp-callout bp-callout--amber"><strong>This is not a bug report and it is not the pull request author's problem.</strong> A check that fails a change for inherited debt is a check that gets switched off within a week. It gets a separate row, worded as what it is: a rule this repository already violates. Whether the answer is to fix the code or to soften the sentence is the maintainer's call. The point is that the disagreement is now visible to somebody, instead of sitting in a README nobody re-reads.</div>

The same repository's other two documented rules held, checked across 406 components each.

### Documentation that has silently gone stale

`Mirkoddd/Sift` says in its README that four lookaround types *"are available both on `Connector` … and as standalone factories in `SiftPatterns` for use in composition with `followedByAssertion()` and `precededByAssertion()`."*

`SiftPatterns` has no `followedByAssertion` and no `precededByAssertion`. It has `positiveLookahead`, `negativeLookahead`, `positiveLookbehind` and `negativeLookbehind`. The names in the README are from a version of the API that no longer exists, and the sentence has been quietly wrong ever since. Seven of that repository's nine documented rules held; this was one of the two that did not.

That failure mode used to be discovered by a new contributor typing a method name that does not compile. Now it is a row on a check.

## The documents are on the diagram

A rule is easier to argue with when you can see which components it is about. So documents are drawn as entities, carrying the rules they produced, with edges to the components those rules name.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">spring-ai-session: three documents, seven rules</p>
<div class="bp-striff-stage" style="height:15rem">
<span class="bp-striff-tag">spring-ai-session · PR #27</span>
<img src="/examples/blog-doc-nodes.svg" alt="Three document entities on a Striff diagram, labelled concepts.md, compaction.md and recall-storage.md, each listing the rules extracted from it with a holds or already-broken marker" loading="lazy" style="width:5682px; transform: translate(-3720px, -746px) scale(0.72);" />
</div>
<p class="bp-figure-caption">Each box is a real markdown file in that repository, and each line inside it is one rule with its verdict. Edges run from each document to the components its rules name, so a document is a node in the architecture rather than a footnote to it. The one amber row is another we would grade as weak: the sentence it came from names <code>deleteExpiredSessions</code> without naming a type, and the method lives on a sibling of the type the rule attached it to.</p>
</div>

## The rows that say "we could not tell"

Six of the 49 evaluations returned neither a pass nor a violation. That is a deliberate outcome, and the most important one in the design.

The clearest example in this window: `spring-ai-session`'s documentation mentions a method `currentTurnCount()` on a type called `CompactionRequest`. That type is a Java record with a `currentTurnCount` component, so the method is generated by the compiler. A source parser does not see generated members. The honest answer is not "the method is missing" and it is certainly not "the rule passed" — it is that **the question was not answerable from what was parsed**, and it is reported that way, counted underneath the table with no tick beside it.

<div class="bp-callout"><strong>"Could not analyse" must never persist as "analysed, found nothing."</strong> A source parser sees less than a compiler: no generated members, no annotations, no string literals, no reflection. Any tool that collapses those blind spots into a green tick is lying at exactly the moment you are trusting it most. Every rule reports one of four outcomes, and one of the four is "unanswerable".</div>

The other unanswerable rows in this window were of the same species: a document naming a dependency the parser could not resolve, at either revision. The document may be out of date, or the reference may be one a source parser cannot follow. Both are possible; neither is a violation.

## What this means if you are evaluating one of these

Ask any structural reviewer four questions, and be suspicious of anyone who cannot answer them with a number:

- **How often does it say nothing?** If the answer is "it always finds something", it is not measuring your architecture, it is measuring your patience.
- **Which of its findings are its weakest?** Anyone who has measured their own output can name the failure shape. Anyone who cannot has not looked.
- **What does it do when it cannot tell?** If the only outcomes are pass and fail, the passes are worth less than they look.
- **Where do its claims come from?** Every claim above is a property of two parsed revisions of the repository, or a sentence quoted verbatim from a file in it. Every pull request linked here is public. The verdicts are checkable, and we would rather you checked them.

[Install the check on a repository](https://github.com/apps/striff-app/installations/new) and open your next pull request. On most of them you will get a green check and a list of what was looked at. That is the product working, not the product idle.
