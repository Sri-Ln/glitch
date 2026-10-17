import { expect, test } from 'claude-code/testing'

import { PERSONAS } from '../personas/index'
import { INITIAL_CREW } from './crew'
import type { CrewRow, CrewState } from './crew'
import { leadLine, leadStatus, statusText, whoOf } from './lead-status'
import { LEAD_SITUATIONS } from './types'
import { INITIAL_REACTIONS, JOY_MS, WORRY_MS, applyCrewEvents } from './reactions'

const T = 1_000_000
const row = (id: string, status: CrewRow['status'] = 'running', over: Partial<CrewRow> = {}): CrewRow => ({
  id, name: id, named: true, description: `task ${id}`, role: id.startsWith('reviewer') ? 'reviewer' : 'builder', tier: 'medium', model: null, effort: null,
  tokens: 0, weight: 0, turnTokens: 0, turnWeight: 0, tools: 0, startedAt: T - 10_000, endedAt: status === 'running' ? null : T, status, ...over,
})
const crewOf = (...rows: CrewRow[]): CrewState => ({ ...INITIAL_CREW, closed: false, startedAt: T - 10_000, rows })
const neutral = { leadStatus: undefined }
const fork = PERSONAS.fork!
const none = INITIAL_REACTIONS

test('neutral wording for the crew at work', () => {
  expect(leadStatus(neutral, crewOf(row('builder-1'), row('builder-2'), row('tester-3')), none, T)).toBe('keeping an eye on the crew (3 at work)')
  expect(leadStatus(neutral, crewOf(row('builder-1'), row('tester-2', 'done')), none, T)).toBe('waiting on builder-1')
  expect(leadStatus(neutral, crewOf(row('builder-1', 'done'), row('reviewer-1')), none, T)).toBe('checking the work')
})

test('neutral wording once the crew is back', () => {
  expect(leadStatus(neutral, crewOf(row('builder-1', 'done'), row('tester-2', 'done')), none, T)).toBe('job done, the whole crew is back')
  expect(leadStatus(neutral, crewOf(row('a', 'done'), row('b', 'done'), row('c', 'done'), row('d', 'failed')), none, T)).toBe('3 done, 1 needs a look')
  expect(leadStatus(neutral, crewOf(row('a', 'done'), row('c', 'failed'), row('d', 'failed')), none, T)).toBe('1 done, 2 need a look')
  expect(leadStatus(neutral, crewOf(), none, T)).toBe('ready for a crew')
})

test('an unnamed member is named by its task, cut short', () => {
  const r = row('x', 'running', { name: undefined, description: 'write the date formatting helpers' })
  expect(leadStatus(neutral, crewOf(r), none, T)).toBe('waiting on write the date…')
})

test('reactions: a snag, then looking into it while the crew works; a finish is done', () => {
  const crew = crewOf(row('builder-1', 'failed'), row('tester-2'))
  const failed = applyCrewEvents(none, [{ kind: 'failed', id: 'builder-1', name: 'builder-1', at: T }])
  expect(leadStatus(neutral, crew, failed, T + 10)).toBe('builder-1 hit a snag')
  expect(leadStatus(neutral, crew, failed, T + WORRY_MS)).toBe('looking into builder-1')
  const joy = applyCrewEvents(none, [{ kind: 'done', id: 'tester-2', name: 'tester-2', at: T }])
  expect(leadStatus(neutral, crewOf(row('tester-2', 'done'), row('b')), joy, T + 10)).toBe('tester-2 is done')
  expect(leadStatus(neutral, crewOf(row('tester-2', 'done'), row('b')), joy, T + JOY_MS)).toBe('waiting on b')
})

test('several finishes at once read as one line, in number', () => {
  const evs = ['a', 'b', 'c'].map((id, i) => ({ kind: 'done' as const, id, name: id, at: T + i * 100 }))
  const crew = crewOf(row('a', 'done'), row('b', 'done'), row('c', 'done'), row('d'))
  expect(leadStatus(neutral, crew, applyCrewEvents(none, evs.slice(0, 2)), T + 300)).toBe('a and b are done')
  expect(leadStatus(neutral, crew, applyCrewEvents(none, evs), T + 300)).toBe('3 of the crew are done')
})

test("a pet's own voice fills in the same blanks; a pet without one is neutral", () => {
  expect(leadStatus(fork, crewOf(row('builder-1'), row('builder-2')), none, T)).toBe('juggling the crew (2 at work)')
  expect(leadStatus(fork, crewOf(row('a', 'done'), row('c', 'failed')), none, T)).toBe('1 done, 1 to replan')
  expect(leadStatus(PERSONAS.screenhead!, crewOf(row('builder-1'), row('builder-2')), none, T)).toBe('keeping an eye on the crew (2 at work)')
  expect(leadLine(PERSONAS.bud!, crewOf(row('builder-1')), none, T)).toBe('Bud · waiting for builder-1!')
})

test('every pet template (and the neutral wording) agrees in number, with 1 and with 3', () => {
  const BAD = [/\b1 need\b/, /\b1 buddies\b/, /\ball 1\b/, /\b1 of the crew\b/, /of the crew (is|done)\b/, /\b3 needs\b/, /builder-1 are\b/]
  for (const p of [neutral, ...Object.values(PERSONAS)]) {
    for (const situation of LEAD_SITUATIONS) {
      for (const n of [1, 3]) {
        const text = statusText(p, situation, { who: n === 1 ? 'builder-1' : whoOf(['a', 'b', 'c']), n, d: n, f: n })
        for (const bad of BAD) expect(`${situation} ${n}: ${text}`).not.toMatch(bad)
      }
    }
  }
})

test('no pet uses the word "helpers" in its status wording', () => {
  for (const p of Object.values(PERSONAS)) for (const t of Object.values(p!.leadStatus ?? {})) expect([t].flat().join(' ')).not.toMatch(/helper/i)
})
