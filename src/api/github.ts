import type { StarredRepo } from '../types'
import { readCache, writeCache } from './cache'

const API = 'https://api.github.com'
const ACCEPT = 'application/vnd.github.star+json'
const API_VERSION = '2022-11-28'
const UA = 'github-stars-gallery'

export class GithubApiError extends Error {
  constructor(
    message: string,
    public code: 'BAD_TOKEN' | 'NOT_FOUND' | 'RATE_LIMIT' | 'HTTP' | 'ABORT',
    public status?: number,
  ) {
    super(message)
    this.name = 'GithubApiError'
  }
}

type RawRepo = {
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  topics?: string[]
  updated_at?: string
  owner?: { login?: string }
  archived?: boolean
  fork?: boolean
}

type RawStar = {
  starred_at?: string
  repo?: RawRepo
  // flat fallback (some clients / mocks)
  id?: number
  full_name?: string
  html_url?: string
  description?: string | null
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  topics?: string[]
  updated_at?: string
  owner?: { login?: string }
  archived?: boolean
  fork?: boolean
}

export function mapStarredPayload(raw: unknown): StarredRepo {
  const wrap = raw as RawStar
  const r: RawRepo = wrap.repo ?? wrap
  const starred_at = wrap.starred_at
  if (!r?.id || !r.full_name || !starred_at) {
    throw new Error('Invalid starred payload: missing id/full_name/starred_at (check Accept header)')
  }
  return {
    id: r.id,
    full_name: r.full_name,
    html_url: r.html_url ?? `https://github.com/${r.full_name}`,
    description: r.description ?? null,
    language: r.language ?? null,
    stargazers_count: r.stargazers_count ?? 0,
    forks_count: r.forks_count ?? 0,
    topics: Array.isArray(r.topics) ? r.topics : [],
    updated_at: r.updated_at ?? new Date(0).toISOString(),
    starred_at,
    owner_login: r.owner?.login ?? r.full_name.split('/')[0] ?? '',
    archived: Boolean(r.archived),
    fork: Boolean(r.fork),
  }
}

function parseLinkNext(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GithubApiError('Aborted', 'ABORT'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new GithubApiError('Aborted', 'ABORT'))
      },
      { once: true },
    )
  })
}

/** Wait until rate-limit reset (unix seconds) + small jitter. */
async function waitUntilReset(
  resetUnix: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  const waitMs = Math.max(0, resetUnix * 1000 - Date.now()) + Math.random() * 500
  if (waitMs > 0) await sleep(waitMs, signal)
}

async function fetchPage(
  url: string,
  token: string | undefined,
  signal: AbortSignal | undefined,
  attempt = 0,
): Promise<{
  repos: StarredRepo[]
  next: string | null
  remaining: number | null
  limit: number | null
  reset: number | null
}> {
  if (signal?.aborted) throw new GithubApiError('Aborted', 'ABORT')

  const headers: Record<string, string> = {
    Accept: ACCEPT,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': UA,
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(url, { headers, signal })
  const remaining = res.headers.get('x-ratelimit-remaining')
  const limit = res.headers.get('x-ratelimit-limit')
  const reset = res.headers.get('x-ratelimit-reset')

  if (res.status === 401) {
    throw new GithubApiError('Invalid token (401). Clear or replace your PAT.', 'BAD_TOKEN', 401)
  }
  if (res.status === 404) {
    throw new GithubApiError('User not found.', 'NOT_FOUND', 404)
  }

  if (res.status === 403 || res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    let waitMs = 1000 * Math.pow(2, attempt)
    if (retryAfter) waitMs = Number(retryAfter) * 1000
    else if (remaining === '0' && reset) {
      waitMs = Math.max(0, Number(reset) * 1000 - Date.now()) + Math.random() * 500
    }
    if (attempt >= 3) {
      throw new GithubApiError(
        `Rate limited. ${token ? 'Wait and retry.' : 'Add a PAT (public_repo / read-only) for ~5000 req/h (anonymous ≈60/h).'}`,
        'RATE_LIMIT',
        res.status,
      )
    }
    await sleep(waitMs + Math.random() * 500, signal)
    return fetchPage(url, token, signal, attempt + 1)
  }

  if (!res.ok) {
    throw new GithubApiError(`GitHub API error ${res.status}`, 'HTTP', res.status)
  }

  const data = (await res.json()) as unknown[]
  const repos = data.map(mapStarredPayload)
  const next = parseLinkNext(res.headers.get('link'))
  return {
    repos,
    next,
    remaining: remaining != null ? Number(remaining) : null,
    limit: limit != null ? Number(limit) : null,
    reset: reset != null ? Number(reset) : null,
  }
}

export type FetchOpts = {
  username: string
  token?: string
  signal?: AbortSignal
  force?: boolean
  onPage?: (page: number, accumulated: number, remaining: number | null, limit: number | null) => void
}

export async function fetchAllStarred(opts: FetchOpts): Promise<StarredRepo[]> {
  const username = opts.username.trim().replace(/^@/, '')
  if (!username) throw new GithubApiError('Username required', 'HTTP')

  if (!opts.force) {
    const cached = readCache(username)
    if (cached) {
      opts.onPage?.(0, cached.length, null, null)
      return cached
    }
  }

  let url: string | null =
    `${API}/users/${encodeURIComponent(username)}/starred?per_page=100`
  const all: StarredRepo[] = []
  let page = 0

  while (url) {
    page += 1
    const { repos, next, remaining, limit, reset } = await fetchPage(url, opts.token, opts.signal)
    all.push(...repos)
    opts.onPage?.(page, all.length, remaining, limit)

    // P1.3: after a successful page, if remaining is 0, wait until reset
    // before fetching the next page (do not wait only after hitting 403).
    if (next && remaining === 0 && reset != null) {
      await waitUntilReset(reset, opts.signal)
    }

    url = next
  }

  writeCache(username, all)
  return all
}

export const TOKEN_KEY = 'gsg:pat'

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}
