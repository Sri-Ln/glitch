export type ThemeIcons = 'emoji' | 'symbols' | 'ascii'

export type Theme = {
  name: string
  accent: string
  good: string
  warn: string
  alert: string
  muted: string
  info: string
  /** Progress-bar characters: [filled, empty]. */
  bar: [string, string]
  icons: ThemeIcons
}

declare module 'claude-code' {
  interface PluginState {
    'glitch-core': { theme: Theme }
  }
}
