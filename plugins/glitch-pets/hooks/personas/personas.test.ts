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
  test(`${id}'s pleased is its signature flourish: 6 frames at 5 fps, at most its first one a happy frame (no hop)`, () => {
    const art = persona!.moods.pleased
    expect(art.frames).toHaveLength(6)
    expect(art.fps).toBe(5)
    const happy = new Set(persona!.moods.happy.frames.map(f => f.join('\n')))
    for (const f of art.frames.slice(1)) expect(happy.has(f.join('\n'))).toBe(false)
    expect(new Set(art.frames.map(f => f.join('\n'))).size).toBeGreaterThanOrEqual(3)
  })
  test(`${id}'s rod: the tip sits at the right edge (columns 14-15) and drops under the gift`, () => {
    const { hold, flick, bent, stowed } = persona!.rod
    for (const pose of [hold, flick, bent]) {
      expect(pose.tip.x).toBeGreaterThanOrEqual(14)
      expect(pose.frame[pose.tip.y]![pose.tip.x]).not.toBe('.')
    }
    expect(bent.tip.y).toBeGreaterThan(hold.tip.y)
    expect(bent.frame.join('\n')).not.toBe(hold.frame.join('\n'))
    expect(stowed.join('\n')).not.toBe(hold.frame.join('\n'))
  })
}

test("Fork's smile has no dark seam under the mouth's ends (it read as dripping)", () => {
  const smile = PERSONAS.fork!.moods.happy.frames[1]!
  expect(smile[10]![6]).toBe('o')
  expect(smile[10]![9]).toBe('o')
  for (const f of PERSONAS.fork!.moods.cheering.frames) {
    const y = f.findIndex(r => r.includes('eeee'))
    expect(f[y + 1]![6]).toBe('o')
    expect(f[y + 1]![9]).toBe('o')
  }
})

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
