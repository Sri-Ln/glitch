// Dot: a ladybug who sits on a daisy. Tidy, gentle, encouraging.
import type { Frame, Persona } from '../behavior/types'

type Pt = readonly [number, number]
const E = '................'
const patch = (rows: Frame, p: Record<number, string>): Frame => rows.map((r, y) => p[y] ?? r)
const at = (rows: Frame, x: number, y: number, ch: string): Frame =>
  x < 0 || x > 15 ? rows : rows.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r))
const put = (rows: Frame, pts: readonly Pt[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const spark = (rows: Frame, x: number, y: number, ch: string): Frame => (rows[y]?.[x] === '.' ? at(rows, x, y, ch) : rows)
const lower = (rows: Frame, drop: number): Frame => [E, ...rows.filter((_, y) => y !== drop)]
const shift = (rows: Frame, d: number): Frame => rows.map(r => (d < 0 ? r.slice(1) + '.' : d > 0 ? '.' + r.slice(0, -1) : r))

const BASE: Frame = [
  '....k......k....',
  '.....k....k.....',
  '......kkkk......',
  '.....kwkkwk.....',
  '....RRRSSRRR....',
  '...RrRRSSRRRR...',
  '..RRSSRSSRSSRR..',
  '..RRSSRSSRSSRR..',
  '...RRRRSSRRRR...',
  '....RRRSSRRR....',
  '.PPPPPyyyyPPPPP.',
  '..PPP..GG..PPP..',
  '.......GG.gg....',
]
const WINGS = { 4: '...RRR.WW.RRR...', 5: '..RrRRWWWWRRRR..', 6: '.RRSSRWWWWRSSRR.', 7: '.RRSSRWWWWRSSRR.', 8: '..RRRRWWWWRRRR..', 9: '...RRR.WW.RRR...' }
const ANT_UP = { 0: '...k........k...', 1: '....k......k....' }
const SWAY = { 10: 'PPPPPyyyyPPPPP..', 11: '.PPP..GG..PPP...' }
const working = [0, 1, 2, 3, 4, 5].map(i => {
  let r = BASE
  if (i === 2 || i === 3) r = patch(r, WINGS)
  if (i % 2) r = patch(r, ANT_UP)
  if (i === 5) r = patch(r, SWAY)
  return r
})

// Eyes are the single white pixels at (6,3) and (9,3). Rows 10–12 are the daisy.
const EYES: Pt[] = [[6, 3], [9, 3]]
const closed = put(BASE, EYES, 'k')
// Happy: a pink smile between the eyes and wings open; the hop lifts Dot one row off the daisy.
const smile = put(BASE, [[7, 3], [8, 3]], 'r')
const wingsOpen = (rows: Frame): Frame => patch(rows, WINGS)
const hop = (rows: Frame): Frame => [...rows.slice(1, 10), E, ...rows.slice(10)]

const ZS: Pt[][] = [[[14, 3]], [[14, 2], [15, 1]], [[13, 1], [15, 0]]]
const sleepyBase = lower(closed, 9)
// Worried eyes grow tall (a second white pixel above each) and the antennae hang low.
const worriedFace = put(patch(BASE, { 0: E, 1: '....k......k....' }), [[6, 2], [9, 2]], 'w')
// x-eyes: a 2×2 diagonal each, mirrored, running from the head onto the shoulders.
const xEyes = put(put(BASE, EYES, 'k'), [[5, 3], [6, 4], [10, 3], [9, 4]], 'w')

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[1, 0, 'C'], [14, 1, 'Y'], [7, 0, 'L'], [13, 2, 'C'], [8, 1, 'Y'], [2, 2, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => spark(r, x, y, c), rows)
}
const board = (rows: Frame, lift: number): Frame => {
  let r = rows
  const y0 = 6 - lift
  for (const [dy, row] of ['bB', 'BB', 'BB'].entries()) {
    r = spark(spark(r, 14, y0 + dy, row[0] as string), 15, y0 + dy, row[1] as string)
  }
  return r
}
// A small ring of lens (M) around the left eye, handle (m) running down and to the right.
const lens = (rows: Frame, dx: number): Frame =>
  put(put(rows, [[6, 2], [6, 4], [5, 3], [7, 3]].map(([x, y]) => [x! + dx, y] as Pt), 'M'), [[7 + dx, 4], [8 + dx, 5]], 'm')

// Crying: eyes squeezed shut, a light-blue stream (U) with two dark ripples (T) running down it from each eye. The pet stays still.
type Px = readonly [number, number]
const column = (x: number, from: number, to: number): Px[] => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i] as Px)
const mark = (rows: Frame, pts: readonly Px[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const CRY_PATHS: Px[][] = [
  [[6, 2], [5, 1], [4, 1], [3, 2], [2, 3], [1, 4], [1, 5], [0, 6], [0, 7], [0, 8]],
  [[9, 2], [10, 1], [11, 1], [12, 2], [13, 3], [14, 4], [14, 5], [15, 6], [15, 7], [15, 8]],
]
const cryBase = (rows: Frame): Frame => rows.map((r, y) => (y < 2 ? '................' : r))
const crying = [0, 1, 2, 3, 4, 5].map(n =>
  CRY_PATHS.reduce((f, path) => mark(mark(f, path, 'U'), [path[n % path.length] as Px, path[(n + 3) % path.length] as Px], 'T'), cryBase(mark(BASE, [[6, 3], [9, 3]], 'k'))),
)

const dot: Persona = {
  id: 'dot',
  name: 'Dot',
  kind: 'ladybug',
  temperament: 'Tidy, gentle and encouraging; notices the small things.',
  palette: {
    T: '#2f7dff', U: '#9fd0ff',
    k: '#4a4a60', S: '#1c1a24', w: '#ffffff', R: '#e8352e', r: '#ff8a7e', W: '#cfe8ff', P: '#fff3f8', y: '#ffc93c', G: '#3ddc84', g: '#2fa866',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', b: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [BASE, closed], fps: 1 },
    working: { frames: working, fps: 5 },
    happy: { frames: [hop(wingsOpen(smile)), smile, hop(wingsOpen(smile)), smile], fps: 6 },
    tired: { frames: working.slice(0, 4).map(f => put(f, EYES, 'k')), fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => put(sleepyBase, ZS[n] as Pt[], 'Z')), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => at(worriedFace, 12, 2 + n, 'D')), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: { frames: [0, 1, 2, 3, 4, 5].map(n => confetti(n % 2 ? wingsOpen(smile) : hop(wingsOpen(smile)), n)), fps: 8 },
    leading: { frames: [0, 1, 0, 1].map(n => board(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, -1].map(n => lens(BASE, n)), fps: 4 },
    crying: { frames: crying, fps: 6 },
  },
  hatAnchor: { x: 7, y: 2 },
  voice: {
    happy: ['All done, nicely done!', 'Finished, and so neat!', 'Lovely work, all wrapped up.'],
    worried: ['The budget is nearly full, careful.', 'The cache is almost out, just so you know.', 'Let’s slow down a little, okay?'],
    oops: ['Oh dear, a little bump.', 'Something slipped. We can fix it.', 'Oops! Let’s tidy that up.'],
    cheering: ['A streak! You keep showing up!', 'So many days in a row, well done!', 'Look at that streak bloom!'],
    sleepy: ['Resting on my flower…', 'Folding my wings for a nap.', 'Quiet time. Zzz.'],
    crying: ['Oh no… it’s okay, we’ll try again.', 'A little cry, then back to it.', 'Sniff… my petals are wet.'],
    crewDone: ['The crew’s work is checked and tidy.', 'Review done, every corner looked at.', 'All reviewed, neat as a pin.'],
  },
}

export default dot
