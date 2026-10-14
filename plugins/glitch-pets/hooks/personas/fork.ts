// Fork: an octopus who runs eight things at once. The organised multitasker, a born lead.
import type { Frame, Persona } from '../behavior/types'

type Pt = readonly [number, number]
const E = '................'
const patch = (rows: Frame, p: Record<number, string>): Frame => rows.map((r, y) => p[y] ?? r)
const at = (rows: Frame, x: number, y: number, ch: string): Frame =>
  x < 0 || x > 15 ? rows : rows.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r))
const put = (rows: Frame, pts: readonly Pt[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const spark = (rows: Frame, x: number, y: number, ch: string): Frame => (rows[y]?.[x] === '.' ? at(rows, x, y, ch) : rows)
const pad = (rows: string[]): Frame => [...Array(13 - rows.length).fill(E), ...rows]
const up = (rows: Frame): Frame => [...rows.slice(1), E]
const lower = (rows: Frame, drop: number): Frame => [E, ...rows.filter((_, y) => y !== drop)]
const shift = (rows: Frame, d: number): Frame => rows.map(r => (d < 0 ? r.slice(1) + '.' : d > 0 ? '.' + r.slice(0, -1) : r))

const HEAD = [
  '.....OOOOOO.....',
  '...OOooooooOO...',
  '..OooooooooooO..',
  '..OoosoooosooO..',
  '..OooooooooooO..',
  '..OoeeooooeeoO..',
  '..OoeeooooeeoO..',
  '..OooooooooooO..',
  '...OooooooooO...',
  '..OoOoOooOoOoO..',
]
const ARMS_A = ['.Oo.Oo.oo.oO.oO.', 'kk..kk.Oo.kk..kk']
const ARMS_B = ['Oo..oO.oo.Oo..oO', 'kk..kk.oO.kk..kk']
const ARMS_C = ['.Oo.oO.oo.Oo.oO.', 'kk..kk..O.kk..kk']
const working = [ARMS_A, ARMS_B, ARMS_C, ARMS_B, ARMS_A, ARMS_C].map((arms, i) => {
  const rows = [...HEAD, ...arms]
  const keys = (rows[11] as string).split('')
  const [a, b] = ([[0, 1], [4, 5], [10, 11], [14, 15]] as const)[i % 4]!
  keys[a] = 'K'
  keys[b] = 'K'
  rows[11] = keys.join('')
  let r = pad(rows)
  if (i === 5) r = patch(r, { 6: '..OooooooooooO..', 7: '..OeeeooooeeeO..' })
  return r
})

// Row 12 is the keyboard. Idle and sleepy drop it and let the arms rest.
const BASE: Frame = pad([...HEAD, ...ARMS_A])
const REST: Frame = patch(BASE, { 12: '.Oo..Oo..oO..oO.' })
// Eyes in BASE: two 2×2 blocks at x 4–5 and 10–11, rows 6–7.
const EYES: Pt[] = [[4, 6], [5, 6], [4, 7], [5, 7], [10, 6], [11, 6], [10, 7], [11, 7]]
const noEyes = (f: Frame): Frame => put(f, EYES, 'o')
const closed = (f: Frame): Frame => put(noEyes(f), [[4, 7], [5, 7], [10, 7], [11, 7]], 'e')
// Happy: top row of each eye kept (a ^), mouth a small U.
const smile = put(put(BASE, [[4, 7], [5, 7], [10, 7], [11, 7]], 'o'), [[5, 8], [10, 8], [6, 9], [7, 9], [8, 9], [9, 9]], 'e')

const ZS: Pt[][] = [[[14, 3]], [[14, 2], [15, 1]], [[13, 1], [15, 0]]]
const sleepyBase = lower(closed(REST), 8)
const worriedFace = put(noEyes(BASE), [[5, 6], [6, 6], [5, 7], [6, 7], [9, 6], [10, 6], [9, 7], [10, 7]], 'e')
const xEyes = put(noEyes(BASE), [[4, 6], [5, 7], [11, 6], [10, 7]], 'e')

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[1, 0, 'C'], [14, 1, 'Y'], [2, 2, 'L'], [12, 0, 'C'], [3, 1, 'Y'], [15, 2, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => spark(r, x, y, c), rows)
}
// The board rests on the right, held up by the right-hand arm (row 11).
const board = (rows: Frame, lift: number): Frame => {
  let r = rows
  const y0 = 8 - lift
  for (const [dy, row] of ['bB', 'BB', 'BB'].entries()) {
    r = spark(spark(r, 14, y0 + dy, row[0] as string), 15, y0 + dy, row[1] as string)
  }
  return r
}
// A ring of lens (M) around the left eye, handle (m) running down and to the left.
const lens = (rows: Frame, dx: number): Frame =>
  put(put(rows, [[4, 5], [5, 5], [4, 8], [5, 8], [3, 6], [3, 7], [6, 6], [6, 7]].map(([x, y]) => [x! + dx, y] as Pt), 'M'), [[3 + dx, 8], [2 + dx, 9]], 'm')

// Crying: eyes squeezed shut, a light-blue stream (U) with two dark ripples (T) running down it from each eye. The pet stays still.
type Px = readonly [number, number]
const column = (x: number, from: number, to: number): Px[] => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i] as Px)
const mark = (rows: Frame, pts: readonly Px[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const CRY_PATHS: Px[][] = [column(4, 8, 10), column(11, 8, 10)]
const cryBase = (rows: Frame): Frame => rows
const crying = [0, 1, 2, 3, 4, 5].map(n =>
  CRY_PATHS.reduce((f, path) => mark(mark(f, path, 'U'), [path[n % path.length] as Px, path[(n + 3) % path.length] as Px], 'T'), cryBase(mark(REST, [[4, 6], [5, 6], [10, 6], [11, 6]], 'o'))),
)

const fork: Persona = {
  id: 'fork',
  name: 'Fork',
  kind: 'octopus',
  temperament: 'The organised multitasker; a born lead who loves a plan.',
  palette: {
    T: '#2f7dff', U: '#9fd0ff',
    O: '#5b2a86', o: '#c264ff', s: '#f3b3ff', e: '#10121a', k: '#3a3f5c', K: '#39ff88',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', b: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [REST, closed(REST)], fps: 1 },
    working: { frames: working, fps: 6 },
    happy: { frames: [up(smile), smile, up(smile), smile], fps: 6 },
    tired: { frames: working.slice(0, 4).map(f => put(f, [[4, 6], [5, 6], [10, 6], [11, 6]], 'O')), fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => put(sleepyBase, ZS[n] as Pt[], 'Z')), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => at(worriedFace, 13, 1 + n, 'D')), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: { frames: [0, 1, 2, 3, 4, 5].map(n => confetti(n % 2 ? smile : up(smile), n)), fps: 8 },
    leading: { frames: [0, 1, 0, 1].map(n => board(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, 1].map(n => lens(BASE, n)), fps: 4 },
    crying: { frames: crying, fps: 6 },
  },
  hatAnchor: { x: 7, y: 1 },
  voice: {
    happy: ['Done! All eight arms agree.', 'Finished, and filed in order.', 'Task complete. Next on the list?'],
    worried: ['Budget at 90%: time to prioritise.', 'The cache expires soon. Plan ahead.', 'Resources are tight. Let’s reorganise.'],
    oops: ['Tangled an arm. Untangling.', 'One thread failed. The others are fine.', 'A hiccup. Rescheduling.'],
    cheering: ['Streak milestone! Eight arms up!', 'Days in a row, perfectly scheduled.', 'Streak achieved. On to the next one.'],
    sleepy: ['All arms at rest.', 'Inking a quiet nap.', 'Off the clock. Zzz.'],
    crying: ['All eight arms need a hug.', 'Too many things went wrong at once.', 'Plan failed. Regrouping… sniff.'],
    crewDone: ['Crew reviewed. Every task accounted for.', 'All helpers checked against the plan.', 'Review done. The plan held up.'],
  },
}

export default fork
