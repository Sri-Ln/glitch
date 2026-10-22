// Fixes from the live checks (#45, #47): the header line is one press, a member row says its
// role and what it is doing, the desktop tree fits the pane's real bodyColumns, the rows follow
// the engine's own word on each helper's status, and a click on the lead hops.
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let toasts: string[] = []
const START = Date.parse('2026-10-14T10:00:00Z')
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

type H = { status: Record<string, string>; usd: number; summaries: unknown[]; listCalls: number; frames: number[]; openFails: boolean; contexts: (readonly string[] | undefined)[] }

/** The engine version the harness answers (an Error: the version cannot be read). Read at the pane's first draw. */
const engine = { version: '2.1.302' as string | Error }

const harness = async ($: Engine, on: On) => {
  toasts = []
  engine.version = '2.1.302'
  on('session.version', () => {
    if (engine.version instanceof Error) throw engine.version
    return { value: { version: engine.version, base: engine.version } } as never
  })
  const h: H = { status: {}, usd: 1, summaries: [], listCalls: 0, frames: [], openFails: false, contexts: [] }
  const store: Record<string, unknown> = {}
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
  on('store.delete', () => ({ value: undefined }) as never)
  on('store.keys', () => ({ value: Object.keys(store) }) as never)
  on('session.surfaces', () => ({ value: ['desktop'] }) as never)
  on('command.register', () => ({ value: { command: 'glitch-pets' } }) as never)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.start', async () => ({ cwd: 'C:\\repo' }) as never)
  on('prompt.compose', () => ({ sections: [] }) as never)
  on('prompt.submit', (_$, e) => {
    h.contexts.push(e.context)
    return { text: e.text } as never
  })
  on('agent.spawn', (_$, e) => {
    h.status[`ag-${e.description}`] = 'running'
    return { model: 'claude-opus-5-5', agentId: `ag-${e.description}` } as never
  })
  on('agent.list', () => {
    h.listCalls += 1
    return { value: Object.entries(h.status).map(([id, status]) => ({ id, description: id, type: 'general-purpose', status })) } as never
  })
  on('ui.open', () => {
    if (h.openFails) throw new Error('no room')
    return { value: { isPlaced: true } } as never
  })
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 0 }, rateLimits: [], cost: { usd: h.usd } } }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.step', async function* () {
    return { turnId: 's', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'crewSummary') h.summaries.push((e as { value?: unknown }).value)
    if ((e as { key?: string }).key === 'paneFrame') h.frames.push(Number((e as { value?: unknown }).value))
    return next(e)
  })
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'desktop', isInteractive: true } as never)
  return { h, clock }
}

const spawn = ($: Engine, description: string, name: string) =>
  $.agent.spawn({ tool_use_id: `tu-${name}`, prompt: 'p', description, subagentType: 'general-purpose', name } as never)
const agentEnd = ($: Engine, agentId: string, reason: 'answer' | 'error' | 'aborted' = 'answer') =>
  $.turn.complete({ turnId: `s-${agentId}`, agentId, reason, answer: '', durationMs: 1, isAborted: reason === 'aborted' } as never)
const agentStart = ($: Engine, agentId: string) => $.turn.start({ turnId: `w-${agentId}`, agentId, text: 'one more thing' } as never)

const A = 'ag-Build the date utils'
const B = 'ag-Research date formats and write the summary'
const C = 'ag-Write the tests'

// Three members: C done, A failed, B (a long task) still at work.
const crew = async ($: Engine, on: On) => {
  const r = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build the date utils', 'builder-1')
  await spawn($, 'Research date formats and write the summary', 'researcher-1')
  await spawn($, 'Write the tests', 'tester-1')
  await r.clock.advance(1000)
  r.h.status[C] = 'completed'
  r.h.status[A] = 'failed'
  await agentEnd($, C)
  await agentEnd($, A, 'error')
  return r
}

const mountPane = ($: Engine, surface: Surface, bodyColumns = 40, view: { agentId?: string } = {}) =>
  $.ui.mount({ plugin: 'glitch-pets', surface, component: 'Pane', props: { title: 'Crew', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view } as never, requestId: 'glitch-crew' })

type Drawn = { type?: string; props?: Record<string, unknown>; hover?: Record<string, unknown>; children?: unknown[] }
const byKey = (node: unknown, key: string): Drawn | undefined => {
  if (!node || typeof node !== 'object') return undefined
  const n = node as Drawn
  if (n.props?.key === key) return n
  for (const c of n.children ?? []) {
    const hit = byKey(c, key)
    if (hit) return hit
  }
  return undefined
}
const walk = (node: unknown, fn: (n: Drawn) => void) => {
  if (!node || typeof node !== 'object') return
  fn(node as Drawn)
  for (const c of (node as Drawn).children ?? []) walk(c, fn)
}
/** All the words under a node, in order. */
const wordsOf = (node: unknown): string => {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  const n = node as Drawn
  if (n.type === 'Button' && typeof n.props?.label === 'string' && !(n.children ?? []).length) return n.props.label
  return (n.children ?? []).map(wordsOf).join('')
}
const kids = (n: Drawn | undefined) => ((n?.children ?? []) as Drawn[]).filter(c => c && typeof c === 'object')

// ── 4. A member row: its role and topic, then what it is doing; no Open (#47) ──

test('no Open anywhere and no view is ever asked: the desktop cannot show a transcript from a pane (#47)', async ($, on) => {
  let views = 0
  on('ui.view', () => {
    views += 1
    return { value: {} } as never
  })
  await crew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const tree = await ui.drawn()
    expect(byKey(tree, `crew-open:${B}`)).toBeUndefined()
    expect(JSON.stringify(tree)).not.toContain('Open')
    expect(JSON.stringify(tree)).not.toContain('↗')
    let buttons = 0
    walk(byKey(tree, surface === 'desktop' ? `crew-member:${B}` : `crew-line:${B}`), n => {
      buttons += n.type === 'Button' ? 1 : 0
    })
    expect(buttons).toBe(0)
    await ui.unmount()
  }
  expect(views).toBe(0)
})

test('a desktop row: the role in a colored chip and the topic cut short, then what it is doing now; once ended, its whole topic', async ($, on) => {
  await crew($, on)
  await $.tool.call({ tool: 'WebSearch', query: 'ISO 8601 date formats', agentId: B } as never)
  const ui = await mountPane($, 'desktop', 56)
  const tree = await ui.drawn()
  const chip = byKey(tree, `crew-role:${B}`)
  expect(wordsOf(chip)).toBe('Researcher')
  expect(String(chip?.props?.backgroundColor)).toMatch(/^#/)
  const title = wordsOf(byKey(tree, `crew-title:${B}`))
  expect(title).toMatch(/^Researcher\s*Research date formats/)
  expect(title).not.toContain('researcher-1')
  expect(wordsOf(byKey(tree, `crew-task:${B}`))).toBe('Searching the web: “ISO 8601 date formats”')
  // Ended: the whole topic under the role.
  expect(wordsOf(byKey(tree, `crew-task:${C}`))).toBe('Write the tests')
  expect(wordsOf(byKey(tree, `crew-role:${C}`))).toBe('Tester')
  await ui.unmount()
  // The terminal: the role word in its name column, the topic beside it.
  const term = await mountPane($, 'terminal', 100)
  const line = wordsOf(byKey(await term.drawn(), `crew-line:${B}`))
  expect(line).toContain('Researcher')
  expect(line).toContain('Research date formats')
  await term.unmount()
})

test('a fresh member starts at 0 of its planned steps, never a bare "0 steps"; the Running bar is the crew\'s steps done of planned', async ($, on) => {
  await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-1', prompt: 'Find X.\nExpected steps: 5', description: 'Find X', subagentType: 'general-purpose', name: 'researcher-1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-2', prompt: 'Build Y.\nExpected steps: 10', description: 'Build Y', subagentType: 'general-purpose', name: 'builder-1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-3', prompt: 'Test Z.\nExpected steps: 5', description: 'Test Z', subagentType: 'general-purpose', name: 'tester-1' } as never)
  const ui = await mountPane($, 'desktop', 56)
  let tree = await ui.drawn()
  expect(wordsOf(byKey(tree, 'crew-pill-label:ag-Find X'))).toBe('0/5 steps')
  expect(wordsOf(byKey(tree, 'crew-acc-steps'))).toBe('0/20')
  for (let i = 0; i < 1; i++) await $.tool.call({ tool: 'Read', file_path: 'a.ts', agentId: 'ag-Find X' } as never)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Read', file_path: 'b.ts', agentId: 'ag-Build Y' } as never)
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Read', file_path: 'c.ts', agentId: 'ag-Test Z' } as never)
  tree = await ui.drawn()
  expect(wordsOf(byKey(tree, 'crew-pill-label:ag-Build Y'))).toBe('3/10 steps')
  expect(wordsOf(byKey(tree, 'crew-acc-steps'))).toBe('6/20')
  let svg: Drawn | undefined
  walk(byKey(tree, 'crew-acc-bar:running'), n => {
    svg ??= n.type === 'Svg' ? n : undefined
  })
  expect(String(svg?.props?.alt)).toBe('6 of 20 steps')
  // 30% filled: the blue fill is about 0.3 of the bar's width.
  const w = Number(svg?.props?.width)
  const fill = Number(/<rect x="0" width="(\d+)"[^>]*#2f7cf6/.exec(String(svg?.props?.source))?.[1] ?? 0)
  expect(Math.abs(fill / w - 0.3)).toBeLessThan(0.03)
  await ui.unmount()
})

test('a click on the lead plays its happy hop, as a click on the HUD pet does', async ($, on) => {
  const { clock } = await crew($, on)
  const ui = await mountPane($, 'desktop', 56)
  const tree = await ui.drawn()
  const target = byKey(tree, 'crew-lead-poke')
  expect(target?.type).toBe('Client')
  expect(String(target?.props?.module)).toMatch(/lead-poke\.tsx$/)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'crew-lead-poke' })
  await clock.advance(200)
  let alt = ''
  walk(byKey(await ui.drawn(), 'crew-lead-sprite'), n => {
    alt = n.type === 'Svg' ? String(n.props?.alt) : alt
  })
  expect(alt).toMatch(/happy/i)
  await ui.unmount()
})

test('/glitch crew debug lists the crew rows against the engine\'s agent list and the last presses', async ($, on) => {
  const { h } = await crew($, on)
  h.status['ag-other'] = 'running'
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, 40, surface === 'desktop' ? { agentId: B } : {})
    // Each surface's own fold: the desktop's header line, the terminal's finished line.
    await ui.press({ key: surface === 'desktop' ? 'crew-acc:finished' : 'crew-finished' })
    if (surface === 'terminal') expect(await ui.find({ key: 'crew-acc:finished' })).toBeFalsy()
    await ui.unmount()
  }
  for (const command of ['glitch', 'glitch-pets'] as const) {
    const text = ((await $.command.run({ command, args: 'crew debug' } as never)) as { text: string }).text
    expect(text).toContain(B)
    expect(text).toMatch(/researcher-1.*running/)
    expect(text).toMatch(/tester-1.*done/)
    // The engine's own word for each, and the list entry no row holds.
    expect(text).toContain('completed')
    expect(text).toContain('ag-other')
    expect(text).toContain('crew-acc:finished')
    expect(text).toMatch(/terminal · crew-finished → opened/)
    // The view in force where the pane last drew, per surface.
    expect(text).toMatch(/desktop.*view.*Research/i)
    expect(text).toMatch(/terminal pane: view = main conversation/)
  }
})

// ── 5. The desktop tree fits the pane's real width ──

for (const cols of [28, 34, 40, 60]) {
  test(`at ${cols} cells: every desktop text truncates, each member field keeps one line within the details column; the terminal truncates too`, async ($, on) => {
    await crew($, on)
    const ui = await mountPane($, 'desktop', cols)
    const tree = await ui.drawn()
    // No Text may wrap onto a second line; the header Buttons' words are short and at their natural width (never cut).
    const headerTexts = new Set<unknown>()
    for (const kind of ['running', 'finished']) walk(byKey(tree, `crew-acc:${kind}`), n => headerTexts.add(n))
    walk(tree, n => {
      if (n.type === 'Text' && !headerTexts.has(n)) expect(['truncate-end', 'truncate']).toContain(n.props?.wrap)
    })
    for (const kind of ['running', 'finished']) expect(byKey(byKey(tree, `crew-acc-press:${kind}`), `crew-acc:${kind}`)).toBeTruthy()
    // The header line fits inside its border and padding.
    // ...with 2 cells of slack, so a native button's chrome or a wide glyph never cuts the chevron.
    for (const kind of ['running', 'finished']) {
      const words = wordsOf(byKey(tree, `crew-acc:${kind}`))
      expect(words.length).toBeLessThanOrEqual(cols - 4 - 2)
      expect(/[▾▸]$/.test(words)).toBe(true)
    }
    // Each tally cell's words fit its third of the line.
    const third = Math.floor((cols - 2 - 2) / 3)
    for (const cell of kids(byKey(tree, 'crew-tally'))) expect(wordsOf(cell).length).toBeLessThanOrEqual(third)
    for (const id of [A, B, C]) {
      const member = byKey(tree, `crew-member:${id}`)
      const mini = Number(byKey(tree, `crew-mini:${id}`)?.props?.width ?? 0)
      const detail = cols - 2 - (mini ? mini + 1 : 0)
      const title = byKey(tree, `crew-title:${id}`)
      expect(Number(title?.props?.width ?? 0) <= detail || title === undefined).toBe(true)
      // The title Button keeps 2 cells of slack beside the time.
      expect(wordsOf(byKey(tree, `crew-name:${id}`)).length + 2 + 1 + wordsOf(byKey(tree, `crew-time:${id}`)).length).toBeLessThanOrEqual(detail)
      // The pill row: the bar's cells and its words.
      const pillBox = byKey(tree, `crew-pill:${id}`)
      const label = wordsOf(byKey(tree, `crew-pill-label:${id}`))
      // ...with 2 cells of slack at the line's end, so bold words in a proportional font are never cut.
      expect(Number(pillBox?.props?.width ?? 0) + (pillBox ? 1 : 0) + label.length).toBeLessThanOrEqual(detail - 2)
      // The chips: padding 1 each side, a gap between.
      const chips = kids(byKey(tree, `crew-chips:${id}`))
      const cells = chips.reduce((t, c) => t + wordsOf(c).length + 2, 0) + Math.max(0, chips.length - 1)
      expect(cells).toBeLessThanOrEqual(detail)
      expect(chips.length).toBeGreaterThan(0)
      expect(member).toBeTruthy()
    }
    // A long task is cut with an ellipsis, never wrapped.
    const task = wordsOf(byKey(tree, `crew-task:${B}`))
    expect(task.length).toBeLessThanOrEqual(cols - 2)
    if (cols < 60) expect(task.endsWith('…')).toBe(true)
    await ui.unmount()
    // The terminal at the same width: its lines truncate rather than wrap.
    const term = await mountPane($, 'terminal', cols)
    const tt = await term.drawn()
    for (const key of ['crew-head', 'crew-lead']) expect(JSON.stringify(byKey(tt, key))).toContain('truncate')
    // The desktop's blocks are absent there; its own aligned line is drawn, its task truncating.
    expect(byKey(tt, `crew-member:${B}`)).toBeUndefined()
    expect(byKey(tt, 'crew-acc:running')).toBeUndefined()
    expect(JSON.stringify(byKey(tt, `crew-line:${B}`))).toContain('truncate-end')
    await term.unmount()
  })
}

test('narrow: on the desktop the tokens chip goes first, then the cost, the model stays; the terminal drops its token column', async ($, on) => {
  await crew($, on)
  for (const surface of SURFACES) {
    const at = async (cols: number) => {
      const ui = await mountPane($, surface, cols)
      const t = await ui.drawn()
      await ui.unmount()
      return t
    }
    if (surface === 'desktop') {
      expect(kids(byKey(await at(60), `crew-chips:${B}`)).length).toBe(3)
      const narrow = kids(byKey(await at(28), `crew-chips:${B}`)).map(wordsOf)
      expect(narrow.length).toBeLessThan(3)
      expect(narrow[0]).toMatch(/Opus/)
    } else {
      // No chips on the terminal: its line drops the token column when narrow, keeps the cost.
      const wide = await at(100)
      const narrow = await at(28)
      expect(byKey(narrow, `crew-chips:${B}`)).toBeUndefined()
      expect(byKey(wide, `crew-tok:${B}`)).toBeTruthy()
      expect(byKey(narrow, `crew-tok:${B}`)).toBeUndefined()
      expect(wordsOf(byKey(narrow, `crew-line:${B}`))).toContain('≈$')
    }
  }
})

// ── 7. The rows follow the engine's word ──

test('a helper\'s own turn end ends its row at once by its reason, while the list still says running', async ($, on) => {
  const { h } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build', 'builder-1')
  await spawn($, 'Probe', 'researcher-1')
  await spawn($, 'Check', 'tester-1')
  // The list has not caught up yet.
  await agentEnd($, 'ag-Build')
  await agentEnd($, 'ag-Probe', 'error')
  await agentEnd($, 'ag-Check', 'aborted')
  expect(h.status['ag-Build']).toBe('running')
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, 100)
    const words = wordsOf(await ui.drawn())
    if (surface === 'terminal') expect(words).toContain('Crew · 0 running · 1 done · 2 failed')
    else {
      expect(words).not.toContain('RUNNING')
      expect(words).toContain('Done')
      expect(words).toContain('Failed')
      // Stopped by the person, not failed by its own error.
      expect(words).toContain('Stopped')
    }
    await ui.unmount()
  }
})

test('a finished helper woken by a message runs again in its row; the list saying running alone does not', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build', 'builder-1')
  await spawn($, 'Probe', 'researcher-1')
  await agentEnd($, 'ag-Build')
  await clock.advance(1000)
  // Per surface: the terminal's header counts; the desktop's groups and builder-1's pill words.
  const check = async (running: 1 | 2) => {
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface, 100)
      const t = await ui.drawn()
      await ui.unmount()
      if (surface === 'terminal') {
        expect(wordsOf(t)).toContain(running === 2 ? 'Crew · 2 running · 0 done' : 'Crew · 1 running · 1 done')
        expect(byKey(t, 'crew-acc:running')).toBeUndefined()
      } else {
        expect(wordsOf(byKey(t, 'crew-acc:running'))).toContain(`RUNNING ${running}`)
        const pill = wordsOf(byKey(t, 'crew-pill-label:ag-Build'))
        if (running === 2) expect(pill).toMatch(/steps|^\d/)
        else expect(pill).toBe('Done')
        if (running === 2) expect(byKey(t, 'crew-acc:finished')).toBeUndefined()
        else expect(wordsOf(byKey(t, 'crew-acc:finished'))).toContain('FINISHED 1')
      }
    }
  }
  await check(1)
  // A message wakes it: its own turn starts.
  h.status['ag-Build'] = 'running'
  await agentStart($, 'ag-Build')
  await check(2)
  await agentEnd($, 'ag-Build')
  // The list lags a second behind: the row stays done.
  await clock.advance(1000)
  await check(1)
})

test('the HUD summary follows a status change at once, not a second later', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build', 'builder-1')
  await spawn($, 'Probe', 'researcher-1')
  await clock.advance(1000)
  expect(h.summaries[h.summaries.length - 1]).toMatchObject({ running: 2, done: 0 })
  h.status['ag-Build'] = 'completed'
  await agentEnd($, 'ag-Build')
  expect(h.summaries[h.summaries.length - 1]).toMatchObject({ running: 1, done: 1 })
})

test('the 1 s status poll keeps running while the pane is closed', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build', 'builder-1')
  h.listCalls = 0
  await clock.advance(3000)
  expect(h.listCalls).toBeGreaterThanOrEqual(3)
  h.status['ag-Build'] = 'completed'
  await clock.advance(1000)
  expect(h.summaries[h.summaries.length - 1]).toMatchObject({ running: 0, done: 1 })
})

// ── Review fix: presses do not race a redraw every 100 ms ──

test('the pane frame clock is floored at 250 ms on a rich surface (at most 4 frame redraws a second); the terminal times none', async ($, on) => {
  const { h, clock } = await harness($, on)
  const frames = h.frames
  await $.turn.start({ turnId: 'm1' } as never)
  // Two Haiku members at 8 beats a second, out of step: unfloored, a redraw nearly every tick.
  for (const [d, n] of [['Quick one', 'builder-1'], ['Quick two', 'builder-2']] as const) {
    await spawn($, d, n)
    await clock.advance(60)
    const stream = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)({ turnId: 's', index: 0, model: 'claude-haiku-4-5', effort: 'low', messageCount: 1, agentId: `ag-${d}` })
    while (!(await stream.next()).done) {
      // Read the stream to its end.
    }
  }
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    frames.length = 0
    await clock.advance(2000)
    if (surface === 'desktop') {
      expect(frames.length).toBeGreaterThan(0)
      expect(frames.length).toBeLessThanOrEqual(9)
      for (let i = 1; i < frames.length; i++) expect((frames[i] as number) - (frames[i - 1] as number)).toBeGreaterThanOrEqual(250)
    } else expect(frames).toEqual([])
    await ui.unmount()
  }
})

test('a status change in a fresh crew publishes its own cost, never the last crew\'s cached one; pane and pill agree', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Old', 'builder-1')
  h.usd = 3
  await clock.advance(1100)
  expect(h.summaries[h.summaries.length - 1]).toMatchObject({ cost: 2 })
  await agentEnd($, 'ag-Old')
  await $.turn.complete({ turnId: 'm1', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  await $.turn.start({ turnId: 'm2' } as never)
  await $.turn.complete({ turnId: 'm2', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  // A fresh crew starts at $6 and its first member ends before any tick.
  h.usd = 6
  await $.turn.start({ turnId: 'm3' } as never)
  await spawn($, 'New', 'builder-1')
  await agentEnd($, 'ag-New')
  expect(h.summaries[h.summaries.length - 1]).toMatchObject({ done: 1, cost: 0 })
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, 100)
    const words = wordsOf(await ui.drawn())
    expect(words).toContain('≈$0.00')
    expect(words).not.toContain('≈$2.00')
    await ui.unmount()
  }
})

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

test('a failed HUD pill press is said in a toast and logged for debug with its own time', { plugins: [BAND_PILL] }, async ($, on) => {
  const { h, clock } = await harness($, on)
  h.openFails = true
  await clock.advance(5000)
  for (const surface of SURFACES) {
    toasts = []
    const band = await $.ui.mount({ plugin: 'glitch-hud', surface, component: 'AbovePrompt', props: BAND_PROPS as never })
    await band.press({ key: 'glitch-crew' })
    expect(toasts).toEqual([expect.stringContaining('could not open or close the crew pane')])
    await band.unmount()
    const text = ((await $.command.run({ command: 'glitch', args: 'crew debug' } as never)) as { text: string }).text
    const line = text.split('\n').find(l => l.includes(`${surface} · glitch-hud:glitch-crew → failed`))
    // Logged at the press, not at the epoch.
    expect(line).toMatch(/^  0\.0 s ago/)
  }
})

const spawnCrew = ($: Engine, description: string, type: string, name: string) =>
  $.agent.spawn({ tool_use_id: `tu-${name}-${description}`, prompt: 'p', description, subagentType: `glitch-pets:${type}`, name } as never)
const submit = ($: Engine) => $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } } as never)
const notes = (h: H) => h.contexts.flatMap(c => c ?? []).filter(t => t.startsWith('Glitch crew:') && t.includes('retry it'))

test('a failed crew member woken by a message drops its queued step-up note; one left failed keeps it', async ($, on) => {
  const { h } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawnCrew($, 'A', 'crew-light', 'builder-1')
  await spawnCrew($, 'B', 'crew-light', 'builder-2')
  await spawnCrew($, 'C', 'crew-medium', 'builder-3')
  await agentEnd($, 'ag-A', 'error')
  await agentEnd($, 'ag-B', 'error')
  // A message wakes builder-1: it is at work again, so no retry is asked for it.
  await agentStart($, 'ag-A')
  await submit($)
  expect(notes(h)).toHaveLength(1)
  expect(notes(h)[0]).toContain('builder-2')
})

test('a woken reviewer that ends again does not repeat the crewDone remark', { options: { voiceEveryMinutes: 0.01, tiredMinutes: 60, sleepyMinutes: 60 } }, async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'R', 'reviewer-1')
  await $.turn.complete({ turnId: 'm1', reason: 'answer', answer: '', durationMs: 1, isAborted: false } as never)
  const crewDone = ['The pack is done! I checked them all!', 'Everyone did great! Review done!', 'All checked! Good pack!'].map(l => `Bud: ${l}`)
  const said = () => toasts.filter(t => crewDone.includes(t)).length
  h.status['ag-R'] = 'completed'
  await agentEnd($, 'ag-R')
  expect(said()).toBe(1)
  // Past the voice's own spacing, so only the rule under test can keep it quiet.
  await clock.advance(2000)
  h.status['ag-R'] = 'running'
  await agentStart($, 'ag-R')
  h.status['ag-R'] = 'completed'
  await agentEnd($, 'ag-R')
  expect(said()).toBe(1)
})

// ── Round 2 of the live check (#45): the header, the per-member hop, Open where supported, the name once ──

/** The header's Button: only short Text, its words natural (never cut) and its chevron last. */
const headerButton = (tree: unknown, kind: 'running' | 'finished') => byKey(tree, `crew-acc:${kind}`)

test('desktop header: a Button holding only short Text ("● RUNNING n ▾"), never cut, and the colored bar as an Svg beside it, outside the Button', async ($, on) => {
  await crew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const tree = await ui.drawn()
    if (surface === 'desktop') {
      for (const kind of ['running', 'finished'] as const) {
        const btn = headerButton(tree, kind)
        expect(btn?.type).toBe('Button')
        walk(btn, n => {
          if (n !== btn) expect(n.type).toBe('Text')
        })
        const words = wordsOf(btn)
        expect(words).toBe(kind === 'running' ? '● RUNNING 1 ▾' : 'FINISHED 2 ▾')
        expect(words).not.toContain('…')
        expect(words).not.toMatch(/━/)
        // The bar: an Svg in the header box, not inside the Button, growing into the room left.
        const bar = byKey(tree, `crew-acc-bar:${kind}`)
        expect(bar).toBeTruthy()
        expect(bar?.props?.flexGrow).toBe(1)
        let svgInButton = false
        walk(btn, n => {
          svgInButton ||= n.type === 'Svg'
        })
        expect(svgInButton).toBe(false)
        let svg: Drawn | undefined
        walk(bar, n => {
          svg ??= n.type === 'Svg' ? n : undefined
        })
        const src = String(svg?.props?.source)
        if (kind === 'running') expect(String(svg?.props?.alt)).toBe(`0 of ${wordsOf(byKey(tree, 'crew-acc-steps')).split('/')[1]} steps`)
        else expect(src).toContain('#1f9d55')
        expect(Number(svg?.props?.width)).toBeGreaterThan(0)
      }
      // Toggling still works and the chevron stays visible.
      await ui.press({ key: 'crew-acc:running' })
      expect(wordsOf(headerButton(await ui.drawn(), 'running'))).toBe('● RUNNING 1 ▸')
      expect(await ui.find({ key: `crew-member:${B}` })).toBeFalsy()
      await ui.press({ key: 'crew-acc:running' })
      expect(await ui.find({ key: `crew-member:${B}` })).toBeTruthy()
    } else {
      expect(headerButton(tree, 'running')).toBeUndefined()
      expect(byKey(tree, 'crew-acc-bar:running')).toBeUndefined()
      expect(byKey(tree, 'crew-head')).toBeTruthy()
    }
    await ui.unmount()
  }
})

test('a very narrow pane shortens the header words ("RUN 1 ▾"), drops the bar before cutting anything, and keeps the chevron', async ($, on) => {
  await crew($, on)
  for (const surface of SURFACES) {
    for (const cols of [14, 18, 22]) {
      const ui = await mountPane($, surface, cols)
      const tree = await ui.drawn()
      if (surface === 'desktop') {
        for (const kind of ['running', 'finished'] as const) {
          const words = wordsOf(headerButton(tree, kind))
          expect(words).not.toContain('…')
          expect(words.endsWith(' ▾')).toBe(true)
          expect(['● RUNNING 1 ▾', '● RUN 1 ▾', 'RUN 1 ▾', 'FINISHED 2 ▾', 'FIN 2 ▾']).toContain(words)
          // The words and a bar never ask for more than the header's room (border and padding: 4 cells).
          const bar = byKey(tree, `crew-acc-bar:${kind}`)
          let w = 0
          walk(bar, n => {
            w = n.type === 'Svg' ? Number(n.props?.width) : w
          })
          expect(Array.from(words).length + 2 + (bar ? 1 + Math.ceil(w / 7) : 0)).toBeLessThanOrEqual(cols - 4)
        }
        if (cols === 14) expect(wordsOf(headerButton(tree, 'running'))).toBe('RUN 1 ▾')
        if (cols === 18) expect(wordsOf(headerButton(tree, 'running'))).toBe('● RUN 1 ▾')
      } else expect(headerButton(tree, 'running')).toBeUndefined()
      await ui.unmount()
    }
  }
})

const minisOf = (tree: unknown) => {
  const out: Record<string, { alt: string; source: string; width: number; height: number }> = {}
  walk(tree, n => {
    const key = String(n.props?.key ?? '')
    if (!key.startsWith('crew-mini:')) return
    walk(n, s => {
      if (s.type === 'Svg') out[key.slice('crew-mini:'.length)] = { alt: String(s.props?.alt), source: String(s.props?.source), width: Number(s.props?.width), height: Number(s.props?.height) }
    })
  })
  return out
}

test('no fishing rod, line or gift any more: no overlay, no gift badge, the lead keeps its own sprite', async ($, on) => {
  const { clock } = await crew($, on)
  for (const at of [0, 300, 2000, 5000]) {
    await clock.advance(at)
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface)
      const text = JSON.stringify(await ui.drawn())
      expect(text).not.toContain('crew-reward')
      expect(text).not.toContain('crew-badge')
      expect(text).not.toContain('a gift from')
      expect(text).not.toContain('data-moment')
      if (surface === 'desktop') expect(kids(byKey(await ui.drawn(), 'crew-lead-sprite')).length).toBeGreaterThan(0)
      await ui.unmount()
    }
  }
})

test('every member that finishes hops with a sparkle on its own mini for about 1.5 s, concurrent finishes each their own; the lead is pleased; the terminal draws none', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'One', 'builder-1')
  await spawn($, 'Two', 'builder-2')
  await spawn($, 'Three', 'builder-3')
  await spawn($, 'Four', 'tester-1')
  await clock.advance(1000)
  const ui = await mountPane($, 'desktop')
  const term = await mountPane($, 'terminal')
  // Two finish at once, a third 800 ms later.
  h.status['ag-One'] = 'completed'
  h.status['ag-Two'] = 'completed'
  await agentEnd($, 'ag-One')
  await agentEnd($, 'ag-Two')
  let minis = minisOf(await ui.drawn())
  for (const id of ['ag-One', 'ag-Two']) {
    expect(minis[id]?.alt).toMatch(/happy/)
    expect(minis[id]?.source).toContain('data-part="sparkle"')
  }
  // The ones still at work do not hop.
  for (const id of ['ag-Three', 'ag-Four']) {
    expect(minis[id]?.alt).not.toMatch(/happy/)
    expect(minis[id]?.source).not.toContain('sparkle')
  }
  // The hop's frames change over its time, each in its member's own box (same size as its mini).
  const first = minis['ag-One']
  await clock.advance(400)
  minis = minisOf(await ui.drawn())
  // The lead's flourish (pleased, from the next tick) plays.
  let leadAlt = ''
  walk(byKey(await ui.drawn(), 'crew-lead-sprite'), n => {
    leadAlt = n.type === 'Svg' ? String(n.props?.alt) : leadAlt
  })
  expect(leadAlt).toMatch(/pleased/)
  expect(minis['ag-One']?.source).not.toBe(first?.source)
  expect([minis['ag-One']?.width, minis['ag-One']?.height]).toEqual([first?.width, first?.height])
  // The third finishes while the first two still hop: it gets its own.
  await clock.advance(400)
  h.status['ag-Three'] = 'completed'
  await agentEnd($, 'ag-Three')
  minis = minisOf(await ui.drawn())
  for (const id of ['ag-One', 'ag-Two', 'ag-Three']) expect(minis[id]?.source).toContain('data-part="sparkle"')
  // Well past 1.5 s the first two are still again; the third is still hopping.
  await clock.advance(1050)
  minis = minisOf(await ui.drawn())
  expect(minis['ag-One']?.alt).not.toMatch(/happy/)
  expect(minis['ag-Two']?.source).not.toContain('sparkle')
  expect(minis['ag-Three']?.alt).toMatch(/happy/)
  await clock.advance(800)
  minis = minisOf(await ui.drawn())
  expect(minis['ag-Three']?.alt).not.toMatch(/happy/)
  // The terminal has no sprites at all.
  expect(JSON.stringify(await term.drawn())).not.toContain('"Svg"')
  await ui.unmount()
  await term.unmount()
})

test('the hop drives the frame clock while it plays, then the clock stops; the hats theme keeps its look and size', async ($, on) => {
  const { h, clock } = await harness($, on)
  await $.command.run({ command: 'glitch', args: 'crew theme hats' } as never)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Only', 'builder-1')
  const ui = await mountPane($, 'desktop')
  const still = minisOf(await ui.drawn())['ag-Only']
  h.status['ag-Only'] = 'completed'
  await agentEnd($, 'ag-Only')
  h.frames.length = 0
  await clock.advance(1500)
  // Redraws during the hop, at most 4 a second.
  expect(h.frames.length).toBeGreaterThanOrEqual(3)
  expect(h.frames.length).toBeLessThanOrEqual(7)
  await clock.advance(100)
  expect(minisOf(await ui.drawn())['ag-Only']?.alt).not.toMatch(/happy/)
  // Once the lead's flourish (its brief joy) is over too, nothing is due: the clock stops.
  await clock.advance(1500)
  h.frames.length = 0
  await clock.advance(3000)
  expect(h.frames).toEqual([])
  await ui.unmount()
  // A fresh finish under hats: the hopping mini keeps the theme's 32 × 32 (the hat stays on).
  await spawn($, 'Next', 'builder-2')
  const ui2 = await mountPane($, 'desktop')
  h.status['ag-Next'] = 'completed'
  await agentEnd($, 'ag-Next')
  const hop = minisOf(await ui2.drawn())['ag-Next']
  expect(hop?.alt).toMatch(/happy/)
  expect([hop?.width, hop?.height]).toEqual([still?.width, still?.height])
  expect([hop?.width, hop?.height]).toEqual([32, 32])
  await ui2.unmount()
})

// ── 5. The role once, the task beside it ──

test('a member shows its role once with its task: a description that only repeats the role or name gives way to the task from the prompt', async ($, on) => {
  await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-r', prompt: 'Find the date formats our users type most often.\nList the top five with examples.', description: 'researcher', subagentType: 'general-purpose', name: 'researcher-1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-u', prompt: 'p', description: 'Look up the parser options', subagentType: 'general-purpose' } as never)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, surface === 'desktop' ? 40 : 100)
    const tree = await ui.drawn()
    if (surface === 'desktop') {
      expect(wordsOf(byKey(tree, 'crew-title:ag-researcher'))).toMatch(/^Researcher\s*Find the/)
      // Running and no tool call yet: it is starting.
      expect(wordsOf(byKey(tree, 'crew-task:ag-researcher'))).toBe('Starting…')
      // The unnamed one: its role word too, its task beside it.
      expect(wordsOf(byKey(tree, 'crew-title:ag-Look up the parser options'))).toMatch(/^Researcher\s*Look up/)
    } else {
      const line = wordsOf(byKey(tree, 'crew-line:ag-researcher'))
      expect(line).toContain('Researcher')
      expect(line).not.toContain('researcher-1')
      expect(line).toContain('Find the date formats')
      expect(wordsOf(byKey(tree, 'crew-line:ag-Look up the parser options'))).toContain('Look up the parser options')
    }
    await ui.unmount()
  }
})

// ── Review polish (fix/pane-live-2) ──

test('an older engine (no helper turn.start): a finished helper\'s next step wakes its row; a running row\'s step changes nothing', async ($, on) => {
  const { h } = await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await spawn($, 'Build', 'builder-1')
  await spawn($, 'Probe', 'researcher-1')
  h.status['ag-Build'] = 'completed'
  await agentEnd($, 'ag-Build')
  const stepOf = async (agentId: string) => {
    const s = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)({ turnId: 's', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId })
    while (!(await s.next()).done) {
      // Read the stream to its end.
    }
  }
  const counts = async () => {
    const out: string[] = []
    for (const surface of SURFACES) {
      const ui = await mountPane($, surface, 100)
      const t = await ui.drawn()
      await ui.unmount()
      out.push(surface === 'terminal' ? (wordsOf(byKey(t, 'crew-head')).match(/\d+ running · \d+ done/)?.[0] ?? '') : wordsOf(byKey(t, 'crew-acc:running')))
    }
    return out
  }
  expect(await counts()).toEqual(['1 running · 1 done', '● RUNNING 1 ▾'])
  // The running one's step: nothing changes.
  await stepOf('ag-Probe')
  expect(await counts()).toEqual(['1 running · 1 done', '● RUNNING 1 ▾'])
  // A message woke builder-1: its first step is the only sign on such an engine.
  h.status['ag-Build'] = 'running'
  await stepOf('ag-Build')
  expect(await counts()).toEqual(['2 running · 0 done', '● RUNNING 2 ▾'])
})

test('the header\'s hover sits on its pressable words, not on the bar or the whole box', async ($, on) => {
  await crew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    const tree = await ui.drawn()
    if (surface === 'desktop') {
      for (const kind of ['running', 'finished'] as const) {
        expect(byKey(tree, `crew-acc-press:${kind}`)?.hover?.backgroundColor).toBeTruthy()
        expect(byKey(tree, `crew-acc-box:${kind}`)?.hover).toBeUndefined()
        expect(byKey(tree, `crew-acc-bar:${kind}`)?.hover).toBeUndefined()
      }
    } else expect(byKey(tree, 'crew-acc-press:running')).toBeUndefined()
    await ui.unmount()
  }
})

test('the lead and the row name an unnamed member the same way', async ($, on) => {
  await harness($, on)
  await $.turn.start({ turnId: 'm1' } as never)
  await $.agent.spawn({ tool_use_id: 'tu-u', prompt: 'p', description: 'Look up the parser options and summarise them', subagentType: 'general-purpose' } as never)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface, 100)
    const tree = await ui.drawn()
    // One member at work: the lead's line names it as its row does ("researcher").
    expect(wordsOf(byKey(tree, 'crew-lead'))).toContain('researcher')
    expect(wordsOf(byKey(tree, 'crew-lead'))).not.toContain('Look up')
    await ui.unmount()
  }
})
