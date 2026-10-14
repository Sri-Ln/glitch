import { expect, test } from 'claude-code/testing'

import { PET_CELLS, isSprite } from './pet'

test('isSprite accepts only the full shape with an svg source', () => {
  expect(isSprite({ source: '<svg/>', alt: 'Bud', width: 32, height: 26 })).toBe(true)
  for (const bad of [null, 'x', 5, {}, { source: 5, alt: 'a', width: 1, height: 1 }, { source: '<svg/>', alt: 'a', width: 32 }, { source: 'hi', alt: 'a', width: 32, height: 26 }, { source: '<svg/>', alt: 'a', width: 0, height: 26 }, { source: '<svg/>', alt: 'a', width: 999, height: 26 }]) {
    expect(isSprite(bad)).toBe(false)
  }
})

test('the pet takes five cells', () => expect(PET_CELLS).toBe(5))
