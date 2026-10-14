import { expect, test } from 'claude-code/testing'

import { parsePetArg, petList } from './commands'

test('parsePetArg', () => {
  expect(parsePetArg(undefined)).toEqual({ kind: 'show' })
  expect(parsePetArg('off')).toEqual({ kind: 'off' })
  expect(parsePetArg('Fork')).toEqual({ kind: 'pick', id: 'fork' })
  expect(parsePetArg('dragon')).toEqual({ kind: 'unknown', name: 'dragon' })
})
test('petList marks the current pet', () => {
  expect(petList('dot', ['screenhead', 'dot'])).toBe('Pets: screenhead, dot (current) · /glitch pet <name> | off')
  expect(petList('off', ['dot'])).toBe('Pets: dot · pet is off · /glitch pet <name> | off')
})
