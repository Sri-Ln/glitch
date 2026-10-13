import type { Budget, CacheState, GitInfo, HudTheme, Level, PartId, Stats } from '../types'
import { costLevel, usd } from './budget'
import { cacheLevel, clockText } from './cache'

export type Segment = { text: string; color?: string; bold?: boolean; dim?: boolean }

export type PartData = { stats: Stats; cache: CacheState; budget: Budget; git: GitInfo | null; theme: HudTheme; isWorking: boolean }

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
      // Unreadable usage: — rather than a number that looks frozen.
      if (s.isStale) return [{ text: `${i.cost} `, color: t.muted }, { text: '—', bold: true }]
      const color = levelColor(t, costLevel(d.budget, s.total))
      // On the first turn the two read the same: one figure, not a pair.
      const turn = s.turnCost === null ? '—' : usd(s.turnCost)
      return [
        { text: `${i.cost} `, color },
        ...(turn === usd(s.total) ? [] : [{ text: turn, bold: true, color }, { text: ' │ ', dim: true }]),
        { text: usd(s.total), bold: true, color },
      ]
    }
    case 'cache': {
      const left = d.cache.secondsLeft
      const level = cacheLevel(left, d.isWorking)
      const color = level === 'ok' ? t.accent : levelColor(t, level)
      const value = d.isWorking ? '…' : left === null ? '—' : left === 0 ? 'expired' : clockText(left)
      return [{ text: `${i.cache} `, color }, { text: value, bold: true, ...(level === 'ok' ? {} : { color }) }]
    }
    case 'context': {
      if (s.isStale) return [{ text: `${i.context} `, color: t.muted }, { text: '—', bold: true }]
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

// Which parts fit in `columns` cells on one line: drop by DROP_ORDER, then
// collapse the context bar to its percent. `reserve` holds the row's controls.
export function fitParts(
  parts: PartId[],
  width: (id: PartId, compact: boolean) => number,
  columns: number,
  gap = 2,
  reserve = 2,
): { shown: PartId[]; compactContext: boolean } {
  let shown = [...parts]
  let compactContext = false
  const total = () => shown.reduce((sum, id) => sum + width(id, compactContext), 0) + gap * Math.max(0, shown.length - 1) + reserve
  for (const id of DROP_ORDER) {
    if (total() <= columns) break
    shown = shown.filter(p => p !== id)
  }
  if (total() > columns) compactContext = true
  return { shown, compactContext }
}
