---
title: "The rules repositories write for their AI agents, and the code that already breaks them"
description: "A new genre of file tells coding agents what they MUST NOT do. We turned those sentences into checkable rules and evaluated 7,161 of them across 609 public pull requests. Seventy-seven percent held, one in five could not be answered, and about two percent accused — including an agent instruction file that has told every agent reading it to call a deleted API for ten months."
date: 2026-09-24
category: "Data & research"
cover: "hard-rules"
---

The interesting number for an automated reviewer is not how much it finds. It is **how often it says nothing.**

That number is easy to hide and easy to fake, so here it is measured across 609 public pull requests, analysed with the same pipeline that runs on a live one. Every rule below was read out of a repository's own documentation, turned into a claim about the code, and evaluated against the parsed model at both revisions of the pull request.

## A new kind of document

Something changed in repositories over the last two years. Alongside the README, a different genre appeared: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.agents/rules/`, `CONSTITUTION.md`.

A README explains. These *instruct*. They are written in the imperative, addressed to a coding agent, and full of hard constraints in capital letters — **MUST NOT**, **NEVER**, *code reviews MUST reject*. They are also, increasingly, written by agents.

Which raises a question nobody seems to be asking: does the code obey them?

<div class="bp-figure" data-reveal>
<p class="bp-figure-title">7,161 documented-rule verdicts, 609 pull requests</p>
<div class="bp-bars">
<div class="bp-bar-row"><span class="bp-bar-label">Held</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:100%"></div></div><span class="bp-bar-value">5,519</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Couldn&rsquo;t check</span><div class="bp-bar-track"><div class="bp-bar" style="width:27%"></div></div><span class="bp-bar-value">1,487</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Violated by the change</span><div class="bp-bar-track"><div class="bp-bar bp-bar--danger" style="width:1.8%"></div></div><span class="bp-bar-value">97</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Already broken</span><div class="bp-bar-track"><div class="bp-bar bp-bar--amber" style="width:1%"></div></div><span class="bp-bar-value">53</span></div>
<div class="bp-bar-row"><span class="bp-bar-label">Restored</span><div class="bp-bar-track"><div class="bp-bar bp-bar--mint" style="width:0.1%"></div></div><span class="bp-bar-value">5</span></div>
</div>
<p class="bp-figure-caption">Seventy-seven percent of documented rules simply held, which is what a correct document looks like and why nobody notices the exceptions. Roughly two percent accuse. Accusations also concentrate hard: a single repository accounts for about half of them, so the per-repository rate is far below what the per-verdict rate suggests.</p>
</div>

## The findings

Every one below is a file and a line anyone can open. That matters more than our saying they are real.

### GitExtensions: the rule is in caps, under "Hard rules"

`.github/copilot-docs/L1-conceptual/architecture-overview.md`:

> ## Hard rules
> - **NEVER** add a dependency that reverses the arrow direction (e.g. `GitCommands` must not reference `GitUI`).

`src/app/GitCommands/AsyncLoader.cs`, **line 1**:

```csharp
using GitUI;
```

`src/app/GitCommands/Settings/GitConfigSettingsBase.cs:6` does the same. The document is written for Copilot, lives in a folder called `copilot-docs`, states the constraint in bold capitals under a heading called *Hard rules*, and the first line of a file in the named project breaks it.

### Timefold: a constitution with an enforcement clause

`CONSTITUTION.md` in `TimefoldAI/timefold-solver`:

> `Optional` MUST NOT be used; use `@Nullable` (JSpecify) instead

and, further down, states how it is meant to be held:

> **Enforcement**: Build targets JDK 21; CI verifies compilation and tests on JDK 21; code reviews MUST reject `Optional` and null escaping APIs.

`java.util.Optional` is imported in 58 files. We checked where they live rather than assume, because the number would be a cheap shot if they were tests: the sampled files are all `src/main`, including `core/.../DeepCloningUtils.java`. The document defines its keywords against RFC 2119 — **MUST NOT** as an absolute prohibition — which is more care than most architecture documents take.

### The MCP C# SDK: an instruction file that outlived the API it names

`modelcontextprotocol/csharp-sdk`, `.github/copilot-instructions.md:258`:

> Use `McpServerFactory` to create server instances with configured options

Search the repository for `McpServerFactory`. One hit: that sentence.

The obvious reading is that an agent invented the class. It didn't, and the truth is more useful. `McpServerFactory` was real — a public factory with its own interface and its own tests, touched by 32 commits. The sequence is:

- **13 October 2025** — a commit titled *"✨ Set up Copilot instructions for repository"*, authored by **Copilot**, adds the instruction file. The line is correct when written.
- **2 December 2025** — a commit titled *"Remove obsolete APIs from codebase"* deletes `src/ModelContextProtocol.Core/Server/McpServerFactory.cs`.
- Nobody touches the instruction file.

The second commit is the one worth sitting with. Its stated purpose was removing obsolete APIs. Whoever did it deleted the type, its interface and its tests, and walked past a file in `.github/` instructing an agent to use it — because nothing connects those two things. The API is code, the instruction is prose, and no tool in that pipeline has an opinion about whether they agree.

### And a small one, for honesty's sake

`yegor256/takes` names its main class correctly at `README.md:403` — `FtCli` — then from line 1008 calls it `FtCLI` five times, including a sample at line 1029 inviting you to copy `new FtCLI(`. Java is case-sensitive; that does not compile.

It is a two-character defect, and it is included deliberately, because it is the honest shape of most of what this finds. Not drama. A sentence that quietly stopped being true.

## The row we would defend hardest

Not the violations. The 1,487 rules the system declined to answer.

A source parser sees less than a compiler: no annotations, no generated members, no string literals, no class literals. When a rule cannot be decided, the only honest output is *could not check* — and the failure we care most about is that quietly becoming *checked, found nothing.* Those are different claims, and a tool that conflates them is lying.

## Why this is getting worse

We went looking for AI writing bad documentation and mostly did not find it. What is there is older and more mundane, and we think more serious: documents going stale is a solved-in-theory problem nobody has ever actually solved, and the stale documents have now been promoted into the build.

That is the shift. A wrong sentence in a design doc used to be a small tax on one confused human, paid occasionally, and the human usually noticed. The same sentence is now loaded automatically and read literally by something with no capacity to be suspicious of it. The defect rate did not change; the blast radius did. When `copilot-instructions.md` says to use `McpServerFactory`, an agent does not squint at it — it writes the call.

And these files are increasingly written by agents, which closes the loop: agents write the docs, agents read the docs, and the humans who used to be the error-correction step are reviewing more code than ever and reading the markdown less than ever.

Tests are run. Types are checked. Coverage is measured, dependencies audited, licences verified. The file that says how the system is arranged — the one your agent reads before every task — is checked by nobody.
