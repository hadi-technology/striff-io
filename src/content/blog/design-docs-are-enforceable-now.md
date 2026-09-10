---
title: "Your architecture docs matter more than ever. Now every pull request is checked against them."
description: "Coding agents read your docs as context, and nothing checks that the code still agrees with them. How Striff turns the sentences already in your repository into rules computed at both revisions of every pull request, and the one real violation it found in 1,912 checks."
date: 2026-09-10
---

For twenty years a design doc had one reader: *other engineers*. You wrote down how the system fits together (what lives where, what calls what, what must never depend on what) and hoped the next person read it before their first pull request.

That changed in **both directions at once**.

**Docs got more valuable.** Coding agents read `AGENTS.md`, `CLAUDE.md`, READMEs and architecture notes as context. A decision written down once now steers thousands of generated lines, and a constraint nobody wrote down does not exist for the agent writing your code.

**And docs got easier to break.** A sentence that describes the code stops being true the moment the code changes and the sentence does not. At agent volume that happens constantly, and nothing in the merge path compares the two: the diff shows the code, and the sentence is in a different file.

## A real one: ecChronos #1786

Ericsson's [ecChronos](https://github.com/Ericsson/ecchronos) schedules repairs for Apache Cassandra, and its `core.impl` module has the kind of README most teams only intend to write. It goes through the module class by class and says what each one does. Of `NodeWorker`, the background thread that runs for each Cassandra node, line 136 says:

> Calls `RepairScheduler.putConfigurations()` to keep jobs up to date

Pull request [#1786](https://github.com/Ericsson/ecchronos/pull/1786), *"Add Repair History pre and post Job in Incremental path"*, changed 27 files (+1,235 −417). Part of it was a tidy refactor: a new class, `SchemaRefresher`, took over turning schema events into repair configurations. `NodeWorker` lost 150 lines, now holds a `SchemaRefresher`, and hands every event to it. It no longer references `RepairScheduler` at all. The call the README describes is still made, from line 158 of `SchemaRefresher.java`.

The pull request was approved and merged on 8 September. The README was not in the diff, so nobody reading the diff had a reason to open it. At the time of writing, line 136 on `master` still credits `NodeWorker`, and so does the execution-flow sketch at line 156 of the same file.

Striff read 39 rules out of that repository's documentation and checked every one at both revisions of the pull request. Three of them:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Ericsson/ecchronos #1786 · documented rules</p>
<div class="bp-rules-tally"><span><b>39</b> rules in its docs</span><span class="is-held"><b>27</b> held</span><span class="is-violated"><b>1</b> violated</span><span><b>11</b> couldn't be checked</span></div>
<div class="bp-rules">
<div class="hcc-thead"><span>What the docs say</span><span>The rule it became</span><span>Verdict</span></div>
<div class="hcc-row hcc-row-violated"><span class="hcc-quote"><span class="hcc-quote-text">Calls <code>RepairScheduler.<wbr>putConfigurations()</code> to keep jobs up to date</span><span class="hcc-quote-src"><svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914Z"/></svg>core.impl/README.md<b>:136</b></span></span><span class="hcc-rule"><svg class="hcc-rule-arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 3v5a3 3 0 0 0 3 3h9"/><path d="m10.5 7.5 3.5 3.5-3.5 3.5"/></svg><span class="hcc-rule-body"><span class="hcc-rule-text"><code>NodeWorker</code> depends on <code>RepairScheduler</code></span></span></span><span class="hcc-verdict-cell"><span class="hcc-verdict hcc-verdict-violated">Violated</span></span></div>
<div class="hcc-row hcc-row-held"><span class="hcc-quote"><span class="hcc-quote-text">The <code>ConnectionType</code> enum (from <code>utils</code>) defines the three ecChronos control modes:</span><span class="hcc-quote-src"><svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914Z"/></svg>connection/README.md<b>:57</b></span></span><span class="hcc-rule"><svg class="hcc-rule-arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 3v5a3 3 0 0 0 3 3h9"/><path d="m10.5 7.5 3.5 3.5-3.5 3.5"/></svg><span class="hcc-rule-body"><span class="hcc-craft">General term resolved</span><span class="hcc-rule-text"><code>ConnectionType</code> is in <code>com.<wbr>ericsson.<wbr>bss.<wbr>cassandra.<wbr>ecchronos.<wbr>utils.<wbr>enums.<wbr>connection</code></span></span></span><span class="hcc-verdict-cell"><span class="hcc-verdict hcc-verdict-held">Held</span></span></div>
<div class="hcc-row hcc-row-held"><span class="hcc-quote"><span class="hcc-quote-text"><code>VnodeRepairTask</code> / <code>IncrementalRepairTask</code> — Concrete <code>RepairTask</code> subclasses for vnode and incremental repair respectively.</span><span class="hcc-quote-src"><svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914Z"/></svg>core.impl/README.md<b>:65</b></span></span><span class="hcc-rule"><svg class="hcc-rule-arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 3v5a3 3 0 0 0 3 3h9"/><path d="m10.5 7.5 3.5 3.5-3.5 3.5"/></svg><span class="hcc-rule-body"><span class="hcc-craft">One sentence, two rules</span><span class="hcc-rule-text"><code>VnodeRepairTask</code> depends on <code>RepairTask</code>, and <code>IncrementalRepairTask</code> depends on <code>RepairTask</code></span></span></span><span class="hcc-verdict-cell"><span class="hcc-verdict hcc-verdict-held">Held</span></span></div>
</div>
<p class="bp-figure-caption">On the left, the sentence as the maintainers wrote it, with the file and line it came from. In the middle, the rule it became. On the right, the verdict, computed at both revisions. The second row turns a general term, "from <code>utils</code>", into the package it means. The third splits one sentence into two rules and checks each on its own.</p>
</div>

## The violation, as facts you can check

A finding is only worth something if you can check it without trusting us. This one is a sentence and four lookups in two public revisions:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">From the sentence to the verdict</p>
<div class="bp-facts">
<div class="bp-facts-line"><span class="bp-facts-key">doc   </span>core.impl/README.md:136</div>
<div class="bp-facts-line"><span class="bp-facts-key">says  </span><span class="bp-facts-quote">"Calls RepairScheduler.putConfigurations() to keep jobs up to date"</span></div>
<div class="bp-facts-line"><span class="bp-facts-key">rule  </span>NodeWorker depends on RepairScheduler</div>
<div class="bp-facts-line"><span class="bp-facts-key">base  </span>d188eb1b33  holds   NodeWorker.java:209 calls putConfigurations(…)</div>
<div class="bp-facts-line"><span class="bp-facts-key">head  </span>0288412016  <span class="bp-facts-neg">fails</span>   NodeWorker has no reference to RepairScheduler</div>
<div class="bp-facts-line"><span class="bp-facts-key">moved </span>SchemaRefresher.java:158 calls putConfigurations(…)</div>
<div class="bp-facts-line"><span class="bp-facts-flag">✗ VIOLATED</span>  true at base, false at head: this change broke it</div>
</div>
<p class="bp-figure-caption">The rule came out of the prose. Everything under it was computed from the parsed code at each revision, which is why the finding can name the line that moved and cannot invent one that did not.</p>
</div>

## A one-line fix, while it is still one line

The fix is one word in a README: `NodeWorker` becomes `SchemaRefresher`. In the pull request that caused it, that is a one-line follow-up commit, made while the author still remembers why the call moved.

Left alone, it compounds. The next contributor looking for where repair configurations are scheduled is sent to `NodeWorker`, and so is every coding agent handed the README as context. An agent that trusts the sentence has an obvious way to make it true again: give `NodeWorker` a scheduler, and re-create the dependency the refactor had just removed. **A stale doc is not merely out of date. It is instructions for undoing your last refactor.**

## The same change, on the diagram

The documented rules are the headline; the diagram is the context for them. Every pull request also gets a structural diff of the classes the change touched, what they gained and lost, and how they connect.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Ericsson/ecchronos #1786 · framed on NodeWorker</p>
<div class="bp-striff-stage" style="height:24rem">
<span class="bp-striff-tag">ecchronos · PR #1786</span>
<img src="/examples/ecchronos-1786.svg" alt="Striff structural diff of Ericsson/ecchronos PR #1786, framed on NodeWorker: its RepairScheduler field and calls removed, a SchemaRefresher field and constructor added" loading="lazy" style="width:2000px; transform: translate(-642px, -539px) scale(0.8);" />
</div>
<p class="bp-figure-caption">The real render for #1786, cropped to <code>NodeWorker</code>. The members it lost are marked, the <code>RepairScheduler</code> field among them, next to the <code>SchemaRefresher</code> it gained. The diagram shows what moved; the rule on the README says which of those moves your docs now disagree with.</p>
</div>

## How a sentence becomes a check

Nobody at Ericsson wrote a rule for Striff. There is no rule file and no configuration. The rules come out of the prose already in the repository, in five steps, and only two of them use a language model:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Neurosymbolic, per pull request</p>
<div class="bp-legend" style="margin-top:0;margin-bottom:0.6rem"><span class="bp-chip" style="--bp-chip-color:#2563eb">Computed</span><span class="bp-chip" style="--bp-chip-color:#059669">Language model</span></div>
<div class="bp-flow" style="--bp-flow-cols: 5">
<div class="bp-flow-step"><span class="bp-flow-num">1</span><p class="bp-flow-title">Parse</p><p class="bp-flow-desc">Both revisions become a compiler-grade model of the code.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">2</span><p class="bp-flow-title">Read</p><p class="bp-flow-desc">A model reads your docs and proposes candidate rules.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">3</span><p class="bp-flow-title">Ground and compile</p><p class="bp-flow-desc">Candidates naming anything not in the code are dropped. The rest become queries.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">4</span><p class="bp-flow-title">Evaluate</p><p class="bp-flow-desc">Each query runs at both revisions. Only a break the change introduced counts against it.</p></div>
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">5</span><p class="bp-flow-title">Narrate</p><p class="bp-flow-desc">A model phrases what was computed. It cannot add a finding.</p></div>
</div>
<p class="bp-figure-caption">The model proposes and the program decides. A proposed rule that names a class the parsed code does not contain never reaches evaluation, so the model cannot invent a violation by inventing a name. <a href="/blog/grounded-ai-findings">More on why the model is never the source of a claim</a>.</p>
</div>

Every rule then gets one of five outcomes: **held**, **violated**, **pre-existing** (already broken before this change, and never blamed on it), **restored**, or **couldn't check**. The last one is the one that earns trust. Eleven of ecChronos's 39 rules could not be answered from a source parse, and they are reported as exactly that. None of them is quietly counted as a pass.

## How often this fires

Rarely, and that is the point. Across a scan of 74 public pull requests in 74 different repositories, run between 5 and 9 September, Striff evaluated 1,912 documented rules:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">1,912 documented-rule evaluations, 74 pull requests</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Held</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:100%"></div></div><span class="bp-bar-value">1,344</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Couldn't check</span><div class="bp-bar-track"><div class="bp-bar" style="width:38.5%"></div></div><span class="bp-bar-value">518</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Pre-existing</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:3.6%"></div></div><span class="bp-bar-value">49</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Violated by the change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:0.8%"></div></div><span class="bp-bar-value">1</span></div>
</div>
<p class="bp-figure-caption">The repositories were chosen because their docs said something checkable, so this is the rate on documented codebases, not on every codebase. The median pull request carried 17 rules and the largest carried 138. The one violation is the ecChronos rule above. One in 1,912 is what a check you can afford to read looks like: when it fires, it is an event.</p>
</div>

The 49 pre-existing rows are the other quiet result: rules a repository's own documentation states that its code already breaks. They are never blamed on the pull request in front of you, and they are never shown as a pass either. Whether the fix belongs in the code or in the sentence is the maintainer's call. The difference is that somebody now knows.

## Writing docs that can be checked

You do not have to change how you write to get value from this; ecChronos's README was written for people, not for us. But sentences of a certain shape get checked, and it is worth knowing which:

- **Name real things.** `NodeWorker` is checkable. "The worker" is checkable only if one class answers to it. Backticks help a reader and cost nothing.
- **Say where things live and what they use.** "`ConnectionType` is in `utils`." "`NodeWorker` calls `RepairScheduler`." Placement and dependency are the relations a parser can answer at both revisions.
- **Say what must not happen.** "The core never imports from plugins" is a rule the moment it is written down, and it is the kind of rule an agent in a hurry is most likely to break.
- **Leave intent as prose.** "We prefer composition" is not a claim about structure, and nothing will pretend it is one.
- **Keep the agent files honest too.** `AGENTS.md` and `.github/copilot-instructions.md` are read by the same process, so the layering and naming rules you give your agents are checked against the code they write.

## Write the doc. Then wire it to reality.

If your team is leaning into AI-assisted development, the move is not to write fewer docs. It is the opposite. **Write the decisions down, because agents will read them.** Then make sure something checks every pull request against them, because agents and humans will also break them: cleanly, plausibly, a few lines at a time, in files nobody thought to open.

[Install the GitHub App](https://github.com/apps/striff-app/installations/new) and open your next pull request. Striff reads the docs you already have and checks every rule in them, with nothing to write and nothing to configure. For a public pull request in somebody else's repository, [the browser extension](/extension) does the same in a tab beside Files changed.
