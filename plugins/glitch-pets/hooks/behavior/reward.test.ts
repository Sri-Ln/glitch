import { expect, test } from 'claude-code/testing'

import { PERSONAS } from '../personas/index'
import { REWARD_MS } from './reactions'
import { rewardBadge, rewardFrame, rewardFrameTimes, rewardTimeline } from './reward'
import type { RewardFrameInput, RewardInput } from './reward'

const T = 1_000_000
const fork = PERSONAS.fork!
const input = (over: Partial<RewardInput> = {}): RewardInput => ({
  persona: fork,
  receiverIndex: 2,
  // The pane's geometry: the lead's sprite at (12, 40), rows of 40 px from y 100, minis at x 12.
  rowTop: i => 100 + i * 40,
  leadBox: { left: 12, top: 40, width: 24, height: 20 },
  startedAt: T,
  now: T + 100,
  reducedMotion: false,
  ...over,
})

const frameAt = (t: number, over: Partial<RewardFrameInput> = {}) => rewardFrame({ ...input(), t, ...over })!
/** The parts a frame draws, by their data-part markers. */
const part = (svg: string, name: string): string | undefined => svg.match(new RegExp(`<g data-part="${name}"[^>]*>[\\s\\S]*?</g>`))?.[0]
const pose = (svg: string): string | undefined => svg.match(/data-part="lead" data-pose="([^"]+)"/)?.[1]
const lineEnd = (svg: string): number | undefined => {
  const m = part(svg, 'line')?.match(/y2="([\d.]+)"/)
  return m ? Number(m[1]) : undefined
}
const giftTop = (svg: string): number => Math.min(...[...(part(svg, 'gift') ?? '').matchAll(/ y="([\d.]+)"/g)].map(m => Number(m[1])))
const noSmil = (svg: string) => {
  expect(svg).not.toMatch(/<(set|animate|animateTransform|animateMotion)\b/)
  expect(svg).not.toContain('begin=')
  expect(svg).not.toContain('@keyframes')
}

test('the timeline: flourish, rod up, cast, the line down (longer for a deeper row), caught, reel, put away', () => {
  const a = rewardTimeline(0)
  expect([a.grab, a.flick, a.cast]).toEqual([1200, 1350, 1500])
  expect(a.land).toBe(2000)
  expect(a.end).toBe(3500)
  const c = rewardTimeline(2)
  expect(c.land).toBe(2300)
  expect(c.end).toBe(3800)
  for (const t of [a, c]) {
    expect(t.cast < t.land && t.land < t.release && t.release < t.caught && t.caught < t.reel && t.reel < t.stow && t.stow < t.end).toBe(true)
  }
  // However deep the row, the moment fits its slot (about 3.5-4 s).
  expect(rewardTimeline(30).end).toBeLessThanOrEqual(REWARD_MS)
})

test('each frame is a static Svg: no SMIL, no CSS animation, at any time of the moment', () => {
  for (let t = 0; t < REWARD_MS; t += 37) {
    const f = frameAt(t)
    expect(f.svg.startsWith('<svg')).toBe(true)
    noSmil(f.svg)
  }
  noSmil(frameAt(500, { reducedMotion: true }).svg)
})

test('the frames at the key times: flourish, rod up, cast, line mid-way, landed, caught, reeling, done', () => {
  const T = rewardTimeline(2)
  const flourishA = frameAt(100).svg
  const flourishB = frameAt(700).svg
  const rodUp = frameAt(T.grab + 50).svg
  const cast = frameAt(T.flick + 50).svg
  const mid = frameAt(Math.round((T.cast + T.land) / 2)).svg
  const landed = frameAt(T.land + 50).svg
  const caught = frameAt(T.caught + 100).svg
  const reeling = frameAt(Math.round((T.reel + T.stow) / 2)).svg
  const done = frameAt(T.end + 50).svg
  // The lead: its flourish at its own fps, then the rod poses, then put away.
  expect(pose(flourishA)).toBe('flourish-0')
  expect(pose(flourishB)).toBe(`flourish-${Math.floor(0.7 * fork.moods.pleased.fps)}`)
  expect(flourishA).not.toBe(flourishB)
  expect([pose(rodUp), pose(cast), pose(mid), pose(landed), pose(caught), pose(reeling), pose(done)]).toEqual(['hold', 'flick', 'bent', 'bent', 'hold', 'hold', 'stowed'])
  // No line before the cast or once it is reeled in.
  for (const f of [flourishA, rodUp, cast, done]) expect(part(f, 'line')).toBeUndefined()
  // The line drops: mid-way it is shorter than landed, and the gift hangs on it, above the row.
  const midEnd = lineEnd(mid)!
  const landEnd = lineEnd(landed)!
  expect(midEnd).toBeLessThan(landEnd)
  expect(landEnd).toBe(100 + 2 * 40 - 40 + 2)
  expect(giftTop(mid)).toBeLessThan(giftTop(landed))
  // Caught: the gift is in the mini's arms (where it ends), a sparkle shows, the empty hook hangs.
  expect(part(caught, 'gift')).toBe(part(done, 'gift'))
  expect(part(caught, 'spark')).toBeTruthy()
  expect(part(caught, 'hook')).toBeTruthy()
  expect(part(landed, 'spark')).toBeUndefined()
  // Reeling: the hook goes back up, the line shorter than at the catch.
  expect(lineEnd(reeling)!).toBeLessThan(lineEnd(caught)!)
  // Done is the end state, as reduced motion draws it.
  expect(done).toBe(frameAt(T.end + 50, { reducedMotion: true }).svg)
  expect(part(done, 'hook')).toBeUndefined()
  expect(part(done, 'spark')).toBeUndefined()
  // All key frames differ from one another.
  const all = [flourishA, flourishB, rodUp, cast, mid, landed, caught, reeling, done]
  expect(new Set(all).size).toBe(all.length)
})

test('rewardFrameTimes: the next change, at the flourish\'s fps, about 10 fps for the line and the gift, then none', () => {
  const T = rewardTimeline(2)
  const times: number[] = []
  for (let t: number | null = 0; t !== null; t = rewardFrameTimes(2, t)) times.push(t)
  expect(times[0]).toBe(0)
  // Strictly increasing, and nothing after the moment's end.
  for (let k = 1; k < times.length; k++) expect(times[k]! > times[k - 1]!).toBe(true)
  expect(times[times.length - 1]!).toBeLessThanOrEqual(T.end)
  expect(rewardFrameTimes(2, T.end)).toBe(null)
  expect(rewardFrameTimes(2, REWARD_MS + 5)).toBe(null)
  // The flourish at its own fps.
  const period = 1000 / fork.moods.pleased.fps
  expect(times.filter(t => t < T.grab)).toEqual(fork.moods.pleased.frames.map((_, k) => Math.round(k * period)).filter(t => t < T.grab))
  // The line's travel, the slide and the reel at about 10-12 fps: no gap over 100 ms, none under 80
  // (the sparkle's own 220 ms steps fall where they fall).
  const sparks = [0, 1, 2, 3].map(k => T.caught + 220 * k)
  for (const [a, b] of [[T.cast, T.land], [T.release, T.caught], [T.reel, T.stow]] as const) {
    // From the tween's start (its first frame is the pose before it) to its end.
    const inside = [a, ...times.filter(t => t > a && t <= b && (t === b || !sparks.includes(t)))]
    expect(inside[inside.length - 1]).toBe(b)
    for (let k = 1; k < inside.length; k++) {
      expect(inside[k]! - inside[k - 1]!).toBeLessThanOrEqual(100)
      expect(inside[k]! - inside[k - 1]!).toBeGreaterThanOrEqual(80)
    }
  }
  // Every change time is a real change, and the drawing holds between two of them.
  for (let k = 1; k < times.length; k++) {
    expect(frameAt(times[k]!).svg).not.toBe(frameAt(times[k]! - 1).svg)
    expect(frameAt(times[k - 1]!).svg).toBe(frameAt(times[k]! - 1).svg)
  }
  // Under reduced motion nothing changes.
  expect(rewardFrameTimes(2, 0, true)).toBe(null)
})

test('one box for the whole moment: every frame has the same size and place; gone once the slot ends', () => {
  const first = frameAt(0)
  for (let t = 0; t < REWARD_MS; t += 50) {
    const f = frameAt(t)
    expect([f.width, f.height, f.top, f.left]).toEqual([first.width, first.height, first.top, first.left])
  }
  expect(rewardFrame({ ...input(), t: REWARD_MS - 1 })).not.toBe(null)
  expect(rewardFrame({ ...input(), t: REWARD_MS })).toBe(null)
  expect(rewardFrame({ ...input({ receiverIndex: -1 }), t: 0 })).toBe(null)
})

test('frames are keyed by their moment (data-moment), so back-to-back moments differ', () => {
  const a = frameAt(10).svg
  const b = frameAt(10, { startedAt: T + REWARD_MS }).svg
  expect(a).toContain(`data-moment="${T}"`)
  expect(b).toContain(`data-moment="${T + REWARD_MS}"`)
  expect(a).not.toBe(b)
})

test('it sits over the lead and reaches down past the receiver, in the pane coordinates given', () => {
  const o = frameAt(0)
  expect(o.left).toBe(12)
  expect(o.top).toBe(40)
  expect(o.top + o.height).toBeGreaterThanOrEqual(100 + 2 * 40 + 24)
  expect(o.svg).toContain(`width="${o.width}" height="${o.height}"`)
})

test('reduced motion draws the end state at any time: the lead with its rod away, the gift by the receiver, no line', () => {
  const end = frameAt(rewardTimeline(2).end, { reducedMotion: true }).svg
  for (const t of [0, 800, 1600, 2400, 3200]) expect(frameAt(t, { reducedMotion: true }).svg).toBe(end)
  expect(pose(end)).toBe('stowed')
  expect(part(end, 'line')).toBeUndefined()
  expect(part(end, 'gift')).toBeTruthy()
})

test('the gift ends beside the receiver: inside its row, by the mini', () => {
  const calm = frameAt(0, { reducedMotion: true }).svg
  const ys = [...part(calm, 'gift')!.matchAll(/ y="([\d.]+)"/g)].map(m => Number(m[1]) + 40)
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(180)
  expect(Math.max(...ys)).toBeLessThan(180 + 24)
})

test('every pet can play it', () => {
  const T2 = rewardTimeline(2)
  for (const p of Object.values(PERSONAS)) {
    const mid = rewardFrame({ ...input({ persona: p! }), t: Math.round((T2.cast + T2.land) / 2) })
    expect(part(mid!.svg, 'line')).toBeTruthy()
    expect(pose(mid!.svg)).toBe('bent')
  }
})

test('the kept gift as a small badge for the row', () => {
  const b = rewardBadge(fork)
  expect(b.width).toBe(8)
  expect(b.height).toBe(9)
  expect(b.source).toContain(fork.palette.C!)
  expect(b.alt).toBe('a gift from Fork')
})
