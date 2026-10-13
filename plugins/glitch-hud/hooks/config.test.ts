import { expect, test } from 'claude-code/testing'

import { DEFAULT_CONFIG, parseConfig, parseMarks, parseParts } from './config'

test('config: defaults when nothing is set', async () => {
  expect(parseConfig({})).toEqual({ config: DEFAULT_CONFIG, problems: [] })
  expect(DEFAULT_CONFIG.parts).toEqual(['turn', 'speed', 'cost', 'cache', 'context', 'git'])
  expect(DEFAULT_CONFIG.cacheWarnMinutes).toEqual([10, 5])
  expect(DEFAULT_CONFIG.cacheTtlMs).toBe(60 * 60_000)
})

test('config: a 5-minute cache lifetime drops the marks it can never reach', async () => {
  const { config, problems } = parseConfig({ cacheTtlMinutes: '5', cacheWarnMinutes: '10,5,3,1' })
  expect(config.cacheTtlMs).toBe(5 * 60_000)
  expect(config.cacheWarnMinutes).toEqual([3, 1])
  expect(problems).toEqual(['cacheWarnMinutes: marks at or above the cache lifetime are ignored'])
  expect(parseConfig({ cacheTtlMinutes: '5', cacheWarnMinutes: '3' }).problems).toEqual([])
  expect(parseConfig({ cacheTtlMinutes: 60 }).config.cacheTtlMs).toBe(60 * 60_000)
})

test('config: an unknown cache lifetime falls back to 60 minutes', async () => {
  const { config, problems } = parseConfig({ cacheTtlMinutes: '30' })
  expect(config.cacheTtlMs).toBe(60 * 60_000)
  expect(problems).toEqual(['cacheTtlMinutes: must be 60 or 5, using 60'])
})

test('config: parts keep the given order and drop duplicates', async () => {
  expect(parseParts('cache, cost,cache')).toEqual(['cache', 'cost'])
  expect(parseParts('cost,,bogus')).toBeNull()
  expect(parseParts('')).toBeNull()
})

test('config: warning marks are sorted high to low and bounded', async () => {
  expect(parseMarks('5,10,5')).toEqual([10, 5])
  expect(parseMarks('abc')).toBeNull()
  expect(parseMarks('0')).toBeNull()
  expect(parseMarks('60')).toBeNull()
})

test('config: numbers and booleans also arrive as strings', async () => {
  const { config, problems } = parseConfig({ budgetSession: '5', budgetDaily: 20, budgetBlocksAgents: 'true', autoWarm: true, autoWarmMaxIdle: '30' })
  expect(problems).toEqual([])
  expect(config.budgetSession).toBe(5)
  expect(config.budgetDaily).toBe(20)
  expect(config.budgetBlocksAgents).toBe(true)
  expect(config.autoWarm).toBe(true)
  expect(config.autoWarmMaxIdle).toBe(30)
})

test('config: every bad value falls back and is named', async () => {
  const { config, problems } = parseConfig({ parts: 'cost,,bogus', budgetSession: '-3', cacheWarnMinutes: 'abc', notify: 'pigeon', autoWarmMaxIdle: 'x' })
  expect(config).toEqual(DEFAULT_CONFIG)
  expect(problems).toEqual([
    'parts: unknown or empty entry, using default',
    'budgetSession: must be a number ≥ 0, using 0',
    'cacheWarnMinutes: must be minutes between 1 and 59, using 10,5',
    'notify: must be windows, toast or off, using windows',
    'autoWarmMaxIdle: must be a number ≥ 0, using 120',
  ])
})

test('config: Parts counts as chosen only when it differs from the default', async () => {
  expect(parseConfig({ parts: 'turn,speed,cost,cache,context,git' }).config.partsExplicit).toBe(false)
  expect(parseConfig({ parts: 'cost,cache,git' }).config.partsExplicit).toBe(true)
  expect(parseConfig({ parts: 'bogus' }).config.partsExplicit).toBe(false)
})
