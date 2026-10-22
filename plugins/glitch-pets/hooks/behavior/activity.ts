// What a crew member is doing, in words, from the tool call it is making. Pure.
import { shortOf } from './crew'

type Call = { tool: string } & Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')
/** A path's last part: "pane.tsx" for "C:\\x\\hooks\\pane.tsx". */
const base = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const quoted = (t: string): string => `“${shortOf(t, 48)}”`
const hostOf = (url: string): string => {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/** "Reading pane.tsx", "Searching the web: “…”", "Running: npm test"; a tool it does not know by its name. */
export function activityOf(call: Call): string {
  const t = call.tool
  const path = str(call.file_path) || str(call.notebook_path) || str(call.path)
  switch (t) {
    case 'Read':
      return path ? `Reading ${base(path)}` : 'Reading a file'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return path ? `Editing ${base(path)}` : 'Editing a file'
    case 'Write':
      return path ? `Writing ${base(path)}` : 'Writing a file'
    case 'Grep':
      return str(call.pattern) ? `Searching the code: ${quoted(str(call.pattern))}` : 'Searching the code'
    case 'Glob':
      return str(call.pattern) ? `Finding files: ${shortOf(str(call.pattern), 48)}` : 'Finding files'
    case 'Bash':
    case 'PowerShell': {
      const said = str(call.description) || str(call.command)
      return said ? `Running: ${shortOf(said, 60)}` : 'Running a command'
    }
    case 'WebSearch':
      return str(call.query) ? `Searching the web: ${quoted(str(call.query))}` : 'Searching the web'
    case 'WebFetch':
      return str(call.url) ? `Reading ${hostOf(str(call.url))}` : 'Reading a web page'
    case 'Agent':
    case 'Task':
      return 'Starting a helper'
    case 'TodoWrite':
      return 'Updating its to-do list'
    case 'Skill':
      return str(call.skill) ? `Using the ${str(call.skill)} skill` : 'Using a skill'
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(t)
  if (mcp) return `Using ${mcp[1]}: ${(mcp[2] as string).replace(/_/g, ' ')}`
  return `Using ${t}`
}
