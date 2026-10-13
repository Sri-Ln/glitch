import type { EngineInterface } from 'claude-code'

import type { GitInfo } from '../types'

export const GIT_ARGV: readonly string[] = ['git', 'status', '--porcelain=v2', '--branch']

// `git status --porcelain=v2 --branch`: headers start with `# branch.`, entries
// with 1 (changed), 2 (renamed), u (unmerged) or ? (untracked); ! is ignored.
export function parseStatus(stdout: string): GitInfo | null {
  let branch = ''
  let oid = ''
  let ahead = 0
  let behind = 0
  let changed = 0
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length).trim()
    else if (line.startsWith('# branch.head ')) branch = line.slice('# branch.head '.length).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (/^[12u?] /.test(line)) changed++
  }
  if (!branch) return null
  if (branch === '(detached)') branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : 'detached'
  return { branch, changed, ahead, behind }
}

export async function readGit($: EngineInterface): Promise<GitInfo | null> {
  const ran = await $.process.run(GIT_ARGV, { timeoutMs: 5000 }).catch(() => null)
  if (!ran || ran.exitCode !== 0) return null
  return parseStatus(ran.stdout)
}
