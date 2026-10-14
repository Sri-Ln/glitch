import { expect, test } from 'claude-code/testing'

import { createPlayer } from './behavior/player'
import { PERSONAS } from './personas/index'
import { failTick, isMainLoopError, tickOnce } from './tick'
import type { TickInputs } from './tick'

const bud = PERSONAS.bud as NonNullable<typeof PERSONAS.bud>
const base = (over: Partial<TickInputs> = {}): TickInputs => ({
  now: 1000,
  persona: bud,
  player: createPlayer(),
  state: { mood: 'idle', since: 0, turnSince: null, lastPromptAt: 0, oopsUntil: 0, happyUntil: 0, cheerUntil: 0, cryUntil: 0, failStreak: 0 },
  lastSource: null,
  total: 0,
  budget: null,
  cacheSecondsLeft: null,
  helpersRunning: 0,
  reviewerRunning: false,
  tiredMs: 600_000,
  sleepyMs: 900_000,
  ...over,
})

test('an idle pet draws its idle frame', () => {
  const r = tickOnce(base())
  expect(r.mood).toBe('idle')
  expect(r.moodChanged).toBe(false)
  expect(r.sprite?.alt).toBe('Bud the dog, idle')
})

test('a running turn changes the mood, restarts since and draws working', () => {
  const state = { ...base().state, turnSince: 900 }
  const r = tickOnce(base({ state }))
  expect(r.mood).toBe('working')
  expect(r.moodChanged).toBe(true)
  expect(r.since).toBe(1000)
  expect(r.sprite?.alt).toBe('Bud the dog, working')
})

test('the sprite is only returned when its image changed', () => {
  const first = tickOnce(base())
  const again = tickOnce(base({ lastSource: first.sprite?.source ?? null }))
  expect(again.sprite).toBe(null)
})

test('a cheer window shows cheering', () => {
  const state = { ...base().state, cheerUntil: 5000 }
  expect(tickOnce(base({ state })).sprite?.alt).toBe('Bud the dog, cheering')
})

test('a cry window shows crying, and a reached cap holds it', () => {
  const state = { ...base().state, cryUntil: 5000 }
  expect(tickOnce(base({ state })).sprite?.alt).toBe('Bud the dog, crying')
  const cap = { sessionCap: 10, dailyCap: 0, isOff: false, dailySpent: 0, demoPercent: null }
  expect(tickOnce(base({ budget: cap, total: 10 })).mood).toBe('crying')
})

test('three failures in a row make the pet cry and reset the count; a clean event resets it', () => {
  const a = failTick(0, 'fail', 100)
  const b = failTick(a.failStreak, 'fail', 200)
  expect(b).toEqual({ failStreak: 2, cryUntil: null })
  expect(failTick(b.failStreak, 'fail', 300)).toEqual({ failStreak: 0, cryUntil: 6300 })
  expect(failTick(b.failStreak, 'ok', 300)).toEqual({ failStreak: 0, cryUntil: null })
  expect(failTick(failTick(0, 'ok', 0).failStreak, 'fail', 400).failStreak).toBe(1)
})

test('only a main-loop tool error upsets the pet', () => {
  expect(isMainLoopError({}, { isError: true })).toBe(true)
  expect(isMainLoopError({ agentId: 'a1' }, { isError: true })).toBe(false)
  expect(isMainLoopError({}, { isError: false })).toBe(false)
  expect(isMainLoopError({}, undefined)).toBe(false)
})
