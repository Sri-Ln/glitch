import { expect, test } from 'claude-code/testing'

import { parsePetArg, petArgsOf, petList } from './commands'

test('petArgsOf reduces both entry points to the pet argument', () => {
  expect(petArgsOf('glitch-pets', '')).toBe('')
  expect(petArgsOf('glitch-pets', 'fork')).toBe('fork')
  expect(petArgsOf('glitch-pets', 'pet')).toBe('')
  expect(petArgsOf('glitch-pets', 'pet dot')).toBe('dot')
  expect(petArgsOf('glitch', 'pet bud')).toBe('bud')
  expect(petArgsOf('glitch', 'pet')).toBe('')
})
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
