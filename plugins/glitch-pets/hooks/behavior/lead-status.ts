// What the lead row says: one short clause about what the lead is doing. Pure.
// The situations follow the lead's mood order (moods.ts), so the words and the picture agree:
// a fresh failure, a fresh finish, the reviewer at work, looking into a failure, then the crew at work or back.
import type { CrewRow, CrewState } from './crew'
import type { Reactions } from './reactions'
import { crewName, isInvestigating, reactionAt } from './reactions'
import type { LeadSituation, Persona } from './types'

/** The wording any pet uses unless its persona has its own. */
export const NEUTRAL_STATUS: Readonly<Record<LeadSituation, string>> = {
  worry: '{who} hit a snag',
  joy: '{who} is done',
  reviewing: 'checking the work',
  investigating: 'looking into {who}',
  many: 'keeping an eye on the crew ({n} at work)',
  one: 'waiting on {who}',
  allDone: 'job done, the whole crew is back',
  someFailed: '{d} done, {f} needs a look',
}

export type LeadSituationNow = { situation: LeadSituation; who: string; n: number; d: number; f: number } | null

/** One name, two joined with "and", more as a count. */
export const whoOf = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? 'the crew') : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} of the crew`

const isHelper = (r: CrewRow) => r.role !== 'reviewer'

/** Which situation the lead is in at `now`, with what fills the wording; null with no crew at all. */
export function leadSituation(crew: CrewState, reactions: Reactions | undefined, now: number): LeadSituationNow {
  const running = crew.rows.filter(r => r.status === 'running')
  const helpers = running.filter(isHelper)
  const d = crew.rows.filter(r => r.status === 'done').length
  const f = crew.rows.filter(r => r.status === 'failed').length
  const at = (situation: LeadSituation, who = '', n = helpers.length) => ({ situation, who, n, d, f })
  const r = reactionAt(reactions, now)
  if (r?.kind === 'worry') return at('worry', whoOf(r.who), r.who.length)
  if (r?.kind === 'joy') return at('joy', whoOf(r.who), r.who.length)
  if (running.some(x => !isHelper(x))) return at('reviewing')
  if (isInvestigating(reactions, crew, now)) return at('investigating', reactions?.failWho ?? 'the crew')
  if (helpers.length >= 2) return at('many')
  if (helpers.length === 1) return at('one', crewName(helpers[0]!))
  if (crew.rows.length === 0) return null
  return f === 0 ? at('allDone', '', crew.rows.length) : at('someFailed', '', crew.rows.length)
}

const fill = (t: string, s: NonNullable<LeadSituationNow>): string =>
  t.replaceAll('{who}', s.who).replaceAll('{n}', String(s.n)).replaceAll('{d}', String(s.d)).replaceAll('{f}', String(s.f))

/** The lead row's status clause ("waiting on builder-1"), in the pet's own voice where it has one. */
export function leadStatus(persona: Pick<Persona, 'leadStatus'> | null, crew: CrewState, reactions: Reactions | undefined, now: number): string {
  const s = leadSituation(crew, reactions, now)
  if (!s) return 'ready for a crew'
  const own = persona?.leadStatus?.[s.situation]
  if (own) return fill(own, s)
  // The neutral wording agrees in number.
  if (s.situation === 'joy' && s.n > 1) return fill('{who} are done', s)
  if (s.situation === 'someFailed' && s.f > 1) return fill('{d} done, {f} need a look', s)
  return fill(NEUTRAL_STATUS[s.situation], s)
}

/** The whole lead row: "Fork · waiting on builder-1". */
export const leadLine = (persona: Pick<Persona, 'leadStatus' | 'name'>, crew: CrewState, reactions: Reactions | undefined, now: number): string =>
  `${persona.name} · ${leadStatus(persona, crew, reactions, now)}`
