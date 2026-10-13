import { expect, test } from 'claude-code/testing'

import { GIT_ARGV, parseStatus, readGit } from './git'

const CLEAN = '# branch.oid 1234567890abcdef\r\n# branch.head main\r\n# branch.upstream origin/main\r\n# branch.ab +0 -0\r\n'

test('git: clean branch', async () => {
  expect(parseStatus(CLEAN)).toEqual({ branch: 'main', changed: 0, ahead: 0, behind: 0 })
})

test('git: changed, untracked and ahead/behind', async () => {
  const out = '# branch.oid abc\n# branch.head feat/x\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/a.ts\n2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts\nu UU N... 1 2 3 4 a b c x.ts\n? notes.md\n! ignored.log\n'
  expect(parseStatus(out)).toEqual({ branch: 'feat/x', changed: 4, ahead: 2, behind: 1 })
})

test('git: detached head shows the short sha', async () => {
  expect(parseStatus('# branch.oid 9f8e7d6c5b4a\n# branch.head (detached)\n')?.branch).toBe('9f8e7d6')
})

test('git: no branch header is not a repo', async () => {
  expect(parseStatus('')).toBeNull()
})

type Run = (argv: readonly string[], init?: unknown) => Promise<{ exitCode: number; stdout: string; stderr: string }>

test('git: readGit hides on failure', async () => {
  let argv: readonly string[] = []
  const run: Run = async a => {
    argv = a
    return { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
  }
  expect(await readGit(run)).toBeNull()
  expect(argv).toEqual(GIT_ARGV)
})

test('git: readGit parses a good run', async () => {
  const run: Run = async () => ({ exitCode: 0, stdout: CLEAN, stderr: '' })
  expect(await readGit(run)).toEqual({ branch: 'main', changed: 0, ahead: 0, behind: 0 })
})

test('git: readGit hides when the run rejects', async () => {
  const run: Run = () => Promise.reject(new Error('timed out'))
  expect(await readGit(run)).toBeNull()
})
