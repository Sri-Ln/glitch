// Screenhead: a tiny CRT bot whose face is its screen. Earnest, literal, a little robotic.
import type { Frame, Persona, RodPose } from '../behavior/types'

const patch = (rows: Frame, p: Record<number, string>): Frame => rows.map((r, y) => p[y] ?? r)
const at = (rows: Frame, x: number, y: number, ch: string): Frame =>
  rows.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r))

// The screen's inner rows are 4–8, columns 3–12.
const BASE: Frame = [
  '.......a........',
  '.......a........',
  '...ffffffffff...',
  '..ffssssssssff..',
  '..fssssssssssf..',
  '..fsggssssggsf..',
  '..fsggssssggsf..',
  '..fssssssssssf..',
  '..fsssgggggssf..',
  '..ffssssssssff..',
  '...ffffffffff...',
  '.....ff..ff.....',
  '....fff..fff....',
]
const face = (rows: Frame, lines: Record<number, string>): Frame =>
  patch(rows, Object.fromEntries(Object.entries(lines).map(([y, inner]) => [Number(y), `..f${inner}f..`])))

const CODE = ['ggg.cccc..', 'gg.cc.ggg.', '....ggggc.', 'ggggg.cc..', '.cc.ggg...', 'ggg.......', 'gg.gggg.cc', '..ccc.gg..']
const working: Frame[] = [0, 1, 2, 3, 4, 5].map(i => {
  let r: Frame = BASE
  const lines: Record<number, string> = {}
  for (let k = 0; k < 5; k++) {
    let line = (CODE[(i + k) % CODE.length] as string).replace(/\./g, 's')
    if (k === 4) line = line.slice(0, 2 + (i % 3) * 2).padEnd(10, 's')
    if (k === 4 && i % 2 === 0) line = line.slice(0, 2 + (i % 3) * 2) + 'w' + line.slice(3 + (i % 3) * 2)
    lines[4 + k] = line
  }
  r = face(r, lines)
  r = at(r, 7, 0, i % 3 === 0 ? 'a' : 'A')
  r = patch(r, i % 2 ? { 12: '....fff...ff....' } : { 12: '....ff...fff....' })
  if (i === 3) r = patch(r, { 6: `.rf${(r[6] as string).slice(3, 13)}fc.` })
  return r
})

const closed = face(BASE, { 5: 'ssssssssss', 6: 'sggssssggs' })
const smile = face(BASE, { 5: 'sggssssggs', 6: 'ssssssssss', 8: 'ssgggggsss' })
const up = (rows: Frame): Frame => [...rows.slice(1), '................']
const down = (rows: Frame): Frame => ['................', ...rows.slice(0, -1)]

const sleepyBase = down(face(BASE, { 5: 'ssssssssss', 6: 'sggssssggs', 8: 'ssssggssss' }))
const zz = (rows: Frame, n: number): Frame =>
  n === 0 ? at(rows, 14, 3, 'Z') : n === 1 ? at(at(rows, 14, 2, 'Z'), 15, 1, 'Z') : at(at(rows, 13, 1, 'Z'), 15, 0, 'Z')

const worriedFace = face(BASE, { 5: 'sssggggsss', 6: 'sssggggsss', 8: 'sssgsgsgss' })
const sweat = (rows: Frame, n: number): Frame => at(rows, 13, 2 + n, 'D')

const xEyes = face(BASE, { 5: 'sgsgssgsgs', 6: 'ssgsssgsss', 8: 'ssssggssss' })
const shift = (rows: Frame, d: number): Frame =>
  rows.map(r => (d < 0 ? r.slice(1) + '.' : d > 0 ? '.' + r.slice(0, -1) : r))

const confetti = (rows: Frame, n: number): Frame => {
  const spots: [number, number, string][] = [[1, 0, 'C'], [14, 1, 'Y'], [4, 2, 'L'], [12, 0, 'C'], [2, 1, 'Y'], [15, 2, 'L']]
  return spots.slice(n % 3, (n % 3) + 3).reduce((r, [x, y, c]) => at(r, x, y, c), rows)
}

const clipboard = (rows: Frame, lift: number): Frame =>
  patch(rows, {
    [7 - lift]: (rows[7 - lift] as string).slice(0, 13) + 'bB.',
    [8 - lift]: (rows[8 - lift] as string).slice(0, 13) + 'BB.',
    [9 - lift]: (rows[9 - lift] as string).slice(0, 13) + 'BB.',
  })
const lens = (rows: Frame, dx: number): Frame => at(at(at(rows, 4 + dx, 5, 'M'), 5 + dx, 6, 'M'), 6 + dx, 7, 'm')

// Crying: eyes squeezed shut, a light-blue stream (U) with two dark ripples (T) running down it from each eye. The pet stays still.
type Px = readonly [number, number]
const column = (x: number, from: number, to: number): Px[] => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i] as Px)
const mark = (rows: Frame, pts: readonly Px[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const CRY_PATHS: Px[][] = [column(4, 7, 9), column(11, 7, 9)]
const cryBase = (rows: Frame): Frame => mark(mark(rows, [[6, 8], [10, 8]], 's'), [[6, 9], [10, 9]], 'g')
const crying = [0, 1, 2, 3, 4, 5].map(n =>
  CRY_PATHS.reduce((f, path) => mark(mark(f, path, 'U'), (path.length >= 4 ? [n % path.length, (n + 3) % path.length] : [n % path.length]).map(i => path[i] as Px), 'T'), cryBase(mark(BASE, [[4, 5], [5, 5], [10, 5], [11, 5]], 's'))),
)

// Investigating: the screen shows a "?", then a cyan scan line sweeps a squinting face (mouth pulled to one side).
const asking = face(BASE, { 4: 'ssssgggsss', 5: 'sssgsssgss', 6: 'sssssggsss', 7: 'ssssssssss', 8: 'sssssgssss' })
const squint = face(BASE, { 4: 'ssssssssss', 5: 'ssssssssss', 6: 'sgggssgggs', 7: 'ssssssssss', 8: 'sssssssggs' })
const scanning = (y: number): Frame => face(squint, { [y]: 'cccccccccc' })
const investigating = [asking, at(asking, 7, 0, 'A'), scanning(4), scanning(7)]
// Pleased (a crew member finished): the signature flourish. Little arms pop out and up, the screen
// reads "OK", the antenna flashes, then a ^ ^ smile with a blush. No hop: that is happy's.
type Pt = readonly [number, number]
const put = (rows: Frame, pts: readonly Pt[], ch: string): Frame => pts.reduce((r, [x, y]) => at(r, x, y, ch), rows)
const beam = face(BASE, { 5: 'sggssssggs', 6: 'ssssssssss', 7: 'ssgssssgss', 8: 'sssggggsss' })
const beamShut = face(beam, { 5: 'ssgssssgss', 6: 'sgsgssgsgs' })
const OK = face(BASE, { 4: 'ssgggsgsgs', 5: 'ssgsgsgsgs', 6: 'ssgsgsggss', 7: 'ssgsgsgsgs', 8: 'ssgggsgsgs' })
const flash = (f: Frame): Frame => at(f, 7, 0, 'A')
const armsOut = (f: Frame): Frame => put(f, [[0, 7], [1, 7], [14, 7], [15, 7]], 'f')
const armsUp = (f: Frame): Frame => put(f, [[1, 7], [0, 6], [0, 5], [14, 7], [15, 6], [15, 5]], 'f')
const blush = (f: Frame): Frame => put(f, [[4, 7], [11, 7]], 'C')
const pleased = [beam, armsOut(OK), flash(armsUp(OK)), armsUp(OK), flash(armsUp(blush(beamShut))), armsOut(blush(beamShut))]

// The fishing rod (the reward): a robotic arm folds out of the screen's right side and grips it.
const rodBase = pleased[5] as Frame
const rodPose = (tip: Pt): RodPose => {
  const arm = put(put(rodBase, [[14, 8], [15, 8]], 'f'), [[14, 9]], 'f')
  const cane = Array.from({ length: 7 - tip[1] }, (_, i) => [15, tip[1] + 1 + i] as Pt)
  return { frame: put(put(put(arm, cane, 'b'), [tip], 'M'), [[15, 9]], 'm'), tip: { x: tip[0], y: tip[1] } }
}

const screenhead: Persona = {
  id: 'screenhead',
  name: 'Screenhead',
  kind: 'screen bot',
  temperament: 'Earnest, literal and a little robotic; reports facts, proud of tidy output.',
  palette: {
    T: '#2f7dff', U: '#9fd0ff',
    a: '#ff4f8b', A: '#ffd1e0', f: '#7b61ff', s: '#161a33', g: '#39ff88', c: '#2de2e6', w: '#ffffff', r: '#ff4f8b',
    Z: '#9aa4d8', D: '#5ab0ff', C: '#ff4f8b', Y: '#ffd23f', L: '#39ff88', B: '#e8e2d0', b: '#7a6a4a', M: '#c9d4ff', m: '#5a5f80',
  },
  moods: {
    idle: { frames: [BASE, closed], fps: 1 },
    working: { frames: working, fps: 6 },
    happy: { frames: [up(smile), smile, up(smile), smile], fps: 6 },
    tired: { frames: working.slice(0, 4).map(f => face(f, { 4: 'ssssssssss' })), fps: 3 },
    sleepy: { frames: [0, 1, 2].map(n => zz(sleepyBase, n)), fps: 1 },
    worried: { frames: [0, 1, 0, 1].map(n => sweat(worriedFace, n)), fps: 4 },
    oops: { frames: [shift(xEyes, -1), shift(xEyes, 1), xEyes], fps: 6 },
    cheering: { frames: [0, 1, 2, 3, 4, 5].map(n => confetti(n % 2 ? smile : up(smile), n)), fps: 8 },
    leading: { frames: [0, 1, 0, 1].map(n => clipboard(BASE, n)), fps: 4 },
    reviewing: { frames: [0, 1, 0, -1].map(n => lens(BASE, n)), fps: 4 },
    crying: { frames: crying, fps: 6 },
    investigating: { frames: investigating, fps: 3 },
    pleased: { frames: pleased, fps: 5 },
  },
  rod: { hold: rodPose([15, 1]), flick: rodPose([15, 2]), bent: rodPose([15, 3]), stowed: rodBase },
  hatAnchor: { x: 7, y: 2 },
  laptopPaw: 'f',
  voice: {
    happy: ['Task complete. Output: tidy.', 'Done. All tests green on my screen.', 'Finished. Logging a small celebration.'],
    worried: ['Budget at 90%. Recommending caution.', 'Cache expires in under a minute.', 'Warning: resources running low.'],
    oops: ['Error detected. Rebooting optimism.', 'That did not compute.', 'Unexpected result. Investigating.'],
    cheering: ['Streak milestone reached. Celebrating.', 'Days in a row: impressive. Saving to memory.', 'Achievement unlocked.'],
    sleepy: ['Entering low-power mode.', 'Screen dimming. Wake me with a prompt.', 'Idle. Defragmenting dreams.'],
    crying: ['Error count critical. Leaking coolant.', 'Sad.exe is running.', 'My screen is fogging up.'],
    crewDone: ['Crew review complete. Report ready.', 'All helpers checked. Results compiled.', 'Review finished. Findings logged.'],
  },
}

export default screenhead
