// The fishing-rod reward's shared art: the gift every lead lowers and the sparkle the member's catch
// makes. Drawn with palette keys every pet has (C the wrap, Y the ribbon). Gallery-safe: only `import type`.
// Each pet's rod poses live in its persona file (`rod`).
import type { Frame } from './types'

/** The gift, 5 wide and 6 tall: a bow on top, a ribbon across. */
export const GIFT: Frame = ['.Y.Y.', '..Y..', 'CCYCC', 'CCYCC', 'YYYYY', 'CCYCC']

/** The catch's sparkle as it grows: small, large, then the burst. */
export const SPARKS: readonly Frame[] = [
  ['.Y.', 'YCY', '.Y.'],
  ['..Y..', '..Y..', 'YYCYY', '..Y..', '..Y..'],
  ['Y...Y', '.....', '.....', '.....', 'Y...Y'],
]
