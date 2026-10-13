import type { Budget, Level } from '../types'

const RANK: Record<Level, number> = { ok: 0, warn: 1, alert: 2, over: 3 }

export const rank = (l: Level): number => RANK[l]
export const worse = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b)

export const levelOf = (spent: number, cap: number): Level =>
  cap <= 0 ? 'ok' : spent >= cap ? 'over' : spent >= cap * 0.9 ? 'alert' : spent >= cap * 0.75 ? 'warn' : 'ok'

export function costLevel(b: Budget, sessionSpent: number): Level {
  if (b.demoPercent !== null) return levelOf(b.demoPercent, 100)
  if (b.isOff) return 'ok'
  return worse(levelOf(sessionSpent, b.sessionCap), levelOf(b.dailySpent, b.dailyCap))
}

export const crossed = (prev: Level, now: Level): Level | null => (RANK[now] > RANK[prev] ? now : null)

export const usd = (n: number): string => `$${n.toFixed(2)}`

const pad = (n: number): string => String(n).padStart(2, '0')

export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** day → session id → USD that session spent that day. */
export type Ledger = Record<string, Record<string, number>>

export const record = (ledger: Ledger, day: string, sessionId: string, spent: number): Ledger => ({
  ...ledger,
  [day]: { ...(ledger[day] ?? {}), [sessionId]: spent },
})

export const dailyTotal = (ledger: Ledger, day: string): number => Object.values(ledger[day] ?? {}).reduce((a, b) => a + b, 0)

const DAY_MS = 24 * 60 * 60 * 1000

export function prune(ledger: Ledger, nowMs: number, keepDays = 7): Ledger {
  const oldest = dayKey(nowMs - (keepDays - 1) * DAY_MS)
  return Object.fromEntries(Object.entries(ledger).filter(([day]) => day >= oldest))
}

// What this session spent on the current local day. A new day starts at the
// session's total then, so yesterday's share stays in yesterday's entry.
export function spendToday(b: Budget, total: number, nowMs: number): { day: string; dayBase: number; spent: number } {
  const day = dayKey(nowMs)
  const dayBase = day === b.day ? b.dayBase : total
  return { day, dayBase, spent: Math.max(0, total - dayBase) }
}

export function blockReason(b: Budget, sessionSpent: number): string | null {
  if (b.isOff) return null
  if (b.sessionCap > 0 && sessionSpent >= b.sessionCap) {
    return `Glitch budget cap ${usd(b.sessionCap)} reached (session). Ask the user to raise it with /glitch budget +N.`
  }
  // `/glitch budget +N` moves the session cap only, so the daily cap names what lifts it.
  if (b.dailyCap > 0 && b.dailySpent >= b.dailyCap) {
    return `Glitch budget cap ${usd(b.dailyCap)} reached (daily). Ask the user to run /glitch budget off for this session, or raise budgetDaily in /config.`
  }
  return null
}
