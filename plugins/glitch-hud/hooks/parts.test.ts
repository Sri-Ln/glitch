import { expect, test } from 'claude-code/testing'

import type { Budget, CacheState, Stats } from '../types'
import { FALLBACK_THEME as T } from './theme'
import { cellWidth, fitParts, levelColor, segments } from './parts'
import type { PartData } from './parts'

const stats: Stats = { turn: 12, speed: 84, turnCost: 0.42, total: 3.1, context: 63, costAtStart: 2.68 }
const cache: CacheState = { expiresAt: 0, secondsLeft: 47 * 60 + 12, warnedMark: 0, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false, isWarming: false }
const budget: Budget = { sessionCap: 0, dailyCap: 0, isOff: false, day: '2026-10-12', dayBase: 0, dailySpent: 21.4, notified: { session: 'ok', daily: 'ok' }, demoPercent: null, sessionId: 's1', lastTotal: 3.1, ledgerKey: '', priorForKey: 0, sessionCapOverridden: false }
const D: PartData = { stats, cache, budget, git: { branch: 'main', changed: 4, ahead: 1, behind: 0 }, theme: T, isWorking: false, costShows: ['reply', 'session', 'today'] }
const text = (id: Parameters<typeof segments>[0], d: PartData = D, compact = false) => segments(id, d, compact).map(s => s.text).join('')

test('parts: each part reads as in the spec', async () => {
  expect(text('turn')).toBe('#12')
  expect(text('speed')).toBe('⚡ 84 tok/s')
  expect(text('cost')).toBe('$ 0.42 reply · 3.10 session · 21.40 today')
  expect(text('cost', D, true)).toBe('$ 0.42 · 3.10 · 21.40')
  expect(text('cache')).toBe('⧗ 47:12')
  expect(text('context')).toBe('◔ ▓▓▓▓░░ 63%')
  expect(text('context', D, true)).toBe('◔ 63%')
  expect(text('git')).toBe('⎇ main ±4 ↑1')
})

test('parts: placeholders before data, busy and expired cache', async () => {
  const fresh = { ...D, stats: { ...stats, speed: null, turnCost: null }, cache: { ...cache, secondsLeft: null } }
  expect(text('speed', fresh)).toBe('⚡ —')
  expect(text('cost', fresh)).toBe('$ 3.10 session · 21.40 today')
  expect(text('cache', fresh)).toBe('⧗ —')
  expect(text('cache', { ...D, isWorking: true })).toBe('⧗ …')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: 0 } })).toBe('⧗ expired')
  expect(segments('git', { ...D, git: null }, false)).toEqual([])
})

test('parts: the reply cost is left out while it equals the session total (the first turn)', async () => {
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.1 } })).toBe('$ 3.10 session · 21.40 today')
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.098 } })).toBe('$ 3.10 session · 21.40 today')
  // Without the session figure beside it, the reply is shown.
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.1 }, costShows: ['reply', 'today'] })).toBe('$ 3.10 reply · 21.40 today')
})

test('parts: the cost shows only the chosen figures, in their order', async () => {
  expect(text('cost', { ...D, costShows: ['today'] })).toBe('$ 21.40 today')
  expect(text('cost', { ...D, costShows: ['today', 'reply'] })).toBe('$ 21.40 today · 0.42 reply')
})

test('parts: today adds what this session spent since the ledger was summed', async () => {
  const later = { ...D, stats: { ...stats, total: 3.5 } }
  expect(text('cost', { ...later, costShows: ['today'] })).toBe('$ 21.80 today')
})

test('parts: colors follow budget, cache and context levels', async () => {
  const over = { ...D, budget: { ...budget, sessionCap: 3 } }
  expect(segments('cost', over, false).find(s => s.text === '3.10')?.color).toBe(T.alert)
  expect(segments('cache', { ...D, cache: { ...cache, secondsLeft: 15 * 60 } }, false)[1]?.color).toBe(T.warn)
  expect(segments('context', { ...D, stats: { ...stats, context: 90 } }, false)[1]?.color).toBe(T.alert)
  expect(levelColor(T, 'ok')).toBe(T.good)
})

test('parts: ascii icons', async () => {
  const ascii = { ...D, theme: { ...T, icons: 'ascii' as const } }
  expect(text('speed', ascii)).toBe('> 84 tok/s')
  expect(text('git', ascii)).toBe('@ main +-4 ^1')
})

test('parts: emoji count as two cells', async () => {
  expect(cellWidth('⏳ 47:12')).toBe(8)
  expect(cellWidth('⚡ 84 tok/s')).toBe(11)
  expect(cellWidth('🧠 63%')).toBe(6)
})

test('parts: narrow widths drop git, then speed, then turn, then go compact', async () => {
  const all = ['turn', 'speed', 'cost', 'cache', 'context', 'git'] as const
  const w = (id: (typeof all)[number], compact: boolean) => cellWidth(segments(id, D, compact).map(s => s.text).join(''))
  expect(fitParts([...all], w, 200)).toEqual({ shown: [...all], compact: false })
  expect(fitParts([...all], w, 90).shown).toEqual(['turn', 'speed', 'cost', 'cache', 'context'])
  expect(fitParts([...all], w, 80).shown).toEqual(['turn', 'cost', 'cache', 'context'])
  expect(fitParts([...all], w, 68).shown).toEqual(['cost', 'cache', 'context'])
  // Compact: the cost loses its words and the context bar becomes the percent.
  expect(fitParts([...all], w, 50)).toEqual({ shown: ['cost', 'cache', 'context'], compact: true })
})
