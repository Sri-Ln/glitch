// The plugin's settings, parsed once at load. Bad values fall back to defaults and
// are reported, never thrown.
import { PET_IDS } from './behavior/types'
import type { PetId } from './behavior/types'
import { CREW_THEMES, DEFAULT_CREW_THEME, crewThemeIds } from './crew-themes/index'

export type PetsConfig = {
  pet: PetId | 'off'
  voice: boolean
  voiceEveryMs: number
  tiredMs: number
  sleepyMs: number
  crewPane: 'auto' | 'manual'
  crewReview: boolean
  /** A crew-themes registry id. */
  crewTheme: string
}

const MIN = 60_000

export function parsePetsConfig(o: Record<string, unknown>): { config: PetsConfig; problems: string[] } {
  const problems: string[] = []
  const minutes = (key: string, def: number): number => {
    const v = o[key]
    if (v === undefined) return def * MIN
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v * MIN
    problems.push(`${key} must be a positive number of minutes`)
    return def * MIN
  }
  const flag = (key: string, def: boolean): boolean => {
    const v = o[key]
    if (v === undefined) return def
    if (typeof v === 'boolean') return v
    problems.push(`${key} must be true or false`)
    return def
  }
  let pet: PetId | 'off' = 'bud'
  if (o.pet !== undefined) {
    if (o.pet === 'off' || (PET_IDS as readonly unknown[]).includes(o.pet)) pet = o.pet as PetId | 'off'
    else problems.push(`pet must be one of ${PET_IDS.join(', ')}, off`)
  }
  let crewPane: 'auto' | 'manual' = 'auto'
  if (o.crewPane !== undefined) {
    if (o.crewPane === 'auto' || o.crewPane === 'manual') crewPane = o.crewPane
    else problems.push('crewPane must be auto or manual')
  }
  let crewTheme = DEFAULT_CREW_THEME
  if (o.crewTheme !== undefined) {
    if (typeof o.crewTheme === 'string' && Object.hasOwn(CREW_THEMES, o.crewTheme)) crewTheme = o.crewTheme
    else problems.push(`crewTheme must be one of ${crewThemeIds().join(', ')}`)
  }
  return {
    config: {
      pet,
      voice: flag('voice', true),
      voiceEveryMs: minutes('voiceEveryMinutes', 3),
      tiredMs: minutes('tiredMinutes', 10),
      sleepyMs: minutes('sleepyMinutes', 10),
      crewPane,
      crewReview: flag('crewReview', true),
      crewTheme,
    },
    problems,
  }
}
