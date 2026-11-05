// Every pet's first happy frame and its name, in one strip, for docs/images/pets.png.
// Usage, from the repo root: node .claude/skills/new-pet/roster.mjs   (Node 22.15 or later)
// Writes .superpowers/gallery/roster.html; screenshot the #strip element.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PET_IDS } from '../../../plugins/glitch-pets/hooks/behavior/types.ts'
import { frameSvg } from '../../../plugins/glitch-pets/hooks/behavior/player.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const pets = []
for (const id of PET_IDS) {
  try {
    pets.push((await import(`../../../plugins/glitch-pets/hooks/personas/${id}.ts`)).default)
  } catch (err) {
    console.error(`skipped ${id}: ${err?.message ?? err}`)
  }
}

// 8 px per pet pixel: 128×104 per pet.
const cell = p => `<div class="pet">${frameSvg(p.palette, p.moods.happy.frames[0], 8)}<div class="name">${p.name}</div></div>`
const html = `<!doctype html><meta charset="utf-8"><title>Glitch pets roster</title>
<style>
body{margin:0;padding:20px;background:#fff}
#strip{display:inline-flex;gap:44px;padding:36px 52px 30px;background:#12141c;border-radius:18px;font-family:"Segoe UI",system-ui,sans-serif}
.pet{display:flex;flex-direction:column;align-items:center;gap:14px}
.name{color:#e6e8f0;font-size:17px;font-weight:600}
</style>
<div id="strip">${pets.map(cell).join('')}</div>`

const out = join(root, '.superpowers', 'gallery', 'roster.html')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html)
console.log(`roster: ${pets.length} pets → ${out}`)
