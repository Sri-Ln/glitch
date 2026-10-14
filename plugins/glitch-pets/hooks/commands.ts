// Pure helpers of /glitch-pets: argument parsing and texts.
import type { PetId } from './behavior/types'
import { PET_IDS } from './behavior/types'

export const ROUTED_PETS = ['pet']
export const STORE_PET = 'pet'
export const PETS_USAGE = 'Glitch pets: /glitch pet [name | off]'

export type PetArg = { kind: 'show' } | { kind: 'off' } | { kind: 'pick'; id: PetId } | { kind: 'unknown'; name: string }

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
