import { expect, test } from 'claude-code/testing'

import { createPlayer, frameIndex, frameSvg } from './player'
import type { Frame, Persona } from './types'
import { MOOD_IDS, VOICE_MOMENTS } from './types'

const row = (s: string) => s.padEnd(16, '.')
const A: Frame = [row('aab'), ...Array.from({ length: 12 }, () => row(''))]
const B: Frame = [row('b'), ...Array.from({ length: 12 }, () => row(''))]
const persona: Persona = {
  id: 'bud', name: 'Bud', kind: 'dog', temperament: 'eager',
  palette: { a: '#ff0000', b: '#00ff00' },
  moods: Object.fromEntries(MOOD_IDS.map(m => [m, { frames: [A, B], fps: 4 }])) as unknown as Persona['moods'],
  hatAnchor: { x: 8, y: 1 },
  laptopPaw: 'a',
  voice: Object.fromEntries(VOICE_MOMENTS.map(v => [v, ['a', 'b', 'c']])) as unknown as Persona['voice'],
  rod: { hold: { frame: A, tip: { x: 15, y: 1 } }, flick: { frame: A, tip: { x: 15, y: 2 } }, bent: { frame: B, tip: { x: 15, y: 3 } }, stowed: A },
}

test('frameIndex steps at the mood fps and loops', () => {
  const art = { frames: [A, B], fps: 4 }
  expect(frameIndex(art, 0)).toBe(0)
  expect(frameIndex(art, 249)).toBe(0)
  expect(frameIndex(art, 250)).toBe(1)
  expect(frameIndex(art, 500)).toBe(0)
})

test('frameSvg merges runs of one color into one rect and sizes by pixel', () => {
  const svg = frameSvg(persona.palette, A, 2)
  expect(svg).toContain('width="32" height="26"')
  expect(svg).toContain('viewBox="0 0 16 13"')
  expect(svg).toContain('<rect x="0" y="0" width="2" height="1" fill="#ff0000"/>')
  expect(svg).toContain('<rect x="2" y="0" width="1" height="1" fill="#00ff00"/>')
  expect(svg.match(/<rect/g)?.length).toBe(2)
  expect(svg).toContain('shape-rendering="crispEdges"')
})

test('frameSvg rounds fractional pixel sizes to whole CSS px', () => {
  const svg = frameSvg(persona.palette, A, 1.5)
  expect(svg).toContain('width="24" height="20"')
  expect(svg).toContain('viewBox="0 0 16 13"')
})

test('the player returns the same string object for the same frame (cached)', () => {
  const player = createPlayer()
  const one = player.sprite(persona, 'working', 0)
  const two = player.sprite(persona, 'working', 100)
  expect(two.source).toBe(one.source)
  expect(one.width).toBe(24)
  expect(one.height).toBe(20)
  expect(one.alt).toBe('Bud the dog, working')
  expect(player.sprite(persona, 'working', 250).source).not.toBe(one.source)
})
