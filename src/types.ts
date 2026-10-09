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
export type ViewMode = 'map' | 'card' | 'list'

export type Filters = {
  query: string
  languages: string[]
  topics: string[]
  categories: string[]
  excludeForks: boolean
}

export type LocalTagMap = Record<string, string[]>

export type CachePayload = {
  fetchedAt: number
  username: string
  repos: StarredRepo[]
}
