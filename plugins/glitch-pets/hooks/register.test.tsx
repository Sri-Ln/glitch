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
  const h = { status: {} as Record<string, string>, listFails: false, listCalls: 0, step: null as object | null, hold: null as Promise<void> | null, usd: 0, contexts: [] as (readonly string[] | undefined)[], opened: [] as string[], contextOut: 'none' as 'none' | 'echo' | 'strip', spawned: [] as { type: string; model?: string; name?: string }[] }
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }) as never)
  on('prompt.submit', async (_$, e) => {
    h.contexts.push(e.context)
    if (h.hold) await h.hold
    if (h.contextOut === 'echo') return { text: e.text, context: e.context } as never
    if (h.contextOut === 'strip') return { text: e.text, context: [] } as never
    return { text: e.text } as never
  })
  on('agent.spawn', (_$, e) => {
    h.spawned.push({ type: e.subagentType, ...(e.model !== undefined ? { model: e.model } : {}), ...(e.name ? { name: e.name } : {}) })
    h.status[`ag-${e.description}`] = 'running'
    return { model: 'claude-opus-5-5', agentId: `ag-${e.description}` } as never
  })
  on('agent.list', () => {
    h.listCalls += 1
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
    return { turnId: 's', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: h.step } as never
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
  expect(await paneText($, 'terminal')).toContain('1 done, 0 failed')
  // Ended: the next quiet turn closes the crew and the 1 s crew writes stop.
  await mainStart($, 'm2')
  await mainEnd($, 'm2')
  writes.length = 0
  h.listCalls = 0
  await clock.advance(3000)
  expect(writes.filter(k => k === 'crew')).toEqual([])
  // Nothing runs: the per-second status call is skipped too.
  expect(h.listCalls).toBe(0)
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

test('a reminder a lower hook stripped is not counted as sent: the next prompt carries it', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  h.contextOut = 'strip'
  await submit($)
  h.contextOut = 'echo'
  await submit($)
  await submit($)
  expect(h.contexts.filter(c => c?.length).length).toBe(2)
})

const runStep = async ($: Engine, agentId: string) => {
  const stream = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)({ turnId: 's', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId })
  while (!(await stream.next()).done) {
    // Read the stream to its end.
  }
}

test('an aborted main turn skips the review check, and the crew is not reminded later', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await $.turn.complete({ turnId: 'm3', reason: 'aborted', answer: '', durationMs: 1, isAborted: true } as never)
  await submit($)
  await mainStart($, 'm4')
  await mainEnd($, 'm4')
  await submit($)
  expect(h.contexts).toEqual([undefined, undefined])
})

test('a helper\'s own sub-spawn and a workflow agent join no crew', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await $.agent.spawn({ tool_use_id: 'tu-1', prompt: 'p', description: 'Sub', subagentType: 'general-purpose', name: 'builder-1', parentAgentId: 'ag-X' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-2', prompt: 'p', description: 'Flow', subagentType: 'general-purpose', name: 'builder-2', workflow: { runId: 'wf_1', agentIndex: 1 } } as never)
  expect(await paneText($, 'terminal')).toContain('No crew yet')
  expect(h.opened).toEqual([])
})

// Another plugin's own spawn (here from its command).
const OTHER = {
  name: 'other',
  register: ((on: On) => {
    on('command.run', { command: 'other' }, async $ => {
      await $.agent.spawn({ tool_use_id: 'tu-o', prompt: 'p', description: 'Theirs', subagentType: 'general-purpose', name: 'builder-1' } as never)
      return { text: 'ok' }
    })
  }) as never,
}

test('a spawn another plugin makes joins no crew', { plugins: [OTHER] }, async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await $.command.run({ command: 'other', args: '' } as never)
  expect(await paneText($, 'terminal')).toContain('No crew yet')
  expect(h.opened).toEqual([])
})

test('a resumed helper is running again in its own row', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  h.status['ag-A'] = 'completed'
  await agentEnd($, 'ag-A')
  h.status['ag-A'] = 'running'
  await $.agent.spawn({ tool_use_id: 'tu-r', prompt: 'fix it', description: 'A', subagentType: 'general-purpose', resume: { agentId: 'ag-A' } } as never)
  const text = await paneText($, 'terminal')
  expect(text).toContain('Running · 2')
  expect(text).not.toContain('A ✓')
  expect(text).not.toContain('Finished')
})

test('a running helper shows its tokens from its steps, counted once at its end', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'A', 'builder-1')
  await spawnHelper($, 'B', 'B', 'builder-2')
  h.step = { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 300, model: 'claude-opus-5-5' }
  await runStep($, 'ag-A')
  await runStep($, 'ag-A')
  expect(await paneText($, 'terminal')).toContain('3k tok')
  await $.turn.complete({ turnId: 's-A', agentId: 'ag-A', reason: 'answer', answer: '', durationMs: 1, isAborted: false, usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 600, model: 'claude-opus-5-5' } } as never)
  const text = await paneText($, 'terminal')
  expect(text).toContain('≈$0.00 · 3k tok')
  expect(text).not.toContain('6k tok')
})

test('unnamed helpers (an ad-hoc fan-out) show in the pane but get no reminder', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnHelper($, 'E1', 'Explore the hooks')
  await spawnHelper($, 'E2', 'Explore the tests')
  h.status['ag-Explore the hooks'] = 'completed'
  h.status['ag-Explore the tests'] = 'completed'
  await mainEnd($, 'm1')
  await submit($)
  expect(h.contexts).toEqual([undefined])
  expect(await paneText($, 'terminal')).toContain('2 done, 0 failed')
})

test('a reviewer that joins before the reminder goes out drops it', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  await spawnHelper($, 'R', 'R', 'reviewer-1')
  await submit($)
  await submit($)
  expect(h.contexts).toEqual([undefined, undefined])
})

test('once nothing runs the finished helpers fold to one line', async ($, on) => {
  await backgroundCrew($, on)
  await mainEnd($, 'm3')
  const text = await paneText($, 'terminal')
  expect(text).toContain('2 done, 0 failed')
  expect(text).not.toContain('A ✓')
})

// ── Crew tiers (#43) ──

const registered = (on: On, fail = false) => {
  const specs: { name: string; model?: string; effort?: string | number; description: string; disallowedTools?: readonly string[] }[] = []
  on('agent.register', (_$, e) => {
    if (fail) throw new Error('schema refused')
    specs.push(e)
    return { value: { agent: `glitch-pets:${e.name}` } } as never
  })
  return specs
}

test('the crew types are registered at the start, each with its rung\'s model and effort', async ($, on) => {
  const specs = registered(on)
  await session($, on)
  expect(specs.map(s => `${s.name} ${s.model} ${s.effort}`)).toEqual([
    'crew-light claude-haiku-5-5 low',
    'crew-light-high claude-haiku-5-5 high',
    'crew-medium claude-sonnet-5-5 medium',
    'crew-medium-high claude-sonnet-5-5 high',
    'crew-heavy claude-opus-5-5 high',
    'crew-heavy-xhigh claude-opus-5-5 xhigh',
    'crew-heavy-max claude-opus-5-5 max',
  ])
  expect(specs.every(s => s.disallowedTools?.includes('Agent'))).toBe(true)
  expect(toasts.filter(t => t.includes('crew agent types'))).toEqual([])
})

test('the crewTiers setting changes the types; a bad one keeps the defaults and toasts', { options: { crewTiers: '{"light":{"model":"claude-sonnet-5-5"},"heavy":{"effort":"max"}}' } }, async ($, on) => {
  const specs = registered(on)
  await session($, on)
  expect(specs[0]).toMatchObject({ name: 'crew-light', model: 'claude-sonnet-5-5', effort: 'low' })
  expect(specs.find(s => s.name === 'crew-heavy')).toMatchObject({ model: 'claude-opus-5-5', effort: 'high' })
  expect(toasts.some(t => t.includes('crewTiers.heavy.effort'))).toBe(true)
})

test('a refused registration is said once', async ($, on) => {
  registered(on, true)
  await session($, on)
  const said = toasts.filter(t => t.includes('could not register crew agent types'))
  expect(said.length).toBe(1)
  expect(said[0]).toContain('crew-light')
})

test('a spawn on a crew type runs on its model: a different model is set back; other types are left alone', async ($, on) => {
  const seen: { type: string; model?: string }[] = []
  on('agent.spawn', (_$, e) => {
    seen.push({ type: e.subagentType, ...(e.model !== undefined ? { model: e.model } : {}) })
    return { model: e.model ?? 'claude-opus-5-5', agentId: `ag-${e.description}` } as never
  })
  on('session.usage', usageAt(0))
  await session($, on)
  const spawnAs = (type: string, d: string, model?: string) => $.agent.spawn({ tool_use_id: `tu-${d}`, prompt: 'p', description: d, subagentType: type, ...(model ? { model } : {}) } as never)
  await spawnAs('glitch-pets:crew-light', 'a', 'opus')
  await spawnAs('glitch-pets:crew-medium', 'b')
  await spawnAs('glitch-pets:crew-heavy-xhigh', 'c', 'claude-opus-5-5')
  await spawnAs('general-purpose', 'd', 'haiku')
  expect(seen).toEqual([
    { type: 'glitch-pets:crew-light', model: 'claude-haiku-5-5' },
    { type: 'glitch-pets:crew-medium' },
    { type: 'glitch-pets:crew-heavy-xhigh', model: 'claude-opus-5-5' },
    { type: 'general-purpose', model: 'haiku' },
  ])
})

test('an Agent call\'s own effort is set to the crew type\'s, kept for others', async ($, on) => {
  const inputs: Record<string, unknown>[] = []
  on('tool.call', (_$, e) => {
    inputs.push(e as never)
    return { result: 'ok' } as never
  })
  await session($, on)
  await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'p', subagent_type: 'glitch-pets:crew-light', effort: 'max' } as never)
  await $.tool.call({ tool: 'Agent', description: 'b', prompt: 'p', subagent_type: 'Explore', effort: 'max' } as never)
  expect(inputs[0]?.effort).toBe('low')
  expect(inputs[0]?.subagent_type).toBe('glitch-pets:crew-light')
  expect(inputs[1]?.effort).toBe('max')
})

const spawnCrew = async ($: Engine, id: string, type: string, name: string) =>
  $.agent.spawn({ tool_use_id: `tu-${id}`, prompt: 'p', description: id, subagentType: `glitch-pets:${type}`, name } as never)
const stepNotes = (h: { contexts: (readonly string[] | undefined)[] }) => h.contexts.flatMap(c => c ?? []).filter(t => t.includes('failed on'))

test('a failed crew member: the step-up note rides the next prompt once; the retry steps up again, at most twice', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  await spawnCrew($, 'B', 'crew-medium', 'builder-2')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  // The failed helper's own task notification carries it.
  await submit($, { kind: 'task-notification' })
  await submit($)
  expect(stepNotes(h)).toEqual([
    'Glitch crew: builder-1 failed on Haiku · low (glitch-pets:crew-light); retry it with subagent type glitch-pets:crew-light-high: the same prompt, the name builder-1, and no model or effort.',
  ])
  expect(h.contexts[1]).toBeUndefined()
  // The retry fails too: one more step, to the medium tier.
  await spawnCrew($, 'A2', 'crew-light-high', 'builder-1')
  h.status['ag-A2'] = 'failed'
  await agentEnd($, 'ag-A2')
  await submit($)
  expect(stepNotes(h).length).toBe(2)
  expect(stepNotes(h)[1]).toContain('retry it with subagent type glitch-pets:crew-medium:')
  // Two step-ups taken: a third failure gets no note.
  await spawnCrew($, 'A3', 'crew-medium', 'builder-1')
  h.status['ag-A3'] = 'failed'
  await agentEnd($, 'ag-A3')
  await submit($)
  expect(stepNotes(h).length).toBe(2)
})

test('no step-up for a killed, a non-crew or a finished helper; a plugin\'s prompt does not take the note', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'K', 'crew-light', 'builder-1')
  await spawnHelper($, 'G', 'G', 'builder-2')
  await spawnCrew($, 'D', 'crew-heavy', 'builder-3')
  await spawnCrew($, 'F', 'crew-heavy', 'tester-1')
  h.status['ag-K'] = 'killed'
  h.status['ag-G'] = 'failed'
  h.status['ag-D'] = 'completed'
  h.status['ag-F'] = 'failed'
  await agentEnd($, 'ag-K')
  await submit($, { kind: 'plugin', name: 'other' })
  await submit($)
  expect(stepNotes(h).length).toBe(1)
  expect(stepNotes(h)[0]).toContain('tester-1 failed on Opus · high (glitch-pets:crew-heavy); retry it with subagent type glitch-pets:crew-heavy-xhigh')
  expect(h.contexts[0]).toBeUndefined()
})

test('a step-up note a lower hook stripped is sent again with the next prompt', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  h.contextOut = 'strip'
  await submit($)
  h.contextOut = 'echo'
  await submit($)
  await submit($)
  expect(h.contexts.map(c => (c ?? []).filter(t => t.includes('failed on')).length)).toEqual([1, 1, 0])
})

// ── Crew themes: /glitch crew theme [id], kept in the store like the pet ──
test('/glitch crew theme lists the themes, current busy-hands by default', async ($, on) => {
  await session($, on)
  for (const [command, args] of [['glitch', 'crew theme'], ['glitch-pets', 'crew theme'], ['glitch', 'crew themes'], ['glitch-pets', 'crew themes']] as const) {
    const r = (await $.command.run({ command, args } as never)) as { text: string }
    expect(r.text).toContain('busy-hands (Busy hands) (current)')
    expect(r.text).toContain('hats')
  }
})

test('/glitch crew theme hats switches and is kept; a saved theme is restored', async ($, on) => {
  const store: Record<string, unknown> = {}
  togglePane(on)
  await session($, on, store)
  const r = (await $.command.run({ command: 'glitch', args: 'crew theme hats' } as never)) as { text: string }
  expect(r.text).toBe('Crew theme: Hats.')
  expect(store.crewTheme).toBe('hats')
  const bad = (await $.command.run({ command: 'glitch-pets', args: 'crew theme sparkles' } as never)) as { text: string }
  expect(bad.text).toContain('Unknown crew theme "sparkles"')
  // `crew` alone still toggles the pane.
  expect(((await $.command.run({ command: 'glitch', args: 'crew' } as never)) as { text: string }).text).toBe('Crew pane opened.')
})

test('a saved crew theme is restored at start', async ($, on) => {
  await session($, on, { crewTheme: 'hats' })
  const r = (await $.command.run({ command: 'glitch', args: 'crew theme' } as never)) as { text: string }
  expect(r.text).toContain('hats (Hats) (current)')
})

test('the crewTheme setting is the default when nothing is saved', { options: { crewTheme: 'hats' } }, async ($, on) => {
  await session($, on)
  const r = (await $.command.run({ command: 'glitch', args: 'crew theme' } as never)) as { text: string }
  expect(r.text).toContain('hats (Hats) (current)')
})

// ── Crew tiers, fix round 1: the step-up holds the review; retries are forced one rung up ──

test('a failed member held for a step-up: only the step-up note; the review reminder after the retry finishes', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  await spawnCrew($, 'B', 'crew-medium', 'builder-2')
  await mainEnd($, 'm1')
  await mainStart($, 'm2')
  h.status['ag-A'] = 'failed'
  h.status['ag-B'] = 'completed'
  await agentEnd($, 'ag-A')
  await agentEnd($, 'ag-B')
  await mainEnd($, 'm2')
  await submit($, { kind: 'task-notification' })
  expect(h.contexts[0]?.length).toBe(1)
  expect(h.contexts[0]?.[0]).toContain('builder-1 failed on Haiku')
  await mainStart($, 'm3')
  await spawnCrew($, 'A2', 'crew-light-high', 'builder-1')
  h.status['ag-A2'] = 'completed'
  await agentEnd($, 'ag-A2')
  await mainEnd($, 'm3')
  await submit($)
  expect(h.contexts[1]?.length).toBe(1)
  expect(h.contexts[1]?.[0]).toContain('reviewer-1')
  expect(h.contexts[1]?.[0]).not.toContain('failed on')
})

test('a retry on the old rung is spawned one rung up and counts toward the cap of 2', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await submit($)
  // Claude retries on the rung it failed on.
  await spawnCrew($, 'A2', 'crew-light', 'builder-1')
  expect(h.spawned[1]).toEqual({ type: 'glitch-pets:crew-light-high', name: 'builder-1' })
  h.status['ag-A2'] = 'failed'
  await agentEnd($, 'ag-A2')
  await submit($)
  expect(stepNotes(h)[1]).toContain('glitch-pets:crew-medium:')
  // Even with a model of its own: the type is forced and so is its model.
  await $.agent.spawn({ tool_use_id: 'tu-A3', prompt: 'p', description: 'A3', subagentType: 'glitch-pets:crew-light', name: 'builder-1', model: 'haiku' } as never)
  expect(h.spawned[2]).toEqual({ type: 'glitch-pets:crew-medium', model: 'claude-sonnet-5-5', name: 'builder-1' })
  h.status['ag-A3'] = 'failed'
  await agentEnd($, 'ag-A3')
  await submit($)
  expect(stepNotes(h).length).toBe(2)
  // Past the cap a retry is not forced and still counts as capped.
  await spawnCrew($, 'A4', 'crew-light', 'builder-1')
  expect(h.spawned[3]).toEqual({ type: 'glitch-pets:crew-light', name: 'builder-1' })
  h.status['ag-A4'] = 'failed'
  await agentEnd($, 'ag-A4')
  await submit($)
  expect(stepNotes(h).length).toBe(2)
})

test('a retry above the failed rung is left as Claude picked it; another name is not taken for the retry', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await submit($)
  await spawnCrew($, 'C', 'crew-light', 'builder-2')
  expect(h.spawned[1]).toEqual({ type: 'glitch-pets:crew-light', name: 'builder-2' })
  await spawnCrew($, 'A2', 'crew-heavy', 'builder-1')
  expect(h.spawned[2]).toEqual({ type: 'glitch-pets:crew-heavy', name: 'builder-1' })
})

test('a resumed member that fails again is not stepped up twice', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await submit($)
  h.status['ag-A'] = 'running'
  await $.agent.spawn({ tool_use_id: 'tu-r', prompt: 'try again', description: 'A', subagentType: 'glitch-pets:crew-light', resume: { agentId: 'ag-A' } } as never)
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await submit($)
  expect(stepNotes(h).length).toBe(1)
})

test('a step-up of a crew that closed is not carried into a fresh one', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await mainEnd($, 'm1')
  // A quiet turn closes the crew.
  await mainStart($, 'm2')
  await mainEnd($, 'm2')
  await mainStart($, 'm3')
  await spawnCrew($, 'Z', 'crew-light', 'builder-1')
  expect(h.spawned[1]).toEqual({ type: 'glitch-pets:crew-light', name: 'builder-1' })
  await submit($)
  expect(stepNotes(h)).toEqual([])
})
