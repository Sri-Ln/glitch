import { expect, test } from 'claude-code/testing'

import type { NotifyIO } from './notify'
import { DEFAULT_CONFIG } from './config'
import { notify, projectName, toastArgv } from './notify'

// notify takes its engine calls as an injected NotifyIO; the stub records them.
type Stub = {
  env?: Record<string, string>
  run?: () => { exitCode: number, stdout: string, stderr: string }
  notify?: () => { isSent: boolean, channel?: string, reason?: string }
}

function stubEngine(s: Stub = {}) {
  const calls = { run: 0, notify: 0, toasts: [] as string[] }
  const $: NotifyIO = {
    os: async () => s.env?.OS,
    run: async () => {
      calls.run++
      if (!s.run) throw new Error('must not run')
      return s.run()
    },
    notifyClaude: async () => {
      calls.notify++
      return s.notify?.() ?? { isSent: false }
    },
    toast: text => {
      calls.toasts.push(text)
    },
  }
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

test('notify: Unicode single quotes are doubled too', async () => {
  const script = toastArgv('Bob’s app', 'x')[6] ?? ''
  expect(script).toContain('Bob’’s app')
})

test('notify: windows toast first on Windows', async () => {
  const { $, calls } = stubEngine({ env: { OS: 'Windows_NT' }, run: () => ({ exitCode: 0, stdout: '', stderr: '' }) })
  expect(await notify($, 'windows', 'proj — Glitch', 'Prompt cache expires in 5 min')).toBe('windows')
  expect(calls.run).toBe(1)
  expect(calls.notify).toBe(0)
})

test('notify: falls back to Claude Code, then a toast', async () => {
  const { $, calls } = stubEngine({
    env: { OS: 'Windows_NT' },
    run: () => ({ exitCode: 1, stdout: '', stderr: 'boom' }),
    notify: () => ({ isSent: false, reason: 'no-channel' }),
  })
  expect(await notify($, 'windows', 'proj — Glitch', 'Cache 5 min')).toBe('toast')
  expect(calls.run).toBe(1)
  expect(calls.notify).toBe(1)
  expect(calls.toasts).toEqual(['proj — Glitch: Cache 5 min'])
})

test('notify: a rejected run and a throwing Claude Code notification still reach the toast', async () => {
  // No `run` in the stub: the PowerShell call rejects.
  const { $, calls } = stubEngine({ env: { OS: 'Windows_NT' }, notify: () => { throw new Error('notify refused') } })
  expect(await notify($, 'windows', 'proj — Glitch', 'Cache 5 min')).toBe('toast')
  expect(calls.run).toBe(1)
  expect(calls.notify).toBe(1)
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
  expect(calls.run).toBe(0)
  expect(calls.notify).toBe(0)
})

test('notify: with default settings on Windows a cache warning is an in-app toast only', async () => {
  // PowerShell and Claude Code's notification would both succeed; neither may be used.
  const { $, calls } = stubEngine({
    env: { OS: 'Windows_NT' },
    run: () => ({ exitCode: 0, stdout: '', stderr: '' }),
    notify: () => ({ isSent: true, channel: 'kitty' }),
  })
  expect(await notify($, DEFAULT_CONFIG.notify, 'proj — Glitch', 'Prompt cache expires in 5 min')).toBe('toast')
  expect(calls.run).toBe(0)
  expect(calls.notify).toBe(0)
  expect(calls.toasts).toEqual(['proj — Glitch: Prompt cache expires in 5 min'])
})

test('notify: off on Windows runs nothing and shows nothing', async () => {
  const { $, calls } = stubEngine({ env: { OS: 'Windows_NT' }, run: () => ({ exitCode: 0, stdout: '', stderr: '' }), notify: () => ({ isSent: true }) })
  expect(await notify($, 'off', 't', 'm')).toBe('off')
  expect(calls.run).toBe(0)
  expect(calls.notify).toBe(0)
  expect(calls.toasts).toEqual([])
})
