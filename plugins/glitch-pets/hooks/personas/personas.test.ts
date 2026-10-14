import { expect, test } from 'claude-code/testing'

import { personaProblems } from '../behavior/contract'
import blob from './blob'
import bud from './bud'
import dot from './dot'
import fork from './fork'
import { composeSafely, PERSONAS } from './index'
import pixel from './pixel'
import screenhead from './screenhead'

const FILES = { screenhead, blob, pixel, dot, fork, bud }

for (const [id, persona] of Object.entries(PERSONAS)) {
  test(`${id} keeps the persona contract`, () => {
    expect(persona?.id).toBe(id as never)
    // As written, the file may not touch the laptop's keys; composed, it has them by design.
    expect(personaProblems(FILES[id as keyof typeof FILES])).toEqual([])
    expect(personaProblems(persona!, { composed: true })).toEqual([])
  })
  test(`${id}'s idle is its signature: at least 4 frames, at least 3 distinct poses`, () => {
    const frames = persona!.moods.idle.frames.map(f => f.join('\n'))
    expect(frames.length).toBeGreaterThanOrEqual(4)
    expect(new Set(frames).size).toBeGreaterThanOrEqual(3)
  })
  test(`${id}'s working is the laptop: rows 7-12 are the laptop on every frame`, () => {
    for (const f of persona!.moods.working.frames) {
      expect(f[12]).toBe('..777777777777..')
      for (const y of [7, 8, 9, 10, 11]) expect(f[y]!.slice(3, 13)).toMatch(/^[46]+$/)
    }
  })
}

test('every persona has a distinct name', () => {
  const names = Object.values(PERSONAS).map(p => p!.name)
  expect(new Set(names).size).toBe(names.length)
})

test('a broken persona file is left out, never fatal; a good one still composes', () => {
  const broken = { ...bud, moods: { ...bud.moods, idle: undefined } } as unknown as typeof bud
  const empty = { ...bud, moods: { ...bud.moods, idle: { frames: [], fps: 2 } } } as typeof bud
  const noMoods = { ...bud, moods: undefined } as unknown as typeof bud
  expect(composeSafely(broken)).toBeUndefined()
  expect(composeSafely(empty)).toBeUndefined()
  expect(composeSafely(noMoods)).toBeUndefined()
  expect(composeSafely(bud)?.moods.working.frames).toHaveLength(6)
})
