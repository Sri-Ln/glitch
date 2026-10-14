import { expect, test } from 'claude-code/testing'

import { personaProblems } from './contract'
import type { Frame, Persona } from './types'
import { MOOD_IDS, VOICE_MOMENTS } from './types'

const F: Frame = Array.from({ length: 13 }, (_, y) => (y === 6 ? '.......aa.......' : '................'))
const good = (): Persona => ({
  id: 'bud',
  name: 'Test',
  kind: 'thing',
  temperament: 'calm',
  palette: { a: '#112233' },
  moods: Object.fromEntries(MOOD_IDS.map(m => [m, { frames: [F, F], fps: 2 }])) as unknown as Persona['moods'],
  hatAnchor: { x: 8, y: 2 },
  laptopPaw: 'a',
  voice: Object.fromEntries(VOICE_MOMENTS.map(v => [v, ['one', 'two', 'three']])) as unknown as Persona['voice'],
})

test('a complete persona has no problems', () => {
  expect(personaProblems(good())).toEqual([])
})

test('a missing mood, a short row, an unknown char and a bad color are each named', () => {
  const p = good()
  const moods = { ...p.moods } as Record<string, unknown>
  delete moods.sleepy
  const bad: Persona = {
    ...p,
    palette: { a: 'red', '1': '#000000' },
    moods: { ...(moods as unknown as Persona['moods']), idle: { frames: [['.'.repeat(15), ...F.slice(1)], F.map(r => r.replace('aa', 'zz'))], fps: 2 } },
  }
  const problems = personaProblems(bad).join('\n')
  expect(problems).toContain('sleepy')
  expect(problems).toContain('idle frame 0 row 0')
  expect(problems).toContain('"z"')
  expect(problems).toContain('#rrggbb')
  expect(problems).toContain('reserved')
})

test('voice lists need 3 to 5 lines and fps must be positive', () => {
  const p = good()
  const bad: Persona = { ...p, voice: { ...p.voice, oops: ['only one'] }, moods: { ...p.moods, happy: { frames: [F], fps: 0 } } }
  const problems = personaProblems(bad).join('\n')
  expect(problems).toContain('oops')
  expect(problems).toContain('happy fps')
})

test('the hat anchor must be inside the grid', () => {
  expect(personaProblems({ ...good(), hatAnchor: { x: 16, y: 0 } }).join()).toContain('hatAnchor')
})

test('a persona may not use a laptop palette key of its own', () => {
  const p = good()
  expect(personaProblems({ ...p, palette: { ...p.palette, '4': '#000000' } }).join()).toContain('reserved for the laptop')
})

test('the laptop paw must be a palette key', () => {
  expect(personaProblems({ ...good(), laptopPaw: 'z' }).join()).toContain('laptopPaw')
})

test('a composed persona (with the laptop palette) passes when told so', () => {
  const p = good()
  const composed = { ...p, palette: { ...p.palette, '4': '#000000' } }
  expect(personaProblems(composed, { composed: true })).toEqual([])
})
