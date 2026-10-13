import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { INITIAL_BUDGET, INITIAL_CACHE, INITIAL_GIT, INITIAL_STATS, INITIAL_VIEW, initialBudget } from './atoms'
import { dayKey } from './budget'
import { CACHE_TTL_MS, dueMark } from './cache'
import { parseConfig } from './config'
import type { HudConfig } from './config'
import { readGit } from './git'
import type { RunFn } from './git'
import { notify, projectName } from './notify'
import type { NotifyIO } from './notify'
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

// Shared with Task 10: the hooks that need the parsed settings.
export type Wiring = { config: HudConfig; onMark?: (mark: number) => Promise<void> }

export const register: Register = (on, options) => {
  const { config, problems } = parseConfig(options as Record<string, unknown>)
  const wiring: Wiring = { config }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (problems.length) $.ui.toast(`Glitch HUD: ${problems.join('; ')}`, { timeoutMs: 8000 })

    await refreshUsage($)
    await refreshGit($)
    // Today's spend counts from this session's total now: a resumed session's
    // earlier cost belongs to the days it was spent on.
    if ((await read($, budget)).day === '') {
      const now = await $.clock.now()
      const total = (await read($, stats)).total
      await update($, budget, () => ({ ...initialBudget(config), day: dayKey(now), dayBase: total }))
    }

    $.clock.every(1000, async () => {
      const c = await read($, cache)
      if (c.expiresAt === null) return
      const left = Math.max(0, Math.floor((c.expiresAt - (await $.clock.now())) / 1000))
      if (left !== c.secondsLeft) await update($, cache, x => ({ ...x, secondsLeft: left }))
      if (c.isBusy) return
      const mark = dueMark(left, config.cacheWarnMinutes, c.warnedMark)
      if (mark === null) return
      await update($, cache, x => ({ ...x, warnedMark: mark }))
      await warnCache($, config, Math.ceil(left / 60))
      await wiring.onMark?.(mark)
    })

    $.clock.every(GIT_EVERY_MS, async () => {
      if (!(await read($, cache)).isBusy) await refreshGit($)
    })
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
      if (startedAt === null) startedAt = await $.clock.now()
      if (chunk.kind === 'stop' && chunk.usage) {
        const seconds = ((await $.clock.now()) - startedAt) / 1000
        const tokens = chunk.usage.output_tokens
        if (tokens >= MIN_TOKENS && seconds >= MIN_SECONDS) await update($, stats, s => ({ ...s, speed: Math.round(tokens / seconds) }))
      }
      yield chunk
    }
    await refreshUsage($)
    return stream.result
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const result = await next(e)
      if (e.agentId !== undefined) return result
      await refreshUsage($)
      const now = await $.clock.now()
      await update($, cache, c => ({ ...c, expiresAt: now + CACHE_TTL_MS, secondsLeft: CACHE_TTL_MS / 1000, warnedMark: 0 }))
      await update($, budget, b => ({ ...b, demoPercent: null }))
      void refreshGit($)
      return result
    } finally {
      // A turn that threw must not leave the band busy.
      if (e.agentId === undefined) await update($, cache, c => ({ ...c, isBusy: false }))
    }
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
      const parts = (v.parts ?? config.parts).filter(id => id !== 'git' || data.git !== null)
      const width = (id: (typeof parts)[number], compact: boolean) =>
        cellWidth(segments(id, data, compact && id === 'context').map(x => x.text).join(''))
      const { shown, compactContext } = fitParts(parts, width, e.props.bodyColumns)

      // Other mods' bands draw beneath this row; the engine's own placeholder is never nested.
      drawn = await Promise.resolve(next(e)).catch(() => null)
      isDrawn = true
      const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

      const { Box, Button, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={2} flexWrap="nowrap" overflow="hidden">
            {shown.map(id => (
              <Box key={id} flexDirection="row" flexShrink={0}>
                {segments(id, data, compactContext && id === 'context').map((seg, n) => (
                  <Text key={`${id}-${n}`} color={seg.color} bold={seg.bold} dimColor={seg.dim}>
                    {seg.text}
                  </Text>
                ))}
              </Box>
            ))}
            <Box flexGrow={1} />
            <Button key="glitch-hide" label="×" plain role="dismiss" dimColor onPress={() => update($, view, x => ({ ...x, isHidden: true }))} />
          </Box>
          {below}
        </Box>
      )
    } catch {
      return isDrawn && drawn ? (drawn as never) : next(e)
    }
  })

  return wiring
}
