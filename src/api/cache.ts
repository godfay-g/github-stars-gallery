import type { CachePayload, StarredRepo } from '../types'

const PREFIX = 'gsg:cache:'
const TTL_MS = 15 * 60 * 1000

function key(username: string): string {
  return `${PREFIX}${username.toLowerCase()}`
}

export function readCache(username: string): StarredRepo[] | null {
  try {
    const raw = localStorage.getItem(key(username))
    if (!raw) return null
    const data = JSON.parse(raw) as CachePayload
    if (!data?.repos || !data.fetchedAt) return null
    if (Date.now() - data.fetchedAt > TTL_MS) return null
    return data.repos
  } catch {
    return null
  }
}

export function writeCache(username: string, repos: StarredRepo[]): void {
  const payload: CachePayload = {
    fetchedAt: Date.now(),
    username,
    repos,
  }
  try {
    localStorage.setItem(key(username), JSON.stringify(payload))
  } catch {
    // quota exceeded — ignore
  }
}

export function clearCache(username: string): void {
  localStorage.removeItem(key(username))
}
