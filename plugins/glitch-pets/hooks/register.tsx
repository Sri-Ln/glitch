import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MoodState, PetsView } from '../types'
import { personaProblems } from './behavior/contract'
import { INITIAL_CREW, crewSummaryOf, elapsedOf, helpersRunning, onAgentTurnEnd, onMainTurnEnd, onMainTurnStart, onSpawn, onStatuses, onStep, onStepUsage, onTool, reviewerRunning, shares, stepsOf } from './behavior/crew'
import type { CrewState, CrewSummary } from './behavior/crew'
import { CREW_RULE, GATE_TEXT, needsReview } from './behavior/gate'
import { withHat } from './behavior/hats'
import { isCapReached } from './behavior/moods'
import type { BudgetLike } from './behavior/moods'
import { createPlayer, frameSvg } from './behavior/player'
import { STORE_STREAK, advance, asStreak } from './behavior/streak'
import type { Frame, MoodId, Persona, PetId, Role, Sprite, Tier, VoiceMoment } from './behavior/types'
import { PET_IDS } from './behavior/types'
import { INITIAL_VOICE, pickLine } from './behavior/voice'
import type { VoiceState } from './behavior/voice'
import { PETS_USAGE, ROUTED_PETS, STORE_PET, parsePetArg, petArgsOf, petList } from './commands'
import { parsePetsConfig } from './config'
import type { PetsConfig } from './config'
import { crewTree } from './pane'
import type { CrewGroup, CrewView } from './pane'
import { PERSONAS } from './personas/index'
import { onPoke, onToolResult, onTurnEnd, onTurnStartStreak, tickOnce } from './tick'

const INITIAL_MOOD: MoodState = { mood: 'idle', since: 0, turnSince: null, lastPromptAt: 0, oopsUntil: 0, happyUntil: 0, cheerUntil: 0, cryUntil: 0, failStreak: 0, pokedUntil: 0, pokeSeen: 0 }

export const sprite = atom({ plugin: 'glitch-pets', key: 'sprite' } as const, null as Sprite | null)
export const mood = atom({ plugin: 'glitch-pets', key: 'mood' } as const, INITIAL_MOOD)
export const view = atom({ plugin: 'glitch-pets', key: 'view' } as const, { petId: 'bud' } as PetsView)
export const crew = atom({ plugin: 'glitch-pets', key: 'crew' } as const, INITIAL_CREW as CrewState)
/** Which crew pane groups are open, keyed `<crew start>:<group>` (the terminal's fold under its own key). */
export const crewOpen = atom({ plugin: 'glitch-pets', key: 'crewOpen' } as const, {} as Record<string, boolean>)
/** What glitch-hud's crew pill shows; null while no crew is open or recent. */
export const crewSummary = atom({ plugin: 'glitch-pets', key: 'crewSummary' } as const, null as CrewSummary | null)

const PANE = 'glitch-crew'
/** CSS px per pixel in the crew pane: a mini with its hat draws 24 × 24. */
const PANE_PIXEL = 1.5
/** The lead draws at 2×: 32 × 26. */
const LEAD_PIXEL = 2
/** The dock the pane asks for (about 300 px on the desktop), and its inline height. */
const PANE_COLUMNS = 40
const PANE_ROWS = 10
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
const minis = new Map<string, Sprite>()
/** The crew's 2+ helpers finished with no reviewer: the next prompt carries the reminder. */
let reviewMissed = false
/** A prompt is carrying the reminder now: claimed before awaiting, so two prompts at once cannot both. */
let reminderInFlight = false

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

// A helper's static mini: the pet's first idle frame (never animated) under its role's hat.
function miniOf(p: Persona, role: Role, tier: Tier): Sprite {
  const key = `${p.id}|${role}|${tier}`
  let s = minis.get(key)
  if (!s) {
    const hatted = withHat(p.moods.idle.frames[0] as Frame, p.hatAnchor, role, tier)
    s = { source: frameSvg({ ...p.palette, ...hatted.palette }, hatted.frame, PANE_PIXEL), alt: `${p.name}, ${role}, ${tier}`, width: Math.round(16 * PANE_PIXEL), height: Math.round(hatted.frame.length * PANE_PIXEL) }
    minis.set(key, s)
  }
  return s
}

// Helpers' statuses from the engine's list; the crewDone remark once the reviewer finishes and nothing else runs.
// While a row runs, each refresh touches the crew so the pane's clocks move.
async function refreshCrew($: EngineInterface) {
  // Nothing runs: no status can change, so no call.
  if (!(await read($, crew)).rows.some(r => r.status === 'running')) return
  const list = await $.agent.list().catch(() => null)
  if (!list) return
  const now = await $.clock.now()
  const before = await read($, crew)
  const after = onStatuses(before, list, now)
  if (after.rows.every((r, i) => r.status === before.rows[i]?.status)) {
    if (before.rows.some(r => r.status === 'running')) await update($, crew, c => ({ ...c, tickAt: now }))
    return
  }
  await update($, crew, c => onStatuses(c, list, now))
  const c = await read($, crew)
  const reviewerFinished = before.rows.some(r => r.role === 'reviewer' && r.status === 'running' && c.rows.find(x => x.id === r.id)?.status !== 'running')
  if (!reviewerFinished || helpersRunning(c) > 0 || reviewerRunning(c)) return
  if ((await read($, mood)).turnSince !== null) crewDonePending = true
  else await say($, 'crewDone')
}

async function toggleCrew($: EngineInterface): Promise<string> {
  const isOpen = (await $.ui.panes().catch(() => [])).some(x => x.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return 'Crew pane closed.'
  }
  await $.ui.open({ id: PANE, title: 'Crew', columns: PANE_COLUMNS, rows: PANE_ROWS })
  return 'Crew pane opened.'
}

// The figures glitch-hud's crew pill shows, written only when they change.
async function publishSummary($: EngineInterface, total: number) {
  const now = await $.clock.now()
  const c = await read($, crew)
  const next = crewSummaryOf(c, total - c.costAtStart, now)
  const before = await read($, crewSummary)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, crewSummary, () => next)
}

/** The lead's line in the pane. A placeholder until the lead's own wording lands. */
function leadStatus(c: CrewState): string {
  const at = c.rows.filter(r => r.status === 'running').length
  const failed = c.rows.filter(r => r.status === 'failed')
  if (at > 0) return `keeping an eye on the crew (${at} at work)`
  if (failed.length > 0) return `${failed.length} of the crew failed`
  return 'job done, the whole crew is back'
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
    const total = ((await hudStats($)) as { total?: number } | null)?.total
    await publishSummary($, typeof total === 'number' ? total : (await read($, crew)).costAtStart)
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
    helpersRunning: helpersRunning(team), reviewerRunning: reviewerRunning(team), tiredMs: config.tiredMs, sleepyMs: config.sleepyMs,
  })
  if (r.moodChanged) {
    await update($, mood, x => ({ ...x, mood: r.mood, since: r.since }))
    const moment = SPEAKS_ON_ENTRY[r.mood]
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

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'glitch-pets', description: PETS_USAGE })
    } catch {
      $.ui.toast('Glitch pets: could not register /glitch-pets', { timeoutMs: 8000 })
    }
    if (problems.length) $.ui.toast(`Glitch pets: ${problems.join('; ')}`, { timeoutMs: 8000 })
    if (broken.length) $.ui.toast(`Glitch pets: left out (art problems): ${broken.join(', ')}`, { timeoutMs: 8000 })
    const saved = await $.store.get(STORE_PET).catch(() => undefined)
    const petId = saved === 'off' || (PET_IDS as readonly unknown[]).includes(saved) ? (saved as PetId | 'off') : config.pet
    const now = await $.clock.now()
    await update($, view, v => ({ ...v, petId }))
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

  on('prompt.submit', async ($, e, next) => {
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
    if (!now || !needsReview(now, { enabled: true, stopHookActive: false, capReached: false })) {
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
        await update($, crew, onMainTurnStart)
        const now = await $.clock.now()
        await update($, mood, m => ({ ...m, turnSince: now }))
        const r = advance(asStreak(await $.store.get(STORE_STREAK).catch(() => null)), now)
        if (r.changed) await $.store.set(STORE_STREAK, r.streak).catch(() => undefined)
        await update($, mood, m => onTurnStartStreak(m, r, now))
      } catch {
        // The pet just misses this one.
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
          // An interrupted turn is the person's call: no reminder for this crew.
          if (e.isAborted) await update($, crew, c => ({ ...c, gateFired: true }))
          else if (config.crewReview) {
            const stats = (await hudStats($)) as { total?: number } | null
            const capReached = isCapReached((await hudBudget($)) as BudgetLike | null, stats?.total ?? 0)
            if (needsReview(await read($, crew), { enabled: true, stopHookActive: false, capReached })) reviewMissed = true
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
          await refreshCrew($)
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
    const r = await next(e)
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
        return onSpawn(c, { agentId, ...(e.name ? { name: e.name } : {}), description: e.description, model: r.model, now, costNow })
      })
      if (fresh && config.crewPane === 'auto' && !(await $.ui.panes().catch(() => [])).some(x => x.id === PANE)) {
        await $.ui.open({ id: PANE, title: 'Crew', columns: PANE_COLUMNS, rows: PANE_ROWS }).catch(() => undefined)
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
      const c = await read($, crew)
      if (c.rows.length === 0) return <Text dimColor>No crew yet. Crew members appear here when Claude splits work.</Text>
      const now = await $.clock.now()
      const p = personaFor((await read($, view)).petId)
      const m = await read($, mood)
      const usdNow = (await $.session.usage().catch(() => null))?.cost?.usd ?? c.costAtStart
      const crewCost = Math.max(0, usdNow - c.costAtStart)
      const cost = shares(c.rows, crewCost)
      const isTerminal = e.surface === 'terminal'
      const o = await read($, crewOpen)
      const v: CrewView = {
        lead: { name: p?.name ?? 'Lead', status: leadStatus(c), sprite: p ? player.sprite(p, m.mood, now - m.since, LEAD_PIXEL) : null },
        rows: c.rows.map(row => ({ row, mini: p ? miniOf(p, row.role, row.tier) : null, cost: cost[row.id] ?? 0, steps: stepsOf(row, c.rows) })),
        header: { cost: crewCost, tokens: c.rows.reduce((t, r) => t + r.tokens, 0), elapsedMs: elapsedOf(c, now) },
        isTerminal,
        now,
        bodyColumns: e.props.bodyColumns,
        open: { running: isOpenIn(o, c, 'running', isTerminal), finished: isOpenIn(o, c, 'finished', isTerminal) },
      }
      // A group's open state is kept per crew: a new crew starts from the defaults.
      const toggle = async (group: CrewGroup) => {
        const now2 = await read($, crew)
        const key = openKey(now2, group, isTerminal)
        const prefix = `${now2.startedAt ?? 0}:`
        await update($, crewOpen, x => ({ ...Object.fromEntries(Object.entries(x).filter(([kk]) => kk.startsWith(prefix))), [key]: !isOpenIn(x, now2, group, isTerminal) }))
      }
      // Shows that member's transcript in the main view (only from the person's press).
      const show = async (agentId: string) => {
        const r = await $.ui.view({ agentId }).catch(() => null)
        if (r?.deny) $.ui.toast(`Glitch pets: ${r.deny}`, { timeoutMs: 6000 })
      }
      return crewTree(v, { Box, Text, Button, Svg: 'Svg' in ui ? ui.Svg : null } as never, { toggle, view: show })
    } catch {
      return next(e)
    }
  })

  // A press on glitch-hud's crew pill (it draws the pill from crewSummary): the pane
  // opens or closes here, behind the person's press.
  on('ui.press', async ($, e, next) => {
    const r = await next(e)
    if (e.plugin === 'glitch-hud' && e.element === HUD_PILL) await toggleCrew($).catch(() => undefined)
    return r
  })

  on('command.run', { command: 'glitch-pets' }, async ($, e) =>
    ({ text: firstWord(e.args) === 'crew' ? await toggleCrew($) : await answerPets($, petArgsOf('glitch-pets', e.args)) }))
  on('command.run', { command: 'glitch' }, async ($, e, next) => {
    const word = firstWord(e.args)
    if (!ROUTED_PETS.includes(word)) return next(e)
    return { text: word === 'crew' ? await toggleCrew($) : await answerPets($, petArgsOf('glitch', e.args)) }
  })
}
