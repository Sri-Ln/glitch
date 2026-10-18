import { expect, test } from 'claude-code/testing'

import { INITIAL_CREW, LIST_GRACE_MS, elapsedOf, helpersRunning, memberName, memberTask, repeatsName, taskOfPrompt, onAgentRunEnd, onAgentTurnEnd, onAgentWake, onMainTurnEnd, onMainTurnStart, onSpawn, onStatuses, onStep, onStepUsage, onTool, reviewerRunning, roleOf, shares, stepsOf, tierOf, tokenWeight } from './crew'

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

test('a row on the crew-reviewer type is a reviewer whatever its name or description (#45)', () => {
  let s = spawn(INITIAL_CREW, 'a1', { name: 'builder-1' })
  s = spawn(s, 'a2', { name: 'builder-2' })
  s = spawn(s, 'r1', { description: 'Build a summary', rung: 'crew-reviewer' })
  expect(s.rows[2]?.role).toBe('reviewer')
  expect(helpersRunning(s)).toBe(2)
  expect(reviewerRunning(s)).toBe(true)
  s = spawn(s, 'x', { name: 'helper', description: 'Build it', rung: 'crew-light' })
  expect(s.rows[3]?.role).toBe('builder')
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

test('steps are tools against the most any finished crew member took; none while finished or with no yardstick', () => {
  const rows = [{ id: 'a', tools: 8, status: 'done' }, { id: 'b', tools: 2, status: 'running' }] as never
  expect(stepsOf((rows as never[])[1] as never, rows)).toEqual({ n: 2, of: 8 })
  expect(stepsOf((rows as never[])[0] as never, rows)).toBe(null)
  expect(stepsOf({ id: 'c', tools: 3, status: 'running' } as never, [{ id: 'c', tools: 3, status: 'running' }] as never)).toBe(null)
  // Past the yardstick the total stays one above the count: never full while running.
  expect(stepsOf({ id: 'd', tools: 9, status: 'running' } as never, rows)).toEqual({ n: 9, of: 10 })
})

test('the steps yardstick ignores a finished reviewer', () => {
  const rows = [{ id: 'r', role: 'reviewer', tools: 20, status: 'done' }, { id: 'a', role: 'builder', tools: 4, status: 'done' }, { id: 'b', role: 'builder', tools: 2, status: 'running' }] as never
  expect(stepsOf((rows as never[])[2] as never, rows)).toEqual({ n: 2, of: 4 })
  const onlyReviewer = [{ id: 'r', role: 'reviewer', tools: 20, status: 'done' }, { id: 'b', role: 'builder', tools: 2, status: 'running' }] as never
  expect(stepsOf((onlyReviewer as never[])[1] as never, onlyReviewer)).toBe(null)
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

test('an idle agent (a teammate waiting) is done', () => {
  const s = onStatuses(spawn(), [{ id: 'a1', status: 'idle' }], 2000)
  expect(s.rows[0]).toMatchObject({ status: 'done', endedAt: 2000 })
})

test('a row missing from the list ends once past the grace, not before', () => {
  expect(onStatuses(spawn(), [], 1000 + LIST_GRACE_MS)).toMatchObject({ rows: [{ status: 'done', endedAt: 1000 + LIST_GRACE_MS }] })
  expect(onStatuses(spawn(), [], 1000 + LIST_GRACE_MS - 1).rows[0]?.status).toBe('running')
  expect(onStatuses(spawn(), [{ id: 'other', status: 'running' }], 1500).rows[0]?.status).toBe('running')
})

const U = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })

test('a row is crew-named only by a <role>-<n> spawn name', () => {
  expect(spawn(INITIAL_CREW, 'a1', { name: 'builder-1' }).rows[0]?.named).toBe(true)
  expect(spawn(INITIAL_CREW, 'a1', { name: 'scout' }).rows[0]?.named).toBe(false)
  expect(spawn().rows[0]?.named).toBe(false)
})

test('a resumed agent keeps its row: running again, its counts and start kept', () => {
  let s = onStepUsage(onTool(spawn(INITIAL_CREW, 'a1', { name: 'builder-1' }), 'a1'), 'a1', U(10, 2))
  s = onAgentTurnEnd(s, 'a1', U(10, 2), 2000)
  s = onStatuses(s, [{ id: 'a1', status: 'completed' }], 2000)
  s = spawn(s, 'a1', { now: 9000, description: 'Fix the review findings' })
  expect(s.rows.length).toBe(1)
  expect(s.rows[0]).toMatchObject({ status: 'running', endedAt: null, tools: 1, tokens: 12, startedAt: 1000, role: 'builder', name: 'builder-1', named: true })
})

test('step usage counts as it comes; the turn end adds only what the steps missed', () => {
  let s = onStepUsage(onStepUsage(spawn(), 'a1', U(100, 10)), 'a1', U(50, 0))
  expect(s.rows[0]?.tokens).toBe(160)
  s = onAgentTurnEnd(s, 'a1', U(150, 10), 3000)
  expect(s.rows[0]?.tokens).toBe(160)
  expect(s.rows[0]?.weight).toBe(150 + 50)
  // A turn whose steps were not seen still counts once, at its end.
  s = onAgentTurnEnd(s, 'a1', U(20, 0), 4000)
  expect(s.rows[0]?.tokens).toBe(180)
})

test('a resumed agent gets a fresh list grace: missing just after the resume is still running', () => {
  let s = onStatuses(spawn(INITIAL_CREW, 'a1', { name: 'builder-1' }), [{ id: 'a1', status: 'completed' }], 5000)
  s = spawn(s, 'a1', { now: 9000 })
  expect(onStatuses(s, [], 9000 + LIST_GRACE_MS - 1).rows[0]?.status).toBe('running')
  expect(onStatuses(s, [], 9000 + LIST_GRACE_MS).rows[0]?.status).toBe('done')
})

test('a crew-type spawn keeps its rung, and a retry where it stepped up from', () => {
  let s = spawn(INITIAL_CREW, 'a1', { rung: 'crew-light' })
  expect(s.rows[0]?.rung).toBe('crew-light')
  expect(s.rows[0]?.stepUps).toBeUndefined()
  expect('steppedUpFrom' in (s.rows[0] as object)).toBe(false)
  s = spawn(s, 'a2', { rung: 'crew-light-high', stepUps: 1, steppedUpFrom: { id: 'a1', rung: 'crew-light', model: 'claude-haiku-5-5', effort: 'low' } })
  expect(s.rows[1]?.rung).toBe('crew-light-high')
  expect(s.rows[1]?.stepUps).toBe(1)
  expect(s.rows[1]?.steppedUpFrom).toEqual({ id: 'a1', rung: 'crew-light', model: 'claude-haiku-5-5', effort: 'low' })
})

test('a killed row is marked killed; a failed one is not', () => {
  const s = onStatuses(spawn(spawn(), 'a2'), [{ id: 'a1', status: 'failed' }, { id: 'a2', status: 'killed' }], 9000)
  expect(s.rows[0]?.killed).toBeUndefined()
  expect(s.rows[1]?.killed).toBe(true)
})

test('onAgentRunEnd ends a running row by its turn\'s reason; an ended row is kept', () => {
  const s = spawn(spawn(spawn(), 'a2'), 'a3')
  let t = onAgentRunEnd(s, 'a1', 'answer', 5000)
  t = onAgentRunEnd(t, 'a2', 'error', 5000)
  t = onAgentRunEnd(t, 'a3', 'aborted', 5000)
  expect(t.rows.map(r => [r.status, r.endedAt, r.killed ?? false])).toEqual([['done', 5000, false], ['failed', 5000, false], ['failed', 5000, true]])
  expect(onAgentRunEnd(t, 'a1', 'error', 6000).rows[0]).toEqual(t.rows[0])
  expect(onAgentRunEnd(t, 'nobody', 'answer', 6000)).toEqual(t)
})

test('onAgentWake sets an ended row running again (the crew open), counts kept; a running row is left', () => {
  const s = onMainTurnEnd(onMainTurnStart(onAgentRunEnd(spawn(), 'a1', 'aborted', 5000)))
  expect(s.closed).toBe(true)
  const w = onAgentWake(s, 'a1', 7000)
  expect(w.rows[0]).toMatchObject({ status: 'running', resumedAt: 7000, endedAt: null })
  expect(w.rows[0]?.killed).toBeUndefined()
  expect(w.closed).toBe(false)
  expect(onAgentWake(w, 'a1', 8000)).toBe(w)
})

test('the name once: a description that only repeats the role or the name gives way to the prompt\'s first sentence (#45 round 2)', () => {
  expect(repeatsName('researcher', 'researcher-1', 'researcher')).toBe(true)
  expect(repeatsName('Researcher 1', 'researcher-1', 'researcher')).toBe(true)
  expect(repeatsName('researcher-1', 'researcher-1', 'researcher')).toBe(true)
  expect(repeatsName('tester', undefined, 'other')).toBe(true)
  expect(repeatsName('', 'builder-2', 'builder')).toBe(true)
  expect(repeatsName('Research date formats', 'researcher-1', 'researcher')).toBe(false)
  expect(taskOfPrompt('\n  Find the date formats users type most. List the top five.\nMore.')).toBe('Find the date formats users type most.')
  expect(taskOfPrompt('x'.repeat(200)).length).toBeLessThanOrEqual(80)
  const s = onSpawn(INITIAL_CREW, { agentId: 'r', name: 'researcher-1', description: 'researcher', prompt: 'Find the formats. Then report.', model: null, now: 1, costNow: 0 })
  const r = s.rows[0]!
  expect([memberName(r), memberTask(r)]).toEqual(['researcher-1', 'Find the formats.'])
  // A real description is kept; an unnamed member is named by its role word, else a short form of its task.
  const t = onSpawn(s, { agentId: 'u', description: 'Look up the parser options', prompt: 'p', model: null, now: 1, costNow: 0 }).rows[1]!
  expect([memberName(t), memberTask(t)]).toEqual(['researcher', 'Look up the parser options'])
  const o = onSpawn(s, { agentId: 'o', description: 'Tidy the changelog entries for the release', prompt: 'p', model: null, now: 1, costNow: 0 }).rows[1]!
  expect(memberName(o)).toBe('Tidy the changelog…')
  expect(memberTask(o)).toBe('Tidy the changelog entries for the release')
})
