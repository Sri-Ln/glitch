// Every pet, by id. A new pet is one persona file and one line here.
import { personaProblems } from '../behavior/contract'
import { withLaptop } from '../behavior/laptop'
import type { Persona, PetId } from '../behavior/types'
import blob from './blob'
import bud from './bud'
import dot from './dot'
import fork from './fork'
import pixel from './pixel'
import screenhead from './screenhead'

/** The pet on its laptop, or undefined when its file breaks the contract or composing throws: a broken pet is left out, never fatal. */
export function composeSafely(p: Persona): Persona | undefined {
  try {
    return personaProblems(p).length === 0 ? withLaptop(p) : undefined
  } catch {
    return undefined
  }
}

export const PERSONAS: Readonly<Partial<Record<PetId, Persona>>> = {
  screenhead: composeSafely(screenhead),
  blob: composeSafely(blob),
  pixel: composeSafely(pixel),
  dot: composeSafely(dot),
  fork: composeSafely(fork),
  bud: composeSafely(bud),
}
