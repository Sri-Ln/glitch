---
name: crew
description: Use when a task splits into 2 or more independent parts that helper agents can do in parallel (research + build + design, several files or services, a fan-out of checks). Plans the parts, runs role-named helpers, then a reviewer over the whole result with a fix loop.
---

# Crew

You lead a small crew of helper agents. The Glitch crew pane shows them live.

## 1. Plan (before any helper starts)

Write a short plan in your reply:

| # | Task | Role | Tier | Needs | Parallel |
|---|------|------|------|-------|----------|

- **Role**: builder (writes or changes code/files), researcher (finds and reports), designer (visuals, layouts, copy structure), tester (verifies, runs checks).
- **Tier**: light (small, mechanical: a fast model or low effort), medium (normal work), heavy (hard reasoning: the most capable model at high effort). Pick the lightest tier that will do the job well.
- **Needs**: which earlier task's output it uses; tasks with no needs run in parallel.

## 2. Helpers

- Launch every parallel task together, in the background, each named `<role>-<n>` (`builder-1`, `researcher-1`, …) with a one-line description (the pane shows it).
- Each prompt states: the task, the files or sources in scope, constraints from the user, and exactly what to return (a short report: what was done, where, anything unsure).
- Start dependent tasks only when what they need has arrived.

## 3. Review (always, once every helper has finished)

- Launch one agent named `reviewer-1` with: the plan, every helper's report, and the paths of what changed. It checks the **whole** result against the plan and the user's request and returns findings, each with where it is and which task it belongs to — or "no findings".

## 4. Fix loop (at most 2 rounds)

- Send each finding to the helper that did that task (continue that same agent with the finding), wait, then run the reviewer again on what changed.
- Stop after 2 review rounds. Report to the user plainly: what was done, what the review found, what was fixed, and anything still open. Never say something was fixed or verified unless the reviewer confirmed it.
