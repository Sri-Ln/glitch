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

test('/glitch-pets with no args lists the pets', async ($, on) => {
  await session($, on, {})
  const r = await $.command.run({ command: 'glitch-pets', args: '' } as never)
  expect((r as { text: string }).text).toContain('Pets: ')
  expect((r as { text: string }).text).toContain('bud (current)')
})

test('/glitch-pets <name> picks that pet and keeps it in the store', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch-pets', args: 'fork' } as never)
  expect((r as { text: string }).text).toBe('Pet: Fork the octopus.')
  expect(store.pet).toBe('fork')
})

test('/glitch-pets off turns the pet off', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch-pets', args: 'off' } as never)
  expect((r as { text: string }).text).toBe('Pet off.')
  expect(store.pet).toBe('off')
})

test('/glitch-pets pet <name> still picks the pet', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch-pets', args: 'pet dot' } as never)
  expect((r as { text: string }).text).toBe('Pet: Dot the ladybug.')
  expect(store.pet).toBe('dot')
})

test('/glitch-pets <unknown word> says the pet is unknown and lists the pets', async ($, on) => {
  await session($, on, {})
  const r = await $.command.run({ command: 'glitch-pets', args: 'dragon' } as never)
  expect((r as { text: string }).text).toMatch(/^Unknown pet "dragon"\. Pets: /)
})

test('/glitch pet <name> through the glitch command picks the pet', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, store)
  const r = await $.command.run({ command: 'glitch', args: 'pet bud' } as never)
  expect((r as { text: string }).text).toBe('Pet: Bud the dog.')
  expect(store.pet).toBe('bud')
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

test('a broken streak resets to 1 at the first turn of the day', async ($, on) => {
  const store: Record<string, unknown> = { streak: { lastDay: '2026-10-10', count: 5, cheered: 3 } }
  const clock = await session($, on, store)
  await $.turn.start({ turnId: 't1' } as never)
  await clock.advance(150)
  expect((store.streak as { count: number }).count).toBe(1)
})

const spawnHelper = async ($: Engine, id: string, description: string, name?: string) =>
  $.agent.spawn({ tool_use_id: `tu-${id}`, prompt: 'p', description, subagentType: 'general-purpose', ...(name ? { name } : {}) } as never)

const usageAt = (usd: number) => () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 0 }, rateLimits: [], cost: { usd } } }) as never

test('the first helper opens the crew pane (auto) and the pane lists it', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('session.usage', usageAt(1))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'h1', 'Build the landing page', 'builder-1')
  expect(opened).toEqual(['glitch-crew'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'glitch-pets', surface, component: 'Pane', props: { title: 'Crew', isFocused: false, bodyColumns: 120 } as never, requestId: 'glitch-crew' })
    const text = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join(' ')
    expect(text).toContain('Build the landing page')
    expect(text).toContain(surface === 'terminal' ? 'builder' : 'Opus')
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(surface === 'terminal' ? 0 : 2)
    await ui.unmount()
  }
})

test('a second helper does not open the pane again, and manual never opens it', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: opened.length ? [{ id: 'glitch-crew', title: 'Crew', isShown: true, isFocused: false, isPlaced: true }] : [] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'a', 'A', 'builder-1')
  await spawnHelper($, 'b', 'B', 'builder-2')
  expect(opened).toEqual(['glitch-crew'])
})

test('with no crew yet the pane says so', async ($, on) => {
  await session($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'glitch-pets', surface, component: 'Pane', props: { title: 'Crew', isFocused: false, bodyColumns: 120 } as never, requestId: 'glitch-crew' })
    const text = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join(' ')
    expect(text).toContain('No crew yet')
    await ui.unmount()
  }
})

const togglePane = (on: Parameters<typeof session>[1]) => {
  let open = false
  on('ui.open', () => {
    open = true
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => {
    open = false
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: open ? [{ id: 'glitch-crew', title: 'Crew', isShown: true, isFocused: false, isPlaced: true }] : [] }) as never)
}

test('/glitch-pets crew toggles the pane', async ($, on) => {
  togglePane(on)
  await session($, on)
  expect(((await $.command.run({ command: 'glitch-pets', args: 'crew' } as never)) as { text: string }).text).toBe('Crew pane opened.')
  expect(((await $.command.run({ command: 'glitch-pets', args: 'crew' } as never)) as { text: string }).text).toBe('Crew pane closed.')
})

test('/glitch crew toggles the pane too', async ($, on) => {
  togglePane(on)
  await session($, on)
  expect(((await $.command.run({ command: 'glitch', args: 'crew' } as never)) as { text: string }).text).toBe('Crew pane opened.')
  expect(((await $.command.run({ command: 'glitch', args: 'crew' } as never)) as { text: string }).text).toBe('Crew pane closed.')
})

const sectionIds = (r: unknown) => (r as { sections: { id: string }[] }).sections.map(s => s.id)
const composeOnce = ($: Engine) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)

// Two helpers spawned and finished in main turn m1, which then ends.
const crewTurn = async ($: Engine, on: Parameters<typeof session>[1], helpers: [string, string][]) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('agent.list', () => ({ value: helpers.map(([d]) => ({ id: `ag-${d}`, description: d, type: 'general-purpose', status: 'completed' })) }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  for (const [d, name] of helpers) await spawnHelper($, d, d, name)
  for (const [d] of helpers) await $.turn.complete({ turnId: `s-${d}`, agentId: `ag-${d}`, reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  await $.turn.complete({ turnId: 'm1', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
}

test('the crew rule is added to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  await session($, on)
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('a main turn whose 2 helpers finished unreviewed sends the reminder on the next compose, once', async ($, on) => {
  await crewTurn($, on, [['A', 'builder-1'], ['B', 'builder-2']])
  const first = (await composeOnce($)) as { sections: readonly { id: string; text: string }[] }
  expect(first.sections.map(s => s.id)).toEqual(['intro', 'glitch-pets:crew', 'glitch-pets:crew-missed'])
  expect(first.sections[2]?.text).toContain('reviewer')
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
  // The next main turn does not bring it back.
  await $.turn.start({ turnId: 'm2' } as never)
  await $.turn.complete({ turnId: 'm2', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('no reminder while the turn with the crew is still running', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('agent.list', () => ({ value: [{ id: 'ag-A', status: 'completed' }, { id: 'ag-B', status: 'completed' }] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  await $.turn.complete({ turnId: 's-A', agentId: 'ag-A', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  await $.turn.complete({ turnId: 's-B', agentId: 'ag-B', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('no reminder when a reviewer ran', async ($, on) => {
  await crewTurn($, on, [['A', 'builder-1'], ['B', 'builder-2'], ['R', 'reviewer-1']])
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('one helper is no crew to review', async ($, on) => {
  await crewTurn($, on, [['A', 'builder-1']])
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('with the crew review off: no rule and no reminder', { options: { crewReview: false } }, async ($, on) => {
  await crewTurn($, on, [['A', 'builder-1'], ['B', 'builder-2']])
  expect(sectionIds(await composeOnce($))).toEqual(['intro'])
})
