// What the running engine supports, for calls newer than some engines the plugin meets. Pure.
// A hooks module may only call `$` (reading `$.ui.view` as a value refuses the module), so a
// newer call is known from the engine's version ($.session.version), and a call that turns out
// missing is recognised by its error.

/** The first engine release whose API has `$.ui.view` (2.1.296's has none; 2.1.302's has it). */
export const UI_VIEW_SINCE = [2, 1, 302] as const

/** True when a release `a.b.c` (any suffix, such as `-dev…`) is at or after `min`; false for anything unreadable. */
export function versionAtLeast(version: string | undefined, min: readonly number[]): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  if (!m) return false
  const v = [Number(m[1]), Number(m[2]), Number(m[3])]
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return (v[i] as number) > (min[i] as number)
  return true
}

/** True when an error says the call `name` (say `ui.view`) does not exist on this engine. */
export function isMissingCall(err: unknown, name: string): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const dotted = name.replace(/\./g, '\\.')
  return new RegExp(`\\b${dotted}\\b.*(is not a function|is undefined)|${dotted} is not a function`, 'i').test(msg)
}
