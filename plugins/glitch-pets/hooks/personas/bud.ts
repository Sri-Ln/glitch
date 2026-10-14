// Bud: a brown dog. Eager and loyal; his tail carries his mood.
import type { Frame, Persona } from '../behavior/types'

type Pt = readonly [number, number]
const E = '................'
const patch = (rows: Frame, p: Record<number, string>): Frame => rows.map((r, y) => p[y] ?? r)
const at = (rows: Frame, x: number, y: number, ch: string): Frame =>
  x < 0 || x > 15 ? rows : rows.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r))
const put = (rows: Frame, pts: readonly Pt[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const spark = (rows: Frame, x: number, y: number, ch: string): Frame => (rows[y]?.[x] === '.' ? at(rows, x, y, ch) : rows)
// Bud's head fills the top row, so a hop drops a torso row instead and Bud lands a row shorter.
const up = (rows: Frame, drop: number): Frame => [...rows.filter((_, y) => y !== drop), E]
const lower = (rows: Frame, drop: number): Frame => [E, ...rows.filter((_, y) => y !== drop)]
const shift = (rows: Frame, d: number): Frame => rows.map(r => (d < 0 ? r.slice(1) + '.' : d > 0 ? '.' + r.slice(0, -1) : r))

const BASE: Frame = [
  '....KKKKKKKK....',
  '..KKbbbbbbbbKK..',
  '.KEEbbbbbbbbEEK.',
  '.KEEbebbbbebEEK.',
  '.KEEbbbbbbbbEEK.',
  '.KEEbbccccbbEEK.',
  '..KEbccnnccbEK..',
  '...KbccccccbK...',
  '....KKcttcKK....',
  '...KbbbbbbbbK.K.',
  '...KbcccccbbKK..',
  '...KbKbbbbKbK...',
  '...KKK....KKK...',
]
const working = [0, 1, 2, 3, 4, 5].map(i => {
  let r = BASE
  if (i % 2) r = patch(r, { 8: '....KKcttcKK..K.', 9: '...KbbbbbbbbKK..' })
  if (i % 3 === 1) r = patch(r, { 8: '....KKtttt' + (r[8] as string).slice(10) })
  if (i === 4) r = patch(r, { 2: '.KEEbbbbbbbbK...', 3: '.KEEbebbbbebKE..', 4: '.KEEbbbbbbbbKEE.' })
  return r
})

// Eyes in BASE are the single dark pixels at (5,3) and (10,3).
const EYES: Pt[] = [[5, 3], [10, 3]]
const noEyes = put(BASE, EYES, 'b')
const closed = put(noEyes, [[5, 3], [6, 3], [9, 3], [10, 3]], 'e')
// Happy: each eye becomes a ^ and the tongue lolls out.
const smile = patch(put(noEyes, [[4, 3], [5, 2], [6, 3], [9, 3], [10, 2], [11, 3]], 'e'), { 8: '....KKttttKK....' })
const wag = (rows: Frame): Frame => patch(rows, { 8: '....KKttttKK..K.', 9: '...KbbbbbbbbKK..' })

// Z climbs through the free corner: ears and outline own the usual spots.
const ZS: Pt[][] = [[[15, 3]], [[14, 2], [15, 1]], [[13, 1], [15, 0]]]
const sleepyBase = lower(closed, 10)
// Eyes pulled toward the middle, ears dropped one row (the head rounds off at row 2, ears start at row 3).
const worriedFace = put(patch(noEyes, { 2: '..KKbbbbbbbbKK..', 6: '.KEEbccnnccbEEK.' }), [[6, 3], [9, 3]], 'e')
const xEyes = put(noEyes, [[4, 3], [5, 4], [11, 3], [10, 4]], 'e')

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[1, 0, 'C'], [14, 1, 'Y'], [15, 2, 'L'], [13, 0, 'C'], [0, 1, 'Y'], [3, 0, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => spark(r, x, y, c), rows)
}
// The board sits on the left, clear of the tail. Bud's coat is "b", so the clip is "j" here.
const board = (rows: Frame, lift: number): Frame => {
  let r = rows
  const y0 = 7 - lift
  for (const [dy, row] of ['jB', 'BB', 'BB'].entries()) {
    r = spark(spark(r, 0, y0 + dy, row[0] as string), 1, y0 + dy, row[1] as string)
  }
  return r
}
// A small ring of lens (M) around the left eye, handle (m) running down and to the left.
const lens = (rows: Frame, dx: number): Frame =>
  put(put(rows, [[5, 2], [5, 4], [4, 3], [6, 3]].map(([x, y]) => [x! + dx, y] as Pt), 'M'), [[4 + dx, 4], [3 + dx, 5]], 'm')

// Crying: eyes squeezed shut, a light-blue stream (U) with two dark ripples (T) running down it from each eye. The pet stays still.
type Px = readonly [number, number]
const column = (x: number, from: number, to: number): Px[] => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i] as Px)
const mark = (rows: Frame, pts: readonly Px[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const CRY_PATHS: Px[][] = [column(5, 4, 7), column(10, 4, 7)]
const cryBase = (rows: Frame): Frame => mark(rows, [[7, 8], [8, 8]], 'c')
const crying = [0, 1, 2, 3, 4, 5].map(n =>
  CRY_PATHS.reduce((f, path) => mark(mark(f, path, 'U'), [path[n % path.length] as Px, path[(n + 3) % path.length] as Px], 'T'), cryBase(mark(BASE, [[5, 3], [10, 3]], 'K'))),
)

const bud: Persona = {
  id: 'bud',
  name: 'Bud',
  kind: 'dog',
  temperament: 'Eager and loyal; cheers for everything and wants to go again.',
  palette: {
    T: '#2f7dff', U: '#9fd0ff',
    K: '#3b2a1a', b: '#c98a4b', c: '#f2dcc0', e: '#10121a', n: '#10121a', t: '#ff6f91', E: '#7a4a22',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', j: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [BASE, closed], fps: 1 },
    working: { frames: working, fps: 6 },
    happy: { frames: [up(smile, 10), smile, up(smile, 10), smile], fps: 6 },
    tired: { frames: working.slice(0, 4).map(f => put(put(f, EYES, 'K'), [[5, 4], [10, 4]], 'e')), fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => put(sleepyBase, ZS[n] as Pt[], 'Z')), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => at(worriedFace, 14, n, 'D')), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: {
      frames: [0, 1, 2, 3, 4, 5].map(n => {
        const s = n % 4 < 2 ? wag(smile) : smile
        return confetti(n % 2 ? s : up(s, 10), n)
      }),
      fps: 8,
    },
    leading: { frames: [0, 1, 0, 1].map(n => board(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, -1].map(n => lens(BASE, n)), fps: 4 },
    crying: { frames: crying, fps: 6 },
  },
  hatAnchor: { x: 7, y: 0 },
  voice: {
    happy: ['Done! Again? Again?', 'We did it! Good job, us!', 'Finished! Can we do another?'],
    worried: ['Uh oh, the budget’s almost full!', 'The cache is going away soon!', 'I’m a little nervous, are you?'],
    oops: ['Whoops! I’ll fetch a fix!', 'Uh oh, something broke!', 'Sorry! Let’s try again!'],
    cheering: ['A streak! Best day ever!', 'So many days! Wag wag wag!', 'Streak! You’re the best!'],
    sleepy: ['Curling up for a nap…', 'Zzz… dreaming of fetch…', 'Nap time. Wake me for walkies.'],
    crying: ['Awoo… that went badly.', 'I’m sad… pat me?', 'Whimper… let’s try again?'],
    crewDone: ['The pack is done! I checked them all!', 'Everyone did great! Review done!', 'All checked! Good pack!'],
  },
}

export default bud
