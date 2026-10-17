// Frames to images. Pure, and gallery-safe: only type imports, so Node can load it.
import type { Frame, MoodArt, MoodId, Persona, Sprite } from './types'

/** CSS px per sprite pixel in the band: a 16 × 13 pet draws 24 × 20, about the HUD row's height. */
export const PIXEL = 1.5
const W = 16

export const frameIndex = (art: MoodArt, elapsedMs: number): number =>
  Math.floor((Math.max(0, elapsedMs) * art.fps) / 1000) % art.frames.length

/** One frame as an SVG document: one rect per run of a color within a row. As wide as its rows (16 for a pet; a crew mini may be wider). */
export function frameSvg(palette: Readonly<Record<string, string>>, frame: Frame, pixel: number): string {
  let rects = ''
  frame.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x] as string
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const color = palette[ch]
      if (ch !== '.' && color) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`
      x = end
    }
  })
  const h = frame.length
  const w = frame[0]?.length ?? W
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w * pixel)}" height="${Math.round(h * pixel)}" shape-rendering="crispEdges">${rects}</svg>`
}

/** Builds each (pet, mood, frame, size) image once; a tick only picks which. */
export function createPlayer(): { sprite(p: Persona, mood: MoodId, elapsedMs: number, pixel?: number): Sprite } {
  const cache = new Map<string, Sprite>()
  return {
    sprite(p, mood, elapsedMs, pixel = PIXEL) {
      const art = p.moods[mood]
      const i = frameIndex(art, elapsedMs)
      const key = `${p.id}|${mood}|${i}|${pixel}`
      let s = cache.get(key)
      if (!s) {
        const frame = art.frames[i] as Frame
        s = { source: frameSvg(p.palette, frame, pixel), alt: `${p.name} the ${p.kind}, ${mood}`, width: Math.round(W * pixel), height: Math.round(frame.length * pixel) }
        cache.set(key, s)
      }
      return s
    },
  }
}
