import { expect, test } from 'claude-code/testing'

import { CREW_RULE, GATE_TEXT, needsReview } from './gate'
import type { CrewRow, CrewState } from './crew'
import { INITIAL_CREW } from './crew'

const row = (id: string, role: CrewRow['role'], status: CrewRow['status'], named = true): CrewRow =>
  ({ id, role, status, named, description: id, tier: 'medium', model: null, effort: null, tokens: 0, weight: 0, tools: 0, startedAt: 0, endedAt: null }) as CrewRow
const crewOf = (rows: CrewRow[], extra: Partial<CrewState> = {}): CrewState => ({ ...INITIAL_CREW, closed: false, startedAt: 0, rows, ...extra })
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
test('a crew that spans main turns is still checked; a closed one is not', () => {
  const s = crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done')], { turnBusy: false })
  expect(needsReview(s, o)).toBe(true)
  expect(needsReview({ ...s, closed: true }, o)).toBe(false)
})

test('only crew-named helpers count; any reviewer row satisfies it', () => {
  expect(needsReview(crewOf([row('a', 'researcher', 'done', false), row('b', 'researcher', 'done', false)]), o)).toBe(false)
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done'), row('x', 'other', 'running', false)]), o)).toBe(true)
  expect(needsReview(crewOf([row('a', 'builder', 'done'), row('b', 'builder', 'done'), row('r', 'reviewer', 'done', false)]), o)).toBe(false)
})

test('a failed helper held for a step-up is not finished yet', () => {
  const s = crewOf([row('a', 'builder', 'failed'), row('b', 'builder', 'done')])
  expect(needsReview(s, { ...o, held: ['a'] })).toBe(false)
  expect(needsReview(s, { ...o, held: ['x'] })).toBe(true)
  expect(needsReview(s, o)).toBe(true)
})

test('the crew rule names the crew tier types', () => {
  expect(CREW_RULE).toContain('glitch-pets:crew-<tier>')
  expect(CREW_RULE).toContain('no model or effort')
})

test('the rule and the reminder start a lean reviewer that verifies, not redoes', () => {
  for (const t of [CREW_RULE, GATE_TEXT]) {
    expect(t).toContain('reviewer-1')
    expect(t).toContain('subagent_type glitch-pets:crew-reviewer')
    expect(t).toContain('verify, not redo')
    expect(t).toContain('at most 2 rounds')
    expect(t).toContain('only what changed')
  }
})
