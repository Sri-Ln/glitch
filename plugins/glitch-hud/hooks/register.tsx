import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode, Timer } from 'claude-code'

import { INITIAL_BUDGET, INITIAL_CACHE, INITIAL_GIT, INITIAL_STATS, INITIAL_VIEW, initialBudget } from './atoms'
import { blockReason, dayKey, isExpired, ledgerKey, levelOf, parseLedgerKey, rebase, spendToday, withConfigCaps } from './budget'
import { dueMark, shouldAutoWarm, warnMarks } from './cache'
import { BUDGET_USAGE, DEMO_USAGE, ROUTED, USAGE, WARM_PROMPT, budgetAlerts, budgetSummary, parseBudgetArg, splitArgs, warmMessage } from './commands'
import { ALL_PARTS, parseConfig, parseParts } from './config'
import type { HudConfig } from './config'
import { readGit } from './git'
import type { RunFn } from './git'
import { notify, projectName } from './notify'
import type { NotifyIO } from './notify'
import { richPart, richWidth } from './desktop'
import { cellWidth, fitParts, segments } from './parts'
import type { PartData } from './parts'
import { toTheme } from './theme'

export const stats = atom({ plugin: 'glitch-hud', key: 'stats' } as const, INITIAL_STATS)
export const cache = atom({ plugin: 'glitch-hud', key: 'cache' } as const, INITIAL_CACHE)
export const budget = atom({ plugin: 'glitch-hud', key: 'budget' } as const, INITIAL_BUDGET)
export const git = atom({ plugin: 'glitch-hud', key: 'git' } as const, INITIAL_GIT)
export const view = atom({ plugin: 'glitch-hud', key: 'view' } as const, INITIAL_VIEW)

// Responses shorter than this are mostly tool-call stubs; their timing is noise.
const MIN_TOKENS = 20
const MIN_SECONDS = 0.5
const GIT_EVERY_MS = 30_000
const ROW_GAP = 2

export async function refreshUsage($: EngineInterface): Promise<void> {
  const usage = await $.session.usage().catch(() => null)
  if (!usage) return
  const total = usage.cost?.usd ?? 0
  await update($, stats, s => ({ ...s, total, turnCost: s.turn === 0 ? null : total - s.costAtStart, context: usage.context.percent ?? s.context }))
}

// Engine calls handed to the pure helpers: `$` stays in this file.
const gitRun = ($: EngineInterface): RunFn => (argv, init) => $.process.run(argv, init)

const engineIO = ($: EngineInterface): NotifyIO => ({
  os: () => $.env.get('OS'),
  run: (argv, init) => $.process.run(argv, init),
  notifyClaude: (text, options) => $.ui.notify(text, options),
  toast: (text, options) => $.ui.toast(text, options),
})

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

export async function warnCache($: EngineInterface, config: HudConfig, minutes: number): Promise<void> {
  const title = `${projectName(await $.session.cwd().catch(() => ''))} — Glitch`
  await notify(engineIO($), config.notify, title, `Prompt cache expires in ${minutes} min`)
}

export async function keepWarm($: EngineInterface, ttlMs: number): Promise<string> {
  if ((await read($, cache)).isBusy) return 'Claude is working, so the cache is warm already.'
  const reply = await $.model.fork({ prompt: WARM_PROMPT }).catch(() => ({ isAnswered: false as const, reason: 'request refused' }))
  if (reply.isAnswered) {
    const now = await $.clock.now()
    await update($, cache, c => ({ ...c, expiresAt: now + ttlMs, secondsLeft: ttlMs / 1000, warnedMark: 0, warmedSincePrompt: true }))
  }
  return warmMessage(reply, ttlMs / 1000)
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
  // A key first written by this run may hold an earlier run's spend (a resume): add to it.
  const prior = key === based.ledgerKey ? based.priorForKey : storedNumber(await $.store.get(key).catch(() => undefined))
  const mine = prior + today.spent
  await $.store.set(key, mine).catch(() => undefined)

  let daily = mine
  for (const k of await $.store.keys().catch(() => [] as string[])) {
    const entry = parseLedgerKey(k)
    if (!entry || k === key) continue
    if (isExpired(entry.day, now)) await $.store.delete(k).catch(() => undefined)
    else if (entry.day === today.day) daily += storedNumber(await $.store.get(k).catch(() => undefined))
  }
  await update($, budget, x => ({
    ...x, sessionId, day: today.day, dayBase: today.dayBase, lastTotal: total, ledgerKey: key, priorForKey: prior, dailySpent: daily,
  }))

  const b = await read($, budget)
  if (b.isOff) return
  const alerts = budgetAlerts(b.notified, { session: total, daily, sessionCap: b.sessionCap, dailyCap: b.dailyCap })
  await update($, budget, x => ({ ...x, notified: alerts.notified }))
  for (const t of alerts.toasts) $.ui.toast(t.text, { timeoutMs: t.timeoutMs })
  if (alerts.notice) {
    const title = `${projectName(await $.session.cwd().catch(() => ''))} — Glitch`
    await notify(engineIO($), config.notify, title, alerts.notice)
  }
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
    await update($, cache, c => ({ ...c, expiresAt: now + seconds * 1000, secondsLeft: seconds, warnedMark: 0 }))
    await update($, view, v => ({ ...v, isHidden: false }))
    return `Cache demo: ${value} min left until the next answer resets it.`
  }
  if (what === 'budget' && Number.isFinite(n) && n >= 0) {
    await update($, budget, b => ({ ...b, demoPercent: n }))
    return `Budget demo: ${value}% until the next answer.`
  }
  return DEMO_USAGE
}

// One answer for `/glitch-hud <args>` and the routed `/glitch <args>`.
async function answerHud($: EngineInterface, config: HudConfig, args: string): Promise<string> {
  const [sub = '', a, b] = splitArgs(args)
  if (sub === 'hud') {
    if (a === 'parts') {
      const parts = b ? parseParts(b) : null
      if (!parts) return `Unknown part. Parts: ${ALL_PARTS.join(', ')}.`
      await update($, view, v => ({ ...v, parts, isHidden: false }))
      return `HUD parts: ${parts.join(', ')}.`
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

    // The colors and the fitted marks read the lifetime from the state.
    await update($, cache, c => ({ ...c, ttlMs: config.cacheTtlMs }))

    for (const t of timers) t.cancel()
    // Each tick catches its own failure: one rejection must never end the interval.
    const countdown = $.clock.every(1000, async () => {
      try {
        const c = await read($, cache)
        if (c.expiresAt === null) return
        const left = Math.max(0, Math.floor((c.expiresAt - (await $.clock.now())) / 1000))
        if (left !== c.secondsLeft) await update($, cache, x => ({ ...x, secondsLeft: left }))
        if (c.isBusy) return
        const marks = warnMarks(config.cacheWarnMinutes, c.ttlMs ?? config.cacheTtlMs)
        const mark = dueMark(left, marks, c.warnedMark)
        if (mark === null) return
        await update($, cache, x => ({ ...x, warnedMark: mark }))
        await warnCache($, config, Math.ceil(left / 60))
        await autoWarm($, config, mark, marks)
      } catch {
        // The next tick tries again.
      }
    })

    const gitTick = $.clock.every(GIT_EVERY_MS, async () => {
      try {
        if (!(await read($, cache)).isBusy) await refreshGit($)
      } catch {
        // The next refresh tries again.
      }
    })
    timers = [countdown, gitTick]
    return started
  })

  on('turn.start', async ($, e, next) => {
    const total = (await $.session.usage().catch(() => null))?.cost?.usd ?? (await read($, stats)).total
    await update($, stats, s => ({ ...s, turn: s.turn + 1, costAtStart: total, total, turnCost: 0 }))
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
        await update($, cache, c => ({ ...c, expiresAt: now + config.cacheTtlMs, secondsLeft: config.cacheTtlMs / 1000, warnedMark: 0 }))
      }
      await update($, budget, b => ({ ...b, demoPercent: null }))
      void refreshGit($)
      return result
    } finally {
      // A turn that threw must not leave the band busy.
      if (e.agentId === undefined) await update($, cache, c => ({ ...c, isBusy: false }))
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
      await update($, cache, c => ({ ...c, expiresAt: null, secondsLeft: null, warnedMark: 0 })).catch(() => undefined)
    }
    return next(e)
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
      }
      // Surfaces with Svg (desktop, VS Code, mobile) get icons, a real bar and tooltips.
      // The desktop shows the branch in its own row, so git is left out there unless
      // the person chose the parts.
      const rich = e.surface !== 'terminal'
      const chosen = v.parts !== null || config.partsExplicit
      const parts = (v.parts ?? config.parts).filter(id => id !== 'git' || (data.git !== null && (!rich || chosen)))
      const width = (id: (typeof parts)[number], compact: boolean) =>
        rich
          ? richWidth(richPart(id, data, compact && id === 'context'))
          : cellWidth(segments(id, data, compact && id === 'context').map(x => x.text).join(''))
      // The controls are flex items of the gapped row too: ↻ and × take one cell and
      // a gap each, the spacer a gap. The cache part is never dropped, so ↻ shows
      // exactly when it is asked for here.
      const showsWarm = parts.includes('cache') && data.cache.secondsLeft !== null && !e.props.isWorking
      const reserve = (showsWarm ? 1 + ROW_GAP : 0) + ROW_GAP + (1 + ROW_GAP)
      const { shown, compactContext } = fitParts(parts, width, e.props.bodyColumns, ROW_GAP, reserve)

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
      const items = rich && Svg
        ? [
            <Box key="glitch-parts" flexDirection="row" flexGrow={1} justifyContent="space-between" columnGap={ROW_GAP} overflow="hidden">
              {shown.map(id => {
                const p = richPart(id, data, compactContext && id === 'context')
                return (
                  <Box key={id} flexDirection="row" flexShrink={0} alignItems="center" columnGap={1}>
                    {p.graphic ? <Svg source={p.graphic.source} alt={p.graphic.alt} isInteractive /> : null}
                    <Box flexDirection="row">{texts(id, p.segments)}</Box>
                  </Box>
                )
              })}
            </Box>,
          ]
        : shown.map(id => (
            <Box key={id} flexDirection="row" flexShrink={0}>
              {texts(id, segments(id, data, compactContext && id === 'context'))}
            </Box>
          ))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={ROW_GAP} flexWrap="nowrap" overflow="hidden" alignItems="center">
            {items}
            {showsWarm ? (
              <Button key="glitch-warm" label="↻" plain onPress={async () => $.ui.toast(`Glitch: ${await keepWarm($, config.cacheTtlMs)}`, { timeoutMs: 8000 })} />
            ) : null}
            {rich && Svg ? null : <Box flexGrow={1} />}
            <Button key="glitch-hide" label="×" plain role="dismiss" dimColor onPress={() => update($, view, x => ({ ...x, isHidden: true }))} />
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
  on('command.run', { command: 'glitch' }, async ($, e, next) =>
    ROUTED.includes(splitArgs(e.args)[0] ?? '') ? { text: await answerHud($, config, e.args) } : next(e))

  // The only refusing hook: at a cap, new subagents are refused. A crash in the
  // check lets the call through.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (!config.budgetBlocksAgents) return next(e)
    const reason = blockReason(await read($, budget), (await read($, stats)).total)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => next(e))
}
