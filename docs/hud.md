# glitch-hud

[← Back to the README](../README.md)

![The status line in the Claude Code desktop app](images/hud.png)

## The HUD

One line above the prompt. In the terminal it is text with theme colors and icons:

| Part | Example | Source |
|---|---|---|
| turn | `#12` | count of main-session turns |
| speed | `⚡ 84 tok/s` | output tokens divided by streaming time of the last main response (ignores answers under 20 tokens or 0.5 s) |
| cost | `$ 0.42 reply · 3.10 session · 21.40 today` | the last reply, this session, and today across every session on this machine; pick them with `costShows`. Colored by budget level |
| cache | `⧗ 47:12 ↻` | countdown to prompt-cache expiry (the lifetime is worked out, see Cache keeper); `…` while a turn runs |
| context | `▓▓▓▓░░ 63%` | context window used; amber from 65%, red from 85% |
| git | ` main ±4 ↑1` | branch, changed files, ahead/behind; hidden outside a repo |

**Desktop, VS Code and mobile.** These apps draw the band with vector icons, a real context bar and worded values (`Turn 12`, `$0.42 reply · $3.10 session · $21.40 today`, `47:12 left`, `63% context`). The desktop already shows the branch above the band, so git is left out there unless you change **Parts** in the settings or run `/glitch hud parts …`. tok/s is left out on the desktop too: turn it on with the **Show tok/s** setting or `/glitch hud speed on`.

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

Claude Code's prompt cache lives for a fixed time after the last request: 1 hour for the main conversation on a Claude subscription, 5 minutes with an API key, a cloud provider (Bedrock, Vertex, Foundry) or once a subscription draws on usage credits. With `cacheTtlMinutes` on `auto` (the default) Glitch works the lifetime out, first match wins:

1. Claude Code's own `promptCacheTtl` setting and the `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL` and `ENABLE_PROMPT_CACHING_1H` env vars, in Claude Code's own order. With `DISABLE_PROMPT_CACHING` there is no countdown.
2. What the cache did: when the first request after more than 5 idle minutes (an answer or a keep-warm) still reads the conversation from the cache, the lifetime is an hour. When it has to write it all again within the hour twice in a row, 5 minutes. A request on a different model from the last answer counts for neither.
3. The plan: the rate-limit windows each answer reports are there only on a subscription. Until the first answer, an hour is assumed.

`/glitch hud cache` says the lifetime in use and where it came from. Set `cacheTtlMinutes` to `60` or `5` to fix it by hand. The cache part counts down to that deadline from each answer and pauses (`…`) while a turn runs; a turn interrupted before any request leaves it as it was, and `/clear` drops it.

Left empty, `cacheWarnMinutes` fits the lifetime: marks at 10 and 5 minutes left for 1 hour, at 2 and 1 for 5 minutes. Marks you type at or above the lifetime can never fire: they are ignored and named once at session start. The countdown turns the warning color at a third of the lifetime left (20 minutes of an hour, 1:40 of 5 minutes) and the alert color at a sixth (10 minutes, 0:50).

- **Warnings.** At each warning mark, once per answer, while idle, you get a notification titled `<project> — Glitch`: "Prompt cache expires in N min".
- **Where warnings go.** By default (`notify` = `toast`) a warning is an in-app toast in the session that raised it, so background sessions never reach the OS notification centre. Set `notify` = `windows` to opt in to OS notifications: a native Windows toast is tried first; if that fails (or the OS is not Windows) Claude Code's own notification channel is used, then an in-app toast. `off` turns off the cache warnings (the budget toasts above still show).
- **Keep-warm.** `↻` on the cache part, or `/glitch warm`, sends a tool-less fork of the session's last request with a one-line question after it. The request is served from the prompt cache, which refreshes it, and nothing is added to the transcript. It is refused while a turn runs. The reply reports how many tokens were read from cache, and the countdown resets to the full lifetime (60:00, or 05:00).
- **Cost.** One ping is a cache read of the whole context: about $0.04 at 200k tokens of context on Opus 5.5, versus about $1.60 to rebuild an expired cache.
- **autoWarm** (off by default). At the last warning mark, ping once if you submitted a prompt within `autoWarmMaxIdle` minutes; never twice in a row without a prompt from you in between.
