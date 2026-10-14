import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { THEMES, THEME_NAMES, resolveTheme } from './themes'

export const theme = atom({ plugin: 'glitch-core', key: 'theme' } as const, THEMES.glitch as NonNullable<typeof THEMES.glitch>)

// The `/glitch theme` choice, kept across sessions.
export const STORE_THEME = 'theme'

// Subcommands other Glitch plugins own. A command.run hook cannot run another command
// (the host refuses it), so a routed `/glitch <sub> …` passes down the command.run chain
// to the owner's own hook on `/glitch`; the owner must also register its `/<owner>` command,
// which is how its presence is told.
export const ROUTES: Record<string, string> = { hud: 'glitch-hud', budget: 'glitch-hud', warm: 'glitch-hud', demo: 'glitch-hud', pet: 'glitch-pets', crew: 'glitch-pets' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

// Resolves the theme from the saved choice, else the `theme` option, and publishes it.
export async function applyTheme($: EngineInterface, options: PluginOptions): Promise<string[]> {
  const saved = await $.store.get(STORE_THEME).catch(() => undefined)
  const { theme: resolved, problems } = resolveTheme(str(saved) ?? str(options.theme), str(options.custom))
  await update($, theme, () => resolved)
  return problems
}

async function installed($: EngineInterface): Promise<Set<string>> {
  const list = await $.command.list().catch(() => [])
  return new Set(list.map(c => c.name))
}

async function themeCommand($: EngineInterface, options: PluginOptions, name: string | undefined): Promise<string> {
  const current = (await read($, theme)).name
  if (!name) return `Themes: ${THEME_NAMES.map(n => (n === current ? `${n} (current)` : n)).join(', ')}`
  if (name === 'default') {
    await $.store.delete(STORE_THEME)
    await applyTheme($, options)
    return `Theme reset to ${(await read($, theme)).name}.`
  }
  if (!THEME_NAMES.includes(name)) return `Unknown theme "${name}". Themes: ${THEME_NAMES.join(', ')}`
  await $.store.set(STORE_THEME, name)
  await applyTheme($, options)
  return `Theme: ${name}.`
}

async function help($: EngineInterface): Promise<string> {
  const have = await installed($)
  const byOwner = new Map<string, string[]>()
  for (const [sub, owner] of Object.entries(ROUTES)) byOwner.set(owner, [...(byOwner.get(owner) ?? []), sub])
  const lines = [`Glitch · theme ${(await read($, theme)).name}`, '  /glitch theme [name|default] — list or switch themes']
  for (const [owner, subs] of byOwner) {
    lines.push(`  /glitch ${[...subs].sort().join(', ')} — ${owner}${have.has(owner) ? '' : ' (not installed)'}`)
  }
  return lines.join('\n')
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      const problems = await applyTheme($, options)
      if (problems.length) $.ui.toast(`Glitch: ${problems.join('; ')}`, { timeoutMs: 8000 })
    } catch {
      $.ui.toast('Glitch: could not apply theme', { timeoutMs: 8000 })
    }
    try {
      await $.command.register({ name: 'glitch', description: 'Glitch kit: themes, HUD, budget, cache keep-warm, pets (/glitch for help)' })
    } catch {
      $.ui.toast('Glitch: could not register /glitch', { timeoutMs: 8000 })
    }
    return started
  })

  on('command.run', { command: 'glitch' }, async ($, e, next) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'theme') return { text: await themeCommand($, options, rest[0]) }

    const owner = Object.hasOwn(ROUTES, sub) ? ROUTES[sub] : undefined
    if (owner) {
      if (!(await installed($)).has(owner)) return { text: `/glitch ${sub} needs the ${owner} plugin, which is not installed.` }
      return next(e)
    }
    return { text: await help($) }
  })
}
