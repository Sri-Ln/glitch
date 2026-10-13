import type { EngineInterface } from 'claude-code'

import type { NotifyMode } from './config'

export const projectName = (cwd: string): string => cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'session'

// PowerShell's own app id: Windows shows its toasts with no app to register.
const POWERSHELL_APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const quoted = (s: string): string => `'${s.replace(/['‘’‚‛]/g, m => m + m)}'`

export function toastArgv(title: string, message: string): string[] {
  const toast = `<toast><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(message)}</text></binding></visual></toast>`
  const script = [
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$x.LoadXml(${quoted(toast)})`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${quoted(POWERSHELL_APP_ID)}).Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
  ].join('; ')
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]
}

// Native Windows toast, else Claude Code's own notification, else a toast in the
// session. Says which one carried it.
export async function notify($: EngineInterface, mode: NotifyMode, title: string, message: string): Promise<'windows' | 'claude' | 'toast' | 'off'> {
  if (mode === 'off') return 'off'
  if (mode === 'windows') {
    if ((await $.env.get('OS').catch(() => null)) === 'Windows_NT') {
      const ran = await $.process.run(toastArgv(title, message), { timeoutMs: 15_000 }).catch(() => null)
      if (ran?.exitCode === 0) return 'windows'
    }
    const sent = await $.ui.notify(message, { title }).catch(() => null)
    if (sent?.isSent) return 'claude'
  }
  $.ui.toast(`${title}: ${message}`, { timeoutMs: 30_000 })
  return 'toast'
}
