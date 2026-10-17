import { expect, test } from 'claude-code/testing'

import { ROLES, boldHat, compactHat, propHat } from './hats-v2'

const frame = Array.from({ length: 13 }, () => '................')

test('each mockup variant keeps a fixed frame size and draws every role, the reviewer included', () => {
  for (const role of ROLES) {
    const a = boldHat(frame, { x: 7, y: 2 }, role, 'light').frame
    expect(a.length).toBe(19)
    expect(a.every(r => r.length === 16)).toBe(true)
    const b = propHat(frame, { x: 7, y: 2 }, role, 'heavy').frame
    expect(b.length).toBe(16)
    expect(b.every(r => r.length === 20)).toBe(true)
    expect(compactHat(frame, { x: 7, y: 2 }, role, 'medium').frame.join('')).toMatch(/[12]/)
  }
})

test('a hat at the edge is clipped, never widens the frame', () => {
  expect(boldHat(frame, { x: 0, y: 0 }, 'designer', 'medium').frame.every(r => r.length === 16)).toBe(true)
})
