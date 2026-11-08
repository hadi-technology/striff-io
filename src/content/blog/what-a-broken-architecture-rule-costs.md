---
title: "What a broken architecture rule costs, and when you pay for it"
description: "In a NeurIPS 2026 benchmark, 15 coding agents kept extending their own code, and its structure eroded in 77% of runs. Architecture exists to keep the next change cheap, for agents and people alike. A broken rule costs one line in the pull request that broke it, and a refactor once enough has been built on top."
seoTitle: "The cost of architectural drift when agents write the code"
seoDescription: "A broken architecture rule costs one line in its pull request and a refactor later. What the research on architectural debt says, and why agents make it worse."
date: 2026-11-08
category: "Data & research"
cover: "interest"
---

Give Anthropic's Opus 4.7 a small command-line tool to build. It parses its flags with Python's standard `argparse`, and its `main()` function is 38 lines long. Then ask for a new feature, and another, eight rounds in all, each building on the code the agent wrote the round before.

By the eighth round, `main()` is **240 lines**. The `argparse` call is gone, replaced by a hand-written loop in which seven flags each get *an identical pair* of branches, one for `--flag value` and one for `--flag=value`. No helper was ever extracted.
That run comes from [SlopCodeBench](https://arxiv.org/abs/2603.24755), a benchmark from the University of Wisconsin–Madison, MIT and Washington State University, accepted to NeurIPS 2026. It gave 15 of today's coding agents, including Opus 4.7 and GPT 5.3 Codex, 36 problems to extend checkpoint by checkpoint. Opus 4.7 was not unusual:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">15 coding agents, extending their own code</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">77%</div><div class="bp-stat-label">of runs ended with more eroded structure than they started with: complexity concentrated in a few highly complex functions</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">2.0×</div><div class="bp-stat-label">more eroded than the code in 473 open-source Python repositories written by people</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">5×</div><div class="bp-stat-label">faster: how quickly erosion grew in agent code, per step, compared with the human repositories</div></div>
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">0</div><div class="bp-stat-label">problems solved end to end by any agent; the best one passed 14.8% of checkpoints</div></div>
</div>
<p class="bp-figure-caption">Source: <a href="https://arxiv.org/abs/2603.24755" target="_blank" rel="noopener">Orlanski et al., <em>SlopCodeBench</em>, arXiv 2603.24755 (v2, May 2026)</a>. Erosion also rose in 53% of the human repositories over their git histories, so people are not immune; agents erode more, and faster.</p>
</div>

One more result from the same paper matters for everything below. The authors tried telling the agents to write clean code. **It made the first version cleaner, by up to a third, and did nothing to slow the decline.** An instruction shaped where the agents started, and had no effect on where they ended up.

Pass rates tell you whether each change worked. Erosion tells you what the *next* change will cost. Keeping that cost down is what architecture is for, and this post is about what happens when it slips.

## Architecture is for the next change, whoever makes it

A common argument goes like this: layering, boundaries and module rules were written so that people could read the code, agents can read anything, so the rules matter less now.

Engineers who build with agents every day disagree, and they all land on the same reason. Steve Smith, who maintains some of the most-used Clean Architecture templates for .NET, [put it this way in June 2026](https://ardalis.com/why-care-about-agent-authored-code-quality/):

> "The argument that 'architecture is just for humans' assumes that AI agents can hold arbitrarily large contexts perfectly and act on them without cost or error. Neither is true today."

A well-bounded module, he goes on, "lets the agent focus on a small, coherent slice of the codebase. The blast radius of any given change is smaller. The context required is smaller. The bill for your AI usage is smaller."

Oren Eini, the founder of RavenDB, [reached the same place in January](https://ayende.net/blog/203779-A/maintainability-in-the-age-of-coding-agents):

> "Maintainability in the age of coding agents looks remarkably like it did before. The essential requirements remain: clear boundaries, a consistent architecture, and the ability to go into a piece of code and understand exactly what it's doing."

There is early measurement too. A SonarSource study ran Claude Code 660 times on pairs of repositories matched on architecture, dependencies and behaviour that differed only in code quality. Cleanliness didn't change the pass rate, but on the cleaner code the agent **used 7 to 8% fewer tokens and revisited files 34% less often** ([Trivedi and Schmitt, arXiv 2605.20049](https://arxiv.org/abs/2605.20049)). SonarSource sells code-quality tools and the study is small, so treat it as a first data point.

Put plainly, *readability was always a means to an end*. The goal is to keep the cost of the next change low: how much of the system it has to touch, and how sure you can be that it's correct. **Whoever makes the change pays that cost, a person or an agent.** Following the architecture saves both of them time, and breaking it adds to the bill for everyone who comes after.

## The rules teams write down

Teams that build with agents write their architecture into the files their agents read: AGENTS.md, CLAUDE.md, Copilot instructions. Most of it comes as short sentences like these:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Six rules from real agent files, and what each one protects</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>The rule, quoted</th><th>What breaking it costs</th></tr></thead>
<tbody>
<tr><td><a href="https://github.com/whitphx/stlite/blob/9060cfe030c51a128829bc6f6b35dc9deac1477d/CLAUDE.md#L156" target="_blank" rel="noopener">stlite, CLAUDE.md</a>: "Never import <code>streamlit.web</code> in stlite-lib (Tornado can't run on Pyodide)."</td><td>The product. Stlite runs Streamlit in the browser, and one import takes that away.</td></tr>
<tr><td><a href="https://github.com/copperheadhq/copperhead/blob/de5eefc6c30130e0965a0b484838d54b30caeb40/AGENTS.md#L57" target="_blank" rel="noopener">copperhead, AGENTS.md</a>: "<code>check</code>/<code>verify</code> remains deterministic, LLM-free, and network-free. Its module graph must not import a provider or model SDK."</td><td>Trust. A check that might call a model can give a different answer tomorrow.</td></tr>
<tr><td><a href="https://github.com/rejifald/movar/blob/9a8bd5835eab25965e519addacbe62bf445801b8/apps/diagnostics/AGENTS.md#L15" target="_blank" rel="noopener">movar, apps/diagnostics/AGENTS.md</a>: "Observability ships separately and never in the published <code>@movar/extension</code>, even off-by-default."</td><td>What reaches users. The published extension is meant to carry "zero diagnostics surface", switched on or not.</td></tr>
<tr><td><a href="https://github.com/sockethub/sockethub/blob/164fbbb966ea3b830c30904568707a5d1641f9f3/AGENTS.md#L133" target="_blank" rel="noopener">sockethub, AGENTS.md</a>: "Server MUST NOT directly import platform code (platforms are child processes via IPC)."</td><td>Isolation. The same file says "Platform crashes must not affect other platforms", which only holds while each platform runs in its own process.</td></tr>
<tr><td><a href="https://github.com/MC-Music-Workshop/midi-captain-max/blob/4994f33e03a31e25d03f023507f231ccadfab404/firmware/AGENTS.md#L345" target="_blank" rel="noopener">midi-captain-max, firmware/AGENTS.md</a>: "do not import from <code>adafruit_hid.mouse</code> in the hot dispatch path (CP 7.x does a filesystem scan per import call)."</td><td>Latency on a device that has to respond to a foot pedal.</td></tr>
<tr><td><a href="https://github.com/bbenchoff/orthoroute/blob/2b2bc1cb83bc1e3e0f34bbcfefd8b926a38ad95d/.github/copilot-instructions.md#L112" target="_blank" rel="noopener">OrthoRoute, copilot-instructions.md</a>: "<code>domain/</code> importing from <code>infrastructure/</code> is always a bug."</td><td>The ability to test the core without the infrastructure, and to swap the infrastructure later.</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Each rule is quoted from the repository's default branch as of November 2026, linked at that commit. The right-hand column is our reading of the reason the authors give.</p>
</div>

Each one records a decision somebody made so that the next person, or agent, wouldn't have to learn it again. Several carry the reason in the same sentence. The question is what it costs when one of them stops being true, and the answer depends almost entirely on *when you find out*.

## In the pull request, it costs one line

When a change breaks a rule like the ones above, the break is usually a single import, call or dependency. Caught in the pull request that introduced it, the fix is to move that line before the merge. Nobody has built on it yet, and the author still remembers why they wrote it. **The break will never be cheaper than this.**

Here is what happens when nobody catches it:

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">One broken rule, from pull request to refactor</p>
<div class="bp-flow" style="--bp-flow-cols: 4">
<div class="bp-flow-step bp-flow-step--mint"><span class="bp-flow-num">1</span><p class="bp-flow-title">The pull request</p><p class="bp-flow-desc">One import crosses a boundary. The fix is one line, and the author still has the context.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">2</span><p class="bp-flow-title">The merges after</p><p class="bp-flow-desc">The next change that needs the same thing takes the same shortcut, because that is now how the code works.</p></div>
<div class="bp-flow-step bp-flow-step--amber"><span class="bp-flow-num">3</span><p class="bp-flow-title">The docs lie</p><p class="bp-flow-desc">AGENTS.md still says the rule holds. Every agent that reads it builds on a system that no longer exists.</p></div>
<div class="bp-flow-step"><span class="bp-flow-num">4</span><p class="bp-flow-title">The refactor</p><p class="bp-flow-desc">Untangling it is now a planned project, with its own time, risk and review.</p></div>
</div>
<p class="bp-figure-caption">The fix at step 1 and the fix at step 4 remove the same dependency. What changes is everything built on it in between.</p>
</div>

## After the merge, it starts charging interest

Researchers have measured steps 2 to 4 for years, under the name *architectural debt*.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">What architectural debt costs, in four studies</p>
<div class="bp-stats">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">#1</div><div class="bp-stat-label">source of technical debt, according to 1,831 engineers and architects: architectural decisions (Carnegie Mellon SEI)</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">20–61%</div><div class="bp-stat-label">of a project's maintenance effort, consumed by its five worst architectural debts (7 large open-source projects)</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">23%</div><div class="bp-stat-label">of developers' working time lost to existing technical debt, self-reported weekly (Chalmers)</div></div>
<div class="bp-stat bp-stat--mint"><div class="bp-stat-value">−72%</div><div class="bp-stat-label">time to resolve a new issue at Brightsquid, after it paid its architectural debt down</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://cs.unibg.it/esecfse_proceedings/fse15/p50-ernst.pdf" target="_blank" rel="noopener">Ernst et al., FSE 2015</a>; <a href="https://personal.stevens.edu/~lxiao6/papers/ICSE-16-Debt.pdf" target="_blank" rel="noopener">Xiao, Cai, Kazman et al., ICSE 2016</a>; <a href="https://research.chalmers.se/publication/511450/file/511450_Fulltext.pdf" target="_blank" rel="noopener">Besker, Martini and Bosch, JSS 2019</a>; <a href="https://arxiv.org/abs/1811.12904" target="_blank" rel="noopener">Nayebi et al., ICSE-SEIP 2019</a>.</p>
</div>

The Carnegie Mellon survey asked engineers in three large organizations where their technical debt came from, and the authors' [conclusion](https://www.sei.cmu.edu/documents/1686/2016_020_001_484024.pdf) was blunt: "architectural decisions are the most important source of technical debt."

The open-source study shows how that debt is paid. Files caught up in an architectural flaw keep changing together and keep needing fixes. In each of the seven projects, **the top five architectural debts covered 8% to 25% of the error-prone files and accounted for 20% to 61% of the project's maintenance effort**. The authors call that effort *interest*: you pay it on every change that touches the tangled files, for as long as the flaw is there.

Debt also makes more debt. The Chalmers developers reported that they were "frequently forced to introduce new" debt because of the debt already there. That is step 2 of the diagram, measured.

Brightsquid, a healthcare messaging company, shows what the interest had been costing by what it saved when it stopped paying. After a refactoring aimed at its architectural debt, the average time to resolve a new issue fell by 72%, build time fell by more than 83%, and **the number of bugs fixed per month nearly doubled**. Those gains came from a planned project, with the time and risk that implies. Stopping a break in the pull request that introduces it costs a line.

These studies have limits. The open-source one infers effort from commit history, the Chalmers figure is self-reported, and Brightsquid is one company. They point the same way, though, and no study we know of finds that architectural breaks get cheaper with age.

## Agents bring the expensive part sooner

All of the research above was done on code written by people. Agents change three things, and each makes the bill arrive faster.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Why agents speed up the interest</p>
<div class="bp-stats bp-stats--3">
<div class="bp-stat bp-stat--brand"><div class="bp-stat-value">456,535</div><div class="bp-stat-label">pull requests opened by five coding agents across 61,453 repositories; Codex alone opened 400,000+ in under two months</div></div>
<div class="bp-stat bp-stat--amber"><div class="bp-stat-value">"well followed"</div><div class="bp-stat-label">how coding agents treat the instructions in context files like AGENTS.md (ETH Zurich)</div></div>
<div class="bp-stat bp-stat--danger"><div class="bp-stat-value">5×</div><div class="bp-stat-label">faster erosion in agent code than in human code, per step (SlopCodeBench)</div></div>
</div>
<p class="bp-figure-caption">Sources: <a href="https://arxiv.org/abs/2507.15003" target="_blank" rel="noopener">Li, Zhang and Hassan, AIDev, 2025</a>; <a href="https://arxiv.org/abs/2602.11988" target="_blank" rel="noopener">arXiv 2602.11988</a>; <a href="https://arxiv.org/abs/2603.24755" target="_blank" rel="noopener">SlopCodeBench</a>.</p>
</div>

**There is far more change.** Interest is charged per change that touches the tangled code, so more changes means the debt grows faster.

**Agents do what the docs say.** That is good news while the docs are true. Once a rule is broken in the code, an agent reads a document describing a system that no longer exists, and builds as if it did.

**Agents learn from the code around them.** A Tsinghua study looked at why maintainers reject agent pull requests whose code works. Their answer:

> Agent code "ignores project-specific conventions, duplicates functionality already provided by internal APIs, and violates implicit architectural constraints accumulated over years of development." ([Learning to Commit, arXiv 2603.26664](https://arxiv.org/abs/2603.26664))

Their fix is to teach the agent from the repository's own history. A break that has been merged is part of that history, so *the code itself becomes the example the next change follows*. That last step is our inference rather than something the paper measured, and it matches what happened to Opus 4.7's `main()`, where the same pair of branches was repeated for flag after flag.

Put together, a rule broken in a busy repository where agents write the code will have more changes built on it, sooner, while its docs keep telling every agent the rule still holds.

## Review doesn't see it

Reviewers miss these breaks for a structural reason. **The rule lives in a document, and the change lives in a diff that doesn't include that document.** A reviewer reading the diff sees a clean import. To spot the break they would have to remember every architectural sentence in the repository and check each one against each change, on teams where agents are opening more pull requests than ever.

We showed one real case [in an earlier post](/blog/design-docs-are-enforceable-now/): a clean refactor in Ericsson's ecChronos, approved and merged, that made a sentence in the module's README false. The sentence was in a file the diff never touched.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Where a broken rule gets caught, and what the fix costs</p>
<div class="bp-compare-scroll">
<table class="bp-compare">
<thead><tr><th>Caught</th><th>The fix</th><th>Who has the context</th></tr></thead>
<tbody>
<tr><td>In the pull request</td><td><span class="bp-yes">Move one line</span></td><td>The author, today</td></tr>
<tr><td>A few merges later</td><td>Untangle the break and the changes that copied it</td><td>Whoever finds it, from git blame</td></tr>
<tr><td>When it hurts</td><td><span class="bp-no">A planned refactor</span></td><td>Whoever is assigned the refactor</td></tr>
</tbody>
</table>
</div>
<p class="bp-figure-caption">Only the first row is cheap, and only a check that runs on every pull request reliably lands there.</p>
</div>

## Where we stand

1. **Architecture exists to keep the next change cheap, whoever makes it.** Agents didn't make it optional. Code with clear boundaries is cheaper for an agent to change for the same reasons it is cheaper for a person.
2. **A written architecture rule is a requirement.** If a repository's docs say the domain never imports the infrastructure, a change that makes it do so has a defect, just as a change that fails a test does.
3. **The pull request that breaks a rule is the place to catch it.** It is the only point where the fix costs one line and the author still has the context. Every merge after that adds interest.
4. **The check has to sit above whoever wrote the change.** People and agents both break rules, and SlopCodeBench shows that telling an agent to be careful doesn't hold up over many changes. The check should give the same answer for the same change every time.
5. **If a rule isn't worth checking, take it out of the doc.** Agents will follow it either way. *A rule that is written down and never checked is the worst case*: agents trust it, and nobody notices when it stops being true.
6. **When the doc is what's wrong, that's worth catching too.** Sometimes the code moved on for a good reason. Then the cheap fix is to update the sentence in the same pull request, before the next agent reads it.

## What we built

<div class="bp-callout bp-callout--mint">
<a href="https://github.com/apps/striffs/installations/new">Striff</a> reads the architecture rules your docs and agent files already state (AGENTS.md, CLAUDE.md, ADRs and design docs) and checks every pull request against them. A language model reads each document once and proposes the rules it states. The verdict on each pull request comes from evaluating those rules against the parsed code at both revisions, so <strong>the same change gets the same answer every time</strong>. When a change breaks a rule, the check quotes the sentence it broke and names the dependency that broke it, in the pull request, while the fix is still one line.
</div>
