---
title: "Package dependency cycles: how one clean import quietly breaks your build, your tests, and your team"
description: "What a package-level dependency cycle actually is, the mechanical damage it does to builds, testing, and refactoring, how cycles really form — and why near-cycles are the cheapest architectural problem you'll ever fix."
date: 2026-01-27
---

Ask any senior engineer to name the worst architectural smell and *dependency cycles* will make the shortlist. Ask them to explain **mechanically** why a cycle is bad — not vibes, mechanisms — and the answers get vague.

That vagueness matters, because cycles never announce themselves. They arrive as one clean, reviewable, entirely reasonable-looking import. We watched it happen in real codebases: [GraalVM PR #13734](/blog/architectural-findings-in-oss) introduced a new package cycle through `NativeImageHeap`, and the file diff was unremarkable. So let's make the case properly.

## What a cycle is — and what it does to a graph

A healthy dependency structure is a **DAG** — a directed acyclic graph. Arrows point one way: features depend on services, services on the domain, the domain on nothing. A cycle exists when you can leave a package by following arrows and *arrive back where you started*.

The damage isn't stylistic. The moment a cycle closes, every package on the loop **collapses into a single unit** — mathematicians call it a strongly connected component, and your tools treat it exactly that way:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">One edge turns three modules into one</p>
<svg class="bp-diagram" viewBox="0 0 820 320" role="img" aria-label="Left: a layered acyclic graph where changes flow one direction. Right: the same graph after a single red edge is added from the bottom package back to the top, forming a cycle — all three packages are now highlighted as one inseparable unit.">
<defs>
<marker id="cyArrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
<marker id="cyArrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/></marker>
</defs>
<text x="205" y="34" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">Before: a DAG</text>
<rect x="140" y="52" width="130" height="36" rx="9" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
<text x="205" y="75" font-size="12" class="bp-mono" fill="#1d4ed8" text-anchor="middle">api</text>
<line x1="205" y1="88" x2="205" y2="126" stroke="#94a3b8" stroke-width="2" marker-end="url(#cyArrG)"/>
<rect x="140" y="130" width="130" height="36" rx="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
<text x="205" y="153" font-size="12" class="bp-mono" fill="#475569" text-anchor="middle">services</text>
<line x1="205" y1="166" x2="205" y2="204" stroke="#94a3b8" stroke-width="2" marker-end="url(#cyArrG)"/>
<rect x="140" y="208" width="130" height="36" rx="9" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5"/>
<text x="205" y="231" font-size="12" class="bp-mono" fill="#475569" text-anchor="middle">domain</text>
<text x="205" y="286" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">Change flows one way. Build bottom-up,</text>
<text x="205" y="303" font-size="11" fill="#64748b" text-anchor="middle" font-style="italic">test each layer alone, refactor a layer at a time.</text>
<text x="612" y="34" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle">After: one red edge</text>
<rect class="bp-node-pulse" x="547" y="52" width="130" height="36" rx="9" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
<text x="612" y="75" font-size="12" class="bp-mono" fill="#b91c1c" text-anchor="middle">api</text>
<line x1="612" y1="88" x2="612" y2="126" stroke="#94a3b8" stroke-width="2" marker-end="url(#cyArrG)"/>
<rect x="547" y="130" width="130" height="36" rx="9" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
<text x="612" y="153" font-size="12" class="bp-mono" fill="#b91c1c" text-anchor="middle">services</text>
<line x1="612" y1="166" x2="612" y2="204" stroke="#94a3b8" stroke-width="2" marker-end="url(#cyArrG)"/>
<rect x="547" y="208" width="130" height="36" rx="9" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
<text x="612" y="231" font-size="12" class="bp-mono" fill="#b91c1c" text-anchor="middle">domain</text>
<path class="bp-edge-draw" d="M 680 226 C 760 200 760 100 680 74" fill="none" stroke="#dc2626" stroke-width="2.5" marker-end="url(#cyArrR)"/>
<text x="770" y="155" font-size="10.5" class="bp-mono" fill="#dc2626" text-anchor="middle">new</text>
<g class="bp-late">
<text x="612" y="286" font-size="11" fill="#b91c1c" text-anchor="middle" font-style="italic">Every package can now reach every other.</text>
<text x="612" y="303" font-size="11" fill="#b91c1c" text-anchor="middle" font-style="italic">Three modules, one inseparable blob.</text>
</g>
</svg>
<p class="bp-figure-caption">The red edge is usually something innocent — <code>domain</code> importing a formatter that happens to live in <code>api</code>. The import is one line. The consequence is graph-wide.</p>
</div>

## The mechanical costs

Once packages form a cycle, four things degrade — not eventually, *immediately*:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What a cycle actually costs you</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">⚙</span><p class="bp-flow-title">Builds</p><p class="bp-flow-desc">Incremental and parallel builds rely on a dependency <em>order</em>. A cycle has no order — the whole loop rebuilds together, every time any member changes.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">🧪</span><p class="bp-flow-title">Tests</p><p class="bp-flow-desc">You can't stand up one package without the others on the loop. Unit tests quietly become integration tests; test time and flakiness climb.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">🔧</span><p class="bp-flow-title">Refactors</p><p class="bp-flow-desc">"Extract this into a library" and "replace this module" both require a place to cut. A cycle has no seams — so the refactor grows until it's a rewrite, and gets deferred.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">👥</span><p class="bp-flow-title">Ownership</p><p class="bp-flow-desc">Team boundaries follow module boundaries. When modules merge into a blob, every change needs everyone's context, and code review slows for all of them.</p></div>
</div>
<p class="bp-figure-caption">This is why the <em>Acyclic Dependencies Principle</em> is stated as a hard rule rather than a preference: the costs are structural, and they compound as more packages get pulled into the loop.</p>
</div>

And cycles *grow*. A loop of two packages is easy to absorb a third into — any new edge touching the cycle in the wrong direction extends it. This is the "big ball of mud" attractor: the blob only gains mass.

## How cycles actually form

Nobody designs a cycle. In every case we've flagged, the cycle arrived through the same lifecycle:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">The life of a dependency cycle</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">A convenient import</p><p class="bp-flow-desc">Someone needs a helper that happens to live one layer up. Importing it takes one line; moving it takes a discussion.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">2</span><p class="bp-flow-title">A clean review</p><p class="bp-flow-desc">The diff is small and correct. Nothing in the diff says "this edge points backward." It merges.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">The near-cycle</p><p class="bp-flow-desc">The graph now contains a path that's one edge away from a loop. Nobody knows, because nobody is looking at the graph.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">4</span><p class="bp-flow-title">The closing edge</p><p class="bp-flow-desc">Months later, an unrelated PR — increasingly, an AI-written one — adds the edge that closes the loop. That diff looks clean too.</p></div>
</div>
<p class="bp-figure-caption">Step 3 is the one to care about. In our <a href="/blog/architectural-findings-in-oss">12-repo scan</a>, HikariCP showed several of these <strong>near-cycle seeds</strong> — and EF Core PR #38676 shipped one alongside an edge that skipped three layers. Caught at step 3, the fix is trivial. Caught at step 4, you're already rebuilding the loop together.</p>
</div>

Note what's *absent* from that lifecycle: malice, incompetence, or bad code. Every individual step is locally reasonable. Cycles are an **emergent property of many good diffs** — which is precisely why diff-by-diff review, human or AI, doesn't catch them, and why the problem accelerates as [AI tools multiply PR volume](/blog/architecture-matters-more-not-less).

## Finding cycles before they close

You don't need to buy anything to start. Free tools will list package cycles in most ecosystems — `jdeps` ships with the JDK, [madge](https://github.com/pahen/madge) (`madge --circular`) covers JS/TS, [pydeps](https://github.com/thebjorn/pydeps) covers Python — and rule-based guards like ArchUnit or dependency-cruiser can fail the build when a *known* boundary is crossed. If you do nothing else, run one of these quarterly; we've collected the full workflow in [our architecture review checklist](/blog/architecture-review-checklist).

Two gaps remain, and they're the expensive ones:

- **Timing.** A quarterly scan tells you a cycle exists *after* three months of code has been built on top of it. The cheap moment to act — the PR that created the risk — is long merged.
- **Near-cycles.** Listing existing cycles is easy; recognizing that *this specific new edge* moves the graph one step from a loop requires comparing the dependency graph before and after every PR. No linter rule expresses that.

<div class="bp-callout"><strong>A cycle is cheapest to fix in the review of the PR that seeds it — and invisible in exactly that review.</strong> That inversion is the whole problem. The information you need at step 3 lives in the graph, and the diff you're reviewing doesn't contain the graph.</div>

That per-PR graph comparison is what Striff does: it models every pull request as a change to the dependency graph and flags a **new cycle** or a **near-cycle seed** in the PR that introduces it, next to the diff, before merge — as it did on GraalVM, HikariCP, and EF Core above. Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and it runs on your next pull request, no config needed.
