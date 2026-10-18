// The fishing-rod reward: when a crew member finishes, the lead does its flourish, casts a line
// down the pane and lowers a gift to that member's row, which keeps it as a badge. Pure.
//
// The moment is drawn frame by frame by the pane: rewardFrame gives the STATIC Svg for a time t
// into the moment, and rewardFrameTimes the next time that drawing changes, so the pane's frame
// clock redraws exactly then (the flourish at its own fps, the line, the gift and the reel at about
// 10 fps). No SMIL: the desktop draws an Svg as an image, so an animation inside it never plays.
// Every frame has the same box (one absolutely placed overlay from the lead down past the
// receiver). Reduced motion, and any time past the moment's end, draw the end state: the lead
// with its rod put away and the gift by the receiver, no line. The overlay draws the lead itself,
// so while it is up the pane leaves out its own lead sprite.
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

/** The line, the gift's slide and the reel are sampled at about 10 fps (the pane's 100 ms tick). */
const TWEEN_MS = 100
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)
const easeIn = (u: number): number => u * u
const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u)
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u

/** Sample times of a tween from a to b (its first frame, at a, is the pose before it): a + step, ..., b. */
function tween(a: number, b: number): number[] {
  const n = Math.max(1, Math.round((b - a) / TWEEN_MS))
  return Array.from({ length: n }, (_, k) => Math.round(a + ((k + 1) * (b - a)) / n))
}

/** Every time (ms from the start) the moment's drawing changes, ascending, from 0. */
function changeTimes(receiverIndex: number, flourishFrames: number, flourishFps: number): number[] {
  const t = rewardTimeline(receiverIndex)
  const period = 1000 / Math.max(1, flourishFps)
  const out = new Set<number>()
  for (let k = 0; k < flourishFrames; k++) if (k * period < t.grab) out.add(Math.round(k * period))
  for (const x of [t.grab, t.flick, t.cast, t.release, t.stow]) out.add(x)
  for (const x of [...tween(t.cast, t.land), ...tween(t.release, t.caught), ...tween(t.reel, t.stow)]) out.add(x)
  for (let k = 0; k <= SPARKS.length; k++) out.add(Math.min(t.caught + k * SPARK_STEP_MS, t.stow))
  return [...out].filter(x => x <= t.end).sort((x, y) => x - y)
}

const DEFAULT_FLOURISH = { frames: 6, fps: 5 }

/**
 * The next time (ms from the moment's start) after `t` that the drawing changes, or null when it
 * will not change again (the moment is drawn out, or reduced motion draws only the end state).
 * The flourish's frame count and fps come from the lead's `pleased` mood (default 6 at 5 fps).
 */
export function rewardFrameTimes(receiverIndex: number, t: number, reducedMotion = false, flourish: { frames: number; fps: number } = DEFAULT_FLOURISH): number | null {
  if (reducedMotion || receiverIndex < 0) return null
  return changeTimes(receiverIndex, flourish.frames, flourish.fps).find(x => x > t) ?? null
}

export type RewardFrameInput = Omit<RewardInput, 'now'> & {
  /** Ms since the moment's start (now - startedAt). */
  t: number
}

/**
 * The moment's drawing at `t` ms into it: one static Svg (no SMIL), the same box at every t. A
 * time between two change times draws the earlier one's frame. Null for no receiver or once the
 * slot (REWARD_MS) is over.
 */
export function rewardFrame(i: RewardFrameInput): RewardOverlay | null {
  if (i.receiverIndex < 0 || i.t >= REWARD_MS) return null
  const p = i.persona
  const pal = p.palette
  const T = rewardTimeline(i.receiverIndex)
  const flourish = p.moods.pleased.frames
  const fps = p.moods.pleased.fps
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

  // The frame shown at t is the one from the last change at or before it.
  const changes = changeTimes(i.receiverIndex, flourish.length, fps)
  const t = (i.reducedMotion ? changes : changes.filter(x => x <= Math.max(0, i.t))).pop() ?? 0
  const lineColor = i.lineColor ?? '#8a90a8'
  const group = (name: string, body: string, extra = ''): string => `<g data-part="${name}"${extra}>${body}</g>`
  const vline = (x: number, y1: number, y2: number): string => group('line', `<line x1="${n2(x)}" y1="${n2(y1)}" x2="${n2(x)}" y2="${n2(y2)}" stroke="${lineColor}" stroke-width="1"/>`)
  let s = ''

  // The lead: its flourish, then the rod up, the cast, bent under the gift, up again, put away.
  let leadFrame: Frame
  let poseName: string
  if (t < T.grab) {
    const k = Math.min(flourish.length - 1, Math.floor((t * fps) / 1000 + 1e-9))
    leadFrame = flourish[k] ?? p.rod.stowed
    poseName = `flourish-${k}`
  } else if (t < T.flick) [leadFrame, poseName] = [p.rod.hold.frame, 'hold']
  else if (t < T.cast) [leadFrame, poseName] = [p.rod.flick.frame, 'flick']
  else if (t < T.release) [leadFrame, poseName] = [p.rod.bent.frame, 'bent']
  else if (t < T.stow) [leadFrame, poseName] = [p.rod.hold.frame, 'hold']
  else [leadFrame, poseName] = [p.rod.stowed, 'stowed']
  s += group('lead', rects(pal, leadFrame, lx, ly, px), ` data-pose="${poseName}"`)

  if (t >= T.cast && t < T.release) {
    // The line drops from the bent tip with the gift on the hook, easing out, and hangs there.
    const yEnd = t < T.land ? lerp(yb + 2, yLand, easeOut(clamp01((t - T.cast) / (T.land - T.cast)))) : yLand
    s += vline(xb, yb, yEnd)
    s += group('gift', rects(pal, GIFT, xb - giftW / 2, yEnd, gpx))
  } else if (t >= T.release) {
    // The gift slides off the hook into the member's arms and stays: the end state.
    const u = easeOut(clamp01((t - T.release) / (T.caught - T.release)))
    s += group('gift', rects(pal, GIFT, lerp(xb - giftW / 2, gx, u), lerp(yLand, gy, u), gpx))
    if (t < T.stow) {
      // The empty hook hangs, then reels back up as the rod straightens.
      const yHook = t < T.reel ? yLand : lerp(yLand, yh + 2, easeIn(clamp01((t - T.reel) / (T.stow - T.reel))))
      s += vline(xh, yh, yHook)
      s += group('hook', `<path d="M${n2(xh)} ${n2(yHook)}v3h-2v-1.5" fill="none" stroke="${lineColor}" stroke-width="1"/>`)
    }
    // The catch: a sparkle grows and bursts by the mini's head and above the gift.
    const k = Math.floor((t - T.caught) / SPARK_STEP_MS)
    const sp = t >= T.caught && t < T.stow ? SPARKS[k] : undefined
    if (sp) {
      const h = (sp.length * gpx) / 2
      s += group('spark', `${rects(pal, sp, miniLeft + 2 * gpx - h, my + 2 * gpx - h, gpx)}${rects(pal, sp, gx + giftW / 2 - h, gy - 2 * gpx - h, gpx)}`)
    }
  }
  // data-moment and data-t are inert: they name the moment and the frame drawn.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-moment="${i.startedAt}" data-t="${t}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">${s}</svg>`
  return { svg, width, height, top, left }
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
