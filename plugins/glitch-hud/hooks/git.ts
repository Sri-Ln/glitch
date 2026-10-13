import type { GitInfo } from '../types'

export type RunFn = (argv: readonly string[], init: { timeoutMs: number }) => Promise<{ exitCode: number; stdout: string }>

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

// The engine's process call is injected, so this stays free of `$`.
export async function readGit(run: RunFn): Promise<GitInfo | null> {
  try {
    const ran = await run(GIT_ARGV, { timeoutMs: 5000 })
    return ran.exitCode === 0 ? parseStatus(ran.stdout) : null
  } catch {
    return null
  }
}
