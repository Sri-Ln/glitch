// Crew theme "Busy hands": the mini acts its role out in a short loop beside itself.
// Role = the action (hammering, stargazing, painting, pouring, stamping, juggling).
// Model = output per beat (Haiku 1, Sonnet 2, Opus 3 sparks, stars, colors, bubbles, stamps or
// balls) and tempo (Haiku quick, Opus deliberate). The pet's first idle frame on the left
// 16 columns (never drawn over), the action in the 8 columns beside it; 24 × 13.
// Gallery-safe: only `import type`.
import type { Frame, Role } from '../behavior/types'
import type { CrewMiniInput, CrewTheme } from './types'

export type Model = 'haiku' | 'sonnet' | 'opus'
/** One pixel of the action: x 0–7 (beside the pet, from column 16), y 0–12, palette key. */
export type Pt = readonly [number, number, string]

/** The theme's own keys: punctuation only, never a pet's letter. */
const PALETTE: Record<string, string> = {
  '"': '#ffffff', // glint
  '(': '#5e3a1c', // wood
  ')': '#a8743a', // handle
  '[': '#3e4558', // steel
  ']': '#8d97ad',
  '|': '#d3dae8',
  '<': '#e8483e', // red
  '>': '#ff8a3d', // orange
  '^': '#ffd23f', // yellow
  '+': '#3ddc84', // green
  '~': '#4f8cff', // blue
  '%': '#ff6fb0', // pink
  '?': '#f4ecd8', // paper
  '/': '#a89874', // paper shade
  ';': '#2fbf6a', // potion
}
export const BUSY_KEYS: readonly string[] = Object.keys(PALETTE)

const WIDTH = 24
const HEIGHT = 13
const X0 = 16
const BEATS = 4

/** The model family from the engine's model id; an unknown or missing one is the middle. */
export function modelOf(model: string | null): Model {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('opus')) return 'opus'
  return 'sonnet'
}
export const beatsOf = (m: Model): number => ({ haiku: 1, sonnet: 2, opus: 3 })[m]
/** Beats per second. */
export const TEMPO: Record<Model, number> = { haiku: 8, sonnet: 5, opus: 3 }
/** The beat a finished member holds: the one that reads best as a still. */
const STILL: Record<Role, number> = { builder: 2, researcher: 0, designer: 3, tester: 0, reviewer: 2, other: 0 }

type XY = readonly [number, number]
const dots = (pts: readonly XY[], ch: string): Pt[] => pts.map(([x, y]) => [x, y, ch] as const)
function box(x: number, y: number, w: number, h: number, ch: string): Pt[] {
  const out: Pt[] = []
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push([xx, yy, ch])
  return out
}

/** Beat `i` (0–3) of a role's action with `n` (1–3) outputs per beat; later points draw over earlier ones. */
const ACTIONS: Record<Role, (i: number, n: number) => Pt[]> = {
  // Hammering at an anvil; sparks fly on the strike.
  builder(i, n) {
    const out = [...box(2, 10, 6, 1, '|'), ...box(3, 11, 4, 1, ']'), ...box(2, 12, 6, 1, '[')]
    const pose = [0, 1, 2, 1][i]
    if (pose === 0) out.push(...dots([[0, 9], [1, 8], [1, 7], [2, 6]], ')'), ...box(1, 3, 4, 2, ']'), ...box(1, 4, 4, 1, '['))
    if (pose === 1) out.push(...dots([[0, 9], [1, 8], [2, 8], [3, 7]], ')'), ...box(4, 4, 2, 3, ']'), ...box(5, 4, 1, 3, '['))
    if (pose === 2) {
      out.push(...dots([[0, 9], [1, 9], [2, 9], [3, 9]], ')'), ...box(4, 7, 2, 3, ']'), ...box(5, 7, 1, 3, '['))
      const sparks: XY[][] = [[[7, 8], [6, 6]], [[2, 7], [1, 5]], [[7, 4], [6, 3]]]
      for (const [a, b] of sparks.slice(0, n)) out.push(...dots([a!], '>'), ...dots([b!], '^'))
    }
    return out
  },
  // A telescope on a tripod; the stars twinkle.
  researcher(i, n) {
    const out = dots([[1, 8], [2, 7], [3, 6], [4, 5], [5, 4], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4]], '~')
    out.push(...dots([[3, 6], [3, 7]], ']'), ...dots([[6, 3], [7, 3], [7, 4]], i % 2 ? '"' : '|'))
    out.push(...dots([[3, 9], [2, 10], [2, 11], [1, 12], [4, 9], [4, 10], [4, 11], [4, 12], [5, 9], [6, 10], [6, 11], [7, 12]], '('))
    const stars: XY[] = [[2, 3], [5, 1], [1, 0]]
    stars.slice(0, n).forEach(([x, y], k) => {
      out.push([x, y, '^'])
      if ((i + k) % 2 === 0) out.push(...dots(([[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]] as XY[]).filter(([, yy]) => yy >= 0), '>'))
    })
    return out
  },
  // Painting a canvas on an easel, one stroke per beat, in 1–3 colors.
  designer(i, n) {
    const out = [...box(2, 1, 6, 1, '('), ...box(2, 7, 6, 1, '('), ...box(2, 2, 1, 5, '('), ...box(7, 2, 1, 5, '('), ...box(3, 2, 4, 5, '?')]
    out.push(...dots([[3, 8], [2, 9], [2, 10], [1, 11], [1, 12], [5, 8], [5, 9], [5, 10], [5, 11], [6, 8], [7, 9], [7, 10], [7, 11], [7, 12]], '('))
    const colors = ['~', '%', '^'].slice(0, n)
    const strokes: XY[][] = [[[3, 2], [4, 2], [4, 3]], [[5, 3], [6, 3], [6, 4]], [[3, 5], [4, 5], [5, 5], [5, 6]], [[3, 4], [6, 6]]]
    strokes.slice(0, i + 1).forEach((s, k) => out.push(...dots(s, colors[k % colors.length]!)))
    const tip = ([[3, 3], [6, 4], [4, 6], [3, 4]] as XY[])[i]!
    out.push(...dots([[0, 9], [1, 8]], ')'), [tip[0] - 1, tip[1] + 1, ')'], [tip[0], tip[1], colors[i % colors.length]!])
    return out
  },
  // Pouring a flask into a beaker; bubbles rise.
  tester(i, n) {
    const out = [...box(3, 8, 1, 4, ']'), ...box(7, 8, 1, 4, ']'), ...box(3, 12, 5, 1, ']'), ...box(4, 10, 3, 2, ';')]
    out.push(...dots([[0, 7], [1, 6], [2, 5], [1, 4], [2, 3], [3, 4], [3, 5]], ']'), ...dots([[1, 5], [2, 4]], ';'))
    out.push([4, 5 + (i % 4), ';'])
    const bubbles: XY[] = [[5, 9], [6, 8], [4, 7]]
    bubbles.slice(0, n).forEach(([x, y], k) => out.push([x, y - ((i + k) % 3) * 2, '+']))
    return out
  },
  // Stamping a page: 1–3 red stamps already on it, the stamp coming down.
  reviewer(i, n) {
    const out = [...box(0, 10, 8, 2, '?'), ...box(0, 12, 8, 1, '/')]
    for (const x of [0, 3, 6].slice(0, n)) out.push(...box(x, 10, 2, 2, '<'))
    const down = [0, 2, 3, 1][i]!
    out.push([4, 2 + down, '('], ...dots([[4, 3 + down], [4, 4 + down]], ')'), ...box(3, 5 + down, 3, 1, '('), ...box(3, 6 + down, 3, 1, '<'))
    return out
  },
  // Juggling 1–3 balls round a ring.
  other(i, n) {
    const ring: XY[] = [[3, 1], [5, 2], [6, 4], [5, 6], [3, 7], [1, 6], [0, 4], [1, 2]]
    const balls = ['<', '^', '~']
    const out: Pt[] = []
    for (let k = 0; k < n; k++) {
      const [x, y] = ring[(i * 2 + Math.round((k * 8) / n)) % 8]!
      out.push(...box(x, y, 2, 2, balls[k]!))
    }
    return out
  },
}

export const actionPoints = (role: Role, beat: number, n: number): Pt[] => ACTIONS[role](beat, n)

function frameOf(idle: Frame, role: Role, beat: number, n: number): Frame {
  const g = Array.from({ length: HEIGHT }, (_, y) => (idle[y] ?? '').padEnd(WIDTH, '.').slice(0, WIDTH).split(''))
  for (const [x, y, ch] of actionPoints(role, beat, n)) {
    const row = g[y]
    if (row && X0 + x < WIDTH) row[X0 + x] = ch
  }
  return g.map(r => r.join(''))
}

const busyHands: CrewTheme = {
  id: 'busy-hands',
  name: 'Busy hands',
  description: 'The mini acts its role out beside itself; the model sets how much each beat makes (1 to 3) and the tempo.',
  size: { columns: WIDTH, rows: HEIGHT },
  keys: BUSY_KEYS,
  fps: TEMPO.haiku,
  mini({ persona, role, model, status, elapsedMs }: CrewMiniInput) {
    const m = modelOf(model)
    const idle = persona.moods.idle.frames[0] ?? []
    const palette = { ...persona.palette, ...PALETTE }
    if (status !== 'running') return { frame: frameOf(idle, role, STILL[role], beatsOf(m)), palette }
    const t = Math.max(0, elapsedMs)
    const n = Math.floor((t * TEMPO[m]) / 1000)
    // Whole ms, rounded up: at t + nextChangeMs the next beat has begun.
    const nextChangeMs = Math.max(1, Math.ceil(((n + 1) * 1000) / TEMPO[m] - t))
    return { frame: frameOf(idle, role, n % BEATS, beatsOf(m)), palette, nextChangeMs }
  },
}

export default busyHands
