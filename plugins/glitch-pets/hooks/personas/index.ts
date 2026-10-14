// Every pet, by id. A new pet is one persona file and one line here.
import type { Persona, PetId } from '../behavior/types'
import blob from './blob'
import screenhead from './screenhead'

export const PERSONAS: Readonly<Partial<Record<PetId, Persona>>> = {
  screenhead,
  blob,
}
