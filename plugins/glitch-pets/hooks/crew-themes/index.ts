// Every crew theme, by id. A new theme is one file in this folder and one line here
// (plus its id in plugin.json's crewTheme options, so the settings screen offers it).
import { frameSvg } from '../behavior/player'
import type { Sprite } from '../behavior/types'
import busyHands from './busy-hands'
import hats from './hats'
import type { CrewMiniInput, CrewTheme } from './types'

export const CREW_THEMES: Readonly<Record<string, CrewTheme>> = {
  'busy-hands': busyHands,
  hats,
}

export const DEFAULT_CREW_THEME = 'busy-hands'

export const crewThemeIds = (): string[] => Object.keys(CREW_THEMES)

const cache = new Map<string, Sprite>()
const CACHE_MAX = 2000

/**
 * A helper's mini in the crew pane: the theme's frame for this moment as an image, `pixel` CSS px
 * per sprite pixel. An unknown theme falls back to busy-hands; a theme that throws falls back to
 * busy-hands, then hats; if every theme fails this throws, and the pane's render falls back.
 */
export function crewMini(themeId: string, input: CrewMiniInput, pixel: number): Sprite {
  const order = [...new Set([themeId, DEFAULT_CREW_THEME, 'hats'])]
  let lastError: unknown = new Error('no crew theme')
  for (const id of order) {
    const theme = CREW_THEMES[id]
    if (!theme) continue
    try {
      const { frame, palette } = theme.mini(input)
      const alt = `${input.persona.name}, ${input.role}${input.model ? `, ${input.model}` : ''}, ${input.status}`
      const key = `${theme.id}|${input.persona.id}|${pixel}|${alt}|${frame.join('')}`
      let s = cache.get(key)
      if (!s) {
        if (cache.size >= CACHE_MAX) cache.clear()
        const width = frame[0]?.length ?? theme.size.columns
        s = { source: frameSvg(palette, frame, pixel), alt, width: Math.round(width * pixel), height: Math.round(frame.length * pixel) }
        cache.set(key, s)
      }
      return s
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}
