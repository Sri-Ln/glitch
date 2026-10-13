import type { Level } from '../types'

const HOUR_MS = 60 * 60_000

// The warning mark to announce now, if any: the smallest mark whose window
// holds `secondsLeft`, when it is below the last one announced (0 = none yet).
export function dueMark(secondsLeft: number, marks: number[], warned: number): number | null {
  if (secondsLeft <= 0) return null
  const due = marks.filter(m => secondsLeft <= m * 60)
  if (due.length === 0) return null
  const mark = Math.min(...due)
  return warned !== 0 && warned <= mark ? null : mark
}

/** The marks used when the person typed none: 10 and 5 for an hour, 2 and 1 for 5 minutes. */
export const defaultMarks = (ttlMs: number): number[] => (ttlMs >= HOUR_MS ? [10, 5] : [2, 1])

/** The marks that can fire within `ttlMs`: the typed ones, or those fitted to the lifetime. */
export const warnMarks = (typed: number[] | null, ttlMs: number): number[] =>
  (typed ?? defaultMarks(ttlMs)).filter(m => m * 60_000 < ttlMs)

// Warn at a third of the lifetime left, alert at a sixth (20 and 10 min of an hour).
export const cacheLevel = (secondsLeft: number | null, isBusy: boolean, ttlMs = HOUR_MS): Level =>
  isBusy || secondsLeft === null ? 'ok' : secondsLeft * 1000 <= ttlMs / 6 ? 'alert' : secondsLeft * 1000 <= ttlMs / 3 ? 'warn' : 'ok'

const pad = (n: number): string => String(n).padStart(2, '0')

export const clockText = (seconds: number): string => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`

export function shouldAutoWarm(a: { mark: number; marks: number[]; now: number; lastPromptAt: number; maxIdleMin: number; warmedSincePrompt: boolean }): boolean {
  return a.mark === Math.min(...a.marks) && !a.warmedSincePrompt && a.now - a.lastPromptAt <= a.maxIdleMin * 60_000
}
