// Byte blob: a squishy teal blob. Bubbly, easily startled, wobbles when worried.
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
  '................',
  '................',
  '......oooo......',
  '....oopppPoo....',
  '...opppppPppo...',
  '..oppwpppppppo..',
  '..oppppppppppo..',
  '.oppeeppppeeppo.',
  '.oppeeppppeeppo.',
  '.opppppeepppppo.',
  '.oppppppppppppo.',
  '..oooooooooooo..',
])
const SQUASH: Frame = pad([
  '................',
  '................',
  '................',
  '................',
  '.....oooooo.....',
  '...oopppppPoo...',
  '..opppwpppppPo..',
  '.oppeeppppeeppo.',
  'oppppeeppeeppppo',
  'opppppppeepppppo',
  'oppppppppppppppo',
  '.oooooooooooooo.',
])
const UP: Frame = pad(['................', '......oooo......', '....oopppPoo....', '...opppppPppo...', '..oppwpppppppo..', '..oppppppppppo..', '.oppeeppppeeppo.', '.oppeeppppeeppo.', '.opppppeepppppo.', '.oppppppppppppo.', '..oooooooooooo..', '................'])
const GLITCH: Frame = patch(UP, { 7: '..oppeeppppeeppo', 8: 'oppeeppppeeppo..' })
const working = [BASE, SQUASH, BASE, UP, GLITCH, UP]

// Eyes in BASE: two 2×2 blocks at x 4–5 and 10–11, rows 8–9.
const EYES: Pt[] = [[4, 8], [5, 8], [4, 9], [5, 9], [10, 8], [11, 8], [10, 9], [11, 9]]
const noEyes = put(BASE, EYES, 'p')
const closed = put(noEyes, [[4, 9], [5, 9], [10, 9], [11, 9]], 'e')
const smile = patch(put(BASE, [[4, 9], [5, 9], [10, 9], [11, 9]], 'p'), { 10: '.oppppeeeeppppo.' })
const lid = (f: Frame, y: number): Frame => patch(f, { [y]: (f[y] as string).replace(/ee/g, 'oo') })

const ZS: Pt[][] = [[[14, 3]], [[14, 2], [15, 1]], [[13, 1], [15, 0]]]
const sleepyBase = lower(closed, 11)
const worriedFace = put(noEyes, [[5, 8], [6, 8], [5, 9], [6, 9], [9, 8], [10, 8], [9, 9], [10, 9]], 'e')
const xEyes = put(noEyes, [[4, 8], [5, 9], [11, 8], [10, 9]], 'e')

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[1, 0, 'C'], [14, 1, 'Y'], [4, 2, 'L'], [12, 0, 'C'], [2, 1, 'Y'], [15, 2, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => spark(r, x, y, c), rows)
}
// The body slides one column left to leave room for the board in columns 14–15.
const board = (rows: Frame, lift: number): Frame => {
  const body = shift(rows, -1)
  let r = body
  const y0 = 8 - lift
  for (const [dy, row] of ['bB', 'BB', 'BB'].entries()) {
    r = spark(spark(r, 14, y0 + dy, row[0] as string), 15, y0 + dy, row[1] as string)
  }
  return r
}
// A ring of lens (M) around the left eye, with its handle (m) running down and to the right.
const lens = (rows: Frame, dx: number): Frame =>
  put(put(rows, [[4, 7], [5, 7], [4, 10], [5, 10], [3, 8], [3, 9], [6, 8], [6, 9]].map(([x, y]) => [x! + dx, y] as Pt), 'M'), [[6 + dx, 10], [7 + dx, 11]], 'm')

const blob: Persona = {
  id: 'blob',
  name: 'Byte blob',
  kind: 'blob',
  temperament: 'Bubbly and easily startled; squeaks with joy, wobbles when worried.',
  palette: {
    o: '#1f6f66', p: '#5ee6d0', P: '#9ff5e6', w: '#ffffff', e: '#10202a',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', b: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [BASE, closed], fps: 1 },
    working: { frames: working, fps: 6 },
    happy: { frames: [up(smile), smile, up(smile), smile], fps: 6 },
    tired: { frames: [lid(BASE, 8), lid(SQUASH, 8), lid(BASE, 8), lid(UP, 7)], fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => put(sleepyBase, ZS[n] as Pt[], 'Z')), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => at(worriedFace, 13, 4 + n, 'D')), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: { frames: [0, 1, 2, 3, 4, 5].map(n => confetti(n % 2 ? smile : up(smile), n)), fps: 8 },
    leading: { frames: [0, 1, 0, 1].map(n => board(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, -1].map(n => lens(BASE, n)), fps: 4 },
  },
  hatAnchor: { x: 7, y: 3 },
  voice: {
    happy: ['Wheee! Done!', 'Bloop! That worked!', 'Squish-tastic, all finished!'],
    worried: ['Eep, budget is getting big!', 'Uh-oh, the cache is almost gone!', 'Wobble wobble, careful now!'],
    oops: ['Splat! Something broke.', 'Eep! That was not supposed to happen.', 'Oof, I wobbled. Trying again?'],
    cheering: ['A streak! Bounce bounce!', 'So many days in a row! Wheee!', 'Streak party! Jiggle time!'],
    sleepy: ['Melting into a nap…', 'Bloop… so sleepy…', 'Puddle mode. Zzz.'],
    crewDone: ['The crew is done! Bloop!', 'Everyone checked! Wheee!', 'Review finished, all squishy-good!'],
  },
}

export default blob
