import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cellWidth } from './parts'

const BAND = (bodyColumns: number) =>
  ({ component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns, scroll: { offset: 0, bodyRows: 4 }, view: {} } as never }) as const

let usd = 0
let toasts: string[] = []
let gitOut: string | null = null
let gitRuns = 0
// PowerShell toasts run and Claude Code notifications sent (the `windows` route).
let psRuns = 0
let uiNotifies = 0
// How many of the next toasts the host refuses (throws).
let toastThrows = 0
// While set, the session's usage cannot be read / the host refuses the plugin's state writes.
let usageFails = false
let stateRefused = false
// What a keep-warm fork answers.
let fork: unknown = { isAnswered: false, reason: 'nothing-to-fork' }
// `lead`: time before the first chunk; `ms`: time from the first chunk to the rest.
let step: { chunks: unknown[]; ms: number; lead?: number } = { chunks: [], ms: 0 }
const MAIN = '# branch.oid abc\n# branch.head main\n'
const STEP_RESULT = { turnId: 't', index: 0, answer: 'hi', toolUses: [] }

// Every answer sits beneath the plugin and is registered before the first `$` call.
// `opts.store` seeds the plugin's store (another session's ledger entry, say).
const session = async ($: Engine, on: On, git: string | null = MAIN, opts: { registerFails?: boolean; refusable?: boolean; store?: Record<string, unknown> } = {}) => {
  usd = 0
  toasts = []
  gitOut = git
  gitRuns = 0
  psRuns = 0
  uiNotifies = 0
  toastThrows = 0
  usageFails = false
  stateRefused = false
  fork = { isAnswered: false, reason: 'nothing-to-fork' }
  step = { chunks: [], ms: 0 }
  // Only where a test refuses writes: every write passing a test hook slows the long countdowns.
  if (opts.refusable) on('state.set', (_$, e, next) => (stateRefused ? ({ deny: 'state refused' } as never) : next(e)))
  on('model.fork', () => {
    if (fork === 'reject') throw new Error('fork refused')
    if (fork instanceof Promise) return fork as never
    return { value: fork } as never
  })
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
  const seeded = opts.store
  if (seeded) {
    on('store.get', (_$, e) => ({ value: seeded[e.key] }) as never)
    on('store.set', (_$, e) => {
      seeded[e.key] = e.value
      return { value: undefined } as never
    })
    on('store.delete', (_$, e) => {
      delete seeded[e.key]
      return { value: undefined } as never
    })
    on('store.keys', () => ({ value: Object.keys(seeded) }) as never)
  } else mock.store(on)
  mock.env(on, { OS: 'Windows_NT' })
  on('session.usage', () => {
    if (usageFails) throw new Error('usage refused')
    return { value: { startedAt: 0, context: { window: 1_000_000, tokens: 630_000, percent: 63 }, rateLimits: [], cost: { usd } } } as never
  })
  on('ui.notify', () => {
    uiNotifies++
    return { value: { isSent: true } } as never
  })
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'powershell.exe') {
      psRuns++
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    }
    gitRuns++
    return { value: gitOut === null ? { exitCode: 128, stdout: '', stderr: '' } : { exitCode: 0, stdout: gitOut, stderr: '' } } as never
  })
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
  expect(row).toContain('$ 0.42 session · 0.42 today')
  expect(row).not.toContain('│')
  expect(row).toContain('60:00')
  expect(row).toContain('63%')
  expect(row).toContain('main')
})

// The desktop draws the branch in its own row above the band: git is left out there.
test('band (desktop): worded values, fixed-size icons and a bar, no git', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const row = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  // The conversation is in view on the desktop: the turn count is left out there.
  expect(row).not.toContain('Turn')
  expect(row).toContain('$0.42 session')
  expect(row).toContain('60:00 left')
  expect(row).toContain('63% context')
  expect(row).not.toContain('main')
  // tok/s is the terminal's under the default `auto`.
  expect(row).not.toContain('tok/s')
  expect(svgs.map(x => x.props.alt)).toEqual([
    'Session $0.42 · Today on this machine $0.42',
    'Prompt cache countdown. Press ↻ to keep it warm.',
    'Context 63% full',
  ])
  // Plain images at a set size: an interactive Svg drew as a tall frame on the desktop.
  expect(svgs.every(x => x.props.isInteractive === undefined && typeof x.props.width === 'number' && typeof x.props.height === 'number')).toBe(true)
  expect(svgs.map(x => x.props.height)).toEqual([14, 14, 8])
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

test('band (desktop): the second turn shows the reply, session and today cost', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await turn($, 0.5)
  expect(await rowText($, 160, 'desktop')).toContain('$0.08 reply · $0.50 session · $0.50 today')
})

test('band: today counts another session on this machine from the first turn', async ($, on) => {
  await session($, on, MAIN, { store: { 'ledger:2026-10-12:other': 18 } })
  await turn($, 0.42)
  expect(await rowText($, 160)).toContain('0.42 session · 18.42 today')
})

// Each session sums the ledger when its own turn ends: an idle one reads it again
// on the timer, so every session's today agrees within 30 s.
test('band: an idle session picks up what another session spent', async ($, on) => {
  const store: Record<string, unknown> = { 'ledger:2026-10-12:other': 18 }
  const clock = await session($, on, MAIN, { store })
  await turn($, 0.42)
  expect(await rowText($, 160)).toContain('18.42 today')
  store['ledger:2026-10-12:other'] = 20
  await clock.advance(30_000)
  expect(await rowText($, 160)).toContain('20.42 today')
})

test('band: /glitch hud cost picks the figures and their order', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await turn($, 0.5)
  expect(await $.command.run({ command: 'glitch-hud', args: 'hud cost today,reply' } as never)).toEqual({ text: 'HUD cost: today, reply.' })
  const row = await rowText($, 160)
  expect(row).toContain('$ 0.50 today · 0.08 reply')
  expect(row).not.toContain('session')
})

test('band: Cost shows in the settings picks the figures', { options: { costShows: 'session' } }, async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await turn($, 0.5)
  const row = await rowText($, 160)
  expect(row).toContain('$ 0.50 session')
  expect(row).not.toContain('today')
})

test('band (desktop): Turn shows once the person picks the parts', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  await $.command.run({ command: 'glitch-hud', args: 'hud parts turn,cost' } as never)
  expect(await rowText($, 160, 'desktop')).toContain('Turn 1')
})

test('band: the hide control is ✕ on the desktop and × in the terminal', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  const label = async (surface: 'terminal' | 'desktop') => {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(160) })
    const hide = await ui.find({ key: 'glitch-hide' })
    await ui.unmount()
    return hide?.props.label
  }
  expect(await label('desktop')).toBe('✕')
  expect(await label('terminal')).toBe('×')
})

// The control reads … for as long as the keep-warm request runs. It is one glyph
// on every surface: the desktop drew a longer label as visible, cut-off text.
test('band (desktop): the keep-warm control is one glyph and reads … while it runs', async ($, on) => {
  let release: (v: unknown) => void = () => undefined
  await session($, on)
  fork = new Promise(r => { release = r })
  await turn($, 0.1)
  const label = async () => {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
    const button = await ui.find({ key: 'glitch-warm' })
    await ui.unmount()
    return String(button?.props.label)
  }
  expect(await label()).toBe('↻')
  const padded = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  // A cell before ↻ only: the gap after it is the row's own.
  const box = await padded.find({ key: 'glitch-warm-box' })
  expect(box?.props.paddingLeft).toBe(1)
  expect(box?.props.paddingX).toBeUndefined()
  expect(box?.props.paddingRight).toBeUndefined()
  await padded.unmount()
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const pressed = ui.press({ key: 'glitch-warm' })
  for (let i = 0; i < 50 && (await label()) !== '…'; i++) await Promise.resolve()
  expect(await label()).toBe('…')
  release({ value: { isAnswered: false, reason: 'test' } })
  await pressed
  await ui.unmount()
  expect(await label()).toBe('↻')
})

test('band: a 5-minute cache lifetime counts down from 05:00 and warns at its marks', { options: { cacheTtlMinutes: '5', cacheWarnMinutes: '2', notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  expect(await rowText($, 160)).toContain('05:00')
  await clock.advance(3 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 2 min'])
})

test('band: a 5-minute lifetime with no marks set warns at 2 and 1 min, no start-up toast', { options: { cacheTtlMinutes: '5', notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  expect(toasts).toEqual([])
  await turn($, 0.1)
  await clock.advance(3 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 2 min'])
  await clock.advance(60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 2 min', 'repo — Glitch: Prompt cache expires in 1 min'])
})

test('band: a typed mark the lifetime never reaches is named once at start-up', { options: { cacheTtlMinutes: '5', cacheWarnMinutes: '10,2', notify: 'toast' } }, async ($, on) => {
  await session($, on)
  expect(toasts).toEqual(['Glitch HUD: cacheWarnMinutes: marks at or above the cache lifetime are ignored'])
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

test('band: cache marks notify once each, never while a turn runs, and re-arm', { timeoutMs: 30_000, options: { notify: 'toast' } }, async ($, on) => {
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

test('band: with default settings a cache warning is an in-app toast, never a Windows or Claude Code notification', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 10 min'])
  expect(psRuns).toBe(0)
  expect(uiNotifies).toBe(0)
})

test('band: notify windows still sends the cache warning as a native Windows toast', { options: { notify: 'windows' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  expect(psRuns).toBe(1)
  expect(uiNotifies).toBe(0)
  expect(toasts).toEqual([])
})

test('band: notify off sends no cache warning at all', { options: { notify: 'off' } }, async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  expect(psRuns).toBe(0)
  expect(uiNotifies).toBe(0)
  expect(toasts).toEqual([])
})

test('band: with default settings a budget cap shows one in-app toast, no Windows or Claude Code notification', { options: { budgetSession: 10 } }, async ($, on) => {
  await session($, on)
  await turn($, 10.5)
  expect(toasts).toEqual(['Glitch: session spend $10.50 reached the $10.00 cap'])
  expect(psRuns).toBe(0)
  expect(uiNotifies).toBe(0)
})

test('band: notify windows at a budget cap still sends the Windows notification', { options: { budgetSession: 10, notify: 'windows' } }, async ($, on) => {
  await session($, on)
  await turn($, 10.5)
  expect(toasts).toEqual(['Glitch: session spend $10.50 reached the $10.00 cap'])
  expect(psRuns).toBe(1)
})

test('band: notify off at a budget cap keeps the session toast only', { options: { budgetSession: 10, notify: 'off' } }, async ($, on) => {
  await session($, on)
  await turn($, 10.5)
  expect(toasts).toEqual(['Glitch: session spend $10.50 reached the $10.00 cap'])
  expect(psRuns).toBe(0)
  expect(uiNotifies).toBe(0)
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

test('session.start: a second start (compact, resume, fork) does not stack the timers', { options: { notify: 'toast' } }, async ($, on) => {
  const clock = await session($, on)
  await $.session.start({ source: 'compact', cwd: 'C:\\repo', surface: 'terminal', isInteractive: true } as never)
  gitRuns = 0
  await clock.advance(30_000)
  expect(gitRuns).toBe(1)
  // The countdown still ticks after the second start, and warns once.
  await turn($, 0.1)
  await clock.advance(61_000)
  expect(await rowText($, 160)).toContain('58:59')
  await clock.advance(49 * 60_000)
  expect(toasts).toEqual(['repo — Glitch: Prompt cache expires in 10 min'])
})

const COST_TOAST = "Glitch: can't read the session cost right now; budget caps can't be checked until it's back."

test('band: unreadable usage shows — for cost and context until it reads again, and toasts once', async ($, on) => {
  await session($, on)
  await turn($, 0.42)
  usageFails = true
  await turn($, 0.5)
  const row = await rowText($, 160)
  expect(row).toContain('$ —')
  expect(row).toContain('◔ —')
  expect(row).not.toContain('0.42')
  expect(row).not.toContain('63%')
  expect(await rowText($, 160, 'desktop')).toContain('— session')
  await turn($, 0.6)
  expect(toasts).toEqual([COST_TOAST])
  usageFails = false
  await turn($, 0.7)
  const back = await rowText($, 160)
  expect(back).toContain('0.70 session')
  expect(back).toContain('63%')
  // A later failure in the same session does not toast again.
  usageFails = true
  await turn($, 0.8)
  expect(await rowText($, 160)).toContain('$ —')
  expect(toasts).toEqual([COST_TOAST])
})

test('band: a turn ends with its own result even when every state write fails', async ($, on) => {
  await session($, on, MAIN, { refusable: true })
  await turn($, 0.1)
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't2' })
  stateRefused = true
  const done = await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(done).toEqual({ text: '' })
})

const WARM = (read: number) => ({ isAnswered: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: read, cache_creation_input_tokens: 0 } })

test('band: an answered keep-warm restarts the countdown', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  expect(await rowText($, 160)).toContain('10:00')
  fork = WARM(1000)
  await $.command.run({ command: 'glitch-hud', args: 'warm' } as never)
  const row = await rowText($, 160)
  expect(row).toContain('60:00')
  expect(row).not.toContain('10:00')
})

test('band: a failed or empty keep-warm leaves the countdown', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  fork = 'reject'
  await $.command.run({ command: 'glitch-hud', args: 'warm' } as never)
  expect(await rowText($, 160)).toContain('10:00')
  fork = { isAnswered: false, reason: 'nothing-to-fork' }
  await $.command.run({ command: 'glitch-hud', args: 'warm' } as never)
  expect(await rowText($, 160)).toContain('10:00')
})

const petSprite = { source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="20"></svg>', alt: 'Bud the dog, idle', width: 24, height: 20 }

const withPet = (on: On, value: unknown) =>
  on('state.get', (_$, e, next) => ((e.plugin as string) === 'glitch-pets' && (e as { key?: string }).key === 'sprite' ? ({ value: { value, version: 1 } } as never) : next(e)))

test('desktop draws the pet before the controls', async ($, on) => {
  withPet(on, petSprite)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(s => s.props.alt === 'Bud the dog, idle')).toBe(true)
  expect(await ui.find({ key: 'glitch-pet' })).toBeTruthy()
  await ui.unmount()
})

// ui.findAll returns elements in tree order: the keyed ones read as the row, left to right.
const keyOrder = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(160) })
  const keys = (await ui.findAll({})).map(x => x.key).filter((k): k is string => k !== undefined)
  await ui.unmount()
  return keys
}

test('desktop row: cost, cache with its keep-warm, context, then pet and ✕', async ($, on) => {
  withPet(on, petSprite)
  await session($, on)
  await turn($, 0.1)
  const keys = (await keyOrder($, 'desktop')).filter(k => ['speed', 'cost', 'cache', 'context', 'glitch-warm', 'glitch-pet', 'glitch-hide'].includes(k))
  expect(keys).toEqual(['cost', 'cache', 'glitch-warm', 'context', 'glitch-pet', 'glitch-hide'])
  // Pet and ✕ are siblings under the row's one columnGap: equal space either side of the pet.
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const pet = await ui.find({ key: 'glitch-pet' })
  expect(pet?.props.paddingX).toBeUndefined()
  expect(pet?.props.marginX).toBeUndefined()
  await ui.unmount()
})

test('desktop row without a pet: no pet, ✕ last', async ($, on) => {
  withPet(on, null)
  await session($, on)
  await turn($, 0.1)
  const keys = await keyOrder($, 'desktop')
  expect(keys).not.toContain('glitch-pet')
  expect(keys[keys.length - 1]).toBe('glitch-hide')
  const order = keys.filter(k => ['cache', 'context', 'glitch-warm'].includes(k))
  expect(order).toEqual(['cache', 'glitch-warm', 'context'])
})

test('terminal row: keep-warm right after the cache part, before context', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  const keys = (await keyOrder($, 'terminal')).filter(k => ['cost', 'cache', 'context', 'glitch-warm', 'glitch-hide'].includes(k))
  expect(keys).toEqual(['cost', 'cache', 'glitch-warm', 'context', 'glitch-hide'])
  expect(await rowText($, 160)).toContain('⧗ 60:00')
})

test('terminal never draws the pet', async ($, on) => {
  withPet(on, petSprite)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'terminal', ...BAND(160) })
  expect(await ui.find({ key: 'glitch-pet' })).toBeFalsy()
  await ui.unmount()
})

test('band without a sprite is unchanged', async ($, on) => {
  withPet(on, null)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  expect(await ui.find({ key: 'glitch-pet' })).toBeFalsy()
  await ui.unmount()
})

test('a malformed sprite draws no pet', async ($, on) => {
  withPet(on, { source: 5 })
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  expect(await ui.find({ key: 'glitch-pet' })).toBeFalsy()
  await ui.unmount()
})

test('fit reserves the pet: at a tight width git and speed drop before the pet goes', async ($, on) => {
  withPet(on, petSprite)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(60) })
  expect(await ui.find({ key: 'glitch-pet' })).toBeTruthy()
  const row = (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
  expect(row).not.toContain('tok/s')
  await ui.unmount()
})

test('tok/s under auto: shown in the terminal, left out on the desktop', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  // No answer timed yet: the terminal shows the bolt and a dash.
  expect(await rowText($, 160)).toContain('⚡')
  expect(await rowText($, 160, 'desktop')).not.toContain('tok/s')
})

test('tok/s under auto shows on the desktop once Parts names it', { options: { parts: 'speed,cost,cache' } }, async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  expect(await rowText($, 160, 'desktop')).toContain('tok/s')
})

test('showSpeed on shows tok/s on the desktop, off hides it in the terminal', { options: { showSpeed: 'on' } }, async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  expect(await rowText($, 160, 'desktop')).toContain('tok/s')
  await $.command.run({ command: 'glitch-hud', args: 'hud speed off' } as never)
  expect(await rowText($, 160)).not.toContain('⚡')
  await $.command.run({ command: 'glitch-hud', args: 'hud speed auto' } as never)
  expect(await rowText($, 160)).toContain('⚡')
  expect(await rowText($, 160, 'desktop')).not.toContain('tok/s')
})

test('/glitch hud speed is kept for the next session; auto clears it', async ($, on) => {
  const store: Record<string, unknown> = {}
  await session($, on, MAIN, { store })
  expect((await $.command.run({ command: 'glitch-hud', args: 'hud speed on' } as never)) as unknown).toEqual({ text: 'tok/s: on.' })
  expect(store.speed).toBe('on')
  await $.session.start({ source: 'resume', cwd: 'C:\repo', surface: 'desktop', isInteractive: true } as never)
  await turn($, 0.1)
  expect(await rowText($, 160, 'desktop')).toContain('tok/s')
  await $.command.run({ command: 'glitch-hud', args: 'hud speed auto' } as never)
  expect('speed' in store).toBe(false)
  expect((await $.command.run({ command: 'glitch-hud', args: 'hud speed fast' } as never)) as unknown).toEqual({ text: 'Usage: /glitch hud speed auto | on | off' })
})

// The test's `$` has no `$.state`: the plugin's writes of `poke` are watched instead.
const pokes = (on: On) => {
  const seen: unknown[] = []
  on('state.set', (_$, e, next) => {
    const w = e as { key?: string; value?: unknown }
    if (w.key === 'poke') seen.push(w.value)
    return next(e)
  })
  return seen
}

test('a press on the pet records the time for glitch-pets', async ($, on) => {
  withPet(on, petSprite)
  const seen = pokes(on)
  const clock = await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  const target = await ui.find({ key: 'glitch-pet-target' })
  // Laid over the pet, so the row keeps its size.
  expect(target?.props.position).toBe('absolute')
  expect(await ui.find({ key: 'glitch-pet-poke' })).toBeTruthy()
  await clock.advance(5000)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'glitch-pet-poke' })
  await ui.unmount()
  expect(seen).toEqual([{ at: Date.parse('2026-10-12T10:00:00Z') + 5000 }])
})

test('a right click or a hover on the pet is no press', async ($, on) => {
  withPet(on, petSprite)
  const seen = pokes(on)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: 'glitch-pet-poke' })
  await ui.pointer({ type: 'enter', x: 1, y: 0, in: 'glitch-pet-poke' })
  await ui.unmount()
  expect(seen).toEqual([])
})

test('no pet, no press target', async ($, on) => {
  withPet(on, null)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  expect(await ui.find({ key: 'glitch-pet-poke' })).toBeFalsy()
  await ui.unmount()
})

// ---- The crew pill (#38): glitch-pets publishes crewSummary; the band shows it on rich surfaces. ----

const crewSummary = { running: 2, done: 2, failed: 0, cost: 0.31, elapsedMs: 72_000 }
const PILL = 'Crew · 2 at work · 2 done · ≈$0.31 · 1:12'

// One state.get hook per test: glitch-pets' keys from `pets`, read at each call.
const withPets = (on: On, pets: Record<string, unknown>) =>
  on('state.get', (_$, e, next) => {
    const key = (e as { key?: string }).key ?? ''
    return (e.plugin as string) === 'glitch-pets' && key in pets ? ({ value: { value: pets[key], version: 1 } } as never) : next(e)
  })
const withCrew = (on: On, value: unknown) => withPets(on, { crewSummary: value })

test('the band shows the crew pill on the desktop while a crew is open or recent, not in the terminal', async ($, on) => {
  withCrew(on, crewSummary)
  await session($, on)
  await turn($, 0.1)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(160) })
    const pill = await ui.find({ key: 'glitch-crew' })
    if (surface === 'desktop') {
      expect(pill?.type).toBe('Button')
      expect(pill?.text).toBe(PILL)
    } else expect(pill).toBeFalsy()
    await ui.unmount()
  }
})

test('no crew summary (or a malformed one), no pill', async ($, on) => {
  const pets: Record<string, unknown> = { crewSummary: null }
  withPets(on, pets)
  await session($, on)
  await turn($, 0.1)
  for (const v of [null, { running: 'two' }]) {
    pets.crewSummary = v
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(160) })
      expect(await ui.find({ key: 'glitch-crew' })).toBeFalsy()
      await ui.unmount()
    }
  }
})

test('the crew pill sits before the pet and ✕', async ($, on) => {
  withPets(on, { crewSummary, sprite: petSprite })
  await session($, on)
  await turn($, 0.1)
  for (const surface of ['terminal', 'desktop'] as const) {
    const keys = (await keyOrder($, surface)).filter(k => ['context', 'glitch-crew', 'glitch-pet', 'glitch-hide'].includes(k))
    expect(keys).toEqual(surface === 'desktop' ? ['context', 'glitch-crew', 'glitch-pet', 'glitch-hide'] : ['context', 'glitch-hide'])
  }
})

test('fit reserves the crew pill: at a tight width parts drop before the pill goes', { options: { showSpeed: 'on' } }, async ($, on) => {
  const pets: Record<string, unknown> = { crewSummary: null, sprite: petSprite }
  withPets(on, pets)
  await session($, on)
  await turn($, 0.1)
  const partsAt = async (surface: 'terminal' | 'desktop', columns: number) => {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(columns) })
    const keys = (await ui.findAll({})).map(x => String(x.key))
    await ui.unmount()
    return { hasSpeed: keys.includes('speed'), hasPill: keys.includes('glitch-crew') }
  }
  for (const surface of ['terminal', 'desktop'] as const) {
    let gaveWay = false
    for (let columns = 80; columns <= 200; columns += 10) {
      pets.crewSummary = null
      const without = await partsAt(surface, columns)
      pets.crewSummary = crewSummary
      const withPill = await partsAt(surface, columns)
      expect(withPill.hasPill).toBe(surface === 'desktop')
      if (surface === 'terminal') expect(withPill.hasSpeed).toBe(without.hasSpeed)
      else if (without.hasSpeed && !withPill.hasSpeed) gaveWay = true
    }
    // The pill's cells are reserved: at some width tok/s gave way for it.
    expect(gaveWay).toBe(surface === 'desktop')
  }
})

test('a press on the crew pill is taken quietly (glitch-pets opens its pane)', async ($, on) => {
  withCrew(on, crewSummary)
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'desktop', ...BAND(160) })
  expect(await ui.press({ key: 'glitch-crew' })).toEqual({ element: 'glitch-crew' })
  expect(toasts).toEqual([])
  await ui.unmount()
})

test('the crew pill names failed crew members', async ($, on) => {
  withCrew(on, { running: 1, done: 2, failed: 1, cost: 0.4, elapsedMs: 65_000 })
  await session($, on)
  await turn($, 0.1)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'glitch-hud', surface, ...BAND(200) })
    const pill = await ui.find({ key: 'glitch-crew' })
    if (surface === 'desktop') expect(pill?.text).toBe('Crew · 1 at work · 2 done · 1 failed · ≈$0.40 · 1:05')
    else expect(pill).toBeFalsy()
    await ui.unmount()
  }
})
