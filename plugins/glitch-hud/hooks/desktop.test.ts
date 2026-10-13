import { expect, test } from 'claude-code/testing'

import type { Budget, CacheState, Stats } from '../types'
import { FALLBACK_THEME as T } from './theme'
import { BAR_CELLS, ICON_CELLS, barSvg, iconSvg, richPart, richWidth, safeColor } from './desktop'
import type { PartData } from './parts'

const stats: Stats = { turn: 12, speed: 84, turnCost: 0.42, total: 3.1, context: 63, costAtStart: 2.68 }
const cache: CacheState = { expiresAt: 0, secondsLeft: 47 * 60 + 12, warnedMark: 0, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false }
const budget: Budget = { sessionCap: 0, dailyCap: 0, isOff: false, day: '2026-10-12', dayBase: 0, dailySpent: 0, notified: { session: 'ok', daily: 'ok' }, demoPercent: null, sessionId: 's1', lastTotal: 0, ledgerKey: '', priorForKey: 0, sessionCapOverridden: false }
const D: PartData = { stats, cache, budget, git: { branch: 'main', changed: 4, ahead: 1, behind: 0 }, theme: T, isWorking: false }
const text = (id: Parameters<typeof richPart>[0], d: PartData = D, compact = false) => richPart(id, d, compact).segments.map(s => s.text).join('')

test('desktop: values are worded, not bare symbols', async () => {
  expect(text('turn')).toBe('Turn 12')
  expect(text('speed')).toBe('84 tok/s')
  expect(text('cost')).toBe('$0.42 turn · $3.10 session')
  expect(text('cache')).toBe('47:12 left')
  expect(text('context')).toBe('63% context')
  expect(text('git')).toBe('main ±4 ↑1')
})

test('desktop: one cost while the turn equals the session (the first turn), and before any turn', async () => {
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.1 } })).toBe('$3.10 session')
  expect(text('cost', { ...D, stats: { ...stats, turnCost: null } })).toBe('$3.10 session')
})

test('desktop: cache placeholders', async () => {
  expect(text('cache', { ...D, isWorking: true })).toBe('…')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: 0 } })).toBe('expired')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: null } })).toBe('—')
})

test('desktop: icons are fixed-size images in the level color, described by alt', async () => {
  const cost = richPart('cost', { ...D, budget: { ...budget, sessionCap: 3 } }, false).graphic
  expect(cost?.source).toContain(T.alert)
  expect(cost?.alt).toBe('This turn $0.42 · Session $3.10 · Session cap $3.00')
  expect(cost).toMatchObject({ width: 14, height: 14 })
  expect(richPart('cache', D, false).graphic?.alt).toBe('Prompt cache countdown. Press ↻ to keep it warm.')
  expect(richPart('turn', D, false).graphic).toBeNull()
})

// A source that changed each second made the desktop redraw (blink) every icon.
test('desktop: the markup does not change as the countdown ticks', async () => {
  const at = (secondsLeft: number) => richPart('cache', { ...D, cache: { ...cache, secondsLeft } }, false).graphic
  expect(at(47 * 60 + 12)).toEqual(at(47 * 60 + 11))
  expect(at(47 * 60 + 12)?.source).not.toContain('<title>')
  expect(richPart('context', D, false).graphic?.source).not.toContain('<title>')
})

test('desktop: a session cap shows beside the cost', async () => {
  expect(text('cost', { ...D, budget: { ...budget, sessionCap: 5 } })).toBe('$0.42 turn · $3.10 of $5.00 session')
  expect(text('cost', { ...D, budget: { ...budget, sessionCap: 5, isOff: true } })).toBe('$0.42 turn · $3.10 session')
})

test('desktop: the daily cap shows in the cost tooltip; an off budget shows no caps', async () => {
  const daily = { ...D, budget: { ...budget, dailyCap: 10, dailySpent: 4.5 } }
  expect(richPart('cost', daily, false).graphic?.alt).toBe('This turn $0.42 · Session $3.10 · Today $4.50 of $10.00')
  expect(richPart('cost', { ...daily, budget: { ...daily.budget, isOff: true } }, false).graphic?.alt).toBe('This turn $0.42 · Session $3.10')
})

test('desktop: the context bar fills to the percent; compact drops it', async () => {
  const bar = richPart('context', D, false).graphic
  expect(bar?.alt).toBe('Context 63% full')
  expect(bar).toMatchObject({ width: 48, height: 8 })
  expect(bar?.source).toContain('<rect width="30" height="8"')
  expect(barSvg(0, '#fff', '#000', 'x').source).not.toContain('fill="#fff"')
  expect(barSvg(1, '#fff', '#000', 'x').source).toContain('<rect width="8" height="8" rx="4" fill="#fff"')
  expect(barSvg(250, '#fff', '#000', 'x').source).toContain('<rect width="48" height="8" rx="4" fill="#fff"')
  expect(richPart('context', D, true).graphic).toBeNull()
})

test('desktop: colors are checked before they reach the markup', async () => {
  expect(safeColor('#00e5ff')).toBe('#00e5ff')
  expect(safeColor('cyan')).toBe('cyan')
  expect(safeColor('red"/><script>')).toBe('currentColor')
  expect(iconSvg('speed', 'x" onload="y', 't').source).not.toContain('onload')
})

test('desktop: widths count the graphic, a gap and the text', async () => {
  expect(richWidth(richPart('speed', D, false))).toBe(ICON_CELLS + 1 + '84 tok/s'.length)
  expect(richWidth(richPart('context', D, false))).toBe(BAR_CELLS + 1 + '63% context'.length)
  expect(richWidth(richPart('turn', D, false))).toBe('Turn 12'.length)
})
