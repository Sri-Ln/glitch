// The crew pill: glitch-pets publishes its crew's figures (state `glitch-pets.crewSummary`)
// while a crew is open or recent; the band draws them as one Button. A press on it is
// glitch-pets' to answer (it opens or closes its crew pane), so this plugin needs
// nothing of glitch-pets but the figures, and anything malformed is no pill.
import { usd } from './budget'

export type CrewSummary = { running: number; done: number; failed: number; cost: number; elapsedMs: number }

/** The Button's chrome on the desktop (a native button), in cells beside its label. */
export const CREW_PILL_PAD = 2

const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
const amount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0

export function isCrewSummary(v: unknown): v is CrewSummary {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return count(o.running) && count(o.done) && count(o.failed) && amount(o.cost) && amount(o.elapsedMs)
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const crewPillText = (c: CrewSummary): string =>
  `Crew · ${c.running} at work · ${c.done} done${c.failed ? ` · ${c.failed} failed` : ''} · ≈${usd(c.cost)} · ${clock(c.elapsedMs)}`
