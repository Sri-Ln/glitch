import { expect, test } from 'claude-code/testing'

import { advance, asStreak, dayKey, isMilestone } from './streak'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

test('dayKey is the local date', () => expect(dayKey(at(2026, 10, 4, 23))).toBe('2026-10-04'))
test('milestones', () => {
  expect([1, 2, 3, 6, 7, 14, 30, 50, 99, 100, 150, 200, 300].map(isMilestone)).toEqual([false, false, true, false, true, true, true, true, false, true, false, true, true])
})
test('first use starts at 1, no cheer', () => {
  expect(advance(null, at(2026, 10, 14))).toEqual({ streak: { lastDay: '2026-10-14', count: 1, cheered: 0 }, cheer: false, changed: true })
})
test('same day changes nothing', () => {
  const s = { lastDay: '2026-10-14', count: 2, cheered: 0 }
  expect(advance(s, at(2026, 10, 14, 22))).toEqual({ streak: s, cheer: false, changed: false })
})
test('the next day adds one and cheers at a milestone once', () => {
  const r = advance({ lastDay: '2026-10-13', count: 2, cheered: 0 }, at(2026, 10, 14))
  expect(r.streak).toEqual({ lastDay: '2026-10-14', count: 3, cheered: 3 })
  expect(r.cheer).toBe(true)
  expect(advance(r.streak, at(2026, 10, 14, 20)).cheer).toBe(false)
})
test('a missed day resets to 1', () => {
  expect(advance({ lastDay: '2026-10-11', count: 9, cheered: 7 }, at(2026, 10, 14)).streak).toEqual({ lastDay: '2026-10-14', count: 1, cheered: 7 })
})
test('across a month end', () => {
  expect(advance({ lastDay: '2026-10-31', count: 6, cheered: 3 }, at(2026, 11, 1)).streak.count).toBe(7)
})
test('a session open across midnight advances once', () => {
  const s = { lastDay: '2026-10-13', count: 4, cheered: 3 }
  const first = advance(s, at(2026, 10, 14, 0))
  expect(first.streak.count).toBe(5)
  expect(advance(first.streak, at(2026, 10, 14, 1)).changed).toBe(false)
})
test('asStreak accepts only the shape', () => {
  expect(asStreak({ lastDay: '2026-10-14', count: 3, cheered: 3 })).toEqual({ lastDay: '2026-10-14', count: 3, cheered: 3 })
  expect(asStreak('x')).toBe(null)
  expect(asStreak({ lastDay: 5, count: 3, cheered: 0 })).toBe(null)
})
