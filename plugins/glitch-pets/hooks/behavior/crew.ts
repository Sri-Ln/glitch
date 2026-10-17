// The crew: helpers started together, as rows for the pane. Pure.
// A crew spans main turns (background helpers finish in later turns, the reviewer
// is spawned after them): it stays open until a quiet main turn ends, one where no
// helper ran at its start, none was spawned and none runs at its end.
import type { Role, Tier } from './types'

export type UsageLike = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }

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
  /** Price-shaped token weight (tokenWeight), for sharing the crew's cost. */
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
  /** Failed because it was stopped (killed), not by its own error: no step-up. */
  killed?: true
  /** The crew agent type it runs as (`crew-light`, `crew-light-high`, …), when it is one. */
  rung?: string
  /** How many step-ups led to this row (0 or absent for a first try). */
  stepUps?: number
  /** The failed row this one retries, and the rung it failed on (for "stepped up from Haiku · low"). */
  steppedUpFrom?: { id: string; rung: string; model: string; effort: string }
}

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

export const INITIAL_CREW: CrewState = { closed: true, turnBusy: false, startedAt: null, tickAt: 0, costAtStart: 0, rows: [], gateFired: false }

const ROLE_NAME = /^(builder|researcher|designer|tester|reviewer)-\d+$/i
// Stems take any word form (reviews, reviewer, researching, tests, builds…). The reviewer rule stays first.
const ROLE_WORDS: [Role, RegExp][] = [
  ['reviewer', /\b(review\w*|audit\w*|check the whole)\b/i],
  ['researcher', /\b(research\w*|find\w*|investigat\w*|explor\w*|look(s|ed|ing)? up|survey\w*)\b/i],
  ['tester', /\b(test\w*|verif\w*|validat\w*|qa)\b/i],
  ['designer', /\b(design\w*|draw\w*|drew|mock(s|ed|ing)? ?ups?|styl\w*|layouts?)\b/i],
  ['builder', /\b(build\w*|built|implement\w*|writ\w*|wrote|creat\w*|fix\w*|add(s|ed|ing)?|cod(e|es|ed|ing)|refactor\w*)\b/i],
]

export function roleOf(name: string | undefined, description: string): Role {
  const m = name ? ROLE_NAME.exec(name) : null
  if (m) return (m[1] as string).toLowerCase() as Role
  for (const [role, re] of ROLE_WORDS) if (re.test(description)) return role
  return 'other'
}

export function tierOf(model: string | null, effort: string | null): Tier {
  const mdl = (model ?? '').toLowerCase()
  const eff = (effort ?? '').toLowerCase()
  if (mdl.includes('haiku') || eff === 'low') return 'light'
  if (mdl.includes('opus') && ['high', 'xhigh', 'max'].includes(eff)) return 'heavy'
  return 'medium'
}

export const tokenWeight = (u: UsageLike): number =>
  u.input_tokens + 5 * u.output_tokens + 1.25 * u.cache_creation_input_tokens + 0.1 * u.cache_read_input_tokens

const mapRow = (s: CrewState, id: string, fn: (r: CrewRow) => CrewRow): CrewState => ({ ...s, rows: s.rows.map(r => (r.id === id ? fn(r) : r)) })

const anyRunning = (s: CrewState): boolean => s.rows.some(r => r.status === 'running')

/** A main turn starts: it is busy when a helper of the crew is still running. */
export const onMainTurnStart = (s: CrewState): CrewState => ({ ...s, turnBusy: anyRunning(s) })

/** A main turn ends: a quiet one (not busy, nothing running) closes the crew. */
export const onMainTurnEnd = (s: CrewState): CrewState => ({ ...s, closed: s.closed || (!s.turnBusy && !anyRunning(s)), turnBusy: false })

const usageTokens = (u: UsageLike): number => u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens

/** A spawn: a new row, or, for an agent already in the crew (a resume), its row running again with its counts kept. */
export function onSpawn(s: CrewState, a: { agentId: string; name?: string; description: string; model: string | null; now: number; costNow: number; rung?: string; stepUps?: number; steppedUpFrom?: CrewRow['steppedUpFrom'] }): CrewState {
  if (s.rows.some(r => r.id === a.agentId)) {
    return { ...mapRow(s, a.agentId, r => ({ ...r, status: 'running', resumedAt: a.now, endedAt: null, turnTokens: 0, turnWeight: 0 })), closed: false, turnBusy: true }
  }
  const base: CrewState = s.closed ? { ...INITIAL_CREW, closed: false, startedAt: a.now, tickAt: a.now, costAtStart: a.costNow } : s
  const row: CrewRow = {
    id: a.agentId, ...(a.name ? { name: a.name } : {}), named: !!a.name && ROLE_NAME.test(a.name), description: a.description, role: roleOf(a.name, a.description),
    tier: tierOf(a.model, null), model: a.model, effort: null, tokens: 0, weight: 0, turnTokens: 0, turnWeight: 0, tools: 0, startedAt: a.now, endedAt: null, status: 'running',
    ...(a.rung ? { rung: a.rung } : {}), ...(a.stepUps ? { stepUps: a.stepUps } : {}), ...(a.steppedUpFrom ? { steppedUpFrom: a.steppedUpFrom } : {}),
  }
  return { ...base, turnBusy: true, rows: [...base.rows.filter(r => r.id !== a.agentId), row] }
}

export const onStep = (s: CrewState, agentId: string, model: string, effort: string | null): CrewState =>
  mapRow(s, agentId, r => ({ ...r, model, effort, tier: tierOf(model, effort) }))

export const onTool = (s: CrewState, agentId: string): CrewState => mapRow(s, agentId, r => ({ ...r, tools: r.tools + 1 }))

/** One step's usage (per request), counted as it comes so a running row shows its tokens. */
export const onStepUsage = (s: CrewState, agentId: string, u: UsageLike): CrewState =>
  mapRow(s, agentId, r => {
    const t = usageTokens(u)
    const w = tokenWeight(u)
    return { ...r, tokens: r.tokens + t, weight: r.weight + w, turnTokens: r.turnTokens + t, turnWeight: r.turnWeight + w }
  })

/** The agent's turn ends: its usage (the sum of the turn's requests) adds only what its steps did not report. */
export const onAgentTurnEnd = (s: CrewState, agentId: string, u: UsageLike | undefined, now: number): CrewState =>
  mapRow(s, agentId, r => ({
    ...r,
    tokens: r.tokens + (u ? Math.max(0, usageTokens(u) - r.turnTokens) : 0),
    weight: r.weight + (u ? Math.max(0, tokenWeight(u) - r.turnWeight) : 0),
    turnTokens: 0,
    turnWeight: 0,
    endedAt: r.status === 'running' ? r.endedAt : r.endedAt ?? now,
  }))

/** A row missing from the agent list this long after its spawn has ended (the list drops a finished task soon). */
export const LIST_GRACE_MS = 3000

/** Rows from a successful `agent.list` (never call it with a failed call's empty stand-in). */
export function onStatuses(s: CrewState, list: readonly { id: string; status: string }[], now: number): CrewState {
  const by = new Map(list.map(a => [a.id, a.status]))
  return {
    ...s,
    rows: s.rows.map(r => {
      if (r.status !== 'running') return r
      const st = by.get(r.id)
      // A teammate waiting for a message has done its part.
      if (st === 'completed' || st === 'idle') return { ...r, status: 'done', endedAt: now }
      if (st === undefined && now - (r.resumedAt ?? r.startedAt) >= LIST_GRACE_MS) return { ...r, status: 'done', endedAt: now }
      if (st === 'failed') return { ...r, status: 'failed', endedAt: now }
      if (st === 'killed') return { ...r, status: 'failed', killed: true, endedAt: now }
      return r
    }),
  }
}

export function shares(rows: readonly CrewRow[], crewCost: number): Record<string, number> {
  const total = rows.reduce((t, r) => t + r.weight, 0)
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  return Object.fromEntries(rows.map(r => [r.id, round(total > 0 ? (crewCost * r.weight) / total : crewCost / Math.max(1, rows.length))]))
}

/** The crew's elapsed time: up to now while a row runs, else up to the last row's end. */
export function elapsedOf(s: CrewState, now: number): number {
  if (s.startedAt === null) return 0
  const end = anyRunning(s) ? now : Math.max(s.startedAt, ...s.rows.map(r => r.endedAt ?? s.startedAt as number))
  return Math.max(0, end - s.startedAt)
}

export const helpersRunning = (s: CrewState): number => s.rows.filter(r => r.status === 'running' && r.role !== 'reviewer').length
export const reviewerRunning = (s: CrewState): boolean => s.rows.some(r => r.status === 'running' && r.role === 'reviewer')

/**
 * A running row's steps (tool calls) against the most a finished non-reviewer row
 * took; the total is kept above the count, so a running pill never reads full.
 * Null when no row has finished yet (no yardstick).
 */
export function stepsOf(row: CrewRow, rows: readonly CrewRow[]): { n: number; of: number } | null {
  if (row.status !== 'running') return null
  const most = Math.max(0, ...rows.filter(r => r.status === 'done' && r.role !== 'reviewer').map(r => r.tools))
  return most > 0 ? { n: row.tools, of: Math.max(most, row.tools + 1) } : null
}

/** What glitch-hud's crew pill shows (state key `glitch-pets.crewSummary`). */
export type CrewSummary = { running: number; done: number; failed: number; cost: number; elapsedMs: number }

/** A closed crew keeps its pill this long after its last member ended. */
export const RECENT_MS = 120_000

/** The pill's figures while a crew is open, or closed less than RECENT_MS ago; else null. */
export function crewSummaryOf(s: CrewState, cost: number, now: number): CrewSummary | null {
  if (s.rows.length === 0) return null
  const lastEnd = Math.max(0, ...s.rows.map(r => r.endedAt ?? now))
  if (s.closed && !anyRunning(s) && now - lastEnd >= RECENT_MS) return null
  const count = (st: CrewRow['status']) => s.rows.filter(r => r.status === st).length
  return { running: count('running'), done: count('done'), failed: count('failed'), cost: Math.round(Math.max(0, cost) * 1e4) / 1e4, elapsedMs: elapsedOf(s, now) }
}
