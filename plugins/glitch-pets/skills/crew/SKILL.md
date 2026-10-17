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
- **Tier**: light (small, mechanical: a lookup, a rename, a one-file edit), medium (normal work), heavy (hard reasoning: a tricky design, debugging across a system). Pick the lightest tier that will do the job well. Each tier is an agent type that sets its model and effort: `glitch-pets:crew-light`, `glitch-pets:crew-medium`, `glitch-pets:crew-heavy`.
- **Needs**: which earlier task's output it uses; tasks with no needs run in parallel.

## 2. Helpers

- Launch every parallel task together, in the background, each named `<role>-<n>` (`builder-1`, `researcher-1`, …) with a one-line description (the pane shows it).
- Start each helper with `subagent_type: glitch-pets:crew-<tier>` from its plan row, and pass no `model` and no `effort`: the type sets both.
- If a helper fails, a Glitch crew note names the next step up (for example `glitch-pets:crew-light-high`). Retry that task once with that type, the same prompt and the same name. Use the step-up types (`crew-<tier>-high`, `crew-heavy-xhigh`, `crew-heavy-max`) only when a note names one.
- Each prompt states: the task, the files or sources in scope, constraints from the user, and exactly what to return (a short report: what was done, where, anything unsure).
- Start dependent tasks only when what they need has arrived.

## 3. Review (always, once every helper has finished)

- Launch one agent named `reviewer-1` (usually `glitch-pets:crew-heavy`) with: the plan, every helper's report, and the paths of what changed. It checks the **whole** result against the plan and the user's request and returns findings, each with where it is and which task it belongs to — or "no findings".

## 4. Fix loop (at most 2 rounds)

- Send each finding to the helper that did that task (continue that same agent with the finding), wait, then run the reviewer again on what changed.
- Stop after 2 review rounds. Report to the user plainly: what was done, what the review found, what was fixed, and anything still open. Never say something was fixed or verified unless the reviewer confirmed it.
