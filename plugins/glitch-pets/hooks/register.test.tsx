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

test('a second helper of the crew does not open the pane again', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  // The pane reads as closed, so only the crew decides.
  on('ui.panes', () => ({ value: [] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await Promise.all([spawnHelper($, 'a', 'A', 'builder-1'), spawnHelper($, 'b', 'B', 'builder-2')])
  await spawnHelper($, 'c', 'C', 'builder-3')
  expect(opened).toEqual(['glitch-crew'])
})

test('crewPane manual never opens the pane', { options: { crewPane: 'manual' } }, async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'a', 'A', 'builder-1')
  expect(opened).toEqual([])
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
const submit = ($: Engine, origin: object = { kind: 'composer' }) => $.prompt.submit({ text: 'go on', wait: false, origin } as never)
const mainStart = ($: Engine, id: string) => $.turn.start({ turnId: id } as never)
const mainEnd = ($: Engine, id: string) => $.turn.complete({ turnId: id, reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
const agentEnd = ($: Engine, agentId: string) => $.turn.complete({ turnId: `s-${agentId}`, agentId, reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
const paneText = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ plugin: 'glitch-pets', surface, component: 'Pane', props: { title: 'Crew', isFocused: false, bodyColumns: 120 } as never, requestId: 'glitch-crew' })
  const text = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join(' | ')
  await ui.unmount()
  return text
}

// The engine around a crew: agents' statuses, the session's cost, what each prompt carried.
const crewHarness = async ($: Engine, on: Parameters<typeof session>[1]) => {
  const h = { status: {} as Record<string, string>, listFails: false, hold: null as Promise<void> | null, usd: 0, contexts: [] as (readonly string[] | undefined)[], opened: [] as string[] }
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  on('prompt.submit', async (_$, e) => {
    h.contexts.push(e.context)
    if (h.hold) await h.hold
    return { text: e.text } as never
  })
  on('agent.spawn', (_$, e) => {
    h.status[`ag-${e.description}`] = 'running'
    return { model: 'claude-opus-5-5', agentId: `ag-${e.description}` } as never
  })
  on('agent.list', () => {
    if (h.listFails) throw new Error('list refused')
    return { value: Object.entries(h.status).map(([id, status]) => ({ id, description: id, type: 'general-purpose', status })) } as never
  })
  on('ui.open', (_$, e) => {
    h.opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 0 }, rateLimits: [], cost: { usd: h.usd } } }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.step', async function* () {
    return { turnId: 's', index: 0, answer: '', toolUses: [] } as never
  })
  const clock = await session($, on)
  return { h, clock }
}

// Background helpers: builder-1 and builder-2 start in m1 and finish in m2 and m3.
const backgroundCrew = async ($: Engine, on: Parameters<typeof session>[1]) => {
  const { h, clock } = await crewHarness($, on)
  h.usd = 1
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  await mainEnd($, 'm1')
  await clock.advance(1000)
  await mainStart($, 'm2')
  h.status['ag-A'] = 'completed'
  await agentEnd($, 'ag-A')
  await mainEnd($, 'm2')
  await clock.advance(1000)
  await mainStart($, 'm3')
  h.status['ag-B'] = 'completed'
  await agentEnd($, 'ag-B')
  h.usd = 3
  return { h, clock }
}

test('a crew spans main turns: the reviewer spawned later joins the same crew', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await spawnHelper($, 'R', 'R', 'reviewer-1')
  await mainEnd($, 'm3')
  h.usd = 5
  for (const surface of ['terminal', 'desktop'] as const) {
    const text = await paneText($, surface)
    for (const d of ['A ✓', 'B ✓', 'R']) expect(text).toContain(d)
    // costAtStart (1) and startedAt (m1) are the crew's own: $4 over 2 s.
    expect(text).toContain('≈$4.00 · 0 tok · 0:02')
  }
  expect(h.opened).toEqual(['glitch-crew'])
  await submit($)
  expect(h.contexts).toEqual([undefined])
})

test('background helpers that finish unreviewed: the reminder rides the next prompt, once', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  // A stray compose or a plugin's own prompt does not take it.
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
  await submit($, { kind: 'plugin', name: 'other' })
  await submit($)
  await submit($)
  expect(h.contexts.length).toBe(3)
  expect(h.contexts[0]).toBeUndefined()
  expect(h.contexts[1]?.length).toBe(1)
  expect(h.contexts[1]?.[0]).toContain('reviewer-1')
  expect(h.contexts[2]).toBeUndefined()
  // Later turns do not bring it back.
  await mainStart($, 'm4')
  await mainEnd($, 'm4')
  await submit($)
  expect(h.contexts[3]).toBeUndefined()
})

test('no reminder while helpers still run at the turn end', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  await mainEnd($, 'm1')
  await submit($)
  expect(h.contexts).toEqual([undefined])
})

test('one helper is no crew to review', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  h.status['ag-A'] = 'completed'
  await mainEnd($, 'm1')
  await submit($)
  expect(h.contexts).toEqual([undefined])
})

test('a quiet main turn closes the crew; the next spawn starts a fresh one', async ($, on) => {
  const { h, clock } = await crewHarness($, on)
  h.usd = 1
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  h.status['ag-A'] = 'completed'
  await mainEnd($, 'm1')
  await mainStart($, 'm2')
  await mainEnd($, 'm2')
  await clock.advance(1000)
  h.usd = 2
  await mainStart($, 'm3')
  await spawnHelper($, 'B', 'B', 'builder-1')
  h.usd = 2.5
  const text = await paneText($, 'terminal')
  expect(text).toContain('B')
  expect(text).not.toContain('A ✓')
  expect(text).toContain('≈$0.50 · 0 tok · 0:00')
  expect(h.opened).toEqual(['glitch-crew', 'glitch-crew'])
})

test('a helper\'s steps set its model, effort and tier; its tool calls drive progress', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  const stream = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)({ turnId: 's', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: 'ag-B' })
  while (!(await stream.next()).done) {
    // Read the stream to its end.
  }
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Read', file_path: 'x', agentId: 'ag-A' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'x', agentId: 'ag-B' } as never)
  h.status['ag-A'] = 'completed'
  await agentEnd($, 'ag-A')
  const text = await paneText($, 'terminal')
  expect(text).toContain('builder · heavy · Opus 5.5 · high')
  // B made 1 of the 4 tool calls A took: a quarter of the bar.
  expect(text).toContain('▰▱▱▱')
})

test('the crewDone remark when the reviewer finishes and nothing else runs', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'R', 'R', 'reviewer-1')
  await mainEnd($, 'm1')
  expect(toasts.filter(t => t.startsWith('Bud: '))).toEqual([])
  h.status['ag-R'] = 'completed'
  await agentEnd($, 'ag-R')
  const crewDone = ['The pack is done! I checked them all!', 'Everyone did great! Review done!', 'All checked! Good pack!'].map(l => `Bud: ${l}`)
  expect(toasts.filter(t => crewDone.includes(t)).length).toBe(1)
})

test('the crew rule is added to the system prompt', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  await session($, on)
  expect(sectionIds(await composeOnce($))).toEqual(['intro', 'glitch-pets:crew'])
})

test('with the crew review off: no rule and no reminder', { options: { crewReview: false } }, async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  expect(sectionIds(await composeOnce($))).toEqual(['intro'])
  await submit($)
  expect(h.contexts).toEqual([undefined])
})

test('a helper that leaves the list ends after the grace; a failed list call ends nothing', async ($, on) => {
  const writes: string[] = []
  on('state.set', (_$, e, next) => {
    writes.push(String((e as { key?: string }).key))
    return next(e)
  })
  const { h, clock } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await mainEnd($, 'm1')
  // The task leaves the list; a refused list call must not end the row.
  delete h.status['ag-A']
  h.listFails = true
  await clock.advance(5000)
  expect(await paneText($, 'terminal')).not.toContain('A ✓')
  h.listFails = false
  await clock.advance(1000)
  expect(await paneText($, 'terminal')).toContain('A ✓')
  // Ended: the next quiet turn closes the crew and the 1 s crew writes stop.
  await mainStart($, 'm2')
  await mainEnd($, 'm2')
  writes.length = 0
  await clock.advance(3000)
  expect(writes.filter(k => k === 'crew')).toEqual([])
  await mainStart($, 'm3')
  await spawnHelper($, 'B', 'B', 'builder-1')
  expect(await paneText($, 'terminal')).not.toContain('A ✓')
  expect(h.opened).toEqual(['glitch-crew', 'glitch-crew'])
})

test('at a long turn\'s end the crewDone remark wins over happy', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'R', 'R', 'reviewer-1')
  h.status['ag-R'] = 'completed'
  await $.turn.complete({ turnId: 'm1', reason: 'answer', answer: '', durationMs: 200_000, isAborted: false } as never)
  const crewDone = ['The pack is done! I checked them all!', 'Everyone did great! Review done!', 'All checked! Good pack!'].map(l => `Bud: ${l}`)
  const remarks = toasts.filter(t => t.startsWith('Bud: '))
  expect(remarks.length).toBe(1)
  expect(crewDone).toContain(remarks[0])
})

test('two prompts at once carry the reminder once', async ($, on) => {
  const { h, clock } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  // The first prompt is still entering when the second arrives.
  let release = () => {}
  h.hold = new Promise<void>(r => (release = r))
  const both = Promise.all([submit($), submit($)])
  await clock.advance(100)
  release()
  await both
  h.hold = null
  expect(h.contexts.filter(c => c?.length).length).toBe(1)
  await submit($)
  expect(h.contexts.filter(c => c?.length).length).toBe(1)
})
