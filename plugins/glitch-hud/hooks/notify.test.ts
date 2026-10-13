import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { notify, projectName, toastArgv } from './notify'

// The test body's `$` has no env/process nouns, so notify runs against a stub
// holding only the members it uses. Calls are recorded and asserted outside it.
type Stub = {
  env?: Record<string, string>
  run?: () => { exitCode: number, stdout: string, stderr: string }
  notify?: () => { isSent: boolean, channel?: string, reason?: string }
}

function stubEngine(s: Stub = {}) {
  const calls = { run: 0, notify: 0, toasts: [] as string[] }
  const $ = {
    env: { get: async (k: string) => s.env?.[k] },
    process: {
      run: async () => {
        calls.run++
        if (!s.run) throw new Error('must not run')
        return s.run()
      },
    },
    ui: {
      notify: async () => {
        calls.notify++
        return s.notify?.() ?? { isSent: false, reason: 'no-channel' }
      },
      toast: (text: string) => {
        calls.toasts.push(text)
      },
    },
  } as unknown as EngineInterface
  return { $, calls }
}

test('notify: project name from a Windows or POSIX path', async () => {
  expect(projectName('C:\\Srikanth\\Projects\\Claudemods')).toBe('Claudemods')
  expect(projectName('/home/me/app/')).toBe('app')
  expect(projectName('')).toBe('session')
})

test('notify: the PowerShell script escapes quotes and XML', async () => {
  const argv = toastArgv("Bob's <app>", 'a & b')
  expect(argv.slice(0, 5)).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'])
  const script = argv[6] ?? ''
  expect(script).toContain("Bob''s &lt;app&gt;")
  expect(script).toContain('a &amp; b')
  expect(script).toContain('ToastNotificationManager')
})

test('notify: windows toast first on Windows', async () => {
  const { $ } = stubEngine({ env: { OS: 'Windows_NT' }, run: () => ({ exitCode: 0, stdout: '', stderr: '' }) })
  expect(await notify($, 'windows', 'proj — Glitch', 'Prompt cache expires in 5 min')).toBe('windows')
})

test('notify: falls back to Claude Code, then a toast', async () => {
  const { $, calls } = stubEngine({
    env: { OS: 'Windows_NT' },
    run: () => ({ exitCode: 1, stdout: '', stderr: 'boom' }),
    notify: () => ({ isSent: false, reason: 'no-channel' }),
  })
  expect(await notify($, 'windows', 'proj — Glitch', 'Cache 5 min')).toBe('toast')
  expect(calls.toasts).toEqual(['proj — Glitch: Cache 5 min'])
})

test('notify: not Windows skips PowerShell', async () => {
  const { $, calls } = stubEngine({ env: {}, notify: () => ({ isSent: true, channel: 'kitty' }) })
  expect(await notify($, 'windows', 't', 'm')).toBe('claude')
  expect(calls.run).toBe(0)
})

test('notify: off and toast modes', async () => {
  const { $, calls } = stubEngine()
  expect(await notify($, 'off', 't', 'm')).toBe('off')
  expect(calls.toasts).toEqual([])
  expect(await notify($, 'toast', 't', 'm')).toBe('toast')
  expect(calls.toasts).toEqual(['t: m'])
})
