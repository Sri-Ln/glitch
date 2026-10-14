// The shared laptop every pet works on: the back of a small gray laptop faces the
// viewer, the pet's head peeks over the lid and two paws tap at the sides.
// Gallery-safe: only `import type`.
import type { Frame, Persona } from './types'

export const LAPTOP_PALETTE = { '4': '#8b91a8', '6': '#cfe8ff', '7': '#3f4459' } as const

const W = 16
const LID = 7
const line = (fill: string, from: number, to: number): string => '.'.repeat(from) + fill.repeat(to - from + 1) + '.'.repeat(W - 1 - to)
const put = (rows: string[], x: number, y: number, ch: string): string[] =>
  rows.map((r, yy) => (yy === y && x >= 0 && x < W ? r.slice(0, x) + ch + r.slice(x + 1) : r))

/** Six typing frames over a pet's head: rows 0-6 from `base`, laptop on rows 7-12. */
export function laptopFrames(base: Frame, paw: string): Frame[] {
  return [0, 1, 2, 3, 4, 5].map(n => {
    let r: string[] = base.slice(0, LID)
    for (let y = LID; y < 12; y++) r.push(line('4', 3, 12))
    r.push(line('7', 2, 13))
    if (n % 3 !== 2) r = put(put(r, 7, 9, '6'), 8, 9, '6')
    const leftUp = n % 2 === 0
    r = put(r, 2, leftUp ? 10 : 11, paw)
    r = put(r, 13, leftUp ? 11 : 10, paw)
    return r
  })
}

/** The persona as it plays: working is typing on the laptop, the signature move moves to idle. */
export function withLaptop(p: Persona): Persona {
  const base = p.moods.idle.frames[0] as Frame
  const { working } = p.moods
  return {
    ...p,
    palette: { ...p.palette, ...LAPTOP_PALETTE },
    moods: {
      ...p.moods,
      idle: { frames: working.frames, fps: Math.max(2, Math.round(working.fps / 2)) },
      working: { frames: laptopFrames(base, p.laptopPaw), fps: 6 },
      tired: { frames: laptopFrames(base, p.laptopPaw), fps: 3 },
    },
  }
}
