import { expect, test } from 'claude-code/testing'

import { PERSONAS } from '../personas/index'
import { REWARD_MS } from './reactions'
import { rewardBadge, rewardOverlay, rewardTimeline } from './reward'
import type { RewardInput } from './reward'

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

/** What a surface that ignores SMIL draws: hidden elements gone, animation elements gone. */
const staticOf = (svg: string): string =>
  svg.replace(/<(g|line|path)\b[^>]*visibility="hidden"[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<(set|animate|animateTransform)\b[^>]*\/>/g, '')

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

test('one Svg for the whole moment: the same markup on every redraw, gone once it ends', () => {
  const first = rewardOverlay(input())!
  expect(first.svg.startsWith('<svg')).toBe(true)
  expect(rewardOverlay(input({ now: T + 2500 }))!.svg).toBe(first.svg)
  expect(rewardOverlay(input({ now: T + REWARD_MS - 1 }))).not.toBe(null)
  expect(rewardOverlay(input({ now: T + REWARD_MS }))).toBe(null)
  expect(rewardOverlay(input({ receiverIndex: -1 }))).toBe(null)
})

test('back-to-back moments differ in markup (keyed by their start), so a surface restarts the second one', () => {
  const a = rewardOverlay(input())!.svg
  const b = rewardOverlay(input({ startedAt: T + REWARD_MS, now: T + REWARD_MS + 10 }))!.svg
  expect(a).toContain(`data-moment="${T}"`)
  expect(b).toContain(`data-moment="${T + REWARD_MS}"`)
  expect(a).not.toBe(b)
  expect(rewardOverlay(input({ reducedMotion: true }))!.svg).toContain(`data-moment="${T}"`)
})

test('it sits over the lead and reaches down past the receiver, in the pane coordinates given', () => {
  const o = rewardOverlay(input())!
  expect(o.left).toBe(12)
  expect(o.top).toBe(40)
  expect(o.top + o.height).toBeGreaterThanOrEqual(100 + 2 * 40 + 24)
  expect(o.svg).toContain(`width="${o.width}" height="${o.height}"`)
})

test('it animates itself: the line drops and reels, the gift slides into the arms', () => {
  const { svg } = rewardOverlay(input())!
  const t = rewardTimeline(2)
  expect(svg).toContain('<line')
  expect(svg).toContain(`attributeName="y2"`)
  expect(svg).toContain(`begin="${t.cast}ms" dur="${t.land - t.cast}ms"`)
  expect(svg).toContain(`begin="${t.reel}ms" dur="${t.stow - t.reel}ms"`)
  expect(svg).toContain('<animateTransform')
})

test('its static rendering is the end state: no line, no hook, the gift by the receiver and the lead with its rod away', () => {
  const o = rewardOverlay(input())!
  const still = staticOf(o.svg)
  expect(still).not.toContain('<line')
  expect(still).not.toContain('<path')
  expect(still).not.toContain('visibility')
  // Two groups remain: the lead's stowed frame and the gift badge.
  expect(still.match(/<g>/g)?.length).toBe(2)
  // Reduced motion draws exactly that end state, with nothing animated.
  const calm = rewardOverlay(input({ reducedMotion: true }))!
  expect(calm.svg).toBe(still)
  expect(calm.svg).not.toContain('<set')
  expect(calm.svg).not.toContain('<animate')
  expect([calm.width, calm.height, calm.top, calm.left]).toEqual([o.width, o.height, o.top, o.left])
})

test('the gift ends beside the receiver: inside its row, by the mini', () => {
  const calm = rewardOverlay(input({ reducedMotion: true }))!.svg
  const gift = calm.split('<g>')[2]!
  const ys = [...gift.matchAll(/ y="([\d.]+)"/g)].map(m => Number(m[1]) + 40)
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(180)
  expect(Math.max(...ys)).toBeLessThan(180 + 24)
})

test('every pet can play it', () => {
  for (const p of Object.values(PERSONAS)) {
    const o = rewardOverlay(input({ persona: p! }))
    expect(o?.svg).toContain('<animateTransform')
  }
})

test('the kept gift as a small badge for the row', () => {
  const b = rewardBadge(fork)
  expect(b.width).toBe(8)
  expect(b.height).toBe(9)
  expect(b.source).toContain(fork.palette.C!)
  expect(b.alt).toBe('a gift from Fork')
})
