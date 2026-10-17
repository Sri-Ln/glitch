import { expect, test } from 'claude-code/testing'

import { AGENT_PREFIX, DEFAULT_TIERS, MAX_STEP_UPS, agentSpecs, claimStepUp, ladderOf, nextRung, parseCrewTiers, rungLabel, rungOfType, stepUpNote, stepUpsFor } from './tiers'
import type { CrewRow } from './crew'

const types = (tiers = DEFAULT_TIERS) => ladderOf(tiers).map(r => `${r.type} ${r.model} ${r.effort}`)

test('the default table: Haiku low, Sonnet medium, Opus high', () => {
  expect(DEFAULT_TIERS).toEqual({
    light: { model: 'claude-haiku-5-5', effort: 'low' },
    medium: { model: 'claude-sonnet-5-5', effort: 'medium' },
    heavy: { model: 'claude-opus-5-5', effort: 'high' },
  })
})

test('the ladder: effort first, then model; xhigh and max only past the heavy tier', () => {
  expect(types()).toEqual([
    'crew-light claude-haiku-5-5 low',
    'crew-light-high claude-haiku-5-5 high',
    'crew-medium claude-sonnet-5-5 medium',
    'crew-medium-high claude-sonnet-5-5 high',
    'crew-heavy claude-opus-5-5 high',
    'crew-heavy-xhigh claude-opus-5-5 xhigh',
    'crew-heavy-max claude-opus-5-5 max',
  ])
})

test('a tier already at high effort has no effort rung of its own', () => {
  const t = parseCrewTiers('{"medium":{"effort":"high"}}').tiers
  expect(types(t)).toEqual([
    'crew-light claude-haiku-5-5 low',
    'crew-light-high claude-haiku-5-5 high',
    'crew-medium claude-sonnet-5-5 high',
    'crew-heavy claude-opus-5-5 high',
    'crew-heavy-xhigh claude-opus-5-5 xhigh',
    'crew-heavy-max claude-opus-5-5 max',
  ])
})

test('nextRung steps one rung; past the top there is none', () => {
  const l = ladderOf(DEFAULT_TIERS)
  expect(nextRung(l, 'crew-light')?.type).toBe('crew-light-high')
  expect(nextRung(l, 'crew-light-high')?.type).toBe('crew-medium')
  expect(nextRung(l, 'crew-medium')?.type).toBe('crew-medium-high')
  expect(nextRung(l, 'crew-heavy')?.type).toBe('crew-heavy-xhigh')
  expect(nextRung(l, 'crew-heavy-max')).toBeNull()
  expect(nextRung(l, 'Explore')).toBeNull()
  // Takes a rung too.
  expect(nextRung(l, l[0]!)?.type).toBe('crew-light-high')
})

test('nextRung skips a rung that runs the same as the current one', () => {
  // light at Sonnet high equals medium's Sonnet high.
  const t = parseCrewTiers({ light: { model: 'claude-sonnet-5-5', effort: 'high' }, medium: { model: 'claude-sonnet-5-5', effort: 'high' } }).tiers
  const l = ladderOf(t)
  expect(nextRung(l, 'crew-light')?.type).toBe('crew-heavy')
})

test('rungOfType takes the full and the short name', () => {
  const l = ladderOf(DEFAULT_TIERS)
  expect(rungOfType(l, `${AGENT_PREFIX}crew-medium`)?.model).toBe('claude-sonnet-5-5')
  expect(rungOfType(l, 'crew-heavy-xhigh')?.effort).toBe('xhigh')
  expect(rungOfType(l, 'general-purpose')).toBeNull()
  expect(rungOfType(l, 'other:crew-light')).toBeNull()
})

test('rungLabel names the model family and the effort', () => {
  const l = ladderOf(DEFAULT_TIERS)
  expect(rungLabel(l[0]!)).toBe('Haiku · low')
  expect(rungLabel({ model: 'my-model', effort: 'low' })).toBe('my-model · low')
})

test('parseCrewTiers: empty or unset is the default table, no problem', () => {
  expect(parseCrewTiers(undefined)).toEqual({ tiers: DEFAULT_TIERS, problems: [] })
  expect(parseCrewTiers('')).toEqual({ tiers: DEFAULT_TIERS, problems: [] })
  expect(parseCrewTiers('  ')).toEqual({ tiers: DEFAULT_TIERS, problems: [] })
})

test('parseCrewTiers: a partial table fills in from the defaults', () => {
  const { tiers, problems } = parseCrewTiers('{"light":{"model":"haiku"},"heavy":{"effort":"medium"}}')
  expect(problems).toEqual([])
  expect(tiers.light).toEqual({ model: 'haiku', effort: 'low' })
  expect(tiers.medium).toEqual(DEFAULT_TIERS.medium)
  expect(tiers.heavy).toEqual({ model: 'claude-opus-5-5', effort: 'medium' })
})

test('parseCrewTiers: bad values fall back field by field and are reported', () => {
  expect(parseCrewTiers('{nope').problems).toEqual(['crewTiers is not valid JSON'])
  expect(parseCrewTiers('{nope').tiers).toEqual(DEFAULT_TIERS)
  expect(parseCrewTiers('[1]').problems.length).toBe(1)
  expect(parseCrewTiers(5).problems.length).toBe(1)
  const r = parseCrewTiers({ light: { effort: 'xhigh' }, medium: 'fast', huge: {}, heavy: { model: 'two words', effort: 'high' } })
  expect(r.tiers).toEqual(DEFAULT_TIERS)
  expect(r.problems.length).toBe(4)
  expect(r.problems.join(' ')).toContain('xhigh and max are only step-up rungs')
})

test('agentSpecs: one type per rung, with its model and effort, never a crew of its own', () => {
  const specs = agentSpecs(ladderOf(DEFAULT_TIERS))
  expect(specs.map(s => s.name)).toEqual(['crew-light', 'crew-light-high', 'crew-medium', 'crew-medium-high', 'crew-heavy', 'crew-heavy-xhigh', 'crew-heavy-max'])
  const light = specs[0]!
  expect(light.model).toBe('claude-haiku-5-5')
  expect(light.effort).toBe('low')
  expect(light.description).toContain('light')
  expect(light.disallowedTools).toEqual(['Agent'])
  expect(light.prompt).toContain('short report')
  expect(light.prompt).toContain('Do not start helper agents')
  expect(specs[1]!.description).toContain('step-up')
})

const row = (id: string, extra: Partial<CrewRow> = {}): CrewRow =>
  ({ id, name: 'builder-1', named: true, role: 'builder', status: 'running', description: id, tier: 'light', model: null, effort: null, tokens: 0, weight: 0, turnTokens: 0, turnWeight: 0, tools: 0, startedAt: 0, endedAt: null, rung: 'crew-light', ...extra }) as CrewRow

test('stepUpsFor: a crew-type row that just failed steps up one rung', () => {
  const l = ladderOf(DEFAULT_TIERS)
  const ups = stepUpsFor([row('a')], [row('a', { status: 'failed' })], l)
  expect(ups).toEqual([{ fromId: 'a', name: 'builder-1', from: 'crew-light', to: 'crew-light-high', stepUps: 1 }])
  expect(stepUpNote(ups[0]!, l)).toBe(
    'Glitch crew: builder-1 failed on Haiku · low (glitch-pets:crew-light); retry it with subagent type glitch-pets:crew-light-high: the same prompt, the name builder-1, and no model or effort.',
  )
})

test('stepUpsFor: not for a done, killed, already failed or non-crew row, nor past the cap', () => {
  const l = ladderOf(DEFAULT_TIERS)
  expect(stepUpsFor([row('a')], [row('a', { status: 'done' })], l)).toEqual([])
  expect(stepUpsFor([row('a')], [row('a', { status: 'failed', killed: true })], l)).toEqual([])
  expect(stepUpsFor([row('a', { status: 'failed' })], [row('a', { status: 'failed' })], l)).toEqual([])
  expect(stepUpsFor([row('a', { rung: undefined })], [row('a', { status: 'failed', rung: undefined })], l)).toEqual([])
  expect(stepUpsFor([row('a', { stepUps: MAX_STEP_UPS })], [row('a', { status: 'failed', stepUps: MAX_STEP_UPS })], l)).toEqual([])
  expect(stepUpsFor([row('a', { rung: 'crew-heavy-max' })], [row('a', { status: 'failed', rung: 'crew-heavy-max' })], l)).toEqual([])
  // The second step-up is still allowed.
  expect(stepUpsFor([row('a', { stepUps: 1, rung: 'crew-light-high' })], [row('a', { status: 'failed', stepUps: 1, rung: 'crew-light-high' })], l)[0]?.to).toBe('crew-medium')
})

test('claimStepUp matches the retry by type and name, else by type alone', () => {
  const a = { fromId: 'a', name: 'builder-1', from: 'crew-light', to: 'crew-light-high', stepUps: 1 }
  const b = { fromId: 'b', name: 'builder-2', from: 'crew-light', to: 'crew-light-high', stepUps: 1 }
  expect(claimStepUp([a, b], 'glitch-pets:crew-light-high', 'builder-2')).toEqual({ claimed: b, rest: [a] })
  expect(claimStepUp([a, b], 'glitch-pets:crew-light-high', 'other')).toEqual({ claimed: a, rest: [b] })
  expect(claimStepUp([a, b], 'glitch-pets:crew-medium', 'builder-1')).toEqual({ claimed: null, rest: [a, b] })
})
