// Pixel: a violet cat. Dry and unimpressed, secretly proud.
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

const BASE: Frame = pad([
  '..d........d....',
  '..dd......dd....',
  '..dvd....dvd....',
  '..dvvddddvvd....',
  '..dvvvvvvvvd....',
  '..dvkkvvkkvd....',
  '..dvkwvvkwvd....',
  '..dvvvddvvvd....',
  '...dvvvvvvd..tt.',
  '...dvvvvvvdd.t..',
  '...dvvvvvvvdd..t',
  '...dddvddvdd....',
])
// Tail rows are 9–11 after padding.
const TAILS = [
  { 9: '...dvvvvvvd..tt.', 10: '...dvvvvvvdd.t..', 11: '...dvvvvvvvdd..c' },
  { 9: '...dvvvvvvd.t...', 10: '...dvvvvvvddt...', 11: '...dvvvvvvvdd.c.' },
  { 9: '...dvvvvvvd...tt', 10: '...dvvvvvvdd..t.', 11: '...dvvvvvvvdd.t.' },
  { 9: '...dvvvvvvd..tt.', 10: '...dvvvvvvdd.t.c', 11: '...dvvvvvvvdd...' },
]
const working = [0, 1, 2, 3, 4, 5].map(i => {
  let r = patch(BASE, TAILS[i % 4] as Record<number, string>)
  if (i === 4) r = patch(r, { 6: '..dvvvvvvvvd....', 7: '..dvkkvvkkvd....' })
  if (i === 2) r = patch(r, { 1: '...d.......d....', 2: '..dd......dd....' })
  return r
})

// Eyes in BASE: k/k over k/w at x 4–5 and 8–9, rows 6–7.
const EYES: Pt[] = [[4, 6], [5, 6], [4, 7], [5, 7], [8, 6], [9, 6], [8, 7], [9, 7]]
const noEyes = put(BASE, EYES, 'v')
const closed = put(noEyes, [[4, 7], [5, 7], [8, 7], [9, 7]], 'k')
const smile = put(BASE, [[4, 7], [5, 7], [8, 7], [9, 7]], 'v')

const ZS: Pt[][] = [[[14, 3]], [[14, 2], [15, 1]], [[13, 1], [15, 0]]]
// Curled: eyes shut, tail brought round to the front along row 12, body one row lower.
const noTail = patch(closed, { 9: '...dvvvvvvd.....', 10: '...dvvvvvvdd....', 11: '...dvvvvvvvdd...' })
const sleepyBase = patch(lower(noTail, 10), { 12: '...dddvddvddtttc' })

// Ears flat, eyes narrowed to one column each and pulled toward the middle.
const worriedFace = put(put(patch(noEyes, { 1: E, 2: '..dd......dd....' }), [[5, 6], [8, 6]], 'k'), [[5, 7], [8, 7]], 'w')
const xEyes = put(noEyes, [[4, 6], [5, 7], [9, 6], [8, 7]], 'k')

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[7, 0, 'C'], [14, 1, 'Y'], [1, 2, 'L'], [12, 0, 'C'], [5, 1, 'Y'], [15, 2, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => spark(r, x, y, c), rows)
}
// The board sits on the left, clear of the tail.
const board = (rows: Frame, lift: number): Frame => {
  let r = rows
  const y0 = 7 - lift
  for (const [dy, row] of ['bB', 'BB', 'BB'].entries()) {
    r = spark(spark(r, 0, y0 + dy, row[0] as string), 1, y0 + dy, row[1] as string)
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
const CRY_PATHS: Px[][] = [column(4, 8, 11), column(9, 8, 11)]
const cryBase = (rows: Frame): Frame => rows.map((r, y) => (y === 1 ? '................' : y === 2 ? '..dd......dd....' : r))
const crying = [0, 1, 2, 3, 4, 5].map(n =>
  CRY_PATHS.reduce((f, path) => mark(mark(f, path, 'U'), (path.length >= 4 ? [n % path.length, (n + 3) % path.length] : [n % path.length]).map(i => path[i] as Px), 'T'), cryBase(mark(BASE, [[4, 6], [5, 6], [8, 6], [9, 6]], 'v'))),
)
// Investigating: the tail curls up into a "?" (its pink tip blinks), one ear droops, one eye narrows,
// and the open eye glances aside. Pixel would never scratch its head in public.
const curl = patch(BASE, { 9: '...dvvvvvvd.....', 10: '...dvvvvvvdd....', 11: '...dvvvvvvvdd...' })
const QTAIL: Pt[] = [[13, 5], [14, 5], [15, 6], [15, 7], [14, 8], [14, 9], [13, 10]]
const askTail = (rows: Frame, tip: string): Frame => at(put(rows, QTAIL, 't'), 12, 6, tip)
const doubtful = put(put(curl, [[8, 6], [9, 6]], 'v'), [[8, 7], [9, 7]], 'k')
const droop = (rows: Frame): Frame => patch(rows, { 1: '..d.............', 2: '..dd.......d....' })
const glance = (rows: Frame): Frame => put(put(rows, [[4, 7]], 'w'), [[5, 7]], 'k')
const investigating = [askTail(droop(doubtful), 'c'), askTail(doubtful, 't'), askTail(droop(glance(doubtful)), 'c'), askTail(glance(doubtful), 't')]
// Pleased (a crew member finished): the signature flourish, dry but secretly proud. A smug blink, the
// tail draws a heart that floats off, then Pixel looks away, blushing. Never a hop.
const content = put(put(smile, [[4, 6], [5, 6], [8, 6], [9, 6]], 'v'), [[4, 7], [5, 7], [8, 7], [9, 7]], 'k')
const sideEye = put(put(BASE, [[4, 6], [5, 6], [8, 6], [9, 6], [4, 7], [8, 7]], 'v'), [[5, 7], [9, 7]], 'k')
const blush = (f: Frame): Frame => put(f, [[4, 8], [9, 8]], 'c')
const tailless = (f: Frame): Frame => patch(f, { 9: '...dvvvvvvd.....', 10: '...dvvvvvvdd....', 11: '...dvvvvvvvdd...' })
const body = (f: Frame): Frame => shift(f, -1)
const tailUp = (f: Frame): Frame => put(body(tailless(f)), [[11, 10], [12, 9], [13, 8], [13, 7]], 't')
/** Paints a small block at (x, y) on empty pixels only; '.' in the block is see-through. */
const stamp = (rows: Frame, x: number, y: number, block: readonly string[]): Frame =>
  block.reduce((r, line, dy) => [...line].reduce((rr, ch, dx) => (ch === '.' ? rr : spark(rr, x + dx, y + dy, ch)), r), rows)
const HEART = ['CC.CC', 'CCCCC', '.CCC.', '..C..']
const HEART_S = ['C.C', 'CCC', '.C.']
const pleased = [
  body(smile),
  stamp(tailUp(content), 12, 4, HEART_S),
  stamp(tailUp(blush(content)), 11, 3, HEART),
  stamp(body(blush(content)), 12, 1, HEART_S),
  at(body(blush(sideEye)), 13, 0, 'C'),
  body(blush(smile)),
]

const pixel: Persona = {
  id: 'pixel',
  name: 'Pixel',
  kind: 'cat',
  temperament: 'Dry and unimpressed, secretly proud; says little, means it.',
  palette: {
    T: '#2f7dff', U: '#9fd0ff',
    d: '#4b3a99', v: '#9b7bff', k: '#10121a', w: '#ffffff', t: '#2de2e6', c: '#ff4f8b',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', b: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [BASE, closed], fps: 1 },
    working: { frames: working, fps: 5 },
    happy: { frames: [up(smile), smile, up(smile), smile], fps: 6 },
    tired: { frames: working.slice(0, 4).map(f => put(f, [[4, 6], [5, 6], [8, 6], [9, 6]], 'd')), fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => put(sleepyBase, ZS[n] as Pt[], 'Z')), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => at(worriedFace, 13, 2 + n, 'D')), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: { frames: [0, 1, 2, 3, 4, 5].map(n => confetti(n % 2 ? smile : up(smile), n)), fps: 8 },
    leading: { frames: [0, 1, 0, 1].map(n => board(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, 1].map(n => lens(BASE, n)), fps: 4 },
    crying: { frames: crying, fps: 6 },
    investigating: { frames: investigating, fps: 3 },
    pleased: { frames: pleased, fps: 5 },
  },
  leadStatus: {
    many: 'supervising {n}. Barely.',
    one: 'waiting on {who}',
    reviewing: 'inspecting their work',
    worry: '{who} broke something',
    investigating: 'looking into {who}',
    joy: ['{who} done. Fine.', '{who} are done. Fine.'],
    allDone: ['done. All of it.', 'all {n} done'],
    someFailed: '{d} done, {f} not',
  },
  hatAnchor: { x: 6, y: 4 },
  laptopPaw: 'v',
  voice: {
    happy: ['Done. Obviously.', 'Finished. You may admire me.', 'There. Purrfect, as usual.'],
    worried: ['The budget is getting hairy.', 'Cache is about to go cold. Typical.', 'I am not worried. You should be.'],
    oops: ['That was not my fault.', 'Hiss. Something broke.', 'Knocked it off the table. Oops.'],
    cheering: ['A streak. I suppose that is nice.', 'Days in a row. Fine, I am impressed.', 'Streak. Do not let it go to your head.'],
    sleepy: ['Nap time. Do not disturb.', 'Cache is cold. So am I. Zzz.', 'Wake me for something important.'],
    crying: ['I am not crying. It’s raining.', 'Fine. I’m upset. Happy?', 'Hiss… sniff.'],
    crewDone: ['The crew is done. I checked their work.', 'Review finished. They needed me.', 'All reviewed. You are welcome.'],
  },
}

export default pixel
