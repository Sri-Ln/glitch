import { expect, test } from 'claude-code/testing'

import { DEMO_HOLD_MS, cacheLevel, clockText, defaultMarks, dueMark, endDemo, isDemoOver, shouldAutoWarm, startDemo, warnMarks } from './cache'

test('cache: each mark fires once, smallest window first', async () => {
  const marks = [10, 5]
  expect(dueMark(11 * 60, marks, 0)).toBeNull()
  expect(dueMark(10 * 60, marks, 0)).toBe(10)
  expect(dueMark(9 * 60, marks, 10)).toBeNull()
  expect(dueMark(5 * 60, marks, 10)).toBe(5)
  expect(dueMark(4 * 60, marks, 5)).toBeNull()
  expect(dueMark(4 * 60, marks, 0)).toBe(5)
  expect(dueMark(0, marks, 0)).toBeNull()
})

test('cache: colors at 20 and 10 minutes, none while busy', async () => {
  expect(cacheLevel(21 * 60, false)).toBe('ok')
  expect(cacheLevel(20 * 60, false)).toBe('warn')
  expect(cacheLevel(10 * 60, false)).toBe('alert')
  expect(cacheLevel(60, true)).toBe('ok')
  expect(cacheLevel(null, false)).toBe('ok')
})

test('cache: colors scale with the lifetime, a third and a sixth of it', async () => {
  expect(cacheLevel(20 * 60, false, 60 * 60_000)).toBe('warn')
  expect(cacheLevel(5 * 60, false, 5 * 60_000)).toBe('ok')
  expect(cacheLevel(101, false, 5 * 60_000)).toBe('ok')
  expect(cacheLevel(100, false, 5 * 60_000)).toBe('warn')
  expect(cacheLevel(51, false, 5 * 60_000)).toBe('warn')
  expect(cacheLevel(50, false, 5 * 60_000)).toBe('alert')
})

test('cache: marks left unset fit the lifetime; typed marks are kept below it', async () => {
  expect(defaultMarks(60 * 60_000)).toEqual([10, 5])
  expect(defaultMarks(5 * 60_000)).toEqual([2, 1])
  expect(warnMarks(null, 60 * 60_000)).toEqual([10, 5])
  expect(warnMarks(null, 5 * 60_000)).toEqual([2, 1])
  expect(warnMarks([10, 3, 1], 5 * 60_000)).toEqual([3, 1])
  expect(warnMarks([15], 60 * 60_000)).toEqual([15])
})

test('cache: a demo sets the real deadline aside once and gives it back', async () => {
  const c = { expiresAt: 3_600_000, secondsLeft: 3000, warnedMark: 10, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false }
  const demo = startDemo(c, 600_000, 60)
  expect(demo).toEqual({ ...c, expiresAt: 660_000, secondsLeft: 60, warnedMark: 0, real: { expiresAt: 3_600_000, warnedMark: 10 } })
  // A second demo keeps the first's saved deadline.
  expect(startDemo(demo, 620_000, 30).real).toEqual({ expiresAt: 3_600_000, warnedMark: 10 })
  expect(isDemoOver(demo, 660_000)).toBe(false)
  expect(isDemoOver(demo, 660_000 + DEMO_HOLD_MS)).toBe(true)
  expect(isDemoOver(c, 9_999_999)).toBe(false)
  expect(endDemo(demo, 665_000)).toEqual({ ...c, secondsLeft: 2935, real: null })
  expect(endDemo(startDemo({ ...c, expiresAt: null, secondsLeft: null }, 0, 60), 65_000).secondsLeft).toBeNull()
})

test('cache: clock text', async () => {
  expect(clockText(3600)).toBe('60:00')
  expect(clockText(65)).toBe('01:05')
})

test('cache: auto keep-warm only at the last mark, recently active, once per prompt', async () => {
  const base = { marks: [10, 5], now: 100 * 60_000, lastPromptAt: 90 * 60_000, maxIdleMin: 120, warmedSincePrompt: false }
  expect(shouldAutoWarm({ ...base, mark: 10 })).toBe(false)
  expect(shouldAutoWarm({ ...base, mark: 5 })).toBe(true)
  expect(shouldAutoWarm({ ...base, mark: 5, warmedSincePrompt: true })).toBe(false)
  expect(shouldAutoWarm({ ...base, mark: 5, lastPromptAt: 0, now: 121 * 60_000 })).toBe(false)
})
