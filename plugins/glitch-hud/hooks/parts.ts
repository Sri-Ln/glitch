import type { Budget, CacheState, CostScope, GitInfo, HudTheme, Level, PartId, Stats } from '../types'
import { costLevel, todaySpent, usd } from './budget'
import { cacheLevel, clockText } from './cache'

export type Segment = { text: string; color?: string; bold?: boolean; dim?: boolean }

export type PartData = {
  stats: Stats
  cache: CacheState
  budget: Budget
  git: GitInfo | null
  theme: HudTheme
  isWorking: boolean
  /** The cost figures to show, in order. */
  costShows: CostScope[]
}

export type CostFigure = { scope: CostScope; value: number }

// The chosen cost figures with their values. The reply figure is left out before
// any reply, and while it reads the same as the session figure beside it (the
// first turn).
export function costFigures(d: PartData): CostFigure[] {
  const s = d.stats
  const value = (scope: CostScope): number =>
    scope === 'reply' ? (s.turnCost ?? 0) : scope === 'session' ? s.total : todaySpent(d.budget, s.total)
  const hidesReply = s.turnCost === null || (d.costShows.includes('session') && usd(s.turnCost) === usd(s.total))
  return d.costShows.filter(scope => scope !== 'reply' || !hidesReply).map(scope => ({ scope, value: value(scope) }))
}

export const DROP_ORDER: PartId[] = ['git', 'speed', 'turn']

type IconSet = { turn: string; speed: string; cost: string; cache: string; context: string; git: string; changed: string; ahead: string; behind: string }

const ICONS: Record<HudTheme['icons'], IconSet> = {
  emoji: { turn: '#', speed: '⚡', cost: '💰', cache: '⏳', context: '🧠', git: '🌿', changed: '±', ahead: '↑', behind: '↓' },
  symbols: { turn: '#', speed: '⚡', cost: '$', cache: '⧗', context: '◔', git: '⎇', changed: '±', ahead: '↑', behind: '↓' },
  ascii: { turn: '#', speed: '>', cost: '$', cache: 'T', context: 'C', git: '@', changed: '+-', ahead: '^', behind: 'v' },
}

// Terminals draw these two cells wide.
const WIDE = new Set(['⏳', '⚡'])

export const cellWidth = (s: string): number => [...s].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) >= 0x1f000 || WIDE.has(ch) ? 2 : 1), 0)

export const levelColor = (t: HudTheme, l: Level): string => (l === 'ok' ? t.good : l === 'warn' ? t.warn : t.alert)

const bar = (t: HudTheme, percent: number, width: number): string => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return t.bar[0].repeat(filled) + t.bar[1].repeat(width - filled)
}

export function segments(id: PartId, d: PartData, compact: boolean): Segment[] {
  const t = d.theme
  const i = ICONS[t.icons]
  const s = d.stats
  switch (id) {
    case 'turn':
      return [{ text: `${i.turn}${s.turn}`, bold: true }]
    case 'speed':
      return [{ text: `${i.speed} `, color: t.info }, { text: s.speed === null ? '—' : `${s.speed} tok/s`, bold: true }]
    case 'cost': {
      // The icon says dollars, so the figures go without the sign; compact drops the words.
      const color = levelColor(t, costLevel(d.budget, s.total))
      return [
        { text: `${i.cost} `, color },
        ...costFigures(d).flatMap((f, n): Segment[] => [
          ...(n > 0 ? [{ text: ' · ', dim: true }] : []),
          { text: f.value.toFixed(2), bold: true, color },
          ...(compact ? [] : [{ text: ` ${f.scope}`, dim: true }]),
        ]),
      ]
    }
    case 'cache': {
      const left = d.cache.secondsLeft
      const level = cacheLevel(left, d.isWorking, d.cache.ttlMs)
      const color = level === 'ok' ? t.accent : levelColor(t, level)
      const value = d.isWorking ? '…' : left === null ? '—' : left === 0 ? 'expired' : clockText(left)
      return [{ text: `${i.cache} `, color }, { text: value, bold: true, ...(level === 'ok' ? {} : { color }) }]
    }
    case 'context': {
      const color = s.context >= 85 ? t.alert : s.context >= 65 ? t.warn : t.info
      return compact
        ? [{ text: `${i.context} `, color }, { text: `${s.context}%`, bold: true }]
        : [{ text: `${i.context} `, color }, { text: `${bar(t, s.context, 6)} `, color }, { text: `${s.context}%`, bold: true }]
    }
    case 'git': {
      const g = d.git
      if (!g) return []
      const extra = [g.changed ? ` ${i.changed}${g.changed}` : '', g.ahead ? ` ${i.ahead}${g.ahead}` : '', g.behind ? ` ${i.behind}${g.behind}` : ''].join('')
      return [{ text: `${i.git} `, color: t.muted }, { text: g.branch, bold: true }, { text: extra, color: t.muted }]
    }
  }
}

// Which parts fit in `columns` cells on one line: drop by DROP_ORDER, then go
// compact (the cost loses its words, the context bar becomes its percent).
// `reserve` holds the row's controls.
export function fitParts(
  parts: PartId[],
  width: (id: PartId, compact: boolean) => number,
  columns: number,
  gap = 2,
  reserve = 2,
): { shown: PartId[]; compact: boolean } {
  let shown = [...parts]
  let compact = false
  const total = () => shown.reduce((sum, id) => sum + width(id, compact), 0) + gap * Math.max(0, shown.length - 1) + reserve
  for (const id of DROP_ORDER) {
    if (total() <= columns) break
    shown = shown.filter(p => p !== id)
  }
  if (total() > columns) compact = true
  return { shown, compact }
}
