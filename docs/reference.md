# Commands and settings

[← Back to the README](../README.md)

## The three plugins

| Plugin | What it does |
|---|---|
| `glitch-core` | Shared themes and the `/glitch` command. |
| `glitch-hud` | The band above the prompt: turn, speed, cost and budget, cache countdown with keep-warm, context, git. Depends on `glitch-core`. |
| `glitch-pets` | A pixel pet at the end of the HUD row, with moods, short remarks and a daily streak, and the crew pane. Depends on `glitch-core` and `glitch-hud`. |

## Commands

`/glitch` is owned by glitch-core. The HUD subcommands are answered by glitch-hud directly, the pet subcommand by glitch-pets, and the same subcommands also work as `/glitch-hud …`.

| Command | Owner | Does |
|---|---|---|
| `/glitch` | core | help card: theme and the subcommands each plugin answers |
| `/glitch theme [name\|default]` | core | list themes, or switch and persist |
| `/glitch-pets [name\|off]` | pets | list pets, switch and persist, or turn the pet off |
| `/glitch pet [name\|off]` | pets | the same, through the core command |
| `/glitch crew` | pets | open or close the crew pane (also `/glitch-pets crew`) |
| `/glitch hud` | hud | show or hide the band |
| `/glitch hud parts <list>` | hud | parts and order for this session, as a comma list, e.g. `cost,cache,context` or `cost, cache` |
| `/glitch hud cost <list>` | hud | cost figures and order for this session, e.g. `session,today` |
| `/glitch hud speed on\|off\|auto` | hud | show or hide tok/s, kept for later sessions; `auto` follows the setting |
| `/glitch budget [+N \| N \| off \| on]` | hud | show, raise, set, disable or re-enable this session's caps |
| `/glitch hud cache` | hud | the prompt-cache lifetime in use and where it came from |
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
| `showSpeed` | `auto` | tok/s: `auto` shows it in the terminal only (and on the desktop when Parts was changed), `on` or `off` everywhere |
| `costShows` | `reply,session,today` | which cost figures show, in order |
| `budgetSession` | `0` | USD cap per session; 0 is off |
| `budgetDaily` | `0` | USD cap per local day, across sessions; 0 is off |
| `budgetBlocksAgents` | `false` | refuse new subagents at a cap |
| `cacheTtlMinutes` | `auto` | prompt cache lifetime: `auto` works it out (see [Cache keeper](hud.md#cache-keeper)); `60` or `5` fixes it |
| `cacheWarnMinutes` | empty | minutes-left marks that notify; empty fits the lifetime (`10,5` for 1 hour, `2,1` for 5 minutes); marks at or above the lifetime are ignored |
| `notify` | `toast` | `toast` (inside the Claude Code session that raised it), `windows` (native Windows notification) or `off` (no cache or cap notifications; budget toasts still show) |
| `autoWarm` | `false` | keep the cache warm by itself at the last warning mark |
| `autoWarmMaxIdle` | `120` | minutes without a prompt from you after which autoWarm stops |

## Other ways to install

From a local clone:

```
claude plugin marketplace add C:\path\to\glitch
/plugin install glitch-pets@glitch
```

Or load the plugin folders directly with `CLAUDE_CODE_PLUGIN_DIRS`, separated by `;` on Windows. In cmd:

```
set CLAUDE_CODE_PLUGIN_DIRS=C:\path\to\glitch\plugins\glitch-core;C:\path\to\glitch\plugins\glitch-hud
```

In PowerShell:

```
$env:CLAUDE_CODE_PLUGIN_DIRS = 'C:\path\to\glitch\plugins\glitch-core;C:\path\to\glitch\plugins\glitch-hud'
```

Both last for that terminal only; to keep it, put `CLAUDE_CODE_PLUGIN_DIRS` under `env` in `~/.claude/settings.json`.

Edits reach a running session with `/reload-plugins`.
