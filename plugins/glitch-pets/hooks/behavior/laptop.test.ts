import { expect, test } from 'claude-code/testing'

import { LAPTOP_PALETTE, laptopFrames, withLaptop } from './laptop'
import type { Frame, Persona } from './types'
import { LAPTOP_KEYS, MOOD_IDS, VOICE_MOMENTS } from './types'

const BASE: Frame = Array.from({ length: 13 }, (_, y) => (y < 7 ? `${'abcdefg'[y]}`.repeat(16) : '.'.repeat(16)))
const cell = (f: Frame, x: number, y: number) => f[y]![x]

test('laptopFrames: six 13 × 16 frames with the base above the lid and the laptop below', () => {
  const frames = laptopFrames(BASE, 'p')
  expect(frames).toHaveLength(6)
  for (const f of frames) {
    expect(f).toHaveLength(13)
    for (const r of f) expect(r).toHaveLength(16)
    expect(f.slice(0, 7)).toEqual(BASE.slice(0, 7))
    expect(f[12]).toBe('..777777777777..')
    for (const y of [7, 8, 9, 10, 11]) expect(f[y]!.slice(3, 13).replace(/6/g, '4')).toBe('4444444444')
  }
})

test('the logo glows on frames 0, 1, 3, 4 and blinks off on 2 and 5', () => {
  const on = laptopFrames(BASE, 'p').map(f => cell(f, 7, 9) === '6' && cell(f, 8, 9) === '6')
  expect(on).toEqual([true, true, false, true, true, false])
})

test('paws alternate: even frames left up, odd frames right up', () => {
  laptopFrames(BASE, 'p').forEach((f, n) => {
    const even = n % 2 === 0
    expect(cell(f, 2, even ? 10 : 11)).toBe('p')
    expect(cell(f, 13, even ? 11 : 10)).toBe('p')
    expect(cell(f, 2, even ? 11 : 10)).toBe('.')
    expect(cell(f, 13, even ? 10 : 11)).toBe('.')
  })
})

const A: Frame = BASE
const B: Frame = BASE.map(r => r.toUpperCase())
const persona = (): Persona => ({
  id: 'bud',
  name: 'T',
  kind: 'thing',
  temperament: 'calm',
  palette: { a: '#112233', p: '#445566' },
  moods: Object.fromEntries(MOOD_IDS.map(m => [m, { frames: [A, B], fps: 2 }])) as unknown as Persona['moods'],
  hatAnchor: { x: 8, y: 2 },
  laptopPaw: 'p',
  voice: Object.fromEntries(VOICE_MOMENTS.map(v => [v, ['one', 'two', 'three']])) as unknown as Persona['voice'],
  rod: { hold: { frame: A, tip: { x: 15, y: 1 } }, flick: { frame: A, tip: { x: 15, y: 2 } }, bent: { frame: B, tip: { x: 15, y: 3 } }, stowed: A },
})
const withWorking = (fps: number): Persona => {
  const p = persona()
  return { ...p, moods: { ...p.moods, working: { frames: [A, B, A, B], fps }, idle: { frames: [A, B], fps: 1 } } }
}

test('withLaptop: the signature move goes to idle at half pace, working is the laptop', () => {
  const out = withLaptop(withWorking(8))
  expect(out.moods.idle).toEqual({ frames: [A, B, A, B], fps: 4 })
  expect(out.moods.working).toEqual({ frames: laptopFrames(A, 'p'), fps: 6 })
  expect(out.moods.tired).toEqual({ frames: laptopFrames(A, 'p'), fps: 3 })
  expect(withLaptop(withWorking(3)).moods.idle.fps).toBe(2)
})

test('withLaptop adds the laptop palette, leaves other moods alone and does not mutate', () => {
  const src = withWorking(8)
  const out = withLaptop(src)
  expect(out.palette).toEqual({ a: '#112233', p: '#445566', ...LAPTOP_PALETTE })
  for (const m of MOOD_IDS) if (!['idle', 'working', 'tired'].includes(m)) expect(out.moods[m]).toBe(src.moods[m])
  expect(src.moods.working.frames).toEqual([A, B, A, B])
  expect(src.moods.idle.fps).toBe(1)
  expect(Object.keys(src.palette)).toEqual(['a', 'p'])
})

test('LAPTOP_KEYS (the keys pets and crew themes leave alone) are exactly the laptop palette', () => {
  expect([...LAPTOP_KEYS].sort()).toEqual(Object.keys(LAPTOP_PALETTE).sort())
})
