// The shapes every persona and every behavior module agree on. No imports: the
// gallery script loads this file directly.

export const PET_IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud'] as const
export type PetId = (typeof PET_IDS)[number]

export const MOOD_IDS = ['idle', 'working', 'happy', 'tired', 'sleepy', 'worried', 'oops', 'cheering', 'leading', 'reviewing', 'crying', 'investigating', 'pleased'] as const
export type MoodId = (typeof MOOD_IDS)[number]

export const VOICE_MOMENTS = ['happy', 'worried', 'oops', 'cheering', 'sleepy', 'crying', 'crewDone'] as const
export type VoiceMoment = (typeof VOICE_MOMENTS)[number]

/** A persona's own palette keys are letters; every digit and punctuation char is left to overlay art. */
export const PET_KEY = /^[A-Za-z]$/
/** The laptop's keys (behavior/laptop.ts). Every other digit and punctuation char is free for crew themes. */
export const LAPTOP_KEYS: readonly string[] = ['4', '6', '7']

/** The sprite grid: 16 columns × 13 rows. */
export const GRID = { width: 16, height: 13 } as const

/** One frame: 13 strings of 16 chars; '.' is empty, any other char a palette key. */
export type Frame = readonly string[]

export type MoodArt = { frames: readonly Frame[]; fps: number }

/** One fishing-rod pose: the frame, and the rod tip (grid x, y) the line hangs from. */
export type RodPose = { frame: Frame; tip: { x: number; y: number } }
/** The lead's rod for the reward: up and straight, the cast (tip snapped back), bent under the gift, and put away. */
export type RodArt = { hold: RodPose; flick: RodPose; bent: RodPose; stowed: Frame }

/** What the lead row can say, in the order the lead's mood picks them (first match wins). */
export const LEAD_SITUATIONS = ['worry', 'joy', 'reviewing', 'investigating', 'many', 'one', 'allDone', 'someFailed'] as const
export type LeadSituation = (typeof LEAD_SITUATIONS)[number]
/** One wording for any number, or a pair: for one, then for more than one (the count is who's for joy and worry, {f} for someFailed, {n} otherwise). */
export type LeadWording = string | readonly [one: string, many: string]

export type Persona = {
  id: PetId
  /** Shown in toasts and the crew pane: "Bud". */
  name: string
  /** For alt text: "dog". */
  kind: string
  /** One line, for the gallery and the README. */
  temperament: string
  /** Palette key → #rrggbb. Keys are letters (PET_KEY): digits and punctuation are reserved for overlay art (LAPTOP_KEYS, crew themes). */
  palette: Readonly<Record<string, string>>
  moods: Readonly<Record<MoodId, MoodArt>>
  /** Top-center of the head, where a crew hat's brim sits (x 0–15, y 0–12). */
  hatAnchor: { x: number; y: number }
  /** Palette key of the pet's paw or body color; the laptop's typing paws use it. */
  laptopPaw: string
  /** 3–5 lines per moment, in this pet's own voice. */
  voice: Readonly<Record<VoiceMoment, readonly string[]>>
  /** The fishing rod the lead lowers a gift with when a crew member finishes. */
  rod: RodArt
  /** The lead row's wording in this pet's voice; `{n}`, `{who}`, `{d}`, `{f}` are filled in. Missing ones use the neutral wording. */
  leadStatus?: Readonly<Partial<Record<LeadSituation, LeadWording>>>
}

/** What glitch-hud draws: one frame as an image. */
export type Sprite = { source: string; alt: string; width: number; height: number }

export type Role = 'builder' | 'researcher' | 'designer' | 'tester' | 'reviewer' | 'other'
export type Tier = 'light' | 'medium' | 'heavy'
