// One timer tick as a pure decision: which mood, which frame, and did anything change.
import { CHEER_MS, CRY_FAILS, CRY_MS, HAPPY_MS, OOPS_MS, budgetFraction, isCapReached, moodOf } from './behavior/moods'
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
    now: i.now, turnSince: m.turnSince, lastPromptAt: m.lastPromptAt, oopsUntil: m.oopsUntil, happyUntil: m.happyUntil, cheerUntil: m.cheerUntil, cryUntil: m.cryUntil,
    capReached: isCapReached(i.budget, i.total), budget: budgetFraction(i.budget, i.total), cacheSecondsLeft: i.cacheSecondsLeft,
    helpersRunning: i.helpersRunning, reviewerRunning: i.reviewerRunning, tiredMs: i.tiredMs, sleepyMs: i.sleepyMs,
  })
  const moodChanged = mood !== m.mood
  const since = moodChanged ? i.now : m.since
  const s = i.player.sprite(i.persona, mood, i.now - since)
  return { mood, since, moodChanged, sprite: s.source !== i.lastSource ? s : null }
}

/** The failure count after one more main-loop event: a failure adds one, an answer or a clean tool call clears it, three make the pet cry (and clear it). */
export function failTick(count: number, event: 'fail' | 'ok', now: number): { failStreak: number; cryUntil: number | null } {
  if (event === 'ok') return { failStreak: 0, cryUntil: null }
  return count + 1 >= CRY_FAILS ? { failStreak: 0, cryUntil: now + CRY_MS } : { failStreak: count + 1, cryUntil: null }
}

/** A failed tool call in the main loop (not a helper's) upsets the pet. */
export const isMainLoopError = (e: { agentId?: unknown }, result: unknown): boolean =>
  e.agentId === undefined && !!result && !!(result as { isError?: boolean }).isError

const withFail = (m: MoodState, event: 'fail' | 'ok', now: number): MoodState => {
  const f = failTick(m.failStreak, event, now)
  return { ...m, failStreak: f.failStreak, ...(f.cryUntil !== null ? { cryUntil: f.cryUntil } : {}) }
}

/** After a tool call: a main-loop failure upsets the pet (and counts toward crying), a clean main-loop call clears the count; a helper's changes nothing. */
export function onToolResult(m: MoodState, e: { agentId?: unknown }, result: unknown, now: number): MoodState {
  if (e.agentId !== undefined) return m
  if (!isMainLoopError(e, result)) return withFail(m, 'ok', now)
  return { ...withFail(m, 'fail', now), oopsUntil: now + OOPS_MS }
}

/** After a main-loop turn ends: no turn running; an error upsets (and counts), an answer pleases (and clears the count). */
export function onTurnEnd(m: MoodState, reason: string, now: number): MoodState {
  const ended = { ...m, turnSince: null }
  if (reason === 'error') return { ...withFail(ended, 'fail', now), oopsUntil: now + OOPS_MS }
  if (reason === 'answer') return { ...withFail(ended, 'ok', now), happyUntil: now + HAPPY_MS }
  return ended
}

/** At the first main-loop turn of a day: a milestone cheers, a broken streak cries. */
export function onTurnStartStreak(m: MoodState, r: { cheer: boolean; broken: boolean }, now: number): MoodState {
  return { ...m, ...(r.cheer ? { cheerUntil: now + CHEER_MS } : {}), ...(r.broken ? { cryUntil: now + CRY_MS } : {}) }
}
