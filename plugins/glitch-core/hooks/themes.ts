import type { Theme } from '../types'

export const THEMES: Record<string, Theme> = {
  glitch: { name: 'glitch', accent: '#00e5ff', good: '#5af78e', warn: '#f3c969', alert: '#ff5c8a', muted: '#7a7f8c', info: '#c77dff', bar: ['▓', '░'], icons: 'symbols' },
  neon: { name: 'neon', accent: '#ff2bd6', good: '#39ff14', warn: '#ffd300', alert: '#ff3131', muted: '#8a8aa8', info: '#00f0ff', bar: ['█', '▁'], icons: 'symbols' },
  mono: { name: 'mono', accent: '#ffffff', good: '#d0d0d0', warn: '#b0b0b0', alert: '#ffffff', muted: '#808080', info: '#c0c0c0', bar: ['■', '□'], icons: 'ascii' },
  sunset: { name: 'sunset', accent: '#ff8c42', good: '#a3d977', warn: '#ffc857', alert: '#e84855', muted: '#9c8f8a', info: '#c06cde', bar: ['█', '░'], icons: 'emoji' },
  matrix: { name: 'matrix', accent: '#00ff41', good: '#00ff41', warn: '#c6ff00', alert: '#ff073a', muted: '#008f11', info: '#00d1a0', bar: ['█', '·'], icons: 'symbols' },
  paper: { name: 'paper', accent: '#3b5bdb', good: '#2b8a3e', warn: '#e67700', alert: '#c92a2a', muted: '#868e96', info: '#7048e8', bar: ['▓', '░'], icons: 'symbols' },
}

export const THEME_NAMES = Object.keys(THEMES)
export const DEFAULT_THEME = 'glitch'

const COLOR = /^#[0-9a-fA-F]{6}$/
const COLOR_TOKENS = ['accent', 'good', 'warn', 'alert', 'muted', 'info'] as const

const copy = (t: Theme): Theme => ({ ...t, bar: [t.bar[0], t.bar[1]] })

// A built-in theme with the `custom` JSON's tokens laid over it. Anything that
// does not check out is skipped and named in `problems`; nothing throws.
export function resolveTheme(name: string | undefined, custom: string | undefined): { theme: Theme; problems: string[] } {
  const problems: string[] = []
  let base = THEMES[DEFAULT_THEME] as Theme
  if (name) {
    const known = THEMES[name]
    if (known) base = known
    else problems.push(`unknown theme "${name}", using ${DEFAULT_THEME}`)
  }
  const theme = copy(base)
  if (!custom || !custom.trim()) return { theme, problems }

  let parsed: unknown
  try {
    parsed = JSON.parse(custom)
  } catch {
    problems.push('custom theme is not valid JSON, ignored')
    return { theme, problems }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    problems.push('custom theme must be a JSON object, ignored')
    return { theme, problems }
  }

  const tokens = parsed as Record<string, unknown>
  for (const key of COLOR_TOKENS) {
    const value = tokens[key]
    if (value === undefined) continue
    if (typeof value === 'string' && COLOR.test(value)) theme[key] = value
    else problems.push(`custom.${key} must be a #rrggbb color`)
  }
  if (tokens.bar !== undefined) {
    const chars = typeof tokens.bar === 'string' ? [...tokens.bar] : []
    if (chars.length === 2) theme.bar = [chars[0] as string, chars[1] as string]
    else problems.push('custom.bar must be exactly two characters')
  }
  if (tokens.icons !== undefined) {
    if (tokens.icons === 'emoji' || tokens.icons === 'symbols' || tokens.icons === 'ascii') theme.icons = tokens.icons
    else problems.push('custom.icons must be emoji, symbols or ascii')
  }
  return { theme, problems }
}
