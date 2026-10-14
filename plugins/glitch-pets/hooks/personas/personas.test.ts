import { expect, test } from 'claude-code/testing'

import { personaProblems } from '../behavior/contract'
import { PERSONAS } from './index'

for (const [id, persona] of Object.entries(PERSONAS)) {
  test(`${id} keeps the persona contract`, () => {
    expect(persona?.id).toBe(id as never)
    expect(personaProblems(persona!)).toEqual([])
  })
  test(`${id}'s working loop is its signature: at least 4 frames, at least 3 distinct poses`, () => {
    const frames = persona!.moods.working.frames.map(f => f.join('\n'))
    expect(frames.length).toBeGreaterThanOrEqual(4)
    expect(new Set(frames).size).toBeGreaterThanOrEqual(3)
  })
}

test('every persona has a distinct name', () => {
  const names = Object.values(PERSONAS).map(p => p!.name)
  expect(new Set(names).size).toBe(names.length)
})
