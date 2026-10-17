import { expect, test } from 'claude-code/testing'

import { DEFAULT_TIERS } from './behavior/tiers'
import { parsePetsConfig } from './config'

test('defaults when nothing is set', () => {
  const { config, problems } = parsePetsConfig({})
  expect(config).toEqual({ pet: 'bud', voice: true, voiceEveryMs: 180_000, tiredMs: 600_000, sleepyMs: 600_000, crewPane: 'auto', crewReview: true, crewTiers: DEFAULT_TIERS })
  expect(problems).toEqual([])
})

test('values are read and converted to ms', () => {
  const { config } = parsePetsConfig({ pet: 'fork', voice: false, voiceEveryMinutes: 1, tiredMinutes: 2, sleepyMinutes: 30 })
  expect(config.pet).toBe('fork')
  expect(config.voice).toBe(false)
  expect(config.voiceEveryMs).toBe(60_000)
  expect(config.tiredMs).toBe(120_000)
  expect(config.sleepyMs).toBe(1_800_000)
})

test('bad values fall back to defaults and are reported', () => {
  const { config, problems } = parsePetsConfig({ pet: 'dragon', voiceEveryMinutes: -1, tiredMinutes: 'abc', sleepyMinutes: 0 })
  expect(config.pet).toBe('bud')
  expect(config.voiceEveryMs).toBe(180_000)
  expect(config.tiredMs).toBe(600_000)
  expect(config.sleepyMs).toBe(600_000)
  expect(problems.length).toBe(4)
})

test('off is a valid pet', () => {
  expect(parsePetsConfig({ pet: 'off' }).config.pet).toBe('off')
})

test('crewTiers: a JSON table is read; a bad one keeps the defaults and is reported', () => {
  const ok = parsePetsConfig({ crewTiers: '{"light":{"model":"claude-sonnet-5-5","effort":"low"}}' })
  expect(ok.problems).toEqual([])
  expect(ok.config.crewTiers.light).toEqual({ model: 'claude-sonnet-5-5', effort: 'low' })
  expect(ok.config.crewTiers.heavy).toEqual(DEFAULT_TIERS.heavy)
  const bad = parsePetsConfig({ crewTiers: '{"heavy":{"effort":"max"}}' })
  expect(bad.config.crewTiers).toEqual(DEFAULT_TIERS)
  expect(bad.problems).toEqual(['crewTiers.heavy.effort must be low, medium or high (xhigh and max are only step-up rungs)'])
  expect(parsePetsConfig({ crewTiers: '' }).problems).toEqual([])
})
