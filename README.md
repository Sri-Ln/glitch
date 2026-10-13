# Glitch

Glitch is a kit of Claude Code mods, published from this folder as a marketplace named `glitch`. It puts one band above the prompt that shows the session at a glance, makes spending and prompt-cache expiry visible before they cost money, and themes everything from one place. A Glitch bug never breaks or blocks the session.

| Plugin | What it does |
|---|---|
| `glitch-core` | Shared themes and the `/glitch` command. |
| `glitch-hud` | The band above the prompt: turn, speed, cost and budget, cache countdown with keep-warm, context, git. Depends on `glitch-core`. |

## The HUD

One line above the prompt, drawn as text with theme colors and icons on every surface:

| Part | Example | Source |
|---|---|---|
| turn | `#12` | count of main-session turns |
| speed | `⚡ 84 tok/s` | output tokens divided by streaming time of the last main response (ignores answers under 20 tokens or 0.5 s) |
| cost | `$0.42 │ $3.10` | this turn │ this session, colored by budget level |
| cache | `⧗ 47:12 ↻` | countdown to prompt-cache expiry (60 min TTL); `…` while a turn runs |
| context | `▓▓▓▓░░ 63%` | context window used; amber from 65%, red from 85% |
| git | ` main ±4 ↑1` | branch, changed files, ahead/behind; hidden outside a repo |

**Width.** As the window narrows, parts drop in the order git, speed, turn (then the context bar becomes just the percent). The row never wraps.

**Hiding.** The `×` at the end of the band hides it for the session; `/glitch hud` toggles it again. The band is not drawn before the first turn or while a survey shows. Other mods' bands render beneath it.

## Budget guard

Set a cap per session (`budgetSession`), per local day (`budgetDaily`), or both. 0 turns a cap off.

- 75% of a cap: the cost turns amber.
- 90%: red, plus a toast.
- 100%: toast plus a notification.

Each level fires once per cap per session; raising a cap re-arms the higher levels. The daily ledger sums every session's spend for the local date (kept per session id, so a reload never double counts; entries older than 7 days are pruned).

With `budgetBlocksAgents` on, new subagents are refused once either cap is reached, with a message telling Claude to ask you to raise the cap with `/glitch budget +N`. The main conversation is never blocked, and if the check itself fails the call is allowed.

Costs are Claude Code's own estimate at API prices, not a bill; on a subscription they are not charged.

## Cache keeper

Claude Code's prompt cache lasts 60 minutes from the last main answer. The cache part counts down to that deadline and pauses (`…`) while a turn runs.

- **Warnings.** At each `cacheWarnMinutes` mark (default 10 and 5 minutes left), once per answer, while idle, you get a notification titled `<project> — Glitch`: "Prompt cache expires in N min".
- **Notification chain.** With `notify` = `windows`, a native Windows toast is tried first; if that fails (or the OS is not Windows) Claude Code's own notification channel is used, then an in-app toast. `toast` goes straight to the in-app toast; `off` shows band colors only.
- **Keep-warm.** `↻` on the cache part, or `/glitch warm`, sends a tool-less fork of the session's last request with a one-line question after it. The request is served from the prompt cache, which refreshes it, and nothing is added to the transcript. It is refused while a turn runs. The reply reports how many tokens were read from cache, and the countdown resets to 60:00.
- **Cost.** One ping is a cache read of the whole context: about $0.04 at 200k tokens of context on Opus 5.5, versus about $1.60 to rebuild an expired cache.
- **autoWarm** (off by default). At the last warning mark, ping once if you submitted a prompt within `autoWarmMaxIdle` minutes; never twice in a row without a prompt from you in between.

## Themes

Six built-in themes: `glitch` (default, electric cyan and magenta), `neon`, `mono`, `sunset`, `matrix`, `paper`. `/glitch theme` lists them, `/glitch theme neon` switches and remembers the choice across sessions, `/glitch theme default` clears it.

Resolution order: the last `/glitch theme <name>`, then the `theme` setting, then `glitch`. The `custom` setting, a JSON object of tokens, is merged over the result:

```json
{ "accent": "#ff6ad5", "bar": "█░" }
```

Color tokens are `accent`, `good`, `warn`, `alert`, `muted`, `info` (as `#rrggbb`); `bar` is the full and empty characters of the context bar. An unknown theme name or malformed JSON falls back to the default and toasts the reason once per session.

## Commands

`/glitch` is owned by glitch-core. The HUD subcommands are answered by glitch-hud directly, and the same subcommands also work as `/glitch-hud …`.

| Command | Owner | Does |
|---|---|---|
| `/glitch` | core | help card: theme and the subcommands each plugin answers |
| `/glitch theme [name\|default]` | core | list themes, or switch and persist |
| `/glitch hud` | hud | show or hide the band |
| `/glitch hud parts <list>` | hud | parts and order for this session, e.g. `cost,cache,context` |
| `/glitch budget [+N \| N \| off \| on]` | hud | show, raise, set, disable or re-enable this session's caps |
| `/glitch warm` | hud | keep-warm ping now |
| `/glitch demo cache <min>` | hud | preview the cache part and warnings at N minutes left |
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
| `budgetSession` | `0` | USD cap per session; 0 is off |
| `budgetDaily` | `0` | USD cap per local day, across sessions; 0 is off |
| `budgetBlocksAgents` | `false` | refuse new subagents at a cap |
| `cacheWarnMinutes` | `10,5` | minutes-left marks that notify |
| `notify` | `windows` | `windows` (native toast), `toast` (inside Claude Code) or `off` (colors only) |
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

Or load the plugin folders directly with `CLAUDE_CODE_PLUGIN_DIRS`, separated by `;` on Windows:

```
set CLAUDE_CODE_PLUGIN_DIRS=C:\path\to\this\folder\plugins\glitch-core;C:\path\to\this\folder\plugins\glitch-hud
```

Edits reach a running session with `/reload-plugins`.

## Notes

Mods use Claude Code's early-access function-hooks API; tested on Claude Code 2.1.296.

## License

MIT, see `LICENSE`.
