import { expect, test } from 'claude-code/testing'

import { HATCHLING, JUNIOR, LOOK_ROLES, MODELS, OPTIONS } from './crew-looks'

const idle = Array.from({ length: 13 }, () => '..oooooooooooo..')
const pet = { id: 'fork' as const, palette: { o: '#c264ff' }, idle, hatAnchor: { x: 7, y: 1 } }

test('every option keeps a fixed frame size for every role and model', () => {
  for (const opt of OPTIONS)
    for (const role of LOOK_ROLES)
      for (const model of MODELS) {
        const look = opt.make(pet, role, model)
        expect(look.frames.length).toBeGreaterThan(0)
        expect(look.frames.every(f => f.length === look.height && f.every(r => r.length === look.width))).toBe(true)
        expect(look.still).toBeLessThan(look.frames.length)
      }
})

test('the hand-drawn young pets are 12 × 10 and 8 × 7', () => {
  for (const f of Object.values(JUNIOR)) expect(f.length === 10 && f.every(r => r.length === 12)).toBe(true)
  for (const f of Object.values(HATCHLING)) expect(f.length === 7 && f.every(r => r.length === 8)).toBe(true)
})
