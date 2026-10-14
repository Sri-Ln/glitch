import type { Register } from 'claude-code'

import { parsePetsConfig } from './config'

export const register: Register = (on, options) => {
  const { problems } = parsePetsConfig(options as Record<string, unknown>)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (problems.length) $.ui.toast(`Glitch pets: ${problems.join('; ')}`, { timeoutMs: 8000 })
    return started
  })
}
