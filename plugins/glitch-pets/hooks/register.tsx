import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MoodState, PetsView } from '../types'
import { personaProblems } from './behavior/contract'
import { INITIAL_CREW, helpersRunning, onAgentTurnEnd, onMainTurn, onSpawn, onStatuses, onStep, onTool, progressOf, reviewerRunning, shares } from './behavior/crew'
import type { CrewState } from './behavior/crew'
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
import type { CrewView } from './pane'
import { PERSONAS } from './personas/index'
import { onPoke, onToolResult, onTurnEnd, onTurnStartStreak, tickOnce } from './tick'

const INITIAL_MOOD: MoodState = { mood: 'idle', since: 0, turnSince: null, lastPromptAt: 0, oopsUntil: 0, happyUntil: 0, cheerUntil: 0, cryUntil: 0, failStreak: 0, pokedUntil: 0, pokeSeen: 0 }

export const sprite = atom({ plugin: 'glitch-pets', key: 'sprite' } as const, null as Sprite | null)
export const mood = atom({ plugin: 'glitch-pets', key: 'mood' } as const, INITIAL_MOOD)
export const view = atom({ plugin: 'glitch-pets', key: 'view' } as const, { petId: 'bud' } as PetsView)
export const crew = atom({ plugin: 'glitch-pets', key: 'crew' } as const, INITIAL_CREW as CrewState)

const PANE = 'glitch-crew'
/** CSS px per pixel in the crew pane: the lead draws 24 × 20, a mini with its hat 24 × 24. */
const PANE_PIXEL = 1.5
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
let mainTurn = 0
let ticks = 0
/** The reviewer finished while the main turn ran: crewDone waits for the turn's end (no remark mid-turn). */
let crewDonePending = false
const minis = new Map<string, Sprite>()
/** The main turn that just ended ran 2+ helpers and no reviewer: the next prompt.compose carries the reminder. */
let reviewMissed = false

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
async function refreshCrew($: EngineInterface) {
  const list = await $.agent.list().catch(() => null)
  if (!list) return
  const now = await $.clock.now()
  const before = await read($, crew)
  const after = onStatuses(before, list, now)
  if (after.rows.every((r, i) => r.status === before.rows[i]?.status)) return
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
  await $.ui.open({ id: PANE, title: 'Crew' })
  return 'Crew pane opened.'
}

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
  ticks += 1
  if (ticks % STATUS_TICKS === 0) await refreshCrew($)
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
  mainTurn = 0
  ticks = 0
  crewDonePending = false
  reviewMissed = false

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
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      try {
        mainTurn += 1
        await update($, crew, c => onMainTurn(c, mainTurn))
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
        // Checked here, while the crew is still this main turn's; the next turn's
        // turn.start moves mainTurn on, and the reminder goes out with its prompt.
        try {
          if (config.crewReview) {
            await refreshCrew($)
            const stats = (await hudStats($)) as { total?: number } | null
            const capReached = isCapReached((await hudBudget($)) as BudgetLike | null, stats?.total ?? 0)
            if (needsReview(await read($, crew), { enabled: true, stopHookActive: false, capReached })) reviewMissed = true
          }
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

  // The standing rule, sent after the cache boundary so it never disturbs the shared prompt;
  // and once, after a main turn that left 2+ helpers' work unreviewed, the reminder.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!config.crewReview) return composed
    try {
      const sections = [...composed.sections, { id: 'glitch-pets:crew', text: CREW_RULE, scope: 'session' as const }]
      if (reviewMissed) {
        reviewMissed = false
        await update($, crew, c => ({ ...c, gateFired: true }))
        sections.push({ id: 'glitch-pets:crew-missed', text: GATE_TEXT, scope: 'session' as const })
      }
      return { sections }
    } catch {
      return composed
    }
  })

  // A helper joins the crew of the main turn running now; the first of a crew opens the pane (auto).
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || !r.agentId) return r
    const agentId = r.agentId
    try {
      const now = await $.clock.now()
      const costNow = (await $.session.usage().catch(() => null))?.cost?.usd ?? 0
      const fresh = (await read($, crew)).turnNo !== mainTurn
      await update($, crew, c => onSpawn(c, { agentId, ...(e.name ? { name: e.name } : {}), description: e.description, model: r.model, now, turnNo: mainTurn, costNow }))
      if (fresh && config.crewPane === 'auto' && !(await $.ui.panes().catch(() => [])).some(x => x.id === PANE)) {
        await $.ui.open({ id: PANE, title: 'Crew' }).catch(() => undefined)
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
    return yield* next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    try {
      const ui = $.ui.resolve(e)
      const { Box, Text } = ui
      const c = await read($, crew)
      if (c.rows.length === 0) return <Text dimColor>No crew yet. Helpers appear here when Claude splits work.</Text>
      const now = await $.clock.now()
      const p = personaFor((await read($, view)).petId)
      const m = await read($, mood)
      const usdNow = (await $.session.usage().catch(() => null))?.cost?.usd ?? c.costAtStart
      const crewCost = Math.max(0, usdNow - c.costAtStart)
      const cost = shares(c.rows, crewCost)
      const v: CrewView = {
        lead: { name: p?.name ?? 'Lead', mood: m.mood, sprite: p ? player.sprite(p, m.mood, now - m.since, PANE_PIXEL) : null },
        rows: c.rows.map(row => ({ row, mini: p ? miniOf(p, row.role, row.tier) : null, cost: cost[row.id] ?? 0, progress: progressOf(row, c.rows) })),
        header: { cost: crewCost, tokens: c.rows.reduce((t, r) => t + r.tokens, 0), elapsedMs: now - (c.startedAt ?? now) },
        isTerminal: e.surface === 'terminal',
        now,
      }
      return crewTree(v, { Box, Text, Svg: 'Svg' in ui ? ui.Svg : null } as never)
    } catch {
      return next(e)
    }
  })

  on('command.run', { command: 'glitch-pets' }, async ($, e) =>
    ({ text: firstWord(e.args) === 'crew' ? await toggleCrew($) : await answerPets($, petArgsOf('glitch-pets', e.args)) }))
  on('command.run', { command: 'glitch' }, async ($, e, next) => {
    const word = firstWord(e.args)
    if (!ROUTED_PETS.includes(word)) return next(e)
    return { text: word === 'crew' ? await toggleCrew($) : await answerPets($, petArgsOf('glitch', e.args)) }
  })
}
