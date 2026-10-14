// Renders every persona × mood to one HTML page for an art review.
// Usage: node plugins/glitch-pets/scripts/gallery.mjs [out.html]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { MOOD_IDS } from '../hooks/behavior/types.ts'
import { frameSvg } from '../hooks/behavior/player.ts'
import { withLaptop } from '../hooks/behavior/laptop.ts'

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

const out = resolve(process.argv[2] ?? '.superpowers/gallery/pets.html')
const cell = (p, mood) => {
  const art = p.moods[mood]
  if (!art) return '<td>missing</td>'
  const frames = art.frames.map(f => frameSvg(p.palette, f, 4))
  return `<td><div class="anim" data-fps="${art.fps}">${frames.map((s, i) => `<span${i ? ' hidden' : ''}>${s}</span>`).join('')}</div><div class="cap">${mood} · ${art.frames.length}f · ${art.fps}fps</div></td>`
}
const rows = personas
  .map(p => `<tr><th>${p.name}<br><small>${p.temperament}</small></th>${MOOD_IDS.map(m => cell(p, m)).join('')}</tr>`)
  .join('\n')
const html = `<!doctype html><meta charset="utf-8"><title>Glitch pets gallery</title>
<style>
body{font:13px system-ui;margin:16px;background:#14161f;color:#e8ebff}
body.light{background:#f0f0f0;color:#222}
table{border-collapse:collapse}td,th{padding:8px;border:1px solid #333;text-align:center;vertical-align:bottom}
th{text-align:left;max-width:160px}small{opacity:.7;font-weight:normal}.cap{font-size:11px;opacity:.7}
</style>
<button onclick="document.body.classList.toggle('light')">dark / light</button>
<table><tr><th></th>${MOOD_IDS.map(m => `<th>${m}</th>`).join('')}</tr>${rows}</table>
<script>
for (const a of document.querySelectorAll('.anim')) {
  const s = [...a.children]; let i = 0
  setInterval(() => { s[i].hidden = true; i = (i + 1) % s.length; s[i].hidden = false }, 1000 / Number(a.dataset.fps))
}
</script>`
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`gallery: ${personas.length} pets → ${out}`)
