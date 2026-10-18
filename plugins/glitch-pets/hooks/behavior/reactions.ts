// The lead's reactions to crew news. Pure: crew rows in, "until" timestamps out.
// A member finishing is a brief joy (`pleased`; its own mini hops in the pane, behavior/sparkle.ts);
// one failing is a worry, then `investigating` while the crew still works. One reaction plays and one waits:
// each plays at least a second, the latest event wins the waiting slot, and events of the
// same kind collapse into the one playing. The waiting slot is resolved lazily from the
// clock, so nothing needs a timer: every reader asks "as of now".
import type { Reaction, Reactions } from '../../types'
import type { CrewRow, CrewState } from './crew'

export const JOY_MS = 2500
export const WORRY_MS = 3000
/** Investigating lasts while the crew still works, at most this long after the latest failure. */
export const INVESTIGATE_MS = 45_000
/** A reaction plays at least this long before another kind replaces it. */
export const MIN_REACTION_MS = 1000

export type CrewEvent = { kind: 'done' | 'failed'; id: string; name: string; at: number }
// The state's shape is the contract's (types/index.d.ts), the single source.
export type { Reaction, Reactions }
export type ReactionKind = Reaction['kind']

export const INITIAL_REACTIONS: Reactions = { current: null, pending: null, lastFailAt: 0, failId: null, failWho: null }

const holdOf = (k: ReactionKind): number => (k === 'joy' ? JOY_MS : WORRY_MS)

/** How the lead names a member: its crew name, else its task cut to about 24 chars. */
export function crewName(r: Pick<CrewRow, 'name' | 'description'>): string {
  if (r.name) return r.name
  const d = r.description.trim()
  if (d.length <= 24) return d
  // Cut at a word when there is one in the second half, so the name stays readable.
  const cut = d.slice(0, 24)
  const space = cut.lastIndexOf(' ')
  return `${(space >= 12 ? cut.slice(0, space) : cut.slice(0, 23)).trimEnd()}…`
}

/** The news between two crew states: rows that went from running to done or failed. */
export function crewEvents(before: CrewState, after: CrewState, now: number): CrewEvent[] {
  const was = new Map(before.rows.map(r => [r.id, r.status]))
  return after.rows
    .filter(r => r.status !== 'running' && was.get(r.id) === 'running')
    .map(r => ({ kind: r.status === 'done' ? 'done' : 'failed', id: r.id, name: crewName(r), at: now }))
}

/** The state as of `now`: a waiting reaction that is due has taken over, a finished one is gone. */
function settle(r: Reactions, now: number): Reactions {
  let { current, pending } = r
  if (current && pending && now >= current.startedAt + MIN_REACTION_MS) {
    const startedAt = Math.max(pending.at, current.startedAt + MIN_REACTION_MS)
    current = { kind: pending.kind, who: pending.who, startedAt, until: startedAt + holdOf(pending.kind) }
    pending = null
  }
  if (current && current.until <= now) current = null
  return current === r.current && pending === r.pending ? r : { ...r, current, pending }
}

const join = (a: readonly string[], b: string): string[] => (a.includes(b) ? [...a] : [...a, b])

function applyOne(state: Reactions, e: CrewEvent): Reactions {
  let r = settle(state, e.at)
  const kind: ReactionKind = e.kind === 'done' ? 'joy' : 'worry'
  if (kind === 'worry') r = { ...r, lastFailAt: e.at, failId: e.id, failWho: e.name }
  const cur = r.current
  // Joins the reaction playing; a different kind already waiting still gets its turn.
  if (cur && cur.kind === kind) return { ...r, pending: r.pending && r.pending.kind !== kind ? r.pending : null, current: { ...cur, who: join(cur.who, e.name), until: e.at + holdOf(kind) } }
  if (cur && e.at - cur.startedAt < MIN_REACTION_MS) {
    const p = r.pending
    return { ...r, pending: p && p.kind === kind ? { ...p, who: join(p.who, e.name), at: e.at } : { kind, who: [e.name], at: e.at } }
  }
  return { ...r, pending: null, current: { kind, who: [e.name], startedAt: e.at, until: e.at + holdOf(kind) } }
}

/** The state after some crew news, in order. */
export const applyCrewEvents = (r: Reactions | undefined, events: readonly CrewEvent[]): Reactions =>
  events.reduce(applyOne, r ?? INITIAL_REACTIONS)

/** The reaction playing at `now`, or null. */
export const reactionAt = (r: Reactions | undefined, now: number): Reaction | null => (r ? settle(r, now).current : null)

/** True while the lead is looking into a failure: the failed row is in this crew, a helper still runs, and it is recent. */
export function isInvestigating(r: Reactions | undefined, crew: CrewState, now: number): boolean {
  return !!r && r.failId !== null && now < r.lastFailAt + INVESTIGATE_MS && crew.rows.some(x => x.id === r.failId) &&
    crew.rows.some(x => x.status === 'running' && x.role !== 'reviewer')
}

/** What moodOf reads: the brief reactions as "until" timestamps, and investigating's cap (0 when it does not apply). */
export function reactionMoodInputs(r: Reactions | undefined, crew: CrewState, now: number): { crewJoyUntil: number; crewWorryUntil: number; investigateUntil: number } {
  const cur = reactionAt(r, now)
  return {
    crewJoyUntil: cur?.kind === 'joy' ? cur.until : 0,
    crewWorryUntil: cur?.kind === 'worry' ? cur.until : 0,
    investigateUntil: r && r.failId !== null && crew.rows.some(x => x.id === r.failId) ? r.lastFailAt + INVESTIGATE_MS : 0,
  }
}
