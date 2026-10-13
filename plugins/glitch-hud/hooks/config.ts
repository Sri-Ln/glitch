import type { PartId } from '../types'

export type NotifyMode = 'windows' | 'toast' | 'off'

export type HudConfig = {
  parts: PartId[]
  budgetSession: number
  budgetDaily: number
  budgetBlocksAgents: boolean
  cacheWarnMinutes: number[]
  /** How long the prompt cache lives after a request: 60 or 5 minutes. */
  cacheTtlMs: number
  notify: NotifyMode
  autoWarm: boolean
  autoWarmMaxIdle: number
}

export const ALL_PARTS: PartId[] = ['turn', 'speed', 'cost', 'cache', 'context', 'git']

export const DEFAULT_CONFIG: HudConfig = {
  parts: [...ALL_PARTS],
  budgetSession: 0,
  budgetDaily: 0,
  budgetBlocksAgents: false,
  cacheWarnMinutes: [10, 5],
  cacheTtlMs: 60 * 60_000,
  notify: 'windows',
  autoWarm: false,
  autoWarmMaxIdle: 120,
}

export function parseParts(s: string): PartId[] | null {
  const ids = s.split(',').map(x => x.trim())
  if (ids.length === 0 || ids.some(id => !ALL_PARTS.includes(id as PartId))) return null
  return [...new Set(ids)] as PartId[]
}

export function parseMarks(s: string): number[] | null {
  const marks = s.split(',').map(x => x.trim()).filter(Boolean).map(Number)
  if (marks.length === 0 || marks.some(m => !Number.isFinite(m) || m < 1 || m > 59)) return null
  return [...new Set(marks)].sort((a, b) => b - a)
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

const bool = (v: unknown): boolean | null => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null)

// Settings as the person stored them, made safe: each bad value falls back to its
// default and is named in `problems`.
export function parseConfig(o: Record<string, unknown>): { config: HudConfig; problems: string[] } {
  const config: HudConfig = { ...DEFAULT_CONFIG, parts: [...DEFAULT_CONFIG.parts], cacheWarnMinutes: [...DEFAULT_CONFIG.cacheWarnMinutes] }
  const problems: string[] = []
  const readNumbers = (keys: ('budgetSession' | 'budgetDaily' | 'autoWarmMaxIdle')[]) => {
    for (const key of keys) {
      if (o[key] === undefined) continue
      const n = num(o[key])
      if (n !== null) config[key] = n
      else problems.push(`${key}: must be a number ≥ 0, using ${DEFAULT_CONFIG[key]}`)
    }
  }

  if (o.parts !== undefined) {
    const parts = typeof o.parts === 'string' ? parseParts(o.parts) : null
    if (parts) config.parts = parts
    else problems.push('parts: unknown or empty entry, using default')
  }
  readNumbers(['budgetSession', 'budgetDaily'])
  for (const key of ['budgetBlocksAgents', 'autoWarm'] as const) {
    if (o[key] === undefined) continue
    const b = bool(o[key])
    if (b !== null) config[key] = b
    else problems.push(`${key}: must be true or false, using ${DEFAULT_CONFIG[key]}`)
  }
  if (o.cacheTtlMinutes !== undefined) {
    const ttl = String(o.cacheTtlMinutes).trim()
    if (ttl === '60' || ttl === '5') config.cacheTtlMs = Number(ttl) * 60_000
    else problems.push('cacheTtlMinutes: must be 60 or 5, using 60')
  }
  if (o.cacheWarnMinutes !== undefined) {
    const marks = typeof o.cacheWarnMinutes === 'string' ? parseMarks(o.cacheWarnMinutes) : null
    if (marks) config.cacheWarnMinutes = marks
    else problems.push(`cacheWarnMinutes: must be minutes between 1 and 59, using ${DEFAULT_CONFIG.cacheWarnMinutes.join(',')}`)
  }
  // A mark at or above the lifetime would be due the moment an answer lands.
  const reachable = config.cacheWarnMinutes.filter(m => m * 60_000 < config.cacheTtlMs)
  if (reachable.length < config.cacheWarnMinutes.length) {
    config.cacheWarnMinutes = reachable
    problems.push('cacheWarnMinutes: marks at or above the cache lifetime are ignored')
  }
  if (o.notify !== undefined) {
    if (o.notify === 'windows' || o.notify === 'toast' || o.notify === 'off') config.notify = o.notify
    else problems.push('notify: must be windows, toast or off, using windows')
  }
  readNumbers(['autoWarmMaxIdle'])
  return { config, problems }
}
