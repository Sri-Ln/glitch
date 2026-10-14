// One timer tick as a pure decision: which mood, which frame, and did anything change.
import { budgetFraction, isCapReached, moodOf } from './behavior/moods'
import type { BudgetLike } from './behavior/moods'
import type { MoodState } from '../types'
import type { MoodId, Persona, Sprite } from './behavior/types'

export type TickInputs = {
  now: number
  persona: Persona
  player: { sprite(p: Persona, mood: MoodId, elapsedMs: number): Sprite }
  state: MoodState
  lastSource: string | null
  total: number
  budget: BudgetLike | null
  cacheSecondsLeft: number | null
  helpersRunning: number
  reviewerRunning: boolean
  tiredMs: number
  sleepyMs: number
}

export type TickResult = {
  mood: MoodId
  since: number
  /** True when the mood differs from the one in `state`. */
  moodChanged: boolean
  /** The frame to draw, only when its image differs from `lastSource`. */
  sprite: Sprite | null
}

export function tickOnce(i: TickInputs): TickResult {
  const m = i.state
  const mood = moodOf({
    now: i.now, turnSince: m.turnSince, lastPromptAt: m.lastPromptAt, oopsUntil: m.oopsUntil, happyUntil: m.happyUntil, cheerUntil: m.cheerUntil,
    capReached: isCapReached(i.budget, i.total), budget: budgetFraction(i.budget, i.total), cacheSecondsLeft: i.cacheSecondsLeft,
    helpersRunning: i.helpersRunning, reviewerRunning: i.reviewerRunning, tiredMs: i.tiredMs, sleepyMs: i.sleepyMs,
  })
  const moodChanged = mood !== m.mood
  const since = moodChanged ? i.now : m.since
  const s = i.player.sprite(i.persona, mood, i.now - since)
  return { mood, since, moodChanged, sprite: s.source !== i.lastSource ? s : null }
}

/** A failed tool call in the main loop (not a helper's) upsets the pet. */
export const isMainLoopError = (e: { agentId?: unknown }, result: unknown): boolean =>
  e.agentId === undefined && !!result && !!(result as { isError?: boolean }).isError
