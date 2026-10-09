export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function avatarUrl(login: string, size = 96): string {
  return `https://github.com/${encodeURIComponent(login || 'ghost')}.png?size=${size}`
}
