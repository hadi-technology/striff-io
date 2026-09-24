---
title: "Your agent's instructions are part of the build now. Nothing checks them."
description: "Coding agents read AGENTS.md, CLAUDE.md and copilot-instructions.md before they write a line. Those files are inputs to your build, and they are the only inputs nothing validates. What we found when we checked whether the code still agrees with them."
date: 2026-09-24
category: "Data & research"
cover: "hard-rules"
---

Your team probably works this way now, or is moving there. You don't prompt the agent cold. You write the thing down first — what the module is for, what it may depend on, what it must never touch — and hand that to the agent to build against.

It's the right way to work. Thoughtworks called it one of 2025's key new engineering practices. GitHub shipped Spec Kit for it, AWS built Kiro around it, and every vendor now has a page telling you to write your constraints down before you write your prompt.

But look at what that does to the document.

## A reference became an input

For twenty years an architecture doc had one reader: the next engineer. It described how the system fit together, and you hoped someone read it before their first pull request. When it went stale, a human eventually noticed, muttered, and moved on. The cost was an afternoon of confusion, paid occasionally.

That document is now loaded automatically, before every task, by something that writes code and cannot be suspicious of what it reads.

Some teams have raised the register to match. There are public repositories with a file called `CONSTITUTION.md`, defining its terms against RFC 2119, containing lines like *"`Optional` MUST NOT be used"* and *"code reviews MUST reject."* These are not descriptions any more. They are instructions, and they are obeyed.

Which puts the whole arrangement on an assumption nobody writes down: **that the document is telling the truth.**

Your code has tests, types, linters, coverage gates, dependency audits, licence scanners, secret scanners. The file that tells your agent how the system is arranged has nothing. It is prose, and prose doesn't compile, so it drifts — and the drift is invisible until something acts on it.

We wanted to know how often that has already happened. So we built something that reads a repository's own documentation, turns the sentences that make checkable claims into rules, and evaluates them against the parsed code. The rules are never ours. We are not telling anyone their architecture is wrong — only checking whether the code still does what the team already said it does.

Here is what that looks like in practice.

## The rule is in capitals, under "Hard rules"

GitExtensions keeps its agent documentation in `.github/copilot-docs/`. One section is headed **Hard rules**. Its first bullet:

> **NEVER** add a dependency that reverses the arrow direction (e.g. `GitCommands` must not reference `GitUI`).

Open `src/app/GitCommands/AsyncLoader.cs`. Line 1:

```csharp
using GitUI;
```

Not line 400, buried in a method somebody added under deadline. **Line 1.** The import block. `GitConfigSettingsBase.cs:6` does it too.

Nobody here was careless. Somebody cared enough to write a document for their coding agent, give it a section called *Hard rules*, and put NEVER in bold capitals. The rule is broken in the first line of a file in the project the sentence names. Both things are true at once, and neither person who made them true had any reason to look at the other.

That is the whole problem in one file. Not negligence — **no connection**. The constraint is prose and the violation is code, and nothing in that repository's pipeline has ever had an opinion about whether the two agree.

## What a cleanup commit walked straight past

The clearest case we found is in `modelcontextprotocol/csharp-sdk`, the official C# SDK for the Model Context Protocol. Its `.github/copilot-instructions.md`, line 258:

> Use `McpServerFactory` to create server instances with configured options

Search the repository for `McpServerFactory`. One hit: that sentence.

The tempting reading is that an agent invented the class. It didn't, and the truth is more useful:

- **13 October 2025** — a commit titled *"✨ Set up Copilot instructions for repository"*, authored by **Copilot**, adds the instruction file. The line is correct when written.
- **2 December 2025** — a commit titled *"Remove obsolete APIs from codebase"* deletes `McpServerFactory.cs`.
- Nobody touches the instruction file.

Sit with the second commit. Its entire stated purpose was removing obsolete APIs. Somebody was *specifically doing that job*. They found the obsolete type, deleted it, deleted its interface, deleted its tests — and walked past a file in `.github/` instructing an AI agent to use it.

For ten months since, every agent that reads that file has been told to call an API that isn't there.

This is not a story about AI writing bad documentation. We went looking for that and mostly didn't find it. **This is ordinary staleness — the oldest problem in software — with a new blast radius.** A wrong sentence used to cost one human twenty minutes. The same sentence is now a machine-readable instruction, in the imperative, in the file your tooling loads automatically.

The defect rate didn't change. What changed is who reads it, how often, and how literally.

## Why your linter can't help

Every check you already run compares code to code. Tests run code. Types constrain code. The linter reads code. Your dependency audit reads a manifest.

A documented constraint isn't in any of those places. It's a sentence in a markdown file that wasn't in the diff, so nobody reviewing the change had a reason to open it — and the person who wrote the sentence isn't in the room.

The gap isn't that these rules are hard to check. **`GitCommands` must not reference `GitUI`** is trivially checkable; it's a one-line question about a dependency graph. The gap is that nothing turns the sentence into the question.

## Most of your documentation is fine — that's the problem

Across 609 public pull requests in 542 repositories, we evaluated 7,161 rules taken from those repositories' own documentation.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">7,161 documented-rule verdicts, 609 pull requests</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Held</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:100%"></div></div><span class="bp-bar-value">5,519</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Couldn&rsquo;t check</span><div class="bp-bar-track"><div class="bp-bar" style="width:27%"></div></div><span class="bp-bar-value">1,487</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Violated by the change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:1.8%"></div></div><span class="bp-bar-value">97</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Already broken</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:1%"></div></div><span class="bp-bar-value">53</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Restored</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:0.1%"></div></div><span class="bp-bar-value">5</span></div>
</div>
<p class="bp-figure-caption">Seventy-seven percent of documented rules simply held. About two percent accuse.</p>
</div>

Seventy-seven percent held. **That is the finding that should worry you, not the two percent.**

Your documentation is right almost all the time. That is exactly why nobody checks it, why the exceptions survive for ten months, and why an agent reading it has every reason to trust the one sentence that happens to be wrong. A document that was wrong often would be treated with suspicion. One that is right 98% of the time gets obeyed.

Two percent is also the only rate at which a check like this is worth having. A reviewer that flags every pull request gets muted in a week. The value isn't the hit rate — it's that the two percent surfaces at all, on a line, while someone is already looking at the code.

One more row deserves attention: the 1,487 rules the system declined to answer. A source parser sees less than a compiler — no annotations, no generated members, no string literals. When a rule can't be decided, the only honest output is *could not check*, and the failure we care most about is that quietly becoming *checked, found nothing.* Those are different claims, and a tool that blurs them is lying to you in a way you'd never catch.

## What to do about it

Nothing here argues against writing design docs for agents. Write more of them. A constraint nobody wrote down doesn't exist for the agent writing your code, and the teams doing this well are ahead of the teams that aren't.

But if the docs are what your agents build from, the docs have to stay true — and staying true cannot be somebody's good intentions. It has to be a check, in the place every other check already runs: the pull request, next to the tests and the types.

That's what [Striff](https://striff.io) does. It reads the documents already in your repository, turns the sentences that make checkable claims into rules, and evaluates them at both revisions of every pull request. No new file to maintain, no rule language to learn, nothing to configure — the rules are the ones your team already wrote.

Tests are run. Types are checked. Coverage is measured, dependencies audited, licences verified, secrets scanned.

The file that says how the system is arranged — the one your agent reads before every task — is checked by nobody. It's the last unchecked input in your build, and it's the one you handed the keys to.
