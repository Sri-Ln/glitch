import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = (bodyColumns: number) =>
  ({ component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns, scroll: { offset: 0, bodyRows: 4 }, view: {} } as never }) as const

let usd = 0
const session = async ($: Engine, on: On, gitOut: string | null = '# branch.oid abc\n# branch.head main\n') => {
  usd = 0
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T10:00:00Z') })
  mock.store(on)
  mock.env(on, { OS: 'Windows_NT' })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, tokens: 630_000, percent: 63 }, rateLimits: [], cost: { usd } } }) as never)
  on('process.run', () => ({ value: gitOut === null ? { exitCode: 128, stdout: '', stderr: '' } : { exitCode: 0, stdout: gitOut, stderr: '' } }) as never)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  // Nothing beneath the plugin draws: an empty box, so a stepped-aside band has no text.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band (${surface}): shows turn, cost, cache, context and git after a turn`, async ($, on) => {
    await session($, on)
    await turn($, 0.42)
    const row = await rowText($, 160, surface)
    expect(row).toContain('#1')
    expect(row).toContain('$0.42')
    expect(row).toContain('60:00')
    expect(row).toContain('63%')
    expect(row).toContain('main')
  })
}

test('band: the countdown ticks and pauses while busy', async ($, on) => {
  const clock = await session($, on)
  await turn($, 0.1)
  await clock.advance(61_000)
  expect(await rowText($, 160)).toContain('58:59')
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'again', turnId: 't2' })
  expect(await rowText($, 160)).not.toContain('58:')
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

test('band: × hides it for the session', async ($, on) => {
  await session($, on)
  await turn($, 0.1)
  const ui = await $.ui.mount({ plugin: 'glitch-hud', surface: 'terminal', ...BAND(160) })
  await ui.press({ key: 'glitch-hide' })
  await ui.unmount()
  expect(await rowText($, 160)).toBe('')
})
