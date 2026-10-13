import { expect, test } from 'claude-code/testing'

import { DEFAULT_THEME, THEMES, THEME_NAMES, resolveTheme } from './themes'

test('themes: the six built-ins exist and glitch is the default', async () => {
  expect(THEME_NAMES).toEqual(['glitch', 'neon', 'mono', 'sunset', 'matrix', 'paper'])
  expect(DEFAULT_THEME).toBe('glitch')
  expect(resolveTheme(undefined, undefined)).toEqual({ theme: THEMES.glitch, problems: [] })
})

test('themes: a known name resolves to that theme', async () => {
  expect(resolveTheme('matrix', '').theme.name).toBe('matrix')
})

test('themes: an unknown name falls back and says why', async () => {
  const r = resolveTheme('vaporwave', '')
  expect(r.theme.name).toBe('glitch')
  expect(resolveTheme('constructor', '').problems).toEqual(['unknown theme "constructor", using glitch'])
  expect(r.problems).toEqual(['unknown theme "vaporwave", using glitch'])
})

test('themes: custom tokens override the base', async () => {
  const r = resolveTheme('neon', '{"accent":"#ff6ad5","bar":"█░","icons":"ascii"}')
  expect(r.problems).toEqual([])
  expect(r.theme.accent).toBe('#ff6ad5')
  expect(r.theme.bar).toEqual(['█', '░'])
  expect(r.theme.icons).toBe('ascii')
  expect(r.theme.good).toBe(THEMES.neon?.good)
})

test('themes: malformed custom JSON is ignored with a problem', async () => {
  const r = resolveTheme('glitch', '{oops')
  expect(r.theme).toEqual(THEMES.glitch)
  expect(r.problems).toEqual(['custom theme is not valid JSON, ignored'])
})

test('themes: bad token values are skipped one by one', async () => {
  const r = resolveTheme('glitch', '{"accent":"red","bar":"abc","icons":"pixels","good":"#00ff00"}')
  expect(r.theme.good).toBe('#00ff00')
  expect(r.theme.accent).toBe(THEMES.glitch?.accent)
  expect(r.problems).toEqual([
    'custom.accent must be a #rrggbb color',
    'custom.bar must be exactly two characters',
    'custom.icons must be emoji, symbols or ascii',
  ])
})

test('themes: resolving never mutates the built-in table', async () => {
  resolveTheme('glitch', '{"accent":"#123456"}')
  expect(THEMES.glitch?.accent).toBe('#00e5ff')
})
