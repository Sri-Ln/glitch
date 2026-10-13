import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cellWidth } from './parts'

const BAND = (bodyColumns: number) =>
  ({ component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns, scroll: { offset: 0, bodyRows: 4 }, view: {} } as never }) as const

let usd = 0
let toasts: string[] = []
let gitOut: string | null = null
// How many of the next toasts the host refuses (throws).
let toastThrows = 0
// `lead`: time before the first chunk; `ms`: time from the first chunk to the rest.
let step: { chunks: unknown[]; ms: number; lead?: number } = { chunks: [], ms: 0 }
const MAIN = '# branch.oid abc\n# branch.head main\n'
const STEP_RESULT = { turnId: 't', index: 0, answer: 'hi', toolUses: [] }

// Every answer sits beneath the plugin and is registered before the first `$` call.
const session = async ($: Engine, on: On, git: string | null = MAIN, opts: { registerFails?: boolean } = {}) => {
  usd = 0
  toasts = []
  gitOut = git
  toastThrows = 0
  step = { chunks: [], ms: 0 }
  on('ui.toast', (_$, e) => {
    if (toastThrows > 0) {
      toastThrows--
      throw new Error('toast refused')
    }
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('session.cwd', () => ({ value: 'C:\\repo' }) as never)
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T10:00:00Z') })
  mock.store(on)
  mock.env(on, { OS: 'Windows_NT' })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, tokens: 630_000, percent: 63 }, rateLimits: [], cost: { usd } } }) as never)
  on('process.run', () => ({ value: gitOut === null ? { exitCode: 128, stdout: '', stderr: '' } : { exitCode: 0, stdout: gitOut, stderr: '' } }) as never)
  on('turn.step', async function* () {
    if (step.chunks.length === 0) return STEP_RESULT as never
    await clock.advance(step.lead ?? 0)
    yield step.chunks[0] as never
    await clock.advance(step.ms)
    for (const c of step.chunks.slice(1)) yield c as never
    return STEP_RESULT as never
  })
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  // Nothing beneath the plugin draws: an empty box, so a stepped-aside band has no text.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('command.register', () => {
    if (opts.registerFails) throw new Error('register refused')
    return { value: { command: 'glitch-hud' } } as never
  })
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('session.start', async () => ({ cwd: 'C:\\repo' }) as never)
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'terminal', isInteractive: true } as never)

  return clock
}

const turn = async ($: Engine, cost: number) => {
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  usd = cost
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' })
}

const rowText = async ($: Engine, columns: number, surface: 'terminal' | 'desktop' = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(columns) })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
  await ui.unmount()
  return texts
}

test('band: nothing before the first turn', async ($, on) => {
  await session($, on)
  expect(await rowText($, 120)).toBe('')
})

test('band (terminal): shows turn, cost, cache, context and git after a turn', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  const row = await rowText($, 160)
  expect(row).toContain('#1')
  expect(row).toContain('$0.42')
  expect(row).not.toContain('│')
  expect(row).toContain('60:00')
  expect(row).toContain('63%')
  expect(row).toContain('main')
})

// The desktop draws the branch in its own row above the band: git is left out there.
test('band (desktop): worded values, icons and a bar with tooltips, no git', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const row = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  expect(row).toContain('Turn 1')
  expect(row).toContain('$0.42 session')
  expect(row).toContain('60:00 left')
  expect(row).toContain('63% context')
  expect(row).not.toContain('main')
  expect(svgs.map(x => x.props.alt)).toEqual([
    'Output speed of the last answer',
    'Session $0.42',
    'Prompt cache expires in 60:00. Press ↻ to keep it warm.',
    'Context 63% full',
  ])
  expect(svgs.every(x => x.props.isInteractive === true && String(x.props.source).includes('<title>'))).toBe(true)
})

test('band (desktop): git shows once the person picks the parts', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await $.command.run({ command: 'glitch-hud', args: 'hud parts cost,git' } as never)
  const row = await rowText($, 160, 'desktop')
  expect(row).toContain('main')
  expect(row).not.toContain('Turn')
})

test('band (desktop): Parts changed in the settings shows git', { options: { parts: 'cache,git' } }, async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  expect(await rowText($, 160, 'desktop')).toContain('main')
})

test('band (desktop): the second turn shows turn and session cost', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await turn($, 0.5)
  expect(await rowText($, 160, 'desktop')).toContain('$0.08 turn · $0.50 session')
})

test('band: a 5-minute cache lifetime counts down from 05:00 and warns at its marks', { options: { cacheTtlMinutes: '5', cacheWarnMinutes: '2', notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  expect(await rowText($, 160)).toContain('05:00')
  await clock.advance(3 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 2 min'])
})

test('band: the countdown ticks and pauses while busy', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(61_000)
  expect(await rowText($, 160)).toContain('58:59')
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't2' })
  const busy = await rowText($, 160)
  expect(busy).not.toContain('58:')
  expect(busy).toContain('…')
})

test('band: a /clear drops the countdown', { options: { notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  expect(await rowText($, 160)).toContain('60:00')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  expect(await rowText($, 160)).not.toContain('60:00')
  await clock.advance(55 * 60_000)
  expect(toasts).toEqual([])
})

test('band: an exit leaves the countdown', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's1', resume: { id: 's1' } } as never)
  expect(await rowText($, 160)).toContain('60:00')
})

test('band: not a git repo hides the git part', async ($, on) => {
  await session($, on, null)
  await turn($, 0.1)
  expect(await rowText($, 160)).not.toContain('⎇')
})

test('band: narrow terminal keeps one line by dropping parts', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  const row = await rowText($, 36)
  expect(row).not.toContain('main')
  expect(row).not.toContain('tok/s')
  expect(row).toContain('63%')
})

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string

// Cells the row takes as the terminal lays it out: each child of a row Box is
// one flex item, and `columnGap` sits between every two of them.
const cells = (n: unknown): number => {
  if (typeof n === 'string') return cellWidth(n)
  const node = n as Exclude<Node, string>
  if (node.type === 'Button') return cellWidth(String(node.props?.label ?? ''))
  const kids = node.children ?? []
  const widths = kids.map(cells)
  if (node.type === 'Box' && node.props?.flexDirection === 'column') return Math.max(0, ...widths)
  const gap = Number(node.props?.columnGap ?? 0)
  return widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1)
}

test('band: at every width the row fits with its controls, and × stays', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  let gitShownAt = 0
  for (let columns = 40; columns <= 100; columns++) {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'terminal', ...BAND(columns) })
    const drawn = (await ui.drawn()) as unknown as { children: unknown[] }
    const used = cells(drawn.children[0])
    const hide = await ui.find({ key: 'glitch-hide' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
    await ui.unmount()
    expect({ columns, fits: used <= columns, hide: hide !== undefined }).toEqual({ columns, fits: true, hide: true })
    if (!gitShownAt && texts.includes('main')) gitShownAt = columns
  }
  // Just above the threshold where git joins the row, it still fits.
  expect(gitShownAt).toBeGreaterThan(40)
})

test('band: × hides it for the session', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'terminal', ...BAND(160) })
  await ui.press({ key: 'glitch-hide' })
  await ui.unmount()
  expect(await rowText($, 160)).toBe('')
})

const STEP = { turnId: 't', index: 0, model: 'm', messageCount: 1 }

const runStep = async ($: Engine, input: object) => {
  const stream = ($.turn.step as unknown as (e: object) => AsyncGenerator<unknown, unknown>)(input)
  const got: unknown[] = []
  for (;;) {
    const r = await stream.next()
    if (r.done) return { got, result: r.value }
    got.push(r.value)
  }
}

const USAGE = (output: number) => ({ input_tokens: 10, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' })

const STEP_CHUNKS = [
  { kind: 'text', index: 0, text: 'he', ref: 1 },
  { kind: 'text', index: 0, text: 'llo', ref: 2 },
  { kind: 'stop', stopReason: 'end_turn', usage: USAGE(100), ref: 3 },
]

test('band: speed is output tokens over the time from the first chunk, chunks pass unchanged', async ($, on) => {
  await session($, on)
  step = { chunks: STEP_CHUNKS, ms: 2000, lead: 3000 }
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  const { got, result } = await runStep($, STEP)
  expect(got).toEqual(STEP_CHUNKS)
  expect(result).toEqual(STEP_RESULT)
  expect(await rowText($, 160)).toContain('50 tok/s')
})

test('band: a short or quick response leaves the speed alone', async ($, on) => {
  await session($, on)
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  step = { chunks: [STEP_CHUNKS[0], { ...STEP_CHUNKS[2], usage: USAGE(5) }], ms: 2000 }
  await runStep($, STEP)
  expect(await rowText($, 160)).not.toContain('tok/s')
})

test('band: a response under half a second leaves the speed alone', async ($, on) => {
  await session($, on)
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  step = { chunks: STEP_CHUNKS, ms: 300 }
  await runStep($, STEP)
  expect(await rowText($, 160)).not.toContain('tok/s')
})

test('band: a subagent step does not change the speed', async ($, on) => {
  await session($, on)
  step = { chunks: STEP_CHUNKS, ms: 2000 }
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  const { got } = await runStep($, { ...STEP, agentId: 'a1' })
  expect(got).toEqual(STEP_CHUNKS)
  expect(await rowText($, 160)).not.toContain('tok/s')
})

test('band: cache marks notify once each, never while a turn runs, and re-arm', { options: { notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 10 min'])
  await clock.advance(5 * 60_000)
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toContain('in 5 min')
  await clock.advance(60_000)
  expect(toasts).toHaveLength(2)

  // A running turn holds the warnings back; the next answer re-arms them.
  toasts.length = 0
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't2' })
  await clock.advance(60 * 60_000)
  expect(toasts).toEqual([])
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(50 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 10 min'])
})

test('session.start: a refused /glitch-hud registration toasts and start-up goes on', async ($, on) => {
  const clock = await session($, on, MAIN, { registerFails: true })
  expect(toasts).toEqual(['Glitch HUD: could not register /glitch-hud'])
  await turn($, 0.1)
  await clock.advance(61_000)
  const row = await rowText($, 160)
  expect(row).toContain('58:59')
  expect(row).toContain('main')
})

test('band: a tick that fails does not stop the countdown warnings', { options: { notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  toastThrows = 1
  await clock.advance(50 * 60_000)
  expect(toasts).toEqual([])
  await clock.advance(5 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 5 min'])
})

test('band: a turn that ended before any answer leaves the countdown', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(10 * 60_000)
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't2' })
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: '', durationMs: 10, isAborted: true, turnId: 't2', reason: 'aborted' })
  expect(await rowText($, 160)).toContain('50:00')
  // An errored turn whose requests had usage did reach the cache.
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't3' })
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: '', durationMs: 10, isAborted: false, turnId: 't3', reason: 'error', usage: { input_tokens: 10, output_tokens: 0 } })
  expect(await rowText($, 160)).toContain('60:00')
})

test('session.start: bad settings toast once with the problem', { options: { parts: 'cost,,bogus' } }, async ($, on) => {
  await session($, on)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Glitch HUD: parts:')
})

test('session.start: good settings toast nothing', async ($, on) => {
  await session($, on)
  expect(toasts).toEqual([])
})

test('band: git refreshes on the 30 s timer while idle', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  gitOut = '# branch.oid abc\n# branch.head feature\n'
  await clock.advance(30_000)
  expect(await rowText($, 160)).toContain('feature')
})
