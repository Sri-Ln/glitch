import { expect, test } from 'claude-code/testing'

import { needsReview } from './gate'
import type { CrewRow, CrewState } from './crew'
import { INITIAL_CREW } from './crew'

const row = (id: string, role: CrewRow['role'], status: CrewRow['status']): CrewRow =>
  ({ id, role, status, description: id, tier: 'medium', model: null, effort: null, tokens: 0, weight: 0, tools: 0, startedAt: 0, endedAt: null }) as CrewRow
const crewOf = (rows: CrewRow[], extra: Partial<CrewState> = {}): CrewState => ({ ...INITIAL_CREW, turnNo: 1, mainTurn: 1, startedAt: 0, rows, ...extra })
const o = { enabled: true, stopHookActive: false, capReached: false }

test('two finished helpers and no reviewer → review needed', () => {
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'researcher', 'done')]), o)).toBe(true)
})
test('one helper is not multi-part', () => {
  expect(needsReview(crewOf([row('a', 'builder', 'done')]), o)).toBe(false)
})
test('a failed helper still counts as a part; every helper must be finished', () => {
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'tester', 'failed')]), o)).toBe(true)
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'tester', 'running')]), o)).toBe(false)
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done'), row('c', 'tester', 'running')]), o)).toBe(false)
})
test('a reviewer in the crew satisfies it', () => {
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done'), row('r', 'reviewer', 'done')]), o)).toBe(false)
})
test('never twice, never when off, never at a cap, never when the stop hook is already active', () => {
  const s = crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done')])
  expect(needsReview({ ...s, gateFired: true }, o)).toBe(false)
  expect(needsReview(s, { ...o, enabled: false })).toBe(false)
  expect(needsReview(s, { ...o, capReached: true })).toBe(false)
  expect(needsReview(s, { ...o, stopHookActive: true })).toBe(false)
})
test('a crew from an earlier main turn does not gate this one', () => {
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done')], { mainTurn: 2 }), o)).toBe(false)
})
