// Crew theme "Hats": the first crew look, as a theme. The pet's first idle frame under its
// role's hat, colored by tier (model and effort). Still: never animated. 16 × 16.
import { tierOf } from '../behavior/crew'
import { withHat } from '../behavior/hats'
import type { CrewMiniInput, CrewTheme } from './types'

const hats: CrewTheme = {
  id: 'hats',
  name: 'Hats',
  description: 'A hat per role over the still pet; the hat color is the tier (light, medium, heavy).',
  size: { columns: 16, rows: 16 },
  keys: ['1', '2', '3'],
  mini({ persona, role, model, effort }: CrewMiniInput) {
    const hatted = withHat(persona.moods.idle.frames[0] ?? [], persona.hatAnchor, role, tierOf(model, effort))
    return { frame: hatted.frame, palette: { ...persona.palette, ...hatted.palette } }
  },
}

export default hats
