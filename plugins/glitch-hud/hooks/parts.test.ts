import { expect, test } from 'claude-code/testing'

import type { Budget, CacheState, Stats } from '../types'
import { FALLBACK_THEME as T } from './theme'
import { cellWidth, fitParts, levelColor, segments } from './parts'
import type { PartData } from './parts'

const stats: Stats = { turn: 12, speed: 84, turnCost: 0.42, total: 3.1, context: 63, costAtStart: 2.68 }
const cache: CacheState = { expiresAt: 0, secondsLeft: 47 * 60 + 12, warnedMark: 0, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false }
const budget: Budget = { sessionCap: 0, dailyCap: 0, isOff: false, day: '2026-10-12', dayBase: 0, dailySpent: 0, notified: { session: 'ok', daily: 'ok' }, demoPercent: null, sessionId: 's1', lastTotal: 0, ledgerKey: '', priorForKey: 0, sessionCapOverridden: false }
const D: PartData = { stats, cache, budget, git: { branch: 'main', changed: 4, ahead: 1, behind: 0 }, theme: T, isWorking: false }
const text = (id: Parameters<typeof segments>[0], d: PartData = D, compact = false) => segments(id, d, compact).map(s => s.text).join('')

test('parts: each part reads as in the spec', async () => {
  expect(text('turn')).toBe('#12')
  expect(text('speed')).toBe('⚡ 84 tok/s')
  expect(text('cost')).toBe('$ $0.42 │ $3.10')
  expect(text('cache')).toBe('⧗ 47:12')
  expect(text('context')).toBe('◔ ▓▓▓▓░░ 63%')
  expect(text('context', D, true)).toBe('◔ 63%')
  expect(text('git')).toBe('⎇ main ±4 ↑1')
})

test('parts: placeholders before data, busy and expired cache', async () => {
  const fresh = { ...D, stats: { ...stats, speed: null, turnCost: null }, cache: { ...cache, secondsLeft: null } }
  expect(text('speed', fresh)).toBe('⚡ —')
  expect(text('cost', fresh)).toBe('$ — │ $3.10')
  expect(text('cache', fresh)).toBe('⧗ —')
  expect(text('cache', { ...D, isWorking: true })).toBe('⧗ …')
  expect(text('cache', { ...D, cache: { ...cache, secondsLeft: 0 } })).toBe('⧗ expired')
  expect(segments('git', { ...D, git: null }, false)).toEqual([])
})

test('parts: the turn cost is left out while it equals the session total (the first turn)', async () => {
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.1 } })).toBe('$ $3.10')
  expect(text('cost', { ...D, stats: { ...stats, turnCost: 3.098 } })).toBe('$ $3.10')
})

test('parts: colors follow budget, cache and context levels', async () => {
  const over = { ...D, budget: { ...budget, sessionCap: 3 } }
  expect(segments('cost', over, false).find(s => s.text.includes('$3.10'))?.color).toBe(T.alert)
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

test('parts: warn-level cost and the red cache level', async () => {
  // $3.10 of a $4 cap is 77.5%: warn.
  const warn = { ...D, budget: { ...budget, sessionCap: 4 } }
  expect(segments('cost', warn, false).every(s => s.dim || s.color === T.warn)).toBe(true)
  const red = segments('cache', { ...D, cache: { ...cache, secondsLeft: 5 * 60 } }, false)
  expect(red.map(s => s.color)).toEqual([T.alert, T.alert])
  expect(red[1]?.text).toBe('05:00')
})

test('parts: git shows the behind count, or the branch alone when clean', async () => {
  expect(text('git', { ...D, git: { branch: 'main', changed: 0, ahead: 0, behind: 3 } })).toBe('⎇ main ↓3')
  expect(text('git', { ...D, git: { branch: 'main', changed: 2, ahead: 1, behind: 3 } })).toBe('⎇ main ±2 ↑1 ↓3')
  expect(text('git', { ...D, git: { branch: 'feature/x', changed: 0, ahead: 0, behind: 0 } })).toBe('⎇ feature/x')
})

test('parts: the context bar clamps at 0 and 100', async () => {
  const at = (context: number) => text('context', { ...D, stats: { ...stats, context } })
  expect(at(0)).toBe('◔ ░░░░░░ 0%')
  expect(at(-5)).toBe('◔ ░░░░░░ -5%')
  expect(at(100)).toBe('◔ ▓▓▓▓▓▓ 100%')
  expect(at(130)).toBe('◔ ▓▓▓▓▓▓ 130%')
})

test('parts: emoji icons', async () => {
  const emoji = { ...D, theme: { ...T, icons: 'emoji' as const } }
  expect(text('turn', emoji)).toBe('#12')
  expect(text('speed', emoji)).toBe('⚡ 84 tok/s')
  expect(text('cost', emoji)).toBe('💰 $0.42 │ $3.10')
  expect(text('cache', emoji)).toBe('⏳ 47:12')
  expect(text('context', emoji)).toBe('🧠 ▓▓▓▓░░ 63%')
  expect(text('git', emoji)).toBe('🌿 main ±4 ↑1')
})

test('parts: unreadable usage shows — for cost and context, not the last value', async () => {
  const stale = { ...D, stats: { ...stats, isStale: true } }
  expect(text('cost', stale)).toBe('$ —')
  expect(text('context', stale)).toBe('◔ —')
  expect(text('context', stale, true)).toBe('◔ —')
  // The other parts do not come from the usage call.
  expect(text('turn', stale)).toBe('#12')
  expect(text('cache', stale)).toBe('⧗ 47:12')
})

test('parts: narrow widths drop git, then speed, then turn, then shrink context', async () => {
  const all = ['turn', 'speed', 'cost', 'cache', 'context', 'git'] as const
  const w = (id: (typeof all)[number], compact: boolean) => cellWidth(segments(id, D, compact && id === 'context').map(s => s.text).join(''))
  expect(fitParts([...all], w, 200)).toEqual({ shown: [...all], compactContext: false })
  expect(fitParts([...all], w, 60).shown).toEqual(['turn', 'speed', 'cost', 'cache', 'context'])
  expect(fitParts([...all], w, 50).shown).toEqual(['turn', 'cost', 'cache', 'context'])
  expect(fitParts([...all], w, 44).shown).toEqual(['cost', 'cache', 'context'])
  expect(fitParts([...all], w, 36)).toEqual({ shown: ['cost', 'cache', 'context'], compactContext: true })
})
