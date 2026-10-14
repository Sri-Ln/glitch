import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { INITIAL_BUDGET } from './atoms'
import { budgetAlerts, budgetSummary, kTokens, parseBudgetArg, splitArgs, warmMessage } from './commands'

let usd = 0
let toasts: string[] = []
let store: Record<string, unknown> = {}
let fork: unknown = { isAnswered: false, reason: 'nothing-to-fork' }
let sessionId = 's1'

// Every answer sits beneath the plugin and is registered before the first `$` call.
// `at` is what the session already cost and what the store already holds.
const start = async ($: Engine, on: On, at: { usd?: number; store?: Record<string, unknown> } = {}) => {
  usd = at.usd ?? 0
  toasts = []
  store = { ...(at.store ?? {}) }
  sessionId = 's1'
  fork = { isAnswered: false, reason: 'nothing-to-fork' }
  const clock = mock.clock(on, { now: new Date(2026, 9, 12, 10).getTime() })
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
  mock.env(on, {})
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, percent: 10 }, rateLimits: [], cost: { usd } } }) as never)
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '' } }) as never)
  on('session.cwd', () => ({ value: 'C:\\repo' }) as never)
  on('session.id', () => ({ value: sessionId }) as never)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }) as never)
  on('model.fork', () => {
    if (fork === 'reject') throw new Error('fork refused')
    return { value: fork } as never
  })
  on('command.register', () => ({ value: { command: 'glitch-hud' } }) as never)
  on('turn.start', () => ({ turnId: 't' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.start', async () => ({ cwd: 'C:\\repo' }) as never)
  on('command.run', { command: 'glitch' }, () => ({ text: 'core' }) as never)
  on('tool.call', { tool: 'Agent' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'terminal', isInteractive: true } as never)
  return clock
}
const turn = async ($: Engine, cost: number) => {
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  usd = cost
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't', reason: 'answer' })
}
const run = async ($: Engine, args: string, command = 'glitch-hud') => (await $.command.run({ command, args } as never)).text ?? ''
const agent = ($: Engine) => $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', subagent_type: 'general-purpose' } as never)

test('hud: toggles the band and sets parts', async ($, on) => {
  await start($, on)
  expect(await run($, 'hud')).toBe('Glitch HUD hidden.')
  expect(await run($, 'hud')).toBe('Glitch HUD shown.')
  expect(await run($, 'hud parts cost,cache')).toBe('HUD parts: cost, cache.')
  expect(await run($, 'hud parts cost,bogus')).toBe('Unknown part. Parts: turn, speed, cost, cache, context, git.')
  expect(await run($, 'hud cost today,session')).toBe('HUD cost: today, session.')
  expect(await run($, 'hud cost month')).toBe('Unknown cost figure. Figures: reply, session, today.')
})

test('budget: show, raise, set, off and on', { options: { budgetSession: 5 } }, async ($, on) => {
  await start($, on)
  await turn($, 1)
  expect(await run($, 'budget')).toBe('Session $1.00 / $5.00 (20%) · Today $1.00 / off')
  expect(await run($, 'budget +2')).toBe('Session cap: $7.00.')
  expect(await run($, 'budget 3')).toBe('Session cap: $3.00.')
  expect(await run($, 'budget off')).toBe('Budget caps off for this session.')
  expect(await run($, 'budget on')).toBe('Budget caps on.')
  expect(await run($, 'budget x')).toBe('Usage: /glitch budget [+N | N | off | on]')
})

test('budget: a cap set with /glitch budget survives a reload', { options: { budgetSession: 5 } }, async ($, on) => {
  await start($, on)
  await turn($, 1)
  await run($, 'budget +2')
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'terminal', isInteractive: true } as never)
  expect(await run($, 'budget')).toBe('Session $1.00 / $7.00 (14%) · Today $1.00 / off')
})

test('budget: a reload without an override keeps the settings cap', { options: { budgetSession: 5 } }, async ($, on) => {
  await start($, on)
  await turn($, 1)
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'terminal', isInteractive: true } as never)
  expect(await run($, 'budget')).toBe('Session $1.00 / $5.00 (20%) · Today $1.00 / off')
})

test('budget: subagents are refused at the cap when asked to', { options: { budgetSession: 1, budgetBlocksAgents: true } }, async ($, on) => {
  await start($, on)
  await turn($, 1.5)
  expect(await agent($)).toMatchObject({ deny: 'Glitch budget cap $1.00 reached (session). Ask the user to raise it with /glitch budget +N.' })
})

test('budget: subagents run when blocking is off', { options: { budgetSession: 1 } }, async ($, on) => {
  await start($, on)
  await turn($, 1.5)
  expect(await agent($)).toMatchObject({ result: 'ran' })
})

test('budget: a raised cap lets subagents run again', { options: { budgetSession: 1, budgetBlocksAgents: true } }, async ($, on) => {
  await start($, on)
  await turn($, 1.5)
  await run($, 'budget +5')
  expect(await agent($)).toMatchObject({ result: 'ran' })
})

test('budget: crossing 90% toasts once', { options: { budgetSession: 10 } }, async ($, on) => {
  await start($, on)
  await turn($, 9.2)
  await turn($, 9.4)
  expect(toasts.filter(t => t.includes('90%'))).toEqual(['Glitch: session spend $9.20 is past 90% of $10.00'])
})

test('budget: reaching the cap toasts', { options: { budgetSession: 10 } }, async ($, on) => {
  await start($, on)
  await turn($, 10.5)
  expect(toasts).toContain('Glitch: session spend $10.50 reached the $10.00 cap')
})

test('budget: the daily ledger keeps one store key per day and session', { options: { budgetDaily: 10 } }, async ($, on) => {
  await start($, on)
  await turn($, 2)
  expect(store).toEqual({ 'ledger:2026-10-12:s1': 2 })
})

test('budget: two sessions on one store both count today', { options: { budgetDaily: 10 } }, async ($, on) => {
  // Another Claude Code process already wrote its own key today.
  await start($, on, { store: { 'ledger:2026-10-12:other': 3 } })
  await turn($, 2)
  expect(store['ledger:2026-10-12:other']).toBe(3)
  expect(store['ledger:2026-10-12:s1']).toBe(2)
  expect(await run($, 'budget')).toBe('Session $2.00 / off · Today $5.00 / $10.00 (50%)')
})

test('budget: a /clear under a new session id does not count twice', { options: { budgetDaily: 11 } }, async ($, on) => {
  await start($, on)
  await turn($, 2)
  // The process goes on under a new id; its cost starts over.
  sessionId = 's2'
  await turn($, 0.5)
  await turn($, 0.75)
  expect(store).toEqual({ 'ledger:2026-10-12:s1': 2, 'ledger:2026-10-12:s2': 0.75 })
  expect(await run($, 'budget')).toBe('Session $0.75 / off · Today $2.75 / $11.00 (25%)')
})

test('budget: a new session id whose total goes on is not counted twice', { options: { budgetDaily: 10 } }, async ($, on) => {
  await start($, on)
  await turn($, 2)
  sessionId = 's2'
  await turn($, 2.5)
  await turn($, 3)
  expect(store).toEqual({ 'ledger:2026-10-12:s1': 2, 'ledger:2026-10-12:s2': 0.5 })
})

test('budget: session.end on /clear records the spend so far', { options: { budgetDaily: 10 } }, async ($, on) => {
  await start($, on)
  await turn($, 2)
  usd = 2.25
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  expect(store['ledger:2026-10-12:s1']).toBe(2.25)
})

test('budget: a resumed session adds to its key from an earlier run today', { options: { budgetDaily: 4 } }, async ($, on) => {
  // The earlier run spent $1 today; the resumed session's total starts at that $1.
  await start($, on, { usd: 1, store: { 'ledger:2026-10-12:s1': 1 } })
  await turn($, 1.5)
  await turn($, 1.75)
  expect(store['ledger:2026-10-12:s1']).toBe(1.75)
  expect(await run($, 'budget')).toBe('Session $1.75 / off · Today $1.75 / $4.00 (44%)')
})

test('budget: ledger keys older than 7 days are pruned', { options: { budgetDaily: 10 } }, async ($, on) => {
  await start($, on, { store: { 'ledger:2026-10-05:old': 9, 'ledger:2026-10-06:kept': 4, theme: 'neon' } })
  await turn($, 1)
  expect(store).toEqual({ 'ledger:2026-10-06:kept': 4, theme: 'neon', 'ledger:2026-10-12:s1': 1 })
  expect(await run($, 'budget')).toBe('Session $1.00 / off · Today $1.00 / $10.00 (10%)')
})

test('warm: refuses while a turn runs', async ($, on) => {
  await start($, on)
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'hi', turnId: 't' })
  expect(await run($, 'warm')).toBe('Claude is working, so the cache is warm already.')
})

test('warm: a fork that read the cache resets the deadline', async ($, on) => {
  const clock = await start($, on)
  await turn($, 0.1)
  await clock.advance(50 * 60_000)
  fork = { isAnswered: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 } }
  expect(await run($, 'warm')).toBe('Cache kept warm (200k tokens read from cache). Next expiry in 60:00.')
})

test('warm: the next expiry follows the cache lifetime setting', { options: { cacheTtlMinutes: '5', cacheWarnMinutes: '2' } }, async ($, on) => {
  await start($, on)
  await turn($, 0.1)
  fork = { isAnswered: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } }
  expect(await run($, 'warm')).toBe('Cache kept warm (1k tokens read from cache). Next expiry in 05:00.')
})

test('warm: an expired cache is said to be re-written', async ($, on) => {
  await start($, on)
  await turn($, 0.1)
  fork = { isAnswered: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 180_000 } }
  expect(await run($, 'warm')).toBe('The cache had expired; the ping wrote it again (180k tokens). Next expiry in 60:00.')
})

test('warm: a refused fork says so and keeps the countdown', async ($, on) => {
  await start($, on)
  await turn($, 0.1)
  fork = 'reject'
  expect(await run($, 'warm')).toBe('Keep-warm failed (request refused); the countdown is unchanged.')
})

test('warm: nothing to fork changes nothing', async ($, on) => {
  await start($, on)
  expect(await run($, 'warm')).toBe('Nothing to keep warm yet: no answer in this session.')
})

test('auto-warm: the last mark pings once when idle time allows', { options: { autoWarm: true, notify: 'off' } }, async ($, on) => {
  on('prompt.submit', () => ({ text: 'hi' }) as never)
  const clock = await start($, on)
  await ($.prompt.submit as unknown as (e: unknown) => Promise<unknown>)({ text: 'hi', origin: { kind: 'composer' }, turnId: 't' })
  await turn($, 0.1)
  fork = { isAnswered: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 200_000, cache_creation_input_tokens: 0 } }
  await clock.advance(55 * 60_000)
  expect(toasts).toEqual(['Glitch: Cache kept warm (200k tokens read from cache). Next expiry in 60:00.'])
})

test('demo: cache and budget previews', async ($, on) => {
  await start($, on)
  await turn($, 0.1)
  expect(await run($, 'demo cache 4')).toBe('Cache demo: 4 min left until the next answer resets it.')
  expect(await run($, 'demo budget 95')).toBe('Budget demo: 95% until the next answer.')
  expect(await run($, 'demo')).toBe('Usage: /glitch demo cache <minutes> | demo budget <percent>')
})

test('unknown subcommand shows usage', async ($, on) => {
  await start($, on)
  expect(await run($, 'dance')).toBe('Glitch HUD: /glitch hud [parts <list> | cost <list>] · budget [+N|N|off|on] · warm · demo cache <min> | demo budget <pct>')
})

test('/glitch: routed subcommands are answered here, others go on', { options: { budgetSession: 5 } }, async ($, on) => {
  await start($, on)
  await turn($, 1)
  expect(await run($, 'budget', 'glitch')).toBe(await run($, 'budget'))
  expect(await run($, 'hud', 'glitch')).toBe('Glitch HUD hidden.')
  expect(await run($, 'theme', 'glitch')).toBe('core')
  expect(await run($, '', 'glitch')).toBe('core')
})

test('helpers: argument and message texts', () => {
  expect(splitArgs('  budget   +2 ')).toEqual(['budget', '+2'])
  expect(parseBudgetArg('+2.5')).toEqual({ kind: 'add', n: 2.5 })
  expect(parseBudgetArg('3')).toEqual({ kind: 'set', n: 3 })
  expect(parseBudgetArg('off')).toEqual({ kind: 'off' })
  expect(parseBudgetArg('-1')).toBeNull()
  expect(kTokens(999)).toBe('999')
  expect(kTokens(1500)).toBe('2k')
  expect(budgetSummary({ ...INITIAL_BUDGET, isOff: true }, 1)).toBe('Budget caps are off for this session (/glitch budget on).')
  expect(warmMessage({ isAnswered: false, reason: 'api-error' }, 3600)).toBe('Keep-warm failed (api-error); the countdown is unchanged.')
})

test('helpers: alerts fire on a rise only, 100% also notifies', () => {
  const spend = { session: 9.5, daily: 0, sessionCap: 10, dailyCap: 0 }
  const first = budgetAlerts({ session: 'ok', daily: 'ok' }, spend)
  expect(first.notified.session).toBe('alert')
  expect(first.toasts).toHaveLength(1)
  expect(first.notice).toBeNull()
  expect(budgetAlerts(first.notified, spend).toasts).toEqual([])
  const over = budgetAlerts(first.notified, { ...spend, session: 10 })
  expect(over.toasts[0]?.text).toBe('Glitch: session spend $10.00 reached the $10.00 cap')
  expect(over.notice).toBe('Budget cap reached: session spend $10.00 of $10.00')
})
