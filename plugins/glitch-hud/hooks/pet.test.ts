import { expect, test } from 'claude-code/testing'

import { PET_CELLS, isSprite } from './pet'

test('isSprite accepts only the full shape with an svg source', () => {
  expect(isSprite({ source: '<svg/>', alt: 'Bud', width: 24, height: 20 })).toBe(true)
  for (const bad of [null, 'x', 5, {}, { source: 5, alt: 'a', width: 1, height: 1 }, { source: '<svg/>', alt: 'a', width: 24 }, { source: 'hi', alt: 'a', width: 24, height: 20 }, { source: '<svg/>', alt: 'a', width: 0, height: 20 }, { source: '<svg/>', alt: 'a', width: 999, height: 20 }]) {
    expect(isSprite(bad)).toBe(false)
  }
})

test('the pet takes four cells', () => expect(PET_CELLS).toBe(4))
