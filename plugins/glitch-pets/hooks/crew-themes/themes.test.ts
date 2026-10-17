import { expect, test } from 'claude-code/testing'

import { personaProblems } from '../behavior/contract'
import type { Persona } from '../behavior/types'
import { PERSONAS } from '../personas/index'
import { THEME_MODELS, themeProblems } from './contract'
import { CREW_THEMES, DEFAULT_CREW_THEME, crewMini, crewThemeIds } from './index'
import type { CrewTheme } from './types'

const pets = Object.values(PERSONAS) as Persona[]
const input = (over: Partial<Parameters<CrewTheme['mini']>[0]> = {}): Parameters<CrewTheme['mini']>[0] => ({
  persona: PERSONAS.bud!, role: 'builder', model: 'claude-sonnet-4-5', effort: null, status: 'running', elapsedMs: 0, ...over,
})

test('the registry holds busy-hands (the default) and hats', () => {
  expect(DEFAULT_CREW_THEME).toBe('busy-hands')
  expect(crewThemeIds()).toEqual(['busy-hands', 'hats'])
  for (const [id, theme] of Object.entries(CREW_THEMES)) expect(theme.id).toBe(id)
})

for (const theme of Object.values(CREW_THEMES)) {
  test(`${theme.id} keeps the crew-theme contract for every pet × role × model × status`, () => {
    expect(pets.length).toBe(6)
    expect(themeProblems(theme, pets)).toEqual([])
  })
}

test('the contract checker names a wrong size, an unknown key, a letter key and a blank mini', () => {
  const bad: CrewTheme = {
    id: 'bad', name: 'Bad', description: 'breaks every rule', size: { columns: 16, rows: 13 }, keys: ['1', 'q', '4'],
    mini: ({ role }) => ({ frame: role === 'builder' ? ['.'.repeat(17)] : Array.from({ length: 13 }, () => '9'.repeat(16)), palette: { '9': '#000000' } }),
  }
  const problems = themeProblems(bad, [PERSONAS.bud!]).join('\n')
  expect(problems).toContain('rows, not 13')
  expect(problems).toContain('wide, not 16')
  expect(problems).toContain('"q"')
  expect(problems).toContain('"4"')
  expect(problems).toContain('"9" is not one of its keys')
  expect(problems).toContain('no pixel of the pet')
})

test('the checker holds a mini to its nextChangeMs: still when absent, a new frame at that time when set', () => {
  const pet = PERSONAS.bud!
  const idle = pet.moods.idle.frames[0]!
  const blink = (ms: number) => [ms % 1000 < 500 ? idle[0]! : '0' + idle[0]!.slice(1), ...idle.slice(1)]
  const base = { name: 'T', description: 'test', size: { columns: 16, rows: 13 }, keys: ['0'] }
  const silent: CrewTheme = { ...base, id: 'silent', mini: ({ elapsedMs }) => ({ frame: blink(elapsedMs), palette: { ...pet.palette, '0': '#ffffff' } }) }
  expect(themeProblems(silent, [pet]).join('\n')).toContain('changes frame but gives no nextChangeMs')
  const late: CrewTheme = { ...base, id: 'late', mini: ({ elapsedMs }) => ({ frame: blink(elapsedMs), palette: { ...pet.palette, '0': '#ffffff' }, nextChangeMs: 1000 }) }
  expect(themeProblems(late, [pet]).join('\n')).toContain('nextChangeMs')
  const right: CrewTheme = { ...base, id: 'right', mini: ({ elapsedMs }) => ({ frame: blink(elapsedMs), palette: { ...pet.palette, '0': '#ffffff' }, nextChangeMs: 500 - (elapsedMs % 500) }) }
  expect(themeProblems(right, [pet])).toEqual([])
})

test('the checker covers Haiku, Sonnet and Opus model ids', () => {
  expect(THEME_MODELS.map(m => m.split('-')[1])).toEqual(['haiku', 'sonnet', 'opus'])
})

test('reserved theme keys never collide with a pet: every persona keeps its contract', () => {
  for (const p of pets) expect(personaProblems(p, { composed: true })).toEqual([])
  for (const theme of Object.values(CREW_THEMES)) for (const k of theme.keys) expect(/^[A-Za-z]$/.test(k)).toBe(false)
})

test("crewMini passes the theme's nextChangeMs through: busy-hands while running, none for hats or a finished member", () => {
  expect(crewMini('busy-hands', input({ elapsedMs: 0 }), 2).nextChangeMs).toBe(200)
  expect(crewMini('busy-hands', input({ elapsedMs: 150 }), 2).nextChangeMs).toBe(50)
  expect(crewMini('busy-hands', input({ status: 'done' }), 2).nextChangeMs).toBeUndefined()
  expect(crewMini('hats', input(), 2).nextChangeMs).toBeUndefined()
})

test('crewMini draws the theme at its declared size and pixel', () => {
  const s = crewMini('busy-hands', input(), 2)
  const { columns, rows } = CREW_THEMES['busy-hands']!.size
  expect(s.width).toBe(columns * 2)
  expect(s.height).toBe(rows * 2)
  expect(s.source).toContain(`viewBox="0 0 ${columns} ${rows}"`)
  expect(s.alt).toContain('Bud')
  expect(s.alt).toContain('builder')
  expect([s.width, s.height]).toEqual([48, 26])
  const h = crewMini('hats', input(), 2)
  expect([h.width, h.height]).toEqual([32, 32])
})

test('crewMini falls back to busy-hands for an unknown theme, then the other themes when one throws', () => {
  expect(crewMini('nope', input(), 2).source).toBe(crewMini('busy-hands', input(), 2).source)
  const saved = CREW_THEMES['busy-hands']!
  const registry = CREW_THEMES as Record<string, CrewTheme>
  registry['busy-hands'] = { ...saved, mini: () => { throw new Error('broken art') } }
  try {
    expect(crewMini('busy-hands', input(), 1.5).source).toBe(crewMini('hats', input(), 1.5).source)
  } finally {
    registry['busy-hands'] = saved
  }
})

test('crewMini returns the same string for the same frame (cached)', () => {
  expect(crewMini('busy-hands', input({ elapsedMs: 0 }), 2).source).toBe(crewMini('busy-hands', input({ elapsedMs: 1 }), 2).source)
})

test('a new theme needs only its registry line: listed, contract-checked and drawn', () => {
  const tiny: CrewTheme = {
    id: 'tiny', name: 'Tiny', description: 'the pet with a dot', size: { columns: 16, rows: 13 }, keys: ['0'],
    mini: ({ persona, elapsedMs }) => {
      const frame = [...(persona.moods.idle.frames[0] ?? [])]
      if (Math.floor(elapsedMs / 500) % 2) frame[0] = '0' + (frame[0] ?? '').slice(1)
      return { frame, palette: { ...persona.palette, '0': '#ffffff' }, nextChangeMs: 500 - (elapsedMs % 500) }
    },
  }
  const registry = CREW_THEMES as Record<string, CrewTheme>
  registry.tiny = tiny
  try {
    expect(crewThemeIds()).toContain('tiny')
    expect(themeProblems(tiny, pets)).toEqual([])
    expect(crewMini('tiny', input({ elapsedMs: 600 }), 2).source).toContain('#ffffff')
    expect(crewMini('tiny', input({ elapsedMs: 600 }), 2).width).toBe(32)
    expect(crewMini('tiny', input({ elapsedMs: 600 }), 2).nextChangeMs).toBe(400)
  } finally {
    delete registry.tiny
  }
})
