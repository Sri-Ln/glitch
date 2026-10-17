// Crew looks, round 2 of issue #41 (mockup only; nothing wires these in yet).
// Six ways to show a crew member's model (Haiku, Sonnet, Opus) and role on the pane mini.
// Gallery-safe: only `import type`, so scripts/crew-looks-mockup.mjs can load it in Node.
//
// Overlay art uses punctuation and digit keys, never letters, so it can be stamped over any
// persona frame. Shipping one of these would reserve every digit (0–9) for crew and laptop art.
import type { Frame, PetId, Role } from './types'

export type Model = 'haiku' | 'sonnet' | 'opus'
export const MODELS: readonly Model[] = ['haiku', 'sonnet', 'opus']
export const LOOK_ROLES: readonly Role[] = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']

/** What an option needs from a persona: its palette, first idle frame and hat anchor. */
export type PetIn = { id: PetId; palette: Readonly<Record<string, string>>; idle: Frame; hatAnchor: { x: number; y: number } }
/** One crew member's look: frames of `width` × `height`, the palette to draw them, and the still to print. */
export type Look = { frames: Frame[]; palette: Record<string, string>; fps: number; still: number; width: number; height: number }
export type LookOption = { id: string; name: string; idea: string; model: string; role: string; animated: boolean; make: (pet: PetIn, role: Role, model: Model) => Look }

// ── Shared overlay palette ─────────────────────────────────────────────────────────────────
export const OV: Record<string, string> = {
  '!': '#12141c', // ink
  '"': '#ffffff',
  '(': '#5e3a1c', // wood
  ')': '#a8743a',
  '{': '#d9a86a',
  '[': '#3e4558', // steel
  ']': '#8d97ad',
  '|': '#d3dae8',
  '<': '#e8483e', // red
  '>': '#ff8a3d', // orange
  '^': '#ffd23f', // yellow
  '+': '#3ddc84', // green
  '~': '#4f8cff', // blue
  '=': '#7fe7ff', // cyan
  '%': '#ff6fb0', // pink
  '&': '#a77bff', // purple
  '?': '#f4ecd8', // paper
  '/': '#a89874', // paper shade, text lines
  ';': '#2fbf6a', // potion
  '$': '#6b7085', // plinth
  '#': '#9aa0b5', // plinth top
  '@': '#464a5a', // plinth shadow
}

/** Role colors for crests and orbiting icons. */
export const ROLE_COLOR: Record<Role, string> = {
  builder: '#ff8a3d',
  researcher: '#2fb8d6',
  designer: '#ff5fa8',
  tester: '#3ecf5a',
  reviewer: '#a77bff',
  other: '#8f9bb8',
}
/** Model colors where one is needed: mint, blue, gold. */
export const MODEL_COLOR: Record<Model, string> = { haiku: '#3fd6a6', sonnet: '#4f8cff', opus: '#ffb020' }
const MODEL_N: Record<Model, number> = { haiku: 1, sonnet: 2, opus: 3 }

// ── Grid helpers ───────────────────────────────────────────────────────────────────────────
type Grid = string[][]
const grid = (w: number, h: number): Grid => Array.from({ length: h }, () => Array(w).fill('.'))
const done = (g: Grid): Frame => g.map(r => r.join(''))
function stamp(g: Grid, art: readonly string[], left: number, top: number): Grid {
  art.forEach((line, dy) => [...line].forEach((ch, dx) => set(g, left + dx, top + dy, ch)))
  return g
}
function set(g: Grid, x: number, y: number, ch: string): void {
  if (ch === '.' || y < 0 || y >= g.length || x < 0 || x >= (g[0] as string[]).length) return
  ;(g[y] as string[])[x] = ch
}
const get = (g: Grid, x: number, y: number): string => g[y]?.[x] ?? '.'
const clone = (g: Grid): Grid => g.map(r => [...r])
/** A 1-px ring of `key` around everything drawn; `dotted` keeps every other ring pixel. */
function ring(g: Grid, key: string, dotted = false): Grid {
  const out = clone(g)
  g.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch !== '.') return
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(g, x + dx!, y + dy!) !== '.')
      if (near && (!dotted || (x + y) % 2 === 0)) (out[y] as string[])[x] = key
    }),
  )
  return out
}
const repeat = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

// ── Pet colors for the species option (O outline, B body, H light, A accent) ──────────────
export const TINT: Record<PetId, { O: string; B: string; H: string; A: string }> = {
  screenhead: { O: '#3b2d99', B: '#7b61ff', H: '#c3b6ff', A: '#39ff88' },
  blob: { O: '#1f6f66', B: '#5ee6d0', H: '#c4fff4', A: '#ff4f8b' },
  pixel: { O: '#4b3a99', B: '#9b7bff', H: '#d2c4ff', A: '#2de2e6' },
  dot: { O: '#1c1a24', B: '#e8352e', H: '#ff8a7e', A: '#ffc93c' },
  fork: { O: '#5b2a86', B: '#c264ff', H: '#f3b3ff', A: '#39ff88' },
  bud: { O: '#3b2a1a', B: '#c98a4b', H: '#f2dcc0', A: '#ff6f91' },
}

// ── Younger pets, hand-drawn in each persona's own keys ────────────────────────────────────
// A junior is 12 × 10; a hatchling 8 × 7 (its last row sinks into the eggshell).
export const JUNIOR: Record<PetId, Frame> = {
  screenhead: ['.....a......', '.....a......', '..ffffffff..', '.ffssssssff.', '.fsggssggsf.', '.fsggssggsf.', '.fssggggssf.', '.ffssssssff.', '..ffffffff..', '...ff..ff...'],
  blob: ['............', '....oooo....', '..oopppPoo..', '.opwppppPpo.', '.oppppppppo.', 'oppeeppeeppo', 'oppeeppeeppo', 'oppppeeppppo', 'oppppppppppo', '.oooooooooo.'],
  pixel: ['.d......d...', '.dd....dd...', '.dvddddvd...', '.dvvvvvvd...', '.dkkvvkkd...', '.dkwvvkwd...', '.dvvddvvd.tt', '..dvvvvd.t..', '..dvvvvd...t', '..dddddd....'],
  dot: ['..k......k..', '...k....k...', '....kkkk....', '...kwkkwk...', '..RRRSSRRR..', '.RrRRSSRRRR.', '.RSSRSSRSSR.', '..RRRSSRRR..', 'PPPPPyyPPPPP', '.PP..GG..PP.'],
  fork: ['...OOOOOO...', '..OooooooO..', '.OoosoosooO.', '.OooooooooO.', '.OoeeooeeoO.', '.OoeeooeeoO.', '.OooooooooO.', '..OooooooO..', '.OoOoOOoOoO.', 'Oo.Oo..oO.oO'],
  bud: ['...KKKKKK...', '.KKbbbbbbKK.', 'KEEbbbbbbEEK', 'KEEbebbebEEK', 'KEEbbccbbEEK', '.KEbcnncbEK.', '..KbcttcbK..', '...KbbbbK...', '...KbccbK...', '...KKKKKK...'],
}
export const HATCHLING: Record<PetId, Frame> = {
  screenhead: ['...a....', '..ffff..', '.fssssf.', '.fgssgf.', '.fsggsf.', '.fssssf.', '..ffff..'],
  blob: ['........', '..oooo..', '.opppPo.', 'opwpppPo', 'opeppepo', 'opeppepo', 'oppeeppo'],
  pixel: ['.d....d.', '.dd..dd.', '.dvddvd.', '.dkvvkd.', '.dvddvd.', '.dvvvvd.', '..dddd..'],
  dot: ['.k....k.', '..kkkk..', '.kwkkwk.', '.RRSSRR.', 'RSRSSRSR', 'RRRSSRRR', '.RRSSRR.'],
  fork: ['..OOOO..', '.OooooO.', 'OosoosoO', 'OooooooO', 'OoeooeoO', 'OoeooeoO', '.OooooO.'],
  bud: ['..KKKK..', '.KbbbbK.', 'KEbbbbEK', 'KEebbeEK', 'KEbnnbEK', '.KcttcK.', '..KKKK..'],
}

// ── Option 1: Growing up at the workbench ─────────────────────────────────────────────────
// Model = the mini's age/size (Haiku hatchling in its shell, Sonnet junior, Opus full-grown).
// Role = the workstation beside it. 25 × 13.
export const STATIONS: Record<Role, readonly string[]> = {
  builder: [
    '.........',
    '..>...>..',
    '....^....',
    '...>.....',
    '|||||||..',
    '.]]]]]]]]',
    '...]]]...',
    '..[[[[[..',
    '.(())))(.',
  ],
  researcher: [
    '.....]]].',
    '....]|..]',
    '....]...]',
    '.....]]].',
    '.~~~~~~]].',
    '.~????~..',
    '..<<<<<<.',
    '..<????<.',
    '.+++++++.',
  ],
  designer: [
    '.(((((((.',
    '.(??%??(.',
    '.(?~~^?(.',
    '.(?++^?(.',
    '.(((((((.',
    '..(.(.(..',
    '..(.(.(..',
    '.(..(..(.',
    '.(..(..(.',
  ],
  tester: [
    '..+......',
    '.]+]..+..',
    '.]+]....',
    '.]+].]+].',
    '.];]]...]',
    '.];]];;;]',
    '.]]]]]]]]',
    '{{{{{{{{{',
    '.(.....(.',
  ],
  reviewer: [
    '...[[[...',
    '.((]]]((.',
    '.(?????(.',
    '.(+?//?(.',
    '.(?????(.',
    '.(+?//?(.',
    '.(?????(.',
    '.(<?//?(.',
    '.(((((((.',
  ],
  other: [
    '.........',
    '...].]...',
    '....].]..',
    '...].]...',
    '.<<<<<<..',
    '.<"<<<<<.',
    '.<"<<<<.<',
    '.<<<<<<<.',
    '..<<<<<..',
  ],
}
const SHELL = ['?.?..?.?', '????????', '/??????/', './/////.']
const AGE_SIZE: Record<Model, [number, number]> = { haiku: [8, 7], sonnet: [12, 10], opus: [16, 13] }

function workbench(pet: PetIn, role: Role, model: Model): Look {
  const [w, h] = AGE_SIZE[model]
  const mini = model === 'opus' ? pet.idle : model === 'sonnet' ? JUNIOR[pet.id] : HATCHLING[pet.id]
  const g = grid(25, 13)
  const left = 16 - w
  stamp(g, mini, left, model === 'haiku' ? 3 : 13 - h)
  if (model === 'haiku') stamp(g, SHELL, left, 9)
  stamp(g, STATIONS[role], 16, 4)
  return { frames: [done(g)], palette: { ...pet.palette, ...OV }, fps: 1, still: 0, width: 25, height: 13 }
}

// ── Option 2: Trophy shelf ────────────────────────────────────────────────────────────────
// Model = the figurine's metal (Haiku bronze, Sonnet silver, Opus gold, with a glint).
// Role = the glyph engraved on its plinth. 16 × 19.
export const GLYPHS: Record<Role, readonly string[]> = {
  builder: ['#####', '#####', '..#..', '..#..', '..#..'],
  researcher: ['###..', '#.#..', '###..', '...#.', '....#'],
  designer: ['...##', '..###', '.##..', '##...', '#....'],
  tester: ['.###.', '..#..', '.###.', '#####', '#####'],
  reviewer: ['....#', '...##', '#.##.', '###..', '.#...'],
  other: ['..#..', '.###.', '#####', '.###.', '..#..'],
}
const METAL: Record<Model, string[]> = {
  haiku: ['#3d2210', '#7a4520', '#b06d38', '#d99a62', '#f3c99a'],
  sonnet: ['#2c3240', '#5d6778', '#959fb0', '#c9d1dd', '#f2f5fa'],
  opus: ['#5a3608', '#9a6212', '#d79a22', '#f5c842', '#fff2a8'],
}
const RAMP = ['0', '5', '8', '9', '`']
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}
/** Recolors a frame into a 5-step ramp by each key's brightness, keeping the pet's contrast. */
export function metalize(frame: Frame, palette: Readonly<Record<string, string>>): Frame {
  const used = [...new Set(frame.join('').replace(/\./g, ''))]
  const ls = used.map(k => lum(palette[k] ?? '#888888'))
  const lo = Math.min(...ls), hi = Math.max(...ls)
  const map: Record<string, string> = {}
  used.forEach((k, i) => (map[k] = RAMP[Math.round(((ls[i]! - lo) / Math.max(1, hi - lo)) * 3.4 + 0.3)]!))
  return frame.map(r => [...r].map(ch => (ch === '.' ? '.' : map[ch])).join(''))
}
const PLINTH = ['.##############.', '..$$$$$$$$$$$$..', '..$$$$$$$$$$$$..', '..$$$$$$$$$$$$..', '..$$$$$$$$$$$$..', '..$$$$$$$$$$$$..', '.@@@@@@@@@@@@@@.']
const GLINT: [number, number][] = [[4, 4], [11, 6], [6, 9], [12, 3]]

function trophy(pet: PetIn, role: Role, model: Model): Look {
  const fig = metalize(pet.idle, pet.palette)
  const base = grid(16, 20)
  stamp(base, fig, 0, 0)
  stamp(base, PLINTH, 0, 13)
  stamp(base, GLYPHS[role].map(r => r.replace(/#/g, '8')), 5, 14)
  const glints = model === 'opus' ? 4 : model === 'sonnet' ? 1 : 0
  const frames = repeat(4, i => {
    const g = clone(base)
    if (i < glints) {
      const [x, y] = GLINT[i]!
      // A 3×3 cross on the figurine only.
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (get(g, x + dx, y + dy) !== '.') set(g, x + dx, y + dy, '"')
    }
    return done(g)
  })
  const pal: Record<string, string> = { ...OV }
  METAL[model].forEach((c, i) => (pal[RAMP[i]!] = c))
  return { frames, palette: pal, fps: 3, still: 0, width: 16, height: 20 }
}

// ── Option 3: Crew species ────────────────────────────────────────────────────────────────
// Role = a companion species drawn in the lead pet's colors (O outline, B body, H light, A accent).
// Model = an aura: Haiku a dotted mint halo, Sonnet a solid blue one, Opus solid gold with sparkles. 16 × 14.
export const SPECIES: Record<Role, { name: string; art: readonly string[] }> = {
  builder: {
    name: 'tinker bot',
    art: [
      '.....A......',
      '.....O......',
      '..OOOOOOOO..',
      '..OHHHHHHO..',
      '..OHEHHEHO..',
      '..OHHEEHHO..',
      '..OOOOOOOO..',
      '.]OBBBBBBO].',
      '.]OBAABBBO]]',
      '..OBBBBBBO|.',
      '..OOOOOOOO..',
      '...OO..OO...',
    ],
  },
  researcher: {
    name: 'bookworm',
    art: [
      '...OOOOOO...',
      '..OBBBBBBO..',
      '.[[[[BB[[[[.',
      '.[E"[BB[E"[.',
      '.[[[[BB[[[[.',
      '..OBBBBBBO..',
      '...OHHHHO...',
      '....OBBO....',
      '?????OO?????',
      '?//?/??/?//?',
      '????????????',
      'AAAAAAAAAAAA',
    ],
  },
  designer: {
    name: 'butterfly',
    art: [
      '...O....O...',
      '....O..O....',
      '.OOO.OO.OOO.',
      'OBBBOEEOBBBO',
      'OB%%BEEB^^BO',
      'OB%%BEEB^^BO',
      'OBBBBEEBBBBO',
      '.OOBBEEBBOO.',
      '.OB=BEEB=BO.',
      'OBB=BEEB=BBO',
      '.OOOOEEOOOO.',
      '............',
    ],
  },
  tester: {
    name: 'lab mouse',
    art: [
      '.OOO....OOO.',
      'O%%%O..O%%%O',
      'O%%BOOOOB%%O',
      '.OBBBBBBBBO.',
      '..OBEBBEBO..',
      '..OBBBBBBO..',
      '...OH%%HO...',
      '....OOOO....',
      '...OBBBBO...',
      '..OBBHHBBO.O',
      '..OBBBBBBOO.',
      '...OO..OO...',
    ],
  },
  reviewer: {
    name: 'owl',
    art: [
      '.O........O.',
      '.OO......OO.',
      '.OBOOOOOOBO.',
      'OBWWWBBWWWBO',
      'OBWEWBBWEWBO',
      'OBWWW^^WWWBO',
      'OBBBBB^BBBBO',
      'OBHHHHHHHHBO',
      'OBHBHHHHBHBO',
      'OBHHHHHHHHBO',
      '.OBHHHHHHBO.',
      '..O^OOOO^O..',
    ],
  },
  other: {
    name: 'sprout',
    art: [
      '........++..',
      '.++....+++..',
      '.+++..+++...',
      '..+++.;+....',
      '.....;;.....',
      '...OOOOOO...',
      '..OBBBBBBO..',
      '.OBHBBBBBBO.',
      '.OBEBBBBEBO.',
      'OBBBBBBBBBBO',
      '.OB%BBBB%BO.',
      '..OOOOOOOO..',
    ],
  },
}
const SPARKS: [number, number][][] = [[[0, 1], [15, 10]], [[15, 2], [1, 12]], [[0, 11], [14, 0]], [[15, 6], [1, 4]]]

function species(pet: PetIn, role: Role, model: Model): Look {
  const t = TINT[pet.id]
  const body = stamp(grid(16, 14), SPECIES[role].art, 2, 1)
  const aura = model === 'haiku' ? ring(body, '1', true) : ring(body, '1')
  const frames = repeat(4, i => {
    const g = clone(aura)
    if (model === 'opus') for (const [x, y] of SPARKS[i]!) set(g, x, y, '2')
    if (model === 'opus') for (const [x, y] of SPARKS[(i + 2) % 4]!) set(g, x, y, '3')
    return done(g)
  })
  const pal = { ...OV, ...t, E: '#10121a', W: '#ffffff', '1': MODEL_COLOR[model], '2': '#ffe066', '3': '#ffb020' }
  return { frames, palette: pal, fps: 4, still: 0, width: 16, height: 14 }
}

// ── Option 4: Busy hands (animated) ───────────────────────────────────────────────────────
// Role = an action loop beside the mini. Model = how much each beat produces (1, 2 or 3 sparks,
// stars, colors, bubbles, stamps or balls) and the tempo (Haiku quick, Opus deliberate). 23 × 13.
type Pt = readonly [number, number]
const X0 = 15
const dots = (g: Grid, pts: readonly Pt[], ch: string, ox = X0): Grid => {
  pts.forEach(([x, y]) => set(g, ox + x, y, ch))
  return g
}
const box = (g: Grid, x: number, y: number, w: number, h: number, ch: string): Grid => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(g, X0 + xx, yy, ch)
  return g
}

const ACTIONS: Record<Role, (g: Grid, i: number, n: number) => void> = {
  builder(g, i, n) {
    box(g, 2, 10, 6, 1, '|'), box(g, 3, 11, 4, 1, ']'), box(g, 2, 12, 6, 1, '[')
    const pose = [0, 1, 2, 1][i]!
    if (pose === 0) dots(g, [[0, 9], [1, 8], [1, 7], [2, 6]], ')'), box(g, 1, 3, 4, 2, ']'), box(g, 1, 4, 4, 1, '[')
    if (pose === 1) dots(g, [[0, 9], [1, 8], [2, 8], [3, 7]], ')'), box(g, 4, 4, 2, 3, ']'), box(g, 5, 4, 1, 3, '[')
    if (pose === 2) {
      dots(g, [[0, 9], [1, 9], [2, 9], [3, 9]], ')'), box(g, 4, 7, 2, 3, ']'), box(g, 5, 7, 1, 3, '[')
      const sp: Pt[][] = [[[7, 8], [6, 6]], [[2, 7], [1, 5]], [[7, 4], [6, 3]]]
      sp.slice(0, n).forEach(([a, b]) => (dots(g, [a!], '>'), dots(g, [b!], '^')))
    }
  },
  researcher(g, i, n) {
    dots(g, [[1, 8], [2, 7], [3, 6], [4, 5], [5, 4], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4]], '~')
    dots(g, [[3, 6], [3, 7]], ']'), dots(g, [[6, 3], [7, 3], [7, 4]], i % 2 ? '"' : '|')
    dots(g, [[3, 9], [2, 10], [2, 11], [1, 12], [4, 9], [4, 10], [4, 11], [4, 12], [5, 9], [6, 10], [6, 11], [7, 12]], '(')
    const stars: Pt[] = [[2, 3], [5, 1], [1, 0]]
    stars.slice(0, n).forEach(([x, y], k) => {
      dots(g, [[x, y]], '^')
      if ((i + k) % 2 === 0) dots(g, ([[x - 1, y], [x + 1, y], [x, y + 1], [x, y - 1]] as Pt[]).filter(([, yy]) => yy >= 0), '>')
    })
  },
  designer(g, i, n) {
    box(g, 2, 1, 6, 1, '('), box(g, 2, 7, 6, 1, '('), box(g, 2, 2, 1, 5, '('), box(g, 7, 2, 1, 5, '(')
    box(g, 3, 2, 4, 5, '?')
    dots(g, [[3, 8], [2, 9], [2, 10], [1, 11], [1, 12], [5, 8], [5, 9], [5, 10], [5, 11], [6, 8], [7, 9], [7, 10], [7, 11], [7, 12]], '(')
    const colors = ['~', '%', '^'].slice(0, n)
    const strokes: Pt[][] = [[[3, 2], [4, 2], [4, 3]], [[5, 3], [6, 3], [6, 4]], [[3, 5], [4, 5], [5, 5], [5, 6]], [[3, 4], [6, 6]]]
    strokes.slice(0, i + 1).forEach((s, k) => dots(g, s, colors[k % colors.length]!))
    const tip: Pt = [[3, 3], [6, 4], [4, 6], [3, 4]][i] as Pt
    dots(g, [[0, 9], [1, 8]], ')'), dots(g, [[tip[0] - 1, tip[1] + 1]], ')'), dots(g, [tip], colors[i % colors.length]!)
  },
  tester(g, i, n) {
    box(g, 3, 8, 1, 4, ']'), box(g, 7, 8, 1, 4, ']'), box(g, 3, 12, 5, 1, ']')
    box(g, 4, 10, 3, 2, ';')
    dots(g, [[0, 7], [1, 6], [2, 5], [1, 4], [2, 3], [3, 4], [3, 5]], ']'), dots(g, [[1, 5], [2, 4]], ';')
    dots(g, [[4, 4 + (i % 4) * 1 + 1]], ';')
    const bub: Pt[] = [[5, 9], [6, 8], [4, 7]]
    bub.slice(0, n).forEach(([x, y], k) => dots(g, [[x, y - ((i + k) % 3) * 2]], '+'))
  },
  reviewer(g, i, n) {
    box(g, 0, 10, 8, 2, '?'), box(g, 0, 12, 8, 1, '/')
    const marks = [0, 3, 6]
    marks.slice(0, n).forEach(x => box(g, x, 10, 2, 2, '<'))
    const down = [0, 2, 3, 1][i]!
    const sx = 3
    dots(g, [[sx + 1, 2 + down]], '('), dots(g, [[sx + 1, 3 + down], [sx + 1, 4 + down]], ')'), box(g, sx, 5 + down, 3, 1, '('), box(g, sx, 6 + down, 3, 1, '<')
  },
  other(g, i, n) {
    const ring8: Pt[] = [[4, 1], [6, 2], [7, 4], [6, 6], [4, 7], [2, 6], [1, 4], [2, 2]]
    const balls = ['<', '^', '~']
    for (let k = 0; k < n; k++) {
      const [x, y] = ring8[(i * 2 + Math.round((k * 8) / n)) % 8]!
      box(g, x, y, 2, 2, balls[k]!)
    }
  },
}
const TEMPO: Record<Model, number> = { haiku: 8, sonnet: 5, opus: 3 }
const STILL: Record<Role, number> = { builder: 2, researcher: 0, designer: 3, tester: 0, reviewer: 2, other: 0 }

function busy(pet: PetIn, role: Role, model: Model): Look {
  const frames = repeat(4, i => {
    const g = stamp(grid(23, 13), pet.idle, 0, 0)
    ACTIONS[role](g, i, MODEL_N[model])
    return done(g)
  })
  return { frames, palette: { ...pet.palette, ...OV }, fps: TEMPO[model], still: STILL[role], width: 23, height: 13 }
}

// ── Option 5: Rank & crest ────────────────────────────────────────────────────────────────
// Role = a heraldic shield in the role's color with its glyph. Model = rank pips above the
// shield (1, 2 or 3 gold pips), like stripes on a sleeve. 22 × 13.
const SHIELD = ['!!!!!!!!!', '!1111111!', '!1111111!', '!1111111!', '!1111111!', '!1111111!', '!1111111!', '.!11111!.', '..!111!..', '...!!!...']
const PIPS: Record<Model, number[]> = { haiku: [3], sonnet: [1, 5], opus: [0, 3, 6] }

function crest(pet: PetIn, role: Role, model: Model): Look {
  const g = stamp(grid(22, 13), pet.idle, 0, 0)
  const sx = 13
  stamp(g, SHIELD, sx, 3)
  stamp(g, GLYPHS[role].map(r => r.replace(/#/g, '"')), sx + 2, 5)
  for (const px of PIPS[model]) stamp(g, ['22', '00'], sx + px, 0)
  return { frames: [done(g)], palette: { ...pet.palette, ...OV, '1': ROLE_COLOR[role], '2': '#ffd34d', '0': '#b86e00' }, fps: 1, still: 0, width: 22, height: 13 }
}

// ── Option 6: Halo orbit (animated) ───────────────────────────────────────────────────────
// Role = the icon circling the mini's head like cartoon dizzy-stars (nuts, magnifiers, paint
// drops, bubbles, ticks, sparkles). Model = how many circle it (1, 2 or 3). 20 × 19.
export const ORBITERS: Record<Role, readonly string[]> = {
  builder: ['.111.', '11111', '11.11', '11111', '.111.'],
  researcher: ['111..', '1.1..', '111..', '...1.', '....1'],
  designer: ['..1..', '.111.', '11111', '11111', '.111.'],
  tester: ['.111.', '1...1', '1.2.1', '1...1', '.111.'],
  reviewer: ['....1', '...11', '1.11.', '111..', '.1...'],
  other: ['..1..', '.111.', '11111', '.111.', '..1..'],
}
const PAINT = ['#ff5fa8', '#4f8cff', '#ffc23d']

function halo(pet: PetIn, role: Role, model: Model): Look {
  const W = 20, H = 19, px = 2, py = 6, steps = 12, n = MODEL_N[model]
  const cx = px + pet.hatAnchor.x + 0.5, cy = py + pet.hatAnchor.y - 2.5
  const frames = repeat(steps, i => {
    const g = grid(W, H)
    const items = repeat(n, k => {
      const a = ((i / steps) + k / n) * Math.PI * 2
      return { x: Math.round(cx + Math.cos(a) * 6.5 - 2.5), y: Math.round(cy + Math.sin(a) * 2 - 2.5), front: Math.sin(a) > 0, k }
    })
    const draw = (it: (typeof items)[number]) =>
      stamp(g, ORBITERS[role].map(r => r.replace(/1/g, role === 'designer' ? String.fromCharCode(53 + it.k) : '1').replace(/2/g, '2')), it.x, it.y)
    items.filter(it => !it.front).forEach(draw)
    stamp(g, pet.idle, px, py)
    items.filter(it => it.front).forEach(draw)
    return done(g)
  })
  const pal: Record<string, string> = { ...pet.palette, ...OV, '1': ROLE_COLOR[role], '2': '#ffffff', '5': PAINT[0]!, '6': PAINT[1]!, '7': PAINT[2]! }
  return { frames, palette: pal, fps: 8, still: 1, width: W, height: H }
}

export const OPTIONS: readonly LookOption[] = [
  { id: 'workbench', name: 'Growing up at the workbench', idea: 'Each helper is the pet at an age that matches its model, standing at its role’s workstation.', model: 'Age and size: Haiku a hatchling still in its shell, Sonnet a junior (12 px), Opus full-grown (16 px).', role: 'A workstation: anvil, books and magnifier, easel, lab bench, clipboard, a mug of coffee for odd jobs.', animated: false, make: workbench },
  { id: 'trophy', name: 'Trophy shelf', idea: 'Helpers are little statues of the pet on a plinth, like trophies on a shelf.', model: 'The metal: Haiku bronze, Sonnet silver, Opus gold (and Opus glints).', role: 'The glyph engraved on the plinth.', animated: true, make: trophy },
  { id: 'species', name: 'Crew species', idea: 'Each role is a different companion animal, drawn in the lead pet’s colors.', model: 'An aura: Haiku dotted mint, Sonnet solid blue, Opus solid gold with sparkles.', role: 'The species: tinker bot, bookworm, butterfly, lab mouse, owl, sprout.', animated: true, make: species },
  { id: 'busy', name: 'Busy hands', idea: 'The mini acts its role out in a short loop beside itself.', model: 'Output per beat (1, 2 or 3 sparks, stars, colors, bubbles, stamps or balls) and tempo (Haiku quick, Opus deliberate).', role: 'The action: hammering, stargazing, painting, pouring, stamping, juggling.', animated: true, make: busy },
  { id: 'crest', name: 'Rank & crest', idea: 'A pixel shield pinned to the mini, with rank pips above it.', model: 'Gold rank pips: 1, 2 or 3.', role: 'The shield’s color and glyph.', animated: false, make: crest },
  { id: 'halo', name: 'Halo orbit', idea: 'Role icons circle the mini’s head like cartoon dizzy-stars.', model: 'How many circle: 1, 2 or 3.', role: 'The icon: nut, magnifier, paint drop, bubble, tick, sparkle.', animated: true, make: halo },
]
