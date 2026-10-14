// Pure helpers of the /glitch-hud command: argument parsing and message texts.
// Everything that touches `$` or an atom lives in register.tsx.
import type { Budget, Level } from '../types'
import { crossed, levelOf, usd } from './budget'
import { clockText } from './cache'

export const USAGE = 'Glitch HUD: /glitch hud [parts <list> | cost <list>] · budget [+N|N|off|on] · warm · demo cache <min> | demo budget <pct>'
export const BUDGET_USAGE = 'Usage: /glitch budget [+N | N | off | on]'
export const DEMO_USAGE = 'Usage: /glitch demo cache <minutes> | demo budget <percent>'
export const WARM_PROMPT = 'Keep-warm ping from the Glitch HUD. Reply with just: ok'

/** The first words of `/glitch <sub>` that this plugin answers. */
export const ROUTED = ['hud', 'budget', 'warm', 'demo']

export const splitArgs = (args: string): string[] => args.trim().split(/\s+/).filter(Boolean)

export const kTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const pct = (spent: number, cap: number): string => (cap > 0 ? ` (${Math.round((spent / cap) * 100)}%)` : '')

export function budgetSummary(b: Budget, total: number): string {
  if (b.isOff) return 'Budget caps are off for this session (/glitch budget on).'
  const session = b.sessionCap > 0 ? `${usd(total)} / ${usd(b.sessionCap)}${pct(total, b.sessionCap)}` : `${usd(total)} / off`
  const daily = b.dailyCap > 0 ? `${usd(b.dailySpent)} / ${usd(b.dailyCap)}${pct(b.dailySpent, b.dailyCap)}` : `${usd(b.dailySpent)} / off`
  return `Session ${session} · Today ${daily}`
}

export type BudgetArg = { kind: 'off' } | { kind: 'on' } | { kind: 'add' | 'set'; n: number }

export function parseBudgetArg(arg: string): BudgetArg | null {
  if (arg === 'off') return { kind: 'off' }
  if (arg === 'on') return { kind: 'on' }
  const m = /^(\+)?(\d+(?:\.\d+)?)$/.exec(arg)
  return m ? { kind: m[1] ? 'add' : 'set', n: Number(m[2]) } : null
}

/** The part of a ModelForkResult the keep-warm message reads. */
export type WarmReply =
  | { isAnswered: true; usage: { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }
  | { isAnswered: false; reason: string }

export function warmMessage(reply: WarmReply, nextExpirySeconds: number): string {
  if (!reply.isAnswered) {
    return reply.reason === 'nothing-to-fork'
      ? 'Nothing to keep warm yet: no answer in this session.'
      : `Keep-warm failed (${reply.reason}); the countdown is unchanged.`
  }
  const next = clockText(nextExpirySeconds)
  const read = reply.usage.cache_read_input_tokens ?? 0
  return read > 0
    ? `Cache kept warm (${kTokens(read)} tokens read from cache). Next expiry in ${next}.`
    : `The cache had expired; the ping wrote it again (${kTokens(reply.usage.cache_creation_input_tokens ?? 0)} tokens). Next expiry in ${next}.`
}

export type Spend = { session: number; daily: number; sessionCap: number; dailyCap: number }
type Toast = { text: string; timeoutMs: number }

/** What each rise past 90% / 100% of a cap says; `notified` is the new memory. */
export function budgetAlerts(prev: Budget['notified'], s: Spend): { notified: Budget['notified']; toasts: Toast[]; notice: string | null } {
  const notified = { ...prev }
  const toasts: Toast[] = []
  let notice: string | null = null
  const checks: [scope: 'session' | 'daily', spent: number, cap: number][] = [
    ['session', s.session, s.sessionCap],
    ['daily', s.daily, s.dailyCap],
  ]
  for (const [scope, spent, cap] of checks) {
    const level: Level = levelOf(spent, cap)
    const rise = crossed(prev[scope], level)
    if (!rise) continue
    notified[scope] = level
    const what = scope === 'session' ? 'session spend' : "today's spend"
    if (rise === 'alert') toasts.push({ text: `Glitch: ${what} ${usd(spent)} is past 90% of ${usd(cap)}`, timeoutMs: 10_000 })
    if (rise === 'over') {
      toasts.push({ text: `Glitch: ${what} ${usd(spent)} reached the ${usd(cap)} cap`, timeoutMs: 15_000 })
      notice = `Budget cap reached: ${what} ${usd(spent)} of ${usd(cap)}`
    }
  }
  return { notified, toasts, notice }
}
