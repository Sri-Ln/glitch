// Crew tiers: the model and effort each tier runs at, the step-up ladder a failed
// crew member climbs, and the agent types that pin them. Pure.
import type { CrewRow } from './crew'
import type { Tier } from './types'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type TierSpec = { model: string; effort: Effort }
export type CrewTiers = Record<Tier, TierSpec>
/** One step of the ladder: an agent type (`crew-<tier>` or `crew-<tier>-<effort>`) and what it runs at. */
export type Rung = { type: string; tier: Tier; model: string; effort: Effort }
/** A failed crew member's retry one rung up. `stepUps` counts the retry itself. */
export type StepUp = { fromId: string; name: string; from: string; to: string; stepUps: number }

export const TIERS: readonly Tier[] = ['light', 'medium', 'heavy']
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
/** A tier's own effort: xhigh and max are only step-up rungs. */
const TIER_EFFORTS: readonly Effort[] = ['low', 'medium', 'high']
export const AGENT_PREFIX = 'glitch-pets:'
export const MAX_STEP_UPS = 2

export const DEFAULT_TIERS: CrewTiers = {
  light: { model: 'claude-haiku-5-5', effort: 'low' },
  medium: { model: 'claude-sonnet-5-5', effort: 'medium' },
  heavy: { model: 'claude-opus-5-5', effort: 'high' },
}

const MODEL = /^[A-Za-z0-9][\w.:[\]-]*$/
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The `crewTiers` setting: a JSON object (or the object itself), tier → { model, effort }; each bad field keeps its default. */
export function parseCrewTiers(raw: unknown): { tiers: CrewTiers; problems: string[] } {
  const problems: string[] = []
  let o: unknown = raw
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return { tiers: DEFAULT_TIERS, problems }
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return { tiers: DEFAULT_TIERS, problems: ['crewTiers is not valid JSON'] }
    }
  }
  if (!isObject(o)) return { tiers: DEFAULT_TIERS, problems: ['crewTiers must be a JSON object of tiers (light, medium, heavy)'] }
  for (const k of Object.keys(o)) if (!(TIERS as readonly string[]).includes(k)) problems.push(`crewTiers: unknown tier ${k}`)
  const tiers = { ...DEFAULT_TIERS }
  for (const t of TIERS) {
    const v = o[t]
    if (v === undefined) continue
    if (!isObject(v)) {
      problems.push(`crewTiers.${t} must be an object with model and effort`)
      continue
    }
    let { model, effort } = DEFAULT_TIERS[t]
    if (v.model !== undefined) {
      if (typeof v.model === 'string' && MODEL.test(v.model)) model = v.model
      else problems.push(`crewTiers.${t}.model must be a model alias or id`)
    }
    if (v.effort !== undefined) {
      if ((TIER_EFFORTS as readonly unknown[]).includes(v.effort)) effort = v.effort as Effort
      else problems.push(`crewTiers.${t}.effort must be low, medium or high (xhigh and max are only step-up rungs)`)
    }
    tiers[t] = { model, effort }
  }
  return { tiers, problems }
}

const rank = (e: Effort): number => EFFORTS.indexOf(e)

/**
 * The step-up ladder: each tier's own rung, then (effort first) the same model at
 * high, then the next tier. Past the heavy tier: its model at each higher effort.
 */
export function ladderOf(tiers: CrewTiers): Rung[] {
  const rungs: Rung[] = []
  TIERS.forEach((tier, i) => {
    const { model, effort } = tiers[tier]
    rungs.push({ type: `crew-${tier}`, tier, model, effort })
    const above = i < TIERS.length - 1 ? (rank(effort) < rank('high') ? ['high' as const] : []) : EFFORTS.slice(rank(effort) + 1)
    for (const e of above) rungs.push({ type: `crew-${tier}-${e}`, tier, model, effort: e })
  })
  return rungs
}

const shortType = (type: string): string => (type.startsWith(AGENT_PREFIX) ? type.slice(AGENT_PREFIX.length) : type.includes(':') ? '' : type)

/** The rung an agent type is (`glitch-pets:crew-light` or `crew-light`), or null for any other type. */
export const rungOfType = (ladder: readonly Rung[], type: string): Rung | null => ladder.find(r => r.type === shortType(type)) ?? null

/** One rung up from `current`, skipping rungs that run the same model at the same effort; null at the top or off the ladder. */
export function nextRung(ladder: readonly Rung[], current: Rung | string): Rung | null {
  const at = ladder.findIndex(r => r.type === (typeof current === 'string' ? shortType(current) : current.type))
  if (at < 0) return null
  const cur = ladder[at] as Rung
  return ladder.slice(at + 1).find(r => r.model !== cur.model || r.effort !== cur.effort) ?? null
}

const FAMILY = /(haiku|sonnet|opus|fable)/i

/** `Haiku · low`: the model family (or the model as set) and the effort. */
export function rungLabel(r: Pick<Rung, 'model' | 'effort'>): string {
  const m = FAMILY.exec(r.model)
  const fam = m ? (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1).toLowerCase() : r.model
  return `${fam} · ${r.effort}`
}

const WHEN: Record<Tier, string> = {
  light: 'small, mechanical tasks: a lookup, a rename, a one-file edit, running a known check',
  medium: 'normal work: a feature across a few files, a focused research question, a test pass',
  heavy: 'hard reasoning: a tricky design, debugging across a system, reviewing a whole result',
}

export const CREW_MEMBER_PROMPT = [
  'You are a member of a Glitch crew: a helper agent the lead (the main Claude session) started for one task.',
  'Do exactly that task with the tools you have, within the files or sources it names and the constraints it states.',
  'Do not start helper agents of your own and never start a crew; if the task is too big for you, say so in your report.',
  'When you are done, reply with a short report: what you did, where (paths), and anything you are unsure of or could not do.',
  'If you could not finish, say so plainly. Never say something is done, fixed or verified unless you checked it.',
].join('\n')

/** One agent type per rung, as `$.agent.register` takes it. */
export function agentSpecs(ladder: readonly Rung[]): { name: string; description: string; prompt: string; model: string; effort: Effort; disallowedTools: string[] }[] {
  return ladder.map(r => ({
    name: r.type,
    description: r.type === `crew-${r.tier}`
      ? `Glitch crew member, ${r.tier} tier (${rungLabel(r)}): for ${WHEN[r.tier]}. Use it for a crew helper whose plan row says tier ${r.tier}; pass no model or effort.`
      : `Glitch crew step-up rung (${rungLabel(r)}): only to retry a failed crew member when a Glitch crew note names this type.`,
    prompt: CREW_MEMBER_PROMPT,
    model: r.model,
    effort: r.effort,
    disallowedTools: ['Agent'],
  }))
}

/** Rows that just went from running to failed on a crew rung, each with its next rung (none past the top or the cap; a kill is the person's call). */
export function stepUpsFor(before: readonly CrewRow[], after: readonly CrewRow[], ladder: readonly Rung[]): StepUp[] {
  const ups: StepUp[] = []
  for (const r of after) {
    const was = before.find(b => b.id === r.id)
    if (r.status !== 'failed' || r.killed || !r.rung || was?.status !== 'running') continue
    const done = r.stepUps ?? 0
    if (done >= MAX_STEP_UPS) continue
    const next = nextRung(ladder, r.rung)
    if (!next) continue
    ups.push({ fromId: r.id, name: r.name ?? r.description, from: r.rung, to: next.type, stepUps: done + 1 })
  }
  return ups
}

/** What Claude reads beside the next prompt: retry the failed member one rung up. */
export function stepUpNote(u: StepUp, ladder: readonly Rung[]): string {
  const from = ladder.find(r => r.type === u.from)
  return `Glitch crew: ${u.name} failed on ${from ? rungLabel(from) : u.from} (${AGENT_PREFIX}${u.from}); retry it with subagent type ${AGENT_PREFIX}${u.to}: the same prompt, the name ${u.name}, and no model or effort.`
}

/** The step-up a retry spawn answers: same type and name first, else the oldest of that type. */
export function claimStepUp(sent: readonly StepUp[], type: string, name: string | undefined): { claimed: StepUp | null; rest: StepUp[] } {
  const t = shortType(type)
  const i = sent.findIndex(u => u.to === t && u.name === name)
  const j = i >= 0 ? i : sent.findIndex(u => u.to === t)
  if (j < 0) return { claimed: null, rest: [...sent] }
  return { claimed: sent[j] as StepUp, rest: sent.filter((_, k) => k !== j) }
}
