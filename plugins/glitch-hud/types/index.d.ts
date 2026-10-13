export type PartId = 'turn' | 'speed' | 'cost' | 'cache' | 'context' | 'git'

export type Level = 'ok' | 'warn' | 'alert' | 'over'

/** glitch-core's Theme, restated so this plugin types without it. */
export type HudTheme = {
  name: string
  accent: string
  good: string
  warn: string
  alert: string
  muted: string
  info: string
  bar: [string, string]
  icons: 'emoji' | 'symbols' | 'ascii'
}

export type Stats = {
  turn: number
  /** Output tokens per second of the last main response; null before one was timed. */
  speed: number | null
  /** Cost of the running or last turn; null before the first turn. */
  turnCost: number | null
  /** Session cost so far, USD. */
  total: number
  /** Context fill, 0–100. */
  context: number
  costAtStart: number
}

export type CacheState = {
  expiresAt: number | null
  secondsLeft: number | null
  /** Smallest warning mark announced since the last answer; 0 none. */
  warnedMark: number
  isBusy: boolean
  /** Last prompt the person submitted, clock ms. */
  lastPromptAt: number
  /** A keep-warm ran since the person's last prompt. */
  warmedSincePrompt: boolean
}

export type Budget = {
  sessionCap: number
  dailyCap: number
  isOff: boolean
  /** Local day (YYYY-MM-DD) the day figures belong to. */
  day: string
  /** Session total at the start of `day`. */
  dayBase: number
  /** Every session's spend on `day`, from the ledger. */
  dailySpent: number
  notified: { session: Level; daily: Level }
  /** `/glitch demo budget <pct>`: shown level until the next answer. */
  demoPercent: number | null
  /** The session id the day figures were counted for. */
  sessionId: string
  /** Session total at the last record. */
  lastTotal: number
  /** The ledger key this run writes. */
  ledgerKey: string
  /** What `ledgerKey` held when this run first wrote it (an earlier run of a resumed session). */
  priorForKey: number
}

export type GitInfo = { branch: string; changed: number; ahead: number; behind: number }

export type View = { isHidden: boolean; parts: PartId[] | null }

declare module 'claude-code' {
  interface PluginState {
    'glitch-hud': { stats: Stats; cache: CacheState; budget: Budget; git: GitInfo | null; view: View }
  }
}
