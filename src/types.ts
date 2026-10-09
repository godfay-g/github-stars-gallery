/** Accept: application/vnd.github.star+json */
export type StarredRepo = {
  id: number
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  updated_at: string
  starred_at: string
  owner_login: string
  archived: boolean
  fork: boolean
}

export type SortKey = 'starred_at' | 'stars' | 'updated' | 'name'
export type ViewMode = 'card' | 'list'

export type Filters = {
  query: string
  /** empty = all */
  languages: string[]
  /** empty = all */
  topics: string[]
  excludeForks: boolean
}

export type LocalTagMap = Record<string, string[]> // full_name -> tags

export type CachePayload = {
  fetchedAt: number
  username: string
  repos: StarredRepo[]
}
