// Plain inputs → the one mood to show. Pure: timed moods are "until" timestamps.
import type { MoodId } from './types'

export const OOPS_MS = 4000
export const HAPPY_MS = 5000
export const CHEER_MS = 6000
export const CRY_MS = 6000
/** The hop a click on the pet plays. */
export const POKE_MS = 2000
/** Failures in a row (main loop) that make the pet cry. */
export const CRY_FAILS = 3
export const WORRY_CACHE_S = 60
const WORRY_BUDGET = 0.9

/** The fields of glitch-hud's Budget this plugin reads. */
export type BudgetLike = { sessionCap: number; dailyCap: number; isOff: boolean; dailySpent: number; demoPercent: number | null }

export type MoodInputs = {
  now: number
  turnSince: number | null
  lastPromptAt: number
  oopsUntil: number
  happyUntil: number
  cheerUntil: number
  cryUntil: number
  pokedUntil: number
  capReached: boolean
  /** Spend as a fraction of the nearest cap (budgetFraction), null with no caps. */
  budget: number | null
  /** glitch-hud's countdown; null before the first answer. */
  cacheSecondsLeft: number | null
  helpersRunning: number
  reviewerRunning: boolean
  tiredMs: number
  sleepyMs: number
}

export function budgetFraction(b: BudgetLike | null, sessionTotal: number): number | null {
  if (!b) return null
  if (b.demoPercent !== null) return b.demoPercent / 100
  if (b.isOff) return null
  const parts = [b.sessionCap > 0 ? sessionTotal / b.sessionCap : null, b.dailyCap > 0 ? b.dailySpent / b.dailyCap : null].filter((x): x is number => x !== null)
  return parts.length ? Math.round(Math.max(...parts) * 1000) / 1000 : null
}

export const isCapReached = (b: BudgetLike | null, sessionTotal: number): boolean =>
  !!b && !b.isOff && ((b.sessionCap > 0 && sessionTotal >= b.sessionCap) || (b.dailyCap > 0 && b.dailySpent >= b.dailyCap))

export function moodOf(i: MoodInputs): MoodId {
  const running = i.turnSince !== null
  // A click always answers at once, whatever the pet was doing; it goes back after.
  if (i.pokedUntil > i.now) return 'happy'
  if (i.cryUntil > i.now || i.capReached) return 'crying'
  if (i.oopsUntil > i.now) return 'oops'
  if ((i.budget !== null && i.budget >= WORRY_BUDGET) || (i.cacheSecondsLeft !== null && i.cacheSecondsLeft > 0 && i.cacheSecondsLeft < WORRY_CACHE_S)) return 'worried'
  if (i.cheerUntil > i.now) return 'cheering'
  if (i.reviewerRunning) return 'reviewing'
  if (i.helpersRunning > 0) return 'leading'
  if (i.happyUntil > i.now) return 'happy'
  if (running && i.now - (i.turnSince as number) >= i.tiredMs) return 'tired'
  if (running) return 'working'
  if (i.now - i.lastPromptAt >= i.sleepyMs || i.cacheSecondsLeft === 0) return 'sleepy'
  return 'idle'
}
