// The crew rule's backstop: multi-part work left unreviewed gets a reminder with the next prompt. Pure.
import type { CrewState } from './crew'

export const GATE_TEXT =
  'Glitch crew: 2 or more helpers have finished and no reviewer has checked the whole result. Before going on, run one reviewer agent (name it reviewer-1) over the combined work against the plan, send each finding back to the helper that did that part, re-review (at most 2 rounds), then report what is still open.'

export const CREW_RULE =
  'Glitch crew rule: whenever you split work across 2 or more helper agents, first write a short plan (each task with a role and tier), name helpers <role>-<n> (builder, researcher, designer, tester), and after they finish run one reviewer agent (reviewer-1) over the whole result; send findings back to the helper responsible and re-review, at most 2 rounds; report anything still open plainly.'

export function needsReview(s: CrewState, o: { enabled: boolean; stopHookActive: boolean; capReached: boolean }): boolean {
  if (!o.enabled || o.stopHookActive || o.capReached || s.gateFired || s.closed) return false
  if (s.rows.some(r => r.role === 'reviewer')) return false
  // Only crew-named helpers (<role>-<n>, as the crew rule asks) count: an ad-hoc fan-out is not a crew.
  const helpers = s.rows.filter(r => r.role !== 'reviewer' && r.named)
  const finished = helpers.filter(r => r.status !== 'running')
  return helpers.length >= 2 && finished.length === helpers.length
}
