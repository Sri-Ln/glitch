// The pet slot: glitch-pets publishes its current frame; the band draws it at the
// row's end when it is well formed, and nothing otherwise.
export type PetSprite = { source: string; alt: string; width: number; height: number }

/** The cells the 24 px pet takes in the desktop row (about 3.4 cells; one spare). */
export const PET_CELLS = 4
const MAX_PX = 64

export function isSprite(v: unknown): v is PetSprite {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const px = (n: unknown) => typeof n === 'number' && n > 0 && n <= MAX_PX
  return typeof o.source === 'string' && o.source.startsWith('<svg') && typeof o.alt === 'string' && px(o.width) && px(o.height)
}
