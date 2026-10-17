// Crew hat redesign candidates for issue #41 (mockup only; nothing wires these in yet).
// Gallery-safe: only `import type`, so scripts/hats-mockup.mjs can load it in Node.
//
// Palette keys: '1' tier main, '2' tier shade, '3' white highlight (the keys hats already reserve),
// plus, for the props and the crown, '0' gold, '5' wood, '8' steel, '9' ink. No persona uses a
// digit today; shipping option B would extend the reserved list in contract.ts to 0,1,2,3,5,8,9.
import type { Frame, Role, Tier } from './types'

export const TIER_MAIN: Record<Tier, string> = { light: '#3ddc84', medium: '#4f8cff', heavy: '#e8483e' }
export const TIER_SHADE: Record<Tier, string> = { light: '#1f8a4c', medium: '#2a5bc0', heavy: '#9c2a22' }
export const EXTRA_KEYS = { '3': '#ffffff', '0': '#ffd23f', '5': '#a8743a', '8': '#98a1b8', '9': '#2a2d3a' } as const
export const ROLES: readonly Role[] = ['builder', 'researcher', 'designer', 'tester', 'reviewer', 'other']

export const paletteFor = (tier: Tier): Record<string, string> => ({ '1': TIER_MAIN[tier], '2': TIER_SHADE[tier], ...EXTRA_KEYS })

// Option A: 5 rows × 12, centred on the anchor; the brim (last row) sits just above the head.
// One silhouette per role: hard hat, mortarboard, beret, goggles, crown, bobble beanie.
export const BOLD_HATS: Record<Role, readonly string[]> = {
  builder: [
    '............',
    '....1111....',
    '..13111111..',
    '.1311111111.',
    '222222222222',
  ],
  researcher: [
    '.....33.....',
    '..11111111..',
    '111111111111',
    '3.22222222..',
    '3.22222222..',
  ],
  designer: [
    '....22......',
    '..1111111...',
    '.11111111311',
    '111111111111',
    '..222222..11',
  ],
  tester: [
    '............',
    '.1111..1111.',
    '213312213312',
    '213312213312',
    '.1111..1111.',
  ],
  reviewer: [
    '..1..11..1..',
    '..11.11.11..',
    '..11111111..',
    '..10111101..',
    '..22222222..',
  ],
  other: [
    '.....33.....',
    '....3333....',
    '...111111...',
    '..11111111..',
    '..22222222..',
  ],
}

// Options B and C: the same silhouettes squeezed to 3 rows (today's height).
export const COMPACT_HATS: Record<Role, readonly string[]> = {
  builder: ['....1111....', '..13111111..', '222222222222'],
  researcher: ['.....33.....', '111111111111', '3..222222...'],
  designer: ['.......2....', '..111111131.', '1111111111..'],
  tester: ['.1111..1111.', '213312213312', '.1111..1111.'],
  reviewer: ['..1..11..1..', '..11111111..', '..20222202..'],
  other: ['.....33.....', '...111111...', '..22222222..'],
}

// Option B props, 5 × 7, held at the pet's right side. Option C draws them as one-color chip icons.
export const PROPS: Record<Role, readonly string[]> = {
  builder: ['88888', '88888', '.95..', '..5..', '..5..', '..5..', '..5..'],
  researcher: ['.888.', '8...8', '8...8', '8...8', '.888.', '...5.', '....5'],
  designer: ['...11', '..111', '..88.', '..5..', '.5...', '.5...', '5....'],
  tester: ['.888.', '.8.8.', '.8.8.', '8...8', '81118', '81118', '88888'],
  reviewer: ['.....', '..0..', '..0..', '00000', '.000.', '.0.0.', '0...0'],
  other: ['.....', '.8.8.', '88888', '88.88', '88888', '.8.8.', '.....'],
}

const blank = (w: number): string => '.'.repeat(w)

function stamp(rows: string[][], art: readonly string[], left: number, top: number): void {
  art.forEach((line, dy) => {
    ;[...line].forEach((ch, dx) => {
      const x = left + dx
      const y = top + dy
      if (ch !== '.' && rows[y] && x >= 0 && x < (rows[y] as string[]).length) (rows[y] as string[])[x] = ch
    })
  })
}

/** Pads the frame to `width` columns and adds `above` empty rows on top and `below` underneath. */
function canvas(frame: Frame, above: number, below: number, width = 16): string[][] {
  const pad = (r: string) => r + blank(width - r.length)
  return [...Array(above).fill(blank(width)), ...frame.map(pad), ...Array(below).fill(blank(width))].map(r => r.split(''))
}

const hatLeft = (anchor: { x: number }) => anchor.x - 5

/** Option A: a 5-row bold hat over the head and a tier bar under the feet (frame 16 × 19). */
export function boldHat(frame: Frame, anchor: { x: number; y: number }, role: Role, tier: Tier): { frame: Frame; palette: Record<string, string> } {
  const rows = canvas(frame, 5, 1)
  const hat = BOLD_HATS[role]
  stamp(rows, hat, hatLeft(anchor), anchor.y + 5 - hat.length)
  stamp(rows, ['.111111111111.'], 1, rows.length - 1)
  return { frame: rows.map(r => r.join('')), palette: paletteFor(tier) }
}

/** Option C's mini: today's 3-row height with the compact silhouette (frame 16 × 16). */
export function compactHat(frame: Frame, anchor: { x: number; y: number }, role: Role, tier: Tier): { frame: Frame; palette: Record<string, string> } {
  const rows = canvas(frame, 3, 0)
  const hat = COMPACT_HATS[role]
  stamp(rows, hat, hatLeft(anchor), anchor.y + 3 - hat.length)
  return { frame: rows.map(r => r.join('')), palette: paletteFor(tier) }
}

/** Option B: the compact hat plus the role's prop held at the right (frame 20 × 16). */
export function propHat(frame: Frame, anchor: { x: number; y: number }, role: Role, tier: Tier): { frame: Frame; palette: Record<string, string> } {
  const rows = canvas(frame, 3, 0, 20)
  const hat = COMPACT_HATS[role]
  stamp(rows, hat, hatLeft(anchor), anchor.y + 3 - hat.length)
  stamp(rows, PROPS[role], 15, rows.length - 8)
  return { frame: rows.map(r => r.join('')), palette: paletteFor(tier) }
}
