// The press target laid over the crew pane's lead on the desktop: a blank region that
// posts each press to the hooks module. A Button there draws as a native button, and an
// Svg takes no presses at all.
import type { ClientModule } from 'claude-code'

const LeadPoke: ClientModule<null, true> = (_props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'down' && (e.button ?? 'left') === 'left') surface.post({ poke: true })
    })
    surface.setState(true)
  }
  // Blank on every row, so the press lands anywhere over the lead.
  const blank = ' '.repeat(Math.max(1, surface.columns))
  return <Text>{Array.from({ length: Math.max(1, surface.rows) }, () => blank).join('\n')}</Text>
}
export default LeadPoke
