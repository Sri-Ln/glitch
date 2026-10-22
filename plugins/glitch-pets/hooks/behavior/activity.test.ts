import { expect, test } from 'claude-code/testing'

import { activityOf } from './activity'

test('a file tool names the file, not its path', () => {
  expect(activityOf({ tool: 'Read', file_path: 'C:\\Srikanth\\hooks\\pane.tsx' })).toBe('Reading pane.tsx')
  expect(activityOf({ tool: 'Edit', file_path: '/repo/src/cpu-notes.md' })).toBe('Editing cpu-notes.md')
  expect(activityOf({ tool: 'Write', file_path: 'out/report.md' })).toBe('Writing report.md')
  expect(activityOf({ tool: 'NotebookEdit', notebook_path: '/n/a.ipynb' })).toBe('Editing a.ipynb')
  expect(activityOf({ tool: 'Read' })).toBe('Reading a file')
})

test('searches say what they look for; a command says its description first', () => {
  expect(activityOf({ tool: 'WebSearch', query: 'mRNA vaccine immune response' })).toBe('Searching the web: “mRNA vaccine immune response”')
  expect(activityOf({ tool: 'Grep', pattern: 'stepsOf' })).toBe('Searching the code: “stepsOf”')
  expect(activityOf({ tool: 'Glob', pattern: '**/*.ts' })).toBe('Finding files: **/*.ts')
  expect(activityOf({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })).toBe('Running: Run the tests')
  expect(activityOf({ tool: 'PowerShell', command: 'Get-ChildItem' })).toBe('Running: Get-ChildItem')
  expect(activityOf({ tool: 'WebFetch', url: 'https://example.org/a/b' })).toBe('Reading example.org')
})

test('other tools: a helper, the to-do list, a skill, an MCP tool, anything else by its name', () => {
  expect(activityOf({ tool: 'Agent' })).toBe('Starting a helper')
  expect(activityOf({ tool: 'TodoWrite' })).toBe('Updating its to-do list')
  expect(activityOf({ tool: 'Skill', skill: 'crew' })).toBe('Using the crew skill')
  expect(activityOf({ tool: 'mcp__github__create_issue' })).toBe('Using github: create issue')
  expect(activityOf({ tool: 'Frobnicate' })).toBe('Using Frobnicate')
})

test('long inputs are cut short with an ellipsis', () => {
  const said = activityOf({ tool: 'WebSearch', query: 'a '.repeat(60) })
  expect(said.length).toBeLessThan(80)
  expect(said.endsWith('…”')).toBe(true)
})
