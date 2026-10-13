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

// The daily ledger: one store key per (local day, session id) holding the USD that
// session spent that day. Each session writes only its own key, so sessions
// running side by side never overwrite each other's spend.
export const LEDGER_PREFIX = 'ledger:'

export const ledgerKey = (day: string, sessionId: string): string => `${LEDGER_PREFIX}${day}:${sessionId}`

export function parseLedgerKey(key: string): { day: string; sessionId: string } | null {
  const m = /^ledger:(\d{4}-\d{2}-\d{2}):(.+)$/.exec(key)
  return m ? { day: m[1] as string, sessionId: m[2] as string } : null
}

/** True when `day` is older than the last `keepDays` local calendar days. */
export function isExpired(day: string, nowMs: number, keepDays = 7): boolean {
  const now = new Date(nowMs)
  return day < dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (keepDays - 1)).getTime())
}

// A /clear or a resume keeps the process under a new session id. Today then counts
// from the total now, or from 0 when the new session's total started over.
export function rebase(b: Budget, sessionId: string, total: number): Budget {
  if (!b.sessionId || b.sessionId === sessionId) return { ...b, sessionId }
  return { ...b, sessionId, dayBase: total < b.lastTotal ? 0 : total }
}

// What this session spent on the current local day. A new day starts at the
// session's total then, so yesterday's share stays in yesterday's entry.
export function spendToday(b: Budget, total: number, nowMs: number): { day: string; dayBase: number; spent: number } {
  const day = dayKey(nowMs)
  const dayBase = day === b.day ? b.dayBase : total
  return { day, dayBase, spent: Math.max(0, total - dayBase) }
}

// The caps from /config, applied again when the plugin reloads with new options; a
// session cap set with /glitch budget stays. A cap that moved re-arms its warnings
// from where the spend stands now, as /glitch budget does.
export function withConfigCaps(b: Budget, c: { budgetSession: number; budgetDaily: number }, sessionSpent: number): Budget {
  const sessionCap = b.sessionCapOverridden ? b.sessionCap : c.budgetSession
  const dailyCap = c.budgetDaily
  return {
    ...b,
    sessionCap,
    dailyCap,
    notified: {
      session: sessionCap === b.sessionCap ? b.notified.session : levelOf(sessionSpent, sessionCap),
      daily: dailyCap === b.dailyCap ? b.notified.daily : levelOf(b.dailySpent, dailyCap),
    },
  }
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
