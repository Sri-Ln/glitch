// Renders every persona × mood to one HTML page for an art review.
// Usage: node plugins/glitch-pets/scripts/gallery.mjs [out.html] [--focus mood,mood]
// --focus adds a section on top for those moods: each pet animated at 3× and at pane size, plus its frame strip.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { MOOD_IDS } from '../hooks/behavior/types.ts'
import { frameSvg } from '../hooks/behavior/player.ts'
import { withLaptop } from '../hooks/behavior/laptop.ts'
import { withHat } from '../hooks/behavior/hats.ts'

const IDS = ['screenhead', 'blob', 'pixel', 'dot', 'fork', 'bud']
const personas = []
for (const id of IDS) {
  try {
    personas.push(withLaptop((await import(`../hooks/personas/${id}.ts`)).default))
  } catch (err) {
    // A persona whose file does not exist yet is silently skipped; any other failure is named.
    const missing = err?.code === 'ERR_MODULE_NOT_FOUND' && new RegExp(`Cannot find module '[^']*personas[\\\\/]${id}\\.ts'`).test(String(err.message))
    if (!missing) console.error(`skipped ${id}: ${err?.message ?? err}`)
  }
}

const args = process.argv.slice(2)
const fi = args.indexOf('--focus')
const focus = fi >= 0 ? (args.splice(fi, 2)[1] ?? '').split(',').filter(m => MOOD_IDS.includes(m)) : []
const out = resolve(args[0] ?? '.superpowers/gallery/pets.html')
// Pane size: register.tsx draws the crew pane's lead at 1.5 CSS px per pixel.
const anim = (p, art, px) => `<div class="anim" data-fps="${art.fps}">${art.frames.map((f, i) => `<span${i ? ' hidden' : ''}>${frameSvg(p.palette, f, px)}</span>`).join('')}</div>`
const focusCell = (p, mood) => {
  const art = p.moods[mood]
  if (!art) return '<td>missing</td>'
  const strip = art.frames.map(f => frameSvg(p.palette, f, 3)).join('<i></i>')
  return `<td><div class="pair">${anim(p, art, 3)}${anim(p, art, 1.5)}</div><div class="strip">${strip}</div><div class="cap">${mood} · ${art.frames.length}f · ${art.fps}fps</div></td>`
}
const focusHtml = focus.length
  ? `<h2>Focus: ${focus.join(', ')}</h2><p class="cap">Animated at 3× and at pane size (1.5×), then every frame at 3×.</p>
<table><tr><th></th>${focus.map(m => `<th>${m}</th>`).join('')}</tr>${personas.map(p => `<tr><th>${p.name}</th>${focus.map(m => focusCell(p, m)).join('')}</tr>`).join('\n')}</table><h2>All moods</h2>`
  : ''
const cell = (p, mood) => {
  const art = p.moods[mood]
  if (!art) return '<td>missing</td>'
  const frames = art.frames.map(f => frameSvg(p.palette, f, 4))
  return `<td><div class="anim" data-fps="${art.fps}">${frames.map((s, i) => `<span${i ? ' hidden' : ''}>${s}</span>`).join('')}</div><div class="cap">${mood} · ${art.frames.length}f · ${art.fps}fps</div></td>`
}
const rows = personas
  .map(p => `<tr><th>${p.name}<br><small>${p.temperament}</small></th>${MOOD_IDS.map(m => cell(p, m)).join('')}</tr>`)
  .join('\n')
const ROLES = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']
const TIERS = ['light', 'medium', 'heavy']
const hatCell = (p, role) => {
  const base = p.moods.idle.frames[0]
  const hats = TIERS.map(tier => {
    const { frame, palette } = withHat(base, p.hatAnchor, role, tier)
    return `<div class="hat">${frameSvg({ ...p.palette, ...palette }, frame, 4)}<div class="cap">${role} · ${tier}</div></div>`
  })
  return `<td>${hats.join('')}</td>`
}
const hatRows = personas.map(p => `<tr><th>${p.name}</th>${ROLES.map(r => hatCell(p, r)).join('')}</tr>`).join('\n')
const html = `<!doctype html><meta charset="utf-8"><title>Glitch pets gallery</title>
<style>
body{font:13px system-ui;margin:16px;background:#14161f;color:#e8ebff}
body.light{background:#f0f0f0;color:#222}
table{border-collapse:collapse}td,th{padding:8px;border:1px solid #333;text-align:center;vertical-align:bottom}
th{text-align:left;max-width:160px}.hat{display:inline-block;margin:0 4px}small{opacity:.7;font-weight:normal}.cap{font-size:11px;opacity:.7}
.pair{display:flex;gap:12px;align-items:flex-end;justify-content:center}.strip{margin-top:6px;display:flex;gap:4px;justify-content:center}.strip i{width:1px;background:#444}
</style>
<button onclick="document.body.classList.toggle('light')">dark / light</button>
${focusHtml}<table><tr><th></th>${MOOD_IDS.map(m => `<th>${m}</th>`).join('')}</tr>${rows}</table>
<h2>Crew hats</h2>
<table><tr><th></th>${ROLES.map(r => `<th>${r}</th>`).join('')}</tr>${hatRows}</table>
<script>
for (const a of document.querySelectorAll('.anim')) {
  const s = [...a.children]; let i = 0
  setInterval(() => { s[i].hidden = true; i = (i + 1) % s.length; s[i].hidden = false }, 1000 / Number(a.dataset.fps))
}
</script>`
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`gallery: ${personas.length} pets → ${out}`)
