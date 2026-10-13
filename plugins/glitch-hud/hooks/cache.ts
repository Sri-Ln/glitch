import type { Level } from '../types'

const WARN_S = 20 * 60
const ALERT_S = 10 * 60

// The warning mark to announce now, if any: the smallest mark whose window
// holds `secondsLeft`, when it is below the last one announced (0 = none yet).
export function dueMark(secondsLeft: number, marks: number[], warned: number): number | null {
  if (secondsLeft <= 0) return null
  const due = marks.filter(m => secondsLeft <= m * 60)
  if (due.length === 0) return null
  const mark = Math.min(...due)
  return warned !== 0 && warned <= mark ? null : mark
}

export const cacheLevel = (secondsLeft: number | null, isBusy: boolean): Level =>
  isBusy || secondsLeft === null ? 'ok' : secondsLeft <= ALERT_S ? 'alert' : secondsLeft <= WARN_S ? 'warn' : 'ok'

const pad = (n: number): string => String(n).padStart(2, '0')

export const clockText = (seconds: number): string => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`

export function shouldAutoWarm(a: { mark: number; marks: number[]; now: number; lastPromptAt: number; maxIdleMin: number; warmedSincePrompt: boolean }): boolean {
  return a.mark === Math.min(...a.marks) && !a.warmedSincePrompt && a.now - a.lastPromptAt <= a.maxIdleMin * 60_000
}
