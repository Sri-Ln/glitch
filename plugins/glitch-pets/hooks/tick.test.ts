import { expect, test } from 'claude-code/testing'

import { createPlayer } from './behavior/player'
import { PERSONAS } from './personas/index'
import { CHEER_MS, CRY_MS, HAPPY_MS, OOPS_MS } from './behavior/moods'
import { failTick, isMainLoopError, onToolResult, onTurnEnd, onTurnStartStreak, tickOnce } from './tick'
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

const S0 = base().state
const fail = { isError: true }

test('a subagent tool error leaves the mood state unchanged', () => {
  expect(onToolResult(S0, { agentId: 'a1' }, fail, 1000)).toEqual(S0)
})

test('a clean main-loop tool call resets the failure count', () => {
  expect(onToolResult({ ...S0, failStreak: 2 }, {}, { isError: false }, 1000).failStreak).toBe(0)
})

test('three main-loop failures in a row set cryUntil and reset the count', () => {
  let m = S0
  for (const t of [1000, 1100]) m = onToolResult(m, {}, fail, t)
  expect(m.failStreak).toBe(2)
  expect(m.oopsUntil).toBe(1100 + OOPS_MS)
  m = onToolResult(m, {}, fail, 1200)
  expect(m.cryUntil).toBe(1200 + CRY_MS)
  expect(m.failStreak).toBe(0)
})

test('an answer between failures resets the count; an errored turn counts as a failure', () => {
  let m = onToolResult(onToolResult(S0, {}, fail, 1000), {}, fail, 1100)
  m = onTurnEnd(m, 'answer', 1200)
  expect(m.failStreak).toBe(0)
  expect(m.happyUntil).toBe(1200 + HAPPY_MS)
  expect(m.turnSince).toBe(null)
  let e = S0
  for (const t of [1, 2, 3]) e = onTurnEnd({ ...e, turnSince: 0 }, 'error', t * 100)
  expect(e.cryUntil).toBe(300 + CRY_MS)
  expect(e.oopsUntil).toBe(300 + OOPS_MS)
  expect(e.failStreak).toBe(0)
})

test('a broken streak sets cryUntil and a cheer sets cheerUntil', () => {
  expect(onTurnStartStreak(S0, { cheer: false, broken: true }, 1000).cryUntil).toBe(1000 + CRY_MS)
  expect(onTurnStartStreak(S0, { cheer: true, broken: false }, 1000).cheerUntil).toBe(1000 + CHEER_MS)
  expect(onTurnStartStreak(S0, { cheer: false, broken: false }, 1000)).toEqual(S0)
})
