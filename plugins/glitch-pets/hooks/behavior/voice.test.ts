import { expect, test } from 'claude-code/testing'

import { INITIAL_VOICE, pickLine } from './voice'
import type { Persona } from './types'

const p = { name: 'Bud', voice: { happy: ['a', 'b', 'c'], worried: ['w1', 'w2', 'w3'], oops: ['o1', 'o2', 'o3'], cheering: ['c1', 'c2', 'c3'], sleepy: ['s1', 's2', 's3'], crewDone: ['d1', 'd2', 'd3'] } } as unknown as Persona
const o = { now: 1_000_000, isTurnRunning: false, enabled: true, everyMs: 180_000, random: () => 0 }

test('says a line with the pet name', () => {
  expect(pickLine(p, 'happy', INITIAL_VOICE, o)).toEqual({ text: 'Bud: a', state: { lastAt: 1_000_000, lastLine: 'a' } })
})
test('silent while a turn runs or when off', () => {
  expect(pickLine(p, 'happy', INITIAL_VOICE, { ...o, isTurnRunning: true })).toBe(null)
  expect(pickLine(p, 'happy', INITIAL_VOICE, { ...o, enabled: false })).toBe(null)
})
test('spaced by everyMs', () => {
  const s = { lastAt: 1_000_000 - 179_999, lastLine: 'x' }
  expect(pickLine(p, 'happy', s, o)).toBe(null)
  expect(pickLine(p, 'happy', { ...s, lastAt: 1_000_000 - 180_000 }, o)?.text).toBe('Bud: a')
})
test('never the same line twice in a row', () => {
  const s = { lastAt: 0, lastLine: 'a' }
  expect(pickLine(p, 'happy', s, o)?.text).toBe('Bud: b')
})
