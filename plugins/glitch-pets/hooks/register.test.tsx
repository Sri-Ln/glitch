import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let toasts: string[] = []
const START = Date.parse('2026-10-14T10:00:00Z')

const session = async ($: Engine, on: On, store: Record<string, unknown> = {}, surfaces: readonly string[] = ['desktop']) => {
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
  on('session.surfaces', () => ({ value: surfaces }) as never)
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
    const text = (await ui.findAll({})).filter(t => t.type === 'Text' || t.type === 'Button').map(t => String(t.text ?? '')).join(' ')
    expect(text).toContain('Build the landing page')
    expect(text).toContain('builder-1')
    expect(text).toContain('Opus 5.5')
    // Desktop: the lead, the member's mini, its progress pill and the Running bar; none on the terminal.
    const alts = (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
    if (surface === 'terminal') expect(alts).toEqual([])
    else {
      expect(alts.some(a => a.startsWith('Bud'))).toBe(true)
      expect(alts).toContain('0 steps')
    }
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
  const text = (await ui.findAll({})).filter(t => t.type === 'Text' || t.type === 'Button').map(t => String(t.text ?? '')).join(' | ')
  await ui.unmount()
  return text
}

// The engine around a crew: agents' statuses, the session's cost, what each prompt carried.
const crewHarness = async ($: Engine, on: Parameters<typeof session>[1]) => {
  const h = { status: {} as Record<string, string>, listFails: false, listCalls: 0, step: null as object | null, hold: null as Promise<void> | null, usd: 0, contexts: [] as (readonly string[] | undefined)[], opened: [] as string[], contextOut: 'none' as 'none' | 'echo' | 'strip', spawned: [] as { type: string; model?: string; name?: string }[], toolInputs: [] as Record<string, unknown>[] }
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
  on('tool.call', (_$, e) => {
    h.toolInputs.push(e as never)
    return { result: 'ok' } as never
  })
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
    // costAtStart (1) and startedAt (m1) are the crew's own: $4 over 2 s.
    if (surface === 'terminal') {
      expect(text).toContain('reviewer-1')
      expect(text).toContain('2 finished · 2 completed · 0 failed')
      expect(text).toContain('Crew · 1 running · 2 done · ≈$4.00 · 0 tok · 0:02')
    } else {
      for (const d of ['builder-1', 'builder-2', 'reviewer-1', '≈$4.00', '0:02']) expect(text).toContain(d)
      expect(text).toContain('2 completed')
    }
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
  expect(text).toContain('Crew · 1 running · 0 done · ≈$0.50 · 0 tok · 0:00')
  expect(text).not.toContain('finished')
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
  expect(text).toContain('Opus 5.5 | high')
  // B made 1 of the 4 tool calls A took: 1 of 4 steps, a quarter of the bar.
  expect(text).toContain('██░░░░░░ 1/4')
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
  expect(await paneText($, 'terminal')).toContain('Crew · 1 running')
  h.listFails = false
  await clock.advance(1000)
  expect(await paneText($, 'terminal')).toContain('1 finished · 1 completed · 0 failed')
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
  expect(await paneText($, 'terminal')).not.toContain('finished')
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
  expect(text).toContain('Crew · 2 running · 0 done')
  expect(text).not.toContain('finished')
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
  expect(await paneText($, 'terminal')).toContain('2 finished · 2 completed · 0 failed')
})

test('a reviewer that joins before the reminder goes out drops it', async ($, on) => {
  const { h } = await backgroundCrew($, on)
  await mainEnd($, 'm3')
  await spawnHelper($, 'R', 'R', 'reviewer-1')
  await submit($)
  await submit($)
  expect(h.contexts).toEqual([undefined, undefined])
})

test('once nothing runs the finished crew folds to one line on the terminal', async ($, on) => {
  await backgroundCrew($, on)
  await mainEnd($, 'm3')
  const text = await paneText($, 'terminal')
  expect(text).toContain('2 finished · 2 completed · 0 failed')
  expect(text).not.toContain('builder-1')
})

// ---- The crew pane's layout (#38, #39, #42) ----

const SURFACES = ['terminal', 'desktop'] as const
const PANE_PROPS = (bodyColumns: number) => ({ title: 'Crew', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} })
const mountPane = ($: Engine, surface: 'terminal' | 'desktop', bodyColumns = 40) =>
  $.ui.mount({ plugin: 'glitch-pets', surface, component: 'Pane', props: PANE_PROPS(bodyColumns) as never, requestId: 'glitch-crew' })
type Found = { type: string; key: string | undefined; props: Record<string, unknown>; text: string; children: unknown[] }
type Finder = { findAll: (q: { type?: string; key?: string }) => Promise<Found[]> }
const textsOf = async (ui: Finder) => (await ui.findAll({})).filter(t => t.type === 'Text' || t.type === 'Button').map(t => String(t.text ?? ''))
type Drawn = { props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }
const drawnByKey = (node: unknown, key: string): Drawn | undefined => {
  if (!node || typeof node !== 'object') return undefined
  const n = node as Drawn
  if (n.props?.key === key) return n
  for (const c of n.children ?? []) {
    const hit = drawnByKey(c, key)
    if (hit) return hit
  }
  return undefined
}
const keysOf = async (ui: Finder) => (await ui.findAll({})).map(x => x.key).filter((k): k is string => typeof k === 'string')

// Three crew members: C (tester-1) finished after 4 tool calls, A (builder-1) failed,
// B (researcher-1, Opus high) still runs with 1 tool call: 1 of 4 steps.
const B_ID = 'ag-Research date formats'
const C_ID = 'ag-Write the tests'
const mixedCrew = async ($: Engine, on: Parameters<typeof session>[1]) => {
  const { h, clock } = await crewHarness($, on)
  h.usd = 1
  await mainStart($, 'm1')
  await spawnHelper($, 'A', 'Build the date utils', 'builder-1')
  await spawnHelper($, 'B', 'Research date formats', 'researcher-1')
  await spawnHelper($, 'C', 'Write the tests', 'tester-1')
  const stream = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)({ turnId: 's', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: B_ID })
  while (!(await stream.next()).done) {
    // Read the stream to its end.
  }
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Read', file_path: 'x', agentId: C_ID } as never)
  await $.tool.call({ tool: 'Read', file_path: 'x', agentId: B_ID } as never)
  await clock.advance(1000)
  h.status[C_ID] = 'completed'
  h.status['ag-Build the date utils'] = 'failed'
  await agentEnd($, C_ID)
  await agentEnd($, 'ag-Build the date utils')
  h.usd = 1.5
  return { h, clock }
}

test('pane: one header line on the terminal, a lead row with total time on the desktop', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, surface === 'terminal' ? 100 : 40)
    const all = (await textsOf(ui)).join(' | ')
    if (surface === 'terminal') {
      expect(all).toContain('Crew · 1 running · 1 done · 1 failed · ≈$0.50 · 0 tok · 0:01')
      expect(all).toContain('Bud · keeping an eye on the crew (1 at work)')
    } else {
      expect(all).toContain('Bud')
      expect(all).toContain('keeping an eye on the crew (1 at work)')
      expect(all).toContain('0:01')
      expect(all).toContain('so far')
      expect(await ui.find({ key: 'crew-totals' })).toBeTruthy()
      // The lead is drawn at 2×: 32 px wide.
      const lead = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Bud'))
      expect(lead?.props.width).toBe(32)
    }
    expect(all).not.toMatch(/helper/i)
    await ui.unmount()
  }
})

test('pane: once the crew is done the lead row says total', async ($, on) => {
  const { h } = await mixedCrew($, on)
  h.status[B_ID] = 'completed'
  await agentEnd($, B_ID)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const all = (await textsOf(ui)).join(' | ')
    if (surface === 'desktop') expect(all).toContain('total')
    expect(all).not.toContain('so far')
    expect(all).not.toContain('Running')
    await ui.unmount()
  }
})

test('pane: Running and Finished accordions start open and toggle on press (desktop); the finished line folds and expands (terminal)', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      expect(await ui.find({ key: 'crew-acc:running' })).toBeTruthy()
      expect(await ui.find({ key: `crew-member:${C_ID}` })).toBeTruthy()
      expect(await ui.find({ key: `crew-member:${B_ID}` })).toBeTruthy()
      const header = await ui.find({ key: 'crew-acc-box:finished' })
      expect(Number(header?.props.paddingX)).toBeGreaterThan(0)
      await ui.press({ key: 'crew-acc:finished' })
      expect(await ui.find({ key: `crew-member:${C_ID}` })).toBeFalsy()
      expect(await ui.find({ key: `crew-member:${B_ID}` })).toBeTruthy()
      // The tally stays on the closed header.
      expect(await ui.find({ key: 'crew-tally' })).toBeTruthy()
      await ui.press({ key: 'crew-acc:running' })
      expect(await ui.find({ key: `crew-member:${B_ID}` })).toBeFalsy()
      await ui.press({ key: 'crew-acc:finished' })
      expect(await ui.find({ key: `crew-member:${C_ID}` })).toBeTruthy()
    } else {
      expect(await ui.find({ key: `crew-line:${C_ID}` })).toBeFalsy()
      const fold = await ui.find({ key: 'crew-finished' })
      expect(fold?.type).toBe('Button')
      expect(fold?.text).toContain('Show')
      await ui.press({ key: 'crew-finished' })
      expect(await ui.find({ key: `crew-line:${C_ID}` })).toBeTruthy()
      expect((await ui.find({ key: 'crew-finished' }))?.text).toContain('Hide')
    }
    await ui.unmount()
  }
})

test('pane: the finished tally reads N tasks · N completed · N failed', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      const tally = await ui.find({ key: 'crew-tally' })
      expect(tally?.props.flexDirection).toBe('row')
      // Three equal cells across the line.
      const cells = (tally?.children ?? []) as { props: Record<string, unknown> }[]
      expect(cells.length).toBe(3)
      for (const c of cells) expect(c.props.flexGrow).toBe(1)
      expect(await textsOf(ui)).toEqual(expect.arrayContaining(['3 tasks', '1 completed', '1 failed']))
    } else {
      expect((await textsOf(ui)).join(' | ')).toContain('2 finished · 1 completed · 1 failed')
    }
    await ui.unmount()
  }
})

test('pane: pressing a crew member opens its transcript with ui.view', async ($, on) => {
  const viewed: (string | undefined)[] = []
  on('ui.view', (_$, e) => {
    viewed.push((e as { agentId?: string }).agentId)
    return { value: {} } as never
  })
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    viewed.length = 0
    const ui = await mountPane($, surface)
    await ui.press({ key: `crew-open:${B_ID}` })
    expect(viewed).toEqual([B_ID])
    await ui.unmount()
  }
})

test('pane: each crew member block has a hover style and an Open ↗ hint 1 cell after the name (desktop)', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      // A hover sits on the drawn element, beside its props.
      const tree = await ui.drawn()
      const block = drawnByKey(tree, `crew-member:${B_ID}`)
      expect(block?.hover?.backgroundColor).toBeTruthy()
      const hint = drawnByKey(tree, `crew-hint-box:${B_ID}`)
      expect(hint?.props?.marginLeft).toBe(1)
      expect(hint?.props?.display).toBe('none')
      expect(hint?.hover?.display).toBe('flex')
      // The hint lights with its member's block: one hover group.
      expect(hint?.hover?.scope).toBe(block?.hover?.scope)
      expect((await ui.find({ key: `crew-hint:${B_ID}` }))?.text).toBe('Open ↗')
      // A little more space between members.
      expect((await ui.find({ key: 'crew-members:finished' }))?.props.rowGap).toBeTruthy()
    } else {
      expect(await ui.find({ key: `crew-member:${B_ID}` })).toBeFalsy()
    }
    await ui.unmount()
  }
})

test('pane: model · effort, tokens and ≈cost sit on one line; the progress pill says n/m steps, Done or Failed in blue, green, red', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      const chips = await ui.find({ key: `crew-chips:${B_ID}` })
      expect(chips?.props.flexDirection).toBe('row')
      expect(chips?.props.flexWrap).toBe('nowrap')
      const t = (await textsOf(ui)).join(' | ')
      expect(t).toContain('Opus 5.5 · high')
      expect(t).toContain('0 tok')
      const svgs = await ui.findAll({ type: 'Svg' })
      const pills = svgs.filter(s => ['1/4 steps', 'Done', 'Failed'].includes(String(s.props.alt)))
      expect(pills.map(s => String(s.props.alt)).sort()).toEqual(['1/4 steps', 'Done', 'Failed'])
      const color = (alt: string) => String(pills.find(s => s.props.alt === alt)?.props.source)
      expect(color('1/4 steps')).toContain('#2f7cf6')
      expect(color('Done')).toContain('#1f9d55')
      expect(color('Failed')).toContain('#d64040')
    } else {
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(0)
    }
    await ui.unmount()
  }
})

test('pane (terminal): one aligned line per member: glyph, name, task, model + effort, tokens, ≈cost, time, progress', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, 100)
    if (surface === 'terminal') {
      const line = await ui.find({ key: `crew-line:${B_ID}` })
      expect(line?.props.flexDirection).toBe('row')
      const joined = (await textsOf(ui)).join(' | ')
      for (const p of ['●', 'researcher-1', 'Research date formats', 'Opus 5.5', 'high', '0 tok', '≈$', '0:01', '1/4']) expect(joined).toContain(p)
      // The tier is gone: model and effort say it.
      expect(joined).not.toContain('heavy')
      // Header, lead, one running line, the folded finished line: four rows.
      const rows = (await keysOf(ui)).filter(k => k === 'crew-head' || k === 'crew-lead' || k.startsWith('crew-line:') || k === 'crew-fold')
      expect(rows.length).toBe(4)
    } else {
      expect(await ui.find({ key: `crew-line:${B_ID}` })).toBeFalsy()
    }
    await ui.unmount()
  }
})

test('the pane asks for a narrow dock where the desktop draws it, and inline room for the lead and ~3 members', async ($, on) => {
  const asked: { columns?: number; rows?: number }[] = []
  on('ui.open', (_$, e) => {
    asked.push({ columns: e.columns, rows: e.rows })
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('session.usage', usageAt(0))
  await session($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'a', 'A', 'builder-1')
  await $.command.run({ command: 'glitch-pets', args: 'crew' } as never)
  expect(asked.length).toBe(2)
  for (const a of asked) {
    expect(Number(a.columns)).toBeGreaterThanOrEqual(36)
    expect(Number(a.columns)).toBeLessThanOrEqual(44)
    // A rich inline pane (the phone) shows the lead and about three members.
    expect(Number(a.rows)).toBeGreaterThanOrEqual(20)
    expect(Number(a.rows)).toBeLessThanOrEqual(28)
  }
})

test('in a terminal-only session the pane asks for a dock wide enough for its aligned rows and a small inline height', async ($, on) => {
  const asked: { columns?: number; rows?: number }[] = []
  on('ui.open', (_$, e) => {
    asked.push({ columns: e.columns, rows: e.rows })
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: `ag-${e.description}` }) as never)
  on('session.usage', usageAt(0))
  await session($, on, {}, ['terminal'])
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnHelper($, 'a', 'A', 'builder-1')
  await $.command.run({ command: 'glitch-pets', args: 'crew' } as never)
  expect(asked.length).toBe(2)
  for (const a of asked) {
    expect(Number(a.columns)).toBeGreaterThanOrEqual(84)
    expect(Number(a.columns)).toBeLessThanOrEqual(96)
    expect(Number(a.rows)).toBeGreaterThan(0)
    expect(Number(a.rows)).toBeLessThanOrEqual(12)
  }
})

// glitch-hud as the band draws its crew pill: a press on it reaches glitch-pets' ui.press hook.
const BAND_PILL = {
  name: 'glitch-hud',
  register: ((on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Button } = $.ui.resolve(e)
      return <Button key="glitch-crew" label="Crew · 1 at work" onPress={() => undefined} />
    })
  }) as never,
}
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }

test('a press on the HUD band\'s crew pill toggles the pane', { plugins: [BAND_PILL] }, async ($, on) => {
  const asked: { id: string; columns?: number }[] = []
  let open = false
  on('ui.open', (_$, e) => {
    asked.push({ id: e.id, columns: e.columns })
    open = true
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => {
    open = false
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: open ? [{ id: 'glitch-crew', title: 'Crew', isShown: true, isFocused: false, isPlaced: true }] : [] }) as never)
  await session($, on)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ plugin: 'glitch-hud', surface, component: 'AbovePrompt', props: BAND_PROPS as never })
    await band.press({ key: 'glitch-crew' })
    expect(open).toBe(true)
    await band.press({ key: 'glitch-crew' })
    expect(open).toBe(false)
    await band.unmount()
  }
  // Each open is sized for the surface the press came from.
  expect(asked.map(a => a.id)).toEqual(['glitch-crew', 'glitch-crew'])
  expect(Number(asked[0]?.columns)).toBeGreaterThanOrEqual(84)
  expect(Number(asked[1]?.columns)).toBeLessThanOrEqual(44)
})

test('glitch-pets publishes a crew summary for the HUD pill while a crew is open or recent', async ($, on) => {
  const summaries: unknown[] = []
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'crewSummary') summaries.push((e as { value?: unknown }).value)
    return next(e)
  })
  const { h, clock } = await mixedCrew($, on)
  await clock.advance(1100)
  expect(summaries.length).toBeGreaterThan(0)
  expect(summaries[summaries.length - 1]).toMatchObject({ running: 1, done: 1, failed: 1 })
  h.status[B_ID] = 'completed'
  await agentEnd($, B_ID)
  await mainEnd($, 'm1')
  await mainStart($, 'm2')
  await mainEnd($, 'm2')
  await clock.advance(1100)
  expect(summaries[summaries.length - 1]).toMatchObject({ running: 0, done: 2, failed: 1 })
  // Long after the crew closed: no pill.
  await clock.advance(5 * 60_000)
  expect(summaries[summaries.length - 1]).toBe(null)
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

// ---- Fix round 1 ----

// The fixed columns of a terminal row, in cells, gaps included (the task takes the rest).
// The one Text a keyed Box holds, as drawn.
const textIn = (box: Drawn | undefined): Drawn | undefined => ((box?.children ?? []) as Drawn[]).find(c => c && typeof c === 'object' && (c as { type?: string }).type === 'Text')
const stringOf = (n: Drawn | undefined) => ((n?.children ?? []) as unknown[]).filter(c => typeof c === 'string').join('')
const fixedCells = (line: Drawn | undefined) => {
  const cols = ((line?.children ?? []) as Drawn[]).filter(c => c && typeof c === 'object')
  const widths = cols.map(c => c.props?.width).filter((w): w is number => typeof w === 'number')
  return widths.reduce((t, w) => t + w, 0) + Math.max(0, cols.length - 1)
}

test('pane (terminal): at 100 cells the full row; at 40 cells tokens and bar glyphs go and the fixed columns leave the task room', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    for (const columns of [100, 40]) {
      const ui = await mountPane($, surface, columns)
      const joined = (await textsOf(ui)).join(' | ')
      if (surface === 'terminal') {
        const tree = await ui.drawn()
        const line = drawnByKey(tree, `crew-line:${B_ID}`)
        expect(line).toBeTruthy()
        if (columns === 100) {
          expect(joined).toContain('█')
          expect(stringOf(textIn(drawnByKey(tree, `crew-tok:${B_ID}`)))).toBe('0')
          expect(joined).toContain('Crew · 1 running · 1 done · 1 failed · ≈$0.50 · 0 tok · 0:01')
        } else {
          expect(joined).not.toContain('█')
          expect(await ui.find({ key: `crew-tok:${B_ID}` })).toBeFalsy()
          expect(joined).toContain('1/4')
          expect(fixedCells(line)).toBeLessThanOrEqual(columns - 8)
          // The header drops its tokens and truncates rather than wraps.
          const head = drawnByKey(tree, 'crew-head')
          expect(JSON.stringify(head)).toContain('truncate')
          expect(joined).not.toContain('0 tok')
        }
      } else expect(joined).toContain('Research date formats')
      await ui.unmount()
    }
  }
})

test('pane (desktop): the progress pill is drawn for light and dark: a translucent track, no fixed text color, the label as theme text', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      const pills = (await ui.findAll({ type: 'Svg' })).filter(s => ['1/4 steps', 'Done', 'Failed'].includes(String(s.props.alt)))
      expect(pills.length).toBe(3)
      for (const p of pills) {
        const src = String(p.props.source)
        expect(src).not.toContain('<text')
        expect(src).not.toContain('#e6e8ef')
        expect(src).toContain('fill-opacity')
      }
      const tree = await ui.drawn()
      const label = textIn(drawnByKey(tree, `crew-pill-label:${B_ID}`))
      expect(stringOf(label)).toBe('1/4 steps')
      expect(label?.props?.color).toBe('suggestion')
      expect(textIn(drawnByKey(tree, `crew-pill-label:${C_ID}`))?.props?.color).toBe('success')
    } else expect(await ui.find({ key: `crew-pill-label:${B_ID}` })).toBeFalsy()
    await ui.unmount()
  }
})

test('pane (desktop): an accordion header has a border, a live dot on Running and its chevron on the right', async ($, on) => {
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      for (const kind of ['running', 'finished']) {
        const box = drawnByKey(await ui.drawn(), `crew-acc-box:${kind}`)
        expect(box?.props?.borderStyle).toBeTruthy()
        const kids = ((box?.children ?? []) as Drawn[]).filter(c => c && typeof c === 'object')
        expect(kids[kids.length - 1]?.props?.key).toBe(`crew-acc-chev:${kind}`)
      }
      expect((await ui.find({ key: 'crew-acc-chev:running' }))?.text).toBe('▾')
      await ui.press({ key: 'crew-acc-chev:running' })
      expect((await ui.find({ key: 'crew-acc-chev:running' }))?.text).toBe('▸')
      expect(stringOf(textIn(drawnByKey(await ui.drawn(), 'crew-live')))).toBe('●')
    } else expect(await ui.find({ key: 'crew-acc-chev:running' })).toBeFalsy()
    await ui.unmount()
  }
})

test('pane: a refused or failed ui.view is said in a toast', async ($, on) => {
  let answer: 'deny' | 'throw' = 'deny'
  on('ui.view', () => {
    if (answer === 'throw') throw new Error('view refused')
    return { value: { deny: 'not now' } } as never
  })
  await mixedCrew($, on)
  for (const surface of SURFACES) {
    for (const a of ['deny', 'throw'] as const) {
      answer = a
      toasts = []
      const ui = await mountPane($, surface)
      await ui.press({ key: `crew-open:${B_ID}` })
      expect(toasts.filter(t => t.startsWith('Glitch pets: '))).toHaveLength(1)
      if (a === 'deny') expect(toasts).toContain('Glitch pets: not now')
      await ui.unmount()
    }
  }
})

test('the HUD pill and the pane header show one crew cost', async ($, on) => {
  const summaries: { cost?: number }[] = []
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'crewSummary') summaries.push((e as { value?: { cost?: number } }).value ?? {})
    return next(e)
  })
  const { clock } = await mixedCrew($, on)
  await clock.advance(1100)
  // costAtStart 1, the session now at 1.5: the pane says ≈$0.50.
  expect(await paneText($, 'terminal')).toContain('≈$0.50')
  expect(summaries[summaries.length - 1]?.cost).toBe(0.5)
})

test('with no crew the 1 s tick reads no cost', async ($, on) => {
  let usageCalls = 0
  on('session.usage', () => {
    usageCalls += 1
    return { value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 0 }, rateLimits: [], cost: { usd: 0 } } } as never
  })
  const statsReads: string[] = []
  on('state.get', (_$, e, next) => {
    if ((e.plugin as string) === 'glitch-hud' && (e as { key?: string }).key === 'stats') statsReads.push('stats')
    return next(e)
  })
  const clock = await session($, on, { pet: 'off' })
  await clock.advance(3000)
  expect(usageCalls).toBe(0)
  expect(statsReads).toEqual([])
})

// ── Crew tiers, fix round 2: forced retries take the target rung's effort; tidy holds ──

const agentCall = ($: Engine, d: string, type: string, name: string, effort?: string) =>
  $.tool.call({ tool: 'Agent', description: d, prompt: 'p', subagent_type: `glitch-pets:${type}`, name, ...(effort ? { effort } : {}) } as never)

test('a forced retry that carries its own effort runs at the target rung\'s effort', async ($, on) => {
  const { h } = await crewHarness($, on)
  await mainStart($, 'm1')
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  h.status['ag-A'] = 'failed'
  await agentEnd($, 'ag-A')
  await submit($)
  await agentCall($, 'A2', 'crew-light', 'builder-1', 'max')
  expect(h.toolInputs[0]?.effort).toBe('high')
  // The same name above the failed rung keeps that rung's effort; another name its own type's.
  await agentCall($, 'A3', 'crew-heavy', 'builder-1', 'max')
  expect(h.toolInputs[1]?.effort).toBe('high')
  await agentCall($, 'C', 'crew-medium', 'builder-2', 'max')
  expect(h.toolInputs[2]?.effort).toBe('medium')
  // And the spawn itself is forced the same way.
  await spawnCrew($, 'A2', 'crew-light', 'builder-1')
  expect(h.spawned[1]).toEqual({ type: 'glitch-pets:crew-light-high', name: 'builder-1' })
})

test('while a step-up note is in flight a turn end does not raise the review reminder', async ($, on) => {
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
  let release = () => undefined as void
  h.hold = new Promise<void>(r => (release = r))
  const first = submit($, { kind: 'task-notification' })
  await mainEnd($, 'm2')
  release()
  h.hold = null
  await first
  await submit($)
  expect(h.contexts[0]?.[0]).toContain('failed on')
  expect(h.contexts[1]).toBeUndefined()
})

test('a note not acted on by the turn end stops holding the review, yet a later same-name retry still links', async ($, on) => {
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
  await submit($)
  await mainStart($, 'm3')
  // m3 ends with no retry: the note no longer holds the review.
  await mainEnd($, 'm3')
  await submit($)
  expect(h.contexts[1]?.[0]).toContain('reviewer-1')
  // A later retry by the name is still forced one rung up and counts.
  await mainStart($, 'm4')
  await spawnCrew($, 'A2', 'crew-light', 'builder-1')
  expect(h.spawned[2]).toEqual({ type: 'glitch-pets:crew-light-high', name: 'builder-1' })
  h.status['ag-A2'] = 'failed'
  await agentEnd($, 'ag-A2')
  await submit($)
  expect(stepNotes(h)[1]).toContain('glitch-pets:crew-medium:')
})
