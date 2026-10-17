// The state contract. Sprite, MoodId, PetId, Role and Tier are inlined from hooks/behavior/types.ts,
// CrewRow and CrewState from hooks/behavior/crew.ts,
// because `claude plugin validate` requires the contract to be self-contained.

/** What glitch-hud draws: one frame as an image. */
export type Sprite = { source: string; alt: string; width: number; height: number }

export type MoodId = 'idle' | 'working' | 'happy' | 'tired' | 'sleepy' | 'worried' | 'oops' | 'cheering' | 'leading' | 'reviewing' | 'crying'

export type PetId = 'screenhead' | 'blob' | 'pixel' | 'dot' | 'fork' | 'bud'

export type MoodState = {
  /** The mood shown now and when it began (clock ms): the player times frames from it. */
  mood: MoodId
  since: number
  /** Main-loop turn running since (clock ms), or null. */
  turnSince: number | null
  /** Last prompt the person sent (clock ms); session start until then. */
  lastPromptAt: number
  oopsUntil: number
  happyUntil: number
  cheerUntil: number
  /** Crying until (clock ms): a broken streak or repeated failures. */
  cryUntil: number
  /** Failures in a row in the main loop; three make the pet cry. */
  failStreak: number
  /** Hopping until (clock ms): the person clicked the pet. */
  pokedUntil: number
  /** The last glitch-hud press (its `poke.at`) already answered. */
  pokeSeen: number
}

export type PetsView = { petId: PetId | 'off' }

export type Role = 'builder' | 'researcher' | 'designer' | 'tester' | 'reviewer' | 'other'
export type Tier = 'light' | 'medium' | 'heavy'

/** One helper of the crew, as the crew pane lists it. */
export type CrewRow = {
  id: string
  name?: string
  /** Spawned under a crew name (`<role>-<n>`): only these count for the review reminder. */
  named: boolean
  description: string
  role: Role
  tier: Tier
  model: string | null
  effort: string | null
  tokens: number
  /** Price-shaped token weight, for sharing the crew's cost. */
  weight: number
  /** Tokens and weight its steps reported in its current turn, so the turn's own sum counts them once. */
  turnTokens: number
  turnWeight: number
  tools: number
  startedAt: number
  /** When a resume set it running again: the list grace counts from here, not from the first start. */
  resumedAt?: number
  endedAt: number | null
  status: 'running' | 'done' | 'failed'
}

/** The helpers started together; open until a quiet main turn ends. */
export type CrewState = {
  /** No crew is open: the next spawn starts a fresh one. True before any crew. */
  closed: boolean
  /** The main turn running now had a helper running at its start, or spawned one. */
  turnBusy: boolean
  startedAt: number | null
  /** Clock ms of the last refresh while a row runs, so the pane's clocks move. */
  tickAt: number
  costAtStart: number
  rows: CrewRow[]
  /** The missed-review reminder already went out for this crew. */
  gateFired: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'glitch-pets': { sprite: Sprite | null; mood: MoodState; view: PetsView; crew: CrewState }
  }
}
