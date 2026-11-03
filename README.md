# Glitch

A kit of Claude Code mods: one band above the prompt that shows the session at a glance, makes spending and prompt-cache expiry visible before they cost money, and a pixel pet that reacts to it all. When Claude splits work across agents, your pet leads a live crew pane.

![Glitch on the Claude Code desktop: the HUD band with a pet reacting during a turn](docs/images/hero.gif)

## What you get

- **HUD:** turn, tok/s, cost (this reply, this session, today), a prompt-cache countdown with one-click keep-warm, context used and git, in one line above the prompt.
- **Budget guard:** optional caps per session and per day, the cost changes color as you near a cap, with toasts at 90% and 100%.
- **Cache keeper:** a warning before the prompt cache expires, and a cheap ping that keeps it warm.
- **Pets:** six pixel pets with moods, short remarks and a daily streak.
- **Crew pane:** each agent Claude starts shows up live with its role, model, steps and cost, followed by a quick review of the whole result.
- **Themes:** six built-in looks, or your own colors.

A Glitch bug never breaks your session, and Glitch never blocks anything unless you turn that on.

## Requirements

- Claude Code 2.1.302 or later (tested on 2.1.311). Glitch uses Claude Code's early-access mods (function-hooks) API.
- Works in the desktop app, VS Code and the terminal. Pets and the crew pane's sprites are drawn in the desktop app; in the terminal the HUD is text and the pet talks through toasts.

## Install

In Claude Code:

```
/plugin marketplace add Sri-Ln/glitch
/plugin install glitch-pets@glitch
```

That installs everything: `glitch-pets` brings in `glitch-hud` and `glitch-core`. For the HUD without a pet, install `glitch-hud@glitch` instead.

## First steps

| Try | What happens |
|---|---|
| `/glitch` | the help card with every command |
| `/glitch-pets` | lists the pets; `/glitch-pets pixel` picks one |
| `/glitch theme neon` | switches the theme (`/glitch theme` lists them) |
| `/glitch budget 5` | sets a $5 cap for this session |
| `/glitch demo cache 4` | previews the cache warning at 4 minutes left |

Everything else is in `/config` under the Glitch plugins.

![The HUD in the terminal](docs/images/hud-terminal.png)

![The six pets](docs/images/pets.png)

![The crew pane while three agents work](docs/images/crew.gif)

## Docs

- [HUD, budget guard and cache keeper](docs/hud.md)
- [Pets](docs/pets.md)
- [Crew pane and the crew workflow](docs/crew.md)
- [Themes](docs/themes.md)
- [All commands, settings and other ways to install](docs/reference.md)

## License

MIT, see `LICENSE`.
