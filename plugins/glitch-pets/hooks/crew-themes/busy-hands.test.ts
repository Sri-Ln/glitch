import { expect, test } from 'claude-code/testing'

import type { Role } from '../behavior/types'
import { PERSONAS } from '../personas/index'
import busyHands, { BUSY_KEYS, TEMPO, actionPoints, beatsOf, modelOf } from './busy-hands'
import type { CrewMiniInput } from './types'

const ROLES: Role[] = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']
const at = (over: Partial<CrewMiniInput>): CrewMiniInput => ({ persona: PERSONAS.fork!, role: 'builder', model: null, effort: null, status: 'running', elapsedMs: 0, ...over })
const art = (frame: readonly string[]): string => frame.map(r => r.slice(16)).join('\n')

test('the model id picks Haiku, Sonnet or Opus; anything else is the middle', () => {
  expect(modelOf('claude-haiku-4-5')).toBe('haiku')
  expect(modelOf('us.anthropic.claude-opus-4-1[1m]')).toBe('opus')
  expect(modelOf('claude-sonnet-4-5')).toBe('sonnet')
  expect(modelOf('some-other-model')).toBe('sonnet')
  expect(modelOf(null)).toBe('sonnet')
  expect(beatsOf('haiku')).toBe(1)
  expect(beatsOf('sonnet')).toBe(2)
  expect(beatsOf('opus')).toBe(3)
})

test('tempo: Haiku quick, Opus deliberate; the theme fps covers the quickest', () => {
  expect(TEMPO.haiku).toBeGreaterThan(TEMPO.sonnet)
  expect(TEMPO.sonnet).toBeGreaterThan(TEMPO.opus)
  expect(busyHands.fps).toBe(TEMPO.haiku)
})

test('a running member loops 4 beats at its tempo', () => {
  const step = 1000 / TEMPO.haiku
  const frames = [0, 1, 2, 3, 4].map(i => busyHands.mini(at({ model: 'claude-haiku-4-5', elapsedMs: i * step + 1 })).frame)
  // Each beat differs from the next (a beat may repeat: the hammer goes up, down, up).
  for (let i = 0; i < 4; i++) expect(art(frames[i + 1]!)).not.toBe(art(frames[i]!))
  expect(art(frames[4]!)).toBe(art(frames[0]!))
})

test("every pet's whole 16 columns are kept: the action never draws over the pet", () => {
  for (const persona of Object.values(PERSONAS))
    for (const role of ROLES)
      for (const model of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1'])
        for (const ms of [0, 130, 260, 400, 700]) {
          const idle = persona!.moods.idle.frames[0]!
          expect(busyHands.mini(at({ persona: persona!, role, model, elapsedMs: ms })).frame.map(r => r.slice(0, 16))).toEqual([...idle])
        }
})

test('nextChangeMs: the time to the next beat at the model tempo while running; none when finished', () => {
  // Opus at 3 beats/s: beats at 0, 333.3, 666.7 ms.
  expect(busyHands.mini(at({ model: 'claude-opus-4-1', elapsedMs: 0 })).nextChangeMs).toBe(334)
  expect(busyHands.mini(at({ model: 'claude-opus-4-1', elapsedMs: 300 })).nextChangeMs).toBe(34)
  expect(busyHands.mini(at({ model: 'claude-haiku-4-5', elapsedMs: 100 })).nextChangeMs).toBe(25)
  expect(busyHands.mini(at({ model: null, elapsedMs: 0 })).nextChangeMs).toBe(200)
  expect(busyHands.mini(at({ status: 'done', elapsedMs: 100 })).nextChangeMs).toBeUndefined()
  expect(busyHands.mini(at({ status: 'failed', elapsedMs: 100 })).nextChangeMs).toBeUndefined()
})

test('more model, more output per beat: Opus shows more sparks than Haiku', () => {
  const count = (model: string) => {
    const pts = [0, 1, 2, 3].flatMap(i => actionPoints('builder', i, beatsOf(modelOf(model))))
    return pts.filter(([, , ch]) => ch === '^').length
  }
  expect(count('claude-opus-4-1')).toBeGreaterThan(count('claude-sonnet-4-5'))
  expect(count('claude-sonnet-4-5')).toBeGreaterThan(count('claude-haiku-4-5'))
})

test('done and failed members hold one still frame', () => {
  for (const status of ['done', 'failed'] as const) {
    const a = busyHands.mini(at({ status, elapsedMs: 0 })).frame
    for (const ms of [130, 260, 999, 5000]) expect(busyHands.mini(at({ status, elapsedMs: ms })).frame).toEqual(a)
  }
})

test('every role has its own action, drawn inside the 8 columns beside the pet, with busy-hands keys only', () => {
  const looks = new Set<string>()
  for (const role of ROLES)
    for (const n of [1, 2, 3])
      for (const i of [0, 1, 2, 3]) {
        const pts = actionPoints(role, i, n)
        for (const [x, y, ch] of pts) {
          expect(x >= 0 && x < 8 && y >= 0 && y < 13).toBe(true)
          expect(BUSY_KEYS.includes(ch)).toBe(true)
        }
        if (i === 0 && n === 2) looks.add(JSON.stringify(pts))
      }
  expect(looks.size).toBe(ROLES.length)
})
