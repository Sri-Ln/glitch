// Initial values of the plugin's state atoms. The atoms themselves are declared in
// register.tsx: the load-time scan only follows atoms declared in the file that
// reads and writes them.
import type { Budget, CacheState, GitInfo, Stats, View } from '../types'
import { DEFAULT_CONFIG } from './config'
import type { HudConfig } from './config'

export const INITIAL_STATS: Stats = {
  turn: 0, speed: null, turnCost: null, total: 0, context: 0, costAtStart: 0,
}

export const INITIAL_CACHE: CacheState = {
  expiresAt: null, secondsLeft: null, warnedMark: 0, isBusy: false, lastPromptAt: 0, warmedSincePrompt: false,
}

export const initialBudget = (config: HudConfig): Budget => ({
  sessionCap: config.budgetSession,
  dailyCap: config.budgetDaily,
  isOff: false,
  day: '',
  dayBase: 0,
  dailySpent: 0,
  notified: { session: 'ok', daily: 'ok' },
  demoPercent: null,
  sessionId: '',
  lastTotal: 0,
  ledgerKey: '',
  priorForKey: 0,
})

export const INITIAL_BUDGET: Budget = initialBudget(DEFAULT_CONFIG)

export const INITIAL_GIT: GitInfo | null = null

export const INITIAL_VIEW: View = { isHidden: false, parts: null }
