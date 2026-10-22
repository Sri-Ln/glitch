// The crew rule's backstop: multi-part work left unreviewed gets a reminder with the next prompt. Pure.
import type { CrewState } from './crew'

export const GATE_TEXT =
  'Glitch crew: 2 or more helpers have finished and no reviewer has checked the whole result. Before going on, start reviewer-1 with subagent_type glitch-pets:crew-reviewer and no model or effort; give it the plan, each helper\'s report and the changed paths, and tell it to verify, not redo: check the deliverables and the diff, run the existing checks, spot-check a few items, never recompute the work. Send each finding back to the helper that did that part; a second review checks only what changed (at most 2 rounds); then report what is still open.'

export const CREW_RULE =
  'Glitch crew rule: whenever you split work across 2 or more helper agents, first write a short plan (each task with a role, a tier and its expected number of tool calls), end every helper prompt with a line "Expected steps: N", name helpers <role>-<n> (builder, researcher, designer, tester), start each with subagent_type glitch-pets:crew-<tier> (crew-light, crew-medium or crew-heavy) and no model or effort, and after they finish start one reviewer, reviewer-1, with subagent_type glitch-pets:crew-reviewer and no model or effort: give it the plan, each report and the changed paths, and tell it to verify, not redo (check the deliverables and the diff, run the existing checks, spot-check a few items, never recompute the work). Send findings back to the helper responsible; a second review checks only what changed, at most 2 rounds; report anything still open plainly.'

export function needsReview(s: CrewState, o: { enabled: boolean; stopHookActive: boolean; capReached: boolean; held?: readonly string[] }): boolean {
  if (!o.enabled || o.stopHookActive || o.capReached || s.gateFired || s.closed) return false
  if (s.rows.some(r => r.role === 'reviewer')) return false
  // Only crew-named helpers (<role>-<n>, as the crew rule asks) count: an ad-hoc fan-out is not a crew.
  const helpers = s.rows.filter(r => r.role !== 'reviewer' && r.named)
  // A failed helper whose step-up retry is still to come (held) is not finished yet.
  const finished = helpers.filter(r => r.status !== 'running' && !o.held?.includes(r.id))
  return helpers.length >= 2 && finished.length === helpers.length
}
