---
title: "Coupling metrics, explained — and why a coupling delta is not a finding"
description: "What afferent and efferent coupling actually measure, how to read them together with complexity, inheritance depth and encapsulation, and the case for why none of these numbers should ever be reported to a reviewer as a finding on its own."
date: 2026-08-18
---

Every architecture tool eventually shows you two numbers: **afferent coupling** and **efferent coupling**. Most engineers nod, half-recall that the definitions point in opposite directions, and move on. That is a shame, because read together they are the closest thing software has to a blood-pressure reading for a component.

It is also a trap, and we walked into it. For a while, this product reported *changes* in those numbers as findings on a pull request: "efferent coupling grew by 4." Those findings are gone now. This post is both halves of that: what the numbers mean and how to read them, and why a delta on one of them should never have been allowed to interrupt a reviewer.

## The two directions

Both metrics count dependencies on a single component — a class, or a package. The only difference is which way the arrows point.

**Afferent coupling (Ca)**: arrows *in*. How many components depend on **you**. This is your blast radius: if you change, this is how many places can break.

**Efferent coupling (Ce)**: arrows *out*. How many components **you** depend on. This is your exposure: every outgoing arrow is a reason you might be forced to change.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Same node, opposite questions</p>
<svg class="bp-diagram" viewBox="0 0 820 300" role="img" aria-label="Two diagrams. Left: five arrows point inward to a node labelled OrderRepository, illustrating afferent coupling, who depends on you. Right: seven arrows point outward from a node labelled CheckoutService, illustrating efferent coupling, what you depend on.">
<defs>
<marker id="ceArrIn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/></marker>
<marker id="ceArrOut" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d97706"/></marker>
</defs>
<text x="205" y="34" font-size="13" font-weight="700" fill="#1d4ed8" text-anchor="middle">AFFERENT (Ca): who depends on you</text>
<line class="bp-edge-draw" x1="70" y1="90" x2="150" y2="140" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="60" y1="160" x2="148" y2="160" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="70" y1="230" x2="150" y2="180" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="205" y1="70" x2="205" y2="128" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<line class="bp-edge-draw" x1="205" y1="250" x2="205" y2="192" stroke="#2563eb" stroke-width="2" marker-end="url(#ceArrIn)"/>
<rect x="140" y="132" width="130" height="56" rx="10" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
<text x="205" y="156" font-size="11.5" class="bp-mono" fill="#1d4ed8" text-anchor="middle">OrderRepository</text>
<text x="205" y="174" font-size="10.5" fill="#3b82f6" text-anchor="middle">high Ca</text>
<text x="205" y="284" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">Change this → every arrow is a place that can break</text>
<text x="612" y="34" font-size="13" font-weight="700" fill="#b45309" text-anchor="middle">EFFERENT (Ce): what you depend on</text>
<line class="bp-edge-draw" x1="660" y1="140" x2="742" y2="92" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="668" y1="160" x2="755" y2="160" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="660" y1="180" x2="742" y2="228" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="612" y1="128" x2="612" y2="72" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="612" y1="192" x2="612" y2="248" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="564" y1="140" x2="482" y2="92" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<line class="bp-edge-draw" x1="556" y1="160" x2="470" y2="160" stroke="#d97706" stroke-width="2" marker-end="url(#ceArrOut)"/>
<rect x="537" y="132" width="150" height="56" rx="10" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
<text x="612" y="156" font-size="11.5" class="bp-mono" fill="#92400e" text-anchor="middle">CheckoutService</text>
<text x="612" y="174" font-size="10.5" fill="#b45309" text-anchor="middle">high Ce</text>
<text x="612" y="284" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">Every arrow is a reason this might be forced to change</text>
</svg>
<p class="bp-figure-caption">Illustrative components. The shapes are the point: a repository that half the system calls, and an orchestrator that calls half the system, are opposite risks that the same word — "coupling" — covers.</p>
</div>

The definitions come from Robert C. Martin's package-design metrics, which also give the derived number worth knowing: **instability**, *I = Ce / (Ce + Ca)*. High Ca and low Ce is *stable*: hard to justify changing, safe to depend on. High Ce and low Ca is *unstable*: free to change, dangerous to depend on. Neither is bad by itself. **Problems start when a component is high on both axes at once.**

## The four quadrants

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Reading Ca and Ce together</p>
<div class="bp-quad">
<div class="bp-quad-cell bp-quad-cell--brand"><span class="bp-quad-tag">High Ca · Low Ce</span><p class="bp-quad-title">Stable core</p><p class="bp-quad-desc">Interfaces, domain types, shared contracts. Everyone depends on them; they depend on little. <em>Healthy, but every change here is expensive by design.</em></p></div>
<div class="bp-quad-cell bp-quad-cell--danger"><span class="bp-quad-tag">High Ca · High Ce</span><p class="bp-quad-title">The danger zone</p><p class="bp-quad-desc">Many dependents <em>and</em> many dependencies: god classes, "utils" dumping grounds, accidental bridges. Fragile to change, impossible to avoid.</p></div>
<div class="bp-quad-cell"><span class="bp-quad-tag">Low Ca · Low Ce</span><p class="bp-quad-title">Quiet leaf</p><p class="bp-quad-desc">Self-contained helpers and features. Change freely; almost nothing can break.</p></div>
<div class="bp-quad-cell bp-quad-cell--amber"><span class="bp-quad-tag">Low Ca · High Ce</span><p class="bp-quad-title">Orchestrator</p><p class="bp-quad-desc">Controllers, entry points, wiring code. Volatile but safe: nothing depends on them, so their churn does not ripple.</p></div>
</div>
<div class="bp-quad-axis"><span>↑ rows: afferent coupling (Ca)</span><span>columns: efferent coupling (Ce) →</span></div>
<p class="bp-figure-caption">The quadrant a component sits in matters more than either raw number. A Ce of 40 on an orchestrator is Tuesday. A Ce of 40 on a stable core component means every one of its many dependents inherits forty new reasons to break.</p>
</div>

## The rest of the panel

Coupling is two gauges. On a diagram of a change, each component carries a few more, each with its delta:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The numbers on a component, decoded</p>
<div class="bp-metric-chips">
<span class="bp-metric-chip"><span class="k">NOC: 2</span><span class="v">±0</span></span>
<span class="bp-metric-chip"><span class="k">DIT: 3</span><span class="v">±0</span></span>
<span class="bp-metric-chip"><span class="k">WMC: 38</span><span class="v up">+36%</span></span>
<span class="bp-metric-chip"><span class="k">ENC: 0.7</span><span class="v up">+38%</span></span>
<span class="bp-metric-chip"><span class="k">AC: 5</span><span class="v">±0</span></span>
<span class="bp-metric-chip"><span class="k">EC: 44</span><span class="v up">+22%</span></span>
</div>
<div class="bp-compare-scroll" style="margin-top:1rem">
<table class="bp-compare">
<thead><tr><th>Badge</th><th>What it measures</th><th>What it hints at</th></tr></thead>
<tbody>
<tr><td><strong>WMC</strong></td><td>Weighted method complexity: the summed cyclomatic complexity of the class's methods</td><td>The best single "is this becoming a god class?" gauge. Logic pooling here instead of being distributed.</td></tr>
<tr><td><strong>DIT</strong></td><td>Depth of inheritance tree: how many ancestors the class has</td><td>Deep hierarchies make behaviour hard to trace; every layer is somewhere logic can hide.</td></tr>
<tr><td><strong>NOC</strong></td><td>Number of children: direct subclasses</td><td>A contract many things extend. Like high Ca, it multiplies the cost of every change made here.</td></tr>
<tr><td><strong>ENC</strong></td><td>Encapsulation ratio: the share of members that are private or protected</td><td>Falling ENC means internals are being exposed, inviting exactly the coupling the other numbers then measure.</td></tr>
<tr><td><strong>AC / EC</strong></td><td>Afferent and efferent coupling, as above</td><td>Blast radius and exposure.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Read together the panel tells a story no single number can: rising WMC with rising EC and falling ENC is a class absorbing responsibilities, reaching for more collaborators, and opening its internals to do it. That is a god class three pull requests before anyone in review would name it one.</p>
</div>

## Now the uncomfortable part

Everything above is true, and none of it should be a finding on a pull request.

We shipped it as one for a while. "Efferent coupling grew from 8 to 17." "Weighted method complexity grew by 10." They were popular internally, they were easy to compute, and they were about **two thirds of everything the product emitted**. They are all gone now, and the argument for cutting them has four parts.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Why a metric delta is not a finding</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">1</span><p class="bp-flow-title">No action follows</p><p class="bp-flow-desc">"Coupling grew by 4" — and then what? Every action a reviewer might take next requires knowing <em>which</em> four and <em>toward what</em>. The number by itself terminates in a shrug.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">2</span><p class="bp-flow-title">A linter does it better</p><p class="bp-flow-desc">Thresholds on complexity and fan-out are a solved problem, per file, in your existing pipeline, with configuration you control. Reimplementing that in a review comment is worse at the same job.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">The number is already on the page</p><p class="bp-flow-desc">Every one of these values, with its delta, is printed on the component itself. A finding that restates a label six inches away is not information, it is repetition.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">4</span><p class="bp-flow-title">It crowds out the rest</p><p class="bp-flow-desc">Two thirds of the output being restatement means the one row that needed a human is two thirds less likely to be read. Volume is not free; it is paid for out of the same attention budget.</p></div>
</div>
<p class="bp-figure-caption">Note what did <em>not</em> change: the metrics are still computed, still shown on every component, still used to order and emphasise what a reviewer sees first. What they lost was the right to interrupt.</p>
</div>

The test we now apply to any candidate finding is a single question: **does a reviewer already know this from the diff or from the diagram?** A metric delta fails it. So does an added import, which is a line of the diff. What passes are the things that require the whole graph, at both revisions, to know at all: a cycle closing, an edge inverting, a reach into another module's internals, a production-to-test dependency, a sentence in your own documentation that this change contradicts.

## When fan-in *does* earn a finding

There is one place a coupling number legitimately reaches the reviewer, and the difference is instructive.

In [Activiti/activiti-cloud #2552](https://github.com/Activiti/activiti-cloud/pull/2552), the public interface `IntegrationResult` loses the method `getIntegrationRequest()`. Twelve components in the parsed scope reference that type.

<div class="bp-callout"><strong>The finding is not "afferent coupling is 12". The finding is "a public method was removed from a type twelve things depend on".</strong> The number is not the claim; it is the <em>magnitude</em> attached to a claim that stands on its own. Delete the number and there is still a finding: a public contract shrank. Delete the contract change and there is nothing: twelve dependents is just a fact about the code, and it was true yesterday too.</div>

That is the whole distinction. A metric is a property of the code. A finding is an *event* — something this change did — with a property of the code attached to say how much it matters. Reporting the property without the event is how a tool ends up with a lot to say and nothing worth reading.

## How to actually use these numbers

- **Read the quadrant, not the value.** A Ce of 40 means nothing until you know the Ca. Instability, not either raw number, is the thing that tells you whether a component is safe to depend on.
- **Watch high-Ca components the way you watch production config.** Any change touching a component with dozens of dependents deserves a closer read, *especially* when the diff looks trivial. Small diffs on high fan-in nodes are where blast-radius accidents live.
- **Use metrics to decide reading order.** That is what they are good for and what they now do here: not "look at this", but "look at this *first*".
- **Do not set thresholds and argue about them.** "Ce must stay under 20" produces meetings, not architecture. If you want a hard gate on complexity, put it in your linter where it belongs, and let structural review answer the questions a linter cannot see.

The questions a linter cannot see are the ones worth automating: whether this change closed a cycle, inverted a boundary, or broke something [your own documentation already promised](/blog/design-docs-are-enforceable-now). [Install the check](https://github.com/apps/striff-app/installations/new) and it answers those on every pull request, with the metrics on the diagram where you can read them, and out of your notifications where they cannot help.
