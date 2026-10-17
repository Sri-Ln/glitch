// The rules every persona file must keep. The persona tests run it on each pet,
// and register.tsx skips a pet that breaks it.
import type { Frame, Persona } from './types'
import { GRID, LEAD_SITUATIONS, MOOD_IDS, VOICE_MOMENTS } from './types'

const HEX = /^#[0-9a-f]{6}$/i
const RESERVED = ['1', '2', '3']
const LAPTOP_KEYS = ['4', '6', '7']

/** `composed`: the persona already went through withLaptop, so it holds the laptop's keys by design. */
export function personaProblems(p: Persona, opts: { composed?: boolean } = {}): string[] {
  const out: string[] = []
  for (const [key, color] of Object.entries(p.palette)) {
    if (RESERVED.includes(key)) out.push(`palette key "${key}" is reserved for hats`)
    if (!opts.composed && LAPTOP_KEYS.includes(key)) out.push(`palette key "${key}" is reserved for the laptop`)
    if (key === '.' || key.length !== 1) out.push(`palette key "${key}" must be one char other than "."`)
    if (!HEX.test(color)) out.push(`palette "${key}" must be #rrggbb, got ${color}`)
  }
  const frameProblems = (label: string, frame: Frame) => {
    if (frame.length !== GRID.height) out.push(`${label} has ${frame.length} rows, not ${GRID.height}`)
    frame.forEach((row, y) => {
      if (row.length !== GRID.width) out.push(`${label} row ${y} is ${row.length} wide, not ${GRID.width}`)
      for (const ch of row) if (ch !== '.' && !(ch in p.palette)) out.push(`${label} row ${y} uses "${ch}", not in the palette`)
    })
  }
  for (const mood of MOOD_IDS) {
    const art = p.moods[mood]
    if (!art) {
      out.push(`mood ${mood} is missing`)
      continue
    }
    if (!(art.fps > 0)) out.push(`${mood} fps must be above 0`)
    if (art.frames.length === 0) out.push(`${mood} has no frames`)
    art.frames.forEach((frame, f) => frameProblems(`${mood} frame ${f}`, frame))
  }
  if (!p.rod) out.push('rod is missing')
  else {
    for (const pose of ['hold', 'flick', 'bent'] as const) {
      const r = p.rod[pose]
      if (!r?.frame || !r.tip) {
        out.push(`rod ${pose} is missing`)
        continue
      }
      frameProblems(`rod ${pose}`, r.frame)
      if (!(r.tip.x >= 0 && r.tip.x < GRID.width && r.tip.y >= 0 && r.tip.y < GRID.height)) out.push(`rod ${pose} tip must be inside the 16 × 13 grid`)
    }
    if (!p.rod.stowed) out.push('rod stowed is missing')
    else frameProblems('rod stowed', p.rod.stowed)
  }
  for (const [situation, text] of Object.entries(p.leadStatus ?? {})) {
    if (!(LEAD_SITUATIONS as readonly string[]).includes(situation)) out.push(`leadStatus "${situation}" is not a lead situation`)
    if (typeof text !== 'string' || !text.trim()) out.push(`leadStatus ${situation} must be some text`)
  }
  for (const moment of VOICE_MOMENTS) {
    const lines = p.voice[moment]
    if (!lines || lines.length < 3 || lines.length > 5) out.push(`voice ${moment} needs 3 to 5 lines`)
  }
  if (!(p.laptopPaw in p.palette)) out.push(`laptopPaw "${p.laptopPaw}" is not in the palette`)
  const { x, y } = p.hatAnchor
  if (!(x >= 0 && x < GRID.width && y >= 0 && y < GRID.height)) out.push('hatAnchor must be inside the 16 × 13 grid')
  return out
}
