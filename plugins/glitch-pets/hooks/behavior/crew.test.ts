import { expect, test } from 'claude-code/testing'

import { INITIAL_CREW, elapsedOf, helpersRunning, onAgentTurnEnd, onMainTurnEnd, onMainTurnStart, onSpawn, onStatuses, onStep, onTool, progressOf, reviewerRunning, roleOf, shares, tierOf, tokenWeight } from './crew'

test('roleOf reads <role>-<n> names first, then the description', () => {
  expect(roleOf('builder-2', 'whatever')).toBe('builder')
  expect(roleOf('reviewer-1', 'x')).toBe('reviewer')
  expect(roleOf(undefined, 'Research competitor launches')).toBe('researcher')
  expect(roleOf(undefined, 'Implement the landing page')).toBe('builder')
  expect(roleOf(undefined, 'Design the launch graphics')).toBe('designer')
  expect(roleOf(undefined, 'Verify the tests pass')).toBe('tester')
  expect(roleOf(undefined, 'Review the whole kit')).toBe('reviewer')
  expect(roleOf(undefined, 'Tidy up')).toBe('other')
})

test('tierOf', () => {
  expect(tierOf('claude-haiku-5-5', 'high')).toBe('light')
  expect(tierOf('claude-opus-5-5', 'low')).toBe('light')
  expect(tierOf('claude-opus-5-5', 'xhigh')).toBe('heavy')
  expect(tierOf('claude-opus-5-5', 'medium')).toBe('medium')
  expect(tierOf('claude-sonnet-5-5', 'max')).toBe('medium')
  expect(tierOf(null, null)).toBe('medium')
})

test('tokenWeight weighs output and cache like the price structure', () => {
  expect(tokenWeight({ input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 40, cache_read_input_tokens: 1000 })).toBe(100 + 50 + 50 + 100)
})

const spawn = (s = INITIAL_CREW, id = 'a1', extra = {}) => onSpawn(s, { agentId: id, description: 'Build it', model: 'claude-opus-5-5', now: 1000, costNow: 2, ...extra })

test('a spawn starts a crew and a row', () => {
  const s = spawn()
  expect(s.closed).toBe(false)
  expect(s.startedAt).toBe(1000)
  expect(s.costAtStart).toBe(2)
  expect(s.rows[0]).toMatchObject({ id: 'a1', role: 'builder', status: 'running', tier: 'medium', tokens: 0 })
  expect(helpersRunning(s)).toBe(1)
})

test('a spawn while the crew is open joins it, in any later main turn', () => {
  let s = onMainTurnEnd(spawn())
  s = onMainTurnStart(s)
  s = spawn(s, 'a2', { now: 5000, costNow: 9 })
  expect(s.rows.map(r => r.id)).toEqual(['a1', 'a2'])
  expect(s.startedAt).toBe(1000)
  expect(s.costAtStart).toBe(2)
})

test('only a quiet main turn closes the crew; the next spawn starts a fresh one', () => {
  // The turn that spawned is busy, even when its helper is done by its end.
  let s = onStatuses(spawn(), [{ id: 'a1', status: 'completed' }], 2000)
  s = onMainTurnEnd(s)
  expect(s.closed).toBe(false)
  // A turn that starts with a helper running is busy.
  s = onMainTurnEnd(onMainTurnStart(spawn(s, 'a2')))
  s = onMainTurnStart(s)
  expect(s.turnBusy).toBe(true)
  s = onStatuses(s, [{ id: 'a2', status: 'completed' }], 3000)
  s = onMainTurnEnd(s)
  expect(s.closed).toBe(false)
  // Nothing ran at its start, nothing spawned, nothing runs at its end.
  s = onMainTurnEnd(onMainTurnStart(s))
  expect(s.closed).toBe(true)
  s = spawn(s, 'b1', { now: 8000, costNow: 5 })
  expect(s.rows.map(r => r.id)).toEqual(['b1'])
  expect(s.startedAt).toBe(8000)
  expect(s.costAtStart).toBe(5)
  expect(s.closed).toBe(false)
})

test('elapsed runs to now while a row runs, then stops at the last end', () => {
  const s = spawn()
  expect(elapsedOf(s, 4000)).toBe(3000)
  const done = onStatuses(s, [{ id: 'a1', status: 'completed' }], 2500)
  expect(elapsedOf(done, 9000)).toBe(1500)
  expect(elapsedOf(INITIAL_CREW, 9000)).toBe(0)
})

test('steps set model, effort and tier; tools count; turn ends add tokens', () => {
  let s = onStep(spawn(), 'a1', 'claude-opus-5-5', 'high')
  expect(s.rows[0]?.tier).toBe('heavy')
  s = onTool(onTool(s, 'a1'), 'a1')
  expect(s.rows[0]?.tools).toBe(2)
  s = onAgentTurnEnd(s, 'a1', { input_tokens: 10, output_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, 4000)
  expect(s.rows[0]?.tokens).toBe(12)
  expect(s.rows[0]?.weight).toBe(20)
})

test('statuses finish rows: completed ✓, failed and killed ✗', () => {
  let s = spawn(spawn(), 'a2', { description: 'Research it' })
  s = onStatuses(s, [{ id: 'a1', status: 'completed' }, { id: 'a2', status: 'killed' }], 9000)
  expect(s.rows.map(r => r.status)).toEqual(['done', 'failed'])
  expect(s.rows[0]?.endedAt).toBe(9000)
  expect(helpersRunning(s)).toBe(0)
})

test('the reviewer is not a helper', () => {
  const s = spawn(spawn(), 'r1', { name: 'reviewer-1', description: 'Review all' })
  expect(helpersRunning(s)).toBe(1)
  expect(reviewerRunning(s)).toBe(true)
})

test('shares split the crew cost by weight; no weight → equal parts', () => {
  const rows = [{ id: 'a', weight: 30 }, { id: 'b', weight: 10 }] as never
  expect(shares(rows, 0.4)).toEqual({ a: 0.3, b: 0.1 })
  expect(shares([{ id: 'a', weight: 0 }, { id: 'b', weight: 0 }] as never, 0.4)).toEqual({ a: 0.2, b: 0.2 })
})

test('progress is tools against the most any finished helper took; done is full', () => {
  const rows = [{ id: 'a', tools: 8, status: 'done' }, { id: 'b', tools: 2, status: 'running' }] as never
  expect(progressOf((rows as never[])[1] as never, rows)).toBe(0.25)
  expect(progressOf((rows as never[])[0] as never, rows)).toBe(1)
  expect(progressOf({ id: 'c', tools: 3, status: 'running' } as never, [{ id: 'c', tools: 3, status: 'running' }] as never)).toBe(0.5)
})

test('the progress yardstick ignores a finished reviewer', () => {
  const rows = [{ id: 'r', role: 'reviewer', tools: 20, status: 'done' }, { id: 'a', role: 'builder', tools: 4, status: 'done' }, { id: 'b', role: 'builder', tools: 2, status: 'running' }] as never
  expect(progressOf((rows as never[])[2] as never, rows)).toBe(0.5)
  const onlyReviewer = [{ id: 'r', role: 'reviewer', tools: 20, status: 'done' }, { id: 'b', role: 'builder', tools: 2, status: 'running' }] as never
  expect(progressOf((onlyReviewer as never[])[1] as never, onlyReviewer)).toBe(0.5)
})

test('roleOf takes word forms of the role words', () => {
  expect(roleOf(undefined, 'Reviews the combined work')).toBe('reviewer')
  expect(roleOf(undefined, 'Code reviewer for the kit')).toBe('reviewer')
  expect(roleOf(undefined, 'Run the tests')).toBe('tester')
  expect(roleOf(undefined, 'Builds the page')).toBe('builder')
  expect(roleOf(undefined, 'Researching pricing')).toBe('researcher')
})

test('roleOf reads role names in any case', () => {
  expect(roleOf('Builder-1', 'x')).toBe('builder')
  expect(roleOf('REVIEWER-2', 'x')).toBe('reviewer')
})

test('a main turn start only records whether it is busy', () => {
  const s = onMainTurnStart(spawn())
  expect(s.turnBusy).toBe(true)
  expect(s.rows).toEqual(spawn().rows)
})
