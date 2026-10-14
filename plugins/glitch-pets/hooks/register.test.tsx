import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let toasts: string[] = []
const START = Date.parse('2026-10-14T10:00:00Z')

const session = async ($: Engine, on: On, store: Record<string, unknown> = {}) => {
  toasts = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  const clock = mock.clock(on, { now: START })
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
  on('session.surfaces', () => ({ value: ['desktop'] }) as never)
  on('command.register', () => ({ value: { command: 'glitch-pets' } }) as never)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.start', async () => ({ cwd: 'C:\\repo' }) as never)
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'desktop', isInteractive: true } as never)
  return clock
}

// The test's `$` has no `$.state`, so what is drawn is unit-tested in tick.test.ts; here the
// command, the store and the remarks.
test('/glitch-pets pet fork switches and is kept in the store', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch-pets', args: 'pet fork' } as never)
  expect((r as { text: string }).text).toBe('Pet: Fork the octopus.')
  expect(store.pet).toBe('fork')
  const list = await $.command.run({ command: 'glitch-pets', args: 'pet' } as never)
  expect((list as { text: string }).text).toContain('fork (current)')
})

test('a saved pet is restored, and an unknown name is refused', async ($, on) => {
  await session($, on, { pet: 'fork' })
  const list = await $.command.run({ command: 'glitch-pets', args: 'pet' } as never)
  expect((list as { text: string }).text).toContain('fork (current)')
  const bad = await $.command.run({ command: 'glitch-pets', args: 'pet dragon' } as never)
  expect((bad as { text: string }).text).toContain('Unknown pet "dragon"')
})

test('pet off is kept in the store', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch-pets', args: 'pet off' } as never)
  expect((r as { text: string }).text).toBe('Pet off.')
  expect(store.pet).toBe('off')
})

test('a third day in a row is kept and cheers once, with a remark', async ($, on) => {
  const store: Record<string, unknown> = { streak: { lastDay: '2026-10-13', count: 2, cheered: 0 } }
  const clock = await session($, on, store)
  await $.turn.start({ turnId: 't1' } as never)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 1000, isAborted: false } as never)
  await clock.advance(150)
  expect((store.streak as { count: number }).count).toBe(3)
  expect(toasts.some(t => t.startsWith('Bud: '))).toBe(true)
})
