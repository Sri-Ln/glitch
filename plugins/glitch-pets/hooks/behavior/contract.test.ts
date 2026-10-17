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
  rod: { hold: { frame: F, tip: { x: 15, y: 1 } }, flick: { frame: F, tip: { x: 15, y: 2 } }, bent: { frame: F, tip: { x: 15, y: 3 } }, stowed: F },
})

test('the rod needs its three poses and the stowed frame, each a grid frame with a tip inside the grid', () => {
  const p = good()
  expect(personaProblems({ ...p, rod: undefined } as unknown as Persona).join()).toContain('rod is missing')
  expect(personaProblems({ ...p, rod: { ...p.rod, bent: { frame: F, tip: { x: 16, y: 0 } } } }).join()).toContain('rod bent tip')
  expect(personaProblems({ ...p, rod: { ...p.rod, hold: { frame: F.slice(1), tip: { x: 1, y: 1 } } } }).join()).toContain('rod hold has 12 rows')
  expect(personaProblems({ ...p, rod: { ...p.rod, stowed: F.map(r => r.replace('aa', 'zz')) } }).join()).toContain('rod stowed row 6 uses "z"')
})

test('leadStatus wording is optional, but only for known situations and never empty', () => {
  const p = good()
  expect(personaProblems({ ...p, leadStatus: { many: 'juggling {n}', joy: '{who} is done' } })).toEqual([])
  expect(personaProblems({ ...p, leadStatus: { nonsense: 'x' } as never }).join()).toContain('not a lead situation')
  expect(personaProblems({ ...p, leadStatus: { worry: ' ' } }).join()).toContain('leadStatus worry')
})

test('the contract covers the lead moods investigating and pleased', () => {
  const p = good()
  const moods = { ...p.moods } as Record<string, unknown>
  delete moods.investigating
  delete moods.pleased
  const problems = personaProblems({ ...p, moods: moods as unknown as Persona['moods'] }).join()
  expect(problems).toContain('mood investigating is missing')
  expect(problems).toContain('mood pleased is missing')
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

test('a persona keeps to letter keys: digits and punctuation are reserved for crew themes and the laptop', () => {
  const p = good()
  for (const key of ['0', '9', '^', '~', '(']) {
    expect(personaProblems({ ...p, palette: { ...p.palette, [key]: '#000000' } }).join()).toContain('reserved for crew themes')
  }
})

test('the laptop paw must be a palette key', () => {
  expect(personaProblems({ ...good(), laptopPaw: 'z' }).join()).toContain('laptopPaw')
})

test('a composed persona (with the laptop palette) passes when told so', () => {
  const p = good()
  const composed = { ...p, palette: { ...p.palette, '4': '#000000' } }
  expect(personaProblems(composed, { composed: true })).toEqual([])
})
