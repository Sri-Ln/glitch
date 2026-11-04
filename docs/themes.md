# Themes

[← Back to the README](../README.md)

Six built-in themes: `glitch` (default, electric cyan and magenta), `neon`, `mono`, `sunset`, `matrix`, `paper`. `/glitch theme` lists them, `/glitch theme neon` switches and remembers the choice across sessions, `/glitch theme default` clears it.

Resolution order: the last `/glitch theme <name>`, then the `theme` setting, then `glitch`. The `custom` setting, a JSON object of tokens, is merged over the result:

```json
{ "accent": "#ff6ad5", "bar": "█░" }
```

Color tokens are `accent`, `good`, `warn`, `alert`, `muted`, `info` (as `#rrggbb`); `bar` is the full and empty characters of the context bar; `icons` is `emoji`, `symbols` or `ascii`. An unknown theme name falls back to `glitch`; malformed `custom` JSON is ignored and the chosen theme is kept. Either problem toasts at session start.
