import type { Filters, LocalTagMap, SortKey, StarredRepo } from '../types'
import { getRepoTags } from '../state/tags'

export function applyFilters(
  repos: StarredRepo[],
  filters: Filters,
  tags: LocalTagMap,
): StarredRepo[] {
  const q = filters.query.trim().toLowerCase()
  const langSet = filters.languages.length ? new Set(filters.languages) : null
  const topicSet = filters.topics.length ? new Set(filters.topics) : null
  return repos.filter((r) => {
    if (filters.excludeForks && r.fork) return false
    if (langSet && (!r.language || !langSet.has(r.language))) return false
    if (topicSet && !r.topics.some((t) => topicSet.has(t))) return false
    if (!q) return true
    const local = getRepoTags(tags, r.full_name).join(' ')
    const hay = [
      r.full_name,
      r.description ?? '',
      r.owner_login,
      r.topics.join(' '),
      r.language ?? '',
      local,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function sortRepos(repos: StarredRepo[], key: SortKey): StarredRepo[] {
  const arr = [...repos]
  switch (key) {
    case 'starred_at':
      return arr.sort((a, b) => b.starred_at.localeCompare(a.starred_at))
    case 'stars':
      return arr.sort((a, b) => b.stargazers_count - a.stargazers_count)
    case 'updated':
      return arr.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    case 'name':
      return arr.sort((a, b) => a.full_name.localeCompare(b.full_name))
    default:
      return arr
  }
}

export function languageStats(repos: StarredRepo[]): { language: string; count: number }[] {
  const map = new Map<string, number>()
  for (const r of repos) {
    const lang = r.language || 'Unknown'
    map.set(lang, (map.get(lang) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)
}

export function allTopics(repos: StarredRepo[]): string[] {
  const set = new Set<string>()
  for (const r of repos) for (const t of r.topics) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function allLanguages(repos: StarredRepo[]): string[] {
  const set = new Set<string>()
  for (const r of repos) if (r.language) set.add(r.language)
  return [...set].sort((a, b) => a.localeCompare(b))
}
