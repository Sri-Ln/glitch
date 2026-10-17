// Hat redesign options for issue #41: every pet × role × tier, per option, at pane sizes.
// Usage: node plugins/glitch-pets/scripts/hats-mockup.mjs [out.html]
// Writes the HTML page and, beside it, one flat SVG per section (for rasterising to PNG).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { withLaptop } from '../hooks/behavior/laptop.ts'
import { withHat } from '../hooks/behavior/hats.ts'
import { PROPS, ROLES, TIER_MAIN, boldHat, compactHat, propHat } from '../hooks/behavior/hats-v2.ts'

const IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud']
const TIERS = ['light', 'medium', 'heavy']
const pets = []
for (const id of IDS) pets.push(withLaptop((await import(`../hooks/personas/${id}.ts`)).default))

const THEMES = { dark: { bg: '#17181d', fg: '#e8ebff', dim: '#8a90a8', line: '#2a2c36' }, light: { bg: '#f6f5f1', fg: '#1d1f27', dim: '#6a6f80', line: '#dcdad3' } }
const INK = '#10131c'
const NAME = { builder: 'Builder', researcher: 'Researcher', designer: 'Designer', tester: 'Tester', reviewer: 'Reviewer', other: 'Other' }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Absolute-coordinate rects for one frame: flat SVG, so ImageMagick's renderer draws it too. */
function pixels(frame, palette, s, ox, oy) {
  let out = ''
  frame.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const c = palette[ch]
      if (ch !== '.' && c) out += `<rect x="${ox + x * s}" y="${oy + y * s}" width="${(end - x) * s}" height="${s}" fill="${c}" stroke="none"/>`
      x = end
    }
  })
  return out
}
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')
const text = (x, y, str, { size = 11, fill, weight = 400, anchor = "start", len } = {}) =>
  `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" fill="${fill}" stroke="none" text-anchor="${anchor}"${len ? ` textLength="${len}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(str)}</text>`

// Each option: how one mini (pet, role, tier) draws at scale s, as { w, h, draw(ox, oy, theme) }.
const OPTIONS = [
  {
    id: 'current',
    label: 'Today (baseline)',
    why: 'The shipped 3-row hats, for comparison: the reviewer has no hat and the tier lives only in the hat fill.',
    mini(p, role, tier, s) {
      const { frame, palette } = withHat(p.moods.idle.frames[0], p.hatAnchor, role, tier)
      const pal = { ...p.palette, ...palette }
      return { w: 16 * s, h: frame.length * s, draw: (ox, oy) => pixels(frame, pal, s, ox, oy) }
    },
  },
  {
    id: 'A',
    label: 'A · Bold hats',
    why: 'Five-row hats with six distinct silhouettes (hard hat, mortarboard, beret, goggles, crown, bobble beanie) in the tier color, plus a tier bar under the feet. Pixels only, so the terminal and desktop look the same.',
    mini(p, role, tier, s) {
      const { frame, palette } = boldHat(p.moods.idle.frames[0], p.hatAnchor, role, tier)
      const pal = { ...p.palette, ...palette }
      return { w: 16 * s, h: frame.length * s, draw: (ox, oy) => pixels(frame, pal, s, ox, oy) }
    },
  },
  {
    id: 'B',
    label: 'B · Hat + role prop, tier tile',
    why: 'Compact hat plus a prop held at the side (hammer, magnifier, brush, flask, star, gear). The prop names the role; the hat and a tier-bordered tile show the tier. The mini is 4 columns wider.',
    mini(p, role, tier, s) {
      const { frame, palette } = propHat(p.moods.idle.frames[0], p.hatAnchor, role, tier)
      const pal = { ...p.palette, ...palette }
      const pad = Math.round(2 * s)
      const w = 20 * s + pad * 2, h = frame.length * s + pad * 2
      return {
        w, h,
        draw: (ox, oy, th) =>
          `<rect x="${ox + 0.5}" y="${oy + 0.5}" width="${w - 1}" height="${h - 1}" rx="${2 * s}" fill="${mix(th.bg, TIER_MAIN[tier], 0.14)}" stroke="${TIER_MAIN[tier]}" stroke-width="1"/>` +
          pixels(frame, pal, s, ox + pad, oy + pad),
      }
    },
  },
  {
    id: 'C',
    label: 'C · Mini + role chip',
    why: 'Compact hat on the mini plus a chip in the tier color holding a role icon and the role name. Nothing to guess, and the word helps color-blind viewers. Costs about 70 px of row width.',
    mini(p, role, tier, s) {
      const { frame, palette } = compactHat(p.moods.idle.frames[0], p.hatAnchor, role, tier)
      const pal = { ...p.palette, ...palette }
      const fs = s >= 3 ? 16 : s >= 2 ? 12 : 10.5
      const icon = PROPS[role]
      const is = s >= 3 ? 2 : 1.5
      const chipH = Math.round(7 * is + 6)
      const chipW = Math.round(5 * is + 14 + NAME[role].length * fs * 0.64)
      const gap = Math.round(2 * s)
      const mh = frame.length * s
      const w = 16 * s + gap + chipW, h = Math.max(mh, chipH)
      const iconPal = Object.fromEntries('012589'.split('').map(k => [k, INK]))
      return {
        w, h,
        draw: (ox, oy) => {
          const cx = ox + 16 * s + gap, cy = oy + Math.round((mh - chipH) / 2 + 2 * s)
          return pixels(frame, pal, s, ox, oy) +
            `<rect x="${cx}" y="${cy}" width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="${TIER_MAIN[tier]}" stroke="none"/>` +
            pixels(icon, iconPal, is, cx + 5, cy + 3) +
            text(cx + 5 + 5 * is + 4, cy + chipH / 2 + fs * 0.36, NAME[role], { size: fs, fill: INK, weight: 700 })
        },
      }
    },
  },
]

/** One section: pets down, roles across, the three tiers inside each cell (stacked when `stack`). */
function grid(opt, s, th, { tiers = TIERS, petList = pets } = {}) {
  const stack = opt.id === 'C'
  const gap = 8, cellPad = 8, labelW = 92, headH = 22
  const sample = opt.mini(petList[0], 'researcher', 'light', s)
  const cellW = (stack ? sample.w : tiers.length * sample.w + (tiers.length - 1) * gap) + cellPad * 2
  // C's chip width varies by role name: size each column for its own widest chip.
  const colW = ROLES.map(r => (stack ? opt.mini(petList[0], r, 'light', s).w + cellPad * 2 : cellW))
  const cellH = (stack ? tiers.length * sample.h + (tiers.length - 1) * 4 : sample.h) + cellPad * 2
  const W = labelW + colW.reduce((a, b) => a + b, 0), H = headH + petList.length * cellH
  let body = `<rect x="0" y="0" width="${W}" height="${H}" fill="${th.bg}" stroke="none"/>`
  let x = labelW
  ROLES.forEach((r, i) => {
    body += text(x + colW[i] / 2, 15, r, { fill: th.dim, anchor: 'middle' })
    x += colW[i]
  })
  petList.forEach((p, pi) => {
    const y0 = headH + pi * cellH
    body += `<rect x="0" y="${y0}" width="${W}" height="1" fill="${th.line}" stroke="none"/>`
    body += text(6, y0 + cellH / 2 + 4, p.name, { fill: th.fg, weight: 700 })
    let cx = labelW
    ROLES.forEach((r, ri) => {
      tiers.forEach((t, ti) => {
        const m = opt.mini(p, r, t, s)
        const mx = stack ? cx + cellPad : cx + cellPad + ti * (m.w + gap)
        const my = stack ? y0 + cellPad + ti * (m.h + 4) : y0 + cellPad + (sample.h - m.h)
        body += m.draw(mx, my, th)
      })
      cx += colW[ri]
    })
  })
  return { W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</svg>` }
}

const out = resolve(process.argv[2] ?? '.superpowers/gallery/hats-options.html')
const dir = dirname(out)
mkdirSync(dir, { recursive: true })
const sections = []
for (const opt of OPTIONS) {
  const parts = opt.id === 'current'
    ? [['1.5 px per pixel (pane today)', grid(opt, 1.5, THEMES.dark)]]
    : [
        ['1.5 px per pixel · dark', grid(opt, 1.5, THEMES.dark)],
        ['2 px per pixel · dark', grid(opt, 2, THEMES.dark)],
        ['2 px per pixel · light', grid(opt, 2, THEMES.light)],
        ['3× close-up · medium tier', grid(opt, 3, THEMES.dark, { tiers: ['medium'] })],
      ]
  parts.forEach(([, g], i) => writeFileSync(join(dir, `hats-${opt.id}-${i}.svg`), g.svg))
  sections.push(`<section><h2>${esc(opt.label)}</h2><p>${esc(opt.why)}</p>${parts.map(([cap, g]) => `<figure><figcaption>${esc(cap)}</figcaption><div class="scroll">${g.svg}</div></figure>`).join('')}</section>`)
}
const legend = TIERS.map(t => `<span class="pip" style="background:${TIER_MAIN[t]}"></span>${t}`).join(' &nbsp; ')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crew Hat Options</title>
<style>
:root{--bg:#101116;--fg:#e8ebff;--dim:#9aa0b8}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#fbfaf7;--fg:#1d1f27;--dim:#5d6272}}
:root[data-theme="light"]{--bg:#fbfaf7;--fg:#1d1f27;--dim:#5d6272}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1500px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 2px}
p{margin:0 0 10px;color:var(--dim);max-width:900px}figure{margin:10px 0 16px}figcaption{font-size:12px;color:var(--dim);margin-bottom:4px}
.scroll{overflow-x:auto;max-width:100%}.scroll svg{display:block;border-radius:6px}.scroll text{font-family:system-ui,"DejaVu Sans",sans-serif}
.pip{display:inline-block;width:10px;height:10px;border-radius:5px;margin-right:4px;vertical-align:-1px}
</style>
<main>
<h1>Crew hats: redesign options (#41)</h1>
<p>Each helper mini is the pet's first idle frame. Pets go down, roles go across, and each cell shows the light, medium and heavy tiers, drawn at the pane's sizes. Tiers: ${legend}.</p>
${sections.join('\n')}
</main></html>`
writeFileSync(out, html)
console.log(`hats mockup: ${OPTIONS.length} sections → ${out}`)
