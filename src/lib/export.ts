import type { StarredRepo } from '../types'
import type { CategoryRule, Locale } from '../config/schema'
import { buildStandaloneHtml } from './standalone'

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportJson(username: string, repos: StarredRepo[]): void {
  const payload = { generated_at: new Date().toISOString(), username, count: repos.length, repos }
  downloadBlob(`${username}-stars.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
}

export function exportHtml(
  username: string,
  repos: StarredRepo[],
  opts: { rules: CategoryRule[]; overrides: Record<string, string>; locale: Locale; title: string },
): void {
  const html = buildStandaloneHtml({ username, repos, ...opts, title: `@${username} · ${opts.title}` })
  downloadBlob(`${username}-stars.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))
}
