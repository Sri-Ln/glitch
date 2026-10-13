import { atom, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { THEMES, resolveTheme } from './themes'

export const theme = atom({ plugin: 'glitch-core', key: 'theme' } as const, THEMES.glitch as NonNullable<typeof THEMES.glitch>)

// The `/glitch theme` choice, kept across sessions.
export const STORE_THEME = 'theme'

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

// Resolves the theme from the saved choice, else the `theme` option, and publishes it.
export async function applyTheme($: EngineInterface, options: PluginOptions): Promise<string[]> {
  const saved = await $.store.get(STORE_THEME).catch(() => undefined)
  const { theme: resolved, problems } = resolveTheme(str(saved) ?? str(options.theme), str(options.custom))
  await update($, theme, () => resolved)
  return problems
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const problems = await applyTheme($, options)
    if (problems.length) $.ui.toast(`Glitch: ${problems.join('; ')}`, { timeoutMs: 8000 })
    return started
  })
}
