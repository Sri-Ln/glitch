// A crew member's finish (desktop): its own mini does a short happy hop with a small sparkle
// by its head, for HOP_MS. Each member that finishes gets its own, so several finishing
// together each hop at once. Pure: the sparkle is laid into the mini's own image (same box,
// same size), so nothing around it moves.
import type { Frame, Sprite } from './types'

/** How long a finished member hops (from its row's end). */
export const HOP_MS = 1500
/** The sparkle changes this often: the pane's frame clock floor, so each step is drawn. */
export const SPARK_STEP_MS = 250

/** The sparkle as it twinkles: small, large, then the burst. Palette keys every pet has (Y, C). */
export const SPARKS: readonly Frame[] = [
  ['.Y.', 'YCY', '.Y.'],
  ['..Y..', '..Y..', 'YYCYY', '..Y..', '..Y..'],
  ['Y...Y', '.....', '..Y..', '.....', 'Y...Y'],
]

/** Where the sparkle centers, in sprite pixels: by the pet's head, at the right of its 16 columns. */
const SPARK_AT = { x: 14, y: 2 } as const
const FALLBACK = { Y: '#f5c542', C: '#fff6c8' } as const

/** True while a row that finished `endedAt` (clock ms) is still hopping at `now`. */
export const isHopping = (r: { status: string; endedAt: number | null }, now: number): boolean =>
  r.status === 'done' && r.endedAt !== null && now >= r.endedAt && now - r.endedAt < HOP_MS

/** Ms until the hop's sparkle next changes, `t` ms into the hop (null once it is over). */
export const nextSparkIn = (t: number): number | null => (t >= HOP_MS ? null : Math.min(HOP_MS - t, SPARK_STEP_MS - (Math.max(0, t) % SPARK_STEP_MS)))

/**
 * The mini with the sparkle `t` ms into the hop laid over it, in its own viewBox (sprite pixels),
 * as an inert `data-part="sparkle"` group. Same width and height as the mini.
 */
export function withSparkle(mini: Sprite, palette: Readonly<Record<string, string>>, t: number): Sprite {
  const spark = SPARKS[Math.floor(Math.max(0, t) / SPARK_STEP_MS) % SPARKS.length] as Frame
  const h = spark.length
  const w = spark[0]?.length ?? 0
  const x0 = SPARK_AT.x - Math.floor(w / 2)
  const y0 = Math.max(0, SPARK_AT.y - Math.floor(h / 2))
  let rects = ''
  spark.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as 'Y' | 'C' | '.'
      if (ch === '.') continue
      const color = palette[ch] ?? FALLBACK[ch]
      rects += `<rect x="${x0 + x}" y="${y0 + y}" width="1" height="1" fill="${color}"/>`
    }
  })
  const at = mini.source.lastIndexOf('</svg>')
  if (at < 0) return mini
  return { ...mini, source: `${mini.source.slice(0, at)}<g data-part="sparkle">${rects}</g>${mini.source.slice(at)}` }
}
