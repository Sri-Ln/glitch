import { expect, test } from 'claude-code/testing'

import type { Budget } from '../types'
import { blockReason, costLevel, crossed, dayKey, isExpired, ledgerKey, levelOf, parseLedgerKey, rebase, spendToday, todaySpent, usd, withConfigCaps, worse } from './budget'

const B = (over: Partial<Budget> = {}): Budget => ({
  sessionCap: 0, dailyCap: 0, isOff: false, day: '2026-10-12', dayBase: 0, dailySpent: 0,
  notified: { session: 'ok', daily: 'ok' }, demoPercent: null,
  sessionId: 's1', lastTotal: 0, ledgerKey: '', priorForKey: 0, sessionCapOverridden: false, ...over,
})
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

test('budget: levels at 75, 90 and 100 percent', async () => {
  expect(levelOf(1, 0)).toBe('ok')
  expect(levelOf(7.49, 10)).toBe('ok')
  expect(levelOf(7.5, 10)).toBe('warn')
  expect(levelOf(9, 10)).toBe('alert')
  expect(levelOf(10, 10)).toBe('over')
  expect(worse('warn', 'alert')).toBe('alert')
})

test('budget: cost level is the worse cap, demo wins, off is ok', async () => {
  expect(costLevel(B({ sessionCap: 10, dailyCap: 10, dailySpent: 9.5 }), 1)).toBe('alert')
  expect(costLevel(B({ sessionCap: 10, demoPercent: 80 }), 0)).toBe('warn')
  expect(costLevel(B({ sessionCap: 1, isOff: true }), 5)).toBe('ok')
})

test('budget: cost level follows the daily cap alone when the session cap is off', async () => {
  expect(costLevel(B({ sessionCap: 0, dailyCap: 10, dailySpent: 10 }), 50)).toBe('over')
  expect(costLevel(B({ sessionCap: 0, dailyCap: 10, dailySpent: 8 }), 50)).toBe('warn')
  expect(costLevel(B({ sessionCap: 0, dailyCap: 0, dailySpent: 99 }), 50)).toBe('ok')
})

// The demo only paints the band: it never refuses a subagent, nor lets one through a cap.
test('budget: block reason ignores the demo percent', async () => {
  expect(blockReason(B({ sessionCap: 5, demoPercent: 100 }), 1)).toBeNull()
  expect(blockReason(B({ demoPercent: 100 }), 1)).toBeNull()
  expect(blockReason(B({ sessionCap: 5, demoPercent: 0 }), 5)).toBe('Glitch budget cap $5.00 reached (session). Ask the user to raise it with /glitch budget +N.')
})

test('budget: day keys are local dates', async () => {
  expect(dayKey(at(2026, 10, 12))).toBe('2026-10-12')
  expect(dayKey(at(2026, 1, 5, 0))).toBe('2026-01-05')
})

test('budget: ledger keys hold a day and a session id', async () => {
  expect(ledgerKey('2026-10-12', 'ab-12')).toBe('ledger:2026-10-12:ab-12')
  expect(parseLedgerKey('ledger:2026-10-12:ab-12')).toEqual({ day: '2026-10-12', sessionId: 'ab-12' })
  expect(parseLedgerKey('ledger')).toBeNull()
  expect(parseLedgerKey('theme')).toBeNull()
  expect(parseLedgerKey('ledger:2026-10-12:')).toBeNull()
})

test('budget: ledger days older than 7 local days expire', async () => {
  expect(isExpired('2026-10-06', at(2026, 10, 12))).toBe(false)
  expect(isExpired('2026-10-05', at(2026, 10, 12))).toBe(true)
  expect(isExpired('2026-10-12', at(2026, 10, 12, 0))).toBe(false)
  // Calendar days, not 24-hour steps, across a month end.
  expect(isExpired('2026-02-25', at(2026, 3, 3, 0))).toBe(false)
  expect(isExpired('2026-02-24', at(2026, 3, 3, 23))).toBe(true)
})

test('budget: a new session id re-bases today at the total, or at 0 when the total started over', async () => {
  expect(rebase(B({ sessionId: 's1', dayBase: 1 }), 's1', 5)).toMatchObject({ sessionId: 's1', dayBase: 1 })
  expect(rebase(B({ sessionId: '', dayBase: 1 }), 's1', 5)).toMatchObject({ sessionId: 's1', dayBase: 1 })
  expect(rebase(B({ sessionId: 's1', dayBase: 1, lastTotal: 4 }), 's2', 5)).toMatchObject({ sessionId: 's2', dayBase: 5 })
  expect(rebase(B({ sessionId: 's1', dayBase: 1, lastTotal: 4 }), 's2', 0.5)).toMatchObject({ sessionId: 's2', dayBase: 0 })
})

test('budget: crossing midnight starts today at the session total', async () => {
  const b = B({ day: '2026-10-11', dayBase: 0 })
  expect(spendToday(b, 4, at(2026, 10, 11, 23))).toEqual({ day: '2026-10-11', dayBase: 0, spent: 4 })
  expect(spendToday(b, 4, at(2026, 10, 12, 0))).toEqual({ day: '2026-10-12', dayBase: 4, spent: 0 })
})

test('budget: block reason names the cap that was reached', async () => {
  expect(blockReason(B({ sessionCap: 5 }), 4.99)).toBeNull()
  expect(blockReason(B({ sessionCap: 5 }), 5)).toBe('Glitch budget cap $5.00 reached (session). Ask the user to raise it with /glitch budget +N.')
  expect(blockReason(B({ dailyCap: 10, dailySpent: 10 }), 0)).toBe('Glitch budget cap $10.00 reached (daily). Ask the user to run /glitch budget off for this session, or raise budgetDaily in /config.')
  expect(blockReason(B({ sessionCap: 5, isOff: true }), 50)).toBeNull()
})

test('budget: settings caps apply unless /glitch budget set the session cap', async () => {
  const caps = { budgetSession: 8, budgetDaily: 20 }
  expect(withConfigCaps(B({ sessionCap: 5, dailyCap: 10 }), caps, 1)).toMatchObject({ sessionCap: 8, dailyCap: 20 })
  expect(withConfigCaps(B({ sessionCap: 7, dailyCap: 10, sessionCapOverridden: true }), caps, 1)).toMatchObject({ sessionCap: 7, dailyCap: 20 })
  // A changed cap starts its warnings from where the spend stands now.
  const moved = withConfigCaps(B({ sessionCap: 5, dailyCap: 10, dailySpent: 19, notified: { session: 'over', daily: 'over' } }), caps, 6.5)
  expect(moved.notified).toEqual({ session: 'warn', daily: 'alert' })
  const same = withConfigCaps(B({ sessionCap: 8, dailyCap: 20, notified: { session: 'ok', daily: 'ok' } }), caps, 7.5)
  expect(same.notified).toEqual({ session: 'ok', daily: 'ok' })
})

test('budget: crossed reports only a rise', async () => {
  expect(crossed('ok', 'warn')).toBe('warn')
  expect(crossed('alert', 'alert')).toBeNull()
  expect(crossed('over', 'warn')).toBeNull()
  expect(usd(3)).toBe('$3.00')
})

// The ledger is summed when a turn ends; between, this session's new spend is added on.
test('budget: today is the ledger sum plus what this session spent since it was taken', async () => {
  expect(usd(todaySpent(B({ dailySpent: 20, lastTotal: 3 }), 3.4))).toBe('$20.40')
  expect(todaySpent(B({ dailySpent: 20, lastTotal: 3 }), 3)).toBe(20)
  // A /clear starts the total over: nothing is taken off.
  expect(todaySpent(B({ dailySpent: 20, lastTotal: 3 }), 0.1)).toBe(20)
})
