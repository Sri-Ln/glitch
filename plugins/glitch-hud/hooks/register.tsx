import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, Timer } from 'claude-code'

import { INITIAL_BUDGET, INITIAL_CACHE, INITIAL_GIT, INITIAL_POKE, INITIAL_STATS, INITIAL_VIEW, initialBudget } from './atoms'
import { blockReason, dayKey, isExpired, ledgerKey, levelOf, parseLedgerKey, rebase, spendToday, withConfigCaps } from './budget'
import { dueMark, endDemo, isDemoOver, shouldAutoWarm, startDemo, warnMarks } from './cache'
import { BUDGET_USAGE, DEMO_USAGE, ROUTED, USAGE, WARM_PROMPT, budgetAlerts, budgetSummary, parseBudgetArg, splitArgs, warmMessage } from './commands'
import { ALL_COST, ALL_PARTS, SPEED_MODES, parseConfig, parseCostShows, parseParts, parseSpeed } from './config'
import type { HudConfig } from './config'
import { readGit } from './git'
import type { RunFn } from './git'
import { notify, projectName } from './notify'
import type { NotifyIO } from './notify'
import { richPart, richWidth } from './desktop'
import { CREW_PILL_PAD, crewPillText, isCrewSummary } from './crew'
import type { CrewSummary } from './crew'
import { PET_CELLS, isSprite } from './pet'
import type { PetSprite } from './pet'
import { cellWidth, fitParts, segments } from './parts'
import type { PartData } from './parts'
import { toTheme } from './theme'

export const stats = atom({ plugin: 'glitch-hud', key: 'stats' } as const, INITIAL_STATS)
export const cache = atom({ plugin: 'glitch-hud', key: 'cache' } as const, INITIAL_CACHE)
export const budget = atom({ plugin: 'glitch-hud', key: 'budget' } as const, INITIAL_BUDGET)
export const git = atom({ plugin: 'glitch-hud', key: 'git' } as const, INITIAL_GIT)
export const view = atom({ plugin: 'glitch-hud', key: 'view' } as const, INITIAL_VIEW)
export const poke = atom({ plugin: 'glitch-hud', key: 'poke' } as const, INITIAL_POKE)

// Responses shorter than this are mostly tool-call stubs; their timing is noise.
const MIN_TOKENS = 20
const MIN_SECONDS = 0.5
// Git and today's ledger are read again on this timer while idle.
const GIT_EVERY_MS = 30_000
const ROW_GAP = 2
// Cells before the desktop's keep-warm glyph; after it the row's gap is enough.
const WARM_PAD = 1
// `/glitch hud speed on|off` outlives the session; `auto` clears it.
const STORE_SPEED = 'speed'
// The press target over the pet, in cells: inside the 24 px sprite.
const POKE_CELLS = 3

const COST_UNREADABLE = "Glitch: can't read the session cost right now; budget caps can't be checked until it's back."
const LEDGER_FAILED = "Glitch: can't read or save the daily spend ledger right now; today's total may be incomplete."

// A failed read marks cost and context stale (the band shows —, not a frozen
// number) and says so once per conversation (session id); the next good read clears it.
export async function refreshUsage($: EngineInterface): Promise<void> {
  const usage = await $.session.usage().catch(() => null)
  if (!usage) {
    const sessionId = await $.session.id().catch(() => 'session')
    const warned = (await read($, stats)).staleWarnedFor === sessionId
    await update($, stats, s => ({ ...s, isStale: true, staleWarnedFor: sessionId }))
    if (!warned) {
      try {
        $.ui.toast(COST_UNREADABLE, { timeoutMs: 10_000 })
      } catch {
        // Nothing else to tell.
      }
    }
    return
  }
  const total = usage.cost?.usd ?? 0
  await update($, stats, s => ({ ...s, isStale: false, total, turnCost: s.turn === 0 ? null : total - s.costAtStart, context: usage.context.percent ?? s.context }))
}

// Engine calls handed to the pure helpers: `$` stays in this file.
const gitRun = ($: EngineInterface): RunFn => (argv, init) => $.process.run(argv, init)

const engineIO = ($: EngineInterface): NotifyIO => ({
  os: () => $.env.get('OS'),
  run: (argv, init) => $.process.run(argv, init),
  notifyClaude: (text, options) => $.ui.notify(text, options),
  toast: (text, options) => $.ui.toast(text, options),
})

// The pet glitch-pets publishes, if it is installed and on; anything malformed is no pet.
const loadPet = async ($: EngineInterface): Promise<PetSprite | null> => {
  try {
    const v = (await $.state.get({ plugin: 'glitch-pets', key: 'sprite' } as never)) as { value?: unknown }
    return isSprite(v?.value) ? v.value : null
  } catch {
    return null
  }
}

// The crew glitch-pets publishes while one is open or recent; anything malformed is no pill.
const loadCrew = async ($: EngineInterface): Promise<CrewSummary | null> => {
  try {
    const v = (await $.state.get({ plugin: 'glitch-pets', key: 'crewSummary' } as never)) as { value?: unknown }
    return isCrewSummary(v?.value) ? v.value : null
  } catch {
    return null
  }
}

const loadTheme = async ($: EngineInterface) => {
  try {
    return toTheme((await $.state.get({ plugin: 'glitch-core', key: 'theme' } as const)).value)
  } catch {
    return toTheme(null)
  }
}

async function refreshGit($: EngineInterface): Promise<void> {
  const info = await readGit(gitRun($)).catch(() => null)
  await update($, git, () => info)
}

export async function warnCache($: EngineInterface, config: HudConfig, minutes: number, isDemo: boolean): Promise<void> {
  const title = `${projectName(await $.session.cwd().catch(() => ''))} — Glitch`
  await notify(engineIO($), config.notify, title, `Prompt cache expires in ${minutes} min${isDemo ? ' (demo)' : ''}`)
}

export async function keepWarm($: EngineInterface, ttlMs: number): Promise<string> {
  const c = await read($, cache)
  if (c.isBusy) return 'Claude is working, so the cache is warm already.'
  if (c.isWarming) return 'A keep-warm request is already running.'
  await update($, cache, x => ({ ...x, isWarming: true }))
  try {
    const reply = await $.model.fork({ prompt: WARM_PROMPT }).catch(() => ({ isAnswered: false as const, reason: 'request refused' }))
    if (reply.isAnswered) {
      const now = await $.clock.now()
      await update($, cache, x => ({ ...x, expiresAt: now + ttlMs, secondsLeft: ttlMs / 1000, warnedMark: 0, warmedSincePrompt: true, real: null }))
    }
    return warmMessage(reply, ttlMs / 1000)
  } finally {
    // The control goes back to ↻ however the request ended.
    await update($, cache, x => ({ ...x, isWarming: false })).catch(() => undefined)
  }
}

const storedNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Records this session's spend today under its own ledger key, prunes old days,
// sums today over every session's key, and fires the budget warnings.
export async function recordSpend($: EngineInterface, config: HudConfig): Promise<void> {
  const total = (await read($, stats)).total
  const now = await $.clock.now()
  const sessionId = await $.session.id().catch(() => 'session')
  const based = rebase(await read($, budget), sessionId, total)
  const today = spendToday(based, total, now)
  const key = ledgerKey(today.day, sessionId)
  // Any ledger call that fails leaves today's total short: said once per conversation
  // (session id), and only when a daily cap is in force.
  let isShort = false
  const missed = () => {
    isShort = true
    return undefined
  }
  // A key first written by this run may hold an earlier run's spend (a resume): add to it.
  const prior = key === based.ledgerKey ? based.priorForKey : storedNumber(await $.store.get(key).catch(missed))
  const mine = prior + today.spent
  await $.store.set(key, mine).catch(missed)

  let daily = mine
  for (const k of await $.store.keys().catch(() => (missed(), [] as string[]))) {
    const entry = parseLedgerKey(k)
    if (!entry || k === key) continue
    if (isExpired(entry.day, now)) await $.store.delete(k).catch(missed)
    else if (entry.day === today.day) daily += storedNumber(await $.store.get(k).catch(missed))
  }
  const was = await read($, budget)
  const tells = isShort && was.dailyCap > 0 && !was.isOff && was.ledgerWarnedFor !== sessionId
  await update($, budget, x => ({
    ...x, sessionId, day: today.day, dayBase: today.dayBase, lastTotal: total, ledgerKey: key, priorForKey: prior, dailySpent: daily,
    ...(tells ? { ledgerWarnedFor: sessionId } : {}),
  }))
  if (tells) {
    try {
      $.ui.toast(LEDGER_FAILED, { timeoutMs: 10_000 })
    } catch {
      // The caps below are still checked.
    }
  }

  const b = await read($, budget)
  if (b.isOff) return
  const alerts = budgetAlerts(b.notified, { session: total, daily, sessionCap: b.sessionCap, dailyCap: b.dailyCap })
  await update($, budget, x => ({ ...x, notified: alerts.notified }))
  for (const t of alerts.toasts) $.ui.toast(t.text, { timeoutMs: t.timeoutMs })
  // The session toast above already says it; only an opted-in OS notification adds to it.
  if (alerts.notice && config.notify === 'windows') {
    const title = `${projectName(await $.session.cwd().catch(() => ''))} — Glitch`
    await notify(engineIO($), config.notify, title, alerts.notice)
  }
}

// Sums today's ledger again without writing it, so a session that sits idle
// still sees what the others spent since its own last answer. Its own entry
// counts as stored: `todaySpent` adds what it spent since.
async function sumToday($: EngineInterface): Promise<void> {
  const b = await read($, budget)
  if (b.day !== dayKey(await $.clock.now())) return
  let daily = 0
  for (const k of await $.store.keys()) {
    if (parseLedgerKey(k)?.day === b.day) daily += storedNumber(await $.store.get(k))
  }
  await update($, budget, x => ({ ...x, dailySpent: daily }))
}

async function budgetCommand($: EngineInterface, arg: string | undefined): Promise<string> {
  const b = await read($, budget)
  const total = (await read($, stats)).total
  if (arg === undefined) return budgetSummary(b, total)
  const parsed = parseBudgetArg(arg)
  if (!parsed) return BUDGET_USAGE
  if (parsed.kind === 'off' || parsed.kind === 'on') {
    await update($, budget, x => ({ ...x, isOff: parsed.kind === 'off' }))
    return parsed.kind === 'off' ? 'Budget caps off for this session.' : 'Budget caps on.'
  }
  const cap = parsed.kind === 'add' ? b.sessionCap + parsed.n : parsed.n
  await update($, budget, x => ({ ...x, sessionCap: cap, sessionCapOverridden: true, notified: { ...x.notified, session: levelOf(total, cap) } }))
  return `Session cap: $${cap.toFixed(2)}.`
}

async function demoCommand($: EngineInterface, what: string | undefined, value: string | undefined): Promise<string> {
  const n = Number(value)
  if (what === 'cache' && Number.isFinite(n) && n > 0) {
    const seconds = Math.round(n * 60)
    const now = await $.clock.now()
    await update($, cache, c => startDemo(c, now, seconds))
    await update($, view, v => ({ ...v, isHidden: false }))
    return `Cache demo: ${value} min left; the real countdown comes back when it ends or at the next answer.`
  }
  if (what === 'budget' && Number.isFinite(n) && n >= 0) {
    await update($, budget, b => ({ ...b, demoPercent: n }))
    return `Budget demo: ${value}% until the next answer.`
  }
  return DEMO_USAGE
}

// One answer for `/glitch-hud <args>` and the routed `/glitch <args>`.
async function answerHud($: EngineInterface, config: HudConfig, args: string): Promise<string> {
  const [sub = '', a, b, ...more] = splitArgs(args)
  if (sub === 'hud') {
    if (a === 'parts') {
      // `cost, cache` arrives split at the space: the list is the rest of the line.
      const parts = b ? parseParts([b, ...more].join(' ')) : null
      if (!parts) return `Unknown part. Parts: ${ALL_PARTS.join(', ')}.`
      await update($, view, v => ({ ...v, parts, isHidden: false }))
      return `HUD parts: ${parts.join(', ')}.`
    }
    if (a === 'speed') {
      const speed = parseSpeed(b)
      if (!speed) return `Usage: /glitch hud speed ${SPEED_MODES.join(' | ')}`
      if (speed === 'auto') await $.store.delete(STORE_SPEED).catch(() => undefined)
      else await $.store.set(STORE_SPEED, speed).catch(() => undefined)
      await update($, view, v => ({ ...v, speed, isHidden: false }))
      return speed === 'auto' ? 'tok/s: auto (terminal only, unless Parts was chosen).' : `tok/s: ${speed}.`
    }
    if (a === 'cost') {
      const cost = b ? parseCostShows(b) : null
      if (!cost) return `Unknown cost figure. Figures: ${ALL_COST.join(', ')}.`
      await update($, view, v => ({ ...v, cost, isHidden: false }))
      return `HUD cost: ${cost.join(', ')}.`
    }
    const hidden = !(await read($, view)).isHidden
    await update($, view, v => ({ ...v, isHidden: hidden }))
    return hidden ? 'Glitch HUD hidden.' : 'Glitch HUD shown.'
  }
  if (sub === 'budget') return budgetCommand($, a)
  if (sub === 'warm') return keepWarm($, config.cacheTtlMs)
  if (sub === 'demo') return demoCommand($, a, b)
  return USAGE
}

// Under auto, tok/s is the terminal's: on the desktop it shows only when Parts was chosen.
export const showsSpeed = (mode: 'auto' | 'on' | 'off', rich: boolean, chosen: boolean): boolean =>
  mode === 'on' || (mode === 'auto' && (!rich || chosen))

// The last warning mark may keep the cache warm by itself.
async function autoWarm($: EngineInterface, config: HudConfig, mark: number, marks: number[]): Promise<void> {
  if (!config.autoWarm) return
  const c = await read($, cache)
  const ok = shouldAutoWarm({ mark, marks, now: await $.clock.now(), lastPromptAt: c.lastPromptAt, maxIdleMin: config.autoWarmMaxIdle, warmedSincePrompt: c.warmedSincePrompt })
  if (ok) $.ui.toast(`Glitch: ${await keepWarm($, config.cacheTtlMs)}`, { timeoutMs: 8000 })
}

export const register: Register = (on, options) => {
  const { config, problems } = parseConfig(options as Record<string, unknown>)
  // session.start fires again in the same load (compact, resume, fork): the
  // timers of the earlier start are stopped before new ones begin.
  let timers: Timer[] = []

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'glitch-hud', description: 'Glitch HUD: hud, budget, warm, demo (also as /glitch <sub>)' })
    } catch {
      $.ui.toast('Glitch HUD: could not register /glitch-hud', { timeoutMs: 8000 })
    }
    if (problems.length) $.ui.toast(`Glitch HUD: ${problems.join('; ')}`, { timeoutMs: 8000 })

    await refreshUsage($)
    await refreshGit($)
    // Today's spend counts from this session's total now: a resumed session's
    // earlier cost belongs to the days it was spent on.
    const total = (await read($, stats)).total
    if ((await read($, budget)).day === '') {
      const now = await $.clock.now()
      const sessionId = await $.session.id().catch(() => 'session')
      await update($, budget, () => ({ ...initialBudget(config), day: dayKey(now), dayBase: total, lastTotal: total, sessionId }))
    } else {
      // A reload (new /config options): the state lived on, the caps follow the settings.
      await update($, budget, b => withConfigCaps(b, config, total))
    }
    // Sum the ledger now, so today counts the other sessions from the first draw.
    await recordSpend($, config).catch(() => undefined)

    // The tok/s choice made with /glitch hud speed in an earlier session.
    const speed = parseSpeed(await $.store.get(STORE_SPEED).catch(() => undefined))
    if (speed) await update($, view, v => ({ ...v, speed }))

    // The colors and the fitted marks read the lifetime from the state.
    await update($, cache, c => ({ ...c, ttlMs: config.cacheTtlMs }))

    for (const t of timers) t.cancel()
    // Each tick catches its own failure: one rejection must never end the interval.
    const countdown = $.clock.every(1000, async () => {
      try {
        const c = await read($, cache)
        if (c.expiresAt === null) return
        const now = await $.clock.now()
        // A demo that has run out (and shown "expired" a moment) gives the real deadline back.
        if (isDemoOver(c, now)) {
          await update($, cache, x => endDemo(x, now))
          return
        }
        const left = Math.max(0, Math.floor((c.expiresAt - now) / 1000))
        if (left !== c.secondsLeft) await update($, cache, x => ({ ...x, secondsLeft: left }))
        if (c.isBusy) return
        const marks = warnMarks(config.cacheWarnMinutes, c.ttlMs ?? config.cacheTtlMs)
        const mark = dueMark(left, marks, c.warnedMark)
        if (mark === null) return
        await update($, cache, x => ({ ...x, warnedMark: mark }))
        const isDemo = !!c.real
        await warnCache($, config, Math.ceil(left / 60), isDemo)
        // A demo's warning is only a preview: it never sends a real (paid) ping.
        if (!isDemo) await autoWarm($, config, mark, marks)
      } catch {
        // The next tick tries again.
      }
    })

    const gitTick = $.clock.every(GIT_EVERY_MS, async () => {
      try {
        if ((await read($, cache)).isBusy) return
        await refreshGit($)
        await sumToday($)
      } catch {
        // The next refresh tries again.
      }
    })
    timers = [countdown, gitTick]
    return started
  })

  on('turn.start', async ($, e, next) => {
    const usage = await $.session.usage().catch(() => null)
    const total = usage?.cost?.usd ?? (await read($, stats)).total
    await update($, stats, s => ({ ...s, turn: s.turn + 1, costAtStart: total, total, turnCost: 0, isStale: usage ? false : s.isStale }))
    // A /clear or a /resume since the last turn: re-base before this turn spends.
    const sessionId = await $.session.id().catch(() => 'session')
    await update($, budget, b => rebase(b, sessionId, total))
    await update($, cache, c => ({ ...c, isBusy: true }))
    return next(e)
  })

  // Output speed of each main-thread response, timed from its first chunk.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    let startedAt: number | null = null
    const stream = next(e)
    for await (const chunk of stream) {
      // The speed is a nicety: a failure to time or store it must never break the stream.
      try {
        if (startedAt === null) startedAt = await $.clock.now()
        if (chunk.kind === 'stop' && chunk.usage) {
          const seconds = ((await $.clock.now()) - startedAt) / 1000
          const tokens = chunk.usage.output_tokens
          if (tokens >= MIN_TOKENS && seconds >= MIN_SECONDS) await update($, stats, s => ({ ...s, speed: Math.round(tokens / seconds) }))
        }
      } catch {
        // Leave the last speed shown.
      }
      yield chunk
    }
    await refreshUsage($).catch(() => undefined)
    return stream.result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const result = await next(e)
      if (e.agentId !== undefined) return result
      await refreshUsage($)
      await recordSpend($, config).catch(() => undefined)
      // Only a turn that reached the API restarts the cache's lifetime; one aborted
      // or failed before any request leaves the countdown as it was.
      if (e.reason === 'answer' || e.usage) {
        const now = await $.clock.now()
        await update($, cache, c => ({ ...c, expiresAt: now + config.cacheTtlMs, secondsLeft: config.cacheTtlMs / 1000, warnedMark: 0, real: null }))
      }
      await update($, budget, b => ({ ...b, demoPercent: null }))
      void refreshGit($)
      return result
    } finally {
      // A turn that threw must not leave the band busy; a failure here must not
      // hide the turn's own error.
      if (e.agentId === undefined) await update($, cache, c => ({ ...c, isBusy: false })).catch(() => undefined)
    }
  })

  // A /clear ends this conversation and the process goes on under a new id: record
  // its spend once more, and drop the countdown (its cache is no use to the next one).
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      try {
        await refreshUsage($)
        await recordSpend($, config)
      } catch {
        // The next record re-bases under the new id either way.
      }
      await update($, cache, c => ({ ...c, expiresAt: null, secondsLeft: null, warnedMark: 0, real: null })).catch(() => undefined)
    }
    return next(e)
  })

  // A press on the pet: glitch-pets reads the time on its next tick and plays a reaction.
  on('ui.message', async ($, e, next) => {
    if (e.element !== 'glitch-pet-poke') return next(e)
    const now = await $.clock.now()
    await update($, poke, () => ({ at: now })).catch(() => undefined)
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') {
      const now = await $.clock.now()
      await update($, cache, c => ({ ...c, lastPromptAt: now, warmedSincePrompt: false }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Kept outside the try so a drawing error never runs the chain beneath twice.
    let drawn: unknown = null
    let isDrawn = false
    try {
      const s = await read($, stats)
      const v = await read($, view)
      if (e.props.hasSurvey || s.turn === 0 || v.isHidden) return next(e)

      const data: PartData = {
        stats: s,
        cache: await read($, cache),
        budget: await read($, budget),
        git: await read($, git),
        theme: await loadTheme($),
        isWorking: e.props.isWorking || (await read($, cache)).isBusy,
        costShows: v.cost ?? config.costShows,
      }
      // Surfaces with Svg (desktop, VS Code, mobile) get icons and a real bar.
      // The desktop shows the branch in its own row and the conversation above, so
      // git and the turn count are left out there unless the person chose the parts.
      const rich = e.surface !== 'terminal'
      // The pet sits at the row's end on surfaces that draw images.
      const pet = rich ? await loadPet($) : null
      // So does the crew pill: the terminal keeps /glitch crew and the pane's own auto-open.
      const crew = rich ? await loadCrew($) : null
      const crewLabel = crew ? crewPillText(crew) : null
      const chosen = v.parts !== null || config.partsExplicit
      const parts = (v.parts ?? config.parts)
        .filter(id => id !== 'git' || (data.git !== null && (!rich || chosen)))
        .filter(id => id !== 'turn' || !rich || chosen)
        .filter(id => id !== 'speed' || showsSpeed(v.speed ?? config.speed, rich, chosen))
      // The cache part is never dropped, so ↻ shows exactly when it is asked for here.
      const showsWarm = parts.includes('cache') && data.cache.secondsLeft !== null && !e.props.isWorking
      // ↻ is part of the cache part: one cell of gap, then the glyph (padded on desktop).
      const warmCells = 1 + (rich ? 1 + WARM_PAD : 1)
      const width = (id: (typeof parts)[number], compact: boolean) =>
        (rich
          ? richWidth(richPart(id, data, compact))
          : cellWidth(segments(id, data, compact).map(x => x.text).join(''))) + (id === 'cache' && showsWarm ? warmCells : 0)
      // × takes one cell and a gap, the spacer a gap, the pet its cells and a gap, the
      // crew pill its label, its button chrome and a gap.
      const reserve = ROW_GAP + (1 + ROW_GAP) + (pet ? PET_CELLS + ROW_GAP : 0) + (crewLabel ? cellWidth(crewLabel) + CREW_PILL_PAD + ROW_GAP : 0)
      const { shown, compact } = fitParts(parts, width, e.props.bodyColumns, ROW_GAP, reserve)

      // Other mods' bands draw beneath this row; the engine's own placeholder is never nested.
      drawn = await Promise.resolve(next(e)).catch(() => null)
      isDrawn = true
      const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? (drawn as RenderNode) : null

      const ui = $.ui.resolve(e)
      const { Box, Button, Text } = ui
      const texts = (id: string, segs: { text: string; color?: string; bold?: boolean; dim?: boolean }[]) =>
        segs.map((seg, n) => (
          <Text key={`${id}-${n}`} color={seg.color} bold={seg.bold} dimColor={seg.dim}>
            {seg.text}
          </Text>
        ))
      const Svg = 'Svg' in ui ? ui.Svg : null
      const Client = 'Client' in ui ? ui.Client : null
      // A failed keep-warm only loses its toast.
      const warm = async () => {
        try {
          $.ui.toast(`Glitch: ${await keepWarm($, config.cacheTtlMs)}`, { timeoutMs: 8000 })
        } catch {
          // Nothing to show.
        }
      }
      // ↻ rides with the cache part, right after its text. One glyph: the desktop
      // draws a Button as a native button with its whole label, so a long label over
      // an icon showed as cut-off text.
      const warmControl = (id: string) =>
        id === 'cache' && showsWarm
          ? rich
            ? (
                // The desktop draws the glyph flush against the time: a cell before it.
                <Box key="glitch-warm-box" paddingLeft={WARM_PAD} flexShrink={0}>
                  <Button key="glitch-warm" label={data.cache.isWarming ? '…' : '↻'} plain dimColor onPress={warm} />
                </Box>
              )
            : (
                <Box key="glitch-warm-box" marginLeft={1} flexShrink={0}>
                  <Button key="glitch-warm" label={data.cache.isWarming ? '…' : '↻'} plain onPress={warm} />
                </Box>
              )
          : null
      const items = rich && Svg
        ? [
            <Box key="glitch-parts" flexDirection="row" flexGrow={1} justifyContent="space-between" columnGap={ROW_GAP} overflow="hidden">
              {shown.map(id => {
                const p = richPart(id, data, compact)
                return (
                  <Box key={id} flexDirection="row" flexShrink={0} alignItems="center" columnGap={1}>
                    {p.graphic ? <Svg source={p.graphic.source} alt={p.graphic.alt} width={p.graphic.width} height={p.graphic.height} /> : null}
                    <Box flexDirection="row">{texts(id, p.segments)}</Box>
                    {warmControl(id)}
                  </Box>
                )
              })}
            </Box>,
          ]
        : shown.map(id => (
            <Box key={id} flexDirection="row" flexShrink={0}>
              {texts(id, segments(id, data, compact))}
              {warmControl(id)}
            </Box>
          ))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={ROW_GAP} flexWrap="nowrap" overflow="hidden" alignItems="center">
            {items}
            {/* A press is glitch-pets' to answer: its ui.press hook opens or closes the crew pane. */}
            {crewLabel ? (
              <Box key="glitch-crew-box" flexShrink={0}>
                <Button key="glitch-crew" label={crewLabel} onPress={() => undefined} />
              </Box>
            ) : null}
            {/* Pet and ✕ are siblings under the row's one columnGap: the same space on
                both sides of the pet, and none left behind without one. */}
            {pet && Svg ? (
              <Box key="glitch-pet" flexShrink={0} alignItems="flex-end">
                <Svg source={pet.source} alt={pet.alt} width={pet.width} height={pet.height} />
                {Client ? (
                  <Box key="glitch-pet-target" position="absolute" top={0} left={0}>
                    <Client key="glitch-pet-poke" module="./poke.tsx" width={POKE_CELLS} height={1} />
                  </Box>
                ) : null}
              </Box>
            ) : null}
            {rich && Svg ? null : <Box flexGrow={1} />}
            <Button key="glitch-hide" label={rich && Svg ? '✕' : '×'} plain role="dismiss" dimColor onPress={() => update($, view, x => ({ ...x, isHidden: true }))} />
          </Box>
          {below}
        </Box>
      )
    } catch {
      return isDrawn && drawn ? (drawn as never) : next(e)
    }
  })

  // `/glitch hud|budget|warm|demo` reaches this plugin through glitch-core; the host
  // refuses a nested command run, so the answer is given here. Anything else goes on.
  on('command.run', { command: 'glitch-hud' }, async ($, e) => ({ text: await answerHud($, config, e.args) }))
  // A failed answer falls through to the hooks beneath, as an unknown subcommand does.
  on('command.run', { command: 'glitch' }, async ($, e, next) =>
    ROUTED.includes(splitArgs(e.args)[0] ?? '') ? { text: await answerHud($, config, e.args) } : next(e)).catch(($, e, next) => next(e))

  // The only refusing hook: at a cap, new subagents are refused. A crash in the
  // check lets the call through.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (!config.budgetBlocksAgents) return next(e)
    const reason = blockReason(await read($, budget), (await read($, stats)).total)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => next(e))
}
