// When a pet may speak, and which line. Pure.
import type { Persona, VoiceMoment } from './types'

export type VoiceState = { lastAt: number; lastLine: string | null }
export const INITIAL_VOICE: VoiceState = { lastAt: -Infinity, lastLine: null }

export function pickLine(
  p: Persona,
  moment: VoiceMoment,
  state: VoiceState,
  o: { now: number; isTurnRunning: boolean; enabled: boolean; everyMs: number; random: () => number },
): { text: string; state: VoiceState } | null {
  if (!o.enabled || o.isTurnRunning || o.now - state.lastAt < o.everyMs) return null
  const lines = p.voice[moment].filter(l => l !== state.lastLine)
  if (lines.length === 0) return null
  const line = lines[Math.min(lines.length - 1, Math.floor(o.random() * lines.length))] as string
  return { text: `${p.name}: ${line}`, state: { lastAt: o.now, lastLine: line } }
}
