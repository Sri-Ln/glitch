// Pure helpers of /glitch-pets: argument parsing and texts.
import type { PetId } from './behavior/types'
import { PET_IDS } from './behavior/types'

export const ROUTED_PETS = ['pet', 'crew']
export const STORE_PET = 'pet'
export const PETS_USAGE = 'Glitch pets: /glitch-pets [name | off] · crew [theme <id> | debug] (also /glitch pet, /glitch crew)'

// ── `/glitch crew debug`: the crew rows against the engine's agent list, for a live check ──

export type CrewDebugState = {
  /** The engine's last `$.agent.list()` answer, as read by the 1 s status poll. */
  list: { at: number; entries: { id: string; status: string; description: string; name?: string }[] } | null
  listError: string | null
  /** The latest presses in the pane, newest first: which element, on which surface, and what came of it. */
  presses: { at: number; surface: string; element: string; result: string }[]
  /** Per surface, the transcript in view (`e.props.view.agentId`) when the pane last drew; null for the main one. */
  views: Record<string, string | null>
  /** Per surface, clock ms of the pane's recent draws (the redraw rate). */
  draws: Record<string, number[]>
}

export const isCrewDebug = (args: string): boolean => {
  const words = args.trim().toLowerCase().split(/\s+/)
  return words[0] === 'crew' && words[1] === 'debug'
}

type DebugRow = { id: string; name?: string; role: string; status: string; killed?: boolean; startedAt: number; endedAt: number | null }

const secs = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`

/** The debug report: plain lines the person reads (and can paste into an issue). */
export function crewDebugText(i: {
  now: number
  crew: { closed: boolean; startedAt: number | null; rows: readonly DebugRow[] }
  list: CrewDebugState['list']
  listError: string | null
  freshList: { id: string; status: string; description: string; name?: string }[] | null
  presses: CrewDebugState['presses']
  views: CrewDebugState['views']
  draws: CrewDebugState['draws']
  surfaces: readonly string[]
  panes: readonly string[]
}): string {
  const entries = i.freshList ?? i.list?.entries ?? null
  const by = new Map((entries ?? []).map(e => [e.id, e]))
  const out: string[] = ['Glitch crew debug']
  out.push(`Surfaces: ${i.surfaces.join(', ') || 'none'} · panes open: ${i.panes.join(', ') || 'none'}`)
  out.push(`Crew: ${i.crew.closed ? 'closed' : 'open'}${i.crew.startedAt !== null ? `, started ${secs(i.now - i.crew.startedAt)} ago` : ''}, ${i.crew.rows.length} rows`)
  const listWhen = i.freshList ? 'read now' : i.list ? `last read ${secs(i.now - i.list.at)} ago` : 'never read'
  out.push(`Engine agent list: ${entries ? `${entries.length} entries, ${listWhen}` : 'unavailable'}${i.listError ? ` (last error: ${i.listError})` : ''}`)
  out.push('Rows (pane status vs engine status):')
  if (!i.crew.rows.length) out.push('  (none)')
  for (const r of i.crew.rows) {
    const e = by.get(r.id)
    const pane = r.status === 'failed' && r.killed ? 'stopped' : r.status
    const ran = secs((r.endedAt ?? i.now) - r.startedAt)
    out.push(`  ${r.name ?? r.role} · pane: ${pane} · engine: ${e ? e.status : 'not listed'} · ${ran} · id ${r.id}`)
  }
  const strays = (entries ?? []).filter(e => !i.crew.rows.some(r => r.id === e.id))
  if (strays.length) out.push(`List entries no row holds: ${strays.map(e => `${e.id} (${e.status}${e.name ? `, ${e.name}` : ''})`).join('; ')}`)
  out.push('Presses (newest first):')
  if (!i.presses.length) out.push('  (none reached the pane)')
  for (const p of i.presses) out.push(`  ${secs(i.now - p.at)} ago · ${p.surface} · ${p.element} → ${p.result}`)
  const views = Object.entries(i.views)
  if (!views.length) out.push('View in force: the pane has not drawn')
  for (const [surface, agentId] of views) {
    const row = agentId ? i.crew.rows.find(r => r.id === agentId) : undefined
    out.push(`${surface} pane: view = ${agentId ? `${agentId}${row ? ` (${row.name ?? row.role})` : ''}` : 'main conversation'}`)
  }
  for (const [surface, at] of Object.entries(i.draws)) {
    const recent = at.filter(t => i.now - t <= 10_000).length
    out.push(`${surface} pane: ${recent} draws in the last 10 s`)
  }
  return out.join('\n')
}

export type PetArg = { kind: 'show' } | { kind: 'off' } | { kind: 'pick'; id: PetId } | { kind: 'unknown'; name: string }

// The pet argument of either entry point: `/glitch-pets [pet] <name>` or the routed `/glitch pet <name>`.
export function petArgsOf(command: 'glitch-pets' | 'glitch', args: string): string {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const routed = command === 'glitch' || words[0] === 'pet'
  return (routed ? words.slice(1) : words).join(' ')
}

export function parsePetArg(arg: string | undefined): PetArg {
  if (!arg) return { kind: 'show' }
  const a = arg.toLowerCase()
  if (a === 'off') return { kind: 'off' }
  return (PET_IDS as readonly string[]).includes(a) ? { kind: 'pick', id: a as PetId } : { kind: 'unknown', name: arg }
}

export function petList(current: PetId | 'off', available: readonly PetId[]): string {
  const names = available.map(id => (id === current ? `${id} (current)` : id)).join(', ')
  return `Pets: ${names}${current === 'off' ? ' · pet is off' : ''} · /glitch pet <name> | off`
}

// ── Crew themes: `/glitch crew theme [id]` and `/glitch-pets crew theme [id]` ──
export const STORE_CREW_THEME = 'crewTheme'

export type ThemeArg = { kind: 'show' } | { kind: 'pick'; id: string } | { kind: 'unknown'; name: string }

/** The theme argument when the words are `crew theme [id]` or `crew themes [id]` (either entry point), else null. */
export function crewThemeArgOf(args: string): string | null {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words[0]?.toLowerCase() !== 'crew' || !['theme', 'themes'].includes(words[1]?.toLowerCase() ?? '')) return null
  return words.slice(2).join(' ')
}

export function parseThemeArg(arg: string, ids: readonly string[]): ThemeArg {
  const a = arg.trim().toLowerCase()
  if (!a) return { kind: 'show' }
  return ids.includes(a) ? { kind: 'pick', id: a } : { kind: 'unknown', name: arg.trim() }
}

export function themeList(current: string, themes: readonly { id: string; name: string }[]): string {
  const names = themes.map(t => `${t.id} (${t.name})${t.id === current ? ' (current)' : ''}`).join(', ')
  return `Crew themes: ${names} · /glitch crew theme <id>`
}
