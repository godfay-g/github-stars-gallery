import type { LocalTagMap } from '../types'

const KEY = 'gsg:tags'

export function loadTags(): LocalTagMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as LocalTagMap
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function saveTags(map: LocalTagMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getRepoTags(map: LocalTagMap, fullName: string): string[] {
  return map[fullName] ?? []
}

export function setRepoTags(map: LocalTagMap, fullName: string, tags: string[]): LocalTagMap {
  const next = { ...map }
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  if (cleaned.length === 0) delete next[fullName]
  else next[fullName] = cleaned
  saveTags(next)
  return next
}
