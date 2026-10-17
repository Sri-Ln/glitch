// The press target laid over the pet on the desktop: a blank region that posts
// each press to the hooks module. A Button there draws as a native button, and an
// Svg takes no presses at all.
import type { ClientModule } from 'claude-code'

const Poke: ClientModule<null, true> = (_props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'down' && (e.button ?? 'left') === 'left') surface.post({ poke: true })
    })
    surface.setState(true)
  }
  return <Text>{' '.repeat(Math.max(1, surface.columns))}</Text>
}
export default Poke
