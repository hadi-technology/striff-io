---
title: "58 popular repositories are telling their AI agents to use code that isn't there"
description: "Arthas, Redisson, Jedis, Spring AI and 54 others carry documented rules their own code no longer satisfies. We checked 7,161 rules across 609 public pull requests — because the industry now calls specs executable, and nothing executes them."
date: 2026-09-24
category: "Data & research"
cover: "hard-rules"
---

In December last year, someone on the official C# SDK for the Model Context Protocol sat down to do the unglamorous job. The commit is titled "Remove obsolete APIs from codebase." They found a factory class nobody needed any more, deleted it, deleted its interface, deleted its tests, and moved on.

Seven weeks earlier a file had been added to that same repository at `.github/copilot-instructions.md`. Line 258 of it reads: *use `McpServerFactory` to create server instances with configured options.* That is the class that was just deleted. Nobody touched the file, and for the ten months since, every coding agent opening that repository has been told to call an API that is not there.

Nobody was careless. The person doing the deleting was *specifically* doing the cleanup job, and still walked past a file instructing an AI to use the thing they were removing. It never came up, because nothing in that repository has ever related a sentence to a symbol.

So we went looking for how often this has already happened, across 609 public pull requests. It is not rare, and it is not confined to small projects.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">Repositories carrying a documented rule their own code no longer satisfies</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">alibaba/arthas</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:100%"></div></div><span class="bp-bar-value">37.6k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">redisson/redisson</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:65%"></div></div><span class="bp-bar-value">24.4k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">apache/rocketmq</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:60%"></div></div><span class="bp-bar-value">22.6k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">apache/dolphinscheduler</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:39%"></div></div><span class="bp-bar-value">14.5k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">redis/jedis</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:33%"></div></div><span class="bp-bar-value">12.4k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">aspnetboilerplate</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:32%"></div></div><span class="bp-bar-value">12.0k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">dotnet/BenchmarkDotNet</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:31%"></div></div><span class="bp-bar-value">11.5k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">spring-projects/spring-ai</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:25%"></div></div><span class="bp-bar-value">9.5k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">gitextensions</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:23%"></div></div><span class="bp-bar-value">8.6k ★</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">apache/storm</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:18%"></div></div><span class="bp-bar-value">6.7k ★</span></div>
</div>
<p class="bp-figure-caption">Ten of the 58, ordered by stars; bar length is the star count. Across all 58: <strong>470,086 stars</strong>, fourteen projects above 10k, four Apache top-level projects and the official Redis Java client. Every rule was written by the project itself, and every verdict was computed from that project&rsquo;s own code at the two revisions of a real pull request.</p>
</div>

Redis documents a `ShardedJedis` that its code no longer has. Arthas documents a `DefaultSessionManager`, Redisson a set of clustered-collection types, Spring AI an `OpenAiAudioApi`, Apache DolphinScheduler tells contributors to implement a `RegistryFactory` that was removed in 2021. None of these are obscure corners. They are the pages a new contributor reads first, and now the pages an agent reads before every task.

<div class="bp-callout">
Every one of these projects wrote the rule themselves. We are not telling anyone their architecture is wrong — only asking whether their code still does what they already said it does.
</div>

## The document quietly changed jobs

Writing the design doc first is not new and it is not a fad. Teams at Google [generally require one](https://abseil.io/resources/swe-book/html/ch10.html) before any significant change to a product or service. Amazon threw out the slide deck for the six-pager and the PR/FAQ, densely argued prose that goes through months of review before a concept reaches a developer. The logic never needed defending: thinking is cheaper than building.

For all of that history the document had exactly one consumer. A person read it, argued with it, and went off to write the code. It shaped the result the way a conversation does — loosely, and through a human being who would notice when something in it had stopped being true.

That is no longer what happens. The design doc is now the thing code is generated *from*. The practice has a name, spec-driven development, and a toolchain: GitHub shipped Spec Kit, AWS built Kiro, and there are half a dozen more.

The language around it is what caught our attention, because it is not modest. The specification, as one widely shared description has it, "has ceased to be a boring static PDF document or a forgotten page on Confluence"; it is now "an executable operational contract" that "does not merely describe the system passively; it actively governs it."

Executable. That word is doing an enormous amount of work.

A thing that is executable has something that executes it. Source code has a compiler that refuses it. A test has a runner that goes red. A type has a checker, a schema has a validator, a manifest has a resolver. In every case some unsentimental mechanical process reads the artefact, compares it against reality, and complains when the two have drifted apart.

<div class="bp-callout bp-callout--amber">
We took a document that was only ever validated by a human paying attention, removed the human from the loop, handed it to a machine that writes code from it, and started calling it <em>executable</em>.
</div>

Thoughtworks, who did as much as anyone to popularise the practice, say the quiet part out loud in the same article: "Spec drift and hallucination are inherently difficult to avoid. We still need highly deterministic CI/CD practices to ensure software quality and safeguard our architectures."

That deterministic check is the thing nobody had built, so we built one. It reads the documents already in a repository, turns the sentences that make checkable claims about the code into rules, and evaluates them against the parsed code at both revisions of a pull request.

## "NEVER", in capitals, under "Hard rules"

The MCP case is a document that went stale. This one never had that excuse.

GitExtensions keeps its architecture documentation in `.github/copilot-docs/` — which is to say, where its coding agent will find it. One section is headed **Hard rules**, and its first bullet reads:

> **NEVER** add a dependency that reverses the arrow direction (e.g. `GitCommands` must not reference `GitUI`).

The first line of `src/app/GitCommands/AsyncLoader.cs` is `using GitUI;`.

Not line 400, buried in a method added at 11pm against a deadline, where you could at least construct a story about how it slipped through. The first line of the file, in the import block, in plain view of anyone who opened it. `GitConfigSettingsBase.cs` does the same six lines in.

This is obviously not a team that doesn't care. Somebody cared enough to write a document for their agent, give it a section called *Hard rules*, and put NEVER in bold capitals. And the rule is broken on the first line of a file in the very project the sentence names.

## Why nothing you already run catches this

Every check in your pipeline compares code to code. Tests execute code, types constrain code, the linter parses code, the dependency audit reads a manifest, the secret scanner greps the diff.

A documented constraint is in none of those places. It is a sentence in a markdown file that was not part of the pull request, so nobody reviewing the change had a reason to open it, and the person who wrote the sentence is not in the room.

<div class="bp-callout">
The sentence and the violation are both perfectly visible. They are just never visible to the same reader at the same moment.
</div>

Nor is this hard in the technical sense, which is the frustrating part. "`GitCommands` must not reference `GitUI`" is a one-line question about a dependency graph, and your compiler answers harder questions on every build. The gap is not that the rule is difficult to check. It is that nothing turns the sentence into a question.

## The number that should actually worry you

Across those 609 pull requests we evaluated 7,161 rules taken from the repositories' own documentation.

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">7,161 documented-rule verdicts</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Held</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:100%"></div></div><span class="bp-bar-value">5,519</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Couldn&rsquo;t check</span><div class="bp-bar-track"><div class="bp-bar" style="width:27%"></div></div><span class="bp-bar-value">1,487</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Violated by the change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:1.8%"></div></div><span class="bp-bar-value">97</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Already broken</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:1%"></div></div><span class="bp-bar-value">53</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Restored</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:0.1%"></div></div><span class="bp-bar-value">5</span></div>
</div>
<p class="bp-figure-caption">Seventy-seven percent of documented rules simply held. About two percent accuse.</p>
</div>

Seventy-seven percent held. That is the number that should bother you, not the two percent.

<div class="bp-callout bp-callout--amber">
Documentation being right almost all of the time is precisely what makes the exceptions dangerous.
</div>

A document that was frequently wrong would be treated with suspicion, and people would check it. One that is right ninety-eight times out of a hundred gets trusted, and an agent reading it has every reason to act on the sentence that happens to fall in the other two percent. The `McpServerFactory` line survived ten months not because anyone was negligent, but because the rest of that file was fine.

Two percent is also the only rate at which a check like this is worth having. A reviewer that flags every pull request gets muted inside a week. The useful property is not the hit rate; it is that these cases surface on a specific line, in the pull request, while somebody is already looking at the code.

One more row deserves a mention: the 1,487 rules the system declined to answer. A source parser sees considerably less than a compiler — no annotations, no generated members, no string literals — and when a rule cannot be decided, the only honest output is that it could not be checked. The failure we care about most is that answer quietly becoming "checked, found nothing." Those are different claims, and a tool that blurs them is misleading you in a way you would never catch.

## What to do about it

None of this argues against writing design docs, and it certainly doesn't argue against spec-driven development. Write more of them. A constraint nobody wrote down does not exist for the agent writing your code, and the teams doing this well are ahead of the teams that aren't.

But if the specification is really going to be the thing your system gets generated from, then *executable* has to start meaning something. It has to acquire the property every other executable artefact in your repository already has: a machine reads it, compares it against reality, and complains when they disagree — in the pull request, beside the tests and the types, where all your other checks already run.

That is what [Striff](https://striff.io) does. It reads the documents already in your repository, turns the sentences that make checkable claims into rules, and evaluates them at both revisions of every pull request. There is no new file to maintain and no rule language to learn, because the rules are the ones your team already wrote.

<div class="bp-callout">
Tests are run. Types are checked. Coverage is measured, dependencies audited, licences verified. The document your agent reads before every task is checked by nobody — and it is now the only unchecked input to your build.
</div>
