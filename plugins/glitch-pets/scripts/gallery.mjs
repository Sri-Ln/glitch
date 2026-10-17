// Renders every persona × mood, and every crew theme × pet × role × model, to one HTML page
// for an art review.
// Usage: node plugins/glitch-pets/scripts/gallery.mjs [out.html]   (Node 22.15 or later)
// Beside the page it writes crew-theme-<id>.svg per theme: one flat still grid, for rasterising.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { dirname, join, resolve } from 'node:path'

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

// Hooks modules import plugin files extensionless (the engine resolves them); here a relative
// specifier that does not resolve as written is tried again with .ts, so the crew-themes
// registry loads as the plugin loads it. module.registerHooks needs Node 22.15 or later.
if (typeof nodeModule.registerHooks !== 'function') {
  console.error(`gallery.mjs needs Node 22.15 or later (module.registerHooks, to load the crew-themes registry); this is Node ${process.versions.node}.\nUsage: node plugins/glitch-pets/scripts/gallery.mjs [out.html]`)
  process.exit(1)
}
nodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]sx?$/.test(specifier)) throw err
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})
const { CREW_THEMES, crewMini } = await import('../hooks/crew-themes/index.ts')

// plugin.json's crewTheme options must list the registry, or the settings screen misses a theme.
const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
const options = manifest.userConfig?.crewTheme?.options ?? []
if (options.join() !== Object.keys(CREW_THEMES).join()) console.error(`plugin.json crewTheme options (${options.join(', ')}) differ from the registry (${Object.keys(CREW_THEMES).join(', ')})`)

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
const ROLES = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']
// Crew themes: every theme × pet × role × model, animated through crewMini (the pane's own call).
// A cell samples the theme every 25 ms over 8 s (a whole number of loops for each tempo) and
// keeps each distinct frame once plus the sequence that plays them.
const MODELS = [['Haiku', 'claude-haiku-4-5'], ['Sonnet', 'claude-sonnet-4-5'], ['Opus', 'claude-opus-4-1']]
const STEP = 25
const SPAN = 8000
const PX = 3
const animOf = (themeId, input) => {
  const frames = []
  const seq = []
  for (let t = 0; t < SPAN; t += STEP) {
    const { source } = crewMini(themeId, { ...input, elapsedMs: t }, PX)
    let i = frames.indexOf(source)
    if (i < 0) i = frames.push(source) - 1
    seq.push(i)
  }
  return `<div class="anim" data-step="${STEP}" data-seq="${seq.join(',')}">${frames.map((f, i) => `<span${i ? ' hidden' : ''}>${f}</span>`).join('')}</div>`
}
const themeSection = theme => {
  const head = `<tr><th></th>${ROLES.map(r => `<th>${r}</th>`).join('')}</tr>`
  const body = personas
    .map(p => {
      const cells = ROLES.map(role => {
        const minis = MODELS.map(([label, model]) => `<div class="hat">${animOf(theme.id, { persona: p, role, model, effort: null, status: 'running' })}<div class="cap">${label}</div></div>`)
        const still = crewMini(theme.id, { persona: p, role, model: MODELS[1][1], effort: null, status: 'done', elapsedMs: 0 }, PX).source
        return `<td>${minis.join('')}<div class="hat">${still}<div class="cap">done</div></div></td>`
      })
      return `<tr><th>${p.name}</th>${cells.join('')}</tr>`
    })
    .join('\n')
  return `<h2>Crew theme: ${theme.name} <small>(${theme.id} · ${theme.size.columns} × ${theme.size.rows}${theme.fps ? ` · up to ${theme.fps} fps` : ' · still'})</small></h2><p class="cap">${theme.description}</p><table>${head}${body}</table>`
}
const themeSections = Object.values(CREW_THEMES).map(themeSection).join('\n')

// One flat still per theme for rasterising: pets down, roles across, Haiku/Sonnet/Opus in each
// role, on a dark band, each member's done still.
const pixels = (frame, palette, s, ox, oy) => {
  let r = ''
  frame.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      if (ch !== '.' && palette[ch]) r += `<rect x="${ox + x * s}" y="${oy + y * s}" width="${(end - x) * s}" height="${s}" fill="${palette[ch]}" stroke="none"/>`
      x = end
    }
  })
  return r
}
const stillSvg = theme => {
  const { columns: w, rows: h } = theme.size
  const s = 3, gap = 6, pad = 12
  const cellW = MODELS.length * (w * s + gap) + pad, cellH = h * s + pad
  const W = pad + ROLES.length * cellW, H = pad + personas.length * cellH
  let b = `<rect width="${W}" height="${H}" fill="#17181d"/>`
  personas.forEach((p, pi) =>
    ROLES.forEach((role, ri) =>
      MODELS.forEach(([, model], mi) => {
        const { frame, palette } = theme.mini({ persona: p, role, model, effort: null, status: 'done', elapsedMs: 0 })
        b += pixels(frame, palette, s, pad + ri * cellW + mi * (w * s + gap), pad + pi * cellH)
      }),
    ),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${b}</svg>`
}

const html = `<!doctype html><meta charset="utf-8"><title>Glitch pets gallery</title>
<style>
body{font:13px system-ui;margin:16px;background:#14161f;color:#e8ebff}
body.light{background:#f0f0f0;color:#222}
table{border-collapse:collapse}td,th{padding:8px;border:1px solid #333;text-align:center;vertical-align:bottom}
th{text-align:left;max-width:160px}.hat{display:inline-block;margin:0 4px}small{opacity:.7;font-weight:normal}.cap{font-size:11px;opacity:.7}
</style>
<button onclick="document.body.classList.toggle('light')">dark / light</button>
<table><tr><th></th>${MOOD_IDS.map(m => `<th>${m}</th>`).join('')}</tr>${rows}</table>
${themeSections}
<script>
for (const a of document.querySelectorAll('.anim[data-seq]')) {
  const s = [...a.children], seq = a.dataset.seq.split(',').map(Number); let k = 0
  setInterval(() => { s[seq[k]].hidden = true; k = (k + 1) % seq.length; s[seq[k]].hidden = false }, Number(a.dataset.step))
}
for (const a of document.querySelectorAll('.anim:not([data-seq])')) {
  const s = [...a.children]; let i = 0
  setInterval(() => { s[i].hidden = true; i = (i + 1) % s.length; s[i].hidden = false }, 1000 / Number(a.dataset.fps))
}
</script>`
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
for (const theme of Object.values(CREW_THEMES)) writeFileSync(join(dirname(out), `crew-theme-${theme.id}.svg`), stillSvg(theme))
console.log(`gallery: ${personas.length} pets, ${Object.keys(CREW_THEMES).length} crew themes → ${out}`)
