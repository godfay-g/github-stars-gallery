import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, readCache } from './cache'
import { fetchAllStarred, GithubApiError, mapStarredPayload } from './github'

type MockRes = {
  status: number
  ok: boolean
  headers: Headers
  json: () => Promise<unknown>
}

function starItem(id: number, name: string, starredAt = '2024-01-01T00:00:00Z') {
  return {
    starred_at: starredAt,
    repo: {
      id,
      full_name: name,
      html_url: `https://github.com/${name}`,
      description: `desc ${id}`,
      language: 'TypeScript',
      stargazers_count: 10,
      forks_count: 1,
      topics: ['a'],
      updated_at: '2024-06-01T00:00:00Z',
      owner: { login: name.split('/')[0] },
      archived: false,
      fork: false,
    },
  }
}

function jsonRes(
  body: unknown,
  init: {
    status?: number
    link?: string | null
    remaining?: string | null
    limit?: string | null
    reset?: string | null
    retryAfter?: string | null
  } = {},
): MockRes {
  const status = init.status ?? 200
  const headers = new Headers()
  if (init.link) headers.set('link', init.link)
  if (init.remaining != null) headers.set('x-ratelimit-remaining', init.remaining)
  if (init.limit != null) headers.set('x-ratelimit-limit', init.limit)
  if (init.reset != null) headers.set('x-ratelimit-reset', init.reset)
  if (init.retryAfter != null) headers.set('retry-after', init.retryAfter)
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    json: async () => body,
  }
}

function installLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', ls)
  return store
}

describe('mapStarredPayload', () => {
  it('hard-fails when starred_at is missing (wrong Accept)', () => {
    expect(() =>
      mapStarredPayload({
        id: 1,
        full_name: 'a/b',
        html_url: 'https://github.com/a/b',
      }),
    ).toThrow(/starred_at/)
  })
})

describe('fetchAllStarred', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    installLocalStorage()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('merges multi-page results via Link rel=next', async () => {
    const page1Url = 'https://api.github.com/users/alice/starred?per_page=100'
    const page2Url = 'https://api.github.com/user/starred?page=2'

    fetchMock
      .mockResolvedValueOnce(
        jsonRes([starItem(1, 'a/one')], {
          link: `<${page2Url}>; rel="next"`,
          remaining: '50',
          limit: '60',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes([starItem(2, 'a/two')], {
          remaining: '49',
          limit: '60',
        }),
      )

    const repos = await fetchAllStarred({ username: 'alice', force: true })
    expect(repos.map((r) => r.full_name)).toEqual(['a/one', 'a/two'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(page1Url)
    expect(String(fetchMock.mock.calls[1][0])).toBe(page2Url)
    expect(readCache('alice')?.map((r) => r.id)).toEqual([1, 2])
  })

  it('retries same page on 429 + Retry-After (max 3 retries)', async () => {
    vi.useFakeTimers()
    const url = 'https://api.github.com/users/bob/starred?per_page=100'

    fetchMock
      .mockResolvedValueOnce(
        jsonRes({ message: 'rate limit' }, { status: 429, retryAfter: '1' }),
      )
      .mockResolvedValueOnce(
        jsonRes([starItem(3, 'b/three')], { remaining: '10', limit: '60' }),
      )

    const pending = fetchAllStarred({ username: 'bob', force: true })
    await vi.advanceTimersByTimeAsync(1500)
    const repos = await pending

    expect(repos).toHaveLength(1)
    expect(repos[0].full_name).toBe('b/three')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toBe(url)
    expect(String(fetchMock.mock.calls[1][0])).toBe(url)

    vi.useRealTimers()
  })

  it('throws RATE_LIMIT after 3 retries on persistent 429', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(
      jsonRes({ message: 'rate limit' }, { status: 429, retryAfter: '1' }),
    )

    const pending = fetchAllStarred({ username: 'carol', force: true }).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    )

    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(2000)
    }
    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.e).toBeInstanceOf(GithubApiError)
      expect((result.e as GithubApiError).code).toBe('RATE_LIMIT')
    }
    expect(fetchMock.mock.calls.length).toBe(4)

    vi.useRealTimers()
  })

  it('hard-fails when page items lack starred_at', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes(
        [
          {
            id: 9,
            full_name: 'x/y',
            html_url: 'https://github.com/x/y',
          },
        ],
        { remaining: '10' },
      ),
    )

    await expect(fetchAllStarred({ username: 'dave', force: true })).rejects.toThrow(
      /starred_at/,
    )
    expect(readCache('dave')).toBeNull()
  })

  it('does not write cache when aborted mid-fetch', async () => {
    const page2Url = 'https://api.github.com/user/starred?page=2'
    const ac = new AbortController()

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('page=2')) {
        ac.abort()
        throw new DOMException('Aborted', 'AbortError')
      }
      return jsonRes([starItem(1, 'e/one')], {
        link: `<${page2Url}>; rel="next"`,
        remaining: '10',
      })
    })

    await expect(
      fetchAllStarred({ username: 'erin', force: true, signal: ac.signal }),
    ).rejects.toThrow()

    expect(readCache('erin')).toBeNull()
  })

  it('waits until x-ratelimit-reset when remaining is 0 after a successful page', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)
    const resetUnix = Math.floor(now / 1000) + 2
    const page2Url = 'https://api.github.com/user/starred?page=2'

    fetchMock
      .mockResolvedValueOnce(
        jsonRes([starItem(1, 'f/one')], {
          link: `<${page2Url}>; rel="next"`,
          remaining: '0',
          reset: String(resetUnix),
          limit: '60',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes([starItem(2, 'f/two')], {
          remaining: '60',
          limit: '60',
        }),
      )

    const pending = fetchAllStarred({ username: 'frank', force: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2500)
    const repos = await pending
    expect(repos.map((r) => r.full_name)).toEqual(['f/one', 'f/two'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('clearCache helper works for isolation', () => {
    clearCache('nobody')
    expect(readCache('nobody')).toBeNull()
  })
})
