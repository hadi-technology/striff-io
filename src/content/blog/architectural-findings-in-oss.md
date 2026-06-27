---
title: "What Striff found in 12 major open-source codebases"
description: "We ran Striff on real pull requests from Apache Kafka, Oracle GraalVM, Spring Framework, and 9 other major repos. Here's what the structural analysis uncovered."
date: 2025-06-13
---

We recently ran Striff across 12 major open-source Java repositories — from Apache Kafka to Spring Framework to Oracle GraalVM — analyzing real pull requests for architectural risk. The results were revealing: **95 structural findings across 12 PRs**, including 31 high-risk issues that file diffs alone couldn't surface.

Here's what we learned.

## The setup

We picked well-known Java repositories where architectural boundaries matter — large codebases with layered packages, shared utilities, and teams of contributors. For each repo, we selected a recent pull request and ran Striff's full structural analysis pipeline:

1. **Parse** the PR into components, relationships, and OOP metrics (afferent/efferent coupling, WMC, depth)
2. **Score** using GNN-style structural analysis and anomaly detection
3. **Explain** with a neurosymbolic pipeline that keeps AI notes grounded in architectural facts

## What we found

### Coupling spikes in shared components

In the **Spring Framework**, a seemingly simple change grew `AbstractBeanFactory`'s efferent coupling from 99 to 102. This is a core class that **hundreds of components depend on**. Any increase in outgoing dependencies on a node with afferent coupling that high means more code is affected by changes that previously would have been isolated.

The file diff looked fine. Three lines added. Clean code. But the structural impact was invisible to anyone reviewing lines alone.

### Package-level dependency cycles

**Oracle GraalVM** PR #13734 introduced a new package-level dependency cycle involving `NativeImageHeap` and several other packages. Package cycles are one of those architectural smells that compound over time — they make builds slower, testing harder, and refactoring riskier.

Striff flagged it because the new edge created a circular path that didn't exist before. No reviewer would have caught this from reading individual file diffs.

### Clean architecture violations

In the **modular-monolith-with-ddd** repository, Striff detected a direct specialization from the Application layer (`MeetingCommentUnlikedNotification`) to a Domain event (`MeetingCommentUnlikedDomainEvent`). This violates the clean architecture rule that the Application layer should depend on Domain abstractions only — not concrete implementations.

### Near-cycles that deserve attention

**HikariCP** showed several "near-cycle" seeds — new edges that don't form a circular dependency on their own, but combined with existing paths, come dangerously close. These are early warning signs. Caught now, they're easy to fix. Left alone, they become the package cycles that teams dread.

## The pattern

The common thread across all 12 repos: **the file diff looked normal**. The code was clean. The tests passed. But underneath, the architecture was shifting in ways that compound over time.

- Coupling was growing on shared components
- New edges crossed boundaries in the wrong direction
- Circular dependencies were forming at the package level
- Core contracts that dozens of classes depend on were being modified

None of these are things you can see from lines alone. They're structural properties — they exist in the relationships between components, not within any single file.

## What this means for code review

AI code review tools (Codex, Claude, Greptile, CodeRabbit) are excellent at reading code. They catch logic bugs, suggest better patterns, and flag style issues. But they treat PRs as flat text — a sequence of lines in files.

Striff treats a PR as what it actually is: **a change to a graph of components and relationships**. That's a fundamentally different representation, and it reveals risks that flat-text analysis simply cannot see.

The good news: these tools are complementary. Use AI reviewers for code-level issues. Use Striff for architectural ones.

## Try it yourself

Install the [browser extension](https://chromewebstore.google.com/detail/striffs-for-github/gcbcjajnjbplgkhnbemlkadgnjnfjoen) and try it on your next public pull request. The structural analysis runs automatically — no config needed.

The repos we analyzed include Apache Kafka, Oracle GraalVM, Spring Framework, Redis Jedis, Trino, HikariCP, Liquibase, and more. Every finding above came from a real PR in a real production codebase.
