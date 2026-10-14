// The daily streak: consecutive local days with at least one turn. Pure; the
// caller keeps it in $.store under STORE_STREAK.
export type Streak = { lastDay: string; count: number; cheered: number }

export const STORE_STREAK = 'streak'

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const yesterdayOf = (ms: number): string => {
  const d = new Date(ms)
  d.setDate(d.getDate() - 1)
  return dayKey(d.getTime())
}

const FIRST = [3, 7, 14, 30, 50, 100]
export const isMilestone = (n: number): boolean => FIRST.includes(n) || (n > 100 && n % 100 === 0)

export function advance(s: Streak | null, nowMs: number): { streak: Streak; cheer: boolean; changed: boolean } {
  const today = dayKey(nowMs)
  if (s && s.lastDay === today) return { streak: s, cheer: false, changed: false }
  const count = s && s.lastDay === yesterdayOf(nowMs) ? s.count + 1 : 1
  const cheer = isMilestone(count) && (s?.cheered ?? 0) !== count
  return { streak: { lastDay: today, count, cheered: cheer ? count : (s?.cheered ?? 0) }, cheer, changed: true }
}

export function asStreak(v: unknown): Streak | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return typeof o.lastDay === 'string' && typeof o.count === 'number' && typeof o.cheered === 'number'
    ? { lastDay: o.lastDay, count: o.count, cheered: o.cheered }
    : null
}
