import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { MoodState, PetsView } from '../types'
import { personaProblems } from './behavior/contract'
import { INITIAL_CREW, crewSummaryOf, elapsedOf, helpersRunning, onAgentRunEnd, onAgentTurnEnd, onAgentWake, onMainTurnEnd, onMainTurnStart, onSpawn, onStatuses, onStep, onStepUsage, onTool, reviewerRunning, shares, stepsOf } from './behavior/crew'
import type { CrewState, CrewSummary } from './behavior/crew'
import { CREW_RULE, GATE_TEXT, needsReview } from './behavior/gate'
import { leadStatus } from './behavior/lead-status'
import { isCapReached } from './behavior/moods'
import type { BudgetLike } from './behavior/moods'
import { createPlayer, frameIndex } from './behavior/player'
import { REWARD_MS, crewName, hasGift, rewardAt } from './behavior/reactions'
import { rewardBadge, rewardFrame, rewardFrameTimes, rewardTimeline } from './behavior/reward'
import { STORE_STREAK, advance, asStreak } from './behavior/streak'
import { AGENT_PREFIX, REVIEWER_TYPE, agentSpecs, claimStepUp, isReviewerName, isReviewerSpawn, isReviewerType, ladderOf, reviewerSpec, rungOfType, stepUpNote, stepUpsFor } from './behavior/tiers'
import type { CrewTiers, Rung, StepUp } from './behavior/tiers'
import type { MoodArt, MoodId, Persona, PetId, Sprite, VoiceMoment } from './behavior/types'
import { PET_IDS } from './behavior/types'
import { INITIAL_VOICE, pickLine } from './behavior/voice'
import type { VoiceState } from './behavior/voice'
import { PETS_USAGE, ROUTED_PETS, STORE_PET, parsePetArg, petArgsOf, petList } from './commands'
import { parsePetsConfig } from './config'
import type { PetsConfig } from './config'
import { DESKTOP_CELL, MINI_PIXEL, crewTree, rewardGeometry } from './pane'
import type { CrewGroup, CrewMember, CrewView } from './pane'
import { PERSONAS } from './personas/index'
import { onCrewChange, onPoke, onToolResult, onTurnEnd, onTurnStartStreak, tickOnce } from './tick'
import { INITIAL_REACTIONS } from './behavior/reactions'
// Crew themes (#41): the setting and /glitch crew theme. The pane draws minis with crewMini(view.crewTheme, ...).
import { STORE_CREW_THEME, crewDebugText, crewThemeArgOf, isCrewDebug, parseThemeArg, themeList } from './commands'
import type { CrewDebugState } from './commands'
import { CREW_THEMES, DEFAULT_CREW_THEME, crewMini, crewThemeIds } from './crew-themes/index'

const INITIAL_MOOD: MoodState = { mood: 'idle', since: 0, turnSince: null, lastPromptAt: 0, oopsUntil: 0, happyUntil: 0, cheerUntil: 0, cryUntil: 0, failStreak: 0, pokedUntil: 0, pokeSeen: 0, reactions: INITIAL_REACTIONS }

export const sprite = atom({ plugin: 'glitch-pets', key: 'sprite' } as const, null as Sprite | null)
export const mood = atom({ plugin: 'glitch-pets', key: 'mood' } as const, INITIAL_MOOD)
export const view = atom({ plugin: 'glitch-pets', key: 'view' } as const, { petId: 'bud' } as PetsView)
export const crew = atom({ plugin: 'glitch-pets', key: 'crew' } as const, INITIAL_CREW as CrewState)
/** Which crew pane groups are open, keyed `<crew start>:<group>` (the terminal's fold under its own key). */
export const crewOpen = atom({ plugin: 'glitch-pets', key: 'crewOpen' } as const, {} as Record<string, boolean>)
/** What glitch-hud's crew pill shows; null while no crew is open or recent. */
export const crewSummary = atom({ plugin: 'glitch-pets', key: 'crewSummary' } as const, null as CrewSummary | null)
/** The crew pane's frame clock: touched (from the 100 ms tick) when a mini or the reward next changes, so the pane redraws then. */
export const paneFrame = atom({ plugin: 'glitch-pets', key: 'paneFrame' } as const, 0)

const PANE = 'glitch-crew'
/** The lead draws at 3× (48 × 39), clearly larger than the crew's 2× minis. */
const LEAD_PIXEL = 3
/** A reward moment first drawn later than this after it started shows only its badge (it would start part-way through). */
const FIRST_SHOW_MS = 300
/**
 * The room the pane asks for, by where it will show: a narrow dock (about 300 px) and
 * room inline for the lead and about three members on the rich surfaces; a dock wide
 * enough for the aligned rows and a few lines inline on the terminal.
 */
const PANE_SIZE = { rich: { columns: 40, rows: 24 }, terminal: { columns: 90, rows: 10 } } as const
type PaneSize = { columns: number; rows: number }
/** A fullscreen terminal's dock leaves the transcript about half its columns, within these. */
const DOCK_COLUMNS = { min: 40, max: 90 } as const
/** glitch-hud's crew pill in its band: a press on it opens or closes the pane. */
const HUD_PILL = 'glitch-crew'
/** Helpers' statuses are asked every this many ticks (1 s). */
const STATUS_TICKS = 10

export const TICK_MS = 100
const LONG_TURN_MS = 120_000
const SPEAKS_ON_ENTRY: Partial<Record<MoodId, VoiceMoment>> = { worried: 'worried', sleepy: 'sleepy', oops: 'oops', cheering: 'cheering', crying: 'crying' }

// Pets that break the contract are left out (named once at start).
// Composed personas hold the laptop keys 4/6/7 by design; the raw-file reserved-key check lives in personas/index.ts (composeSafely) and personas.test.
const usable = Object.fromEntries(Object.entries(PERSONAS).filter(([, p]) => p && personaProblems(p, { composed: true }).length === 0)) as Partial<Record<PetId, Persona>>
const broken = (Object.keys(PERSONAS) as PetId[]).filter(id => !usable[id])
const available = PET_IDS.filter(id => usable[id])
const personaFor = (id: PetId | 'off'): Persona | null => (id === 'off' ? null : (usable[id] ?? usable.screenhead ?? null))

// Per-load state, set in `register`.
let config: PetsConfig = parsePetsConfig({}).config
let player = createPlayer()
let voice: VoiceState = INITIAL_VOICE
let lastSource: string | null = null
let ticking = false
let ticks = 0
/** The reviewer finished while the main turn ran: crewDone waits for the turn's end (no remark mid-turn). */
let crewDonePending = false
/** The crew pane is open (drawn since its open, not closed since): only then does the frame clock run. */
let paneShown = false
/** Per surface: when the pane's drawing next changes (clock ms), from its last draw. */
const frameDue = new Map<string, number>()
/** Per surface and reward moment: whether its overlay is shown (decided at its first draw). */
type Shown = { show: false } | { show: true; sig: string; geo: NonNullable<ReturnType<typeof rewardGeometry>> }
const rewardShown = new Map<string, Shown>()
/** The crew's cost as of a crew state: a frame-only redraw reads no usage. */
let costCache: { sig: string; cost: number; at: number } | null = null
/** How long a read of the crew's cost stands (the pill's 1 s cadence). */
const COST_FRESH_MS = 1000
/** The crew's 2+ helpers finished with no reviewer: the next prompt carries the reminder. */
let reviewMissed = false
/** A prompt is carrying the reminder now: claimed before awaiting, so two prompts at once cannot both. */
let reminderInFlight = false
/** How long a member press waits for the view to switch before it says it did not. */
const VIEW_WAIT_MS = 4000
/** What `/glitch crew debug` shows: the engine's last list, the last presses, the view each surface drew under. */
const freshDebug = (): CrewDebugState => ({ list: null, listError: null, presses: [], views: {}, draws: {} })
let debug: CrewDebugState = freshDebug()
function recordPress(p: CrewDebugState['presses'][number]) {
  debug.presses = [p, ...debug.presses].slice(0, 10)
}

// $.state.get needs a literal plugin and key, so these three cannot be merged.
async function hudStats($: EngineInterface): Promise<unknown> {
  try {
    return (await $.state.get({ plugin: 'glitch-hud', key: 'stats' } as const)).value
  } catch {
    return null
  }
}

async function hudBudget($: EngineInterface): Promise<unknown> {
  try {
    return (await $.state.get({ plugin: 'glitch-hud', key: 'budget' } as const)).value
  } catch {
    return null
  }
}

async function hudCache($: EngineInterface): Promise<unknown> {
  try {
    return (await $.state.get({ plugin: 'glitch-hud', key: 'cache' } as const)).value
  } catch {
    return null
  }
}

async function hudPoke($: EngineInterface): Promise<unknown> {
  try {
    return (await $.state.get({ plugin: 'glitch-hud', key: 'poke' } as const)).value
  } catch {
    return null
  }
}

// Helpers' statuses from the engine's list. While a row runs, each refresh touches the
// crew so the pane's clocks move.
async function refreshCrew($: EngineInterface) {
  // Nothing runs: no status can change, so no call.
  if (!(await read($, crew)).rows.some(r => r.status === 'running')) return
  let list: AgentInfo[] | null = null
  try {
    list = await $.agent.list()
  } catch (err) {
    debug.listError = err instanceof Error ? err.message : String(err)
  }
  const now = await $.clock.now()
  if (!list) return
  debug.list = { at: now, entries: list.map(a => ({ id: a.id, status: a.status, description: a.description, ...(a.name ? { name: a.name } : {}) })) }
  debug.listError = null
  const got = list
  if (!(await changeCrew($, now, c => onStatuses(c, got, now)))) {
    if ((await read($, crew)).rows.some(r => r.status === 'running')) await update($, crew, c => ({ ...c, tickAt: now }))
  }
}

/**
 * One change to the crew's statuses, from whichever source (the list, a helper's own turn end or
 * wake): the rows, the step-ups, the lead's reaction, the HUD summary at once, and the crewDone
 * remark once the reviewer finishes and nothing else runs. False when no status changed.
 */
async function changeCrew($: EngineInterface, now: number, fn: (c: CrewState) => CrewState): Promise<boolean> {
  const before = await read($, crew)
  const sameStatuses = (c: CrewState) => c.rows.length === before.rows.length && c.rows.every((r, i) => r.status === before.rows[i]?.status)
  if (sameStatuses(fn(before))) return false
  await update($, crew, fn)
  const c = await read($, crew)
  queueStepUps(before.rows, c.rows)
  // The lead reacts: a member done is a brief joy and a reward, one failed a worry (behavior/reactions.ts).
  await update($, mood, m => onCrewChange(m, before, c, now))
  // The HUD pill follows the pane now, not at the next 1 s tick.
  await publishSummary($, true).catch(() => undefined)
  const reviewerFinished = before.rows.some(r => r.role === 'reviewer' && r.status === 'running' && c.rows.find(x => x.id === r.id)?.status !== 'running')
  if (!reviewerFinished || helpersRunning(c) > 0 || reviewerRunning(c)) return true
  if ((await read($, mood)).turnSince !== null) crewDonePending = true
  else await say($, 'crewDone')
  return true
}

// `/glitch crew debug`: the rows against a fresh read of the engine's list, the last presses and views.
async function answerCrewDebug($: EngineInterface): Promise<string> {
  const now = await $.clock.now()
  const c = await read($, crew)
  let freshList: NonNullable<CrewDebugState['list']>['entries'] | null = null
  let listError = debug.listError
  try {
    freshList = (await $.agent.list()).map(a => ({ id: a.id, status: a.status, description: a.description, ...(a.name ? { name: a.name } : {}) }))
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err)
  }
  const surfaces: readonly string[] = await $.session.surfaces().catch(() => [])
  const panes = (await $.ui.panes().catch(() => [])).map(p => p.id)
  return crewDebugText({ now, crew: c, list: debug.list, listError, freshList, presses: debug.presses, views: debug.views, draws: debug.draws, surfaces, panes })
}

// With no surface named (auto-open), a session the desktop or a phone draws gets the
// narrow dock; a terminal-only one the wide dock.
async function sessionSize($: EngineInterface): Promise<PaneSize> {
  const surfaces = await $.session.surfaces().catch(() => [] as const)
  return surfaces.some(s => s !== 'terminal') ? PANE_SIZE.rich : PANE_SIZE.terminal
}

async function toggleCrew($: EngineInterface, size: PaneSize): Promise<string> {
  const isOpen = (await $.ui.panes().catch(() => [])).some(x => x.id === PANE)
  if (isOpen) {
    paneClosed()
    await $.ui.close({ id: PANE })
    return 'Crew pane closed.'
  }
  await $.ui.open({ id: PANE, title: 'Crew', columns: size.columns, rows: size.rows })
  return 'Crew pane opened.'
}

function paneClosed() {
  paneShown = false
  frameDue.clear()
  // A moment shown before the close is not picked up again late: reopened, the gift is a badge.
  rewardShown.clear()
}

/**
 * A command typed at the terminal (the composer, or any fullscreen one) gets the
 * terminal's dock, even in a session the desktop draws too; a fullscreen dock leaves
 * the transcript about half the columns. Any other command sizes as the session.
 */
async function commandSize($: EngineInterface, e: { origin?: { kind: string }; presentation?: { isFullscreen?: boolean; columns?: number } }): Promise<PaneSize> {
  const fullscreen = e.presentation?.isFullscreen === true
  if (e.origin?.kind === 'composer') {
    const surfaces: readonly string[] = await $.session.surfaces().catch(() => [])
    const atTerminal = fullscreen || surfaces.includes('terminal')
    const cols = e.presentation?.columns
    if (atTerminal) return fullscreen && typeof cols === 'number' && cols > 0 ? { columns: Math.max(DOCK_COLUMNS.min, Math.min(DOCK_COLUMNS.max, Math.floor(cols / 2))), rows: PANE_SIZE.terminal.rows } : PANE_SIZE.terminal
  }
  return await sessionSize($)
}

// The crew's share of the session cost: one source for the pane and the HUD pill.
async function crewCostOf($: EngineInterface, c: CrewState): Promise<number> {
  const usdNow = (await $.session.usage().catch(() => null))?.cost?.usd ?? c.costAtStart
  return Math.max(0, usdNow - c.costAtStart)
}

// The figures glitch-hud's crew pill shows, written only when they change. No crew, no reads.
// `keepCost`: a status change publishes its counts at once with the cost as last read (no usage
// read between the 1 s reads, so the pane and the pill keep one cost); the next tick reads it.
async function publishSummary($: EngineInterface, keepCost = false) {
  const c = await read($, crew)
  const before = await read($, crewSummary)
  if (c.rows.length === 0 && before === null) return
  const now = await $.clock.now()
  const cost = !c.rows.length ? 0 : keepCost ? (costCache?.cost ?? before?.cost ?? 0) : await sharedCost($, c, now)
  const next = crewSummaryOf(c, cost, now)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, crewSummary, () => next)
}

/**
 * The receiver's mini while it is happy: its crew theme's frame drawn from the pet's happy loop
 * (the theme's own size, hat or hands kept), so it neither jumps nor loses its look.
 */
function happyMini(p: Persona, theme: string, row: CrewState['rows'][number], elapsedMs: number, now: number): Sprite {
  const happy = p.moods.happy
  const frame = happy.frames[frameIndex(happy, elapsedMs)] ?? p.moods.idle.frames[0] ?? []
  const asHappy: Persona = { ...p, moods: { ...p.moods, idle: { frames: [frame], fps: happy.fps } } }
  const s = crewMini(theme, { persona: asHappy, role: row.role, model: row.model, effort: row.effort, status: row.status, elapsedMs: (row.endedAt ?? now) - row.startedAt }, MINI_PIXEL)
  return { source: s.source, alt: `${p.name} the ${p.kind}, happy`, width: s.width, height: s.height }
}

/** Ms until a mood loop shows its next frame. */
const nextFrameIn = (art: MoodArt, elapsedMs: number): number => {
  const period = 1000 / art.fps
  return Math.max(1, Math.ceil(period - (Math.max(0, elapsedMs) % period)))
}

/**
 * The crew's cost, one value for the pane and the HUD pill: read again when the crew changed or
 * the last read is a second old, so a frame-only redraw reads no usage.
 */
async function sharedCost($: EngineInterface, c: CrewState, now: number): Promise<number> {
  const sig = JSON.stringify([c.startedAt, c.costAtStart, c.rows.map(r => [r.id, r.status, r.tokens, r.weight])])
  if (costCache && costCache.sig === sig && now - costCache.at < COST_FRESH_MS) return costCache.cost
  const cost = await crewCostOf($, c)
  costCache = { sig, cost, at: now }
  return cost
}

const openKey = (c: CrewState, group: CrewGroup, isTerminal: boolean) => `${c.startedAt ?? 0}:${group}${isTerminal && group === 'finished' ? ':terminal' : ''}`
// Desktop groups start open; the terminal's finished members start folded.
const isOpenIn = (o: Record<string, boolean>, c: CrewState, group: CrewGroup, isTerminal: boolean) =>
  o[openKey(c, group, isTerminal)] ?? !(isTerminal && group === 'finished')

async function say($: EngineInterface, moment: VoiceMoment) {
  const p = personaFor((await read($, view)).petId)
  if (!p) return
  const m = await read($, mood)
  const picked = pickLine(p, moment, voice, { now: await $.clock.now(), isTurnRunning: m.turnSince !== null, enabled: config.voice, everyMs: config.voiceEveryMs, random: Math.random })
  if (!picked) return
  voice = picked.state
  $.ui.toast(picked.text, { timeoutMs: 6000 })
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  // The crew pane needs the statuses with the pet off too.
  ticks += 1
  if (ticks % STATUS_TICKS === 0) {
    await refreshCrew($)
    await publishSummary($)
  }
  // The pane's frame clock: while it is open and a mini (or the reward) is due to change.
  if (paneShown && frameDue.size > 0 && now >= Math.min(...frameDue.values())) {
    frameDue.clear()
    await update($, paneFrame, () => now)
  }
  const p = personaFor((await read($, view)).petId)
  if (!p) {
    if (lastSource !== null) {
      lastSource = null
      await update($, sprite, () => null)
    }
    return
  }
  const stats = (await hudStats($)) as { total?: number } | null
  const b = (await hudBudget($)) as BudgetLike | null
  const c = (await hudCache($)) as { secondsLeft?: number | null } | null
  // A click on the pet (glitch-hud draws it and records the press) starts a hop.
  const pressed = (await hudPoke($)) as { at?: unknown } | null
  if (typeof pressed?.at === 'number' && pressed.at > (await read($, mood)).pokeSeen) {
    await update($, mood, x => onPoke(x, pressed.at as number, now))
  }
  const team = await read($, crew)
  const m = await read($, mood)
  const r = tickOnce({
    now, persona: p, player, state: m, lastSource, total: stats?.total ?? 0, budget: b, cacheSecondsLeft: c?.secondsLeft ?? null,
    helpersRunning: helpersRunning(team), reviewerRunning: reviewerRunning(team), tiredMs: config.tiredMs, sleepyMs: config.sleepyMs, crew: team,
  })
  if (r.moodChanged) {
    await update($, mood, x => ({ ...x, mood: r.mood, since: r.since }))
    // Crew news has no remark here: a member's failure is not the budget's worry.
    const moment = r.fromCrew ? undefined : SPEAKS_ON_ENTRY[r.mood]
    if (moment) await say($, moment)
  }
  if (r.sprite) {
    lastSource = r.sprite.source
    await update($, sprite, () => r.sprite)
  }
}

const firstWord = (args: string): string => (args.trim().split(/\s+/)[0] ?? '').toLowerCase()

// `arg` is the pet argument (see petArgsOf): empty lists the pets.
async function answerPets($: EngineInterface, arg: string): Promise<string> {
  const word = arg.trim().split(/\s+/)[0]
  const parsed = parsePetArg(word)
  if (parsed.kind === 'show') return petList((await read($, view)).petId, available)
  if (parsed.kind === 'unknown') return `Unknown pet "${parsed.name}". ${petList((await read($, view)).petId, available)}`
  const petId: PetId | 'off' = parsed.kind === 'off' ? 'off' : parsed.id
  await $.store.set(STORE_PET, petId).catch(() => undefined)
  await update($, view, v => ({ ...v, petId }))
  const p = personaFor(petId)
  return p ? `Pet: ${p.name} the ${p.kind}.` : 'Pet off.'
}

// ── Crew tiers (#43): typed crew members, their model enforced, step-up on failure ──
// The step-up goes to Claude as a one-time note beside the next prompt (the crew
// review reminder's channel): Claude retries under the next rung's type, so the
// retry's answer reaches it as its own helper's task notification.

let crewTiers: CrewTiers = parsePetsConfig({}).config.crewTiers
let ladder: Rung[] = ladderOf(crewTiers)
/** Failed crew members whose note has not reached the model yet. */
let stepUpsQueued: StepUp[] = []
/** Notes sent this main turn: the retry spawn they ask for claims one, linking its row. */
let stepUpsSent: StepUp[] = []
/** Notes riding a prompt now (between its submit and its answer): they hold the review too. */
let stepUpsInFlight: StepUp[] = []
/** Notes a main turn ended without acting on: still claimable by name, no longer holding the review. */
let stepUpsStale: StepUp[] = []
/** Rows already stepped up from (queued, sent or claimed): a resumed row failing again is not stepped twice. */
let steppedFrom = new Set<string>()

function queueStepUps(before: CrewState['rows'], after: CrewState['rows']) {
  for (const u of stepUpsFor(before, after, ladder)) {
    if (steppedFrom.has(u.fromId)) continue
    steppedFrom.add(u.fromId)
    stepUpsQueued.push(u)
  }
}

/** Failed rows whose retry is still to come: the review reminder waits for them. */
const heldForStepUp = (): string[] => [...stepUpsQueued, ...stepUpsInFlight, ...stepUpsSent].map(u => u.fromId)

/** A main turn ended: a note Claude read and did not act on stops holding the review (a same-name retry still links). */
function dropUnclaimedStepUps() {
  stepUpsStale = [...stepUpsStale, ...stepUpsSent]
  stepUpsSent = []
}

/** A main turn that a step-up note rides is the crew's: it is busy, so its end does not close the crew before the review check. */
const busyForStepUps = (c: CrewState): CrewState => (stepUpsSent.length || stepUpsInFlight.length ? { ...c, turnBusy: true } : c)

type StepList = 'queued' | 'sent' | 'stale'
const stepList = (l: StepList): StepUp[] => (l === 'queued' ? stepUpsQueued : l === 'sent' ? stepUpsSent : stepUpsStale)
function setStepList(l: StepList, v: StepUp[]) {
  if (l === 'queued') stepUpsQueued = v
  else if (l === 'sent') stepUpsSent = v
  else stepUpsStale = v
}

/**
 * The retry a call or spawn is (read only; tool.call and agent.spawn decide alike): a
 * pending step-up by name (queued, sent, then stale), else a sent note by type; and
 * the rung it runs on: the step-up's target when the asked crew type is at or below
 * the failed rung, else the asked one.
 */
function findRetry(type: string, name: string | undefined): { list: StepList; index: number; claimed: StepUp; target: Rung } | null {
  const asked = rungOfType(ladder, type)
  if (!asked) return null
  let found: { list: StepList; index: number } | null = null
  for (const l of ['queued', 'sent', 'stale'] as const) {
    const i = name ? stepList(l).findIndex(u => u.name === name) : -1
    if (i >= 0) {
      found = { list: l, index: i }
      break
    }
  }
  if (!found) {
    const { claimed } = claimStepUp(stepUpsSent, type, name)
    if (claimed) found = { list: 'sent', index: stepUpsSent.indexOf(claimed) }
  }
  if (!found) return null
  const claimed = stepList(found.list)[found.index] as StepUp
  const at = (t: string) => ladder.findIndex(r => r.type === t)
  const target = at(asked.type) <= at(claimed.from) ? (ladder[at(claimed.to)] ?? asked) : asked
  return { ...found, claimed, target }
}

type CrewStep = { rung?: string; stepUps?: number; steppedUpFrom?: NonNullable<CrewState['rows'][number]['steppedUpFrom']> }

/**
 * Before a spawn: a retry of a member with a step-up pending (by name; else a sent
 * note by type) runs at least one rung up — a crew type at or below the failed rung is
 * rewritten to the step-up's target — and counts toward the cap. A crew type's model wins.
 * `restore` puts the claim back when the spawn is refused.
 */
function crewSpawnOf<E extends { subagentType: string; model?: string; fork: boolean; workflow?: unknown; name?: string }>(e: E, c: CrewState | null, own: boolean): { e: E; step: CrewStep; restore: () => void } {
  const none = { e: crewModelOf(e), step: {}, restore: () => undefined }
  if (!own) return none
  if (c?.closed) {
    stepUpsQueued = []
    stepUpsSent = []
    stepUpsStale = []
    steppedFrom = new Set()
  }
  const started = !((e as { resume?: unknown }).resume || e.fork || e.workflow)
  // The crew's reviewer (#45), by its reviewer-<n> name, runs as the lean crew-reviewer whatever type it was asked on.
  if (started && isReviewerSpawn(e)) {
    const forced = isReviewerType(e.subagentType) ? e : { ...e, subagentType: `${AGENT_PREFIX}${REVIEWER_TYPE}` }
    return { e: crewModelOf(forced), step: { rung: REVIEWER_TYPE }, restore: () => undefined }
  }
  const asked = started ? rungOfType(ladder, e.subagentType) : null
  if (!asked) return none
  const retry = findRetry(e.subagentType, e.name)
  if (!retry) {
    // Past the cap (or retried without a note): the name's earlier tries still count.
    const before = Math.max(0, ...(c?.rows ?? []).filter(r => r.rung && e.name && r.name === e.name).map(r => r.stepUps ?? 0))
    return { e: crewModelOf(e), step: { rung: asked.type, ...(before ? { stepUps: before } : {}) }, restore: () => undefined }
  }
  const { claimed, target } = retry
  setStepList(retry.list, stepList(retry.list).filter((_, k) => k !== retry.index))
  const restore = () => setStepList(retry.list, [...stepList(retry.list), claimed])
  const at = (t: string) => ladder.findIndex(r => r.type === t)
  const from = ladder[at(claimed.from)]
  const forced = target.type === asked.type ? e : { ...e, subagentType: `${AGENT_PREFIX}${target.type}` }
  return {
    e: crewModelOf(forced),
    step: { rung: target.type, stepUps: claimed.stepUps, steppedUpFrom: { id: claimed.fromId, rung: claimed.from, model: from?.model ?? '', effort: from?.effort ?? '' } },
    restore,
  }
}

/** A spawn on a crew type (or the reviewer's) runs on the type's model: a different `model` is set back to it. */
function crewModelOf<E extends { subagentType: string; model?: string; fork: boolean; workflow?: unknown }>(e: E): E {
  const fresh = !((e as { resume?: unknown }).resume || e.fork || e.workflow)
  const pinned = !fresh ? null : isReviewerType(e.subagentType) ? crewTiers.reviewer : rungOfType(ladder, e.subagentType)
  return !pinned || e.model === undefined || e.model === pinned.model ? e : { ...e, model: pinned.model }
}

/** One agent type per rung (glitch-pets:crew-light, crew-light-high, …) and the lean reviewer: effort can only come from a type. */
async function registerCrewTypes($: EngineInterface) {
  const failed: string[] = []
  for (const spec of [...agentSpecs(ladder), reviewerSpec(crewTiers)]) {
    try {
      await $.agent.register(spec)
    } catch {
      failed.push(spec.name)
    }
  }
  if (failed.length) $.ui.toast(`Glitch pets: could not register crew agent types: ${failed.join(', ')}`, { timeoutMs: 8000 })
}

/**
 * The step-up notes ride the next prompt that reaches the model (a person's, or a
 * helper's task notification), once: the prompt with them, and a `next` that counts
 * them sent only if they entered (a hook beneath may rewrite the context).
 */
function withStepUps<E extends { origin: { kind: string }; context?: readonly string[] }, N extends (x: E) => Promise<unknown>>(e: E, next: N): { e: E; next: N } {
  if (stepUpsQueued.length === 0 || e.origin.kind === 'plugin' || (e as { command?: unknown }).command) return { e, next }
  const ups = stepUpsQueued
  stepUpsQueued = []
  stepUpsInFlight = [...stepUpsInFlight, ...ups]
  const notes = ups.map(u => stepUpNote(u, ladder))
  const wrapped = (async (x: E) => {
    let r: { context?: readonly string[]; drop?: unknown }
    try {
      r = (await next(x)) as typeof r
    } catch (err) {
      stepUpsQueued = [...ups, ...stepUpsQueued]
      throw err
    } finally {
      stepUpsInFlight = stepUpsInFlight.filter(u => !ups.includes(u))
    }
    const entered = 'context' in r && r.context !== undefined ? notes.every(n => r.context?.includes(n)) : r.drop === undefined
    if (entered) stepUpsSent = [...stepUpsSent, ...ups]
    else stepUpsQueued = [...ups, ...stepUpsQueued]
    return r
  }) as unknown as N
  return { e: { ...e, context: [...(e.context ?? []), ...notes] }, next: wrapped }
}
// ── end crew tiers (module part) ──

// ── Crew themes (#41) ─────────────────────────────────────────────────────────────────────
// The active theme lives in `view.crewTheme`: the saved choice, else the crewTheme setting.
const themeOrConfig = (saved: unknown): string => (typeof saved === 'string' && Object.hasOwn(CREW_THEMES, saved) ? saved : config.crewTheme)

async function restoreCrewTheme($: EngineInterface) {
  const crewTheme = themeOrConfig(await $.store.get(STORE_CREW_THEME).catch(() => undefined))
  await update($, view, v => ({ ...v, crewTheme }))
}

// `arg` is the theme argument (see crewThemeArgOf): empty lists the themes.
async function answerCrewTheme($: EngineInterface, arg: string): Promise<string> {
  const ids = crewThemeIds()
  const list = async () => themeList(themeOrConfig((await read($, view)).crewTheme), ids.map(id => ({ id, name: CREW_THEMES[id]?.name ?? id })))
  const parsed = parseThemeArg(arg, ids)
  if (parsed.kind === 'show') return list()
  if (parsed.kind === 'unknown') return `Unknown crew theme "${parsed.name}". ${await list()}`
  await $.store.set(STORE_CREW_THEME, parsed.id).catch(() => undefined)
  await update($, view, v => ({ ...v, crewTheme: parsed.id }))
  return `Crew theme: ${CREW_THEMES[parsed.id]?.name ?? parsed.id}.`
}
// ── end crew themes ───────────────────────────────────────────────────────────────────────

export const register: Register = (on, options) => {
  const parsed = parsePetsConfig(options as Record<string, unknown>)
  const problems = parsed.problems
  config = parsed.config
  player = createPlayer()
  voice = INITIAL_VOICE
  lastSource = null
  ticking = false
  ticks = 0
  crewDonePending = false
  reviewMissed = false
  reminderInFlight = false
  paneShown = false
  frameDue.clear()
  rewardShown.clear()
  costCache = null
  debug = freshDebug()

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'glitch-pets', description: PETS_USAGE })
    } catch {
      $.ui.toast('Glitch pets: could not register /glitch-pets', { timeoutMs: 8000 })
    }
    await registerCrewTypes($)
    if (problems.length) $.ui.toast(`Glitch pets: ${problems.join('; ')}`, { timeoutMs: 8000 })
    if (broken.length) $.ui.toast(`Glitch pets: left out (art problems): ${broken.join(', ')}`, { timeoutMs: 8000 })
    const saved = await $.store.get(STORE_PET).catch(() => undefined)
    const petId = saved === 'off' || (PET_IDS as readonly unknown[]).includes(saved) ? (saved as PetId | 'off') : config.pet
    const now = await $.clock.now()
    await update($, view, v => ({ ...v, petId }))
    await restoreCrewTheme($).catch(() => undefined) // crew themes (#41)
    await update($, mood, m => ({ ...m, since: now, lastPromptAt: m.lastPromptAt || now }))
    if (!ticking) {
      ticking = true
      $.clock.every(TICK_MS, async () => {
        try {
          await tick($)
        } catch {
          // The next tick draws again.
        }
      })
    }
    return started
  })

  on('prompt.submit', async ($, raw, rawNext) => {
    const { e, next } = withStepUps(raw, rawNext)
    if (e.origin.kind !== 'plugin') {
      try {
        const now = await $.clock.now()
        await update($, mood, m => ({ ...m, lastPromptAt: now }))
      } catch {
        // The pet just misses this one.
      }
    }
    // The missed-review reminder rides the next prompt that reaches the model (not a
    // plugin's own, not a slash command's), as context the person never sees.
    if (!reviewMissed || reminderInFlight || !config.crewReview || e.origin.kind === 'plugin' || (e as { command?: unknown }).command) return next(e)
    // Stale by now (a reviewer joined, the turn was aborted, a new crew): dropped.
    const now = await read($, crew).catch(() => null)
    if (!now || !needsReview(now, { enabled: true, stopHookActive: false, capReached: false, held: heldForStepUp() })) {
      reviewMissed = false
      return next(e)
    }
    if (reminderInFlight) return next(e)
    reminderInFlight = true
    let r: Awaited<ReturnType<typeof next>>
    try {
      r = await next({ ...e, context: [...(e.context ?? []), GATE_TEXT] })
    } finally {
      reminderInFlight = false
    }
    // Sent only if it entered: a hook beneath may have rewritten the context.
    const entered = 'context' in r && r.context !== undefined ? r.context.includes(GATE_TEXT) : r.drop === undefined
    if (entered) {
      reviewMissed = false
      await update($, crew, c => ({ ...c, gateFired: true })).catch(() => undefined)
    }
    return r
  })

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      try {
        await update($, crew, c => busyForStepUps(onMainTurnStart(c)))
        const now = await $.clock.now()
        await update($, mood, m => ({ ...m, turnSince: now }))
        const r = advance(asStreak(await $.store.get(STORE_STREAK).catch(() => null)), now)
        if (r.changed) await $.store.set(STORE_STREAK, r.streak).catch(() => undefined)
        await update($, mood, m => onTurnStartStreak(m, r, now))
      } catch {
        // The pet just misses this one.
      }
    } else {
      // A helper's own turn starting: a message woke a finished one, so its row runs again.
      const agentId = (e as { agentId?: string }).agentId as string
      try {
        const now = await $.clock.now()
        await changeCrew($, now, c => onAgentWake(c, agentId, now))
      } catch {
        // The list's poll still sees it.
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      if (e.agentId === undefined) {
        // Statuses first, while the turn still counts as running: a reviewer that just
        // finished holds crewDone for the remark below, which then wins over happy.
        await refreshCrew($).catch(() => undefined)
        try {
          const now = await $.clock.now()
          await update($, mood, m => onTurnEnd(m, e.reason, now))
          if (crewDonePending) {
            crewDonePending = false
            await say($, 'crewDone')
          } else if (e.reason === 'answer' && e.durationMs >= LONG_TURN_MS) await say($, 'happy')
        } catch {
          // Leave the mood as it was.
        }
        // Each main turn's end: is the crew's work unreviewed (the reminder goes out
        // with the next prompt), then a quiet turn closes the crew.
        try {
          // Every main turn's end, before the hud reads: unclaimed notes stop holding the review.
          dropUnclaimedStepUps()
          // An interrupted turn is the person's call: no reminder for this crew.
          if (e.isAborted) await update($, crew, c => ({ ...c, gateFired: true }))
          else if (config.crewReview) {
            const stats = (await hudStats($)) as { total?: number } | null
            const capReached = isCapReached((await hudBudget($)) as BudgetLike | null, stats?.total ?? 0)
            if (needsReview(await read($, crew), { enabled: true, stopHookActive: false, capReached, held: heldForStepUp() })) reviewMissed = true
          }
          await update($, crew, onMainTurnEnd)
        } catch {
          // No reminder this time.
        }
      } else {
        const agentId = e.agentId
        try {
          const now = await $.clock.now()
          await update($, crew, c => onAgentTurnEnd(c, agentId, e.usage, now))
          // The list's word first (it names a failure or a stop exactly); then, one run of a helper's
          // loop being one turn, a row the list still shows running ends by the turn's reason.
          await refreshCrew($)
          await changeCrew($, now, c => onAgentRunEnd(c, agentId, e.reason, now))
        } catch {
          // The tick asks for the statuses again.
        }
      }
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const agentId = e.agentId
    if (agentId === undefined) {
      const now = await $.clock.now().catch(() => 0)
      await update($, mood, m => onToolResult(m, e, ran, now)).catch(() => undefined)
    } else {
      await update($, crew, c => onTool(c, agentId)).catch(() => undefined)
    }
    return ran
  })

  // The standing rule, sent after the cache boundary so it never disturbs the shared prompt.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!config.crewReview) return composed
    return { sections: [...composed.sections, { id: 'glitch-pets:crew', text: CREW_RULE, scope: 'session' as const }] }
  })

  // A helper joins the open crew, or starts a fresh one; a fresh crew opens the pane (auto).
  on('agent.spawn', async ($, e, next) => {
    const pre = crewSpawnOf(e, await read($, crew).catch(() => null), e.parentAgentId === undefined && e.workflow === undefined && next.origin.plugin === 'engine')
    const r = await next(pre.e)
    if (r.deny !== undefined || !r.agentId) pre.restore()
    if (r.deny !== undefined || !r.agentId) return r
    // Only the main loop's own helpers: not a helper's sub-spawn, a workflow's agent or another plugin's.
    if (e.parentAgentId !== undefined || e.workflow !== undefined || next.origin.plugin !== 'engine') return r
    const agentId = r.agentId
    try {
      const now = await $.clock.now()
      const costNow = (await $.session.usage().catch(() => null))?.cost?.usd ?? 0
      // Decided inside the update, so two spawns at once cannot both start a crew.
      let fresh = false
      await update($, crew, c => {
        fresh = c.closed
        return onSpawn(c, { agentId, ...(e.name ? { name: e.name } : {}), description: e.description, model: r.model, now, costNow, ...pre.step })
      })
      if (fresh && config.crewPane === 'auto' && !(await $.ui.panes().catch(() => [])).some(x => x.id === PANE)) {
        const size = await sessionSize($)
        await $.ui.open({ id: PANE, title: 'Crew', columns: size.columns, rows: size.rows }).catch(() => undefined)
      }
    } catch {
      // The pane misses this helper.
    }
    return r
  })

  // A helper's model and effort, as each of its requests names them.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const effort = e.effort === undefined ? null : String(e.effort)
      await update($, crew, c => onStep(c, agentId, e.model, effort)).catch(() => undefined)
    }
    const r = yield* next(e)
    const usage = r?.usage
    if (agentId !== undefined && usage) await update($, crew, c => onStepUsage(c, agentId, usage)).catch(() => undefined)
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    try {
      const ui = $.ui.resolve(e)
      const { Box, Button, Text } = ui
      // Read so a touch of the frame clock redraws the pane.
      await read($, paneFrame)
      paneShown = true
      const c = await read($, crew)
      if (c.rows.length === 0) {
        frameDue.delete(e.surface)
        return <Text dimColor>No crew yet. Crew members appear here when Claude splits work.</Text>
      }
      const now = await $.clock.now()
      const pv = await read($, view)
      const p = personaFor(pv.petId)
      const m = await read($, mood)
      // One cost with the HUD pill (sharedCost); read the summary so a new figure redraws the pane.
      await read($, crewSummary)
      const crewCost = await sharedCost($, c, now)
      const cost = shares(c.rows, crewCost)
      const isTerminal = e.surface === 'terminal'
      const o = await read($, crewOpen)
      const theme = pv.crewTheme ?? config.crewTheme
      // When the drawing next changes: a running mini's next beat, the reward's beats.
      const due: number[] = []
      const rows: CrewMember[] = c.rows.map(row => {
        const mini = p && !isTerminal ? crewMini(theme, { persona: p, role: row.role, model: row.model, effort: row.effort, status: row.status, elapsedMs: (row.endedAt ?? now) - row.startedAt }, MINI_PIXEL) : null
        if (row.status === 'running' && mini?.nextChangeMs !== undefined) due.push(now + mini.nextChangeMs)
        return { row, mini, badge: null, cost: cost[row.id] ?? 0, steps: stepsOf(row, c.rows) }
      })
      const themeColumns = (CREW_THEMES[theme] ?? CREW_THEMES[DEFAULT_CREW_THEME])?.size.columns ?? 16
      const v: CrewView = {
        lead: { name: p?.name ?? 'Lead', status: leadStatus(p, c, m.reactions, now), sprite: p ? player.sprite(p, m.mood, now - m.since, LEAD_PIXEL) : null },
        rows,
        header: { cost: crewCost, tokens: c.rows.reduce((t, r) => t + r.tokens, 0), elapsedMs: elapsedOf(c, now) },
        isTerminal,
        now,
        bodyColumns: e.props.bodyColumns,
        open: { running: isOpenIn(o, c, 'running', isTerminal), finished: isOpenIn(o, c, 'finished', isTerminal) },
        miniColumns: p ? Math.ceil((themeColumns * MINI_PIXEL) / DESKTOP_CELL.width) : 0,
        reward: null,
      }
      // The reward moment (desktop): its overlay from the lead down to the receiver's row,
      // if its first draw comes in time and the row is drawn; else the gift is a badge at once.
      const w = p && !isTerminal ? rewardAt(m.reactions, now) : null
      let playing: string | null = null
      if (p && w) {
        // The next moment may start when this one's slot ends.
        due.push(w.startedAt + REWARD_MS)
        // Whether it shows is decided at the moment's first draw, and its geometry kept from then;
        // each redraw draws that time's static frame in the same box (rewardFrame), and the frame
        // clock comes back at the next change (rewardFrameTimes). If the receiver's row moves, the
        // frames would miss it: the gift becomes the badge instead.
        const key = `${e.surface}|${w.rowId}|${w.startedAt}`
        const geo = rewardGeometry(v, w.rowId)
        const sig = geo ? JSON.stringify([geo.receiverIndex, geo.rowTop(geo.receiverIndex), geo.leadBox, geo.mini]) : null
        let shown = rewardShown.get(key)
        if (shown === undefined) {
          shown = geo && sig && now - w.startedAt < FIRST_SHOW_MS ? { show: true, sig, geo } : { show: false }
          if (rewardShown.size > 64) rewardShown.clear()
          rewardShown.set(key, shown)
        } else if (shown.show && shown.sig !== sig) {
          shown = { show: false }
          rewardShown.set(key, shown)
        }
        const receiver = rows.find(x => x.row.id === w.rowId)
        const since = now - w.startedAt
        const frame = shown.show && receiver ? rewardFrame({ persona: p, ...shown.geo, startedAt: w.startedAt, t: since, reducedMotion: false }) : null
        if (shown.show && receiver && frame) {
          playing = w.rowId
          v.reward = { ...frame, alt: `${p.name} lowers a gift to ${crewName(receiver.row)}` }
          const pleased = p.moods.pleased
          const nextAt = rewardFrameTimes(shown.geo.receiverIndex, since, false, { frames: pleased.frames.length, fps: pleased.fps })
          if (nextAt !== null) due.push(w.startedAt + nextAt)
          // From the gift's release to the moment's end the receiver is happy (it hops), in its own look.
          const t = rewardTimeline(shown.geo.receiverIndex)
          if (since >= t.release && since < t.end) {
            receiver.mini = happyMini(p, theme, receiver.row, since - t.release, now)
            due.push(now + nextFrameIn(p.moods.happy, since - t.release), w.startedAt + t.end)
          }
        }
      }
      if (p && !isTerminal) for (const x of rows) if (x.row.id !== playing && (hasGift(m.reactions, x.row.id, now) || x.row.id === w?.rowId)) x.badge = rewardBadge(p, MINI_PIXEL)
      if (due.length) frameDue.set(e.surface, Math.min(...due))
      else frameDue.delete(e.surface)
      // For /glitch crew debug: the view this surface draws under, and when it drew.
      const surface = e.surface
      const viewing = (e.props as { view?: { agentId?: string } }).view?.agentId ?? null
      debug.views[surface] = viewing
      debug.draws[surface] = [...(debug.draws[surface] ?? []).filter(t => now - t <= 10_000), now].slice(-200)
      // A group's open state is kept per crew: a new crew starts from the defaults. A press is never silent:
      // it is recorded for /glitch crew debug, and a failure is said in a toast.
      const toggle = async (group: CrewGroup) => {
        const element = isTerminal ? 'crew-finished' : `crew-acc:${group}`
        try {
          const now2 = await read($, crew)
          const key = openKey(now2, group, isTerminal)
          const prefix = `${now2.startedAt ?? 0}:`
          let opened = false
          await update($, crewOpen, x => {
            opened = !isOpenIn(x, now2, group, isTerminal)
            return { ...Object.fromEntries(Object.entries(x).filter(([kk]) => kk.startsWith(prefix))), [key]: opened }
          })
          recordPress({ at: await $.clock.now(), surface, element, result: opened ? 'opened' : 'folded' })
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err)
          recordPress({ at: now, surface, element, result: `failed: ${why}` })
          $.ui.toast(`Glitch pets: could not fold or open ${group === 'running' ? 'Running' : 'Finished'} (${why})`, { timeoutMs: 6000 })
        }
      }
      // Shows that member's transcript in the main view. The view is asked first, before any other
      // call, while the press is the person's own input; whatever comes of it is said.
      const show = async (agentId: string) => {
        const row = c.rows.find(r => r.id === agentId)
        const who = row ? (row.name ?? row.role) : 'that crew member'
        let answer: { deny?: string } | 'late' | { error: string }
        let timer: { cancel: () => void } | null = null
        try {
          const asked = $.ui.view({ agentId })
          answer = await new Promise<{ deny?: string } | 'late'>((resolve, reject) => {
            timer = $.clock.after(VIEW_WAIT_MS, () => resolve('late'))
            asked.then(resolve, reject)
          })
        } catch (err) {
          answer = { error: err instanceof Error ? err.message : String(err) }
        } finally {
          ;(timer as { cancel: () => void } | null)?.cancel()
        }
        let text: string | null
        let result: string
        if (answer === 'late') {
          result = `no answer within ${VIEW_WAIT_MS / 1000} s`
          text = `the app did not switch to ${who}'s transcript (no answer). Open it from the tasks list (background tasks).`
        } else if ('error' in answer) {
          result = `failed: ${answer.error}`
          text = `could not show ${who}'s transcript (${answer.error}). Open it from the tasks list (background tasks).`
        } else if (answer.deny) {
          result = `denied: ${answer.deny}`
          // Asked after the answer, so the view itself was the press's first call.
          const listed = await $.agent.list().then(l => l.some(a => a.id === agentId)).catch(() => true)
          text = listed
            ? `could not show ${who}'s transcript: ${answer.deny}. Open it from the tasks list (background tasks).`
            : `${who} has finished and left the tasks list, so its transcript cannot be opened (${answer.deny}). Its report is in the conversation.`
        } else {
          result = 'shown'
          // The terminal's view visibly switches; elsewhere say so, so a press is never silent.
          text = isTerminal ? null : `showing ${who}'s transcript. Back: pick the main conversation in the tasks list.`
        }
        recordPress({ at: await $.clock.now().catch(() => now), surface, element: `crew-open:${agentId}`, result })
        if (text) $.ui.toast(`Glitch pets: ${text}`, { timeoutMs: 8000 })
      }
      return crewTree(v, { Box, Text, Button, Svg: 'Svg' in ui ? ui.Svg : null } as never, { toggle, view: show })
    } catch {
      return next(e)
    }
  })

  // The pane closed (the person's close mark, our own close, an unload): the frame clock stops.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneClosed()
    return next(e)
  })

  // A press on glitch-hud's crew pill (it draws the pill from crewSummary): the pane
  // opens or closes here, behind the person's press.
  on('ui.press', { plugin: 'glitch-hud', element: HUD_PILL }, async ($, e, next) => {
    const r = await next(e)
    try {
      const said = await toggleCrew($, e.surface === 'terminal' ? PANE_SIZE.terminal : PANE_SIZE.rich)
      recordPress({ at: await $.clock.now(), surface: e.surface, element: `glitch-hud:${HUD_PILL}`, result: said })
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      recordPress({ at: 0, surface: e.surface, element: `glitch-hud:${HUD_PILL}`, result: `failed: ${why}` })
      $.ui.toast(`Glitch pets: could not open or close the crew pane (${why}). Try /glitch crew.`, { timeoutMs: 8000 })
    }
    return r
  })

  on('command.run', { command: 'glitch-pets' }, async ($, e) => {
    const themeArg = crewThemeArgOf(e.args) // crew themes (#41)
    if (themeArg !== null) return { text: await answerCrewTheme($, themeArg) }
    if (isCrewDebug(e.args)) return { text: await answerCrewDebug($) }
    return { text: firstWord(e.args) === 'crew' ? await toggleCrew($, await commandSize($, e)) : await answerPets($, petArgsOf('glitch-pets', e.args)) }
  })
  on('command.run', { command: 'glitch' }, async ($, e, next) => {
    const word = firstWord(e.args)
    if (!ROUTED_PETS.includes(word)) return next(e)
    const themeArg = crewThemeArgOf(e.args) // crew themes (#41)
    if (themeArg !== null) return { text: await answerCrewTheme($, themeArg) }
    if (isCrewDebug(e.args)) return { text: await answerCrewDebug($) }
    return { text: word === 'crew' ? await toggleCrew($, await commandSize($, e)) : await answerPets($, petArgsOf('glitch', e.args)) }
  })

  // ── Crew tiers (#43): hooks ──
  crewTiers = config.crewTiers
  ladder = ladderOf(crewTiers)
  stepUpsQueued = []
  stepUpsSent = []
  stepUpsInFlight = []
  stepUpsStale = []
  steppedFrom = new Set()

  // A crew type's effort wins: an Agent call's own `effort` for a crew type is set to
  // the type's (session.start registers the types, agent.spawn pins their model, prompt.submit
  // carries the step-up notes: one hook per event, so those are lines in the hooks above).
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const a = e as typeof e & { subagent_type?: string; effort?: string; name?: string }
    // The reviewer (its type, or a reviewer-<n> name agent.spawn moves onto it) runs at the reviewer's effort.
    const reviewer = a.effort !== undefined && (isReviewerName(a.name) || (!!a.subagent_type && isReviewerType(a.subagent_type)))
    const asked = a.effort !== undefined && a.subagent_type && !reviewer ? rungOfType(ladder, a.subagent_type) : null
    const rung = reviewer ? crewTiers.reviewer : asked ? (findRetry(a.subagent_type as string, a.name)?.target ?? asked) : null
    return next(!rung || a.effort === rung.effort ? e : ({ ...a, effort: rung.effort } as typeof e))
  })
  // ── end crew tiers (hooks) ──
}
