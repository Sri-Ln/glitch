import { expect, test } from 'claude-code/testing'

import type { Budget, CacheState, Stats } from '../types'
import { FALLBACK_THEME as T } from './theme'
import { BAR_CELLS, HOST_HEX, ICON_CELLS, barSvg, iconSvg, richPart, richWidth, safeColor } from './desktop'
import type { PartData } from './parts'

const stats: Stats = { turn: 12, speed: 84, turnCost: 0.42, total: 3.1, context: 63, costAtStart: 2.68 }
const cache: CacheState = { expiresAt: 0, secondsLeft: 47 * 60 + 12, warnedMark: 0, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false, isWarming: false }
const budget: Budget = { sessionCap: 0, dailyCap: 0, isOff: false, day: '2026-10-12', dayBase: 0, dailySpent: 21.4, notified: { session: 'ok', daily: 'ok' }, demoPercent: null, sessionId: 's1', lastTotal: 3.1, ledgerKey: '', priorForKey: 0, sessionCapOverridden: false }
const D: PartData = { stats, cache, budget, git: { branch: 'main', changed: 4, ahead: 1, behind: 0 }, theme: T, isWorking: false, costShows: ['reply', 'session', 'today'] }
const text = (id: Parameters<typeof richPart>[0], d: PartData = D, compact = false) => richPart(id, d, compact).segments.map(s => s.text).join('')

test('desktop: values are worded, not bare symbols', async () => {
  expect(text('turn')).toBe('Turn 12')
  expect(text('speed')).toBe('84 tok/s')
  expect(text('cost')).toBe('$0.42 reply · $3.10 session · $21.40 today')
  expect(text('cache')).toBe('47:12 left')
  expect(text('context')).toBe('63% context')
  expect(text('git')).toBe('main ±4 ↑1')
})

test('desktop: no reply figure while it equals the session (the first turn), and before any turn', async () => {
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.1 } })).toBe('$3.10 session · $21.40 today')
  expect(text('cost', { ...D, stats: { ...stats, turnCost: null } })).toBe('$3.10 session · $21.40 today')
})

test('desktop: the cost shows only the chosen figures; compact drops the words', async () => {
  expect(text('cost', { ...D, costShows: ['session'] })).toBe('$3.10 session')
  expect(text('cost', { ...D, costShows: ['today', 'reply'] })).toBe('$21.40 today · $0.42 reply')
  expect(text('cost', D, true)).toBe('$0.42 · $3.10 · $21.40')
})

test('desktop: cache placeholders', async () => {
  expect(text('cache', { ...D, isWorking: true })).toBe('…')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: 0 } })).toBe('expired')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: null } })).toBe('—')
})

test('desktop: icons are fixed-size images in the level color, described by alt', async () => {
  const cost = richPart('cost', { ...D, budget: { ...budget, sessionCap: 3 } }, false).graphic
  expect(cost?.source).toContain(HOST_HEX.alert)
  expect(cost?.alt).toBe('Last reply $0.42 · Session $3.10 of $3.00 · Today on this machine $21.40')
  expect(richPart('cost', { ...D, isWorking: true }, false).graphic?.alt).toBe('This reply $0.42 · Session $3.10 · Today on this machine $21.40')
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
  expect(text('cost', { ...D, budget: { ...budget, sessionCap: 5 } })).toBe('$0.42 reply · $3.10 of $5.00 session · $21.40 today')
  expect(text('cost', { ...D, budget: { ...budget, sessionCap: 5, isOff: true } })).toBe('$0.42 reply · $3.10 session · $21.40 today')
})

test('desktop: the daily cap shows beside today and in the tooltip; an off budget shows no caps', async () => {
  const daily = { ...D, budget: { ...budget, dailyCap: 10, dailySpent: 4.5 } }
  expect(text('cost', daily)).toBe('$0.42 reply · $3.10 session · $4.50 of $10.00 today')
  expect(richPart('cost', daily, false).graphic?.alt).toBe('Last reply $0.42 · Session $3.10 · Today on this machine $4.50 of $10.00')
  expect(richPart('cost', { ...daily, budget: { ...daily.budget, isOff: true } }, false).graphic?.alt).toBe('Last reply $0.42 · Session $3.10 · Today on this machine $4.50')
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

// The theme's colors are made for a dark terminal; on the desktop's light band the
// cost takes the host's own status colors, as its diff counts do.
test('desktop: the cost reads in the host status colors, not the theme', async () => {
  const at = (sessionCap: number) => richPart('cost', { ...D, budget: { ...budget, sessionCap } }, false)
  const colors = (p: ReturnType<typeof at>) => [...new Set(p.segments.filter(x => x.color).map(x => x.color))]
  expect(colors(at(0))).toEqual(['success'])
  expect(at(0).graphic?.source).toContain(HOST_HEX.ok)
  expect(colors(at(4))).toEqual(['warning'])
  expect(at(4).graphic?.source).toContain(HOST_HEX.warn)
  expect(colors(at(3))).toEqual(['error'])
  expect(at(3).graphic?.source).toContain(HOST_HEX.alert)
  expect(at(0).graphic?.source).not.toContain(T.good)
})

