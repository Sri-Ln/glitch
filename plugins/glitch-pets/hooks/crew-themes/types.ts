// The crew-theme contract: how a helper's mini in the crew pane looks. A theme is one file
// in this folder plus one line in index.ts; nothing else in the plugin knows its art.
// Gallery-safe: only `import type`.
import type { Frame, Persona, Role } from '../behavior/types'

export type CrewStatus = 'running' | 'done' | 'failed'

/** One helper, as the pane knows it. `model` is the raw model id the engine reported (or null). */
export type CrewMiniInput = {
  persona: Persona
  role: Role
  model: string | null
  effort: string | null
  status: CrewStatus
  /** Since the helper started (or any running clock): the theme picks its frame from it. */
  elapsedMs: number
}

/** One frame of the mini and the palette that draws it: the persona's palette plus the theme's own keys. */
export type CrewMini = { frame: Frame; palette: Record<string, string> }

export type CrewTheme = {
  /** Registry key and the `crewTheme` setting's value: lowercase, dash-separated. */
  id: string
  /** Shown by `/glitch crew theme`. */
  name: string
  /** One line, for the gallery. */
  description: string
  /** Every frame is exactly this many columns × rows. */
  size: { columns: number; rows: number }
  /**
   * The palette keys the theme adds on top of the pet's. Never letters (those are the pet's) and
   * never the laptop's (behavior/types LAPTOP_KEYS); any digit or punctuation char is free.
   */
  keys: readonly string[]
  /** How often the mini changes while running (frames per second); omitted means still. */
  fps?: number
  /** Pure: same input, same frame. Animates by `elapsedMs`; a done or failed member may hold a still. */
  mini(input: CrewMiniInput): CrewMini
}
