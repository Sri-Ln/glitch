# Crew

[← Back to the README](../README.md)

When Claude splits work across a crew of agents, the crew pane (`glitch-crew`) shows them live. Your pet leads: its line says what it is doing (waiting on a member, looking into a failure, checking the work), and its mood follows the crew. Each crew member is a small copy of your pet acting out its role, in the crew look you picked.

```
Crew · 3 running · 1 done · 1 failed · ≈$0.31 · 74k tok · 0:37
Bud · sniffing out builder-1
● Researcher   Research date formats         Haiku 5.5 low    9k ≈$0.04  0:37 ██████░░ 6/8
● Designer     Design the date picker        Opus 5.5 high   31k ≈$0.13  0:37 ██░░░░░░ 2/8
● Builder      ↑ Sonnet · medium · Build th… Sonnet 5.5 high  4k ≈$0.02  0:05 █░░░░░░░ 1/8
✗ 2 finished · 1 completed · 1 failed [ Show ]
```

- **Role:** builder, researcher, designer, tester, reviewer, or helper when nothing says which. It comes from the member's name (`builder-1`, `researcher-2`, …), or failing that from the words in its task, then the opening of its instructions; a task put as a question ("how refrigerators cool") or an Explore agent is a researcher. With the default look (`busy-hands`) each mini acts its role out beside itself, at its model's tempo; with `hats` it wears its role's hat.
- **Model and effort** are shown as words on each row. A member retried one step up says what it stepped up from (`↑ stepped up from Haiku · low`; on the terminal `↑ Haiku · low`).
- **Role, task and what it is doing:** on the desktop each member shows its role in a small rounded chip in the role's color (`Researcher`) with its task cut short beside it, and below that what it is doing right now, from its latest tool call (`Searching the web: “…”`, `Editing cpu-notes.md`, `Running: npm test`). Once it has finished, the chip stands alone and the line below shows its whole task. Its model, cost and tokens are small rounded badges, and each member has a little room above and below. The terminal shows the role and the task on the member's line. A member of no clear role goes by its name. When Claude's description only repeats the role or the name, the task comes from the first sentence of the member's instructions.
- **Steps:** each member counts its steps (tool calls) against the number Claude planned for it (an `Expected steps: N` line in its instructions; without one, a default for its tier: light 6, medium 12, heavy 20, the reviewer 10). It starts at `0/12`, not a bare `0`, and the total goes up if the member runs past it. The Running header's bar and its `6/20` are the whole crew's steps done out of those planned: blue while the crew works, full and green once the last member finishes.
- **A member finishing:** your pet does a brief flourish, and on the desktop the member that finished does its own short happy hop with a small sparkle on its mini for about a second and a half, in the crew look you picked. Members that finish together each hop at once. A member failing makes your pet worried, then it looks into the failure while the crew works on.
- **Transcripts:** open a member's transcript from the app's tasks list (background tasks). The desktop app can't switch to one from a pane.
- **Poking the lead:** on the desktop, click your pet at the top of the pane for the same happy hop as clicking it in the HUD.
- **≈cost** is an estimate. The session's own cost is split across the crew by how many tokens each used.
- **Folding:** in the terminal the finished members always start folded into one line (`✓ 3 finished · 3 completed · 0 failed [ Show ]`); Show lists them, Hide folds them again. On the desktop, Running and Finished are accordion groups that start open; press a header's words (`● RUNNING 3 ▾`, `FINISHED 2 ▾`; `RUN 3 ▾` in a very narrow pane) to fold it to that line. The colored bar beside Running is the crew's steps done out of those planned; beside Finished, the share completed and failed. Finished keeps its tally of tasks, completed and failed. The choice lasts for the current crew.
- In the terminal there are no sprites: the lead's line carries its reactions.
- `/glitch crew` (or `/glitch-pets crew`) opens or closes the pane. With `crewPane: auto` it opens by itself when the first crew member starts.
- `/glitch crew debug` (or `/glitch-pets crew debug`) prints the crew rows beside the engine's own agent list (ids and statuses), the pane's last presses and what came of them, and the view each surface drew under, for checking the pane live.
- `/glitch crew theme [id]` (or `/glitch-pets crew theme [id]`) lists the crew looks, or picks one and keeps it: `busy-hands` (default: each crew member acts its role out beside itself, and the model sets how much each beat makes and the tempo) or `hats`.

The `crew` skill is the workflow Claude follows when work splits into 2 or more parts:

1. **Plan:** a short task list, with a role, a tier and an expected number of steps for each task.
2. **Crew members:** role-named crew members run the independent tasks in parallel.
3. **Review:** one quick reviewer verifies the whole result against the plan (see "The lean review" below).
4. **Fix loop:** each finding goes back to the crew member that did that part, then the reviewer checks only what changed, at most 2 rounds. Whatever is still open is reported plainly.

If 2 or more crew members (named `builder-1`, `researcher-2` and so on) finish with no reviewer, Claude gets a one-time reminder on its next turn to run the review.

| Setting | Default | Meaning |
|---|---|---|
| `crewPane` | `auto` | `auto` opens the pane when a crew starts; `manual` waits for `/glitch crew` |
| `crewReview` | `true` | the reminder when a review was skipped |
| `crewTiers` | empty | JSON: each crew tier's model and effort, and the reviewer's (see below); empty uses the default table |
| `crewTheme` | `busy-hands` | how crew members look in the pane: `busy-hands` or `hats`; `/glitch crew theme <id>` overrides it |

## Who picks the roles, models and effort

- **Roles, the split and the tier:** Claude decides them. The `crew` skill guides it: Claude writes the plan, gives each task a role and a tier, and names each crew member `<role>-<n>`.
- **Model and effort:** the plugin sets them from the tier. At session start it registers one agent type per tier, and Claude starts each crew member with `subagent_type: glitch-pets:crew-<tier>`:

  | Tier | Agent type | Model | Effort |
  |---|---|---|---|
  | light | `glitch-pets:crew-light` | Haiku 5.5 (`claude-haiku-5-5`) | low |
  | medium | `glitch-pets:crew-medium` | Sonnet 5.5 (`claude-sonnet-5-5`) | medium |
  | heavy | `glitch-pets:crew-heavy` | Opus 5.5 (`claude-opus-5-5`) | high |

  The type's model wins: if the Agent call passes a different `model`, the plugin sets it back to the type's when the crew member starts, and it sets an `effort` the Agent call passes to the type's. The one thing that beats the type is a setup that forces one model on every subagent. A crew member can't start agents of its own.
- **Changing the table:** set `crewTiers` to a JSON object. Each tier you leave out keeps its default, for example:

  ```json
  { "light": { "model": "claude-sonnet-5-5", "effort": "low" }, "heavy": { "effort": "medium" } }
  ```

  `model` is an alias (`haiku`, `sonnet`, `opus`) or a full model id. A tier's `effort` is `low`, `medium` or `high`. A bad value keeps that field's default, and a toast at session start says what was wrong.
- **Step-up on failure:** when a crew member fails (an error, not a stop you asked for), Claude gets a one-time note with its next prompt, often the failed crew member's own notification. The note says to retry the task one step up, with the same prompt and name. A step raises the effort first, then the model:

  `Haiku low → Haiku high → Sonnet medium → Sonnet high → Opus high → Opus xhigh → Opus max`

  A task gets at most 2 step-ups. The step-up types (`crew-light-high`, `crew-medium-high`, `crew-heavy-xhigh`, `crew-heavy-max`) are registered next to the tiers. `xhigh` and `max` are only ever steps, never a tier's own effort. With your own `crewTiers`, the steps follow the same rule: the tier's model at high effort (if it isn't already high), then the next tier, and after the heavy tier each higher effort.
- **Other agent types:** an agent Claude starts on any other type (`general-purpose`, your `.claude/agents/*.md`) picks its model as Claude Code always does: the Agent call's `model`, then the type's `model`, then your default subagent model, then the session's model. A fork always runs on its parent's model. The plugin leaves those alone and doesn't step them up.
- **What the pane shows:** the model and effort each crew member's requests actually use.

## The lean review

The reviewer checks the crew's work. It doesn't do the work again. Redoing every task would roughly double the cost and the time of the crew.

- **What it checks:** it reads the plan, each crew member's report and the files or outputs that changed (the diff). It runs the project's existing tests, linters and checks, if there are any. It spot-checks at most 3 items against the plan, picking the riskiest. It only looks deeper where a concrete check fails, for example a failing test, a missing file or a value that contradicts its source. It never recomputes the work from scratch and doesn't change files.
- **What it returns:** a short list of findings, each saying where it is and which task it belongs to, or "no findings", in under about 200 words.
- **Model, effort and limit:** it runs as its own agent type, `glitch-pets:crew-reviewer`, on Sonnet 5.5 (`claude-sonnet-5-5`) at low effort. It has a limit of 18 turns and is told to stop checking by turn 14, so it always has room to send its findings. It can run commands (for the checks) but can't edit files or start agents of its own. Claude starts it as `reviewer-1`. If Claude starts an agent named `reviewer-<n>` on another type anyway, the plugin moves it onto `glitch-pets:crew-reviewer`, with the reviewer's model and effort. Only the name counts: other agents that review something (an Explore agent reading docs, another plugin's reviewer) keep their own type.
- **Fix rounds:** after the fixes, a second review checks only what changed and whether each finding is fixed. There are at most 2 review rounds.
- **Changing it:** add a `reviewer` entry to `crewTiers`. For example, to use Haiku at medium effort:

  ```json
  { "reviewer": { "model": "claude-haiku-5-5", "effort": "medium" } }
  ```

  The reviewer's `effort` is `low`, `medium` or `high`. A field you leave out or get wrong keeps its default. The reviewer never steps up.
