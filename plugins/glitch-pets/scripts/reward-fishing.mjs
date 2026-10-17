// Mockup only (#40, round 3): the lead's signature flourish (round 2's B), then it casts a fishing line
// down the crew pane and lowers a small gift to the member that just finished. Nothing here is wired:
// the rod poses, gift and scene live in this script, not in the persona files or MOOD_IDS.
// Usage: node plugins/glitch-pets/scripts/reward-fishing.mjs [out.html] [strip-dir]
//   out.html   the animated review page (pet picker, row-depth picker, replay, reduced-motion strip)
//   strip-dir  if given, one SVG frame strip per pet is written there (rasterise them with ImageMagick)
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { withHat } from '../hooks/behavior/hats.ts'
import { CONCEPTS, PETS } from './pleased-options.mjs'

const raw = {}
for (const { id } of PETS) raw[id] = (await import(`../hooks/personas/${id}.ts`)).default
const B = CONCEPTS.find(c => c.id === 'B').art

const at = (f, x, y, ch) => (x < 0 || x > 15 || y < 0 || y > f.length - 1 ? f : f.map((r, yy) => (yy === y ? r.slice(0, x) + ch + r.slice(x + 1) : r)))
const put = (f, pts, ch) => pts.reduce((r, [x, y]) => at(r, x, y, ch), f)
const clear = (f, ch, rows = [0, 12]) => f.map((r, y) => (y >= rows[0] && y <= rows[1] ? r.replaceAll(ch, '.') : r))
const col = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i])

// ─── The rod, per pet. Each pose returns a frame and the rod tip (grid x, y) the line hangs from. ───
// Rod: brown cane ('b'), a light tip ('M'), a grey reel ('m'); Bud's is a cream cane ('B') with a grey tip, so it
// shows against his coat. All are keys the pets already have.
// Three poses: hold (rod up, straight), flick (the cast: tip snaps back a pixel), bent (a gift on the line).
const ROD = {
  // A robotic arm folds out of the right side of the screen and grips the rod; the left arm still waves.
  screenhead: (() => {
    const base = B.screenhead[5]
    const arm = f => put(put(f, [[14, 8], [15, 8]], 'f'), [[14, 9]], 'f')
    const rod = (f, tip) => put(put(put(arm(f), col(15, tip[1] + 1, 7), 'b'), [tip], 'M'), [[15, 9]], 'm')
    return { base, pose: tip => ({ frame: rod(base, tip), tip }), tips: { hold: [15, 1], flick: [15, 2], bent: [15, 3] } }
  })(),
  // A pseudopod stretches up from the jelly and wraps the rod; the other stubby arm stays up.
  blob: (() => {
    const base = put(clear(B.blob[5], 'Y', [0, 4]), [[14, 7], [15, 6], [15, 5]], '.')
    const pod = f => put(put(f, [[14, 6], [15, 7]], 'p'), [[15, 8]], 'o')
    const rod = (f, tip) => put(put(put(pod(f), col(15, tip[1] + 1, 6), 'b'), [tip], 'M'), [[14, 5]], 'm')
    return { base, pose: tip => ({ frame: rod(base, tip), tip }), tips: { hold: [15, 0], flick: [15, 1], bent: [15, 2] } }
  })(),
  // The tail curls up and coils round the rod, as though it were no effort at all.
  pixel: (() => {
    const base = B.pixel[5]
    // Rod first, then the tail over it: along the floor, up the right edge and once round the rod.
    const tail = f => put(f, [[12, 11], [13, 11], [14, 11], [15, 10], [15, 9], [15, 8], [14, 8], [13, 8]], 't')
    const rod = (f, tip) => tail(put(put(put(clear(f, 't'), col(14, tip[1] + 1, 10), 'b'), [tip], 'M'), [[13, 10]], 'm'))
    return { base, pose: tip => ({ frame: rod(base, tip), tip }), tips: { hold: [14, 1], flick: [14, 2], bent: [14, 3] } }
  })(),
  // One antenna holds the rod out level like a pole; the other is a pom-pom, still cheering.
  dot: (() => {
    const base = put(B.dot[0], [[5, 3], [10, 3]], 'r')
    const pom = f => put(put(f, [[2, 0], [3, 0], [2, 1], [3, 1]], 'Y'), [[4, 0], [4, 1], [5, 1]], '.')
    const pole = (f, tip) => {
      const g = put(put(pom(f), [[4, 1], [5, 1]], 'k'), [[11, 0]], 'm')
      // Level: 12–14 on row 0. Flick: the outer end rises off the grid edge, so it reads shorter. Bent: droops.
      const cane = tip[1] === 0 ? [[12, 0], [13, 0], [14, 0]] : tip[1] === 1 ? [[12, 0], [13, 0], [14, 1]] : [[12, 0], [13, 1], [14, 1]]
      return put(put(g, cane, 'b'), [tip], 'M')
    }
    return { base, pose: tip => ({ frame: pole(base, tip), tip }), tips: { hold: [15, 0], flick: [15, 0], bent: [15, 2] } }
  })(),
  // One outer tentacle reaches up and wraps the rod twice; the rest stay where they were.
  fork: (() => {
    const base = put(raw.fork.moods.pleased.frames[0], [[3, 8], [12, 8]], 'C')
    const wrap = f => put(put(f, [[15, 11], [15, 12], [14, 12]], '.'), [[14, 10], [14, 9], [14, 8], [15, 10]], 'o')
    const rod = (f, tip) => put(put(put(wrap(f), col(15, tip[1] + 1, 9), 'b'), [tip], 'M'), [[13, 9]], 'm')
    return { base, pose: tip => ({ frame: rod(base, tip), tip }), tips: { hold: [15, 1], flick: [15, 2], bent: [15, 3] } }
  })(),
  // Holds the rod in his mouth, crosswise, tail going.
  bud: (() => {
    const base = B.bud[5]
    const rod = (f, tip) => {
      const cane = tip[1] <= 2 ? [[11, 7], [12, 6], [13, 5], [14, 4], [14, 3]] : [[11, 7], [12, 6], [13, 5], [14, 5], [15, 5]]
      return put(put(f, [[9, 8], [10, 8], ...cane], 'B'), [tip], 'm')
    }
    return { base, pose: tip => ({ frame: rod(base, tip), tip }), tips: { hold: [15, 2], flick: [14, 2], bent: [15, 6] } }
  })(),
}

// ─── Crew rows: the same pet as a mini with its role hat (hooks/behavior/hats.ts) ───
const ROWS = [
  { name: 'researcher-1', task: 'last 10 digits of Σk^k', meta: 'Opus 5.5 · medium', role: 'researcher', tier: 'light' },
  { name: 'builder-2', task: 'date formatting helpers', meta: 'Sonnet 5.5 · medium', role: 'builder', tier: 'medium' },
  { name: 'tester-3', task: 'edge cases for parse()', meta: 'Haiku 5.5 · low', role: 'tester', tier: 'heavy' },
]
const mini = (id, frame, row) => withHat(frame, raw[id].hatAnchor, row.role, row.tier)

const GIFT = ['.Y.Y.', '..Y..', 'CCYCC', 'CCYCC', 'YYYYY', 'CCYCC']
const SPARK = [['.Y.', 'YCY', '.Y.'], ['..Y..', '..Y..', 'YYCYY', '..Y..', '..Y..'], ['Y...Y', '.....', '.....', '.....', 'Y...Y']]

export const DATA = {
  rows: ROWS,
  gift: GIFT,
  spark: SPARK,
  pets: Object.fromEntries(PETS.map(({ id, name, palette }) => {
    const r = ROD[id]
    const pose = k => r.pose(r.tips[k])
    return [id, {
      name,
      pal: palette,
      flourish: B[id],
      base: r.base,
      hold: pose('hold'), flick: pose('flick'), bent: pose('bent'),
      minis: ROWS.map(row => ({ idle: mini(id, raw[id].moods.idle.frames[0], row), happy: mini(id, raw[id].moods.happy.frames[1], row) })),
    }]
  })),
}

// ─── The scene, as one SVG per moment. Runs in Node (for the strips) and, stringified, in the page. ───
export function scene(D, id, depth, t, dark) {
  const P = D.pets[id]
  const th = dark
    ? { card: '#1b1e29', line: '#2c3142', text: '#e8ebff', sub: '#9aa0b8', bar: '#2c3142', chip: '#262a38', ok: '#3ddc84', fish: '#c9d4ff', head: '#7aa2ff' }
    : { card: '#ffffff', line: '#e3e6ee', text: '#1d2130', sub: '#6b7186', bar: '#e7e9f0', chip: '#eef0f5', ok: '#1f9d55', fish: '#5a5f80', head: '#2a6df4' }
  const W = 300, H = 286, LX = 14, LY = 14, MX = 24, ROW0 = 84, RH = 54
  const rowTop = i => ROW0 + i * RH
  let s = ''
  const sprite = (pal, frame, x, y, px) => {
    frame.forEach((row, yy) => {
      let xx = 0
      while (xx < row.length) {
        const ch = row[xx]
        let e = xx + 1
        while (e < row.length && row[e] === ch) e++
        const c = pal[ch]
        if (ch !== '.' && c) s += `<rect x="${x + xx * px}" y="${y + yy * px}" width="${(e - xx) * px}" height="${px}" fill="${c}"/>`
        xx = e
      }
    })
  }
  const text = (x, y, str, size, fill, weight = 400, anchor = 'start') =>
    (s += `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" stroke="none" font-family="system-ui,'Segoe UI','DejaVu Sans',sans-serif">${str}</text>`)
  const ease = u => (u < 0 ? 0 : u > 1 ? 1 : 1 - (1 - u) * (1 - u))
  const easeIn = u => (u < 0 ? 0 : u > 1 ? 1 : u * u)
  const lerp = (a, b, u) => a + (b - a) * u

  // Timeline (ms). The descent takes longer the deeper the row.
  const T = {}
  T.grab = 1200; T.flick = 1350; T.cast = 1500
  T.land = T.cast + 350 + 150 * depth
  T.release = T.land + 150; T.caught = T.release + 250; T.reel = T.caught + 300
  T.stow = T.reel + 500; T.end = T.stow + 300
  const target = depth - 1

  // Card and the lead row.
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${th.card}" stroke="${th.line}"/>`
  let lead, tip
  if (t < T.grab) lead = P.flourish[Math.min(5, Math.floor(t / 200))]
  else if (t < T.flick) ({ frame: lead, tip } = P.hold)
  else if (t < T.cast) ({ frame: lead, tip } = P.flick)
  else if (t < T.release) ({ frame: lead, tip } = P.bent)
  else if (t < T.stow) ({ frame: lead, tip } = P.hold)
  else lead = P.base
  sprite(P.pal, lead, LX, LY, 3)
  text(74, 32, P.name, 15, th.text, 700)
  text(74, 50, 'lead · reviewing', 12, th.sub)
  text(W - 14, 32, '1:14', 14, th.text, 700, 'end')
  text(W - 14, 46, 'SO FAR', 9, th.sub, 400, 'end')
  // The header sits in the text column, so the line drops through the clear gutter beside it.
  text(74, 74, 'RUNNING', 10, th.head, 700)
  text(128, 74, '3', 10, th.text, 700)
  s += `<rect x="140" y="69" width="${W - 154}" height="4" rx="2" fill="${th.bar}"/><rect x="140" y="69" width="${(W - 154) * 0.6}" height="4" rx="2" fill="${th.head}"/>`

  // Crew rows. The receiver reads "done" from t = 0: finishing is what starts the moment.
  D.rows.forEach((row, i) => {
    const y = rowTop(i)
    const me = i === target
    const got = me && t >= T.release
    let dy = 0
    if (me && t >= T.release && t < T.reel) {
      const u = (t - T.release) / (T.reel - T.release)
      dy = -Math.round(Math.abs(Math.sin(u * Math.PI * 2)) * 5)
    }
    const m = P.minis[i][got ? 'happy' : 'idle']
    sprite({ ...P.pal, ...m.palette }, m.frame, MX, y + 6 + dy, 2)
    text(74, y + 20, row.name, 13, th.text, 700)
    text(74, y + 36, row.task, 11.5, th.sub)
    text(W - 14, y + 20, me ? '✓ done' : '0:' + (21 + i * 7), 11, me ? th.ok : th.sub, me ? 700 : 400, 'end')
    if (got) {
      // The gift slides from the hook into the mini's arms and stays there, a small badge for the row.
      const u = ease((t - T.release) / (T.caught - T.release))
      const gx = Math.round(lerp(tip ? LX + tip[0] * 3 - 4 : 52, MX + 26, u))
      const gy = Math.round(lerp(y + 2, y + 26, u)) + (u < 1 ? 0 : 0)
      sprite(P.pal, D.gift, gx, gy + (u >= 1 ? dy : 0), 2)
      if (t >= T.caught && t < T.end + 400) {
        const k = Math.min(2, Math.floor((t - T.caught) / 220))
        const sp = D.spark[k]
        sprite(P.pal, sp, MX - 6 - (sp.length >> 1) * 2 + 4, y + 4 - (sp.length >> 1) * 2 + 4, 2)
        sprite(P.pal, sp, MX + 30 - (sp.length >> 1) * 2, y + 2 - (sp.length >> 1) * 2 + 2, 2)
      }
    }
  })

  // The line and the gift, drawn over the rows in one overlay.
  if (tip && t >= T.cast && t < T.stow) {
    const x0 = LX + tip[0] * 3 + 1
    const y0 = LY + tip[1] * 3 + 2
    const bottom = rowTop(target) + 2
    let yEnd
    if (t < T.land) yEnd = lerp(y0 + 4, bottom, ease((t - T.cast) / (T.land - T.cast)))
    else if (t < T.caught) yEnd = bottom
    else if (t < T.reel) yEnd = bottom
    else yEnd = lerp(bottom, y0 + 4, easeIn((t - T.reel) / (T.stow - T.reel)))
    yEnd = Math.round(yEnd)
    s += `<rect x="${x0}" y="${y0}" width="1" height="${yEnd - y0}" fill="${th.fish}"/>`
    if (t < T.release) sprite(P.pal, D.gift, x0 - 4, yEnd, 2)
    else s += `<rect x="${x0}" y="${yEnd}" width="1" height="4" fill="${th.fish}"/><rect x="${x0 - 3}" y="${yEnd + 3}" width="4" height="1" fill="${th.fish}"/><rect x="${x0 - 3}" y="${yEnd + 1}" width="1" height="2" fill="${th.fish}"/>`
  }

  // Footer, as in the real pane.
  text(14, H - 14, 'FINISHED', 10, th.sub, 700)
  text(72, H - 14, '3', 10, th.text, 700)
  s += `<rect x="86" y="${H - 19}" width="${W - 100}" height="4" rx="2" fill="${th.ok}" opacity="0.8"/>`
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">${s}</svg>`, end: T.end, T }
}

// Key moments for the strip: flourish ×3, rod up, cast, line halfway, landed, caught (hop), reeling, done.
const KEYS = d => {
  const { T } = scene(DATA, 'fork', d, 0, false)
  return [
    ['flourish', 200], ['flourish', 600], ['flourish', 1000], ['rod up', T.grab + 50], ['cast', T.flick + 50],
    ['lowering', Math.round((T.cast + T.land) / 2)], ['landed', T.land + 50], ['caught', T.release + 120],
    ['reeling', Math.round((T.reel + T.stow) / 2)], ['done', T.end + 200],
  ]
}

// Run directly, it writes the page (and the strips); imported, it only hands out DATA and scene.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const args = process.argv.slice(2)
const out = resolve(args[0] ?? '.superpowers/gallery/reward-fishing.html')
const stripDir = args[1] && resolve(args[1])

if (stripDir) {
  mkdirSync(stripDir, { recursive: true })
  for (const { id } of PETS) {
    const GAP = 8, LBL = 18, SW = 300, SH = 286
    let body = '', w = 0, h = 0
    ;[[1, false], [3, false], [3, true]].forEach(([d, dark], r) => {
      const keys = KEYS(d)
      const y = r * (SH + LBL + GAP) + GAP
      keys.forEach(([label, t], i) => {
        const x = GAP + i * (SW + GAP)
        body += `<text x="${x + 4}" y="${y + 12}" font-size="12" fill="#c8cce0" stroke="none" font-family="DejaVu Sans">${label} · ${t} ms · row ${d}</text>`
        body += `<g transform="translate(${x} ${y + LBL})">${scene(DATA, id, d, t, dark).svg.replace(/^<svg[^>]*>|<\/svg>$/g, '').replaceAll("system-ui,'Segoe UI','DejaVu Sans',sans-serif", 'DejaVu Sans').replace(/fill="(#[0-9a-f]{6})"\/>/g, 'fill="$1" stroke="$1" stroke-width="0.35"/>')}</g>`
        w = Math.max(w, x + SW + GAP)
      })
      h = y + LBL + SH + GAP
    })
    writeFileSync(`${stripDir}/reward-fishing-${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="#14161f"/>${body}</svg>`)
  }
  console.log(`strips → ${stripDir}`)
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fishing-rod reward</title>
<style>
:root{--bg:#f4f5f9;--fg:#1d2130;--sub:#6b7186;--edge:#d9dce6;--btn:#fff;--acc:#2a6df4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11131a;--fg:#e8ebff;--sub:#9aa0b8;--edge:#2c3142;--btn:#1b1e29;--acc:#7aa2ff}}
:root[data-theme="dark"]{--bg:#11131a;--fg:#e8ebff;--sub:#9aa0b8;--edge:#2c3142;--btn:#1b1e29;--acc:#7aa2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,'Segoe UI',sans-serif;padding:24px 16px}
main{max-width:1000px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 12px;color:var(--sub);max-width:70ch}
.tag{font:12px ui-monospace,monospace;color:#c0398a;margin-bottom:6px}
.bar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:16px 0}
.seg{display:inline-flex;border:1px solid var(--edge);border-radius:8px;overflow:hidden}
.seg button{border:0;background:var(--btn);color:var(--fg);padding:6px 10px;font:inherit;cursor:pointer;border-right:1px solid var(--edge)}
.seg button:last-child{border-right:0}.seg button[aria-pressed="true"]{background:var(--acc);color:#fff}
.go{border:1px solid var(--edge);background:var(--btn);color:var(--fg);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.stage{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.stage svg{max-width:100%;height:auto;image-rendering:pixelated}
#big svg{width:600px;height:auto}
.time{font:12px ui-monospace,monospace;color:var(--sub);margin-top:6px}
.strip{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}.strip figure{margin:0}.strip figcaption{font-size:11px;color:var(--sub)}
.strip svg{width:200px;height:auto}
ol{color:var(--sub);padding-left:20px;max-width:70ch}
#motion-note{display:none;color:var(--sub)}
@media (prefers-reduced-motion:reduce){#anim{display:none}#motion-note{display:block}}
</style></head><body><main>
<div class="tag">#40 · lead reactions — round 3 · mockup, nothing wired</div>
<h1>Flourish, then a fishing-rod reward</h1>
<p>When a crew member finishes, the lead does its signature flourish (round 2, option B), takes out a rod, and lowers a small gift down the pane to that member's row. The member catches it with a hop and a sparkle, keeps it as a badge, and the line reels back up.</p>
<div class="bar">
  <span>Lead</span><div class="seg" id="pets">${PETS.map((p, i) => `<button data-id="${p.id}" aria-pressed="${i === 4}">${p.name}</button>`).join('')}</div>
  <span>Finished member</span><div class="seg" id="depth"><button data-d="1" aria-pressed="false">row 1</button><button data-d="2" aria-pressed="false">row 2</button><button data-d="3" aria-pressed="true">row 3</button></div>
  <div class="seg" id="theme"><button data-t="light" aria-pressed="true">light</button><button data-t="dark" aria-pressed="false">dark</button></div>
  <button class="go" id="replay">▶ Replay</button>
</div>
<div id="anim" class="stage"><div><div id="big"></div><div class="time" id="clock"></div></div></div>
<p id="motion-note">Reduced motion is on, so here is the moment as a strip of stills instead of the animation.</p>
<h2 style="font-size:15px;margin:20px 0 0">Frame strip</h2>
<div class="strip" id="strip"></div>
<h2 style="font-size:15px;margin:20px 0 4px">The beats</h2>
<ol>
<li><b>Flourish</b>, 0–1.2 s: six frames at 5 fps, exactly round 2's B.</li>
<li><b>Rod up</b>, 1.2–1.35 s, then <b>cast</b> to 1.5 s: the tip snaps back one pixel.</li>
<li><b>Lowering</b>: the line drops with the gift on the hook, easing out; 0.65 s to row 1, 0.95 s to row 3. The rod tip bends under the weight.</li>
<li><b>Caught</b>: the gift slides into the mini's arms, the mini switches to its happy face and hops twice, sparkles burst.</li>
<li><b>Reel</b>: 0.5 s, the empty hook goes back up, the rod straightens, then it is put away and the lead smiles.</li>
</ol>
<p>Rod per lead: Screenhead grips it with a robotic arm, Byte blob with a pseudopod, Pixel coils its tail round it, Dot holds it out level on one antenna (the other is a pom-pom), Fork wraps one tentacle round it, Bud holds it in his mouth.</p>
</main>
<script>
const D = ${JSON.stringify(DATA)};
const scene = ${scene.toString()};
const KEYS = ${KEYS.toString().replace("scene(DATA, 'fork', d, 0, false)", "scene(D, 'fork', d, 0, false)")};
let id = 'fork', depth = 3, dark = false, t0 = performance.now(), raf = 0
const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const pick = (box, attr, fn) => box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; for (const x of box.children) x.setAttribute('aria-pressed', x === b); fn(b.dataset[attr]); draw(); restart() })
pick(document.getElementById('pets'), 'id', v => (id = v))
pick(document.getElementById('depth'), 'd', v => (depth = Number(v)))
pick(document.getElementById('theme'), 't', v => { dark = v === 'dark'; document.documentElement.dataset.theme = v })
document.getElementById('replay').onclick = restart
function draw() {
  document.getElementById('strip').innerHTML = KEYS(depth).map(([l, t]) => '<figure>' + scene(D, id, depth, t, dark).svg + '<figcaption>' + l + ' · ' + t + ' ms</figcaption></figure>').join('')
}
function restart() { t0 = performance.now(); cancelAnimationFrame(raf); if (!reduce.matches) raf = requestAnimationFrame(tick) }
function tick(now) {
  const t = now - t0
  const r = scene(D, id, depth, Math.max(0, Math.min(t, r0(depth) + 1200)), dark)
  document.getElementById('big').innerHTML = r.svg.replace('width="300" height="286"', '')
  document.getElementById('clock').textContent = (Math.max(0, Math.min(t, r.end)) / 1000).toFixed(2) + ' s / ' + (r.end / 1000).toFixed(2) + ' s'
  if (t < r.end + 1200) raf = requestAnimationFrame(tick)
  else { t0 = now + 900; raf = requestAnimationFrame(tick) }
}
const r0 = d => scene(D, 'fork', d, 0, false).end
if (matchMedia('(prefers-color-scheme: dark)').matches) document.querySelector('#theme [data-t=dark]').click()
draw(); restart()
reduce.addEventListener('change', restart)
</script></body></html>`
writeFileSync(out, page)
console.log(`reward fishing → ${out}`)
}
