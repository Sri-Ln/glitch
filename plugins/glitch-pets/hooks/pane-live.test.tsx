// Fixes from the first live check (#45 items 1, 4, 5, 7): the header line is one press,
// a member press is never silent, the desktop tree fits the pane's real bodyColumns, and
// the rows follow the engine's own word on each helper's status.
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

let toasts: string[] = []
const START = Date.parse('2026-10-14T10:00:00Z')
const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

type H = { status: Record<string, string>; usd: number; summaries: unknown[]; listCalls: number }

const harness = async ($: Engine, on: On) => {
  toasts = []
  const h: H = { status: {}, usd: 1, summaries: [], listCalls: 0 }
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
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('agent.spawn', (_$, e) => {
    h.status[`ag-${e.description}`] = 'running'
    return { model: 'claude-opus-5-5', agentId: `ag-${e.description}` } as never
  })
  on('agent.list', () => {
    h.listCalls += 1
    return { value: Object.entries(h.status).map(([id, status]) => ({ id, description: id, type: 'general-purpose', status })) } as never
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, tokens: 0, percent: 0 }, rateLimits: [], cost: { usd: h.usd } } }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.step', async function* () {
    return { turnId: 's', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  on('state.set', (_$, e, next) => {
    if ((e as { key?: string }).key === 'crewSummary') h.summaries.push((e as { value?: unknown }).value)
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

// ── 1. The accordion header is one press ──

test('desktop: the whole Running/Finished header line is one Button (dot, label, count, bar, chevron), and a press folds it', async ($, on) => {
  await crew($, on)
  for (const surface of SURFACES) {
    const ui = await mountPane($, surface)
    if (surface === 'desktop') {
      for (const kind of ['running', 'finished'] as const) {
        const box = byKey(await ui.drawn(), `crew-acc-box:${kind}`)
        // Nothing beside the Button: a click anywhere on the line is the press.
        expect(kids(box).map(k => k.type)).toEqual(['Button'])
        const btn = kids(box)[0]
        expect(btn?.props?.key).toBe(`crew-acc:${kind}`)
        // Strings and Text only inside a Button.
        walk(btn, n => {
          if (n !== btn) expect(n.type).toBe('Text')
        })
        const words = wordsOf(btn)
        expect(words).toContain(kind === 'running' ? 'RUNNING' : 'FINISHED')
        expect(words).toMatch(/━/)
        expect(words.endsWith('▾')).toBe(true)
      }
      await ui.press({ key: 'crew-acc:running' })
      expect(wordsOf(byKey(await ui.drawn(), 'crew-acc:running')).endsWith('▸')).toBe(true)
      expect(await ui.find({ key: `crew-member:${B}` })).toBeFalsy()
      await ui.press({ key: 'crew-acc:running' })
      expect(await ui.find({ key: `crew-member:${B}` })).toBeTruthy()
    } else {
      expect(await ui.find({ key: 'crew-acc:running' })).toBeFalsy()
      await ui.press({ key: 'crew-finished' })
      expect(await ui.find({ key: `crew-line:${C}` })).toBeTruthy()
    }
    await ui.unmount()
  }
})

// ── 4. A member press opens its transcript, or says why not ──

test('desktop: a member\'s name and its Open ↗ are one always-visible Button (no hover-only reveal)', async ($, on) => {
  await crew($, on)
  const ui = await mountPane($, 'desktop')
  const tree = await ui.drawn()
  const btn = byKey(tree, `crew-open:${B}`)
  expect(btn?.type).toBe('Button')
  expect(wordsOf(btn)).toContain('researcher-1')
  expect(wordsOf(btn)).toContain('↗')
  // No part of the press target starts hidden.
  walk(byKey(tree, `crew-member:${B}`), n => expect(n.props?.display).not.toBe('none'))
  await ui.unmount()
})

test('a refused view says why and what to do; a member that left the tasks list says so', async ($, on) => {
  let deny = 'no agent holds the id'
  on('ui.view', () => ({ value: { deny } }) as never)
  const { h } = await crew($, on)
  for (const surface of SURFACES) {
    toasts = []
    const ui = await mountPane($, surface)
    await ui.press({ key: `crew-open:${B}` })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toContain('researcher-1')
    expect(toasts[0]).toContain('no agent holds the id')
    expect(toasts[0]).toMatch(/tasks list/i)
    await ui.unmount()
  }
  // The engine dropped C's task: the toast says it finished and left the list.
  delete h.status[C]
  deny = 'the tasks list shows no row for it'
  toasts = []
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: `crew-open:${C}` })
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/tester-1 .*left the tasks list/)
  await ui.unmount()
})

test('a view that switched says so on the desktop (the terminal shows it); a view that never answers is said after a wait', async ($, on) => {
  let release: (() => void) | null = null
  let hang = false
  on('ui.view', async () => {
    if (hang) await new Promise<void>(r => (release = r))
    return { value: {} } as never
  })
  const { clock } = await crew($, on)
  for (const surface of SURFACES) {
    toasts = []
    const ui = await mountPane($, surface)
    await ui.press({ key: `crew-open:${B}` })
    if (surface === 'desktop') expect(toasts).toEqual([expect.stringContaining('researcher-1')])
    else expect(toasts).toEqual([])
    await ui.unmount()
  }
  hang = true
  toasts = []
  const ui = await mountPane($, 'desktop')
  const pressed = ui.press({ key: `crew-open:${B}` })
  await clock.advance(5000)
  // Answered late: the toast was already said, nothing more.
  ;(release as unknown as () => void)?.()
  await pressed
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/did not switch|no answer/i)
  await ui.unmount()
})

test('/glitch crew debug lists the crew rows against the engine\'s agent list and the last presses', async ($, on) => {
  on('ui.view', () => ({ value: { deny: 'the session draws no main view' } }) as never)
  const { h } = await crew($, on)
  h.status['ag-other'] = 'running'
  const ui = await mountPane($, 'desktop', 40, { agentId: B })
  await ui.press({ key: `crew-open:${B}` })
  await ui.press({ key: 'crew-acc:finished' })
  await ui.unmount()
  for (const command of ['glitch', 'glitch-pets'] as const) {
    const text = ((await $.command.run({ command, args: 'crew debug' } as never)) as { text: string }).text
    expect(text).toContain(B)
    expect(text).toMatch(/researcher-1.*running/)
    expect(text).toMatch(/tester-1.*done/)
    // The engine's own word for each, and the list entry no row holds.
    expect(text).toContain('completed')
    expect(text).toContain('ag-other')
    expect(text).toContain('the session draws no main view')
    expect(text).toContain('crew-acc:finished')
    // The view in force where the pane last drew.
    expect(text).toMatch(/desktop.*view.*Research/i)
  }
})

// ── 5. The desktop tree fits the pane's real width ──

for (const cols of [28, 34, 40, 60]) {
  test(`desktop at ${cols} cells: every text truncates, each member field keeps one line within the details column`, async ($, on) => {
    await crew($, on)
    const ui = await mountPane($, 'desktop', cols)
    const tree = await ui.drawn()
    // No Text may wrap onto a second line.
    walk(tree, n => {
      if (n.type === 'Text') expect(['truncate-end', 'truncate']).toContain(n.props?.wrap)
    })
    // The header line fits inside its border and padding.
    for (const kind of ['running', 'finished']) expect(wordsOf(byKey(tree, `crew-acc:${kind}`)).length).toBeLessThanOrEqual(cols - 4)
    // Each tally cell's words fit its third of the line.
    const third = Math.floor((cols - 2 - 2) / 3)
    for (const cell of kids(byKey(tree, 'crew-tally'))) expect(wordsOf(cell).length).toBeLessThanOrEqual(third)
    for (const id of [A, B, C]) {
      const member = byKey(tree, `crew-member:${id}`)
      const mini = Number(byKey(tree, `crew-mini:${id}`)?.props?.width ?? 0)
      const detail = cols - 2 - (mini ? mini + 1 : 0)
      const title = byKey(tree, `crew-title:${id}`)
      expect(Number(title?.props?.width ?? 0) <= detail || title === undefined).toBe(true)
      expect(wordsOf(byKey(tree, `crew-open:${id}`)).length + 1 + wordsOf(byKey(tree, `crew-time:${id}`)).length).toBeLessThanOrEqual(detail)
      // The pill row: the bar's cells and its words.
      const pillBox = byKey(tree, `crew-pill:${id}`)
      const label = wordsOf(byKey(tree, `crew-pill-label:${id}`))
      expect(Number(pillBox?.props?.width ?? 0) + (pillBox ? 1 : 0) + label.length).toBeLessThanOrEqual(detail)
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
    await term.unmount()
  })
}

test('desktop: below 34 cells the tokens chip goes first, then the cost; the model stays', async ($, on) => {
  await crew($, on)
  const chipsAt = async (cols: number) => {
    const ui = await mountPane($, 'desktop', cols)
    const words = kids(byKey(await ui.drawn(), `crew-chips:${B}`)).map(wordsOf)
    await ui.unmount()
    return words
  }
  expect((await chipsAt(60)).length).toBe(3)
  const narrow = await chipsAt(28)
  expect(narrow.length).toBeLessThan(3)
  expect(narrow[0]).toMatch(/Opus/)
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
  const count = async () => wordsOf(await (async () => {
    const ui = await mountPane($, 'terminal', 100)
    const t = await ui.drawn()
    await ui.unmount()
    return t
  })())
  expect(await count()).toContain('Crew · 1 running · 1 done')
  // A message wakes it: its own turn starts.
  h.status['ag-Build'] = 'running'
  await agentStart($, 'ag-Build')
  expect(await count()).toContain('Crew · 2 running · 0 done')
  await agentEnd($, 'ag-Build')
  // The list lags a second behind: the row stays done.
  await clock.advance(1000)
  expect(await count()).toContain('Crew · 1 running · 1 done')
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
