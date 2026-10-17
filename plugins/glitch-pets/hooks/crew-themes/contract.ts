// The rules every crew theme keeps, checked for every pet × role × model × status over a few
// moments of its loop. The theme tests run it on each registered theme.
import type { Persona, Role } from '../behavior/types'
import { LAPTOP_KEYS, PET_KEY } from '../behavior/types'
import type { CrewStatus, CrewTheme } from './types'

export const THEME_ROLES: readonly Role[] = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']
/** One model id per family, as the engine reports them. */
export const THEME_MODELS: readonly string[] = ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1']
export const THEME_STATUSES: readonly CrewStatus[] = ['running', 'done', 'failed']
/** Moments of a loop the checker draws (ms). */
const MOMENTS = [0, 90, 125, 200, 250, 340, 400, 650, 1000, 2500, 10_000]
const HEX = /^#[0-9a-f]{6}$/i
const ID = /^[a-z][a-z0-9-]*$/

export function themeProblems(theme: CrewTheme, personas: readonly Persona[]): string[] {
  const out = new Set<string>()
  const { columns, rows } = theme.size
  if (!ID.test(theme.id)) out.add(`id "${theme.id}" must be lowercase letters, digits and dashes`)
  if (!theme.name || !theme.description) out.add('name and description are required')
  if (!(Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0)) out.add('size must be whole columns and rows above 0')
  if (theme.fps !== undefined && !(theme.fps > 0)) out.add('fps must be above 0 when set')
  for (const key of theme.keys) {
    if (key.length !== 1 || key === '.') out.add(`key "${key}" must be one char other than "."`)
    else if (PET_KEY.test(key)) out.add(`key "${key}" is a letter: letters are the pet's`)
    else if (LAPTOP_KEYS.includes(key)) out.add(`key "${key}" is the laptop's`)
  }
  for (const persona of personas)
    for (const role of THEME_ROLES)
      for (const model of THEME_MODELS)
        for (const status of THEME_STATUSES)
          for (const elapsedMs of MOMENTS) {
            const at = `${persona.id} ${role} ${model} ${status}`
            const input = { persona, role, model, effort: null, status, elapsedMs }
            let mini: ReturnType<CrewTheme['mini']>
            try {
              mini = theme.mini(input)
            } catch (err) {
              out.add(`${at} threw: ${String(err)}`)
              continue
            }
            const { frame, palette } = mini
            if (frame.length !== rows) out.add(`${at} has ${frame.length} rows, not ${rows}`)
            let petShown = false
            frame.forEach((row, y) => {
              if (row.length !== columns) out.add(`${at} row ${y} is ${row.length} wide, not ${columns}`)
              for (const ch of row) {
                if (ch === '.') continue
                if (!(ch in palette)) out.add(`${at} uses "${ch}", not in its palette`)
                if (ch in persona.palette && PET_KEY.test(ch)) petShown = true
              }
            })
            if (!petShown) out.add(`${at} shows no pixel of the pet`)
            for (const [key, color] of Object.entries(palette)) {
              if (!(key in persona.palette) && !theme.keys.includes(key)) out.add(`palette key "${key}" is not one of its keys or the pet's`)
              if (!HEX.test(color)) out.add(`palette "${key}" must be #rrggbb, got ${color}`)
            }
            if (theme.mini(input).frame.join('\n') !== frame.join('\n')) out.add(`${at} is not pure: the same input drew two frames`)
          }
  return [...out].slice(0, 40)
}
