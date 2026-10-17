import { expect, test } from 'claude-code/testing'

import { INITIAL_CREW } from './crew'
import type { CrewRow, CrewState } from './crew'
import {
  INITIAL_REACTIONS, INVESTIGATE_MS, JOY_MS, MIN_REACTION_MS, REWARD_MS, WORRY_MS,
  applyCrewEvents, crewEvents, crewName, hasGift, reactionAt, reactionMoodInputs, rewardAt,
} from './reactions'
import type { CrewEvent, Reactions } from './reactions'

const T = 1_000_000
const row = (id: string, over: Partial<CrewRow> = {}): CrewRow => ({
  id, name: id, named: true, description: `task ${id}`, role: 'builder', tier: 'medium', model: null, effort: null, tokens: 0, weight: 0,
  turnTokens: 0, turnWeight: 0, tools: 0, startedAt: T - 10_000, endedAt: null, status: 'running', ...over,
})
const crewOf = (...rows: CrewRow[]): CrewState => ({ ...INITIAL_CREW, closed: false, startedAt: T - 10_000, rows })
const done = (id: string, at: number): CrewEvent => ({ kind: 'done', id, name: id, at })
const failed = (id: string, at: number): CrewEvent => ({ kind: 'failed', id, name: id, at })
const apply = (r: Reactions, ...evs: CrewEvent[]): Reactions => evs.reduce((s, e) => applyCrewEvents(s, [e]), r)

test('crewEvents: a row that went from running to done or failed is one event; others are not', () => {
  const before = crewOf(row('builder-1'), row('tester-2'), row('designer-3'), row('old', { status: 'done', endedAt: T - 5 }))
  const after = crewOf(row('builder-1', { status: 'done', endedAt: T }), row('tester-2', { status: 'failed', endedAt: T }), row('designer-3'), row('old', { status: 'done', endedAt: T - 5 }))
  expect(crewEvents(before, after, T)).toEqual([done('builder-1', T), failed('tester-2', T)])
  expect(crewEvents(after, after, T)).toEqual([])
})

test('crewEvents: a brand-new row and a resumed row are not news', () => {
  const before = crewOf(row('builder-1', { status: 'done', endedAt: T - 5 }))
  const after = crewOf(row('builder-1', { status: 'running', resumedAt: T }), row('tester-2', { status: 'done', endedAt: T }))
  expect(crewEvents(before, after, T)).toEqual([])
})

test('crewName: the crew name, else the description cut to about 24 chars', () => {
  expect(crewName(row('builder-1'))).toBe('builder-1')
  expect(crewName({ ...row('x'), name: undefined, description: 'short job' })).toBe('short job')
  expect(crewName({ ...row('x'), name: undefined, description: 'a very long description of the whole task' })).toBe('a very long description…')
})

test('a finish is joy for 2.5 s; a failure is worry for 3 s', () => {
  const j = apply(INITIAL_REACTIONS, done('b1', T))
  expect(reactionAt(j, T + JOY_MS - 1)).toEqual({ kind: 'joy', who: ['b1'], startedAt: T, until: T + JOY_MS })
  expect(reactionAt(j, T + JOY_MS)).toBe(null)
  const w = apply(INITIAL_REACTIONS, failed('b1', T))
  expect(reactionAt(w, T + WORRY_MS - 1)?.kind).toBe('worry')
  expect(reactionAt(w, T + WORRY_MS)).toBe(null)
})

test('same kind collapses: three finishes make one joy that runs from the last, naming all three', () => {
  const r = apply(INITIAL_REACTIONS, done('b1', T), done('b2', T + 800), done('t3', T + 2000))
  expect(reactionAt(r, T + 2000 + JOY_MS - 1)).toEqual({ kind: 'joy', who: ['b1', 'b2', 't3'], startedAt: T, until: T + 2000 + JOY_MS })
})

test('a different kind inside the first second waits, then takes over when the second is up', () => {
  const r = apply(INITIAL_REACTIONS, done('b1', T), failed('t2', T + 300))
  expect(reactionAt(r, T + MIN_REACTION_MS - 1)?.kind).toBe('joy')
  expect(reactionAt(r, T + MIN_REACTION_MS)).toEqual({ kind: 'worry', who: ['t2'], startedAt: T + MIN_REACTION_MS, until: T + MIN_REACTION_MS + WORRY_MS })
})

test('the latest wins the pending slot', () => {
  const r = apply(INITIAL_REACTIONS, done('b1', T), failed('t2', T + 200), done('b3', T + 400))
  // b3 is the same kind as the playing joy: it joins it, and the waiting worry keeps its turn.
  expect(reactionAt(r, T + 500)?.who).toEqual(['b1', 'b3'])
  expect(reactionAt(r, T + MIN_REACTION_MS)?.kind).toBe('worry')
  const s = apply(INITIAL_REACTIONS, failed('b1', T), done('t2', T + 200), done('t4', T + 500))
  expect(reactionAt(s, T + MIN_REACTION_MS)).toEqual({ kind: 'joy', who: ['t2', 't4'], startedAt: T + MIN_REACTION_MS, until: T + MIN_REACTION_MS + JOY_MS })
})

test('after the first second the newest event takes over at once', () => {
  const r = apply(INITIAL_REACTIONS, done('b1', T), failed('t2', T + 1500))
  expect(reactionAt(r, T + 1500)).toEqual({ kind: 'worry', who: ['t2'], startedAt: T + 1500, until: T + 1500 + WORRY_MS })
})

test('investigating: after the worry, while helpers still run, for at most 45 s after the latest failure', () => {
  const crew = crewOf(row('b1', { status: 'failed', endedAt: T }), row('b2'))
  const r = apply(INITIAL_REACTIONS, failed('b1', T))
  expect(reactionMoodInputs(r, crew, T + 10)).toEqual({ crewJoyUntil: 0, crewWorryUntil: T + WORRY_MS, investigateUntil: T + INVESTIGATE_MS })
  // A later success flashes joy but leaves investigating in place.
  const s = apply(r, done('b2', T + 5000))
  expect(reactionMoodInputs(s, crew, T + 5000).investigateUntil).toBe(T + INVESTIGATE_MS)
  expect(reactionMoodInputs(s, crew, T + 5000).crewJoyUntil).toBe(T + 5000 + JOY_MS)
  // A failure from an earlier crew does not carry into a new one.
  expect(reactionMoodInputs(r, crewOf(row('n1')), T + 10).investigateUntil).toBe(0)
})

test('reward: each finish gets the fishing-rod moment, one at a time, the latest waiting', () => {
  let r = apply(INITIAL_REACTIONS, done('b1', T))
  expect(rewardAt(r, T + 10)).toEqual({ rowId: 'b1', startedAt: T })
  r = apply(r, done('b2', T + 1000), done('b3', T + 2000))
  // b3 replaced b2 in the waiting slot: b2 gets its gift without the show.
  expect(rewardAt(r, T + REWARD_MS - 1)?.rowId).toBe('b1')
  expect(rewardAt(r, T + REWARD_MS)).toEqual({ rowId: 'b3', startedAt: T + REWARD_MS })
  expect(rewardAt(r, T + 2 * REWARD_MS)).toBe(null)
  // A failure is no reward.
  expect(rewardAt(apply(INITIAL_REACTIONS, failed('x', T)), T)).toBe(null)
})

test('gift badges: kept by a finished row once its moment is over, never before', () => {
  const r = apply(INITIAL_REACTIONS, done('b1', T), done('b2', T + 1000), done('b3', T + 2000))
  expect(hasGift(r, 'b1', T + 10)).toBe(false)
  expect(hasGift(r, 'b2', T + 1000)).toBe(true)
  expect(hasGift(r, 'b3', T + 2000)).toBe(false)
  expect(hasGift(r, 'b1', T + REWARD_MS)).toBe(true)
  expect(hasGift(r, 'b3', T + 2 * REWARD_MS)).toBe(true)
  expect(hasGift(r, 'nobody', T)).toBe(false)
  expect(hasGift(apply(INITIAL_REACTIONS, failed('f', T)), 'f', T + 10 * REWARD_MS)).toBe(false)
})

test('a state from before reactions existed reads as none', () => {
  expect(reactionAt(undefined, T)).toBe(null)
  expect(rewardAt(undefined, T)).toBe(null)
  expect(reactionMoodInputs(undefined, crewOf(), T)).toEqual({ crewJoyUntil: 0, crewWorryUntil: 0, investigateUntil: 0 })
})

test('a same-kind event joins the reaction playing and keeps a different kind waiting', () => {
  // A joy plays; a worry arrives in its first second and waits; another joy joins the first.
  const r = apply(INITIAL_REACTIONS, done('tester-1', T), failed('builder-1', T + 200), done('tester-2', T + 400))
  expect(reactionAt(r, T + 500)?.who).toEqual(['tester-1', 'tester-2'])
  // The failure is not lost: it takes over once the joy has had its second.
  expect(reactionAt(r, T + MIN_REACTION_MS)?.kind).toBe('worry')
  expect(reactionAt(r, T + MIN_REACTION_MS)?.who).toEqual(['builder-1'])
})
