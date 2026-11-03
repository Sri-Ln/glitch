import { expect, test } from 'claude-code/testing'

import { FIVE_MIN_MS, HOUR_MS, claudeCodeTtl, observedTtl, planTtl, resolveTtl, ttlSummary } from './ttl'

test('ttl: Claude Code settings and env follow its own precedence', async () => {
  expect(claudeCodeTtl({})).toBeUndefined()
  expect(claudeCodeTtl({ settingTtl: '1h' })).toBe(HOUR_MS)
  expect(claudeCodeTtl({ settingTtl: '5m' })).toBe(FIVE_MIN_MS)
  expect(claudeCodeTtl({ settingTtl: '2h' })).toBeUndefined()
  // The env var beats the setting; FORCE beats both; ENABLE_1H comes last.
  expect(claudeCodeTtl({ envTtl: '5m', settingTtl: '1h' })).toBe(FIVE_MIN_MS)
  expect(claudeCodeTtl({ force5m: '1', envTtl: '1h', settingTtl: '1h' })).toBe(FIVE_MIN_MS)
  expect(claudeCodeTtl({ enable1h: '1' })).toBe(HOUR_MS)
  expect(claudeCodeTtl({ enable1h: '1', settingTtl: '5m' })).toBe(FIVE_MIN_MS)
  expect(claudeCodeTtl({ force5m: '0', enable1h: 'false' })).toBeUndefined()
  // Caching turned off: there is no cache to count down.
  expect(claudeCodeTtl({ disabled: '1', settingTtl: '1h' })).toBeNull()
})

test('ttl: the plan follows the rate-limit windows once an answer has reported them', async () => {
  const sub = [{ kind: 'five_hour', percentUsed: 20 }, { kind: 'seven_day', percentUsed: 40 }]
  expect(planTtl([], false)).toBeUndefined()
  expect(planTtl([], true)).toBe(FIVE_MIN_MS)
  expect(planTtl(sub, true)).toBe(HOUR_MS)
  // Past a window's limit the subscription draws on usage credits: 5 minutes.
  expect(planTtl([{ kind: 'five_hour', percentUsed: 100 }], true)).toBe(FIVE_MIN_MS)
  // A gateway's spend limit is not a subscription.
  expect(planTtl([{ kind: 'spend_limit', percentUsed: 10 }], true)).toBe(FIVE_MIN_MS)
})

test('ttl: a cache read after more than 5 idle minutes proves an hour; a rewrite points to 5 minutes', async () => {
  const min = 60_000
  expect(observedTtl({ gapMs: 12 * min, read: 150_000, written: 2_000 })).toBe(HOUR_MS)
  expect(observedTtl({ gapMs: 12 * min, read: 0, written: 150_000 })).toBe(FIVE_MIN_MS)
  // Inside 5 minutes either lifetime would have held; past an hour either would have lapsed.
  expect(observedTtl({ gapMs: 4 * min, read: 150_000, written: 0 })).toBeUndefined()
  expect(observedTtl({ gapMs: 61 * min, read: 0, written: 150_000 })).toBeUndefined()
  // Too small a prefix to say anything; a half-and-half read says nothing either.
  expect(observedTtl({ gapMs: 12 * min, read: 0, written: 500 })).toBeUndefined()
  expect(observedTtl({ gapMs: 12 * min, read: 50_000, written: 70_000 })).toBeUndefined()
})

test('ttl: the setting beats Claude Code, which beats what was seen, then the plan, then an hour', async () => {
  expect(resolveTtl({ manual: FIVE_MIN_MS, claudeCode: HOUR_MS, observed: HOUR_MS, plan: HOUR_MS })).toEqual({ ms: FIVE_MIN_MS, source: 'setting' })
  expect(resolveTtl({ manual: null, claudeCode: FIVE_MIN_MS, observed: HOUR_MS })).toEqual({ ms: FIVE_MIN_MS, source: 'claude-code' })
  expect(resolveTtl({ manual: null, claudeCode: null })).toEqual({ ms: null, source: 'claude-code' })
  expect(resolveTtl({ manual: null, observed: HOUR_MS, plan: FIVE_MIN_MS })).toEqual({ ms: HOUR_MS, source: 'observed' })
  expect(resolveTtl({ manual: null, plan: FIVE_MIN_MS })).toEqual({ ms: FIVE_MIN_MS, source: 'plan' })
  expect(resolveTtl({ manual: null })).toEqual({ ms: HOUR_MS, source: 'default' })
})

test('ttl: the summary says the lifetime and where it came from', async () => {
  expect(ttlSummary({ ms: HOUR_MS, source: 'plan' })).toBe('Prompt cache lifetime: 1 hour (Claude subscription).')
  expect(ttlSummary({ ms: FIVE_MIN_MS, source: 'plan' })).toBe('Prompt cache lifetime: 5 minutes (API key, cloud provider or usage credits).')
  expect(ttlSummary({ ms: HOUR_MS, source: 'observed' })).toBe('Prompt cache lifetime: 1 hour (seen: the cache outlived 5 idle minutes).')
  expect(ttlSummary({ ms: FIVE_MIN_MS, source: 'observed' })).toBe('Prompt cache lifetime: 5 minutes (seen: the cache lapsed within the hour).')
  expect(ttlSummary({ ms: FIVE_MIN_MS, source: 'setting' })).toBe('Prompt cache lifetime: 5 minutes (cacheTtlMinutes setting).')
  expect(ttlSummary({ ms: HOUR_MS, source: 'claude-code' })).toBe('Prompt cache lifetime: 1 hour (Claude Code promptCacheTtl or its env vars).')
  expect(ttlSummary({ ms: null, source: 'claude-code' })).toBe('Prompt caching is off (DISABLE_PROMPT_CACHING).')
  expect(ttlSummary({ ms: HOUR_MS, source: 'default' })).toBe('Prompt cache lifetime: 1 hour (assumed until the first answer).')
})
