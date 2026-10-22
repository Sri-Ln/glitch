import { expect, test } from 'claude-code/testing'

import { CREW_PILL_PAD, crewPillText, isCrewSummary } from './crew'

test('isCrewSummary accepts only whole, non-negative figures', () => {
  expect(isCrewSummary({ running: 2, done: 2, failed: 0, cost: 0.31, elapsedMs: 72_000 })).toBe(true)
  for (const bad of [null, 'x', {}, { running: 2, done: 2, failed: 0, cost: 0.31 }, { running: -1, done: 0, failed: 0, cost: 0, elapsedMs: 0 }, { running: 1.5, done: 0, failed: 0, cost: 0, elapsedMs: 0 }, { running: 0, done: 0, failed: 0, cost: Number.NaN, elapsedMs: 0 }]) {
    expect(isCrewSummary(bad)).toBe(false)
  }
})

test('the pill reads Crew · N at work · N done · ≈$x · m:ss, failures only when there are some', () => {
  expect(crewPillText({ running: 2, done: 2, failed: 0, cost: 0.31, elapsedMs: 72_000 })).toBe('Crew · 2 at work · 2 done · ≈$0.31 · 1:12')
  expect(crewPillText({ running: 0, done: 3, failed: 1, cost: 1.2, elapsedMs: 5_000 })).toBe('Crew · 0 at work · 3 done · 1 failed · ≈$1.20 · 0:05')
})

test('the pill reserves room for its button chrome', () => expect(CREW_PILL_PAD).toBeGreaterThan(0))
