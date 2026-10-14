// The band as the surfaces with `Svg` draw it (desktop, VS Code, mobile): vector
// icons and a real context bar, and worded values in place of the terminal's bare
// symbols. Pure: register.tsx draws what this returns.
//
// Each graphic is drawn as a plain image at a fixed size. Its markup only changes
// with its color or fill, never with the clock, so a redraw each second reuses it.
// No hover tooltips: an interactive Svg is a frame of its own, which the desktop
// drew far taller than the row and rebuilt on every tick.
import type { CostScope, Level, PartId } from '../types'
import { costLevel, todaySpent, usd } from './budget'
import { cacheLevel, clockText } from './cache'
import { cellWidth, costFigures, levelColor } from './parts'
import type { PartData, Segment } from './parts'

export type Graphic = { source: string; alt: string; width: number; height: number; cells: number }

export type RichPart = { graphic: Graphic | null; segments: Segment[] }

/** The cells an icon takes in the row, for fitting; the bar takes more. */
export const ICON_CELLS = 2
export const BAR_CELLS = 7

const BAR_WIDTH = 48
const BAR_HEIGHT = 8
const ICON_SIZE = 14

// Theme colors come from a custom theme too: only a hex value or a color name
// reaches the markup.
export const safeColor = (c: string | undefined): string => (c && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(c) ? c : 'currentColor')

// The cost in the host's own status colors, as its diff counts are drawn: the
// themes' colors are made for a dark terminal and wash out on a light band. The
// text names them, so they follow the person's light or dark mode; the icon is an
// image and cannot, so it takes the light-mode shades sampled from the desktop.
export const HOST_COLOR = { ok: 'success', warn: 'warning', alert: 'error' } as const
export const HOST_HEX = { ok: '#24a041', warn: '#b7791f', alert: '#ce295b' } as const
const hostLevel = (l: Level): keyof typeof HOST_COLOR => (l === 'over' ? 'alert' : l)

type IconKind = 'speed' | 'cost' | 'cache'

const SHAPES: Record<IconKind, (c: string) => string> = {
  speed: c => `<path d="M9.5 1 3 9.2h4.2L6.5 15 13 6.8H8.8z" fill="${c}"/>`,
  cost: c =>
    `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${c}" stroke-width="1.5"/>` +
    `<path d="M10 5.9c-.4-.6-1.1-.9-2-.9-1.1 0-1.9.6-1.9 1.4 0 .9.8 1.2 1.9 1.5 1.1.3 2 .7 2 1.6 0 .9-.9 1.5-2 1.5-.9 0-1.6-.3-2.1-.9M8 3.8V5m0 6v1.2" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>`,
  cache:
    c =>
      `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${c}" stroke-width="1.5"/>` +
      `<path d="M8 4.5V8l2.5 1.6" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`,
}

export const iconSvg = (kind: IconKind, color: string, alt: string): Graphic => ({
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 16 16">${SHAPES[kind](safeColor(color))}</svg>`,
  alt,
  width: ICON_SIZE,
  height: ICON_SIZE,
  cells: ICON_CELLS,
})

export const barSvg = (percent: number, color: string, track: string, alt: string): Graphic => {
  // Any fill at all is drawn at least as a round dot.
  const fill = percent > 0 ? Math.max(BAR_HEIGHT, Math.round((Math.min(100, percent) / 100) * BAR_WIDTH)) : 0
  const r = BAR_HEIGHT / 2
  return {
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="${BAR_HEIGHT}" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}">` +
      `<rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" rx="${r}" fill="${safeColor(track)}" fill-opacity="0.3"/>` +
      (fill > 0 ? `<rect width="${fill}" height="${BAR_HEIGHT}" rx="${r}" fill="${safeColor(color)}"/>` : '') +
      `</svg>`,
    alt,
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    cells: BAR_CELLS,
  }
}

// The cap a figure is held to, when the budget is on: none for a reply.
const capOf = (d: PartData, scope: CostScope): number =>
  d.budget.isOff ? 0 : scope === 'session' ? d.budget.sessionCap : scope === 'today' ? d.budget.dailyCap : 0

const ofCap = (d: PartData, scope: CostScope): string => (capOf(d, scope) > 0 ? ` of ${usd(capOf(d, scope))}` : '')

// Every figure, whichever the band shows: the tooltip is where they are spelled out.
export function costTip(d: PartData): string {
  const s = d.stats
  const showsReply = s.turnCost !== null && usd(s.turnCost) !== usd(s.total)
  return [
    showsReply ? `${d.isWorking ? 'This' : 'Last'} reply ${usd(s.turnCost as number)}` : null,
    `Session ${usd(s.total)}${ofCap(d, 'session')}`,
    `Today on this machine ${usd(todaySpent(d.budget, s.total))}${ofCap(d, 'today')}`,
  ].filter(Boolean).join(' · ')
}

export function cacheTip(d: PartData): string {
  const left = d.cache.secondsLeft
  if (d.isWorking) return 'Prompt cache: a request is running'
  if (left === null) return 'Prompt cache: no request yet'
  if (left === 0) return 'Prompt cache expired: the next message reads the whole context again'
  // No clock here: the time is in the text beside it, and an icon whose props
  // change each second is redrawn each second.
  return 'Prompt cache countdown. Press ↻ to keep it warm.'
}

export function richPart(id: PartId, d: PartData, compact: boolean): RichPart {
  const t = d.theme
  const s = d.stats
  switch (id) {
    case 'turn':
      return { graphic: null, segments: [{ text: 'Turn ', dim: true }, { text: String(s.turn), bold: true }] }
    case 'speed':
      return {
        graphic: iconSvg('speed', t.info, 'Output speed of the last answer'),
        segments: [{ text: s.speed === null ? '—' : String(s.speed), bold: true }, { text: ' tok/s', dim: true }],
      }
    case 'cost': {
      // Compact keeps the figures alone; the tooltip still names them.
      const level = hostLevel(costLevel(d.budget, s.total))
      const color = HOST_COLOR[level]
      return {
        graphic: iconSvg('cost', HOST_HEX[level], costTip(d)),
        segments: costFigures(d).flatMap((f, n): Segment[] => [
          ...(n > 0 ? [{ text: ' · ', dim: true }] : []),
          { text: usd(f.value), bold: true, color },
          ...(compact
            ? []
            : [...(capOf(d, f.scope) > 0 ? [{ text: ' of ', dim: true }, { text: usd(capOf(d, f.scope)), color }] : []), { text: ` ${f.scope}`, dim: true }]),
        ]),
      }
    }
    case 'cache': {
      const left = d.cache.secondsLeft
      const level = cacheLevel(left, d.isWorking, d.cache.ttlMs)
      const color = level === 'ok' ? t.accent : levelColor(t, level)
      const value = d.isWorking ? '…' : left === null ? '—' : left === 0 ? 'expired' : clockText(left)
      return {
        graphic: iconSvg('cache', color, cacheTip(d)),
        segments: [{ text: value, bold: true, ...(level === 'ok' ? {} : { color }) }, ...(left && !d.isWorking ? [{ text: ' left', dim: true }] : [])],
      }
    }
    case 'context': {
      const color = s.context >= 85 ? t.alert : s.context >= 65 ? t.warn : t.info
      const tip = `Context ${s.context}% full`
      return {
        graphic: compact ? null : barSvg(s.context, color, t.muted, tip),
        segments: [{ text: `${s.context}%`, bold: true }, { text: ' context', dim: true }],
      }
    }
    case 'git': {
      const g = d.git
      if (!g) return { graphic: null, segments: [] }
      const extra = [g.changed ? ` ±${g.changed}` : '', g.ahead ? ` ↑${g.ahead}` : '', g.behind ? ` ↓${g.behind}` : ''].join('')
      return { graphic: null, segments: [{ text: g.branch, bold: true }, { text: extra, color: t.muted }] }
    }
  }
}

/** Cells a rich part takes: its graphic, a gap, its text. */
export const richWidth = (p: RichPart): number =>
  (p.graphic ? p.graphic.cells + 1 : 0) + cellWidth(p.segments.map(x => x.text).join(''))
