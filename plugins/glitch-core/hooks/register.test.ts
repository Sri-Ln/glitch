import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// Hooks beneath the plugin must be registered before the first `$` call, so what
// is installed is declared before `start`, not after.
const installedAs = (on: On, names: string[]) =>
  on('command.list', () => ({ value: names.map(name => ({ name, description: '', source: 'plugin' })) }) as never)

// The plugin's store, kept in the `store` object the test passes so it can read what was saved.
const start = async ($: Engine, on: On, store: Record<string, unknown> = {}) => {
  on('store.get', (_$, e) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined } as never
  })
  on('store.delete', (_$, e) => {
    delete store[e.key]
    return { value: undefined } as never
  })
  on('store.keys', () => ({ value: Object.keys(store) }) as never)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'glitch' } }) as never)
  on('session.start', async () => ({ cwd: 'C:\repo' }) as never)
  await $.session.start({ source: 'startup', cwd: 'C:\repo', surface: 'terminal', isInteractive: true } as never)
}

const run = async ($: Engine, args: string) => (await $.command.run({ command: 'glitch', args } as never)).text ?? ''

const themeName = async ($: Engine) => (await run($, '')).match(/theme (\w+)/)?.[1]

test('glitch: the option picks the theme at start', { options: { theme: 'neon' } }, async ($, on) => {
  await start($, on)
  expect(await themeName($)).toBe('neon')
})

test('glitch: a saved choice wins over the option', { options: { theme: 'neon' } }, async ($, on) => {
  await start($, on, { theme: 'matrix' })
  expect(await themeName($)).toBe('matrix')
})

test('glitch theme: lists themes and marks the current one', async ($, on) => {
  await start($, on)
  expect(await run($, 'theme')).toBe('Themes: glitch (current), neon, mono, sunset, matrix, paper')
})

test('glitch theme <name>: switches and persists', async ($, on) => {
  const store: Record<string, unknown> = {}
  await start($, on, store)
  expect(await run($, 'theme sunset')).toBe('Theme: sunset.')
  expect(await themeName($)).toBe('sunset')
  expect(store.theme).toBe('sunset')
})

test('glitch theme default: clears the saved choice', { options: { theme: 'paper' } }, async ($, on) => {
  const store: Record<string, unknown> = { theme: 'matrix' }
  await start($, on, store)
  expect(await run($, 'theme default')).toBe('Theme reset to paper.')
  expect(store.theme).toBeUndefined()
  expect(await themeName($)).toBe('paper')
})

test('glitch theme <unknown>: refuses and lists', async ($, on) => {
  await start($, on)
  expect(await run($, 'theme vaporwave')).toBe('Unknown theme "vaporwave". Themes: glitch, neon, mono, sunset, matrix, paper')
  expect(await themeName($)).toBe('glitch')
})

test('glitch <routed>: forwards to the owning plugin', async ($, on) => {
  const seen: string[] = []
  installedAs(on, ['glitch-hud'])
  on('command.run', { command: 'glitch' }, (_$, e) => {
    seen.push(e.args)
    return { text: 'hud says hi' }
  })
  await start($, on)
  expect(await run($, 'budget +2')).toBe('hud says hi')
  expect(seen).toEqual(['budget +2'])
})

test('glitch <routed>: says when the owner is not installed', async ($, on) => {
  installedAs(on, [])
  await start($, on)
  expect(await run($, 'warm')).toBe('/glitch warm needs the glitch-hud plugin, which is not installed.')
})

test('glitch: no or unknown subcommand shows the help card', async ($, on) => {
  installedAs(on, [])
  await start($, on)
  const help = await run($, '')
  expect(help).toContain('Glitch · theme glitch')
  expect(help).toContain('/glitch theme [name|default]')
  expect(help).toContain('/glitch budget, demo, hud, warm — glitch-hud (not installed)')
  expect(await run($, 'nope')).toBe(help)
})
