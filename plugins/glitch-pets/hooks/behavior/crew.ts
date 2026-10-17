// The crew: helpers started from one main-loop turn, as rows for the pane. Pure.
import type { Role, Tier } from './types'

export type UsageLike = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }

export type CrewRow = {
  id: string
  name?: string
  description: string
  role: Role
  tier: Tier
  model: string | null
  effort: string | null
  tokens: number
  /** Price-shaped token weight (tokenWeight), for sharing the crew's cost. */
  weight: number
  tools: number
  startedAt: number
  endedAt: number | null
  status: 'running' | 'done' | 'failed'
}

export type CrewState = {
  /** The main-loop turn this crew started in; 0 before any crew. */
  turnNo: number
  /** The main-loop turn running now. */
  mainTurn: number
  startedAt: number | null
  costAtStart: number
  rows: CrewRow[]
  /** The stop gate already sent this crew back once. */
  gateFired: boolean
}

export const INITIAL_CREW: CrewState = { turnNo: 0, mainTurn: 0, startedAt: null, costAtStart: 0, rows: [], gateFired: false }

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

export const onMainTurn = (s: CrewState, turnNo: number): CrewState => ({ ...s, mainTurn: turnNo })

export function onSpawn(s: CrewState, a: { agentId: string; name?: string; description: string; model: string | null; now: number; turnNo: number; costNow: number }): CrewState {
  const fresh = s.turnNo !== a.turnNo
  const base: CrewState = fresh ? { ...INITIAL_CREW, mainTurn: s.mainTurn, turnNo: a.turnNo, startedAt: a.now, costAtStart: a.costNow } : s
  const row: CrewRow = {
    id: a.agentId, ...(a.name ? { name: a.name } : {}), description: a.description, role: roleOf(a.name, a.description),
    tier: tierOf(a.model, null), model: a.model, effort: null, tokens: 0, weight: 0, tools: 0, startedAt: a.now, endedAt: null, status: 'running',
  }
  return { ...base, rows: [...base.rows.filter(r => r.id !== a.agentId), row] }
}

export const onStep = (s: CrewState, agentId: string, model: string, effort: string | null): CrewState =>
  mapRow(s, agentId, r => ({ ...r, model, effort, tier: tierOf(model, effort) }))

export const onTool = (s: CrewState, agentId: string): CrewState => mapRow(s, agentId, r => ({ ...r, tools: r.tools + 1 }))

export const onAgentTurnEnd = (s: CrewState, agentId: string, u: UsageLike | undefined, now: number): CrewState =>
  mapRow(s, agentId, r => ({
    ...r,
    tokens: r.tokens + (u ? u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens : 0),
    weight: r.weight + (u ? tokenWeight(u) : 0),
    endedAt: r.status === 'running' ? r.endedAt : r.endedAt ?? now,
  }))

export function onStatuses(s: CrewState, list: readonly { id: string; status: string }[], now: number): CrewState {
  const by = new Map(list.map(a => [a.id, a.status]))
  return {
    ...s,
    rows: s.rows.map(r => {
      if (r.status !== 'running') return r
      const st = by.get(r.id)
      if (st === 'completed') return { ...r, status: 'done', endedAt: now }
      if (st === 'failed' || st === 'killed') return { ...r, status: 'failed', endedAt: now }
      return r
    }),
  }
}

export function shares(rows: readonly CrewRow[], crewCost: number): Record<string, number> {
  const total = rows.reduce((t, r) => t + r.weight, 0)
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  return Object.fromEntries(rows.map(r => [r.id, round(total > 0 ? (crewCost * r.weight) / total : crewCost / Math.max(1, rows.length))]))
}

export function progressOf(row: CrewRow, rows: readonly CrewRow[]): number {
  if (row.status !== 'running') return 1
  const most = Math.max(0, ...rows.filter(r => r.status === 'done' && r.role !== 'reviewer').map(r => r.tools))
  return most > 0 ? Math.min(0.95, row.tools / most) : 0.5
}

export const helpersRunning = (s: CrewState): number => s.rows.filter(r => r.status === 'running' && r.role !== 'reviewer').length
export const reviewerRunning = (s: CrewState): boolean => s.rows.some(r => r.status === 'running' && r.role === 'reviewer')
