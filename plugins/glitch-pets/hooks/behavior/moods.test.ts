import { expect, test } from 'claude-code/testing'

import { budgetFraction, isCapReached, moodOf } from './moods'
import type { MoodInputs } from './moods'

const T = 1_000_000
const base = (over: Partial<MoodInputs> = {}): MoodInputs => ({
  now: T, turnSince: null, lastPromptAt: T, oopsUntil: 0, happyUntil: 0, cheerUntil: 0,
  capReached: false, budget: null, cacheSecondsLeft: 3000,
  helpersRunning: 0, reviewerRunning: false, tiredMs: 600_000, sleepyMs: 600_000, ...over,
})

test('idle by default', () => expect(moodOf(base())).toBe('idle'))
test('working while a turn runs', () => expect(moodOf(base({ turnSince: T - 1000 }))).toBe('working'))
test('tired once the turn is long', () => expect(moodOf(base({ turnSince: T - 600_000 }))).toBe('tired'))
test('happy right after a clean turn', () => expect(moodOf(base({ happyUntil: T + 1 }))).toBe('happy'))
test('happy has passed', () => expect(moodOf(base({ happyUntil: T }))).toBe('idle'))
test('sleepy after no prompt for sleepyMs', () => expect(moodOf(base({ lastPromptAt: T - 600_000 }))).toBe('sleepy'))
test('sleepy when the cache went cold', () => expect(moodOf(base({ cacheSecondsLeft: 0 }))).toBe('sleepy'))
test('never sleepy during a turn', () => expect(moodOf(base({ cacheSecondsLeft: 0, turnSince: T - 5 }))).toBe('working'))
test('worried at 90% of a cap', () => expect(moodOf(base({ budget: 0.9 }))).toBe('worried'))
test('not worried at 89%', () => expect(moodOf(base({ budget: 0.89 }))).toBe('idle'))
test('worried under 60 s of cache', () => expect(moodOf(base({ cacheSecondsLeft: 59 }))).toBe('worried'))
test('cache countdown unknown is not a worry', () => expect(moodOf(base({ cacheSecondsLeft: null }))).toBe('idle'))
test('oops beats worried', () => expect(moodOf(base({ oopsUntil: T + 1, budget: 0.95 }))).toBe('oops'))
test('a reached cap holds oops', () => expect(moodOf(base({ capReached: true }))).toBe('oops'))
test('cheering beats leading', () => expect(moodOf(base({ cheerUntil: T + 1, helpersRunning: 2 }))).toBe('cheering'))
test('reviewing beats leading', () => expect(moodOf(base({ reviewerRunning: true, helpersRunning: 1 }))).toBe('reviewing'))
test('leading beats working', () => expect(moodOf(base({ helpersRunning: 1, turnSince: T - 5 }))).toBe('leading'))
test('worried beats cheering', () => expect(moodOf(base({ cheerUntil: T + 1, cacheSecondsLeft: 10 }))).toBe('worried'))

const B = { sessionCap: 10, dailyCap: 0, isOff: false, dailySpent: 0, demoPercent: null }
test('budgetFraction takes the worse of session and day', () => {
  expect(budgetFraction(B, 9)).toBe(0.9)
  expect(budgetFraction({ ...B, dailyCap: 20, dailySpent: 19 }, 1)).toBe(0.95)
})
test('no caps, budget off or no budget → null', () => {
  expect(budgetFraction({ ...B, sessionCap: 0 }, 9)).toBe(null)
  expect(budgetFraction({ ...B, isOff: true }, 9)).toBe(null)
  expect(budgetFraction(null, 9)).toBe(null)
})
test('the budget demo percent is honoured', () => expect(budgetFraction({ ...B, demoPercent: 92 }, 0)).toBe(0.92))
test('isCapReached at or past a cap', () => {
  expect(isCapReached(B, 10)).toBe(true)
  expect(isCapReached(B, 9.99)).toBe(false)
  expect(isCapReached({ ...B, isOff: true }, 50)).toBe(false)
})
