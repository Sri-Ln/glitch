import { expect, test } from 'claude-code/testing'

import { crewMini } from '../crew-themes/index'
import { PERSONAS } from '../personas/index'
import { HOP_MS, SPARK_STEP_MS, isHopping, nextSparkIn, withSparkle } from './sparkle'
import { PET_IDS } from './types'

const MINI = { source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 13" width="48" height="26"><rect x="0" y="0" width="1" height="1" fill="#000"/></svg>', alt: 'Bud the dog, happy', width: 48, height: 26 }

test('a done row hops for HOP_MS from its end; a failed or running one never', () => {
  expect(isHopping({ status: 'done', endedAt: 1000 }, 1000)).toBe(true)
  expect(isHopping({ status: 'done', endedAt: 1000 }, 1000 + HOP_MS - 1)).toBe(true)
  expect(isHopping({ status: 'done', endedAt: 1000 }, 1000 + HOP_MS)).toBe(false)
  expect(isHopping({ status: 'done', endedAt: 1000 }, 999)).toBe(false)
  expect(isHopping({ status: 'failed', endedAt: 1000 }, 1100)).toBe(false)
  expect(isHopping({ status: 'running', endedAt: null }, 1100)).toBe(false)
})

test('the sparkle is laid into the mini\'s own image: same box, an inert sparkle group, twinkling by step', () => {
  const a = withSparkle(MINI, { Y: '#ffd23f', C: '#ff4f8b' }, 0)
  const b = withSparkle(MINI, { Y: '#ffd23f', C: '#ff4f8b' }, SPARK_STEP_MS)
  expect([a.width, a.height, a.alt]).toEqual([48, 26, MINI.alt])
  expect(a.source).toContain('viewBox="0 0 24 13"')
  expect(a.source).toContain('<g data-part="sparkle">')
  expect(a.source.endsWith('</svg>')).toBe(true)
  expect(a.source).not.toBe(b.source)
  expect(a.source).not.toMatch(/<(set|animate)/)
  // Missing palette keys fall back to fixed colors.
  expect(withSparkle(MINI, {}, 0).source).toMatch(/fill="#[0-9a-f]{6}"/)
})

test('the next sparkle change comes within a step, and none once the hop is over', () => {
  expect(nextSparkIn(0)).toBe(SPARK_STEP_MS)
  expect(nextSparkIn(100)).toBe(SPARK_STEP_MS - 100)
  expect(nextSparkIn(HOP_MS - 50)).toBe(50)
  expect(nextSparkIn(HOP_MS)).toBe(null)
})


const sparkRects = (src: string) => [...(src.match(/<g data-part="sparkle">(.*?)<\/g>/)?.[1] ?? '').matchAll(/<rect x="(-?\d+)" y="(-?\d+)"/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
const viewOf = (src: string) => src.match(/viewBox="0 0 (\d+) (\d+)"/)!.slice(1).map(Number) as [number, number]

test('the sparkle stays inside each theme\'s mini (hats is 16 wide) and clear of the hat rows, at every step', () => {
  for (const theme of ['busy-hands', 'hats']) {
    for (const id of PET_IDS) {
      const persona = PERSONAS[id]
      if (!persona) continue
      const mini = crewMini(theme, { persona, role: 'builder', model: 'claude-haiku-5-5', effort: 'low', status: 'done', elapsedMs: 0 }, 2)
      const [w, h] = viewOf(mini.source)
      // The hat's rows in a hatted frame: the 3 added rows shifted down by the anchor; the brim is the last.
      const brim = h > 13 ? persona.hatAnchor.y + 2 : -1
      for (const t of [0, SPARK_STEP_MS, 2 * SPARK_STEP_MS]) {
        const rects = sparkRects(withSparkle(mini, persona.palette, t, persona.hatAnchor).source)
        expect(rects.length).toBeGreaterThan(0)
        for (const r of rects) {
          expect(r.x >= 0 && r.x < w).toBe(true)
          expect(r.y >= 0 && r.y < h).toBe(true)
          expect(r.y).toBeGreaterThan(brim)
        }
      }
    }
  }
})
