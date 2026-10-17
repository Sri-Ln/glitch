// The shapes every persona and every behavior module agree on. No imports: the
// gallery script loads this file directly.

export const PET_IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud'] as const
export type PetId = (typeof PET_IDS)[number]

export const MOOD_IDS = ['idle', 'working', 'happy', 'tired', 'sleepy', 'worried', 'oops', 'cheering', 'leading', 'reviewing', 'crying', 'investigating', 'pleased'] as const
export type MoodId = (typeof MOOD_IDS)[number]

export const VOICE_MOMENTS = ['happy', 'worried', 'oops', 'cheering', 'sleepy', 'crying', 'crewDone'] as const
export type VoiceMoment = (typeof VOICE_MOMENTS)[number]

/** The sprite grid: 16 columns × 13 rows. */
export const GRID = { width: 16, height: 13 } as const

/** One frame: 13 strings of 16 chars; '.' is empty, any other char a palette key. */
export type Frame = readonly string[]

export type MoodArt = { frames: readonly Frame[]; fps: number }

export type Persona = {
  id: PetId
  /** Shown in toasts and the crew pane: "Bud". */
  name: string
  /** For alt text: "dog". */
  kind: string
  /** One line, for the gallery and the README. */
  temperament: string
  /** Palette key → #rrggbb. Keys 1, 2, 3 are reserved for crew hats; 4, 6, 7 for the laptop. */
  palette: Readonly<Record<string, string>>
  moods: Readonly<Record<MoodId, MoodArt>>
  /** Top-center of the head, where a crew hat's brim sits (x 0–15, y 0–12). */
  hatAnchor: { x: number; y: number }
  /** Palette key of the pet's paw or body color; the laptop's typing paws use it. */
  laptopPaw: string
  /** 3–5 lines per moment, in this pet's own voice. */
  voice: Readonly<Record<VoiceMoment, readonly string[]>>
}

/** What glitch-hud draws: one frame as an image. */
export type Sprite = { source: string; alt: string; width: number; height: number }

export type Role = 'builder' | 'researcher' | 'designer' | 'tester' | 'reviewer' | 'other'
export type Tier = 'light' | 'medium' | 'heavy'
