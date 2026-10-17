# Glitch

Glitch is a kit of Claude Code mods, published from this folder as a marketplace named `glitch`. It puts one band above the prompt that shows the session at a glance, makes spending and prompt-cache expiry visible before they cost money, and themes everything from one place. A Glitch bug never breaks the session, and Glitch refuses nothing unless you ask it to: the one refusal is the opt-in subagent block at a budget cap.

| Plugin | What it does |
|---|---|
| `glitch-core` | Shared themes and the `/glitch` command. |
| `glitch-hud` | The band above the prompt: turn, speed, cost and budget, cache countdown with keep-warm, context, git. Depends on `glitch-core`. |
| `glitch-pets` | A pixel pet at the end of the HUD row, with moods, short remarks and a daily streak. Depends on `glitch-core` and `glitch-hud`. |

## The HUD

One line above the prompt. In the terminal it is text with theme colors and icons:

| Part | Example | Source |
|---|---|---|
| turn | `#12` | count of main-session turns |
| speed | `⚡ 84 tok/s` | output tokens divided by streaming time of the last main response (ignores answers under 20 tokens or 0.5 s) |
| cost | `$ 0.42 reply · 3.10 session · 21.40 today` | the last reply, this session, and today across every session on this machine; pick them with `costShows`. Colored by budget level |
| cache | `⧗ 47:12 ↻` | countdown to prompt-cache expiry (`cacheTtlMinutes`, 60 by default); `…` while a turn runs |
| context | `▓▓▓▓░░ 63%` | context window used; amber from 65%, red from 85% |
| git | ` main ±4 ↑1` | branch, changed files, ahead/behind; hidden outside a repo |

**Desktop, VS Code and mobile.** These apps draw the band with vector icons, a real context bar and worded values (`Turn 12`, `$0.42 reply · $3.10 session · $21.40 today`, `47:12 left`, `63% context`). The desktop already shows the branch above the band, so git is left out there unless you change **Parts** in the settings or run `/glitch hud parts …`.

**The three costs.** A *reply* is everything Claude does to answer one message: every model call, tool use and subagent until it stops. It is left out while it equals the session figure (the first reply). *Session* is the figure `/cost` shows. *Today* adds up every session that ran glitch-hud on this computer since local midnight, in any project; it is not your account's spend on other machines or on claude.ai. With a cap set, the figure shows it: `$3.10 of $5.00 session`.

**Width.** As the window narrows, parts drop in the order git, speed, turn; then the cost figures lose their words and the context bar becomes just the percent. The row never wraps.

**Hiding.** The `×` at the end of the band hides it for the session; `/glitch hud` toggles it again. The band is not drawn before the first turn or while a survey shows. Other mods' bands render beneath it.

## Budget guard

Set a cap per session (`budgetSession`), per local day (`budgetDaily`), or both. 0 turns a cap off.

- 75% of a cap: the cost turns amber.
- 90%: red, plus a toast.
- 100%: a toast; with `notify` = `windows` also a Windows notification.

The 90% and 100% toasts appear in the session whatever `notify` says; `notify` = `windows` adds the Windows notification at 100%; `notify` also picks how the cache warnings reach you (an in-app toast by default, a Windows notification with `windows`, none with `off`).

Each level fires once per cap per session; raising a cap re-arms the higher levels. The daily ledger sums every session's spend for the local date: each session keeps its own entry per day under its session id, so sessions running side by side, a reload, a `/clear` or a resume never double count; entries older than 7 days are pruned. Caps changed in `/config` apply when the plugin reloads, except a session cap you already set with `/glitch budget`.

With `budgetBlocksAgents` on, new subagents are refused once either cap is reached. At the session cap the refusal asks Claude to have you raise it with `/glitch budget +N`; at the daily cap it asks you to run `/glitch budget off` for this session or raise `budgetDaily` in `/config` (`+N` moves the session cap only). The main conversation is never blocked, and if the check itself fails the call is allowed.

Costs are Claude Code's own estimate at API prices, not a bill; on a subscription they are not charged.

## Cache keeper

Claude Code's prompt cache lives for a fixed time after the last request: 1 hour on most plans, 5 minutes on others. Set `cacheTtlMinutes` to match (60 by default; set 5 if your account's cache lasts 5 minutes). The cache part counts down to that deadline from each answer and pauses (`…`) while a turn runs; a turn interrupted before any request leaves it as it was, and `/clear` drops it.

Left empty, `cacheWarnMinutes` fits the lifetime: marks at 10 and 5 minutes left for 1 hour, at 2 and 1 for 5 minutes. Marks you type at or above the lifetime can never fire: they are ignored and named once at session start. The countdown turns the warning color at a third of the lifetime left (20 minutes of an hour, 1:40 of 5 minutes) and the alert color at a sixth (10 minutes, 0:50).

- **Warnings.** At each warning mark, once per answer, while idle, you get a notification titled `<project> — Glitch`: "Prompt cache expires in N min".
- **Where warnings go.** By default (`notify` = `toast`) a warning is an in-app toast in the session that raised it, so background sessions never reach the OS notification centre. Set `notify` = `windows` to opt in to OS notifications: a native Windows toast is tried first; if that fails (or the OS is not Windows) Claude Code's own notification channel is used, then an in-app toast. `off` turns off the cache warnings (the budget toasts above still show).
- **Keep-warm.** `↻` on the cache part, or `/glitch warm`, sends a tool-less fork of the session's last request with a one-line question after it. The request is served from the prompt cache, which refreshes it, and nothing is added to the transcript. It is refused while a turn runs. The reply reports how many tokens were read from cache, and the countdown resets to the full lifetime (60:00, or 05:00).
- **Cost.** One ping is a cache read of the whole context: about $0.04 at 200k tokens of context on Opus 5.5, versus about $1.60 to rebuild an expired cache.
- **autoWarm** (off by default). At the last warning mark, ping once if you submitted a prompt within `autoWarmMaxIdle` minutes; never twice in a row without a prompt from you in between.

## glitch-pets

Pick a pet and it sits at the end of the HUD row on the desktop app. While Claude works, your pet types on a little laptop; between turns it does its signature move. It reacts to the session through moods, says a short word now and then as a toast, and keeps a daily streak. It is not drawn in the terminal; there, remarks arrive as toasts.

| Pet | Kind | Temperament | Signature move (idle) |
|---|---|---|---|
| Screenhead | screen bot | Earnest, literal and a little robotic; reports facts, proud of tidy output. | Types; code scrolls on its screen face. |
| Byte blob | blob | Bubbly and easily startled; squeaks with joy, wobbles when worried. | Bounces: squash, stretch and a glitch slice. |
| Pixel | cat | Dry and unimpressed, secretly proud; says little, means it. | Swishes its tail and sheds pixels. |
| Dot | ladybug | Tidy, gentle and encouraging; notices the small things. | Flutters her wings on a daisy. |
| Fork | octopus | The organised multitasker; a born lead who loves a plan. | Taps four keys with four arms. |
| Bud | dog | Eager and loyal; cheers for everything and wants to go again. | Wags, pants and flops an ear. |

Moods: idle, working, happy, tired, sleepy, worried, oops, cheering, leading, reviewing, crying. It cries when the budget cap is reached, when a daily streak of two or more days is broken, and after three failures in a row.

`/glitch-pets <name | off>` switches to a pet and remembers it, or empties the slot; `/glitch-pets` alone lists the pets. `/glitch pet [name | off]` works the same way.

| Setting | Default | Meaning |
|---|---|---|
| `pet` | `bud` | your pet: screenhead, blob, pixel, dot, fork, bud or off; `/glitch pet <name>` overrides it |
| `voice` | `true` | one-line remarks as toasts |
| `voiceEveryMinutes` | `3` | at most one remark per this many minutes |
| `tiredMinutes` | `10` | a turn this long makes the pet tired |
| `sleepyMinutes` | `10` | this long without a prompt makes the pet sleepy |

```
/plugin install glitch-pets@glitch
```

## Themes

Six built-in themes: `glitch` (default, electric cyan and magenta), `neon`, `mono`, `sunset`, `matrix`, `paper`. `/glitch theme` lists them, `/glitch theme neon` switches and remembers the choice across sessions, `/glitch theme default` clears it.

Resolution order: the last `/glitch theme <name>`, then the `theme` setting, then `glitch`. The `custom` setting, a JSON object of tokens, is merged over the result:

```json
{ "accent": "#ff6ad5", "bar": "█░" }
```

Color tokens are `accent`, `good`, `warn`, `alert`, `muted`, `info` (as `#rrggbb`); `bar` is the full and empty characters of the context bar; `icons` is `emoji`, `symbols` or `ascii`. An unknown theme name falls back to `glitch`; malformed `custom` JSON is ignored and the chosen theme is kept. Either problem toasts at session start.

## Commands

`/glitch` is owned by glitch-core. The HUD subcommands are answered by glitch-hud directly, the pet subcommand by glitch-pets, and the same subcommands also work as `/glitch-hud …`.

| Command | Owner | Does |
|---|---|---|
| `/glitch` | core | help card: theme and the subcommands each plugin answers |
| `/glitch theme [name\|default]` | core | list themes, or switch and persist |
| `/glitch-pets [name\|off]` | pets | list pets, switch and persist, or turn the pet off |
| `/glitch pet [name\|off]` | pets | the same, through the core command |
| `/glitch hud` | hud | show or hide the band |
| `/glitch hud parts <list>` | hud | parts and order for this session, as a comma list, e.g. `cost,cache,context` or `cost, cache` |
| `/glitch hud cost <list>` | hud | cost figures and order for this session, e.g. `session,today` |
| `/glitch budget [+N \| N \| off \| on]` | hud | show, raise, set, disable or re-enable this session's caps |
| `/glitch warm` | hud | keep-warm ping now |
| `/glitch demo cache <min>` | hud | preview the cache part and warnings at N minutes left; demo warnings say "(demo)", never auto-warm, and the real countdown comes back when the demo runs out or at the next answer |
| `/glitch demo budget <pct>` | hud | preview the budget levels at N percent |

An unknown subcommand shows the help card. `/glitch budget +N` and `N` change this session's cap only; `off` disables both caps for this session.

## Settings

Set them in `/config`, or in `~/.claude/settings.json` under `pluginConfigs`. Invalid values fall back to the default and toast once.

**glitch-core**

| Setting | Default | Meaning |
|---|---|---|
| `theme` | `glitch` | default theme: glitch, neon, mono, sunset, matrix, paper |
| `custom` | empty | JSON object of theme tokens laid over the theme |

**glitch-hud**

| Setting | Default | Meaning |
|---|---|---|
| `parts` | `turn,speed,cost,cache,context,git` | which parts show, in order |
| `costShows` | `reply,session,today` | which cost figures show, in order |
| `budgetSession` | `0` | USD cap per session; 0 is off |
| `budgetDaily` | `0` | USD cap per local day, across sessions; 0 is off |
| `budgetBlocksAgents` | `false` | refuse new subagents at a cap |
| `cacheTtlMinutes` | `60` | prompt cache lifetime: `60` (most plans) or `5` |
| `cacheWarnMinutes` | empty | minutes-left marks that notify; empty fits the lifetime (`10,5` for 1 hour, `2,1` for 5 minutes); marks at or above the lifetime are ignored |
| `notify` | `toast` | `toast` (inside the Claude Code session that raised it), `windows` (native Windows notification) or `off` (no cache or cap notifications; budget toasts still show) |
| `autoWarm` | `false` | keep the cache warm by itself at the last warning mark |
| `autoWarmMaxIdle` | `120` | minutes without a prompt from you after which autoWarm stops |

## Install

```
/plugin install glitch-hud --marketplace <owner>/<repo>
```

Answer `y` to add the marketplace, then pick a scope. This also installs glitch-core.

From a local folder:

```
claude plugin marketplace add C:\path\to\this\folder
/plugin install glitch-hud@glitch
```

To add the pets: `/plugin install glitch-pets@glitch`.

Or load the plugin folders directly with `CLAUDE_CODE_PLUGIN_DIRS`, separated by `;` on Windows. In cmd:

```
set CLAUDE_CODE_PLUGIN_DIRS=C:\path\to\this\folder\plugins\glitch-core;C:\path\to\this\folder\plugins\glitch-hud
```

In PowerShell:

```
$env:CLAUDE_CODE_PLUGIN_DIRS = 'C:\path\to\this\folder\plugins\glitch-core;C:\path\to\this\folder\plugins\glitch-hud'
```

Both last for that terminal only; to keep it, put `CLAUDE_CODE_PLUGIN_DIRS` under `env` in `~/.claude/settings.json`.

Edits reach a running session with `/reload-plugins`.

## Notes

Mods use Claude Code's early-access function-hooks API; tested on Claude Code 2.1.296.

## License

MIT, see `LICENSE`.
