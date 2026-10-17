import { expect, test } from 'claude-code/testing'

import { crewThemeArgOf, parsePetArg, parseThemeArg, petArgsOf, petList, themeList } from './commands'

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

// ── Crew themes (/glitch crew theme [id]) ──
test('crewThemeArgOf finds `crew theme [id]` in either entry point', () => {
  expect(crewThemeArgOf('crew')).toBeNull()
  expect(crewThemeArgOf('pet fork')).toBeNull()
  expect(crewThemeArgOf('crew theme')).toBe('')
  expect(crewThemeArgOf(' crew  Theme  hats ')).toBe('hats')
})
test('parseThemeArg', () => {
  expect(parseThemeArg('', ['busy-hands', 'hats'])).toEqual({ kind: 'show' })
  expect(parseThemeArg('Hats', ['busy-hands', 'hats'])).toEqual({ kind: 'pick', id: 'hats' })
  expect(parseThemeArg('sparkles', ['busy-hands', 'hats'])).toEqual({ kind: 'unknown', name: 'sparkles' })
})
test('themeList marks the current theme', () => {
  expect(themeList('hats', [{ id: 'busy-hands', name: 'Busy hands' }, { id: 'hats', name: 'Hats' }])).toBe(
    'Crew themes: busy-hands (Busy hands), hats (Hats) (current) · /glitch crew theme <id>',
  )
})
