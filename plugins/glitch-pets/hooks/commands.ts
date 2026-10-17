// Pure helpers of /glitch-pets: argument parsing and texts.
import type { PetId } from './behavior/types'
import { PET_IDS } from './behavior/types'

export const ROUTED_PETS = ['pet', 'crew']
export const STORE_PET = 'pet'
export const PETS_USAGE = 'Glitch pets: /glitch-pets [name | off] · crew [theme <id>] (also /glitch pet, /glitch crew)'

export type PetArg = { kind: 'show' } | { kind: 'off' } | { kind: 'pick'; id: PetId } | { kind: 'unknown'; name: string }

// The pet argument of either entry point: `/glitch-pets [pet] <name>` or the routed `/glitch pet <name>`.
export function petArgsOf(command: 'glitch-pets' | 'glitch', args: string): string {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const routed = command === 'glitch' || words[0] === 'pet'
  return (routed ? words.slice(1) : words).join(' ')
}

export function parsePetArg(arg: string | undefined): PetArg {
  if (!arg) return { kind: 'show' }
  const a = arg.toLowerCase()
  if (a === 'off') return { kind: 'off' }
  return (PET_IDS as readonly string[]).includes(a) ? { kind: 'pick', id: a as PetId } : { kind: 'unknown', name: arg }
}

export function petList(current: PetId | 'off', available: readonly PetId[]): string {
  const names = available.map(id => (id === current ? `${id} (current)` : id)).join(', ')
  return `Pets: ${names}${current === 'off' ? ' · pet is off' : ''} · /glitch pet <name> | off`
}

// ── Crew themes: `/glitch crew theme [id]` and `/glitch-pets crew theme [id]` ──
export const STORE_CREW_THEME = 'crewTheme'

export type ThemeArg = { kind: 'show' } | { kind: 'pick'; id: string } | { kind: 'unknown'; name: string }

/** The theme argument when the words are `crew theme [id]` or `crew themes [id]` (either entry point), else null. */
export function crewThemeArgOf(args: string): string | null {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words[0]?.toLowerCase() !== 'crew' || !['theme', 'themes'].includes(words[1]?.toLowerCase() ?? '')) return null
  return words.slice(2).join(' ')
}

export function parseThemeArg(arg: string, ids: readonly string[]): ThemeArg {
  const a = arg.trim().toLowerCase()
  if (!a) return { kind: 'show' }
  return ids.includes(a) ? { kind: 'pick', id: a } : { kind: 'unknown', name: arg.trim() }
}

export function themeList(current: string, themes: readonly { id: string; name: string }[]): string {
  const names = themes.map(t => `${t.id} (${t.name})${t.id === current ? ' (current)' : ''}`).join(', ')
  return `Crew themes: ${names} · /glitch crew theme <id>`
}
