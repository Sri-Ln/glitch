// The prompt cache's lifetime, worked out instead of asked for (issue #1).
// Claude Code picks 1 hour or 5 minutes per request; the engine does not say
// which, so the lifetime comes from, in order: the cacheTtlMinutes setting,
// Claude Code's own setting and env vars, what the cache was seen to do, and
// the plan the rate-limit windows point to.

export const HOUR_MS = 60 * 60_000
export const FIVE_MIN_MS = 5 * 60_000

export type TtlSource = 'setting' | 'claude-code' | 'observed' | 'plan' | 'default'

/** `ms` null: prompt caching is off, so there is nothing to count down. */
export type Ttl = { ms: number | null; source: TtlSource }

/** Claude Code's own cache settings, as the env and settings.json hold them. */
export type ClaudeCacheConfig = {
  disabled?: string
  force5m?: string
  envTtl?: string
  settingTtl?: unknown
  enable1h?: string
}

const isOn = (v: string | undefined): boolean => v !== undefined && v.trim() !== '' && v.trim() !== '0' && v.trim().toLowerCase() !== 'false'

const parseTtl = (v: unknown): number | undefined => (v === '1h' ? HOUR_MS : v === '5m' ? FIVE_MIN_MS : undefined)

/**
 * The main conversation's lifetime Claude Code was told to use: undefined when
 * nothing says, null when caching is off. Claude Code's precedence:
 * FORCE_PROMPT_CACHING_5M, then CLAUDE_CODE_PROMPT_CACHE_TTL, then
 * promptCacheTtl, then ENABLE_PROMPT_CACHING_1H.
 */
export function claudeCodeTtl(c: ClaudeCacheConfig): number | null | undefined {
  if (isOn(c.disabled)) return null
  if (isOn(c.force5m)) return FIVE_MIN_MS
  return parseTtl(c.envTtl?.trim()) ?? parseTtl(c.settingTtl) ?? (isOn(c.enable1h) ? HOUR_MS : undefined)
}

const SUBSCRIPTION_WINDOWS = ['five_hour', 'seven_day']

/**
 * The lifetime the plan gives the main conversation: a Claude subscription
 * within its limits gets an hour; an API key, a cloud provider, a gateway or a
 * subscription past a limit (on usage credits) gets 5 minutes. The windows are
 * empty before the first answer too, so nothing is said until one has come.
 */
export function planTtl(windows: readonly { kind: string; percentUsed: number }[], hasAnswered: boolean): number | undefined {
  if (!hasAnswered) return undefined
  const sub = windows.filter(w => SUBSCRIPTION_WINDOWS.includes(w.kind))
  if (sub.length === 0) return FIVE_MIN_MS
  return sub.some(w => w.percentUsed >= 100) ? FIVE_MIN_MS : HOUR_MS
}

// Past 5 minutes with a margin for clock and request time; an hour is the upper end.
const SEEN_FROM_MS = FIVE_MIN_MS + 30_000
const MIN_PREFIX = 1024

/**
 * What the first request after an idle gap shows. Read from cache past 5
 * minutes: the lifetime is an hour. Rewritten within the hour: 5 minutes. A gap
 * either lifetime explains, a small prefix or a mixed result says nothing.
 */
export function observedTtl(o: { gapMs: number; read: number; written: number }): number | undefined {
  if (o.gapMs < SEEN_FROM_MS || o.gapMs >= HOUR_MS) return undefined
  const prefix = o.read + o.written
  if (prefix < MIN_PREFIX) return undefined
  if (o.read >= prefix * 0.5) return HOUR_MS
  if (o.read < prefix * 0.1) return FIVE_MIN_MS
  return undefined
}

export function resolveTtl(s: { manual: number | null; claudeCode?: number | null; observed?: number; plan?: number }): Ttl {
  if (s.manual !== null) return { ms: s.manual, source: 'setting' }
  if (s.claudeCode !== undefined) return { ms: s.claudeCode, source: 'claude-code' }
  if (s.observed !== undefined) return { ms: s.observed, source: 'observed' }
  if (s.plan !== undefined) return { ms: s.plan, source: 'plan' }
  return { ms: HOUR_MS, source: 'default' }
}

const WHY: Record<TtlSource, (ms: number) => string> = {
  setting: () => 'cacheTtlMinutes setting',
  'claude-code': () => 'Claude Code promptCacheTtl or its env vars',
  observed: ms => (ms >= HOUR_MS ? 'seen: the cache outlived 5 idle minutes' : 'seen: the cache lapsed within the hour'),
  plan: ms => (ms >= HOUR_MS ? 'Claude subscription' : 'API key, cloud provider or usage credits'),
  default: () => 'assumed until the first answer',
}

export function ttlSummary(t: Ttl): string {
  if (t.ms === null) return 'Prompt caching is off (DISABLE_PROMPT_CACHING).'
  const life = t.ms >= HOUR_MS ? '1 hour' : `${Math.round(t.ms / 60_000)} minutes`
  return `Prompt cache lifetime: ${life} (${WHY[t.source](t.ms)}).`
}
