import type { HudTheme } from '../types'

// glitch-core's default theme, used when glitch-core is not installed. Keep it
// equal to glitch-core's `THEMES.glitch`.
export const FALLBACK_THEME: HudTheme = {
  name: 'glitch',
  accent: '#00e5ff',
  good: '#5af78e',
  warn: '#f3c969',
  alert: '#ff5c8a',
  muted: '#7a7f8c',
  info: '#c77dff',
  bar: ['▓', '░'],
  icons: 'symbols',
}

const isTheme = (v: unknown): v is HudTheme =>
  typeof v === 'object' && v !== null && typeof (v as HudTheme).accent === 'string' && Array.isArray((v as HudTheme).bar)

// The kit's theme as glitch-core publishes it (read by register.tsx while
// drawing, so a theme switch redraws the band).
export const toTheme = (value: unknown): HudTheme => (isTheme(value) ? value : FALLBACK_THEME)
