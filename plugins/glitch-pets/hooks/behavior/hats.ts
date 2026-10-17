// Crew hats, shared by every pet: shape by role, color by tier. Gallery-safe.
import type { Frame, Role, Tier } from './types'

export const TIER_COLORS: Record<Tier, string> = { light: '#3ddc84', medium: '#4f8cff', heavy: '#e8483e' }
const SHADE: Record<Tier, string> = { light: '#1f8a4c', medium: '#2a5bc0', heavy: '#9c2a22' }

// 3 rows × 8; '1' main color, '2' shade, '3' a light accent. The brim is the last row.
const HATS: Record<Exclude<Role, 'reviewer'>, readonly string[]> = {
  builder: ['..1111..', '.111111.', '22222222'],
  researcher: ['...11...', '.111111.', '22222222'],
  designer: ['....3...', '.11111..', '1111112.'],
  tester: ['........', '.33..33.', '22222222'],
  other: ['........', '..1111..', '.222222.'],
}

/** The frame with 3 rows added on top and the role's hat drawn so its brim sits just above the anchor. */
export function withHat(frame: Frame, anchor: { x: number; y: number }, role: Role, tier: Tier): { frame: Frame; palette: Record<string, string> } {
  const rows = ['................', '................', '................', ...frame].map(r => r.split(''))
  if (role !== 'reviewer') {
    const hat = HATS[role]
    const top = anchor.y + 3 - hat.length
    hat.forEach((line, dy) => {
      ;[...line].forEach((ch, dx) => {
        const x = anchor.x - 3 + dx
        const y = top + dy
        if (ch !== '.' && x >= 0 && x < 16 && y >= 0 && rows[y]) (rows[y] as string[])[x] = ch
      })
    })
  }
  return { frame: rows.map(r => r.join('')), palette: { '1': TIER_COLORS[tier], '2': SHADE[tier], '3': '#ffffff' } }
}
