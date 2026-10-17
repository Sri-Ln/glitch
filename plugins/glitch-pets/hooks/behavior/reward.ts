// The fishing-rod reward: when a crew member finishes, the lead does its flourish, casts a line
// down the pane and lowers a gift to that member's row, which keeps it as a badge. Pure.
//
// It is ONE Svg laid over the pane for the moment (REWARD_MS), animated inside itself with SMIL,
// so it never depends on the pane's redraws: the markup is the same on every redraw (it starts
// when the surface first shows it). Its static rendering, on a surface that ignores SMIL, is the
// end state: the lead with its rod put away and the gift by the receiver, no line. Within one moment the
// markup never changes; the next moment's differs (data-moment). Reduced motion
// draws exactly that. The overlay draws the lead itself, so while it is up the pane leaves out its
// own lead sprite.
import type { Persona, Frame, Sprite } from './types'
import { GIFT, SPARKS } from './reward-art'
import { REWARD_MS } from './reactions'

export type Box = { left: number; top: number; width: number; height: number }

export type RewardInput = {
  persona: Persona
  /** The receiving row's index (0 = the first row under the lead). */
  receiverIndex: number
  /** The top of row i's mini sprite, in the same coordinates as leadBox. */
  rowTop: (i: number) => number
  /** Where the lead's sprite is drawn (16 × 13 grid; its width sets the pixel size). */
  leadBox: Box
  /** Where a row's mini is drawn across (left, width) and how tall it is; defaults to under the lead, 24 × 24. */
  mini?: { left: number; width: number; height: number }
  /** The reward's start (clock ms) from rewardAt, and the clock now. */
  startedAt: number
  now: number
  reducedMotion: boolean
  /** The fishing line's colour; a mid grey reads on light and dark. */
  lineColor?: string
}

export type RewardOverlay = { svg: string; width: number; height: number; top: number; left: number }

/** The beats (ms from the start). The descent takes longer the deeper the row; four rows down and beyond take the same. */
export type RewardTimeline = { grab: number; flick: number; cast: number; land: number; release: number; caught: number; reel: number; stow: number; end: number }

export function rewardTimeline(receiverIndex: number): RewardTimeline {
  const depth = Math.min(4, Math.max(1, receiverIndex + 1))
  const grab = 1200
  const flick = grab + 150
  const cast = flick + 150
  const land = cast + 350 + 150 * depth
  const release = land + 150
  const caught = release + 250
  const reel = caught + 300
  const stow = reel + 500
  return { grab, flick, cast, land, release, caught, reel, stow, end: stow + 300 }
}

const SPARK_STEP_MS = 220
const n2 = (n: number): number => Math.round(n * 100) / 100

/** One frame as rects at (x, y), `px` per pixel; '.' and keys missing from the palette are left out. */
function rects(palette: Readonly<Record<string, string>>, frame: Frame, x: number, y: number, px: number): string {
  let out = ''
  frame.forEach((row, yy) => {
    let xx = 0
    while (xx < row.length) {
      const ch = row[xx] as string
      let e = xx + 1
      while (e < row.length && row[e] === ch) e++
      const c = palette[ch]
      if (ch !== '.' && c) out += `<rect x="${n2(x + xx * px)}" y="${n2(y + yy * px)}" width="${n2((e - xx) * px)}" height="${n2(px)}" fill="${c}"/>`
      xx = e
    }
  })
  return out
}

const ms = (n: number): string => `${Math.round(n)}ms`
/** On a hidden element: visible from a to b. */
const during = (a: number, b: number): string => `<set attributeName="visibility" to="visible" begin="${ms(a)}" dur="${ms(b - a)}"/>`
/** On a visible element (the end state): hidden until t. */
const hiddenUntil = (t: number): string => `<set attributeName="visibility" to="hidden" begin="0ms" dur="${ms(t)}"/>`
const EASE_OUT = 'calcMode="spline" keyTimes="0;1" keySplines="0 0 0.58 1"'
const EASE_IN = 'calcMode="spline" keyTimes="0;1" keySplines="0.42 0 1 1"'
const move = (from: [number, number], to: [number, number], a: number, b: number, ease: string): string =>
  `<animateTransform attributeName="transform" type="translate" values="${n2(from[0])} ${n2(from[1])};${n2(to[0])} ${n2(to[1])}" begin="${ms(a)}" dur="${ms(b - a)}" fill="freeze" ${ease}/>`

export function rewardOverlay(i: RewardInput): RewardOverlay | null {
  if (i.receiverIndex < 0 || i.now >= i.startedAt + REWARD_MS) return null
  const p = i.persona
  const pal = p.palette
  const t = rewardTimeline(i.receiverIndex)
  const px = i.leadBox.width / 16
  const mini = i.mini ?? { left: i.leadBox.left, width: 24, height: 24 }
  const gpx = mini.width / 16
  const giftW = GIFT[0]!.length * gpx
  const giftH = GIFT.length * gpx

  // The overlay's own coordinates: (0, 0) is its top-left corner in the pane.
  const left = Math.min(i.leadBox.left, mini.left)
  const top = i.leadBox.top
  const lx = i.leadBox.left - left
  const ly = 0
  const tipAt = (pose: { tip: { x: number; y: number } }): [number, number] => [lx + (pose.tip.x + 0.5) * px, ly + (pose.tip.y + 0.5) * px]
  const [xb, yb] = tipAt(p.rod.bent)
  const [xh, yh] = tipAt(p.rod.hold)
  const my = i.rowTop(i.receiverIndex) - top
  const miniLeft = mini.left - left
  const yLand = my + 2
  // The gift ends in the mini's arms: overlapping its right edge, resting on its bottom.
  const gx = miniLeft + mini.width - giftW * 0.6
  const gy = my + mini.height - giftH
  const width = Math.ceil(Math.max(lx + 16 * px, gx + giftW + 3 * gpx, xb + giftW / 2, xh + giftW / 2)) + 1
  const height = Math.ceil(Math.max(gy + giftH, my + mini.height, ly + 13 * px)) + 2

  const lead = (frame: Frame) => rects(pal, frame, lx, ly, px)
  const endState = `<g>${i.reducedMotion ? '' : hiddenUntil(t.stow)}${lead(p.rod.stowed)}</g>`
  const giftEnd = (anim: string) => `<g>${anim}${rects(pal, GIFT, gx, gy, gpx)}</g>`
  // data-moment is inert: it keys the markup to this moment, so back-to-back moments differ and the second plays from its start.
  const open = `<svg xmlns="http://www.w3.org/2000/svg" data-moment="${i.startedAt}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">`
  if (i.reducedMotion) return { svg: `${open}${endState}${giftEnd('')}</svg>`, width, height, top, left }

  const line = i.lineColor ?? '#8a90a8'
  let s = ''
  // The lead: its flourish, then the rod up, the cast, bent under the gift, up again, put away.
  const flourish = p.moods.pleased.frames
  const step = t.grab / flourish.length
  flourish.forEach((f, k) => (s += `<g visibility="hidden">${during(k * step, (k + 1) * step)}${lead(f)}</g>`))
  const poses: [Frame, number, number][] = [[p.rod.hold.frame, t.grab, t.flick], [p.rod.flick.frame, t.flick, t.cast], [p.rod.bent.frame, t.cast, t.release], [p.rod.hold.frame, t.release, t.stow]]
  for (const [f, a, b] of poses) s += `<g visibility="hidden">${during(a, b)}${lead(f)}</g>`
  s += endState
  // The line drops from the bent tip with the gift on the hook, easing out.
  s += `<line x1="${n2(xb)}" y1="${n2(yb)}" x2="${n2(xb)}" y2="${n2(yLand)}" stroke="${line}" stroke-width="1" visibility="hidden">${during(t.cast, t.release)}<animate attributeName="y2" values="${n2(yb + 2)};${n2(yLand)}" begin="${ms(t.cast)}" dur="${ms(t.land - t.cast)}" fill="freeze" ${EASE_OUT}/></line>`
  s += `<g visibility="hidden">${during(t.cast, t.release)}${move([0, yb + 2 - yLand], [0, 0], t.cast, t.land, EASE_OUT)}${rects(pal, GIFT, xb - giftW / 2, yLand, gpx)}</g>`
  // The gift slides off the hook into the member's arms and stays: the end state.
  s += giftEnd(`${hiddenUntil(t.release)}${move([xb - giftW / 2 - gx, yLand - gy], [0, 0], t.release, t.caught, EASE_OUT)}`)
  // The empty hook hangs, then reels back up and the rod straightens.
  const up = yh + 2 - yLand
  s += `<line x1="${n2(xh)}" y1="${n2(yh)}" x2="${n2(xh)}" y2="${n2(yLand)}" stroke="${line}" stroke-width="1" visibility="hidden">${during(t.release, t.stow)}<animate attributeName="y2" values="${n2(yLand)};${n2(yh + 2)}" begin="${ms(t.reel)}" dur="${ms(t.stow - t.reel)}" fill="freeze" ${EASE_IN}/></line>`
  s += `<path d="M${n2(xh)} ${n2(yLand)}v3h-2v-1.5" fill="none" stroke="${line}" stroke-width="1" visibility="hidden">${during(t.release, t.stow)}${move([0, 0], [0, up], t.reel, t.stow, EASE_IN)}</path>`
  // The catch: a sparkle grows and bursts by the mini's head and above the gift.
  SPARKS.forEach((sp, k) => {
    const h = (sp.length * gpx) / 2
    const a = t.caught + k * SPARK_STEP_MS
    s += `<g visibility="hidden">${during(a, Math.min(a + SPARK_STEP_MS, REWARD_MS))}${rects(pal, sp, miniLeft + 2 * gpx - h, my + 2 * gpx - h, gpx)}${rects(pal, sp, gx + giftW / 2 - h, gy - 2 * gpx - h, gpx)}</g>`
  })
  return { svg: `${open}${s}</svg>`, width, height, top, left }
}

/** The kept gift, as a small sprite for the receiver's row once its moment is over (hasGift). */
export function rewardBadge(p: Pick<Persona, 'palette' | 'name'>, px = 1.5): Sprite {
  const w = Math.round(GIFT[0]!.length * px)
  const h = Math.round(GIFT.length * px)
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GIFT[0]!.length} ${GIFT.length}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects(p.palette, GIFT, 0, 0, 1)}</svg>`,
    alt: `a gift from ${p.name}`,
    width: w,
    height: h,
  }
}
