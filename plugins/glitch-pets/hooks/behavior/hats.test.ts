import { expect, test } from 'claude-code/testing'

import { TIER_COLORS, withHat } from './hats'

const frame = Array.from({ length: 13 }, () => '................')

test('a hat adds 3 rows on top and sits its brim at the anchor', () => {
  const { frame: f, palette } = withHat(frame, { x: 7, y: 2 }, 'builder', 'heavy')
  expect(f.length).toBe(16)
  expect(f.every(r => r.length === 16)).toBe(true)
  // Anchor y 2: the hat takes rows 2–4 of the 16-row frame; the head's top is row 5.
  expect(f[3]).toContain('1')
  expect(f[4]).toContain('2')
  expect(palette['1']).toBe(TIER_COLORS.heavy)
})

test('every role but the reviewer has a hat; the reviewer draws none', () => {
  for (const role of ['builder', 'researcher', 'designer', 'tester', 'other'] as const) {
    expect(withHat(frame, { x: 7, y: 2 }, role, 'light').frame.join('')).toMatch(/[123]/)
  }
  expect(withHat(frame, { x: 7, y: 2 }, 'reviewer', 'light').frame.join('')).not.toMatch(/[123]/)
})

test('a hat near the edge is clipped, never widens the frame', () => {
  const { frame: f } = withHat(frame, { x: 0, y: 0 }, 'designer', 'medium')
  expect(f.every(r => r.length === 16)).toBe(true)
})
