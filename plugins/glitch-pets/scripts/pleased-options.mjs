// Mockup only (#40, round 2): three brief-joy concepts for the `pleased` mood, for every pet.
// Nothing here is wired: the frames live in this script, not in the persona files or MOOD_IDS.
// Every palette key used is one all six pets already have. Imported by the review page builder;
// run directly it writes a plain review table.
// Usage: node plugins/glitch-pets/scripts/pleased-options.mjs [out.html]
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { frameSvg } from '../hooks/behavior/player.ts'

const IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud']
const raw = {}
for (const id of IDS) raw[id] = (await import(`../hooks/personas/${id}.ts`)).default

const E = '................'
const at = (f, x, y, ch) => (x < 0 || x > 15 || y < 0 || y > 12 ? f : f.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r)))
const put = (f, pts, ch) => pts.reduce((r, [x, y]) => at(r, x, y, ch), f)
const spark = (f, x, y, ch) => (f[y]?.[x] === '.' ? at(f, x, y, ch) : f)
const patch = (f, p) => f.map((r, y) => p[y] ?? r)
/** Paints a mini sprite at (x, y); '.' in it is transparent. `over` paints over the pet too. */
const stamp = (f, x, y, rows, over = false) =>
  rows.reduce((r, row, dy) => [...row].reduce((rr, ch, dx) => (ch === '.' ? rr : over ? at(rr, x + dx, y + dy, ch) : spark(rr, x + dx, y + dy, ch)), r), f)
/** The nod: everything above `drop` sinks one row and row `drop` goes. The opposite of happy's hop. */
const lower = (f, drop) => [E, ...f.filter((_, y) => y !== drop)]
const shift = (f, d) => f.map(r => (d < 0 ? r.slice(1) + '.' : d > 0 ? '.' + r.slice(0, -1) : r))
const shiftRows = (f, from, to, d) => f.map((r, y) => (y >= from && y <= to ? (d < 0 ? r.slice(1) + '.' : '.' + r.slice(0, -1)) : r))

// Shared marks.
const SPARK = [
  ['Y'],
  ['.Y.', 'YBY', '.Y.'],
  ['..Y..', '..Y..', 'YYBYY', '..Y..', '..Y..'],
  ['Y...Y', '.....', '.....', '.....', 'Y...Y'],
]
/** A sparkle of size 0–3 centred on (cx, cy); size 3 is the burst after the big star. */
const sparkle = (f, cx, cy, n) => {
  const s = SPARK[n]
  const h = s.length >> 1
  return stamp(f, cx - h, cy - h, s)
}
const GIFT = ['YCY', 'CCC', 'YCY']
const HEART = ['CC.CC', 'CCCCC', '.CCC.', '..C..']
const HEART_S = ['C.C', 'CCC', '.C.']

// ─── per-pet faces and poses, built on the persona's own frames (Fork's smile is the fixed one) ───
const P = {
  screenhead: (() => {
    const p = raw.screenhead
    const base = p.moods.idle.frames[0]
    const face = (f, lines) => patch(f, Object.fromEntries(Object.entries(lines).map(([y, inner]) => [y, `..f${inner}f..`])))
    const smile = face(base, { 5: 'sggssssggs', 6: 'ssssssssss', 7: 'ssgssssgss', 8: 'sssggggsss' })
    const squint = face(smile, { 5: 'ssgssssgss', 6: 'sgsgssgsgs' })
    const OK = face(base, { 4: 'ssgggsgsgs', 5: 'ssgsgsgsgs', 6: 'ssgsgsggss', 7: 'ssgsgsgsgs', 8: 'ssgggsgsgs' })
    const plus1 = face(base, { 4: 'sssssssgss', 5: 'sssgssggss', 6: 'ssgggssgss', 7: 'sssgsssgss', 8: 'ssssssgggs' })
    const blink = f => at(f, 7, 0, 'A')
    const armsOut = f => put(f, [[0, 7], [1, 7], [14, 7], [15, 7]], 'f')
    const armsUp = f => put(f, [[1, 7], [0, 6], [0, 5], [14, 7], [15, 6], [15, 5]], 'f')
    const blush = f => put(f, [[4, 7], [11, 7]], 'C')
    return { p, base, face, smile, squint, OK, plus1, blink, armsOut, armsUp, blush, nod: f => lower(f, 12) }
  })(),
  blob: (() => {
    const p = raw.blob
    const squash = p.moods.working.frames[1]
    const smile = p.moods.happy.frames[1]
    const squint = put(put(smile, [[4, 9], [5, 9], [10, 9], [11, 9]], 'p'), [[4, 9], [5, 8], [6, 9], [9, 9], [10, 8], [11, 9]], 'e')
    const squashSmile = patch(put(squash, [[5, 9], [6, 9], [9, 9], [10, 9]], 'p'), { 10: 'opppppeeeepppppo' })
    const blush = f => put(f, [[3, 10], [12, 10]], 'C')
    const arms = f => put(f, [[1, 7], [0, 6], [0, 5], [14, 7], [15, 6], [15, 5]], 'p')
    return { p, smile, squint, squashSmile, blush, arms, nod: f => lower(f, 11) }
  })(),
  pixel: (() => {
    const p = raw.pixel
    const base = p.moods.idle.frames[0]
    // Smug: one dark line per eye (Pixel's own happy face). Content: eyes closed, lids low.
    const smug = p.moods.happy.frames[1]
    const content = put(put(smug, [[4, 6], [5, 6], [8, 6], [9, 6]], 'v'), [[4, 7], [5, 7], [8, 7], [9, 7]], 'k')
    const glance = put(put(base, [[4, 6], [5, 6], [8, 6], [9, 6], [4, 7], [8, 7]], 'v'), [[5, 7], [9, 7]], 'k')
    const blush = f => put(f, [[4, 8], [9, 8]], 'c')
    const noTail = f => patch(f, { 9: '...dvvvvvvd.....', 10: '...dvvvvvvdd....', 11: '...dvvvvvvvdd...' })
    return { p, smug, content, glance, blush, noTail, nod: f => lower(f, 10) }
  })(),
  dot: (() => {
    const p = raw.dot
    const smile = p.moods.happy.frames[1]
    const WINGS = p.moods.happy.frames[0].slice(3, 9)
    const wings = f => patch(f, Object.fromEntries(WINGS.map((r, i) => [4 + i, r])))
    const squint = put(smile, [[6, 3], [9, 3]], 'k')
    const blush = f => put(f, [[5, 3], [10, 3]], 'r')
    return { p, smile, squint, wings, blush, nod: f => lower(f, 9) }
  })(),
  fork: (() => {
    const p = raw.fork
    const smile = p.moods.pleased.frames[0]
    const squint = put(put(smile, [[4, 6], [5, 6], [10, 6], [11, 6]], 'o'), [[4, 7], [5, 6], [6, 7], [9, 7], [10, 6], [11, 7]], 'e')
    const blush = f => put(f, [[3, 8], [12, 8]], 'C')
    return { p, smile, squint, blush, nod: f => lower(f, 5) }
  })(),
  bud: (() => {
    const p = raw.bud
    const base = p.moods.idle.frames[0]
    const smile = p.moods.happy.frames[1]
    // His own tail is one dark pixel; the mockup draws it 3 long in coat colour so the wag carries.
    const TAILS = [[[13, 8], [14, 7], [15, 6]], [[13, 9], [14, 9], [15, 8]], [[13, 10], [14, 11], [15, 11]]]
    const tail = (f, n) => put(put(f, [[14, 8], [14, 9]].filter(([x, y]) => f[y][x] === 'K'), '.'), TAILS[n], 'b')
    const blush = f => put(f, [[4, 4], [11, 4]], 't')
    // Ears perk: lifted a row and pulled in, tips up.
    const perk = f => patch(f, { 0: '.KK.KKKKKKKK.KK.', 1: '.KEK' + f[1].slice(4, 12) + 'KEK.', 4: '..KE' + f[4].slice(4, 12) + 'EK..', 5: '...K' + f[5].slice(4, 12) + 'K...', 6: '...K' + f[6].slice(4, 12) + 'K...' })
    return { p, base, smile, tail, blush, perk, nod: f => lower(f, 10) }
  })(),
}

// ─── Concept A: a satisfied nod and a sparkle burst (the same beat for every pet) ───
const nodSpark = ({ open, shut, nod, cx, cy }) => [
  open,
  sparkle(nod(shut), cx, cy, 0),
  sparkle(open, cx, cy, 1),
  sparkle(nod(shut), cx, cy, 2),
  sparkle(open, cx, cy, 3),
  open,
]
const A = {
  screenhead: (() => { const s = P.screenhead; return nodSpark({ open: s.blush(s.smile), shut: s.blush(s.squint), nod: s.nod, cx: 14, cy: 2 }) })(),
  blob: (() => { const s = P.blob; return nodSpark({ open: s.blush(s.smile), shut: s.blush(s.squint), nod: s.nod, cx: 13, cy: 2 }) })(),
  pixel: (() => { const s = P.pixel; return nodSpark({ open: s.blush(s.smug), shut: s.blush(s.content), nod: s.nod, cx: 13, cy: 3 }) })(),
  dot: (() => { const s = P.dot; return nodSpark({ open: s.blush(s.smile), shut: s.blush(s.squint), nod: s.nod, cx: 13, cy: 3 }) })(),
  fork: (() => { const s = P.fork; return nodSpark({ open: s.blush(s.smile), shut: s.blush(s.squint), nod: s.nod, cx: 13, cy: 2 }) })(),
  // Bud fills his grid, so his sparkle goes in the one clear corner, beside his chest.
  bud: (() => { const s = P.bud; return nodSpark({ open: s.blush(s.smile), shut: s.blush(s.smile), nod: s.nod, cx: 1, cy: 9 }).map((f, i) => s.tail(f, i % 2 ? 0 : 2)) })(),
}

// ─── Concept B: a signature flourish, one per personality ───
const B = {
  // Earnest robot: little arms pop out and up, the screen reads "OK", the antenna flashes, then a ^ ^ smile.
  screenhead: (() => {
    const s = P.screenhead
    return [s.smile, s.armsOut(s.OK), s.blink(s.armsUp(s.OK)), s.armsUp(s.OK), s.blink(s.armsUp(s.blush(s.squint))), s.armsOut(s.blush(s.squint))]
  })(),
  // Bubbly: squish, spring back with stubby arms up, and bubbles fizz up and pop.
  blob: (() => {
    const s = P.blob
    const bub = (f, n) => [[0, 4 - n], [12, 3 - n], [7, 2 - n]].reduce((r, [x, y], i) => (i < 2 ? stamp(r, x, y, ['.U.', 'U.U', '.U.']) : spark(r, x, y, 'U')), f)
    return [s.smile, s.blush(s.squashSmile), bub(s.arms(s.blush(s.squint)), 0), bub(s.arms(s.blush(s.squint)), 1), bub(s.blush(s.squashSmile), 2), sparkle(s.arms(s.blush(s.smile)), 13, 1, 3)]
  })(),
  // Dry, secretly proud: a smug blink, the tail draws a heart that floats off, then it looks away, blushing.
  pixel: (() => {
    const s = P.pixel
    const body = f => shift(f, -1)
    const tailUp = f => put(body(s.noTail(f)), [[11, 10], [12, 9], [13, 8], [13, 7]], 't')
    return [
      body(s.smug),
      stamp(tailUp(s.content), 12, 4, HEART_S),
      stamp(tailUp(s.blush(s.content)), 11, 3, HEART),
      stamp(body(s.blush(s.content)), 12, 1, HEART_S),
      at(body(s.blush(s.glance)), 13, 0, 'C'),
      body(s.blush(s.smug)),
    ]
  })(),
  // Tidy cheerleader: her antennae become pom-poms and wave, wings flutter, a pink smile.
  dot: (() => {
    const s = P.dot
    const high = f => patch(f, { 0: '..YY........YY..', 1: '..YYkk....kkYY..' })
    const out = f => patch(f, { 0: E, 1: 'YY............YY', 2: 'YYkkk.kkkk.kkkYY' })
    return [s.smile, high(s.blush(s.smile)), out(s.wings(s.blush(s.squint))), high(s.blush(s.squint)), out(s.wings(s.blush(s.smile))), high(s.smile)]
  })(),
  // Organised multitasker: juggles three coloured balls over its head, the outer arms taking turns.
  fork: (() => {
    const s = P.fork
    const PATH = [[0, 7], [0, 3], [3, 0], [11, 0], [14, 3], [14, 7]]
    const base = s.nod(s.blush(s.smile))
    const leftUp = f => put(f, [[0, 11], [0, 10], [1, 9]], 'o')
    const rightUp = f => put(f, [[15, 11], [15, 10], [14, 9]], 'o')
    return [0, 1, 2, 3, 4, 5].map(n => {
      let f = n % 2 ? rightUp(base) : leftUp(base)
      for (const [k, c] of [[0, 'C'], [2, 'Y'], [4, 'L']]) {
        const [x, y] = PATH[(n + k) % 6]
        f = stamp(f, x, y, [c + c, c + c], true)
      }
      return f
    })
  })(),
  // Eager and loyal: the whole dog wiggles side to side, back end the other way, tail going like a propeller.
  bud: (() => {
    const s = P.bud
    const happy = s.blush(s.smile)
    const wiggle = (d, n) => shiftRows(shift(s.tail(happy, n), d), 9, 12, -d)
    return [s.tail(s.smile, 1), wiggle(-1, 0), wiggle(1, 2), wiggle(-1, 0), wiggle(1, 2), s.tail(happy, 1)]
  })(),
}

// ─── Concept C: a little parcel arrives from the crew and is caught ───
const C = {
  // The parcel drops into the screen like a download; the screen reads "+1", arms up.
  screenhead: (() => {
    const s = P.screenhead
    return [
      stamp(s.base, 13, 0, GIFT),
      stamp(s.base, 10, 4, GIFT, true),
      s.armsUp(s.plus1),
      s.blink(s.armsUp(s.plus1)),
      s.armsOut(s.blush(s.squint)),
      s.blink(s.blush(s.squint)),
    ]
  })(),
  // Swallows the parcel whole with a squish; it shows through the jelly, a sparkle as it settles.
  blob: (() => {
    const s = P.blob
    return [
      stamp(s.smile, 7, 0, GIFT),
      stamp(s.smile, 7, 1, GIFT),
      stamp(s.blush(s.squashSmile), 7, 1, GIFT),
      stamp(s.blush(s.squint), 7, 4, GIFT, true),
      sparkle(stamp(s.blush(s.squint), 7, 5, GIFT, true), 13, 2, 1),
      sparkle(stamp(s.blush(s.smile), 7, 5, GIFT, true), 13, 2, 3),
    ]
  })(),
  // It lands beside Pixel, who rests one paw on it as if it had been Pixel's idea all along.
  pixel: (() => {
    const s = P.pixel
    // One white-mittened paw laid on top of the parcel.
    const paw = f => put(put(put(f, [[12, 7], [13, 7], [14, 7], [15, 8]], 'd'), [[12, 8]], 'v'), [[13, 8], [14, 8]], 'w')
    const by = (f, y) => stamp(s.noTail(f), 13, y, GIFT, true)
    return [by(s.smug, 1), by(s.smug, 5), by(s.content, 9), paw(by(s.content, 9)), paw(by(s.blush(s.content), 9)), paw(by(s.blush(s.smug), 9))]
  })(),
  // It floats down beside her; she sets it neatly on her petal, wings out, and gives it a twinkle.
  dot: (() => {
    const s = P.dot
    return [
      stamp(s.smile, 13, 0, GIFT),
      stamp(s.smile, 13, 3, GIFT),
      stamp(s.blush(s.squint), 13, 7, GIFT, true),
      stamp(s.wings(s.blush(s.squint)), 13, 7, GIFT, true),
      stamp(s.blush(s.smile), 13, 7, GIFT, true),
      sparkle(stamp(s.blush(s.smile), 13, 7, GIFT, true), 14, 4, 1),
    ]
  })(),
  // One arm catches it, it is passed across to another, and Fork holds it up, sorted.
  fork: (() => {
    const s = P.fork
    const leftUp = f => put(f, [[0, 10], [0, 9], [0, 8], [0, 7]], 'o')
    const rightUp = f => put(f, [[15, 10], [15, 9], [15, 8], [15, 7]], 'o')
    return [
      stamp(s.smile, 0, 0, GIFT),
      stamp(leftUp(s.smile), 0, 4, GIFT, true),
      stamp(s.nod(s.blush(s.squint)), 6, 0, GIFT, true),
      stamp(rightUp(s.blush(s.squint)), 13, 4, GIFT, true),
      sparkle(stamp(rightUp(s.blush(s.smile)), 13, 4, GIFT, true), 14, 1, 1),
      sparkle(stamp(rightUp(s.blush(s.smile)), 13, 4, GIFT, true), 14, 1, 3),
    ]
  })(),
  // Fetch: a ball arcs in and he snaps it out of the air, ears up, tail going.
  bud: (() => {
    const s = P.bud
    const BALL = ['YY', 'YY']
    const mouthBall = f => stamp(f, 7, 7, BALL, true)
    return [
      s.tail(stamp(s.base, 0, 0, BALL), 1),
      s.tail(stamp(s.perk(s.base), 0, 7, BALL), 1),
      s.tail(mouthBall(s.perk(s.smile)), 0),
      s.tail(mouthBall(s.perk(s.blush(s.smile))), 2),
      s.tail(mouthBall(s.blush(s.smile)), 0),
      s.tail(mouthBall(s.blush(s.smile)), 2),
    ]
  })(),
}

export const CONCEPTS = [
  { id: 'A', name: 'Nod and sparkle', fps: 5, art: A,
    blurb: 'A satisfied nod (down, never up: up is happy’s hop), a happy squint and blush, and one sparkle that grows into a star and bursts.' },
  { id: 'B', name: 'Signature flourish', fps: 5, art: B,
    blurb: 'One gesture each, in character: Screenhead’s arms pop up and the screen says OK; Byte blob squishes and fizzes bubbles; Pixel’s tail draws a heart, then it looks away blushing; Dot waves pom-pom antennae; Fork juggles; Bud perks his ears and wiggles his whole back end.' },
  { id: 'C', name: 'Parcel from the crew', fps: 5, art: C,
    blurb: 'A small gift drops in from the helper and the pet takes it its own way: downloaded into the screen as “+1”, swallowed into the jelly, claimed with one paw, set down neatly on a petal, caught and passed across arms, snapped out of the air like a ball.' },
]
export const PETS = IDS.map(id => ({ id, name: raw[id].name, palette: raw[id].palette, happy: raw[id].moods.happy, pleased: raw[id].moods.pleased }))

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] ?? '.superpowers/gallery/pleased-options.html')
  const anim = (pal, frames, fps, px) => `<div class="anim" data-fps="${fps}">${frames.map((f, i) => `<span${i ? ' hidden' : ''}>${frameSvg(pal, f, px)}</span>`).join('')}</div>`
  const strip = (pal, frames) => frames.map(f => frameSvg(pal, f, 3)).join('')
  const rows = PETS.map(p => `<tr><th>${p.name}</th><td>${anim(p.palette, p.happy.frames, p.happy.fps, 3)}${anim(p.palette, p.happy.frames, p.happy.fps, 1.5)}</td>${CONCEPTS.map(c => `<td><div class="pair">${anim(p.palette, c.art[p.id], c.fps, 3)}${anim(p.palette, c.art[p.id], c.fps, 1.5)}</div><div class="strip">${strip(p.palette, c.art[p.id])}</div></td>`).join('')}</tr>`).join('\n')
  writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Pleased options</title><style>body{font:13px system-ui;background:#14161f;color:#e8ebff;margin:16px}td,th{border:1px solid #333;padding:8px;vertical-align:bottom}.pair{display:flex;gap:12px;align-items:flex-end}.strip{display:flex;gap:4px;margin-top:6px}</style>
<table><tr><th></th><th>happy (for contrast)</th>${CONCEPTS.map(c => `<th>${c.id}. ${c.name}</th>`).join('')}</tr>${rows}</table>
<script>for(const a of document.querySelectorAll('.anim')){const s=[...a.children];let i=0;setInterval(()=>{s[i].hidden=true;i=(i+1)%s.length;s[i].hidden=false},1000/Number(a.dataset.fps))}</script>`)
  console.log(`pleased options → ${out}`)
}
