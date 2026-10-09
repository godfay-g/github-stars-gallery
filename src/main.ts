import './styles/main.css'
import type { Filters, LocalTagMap, SortKey, StarredRepo, ViewMode } from './types'
import { fetchAllStarred, GithubApiError, loadToken, saveToken } from './api/github'
import { clearCache } from './api/cache'
import { loadTags, setRepoTags } from './state/tags'
import { allLanguages, allTopics, applyFilters, languageStats, sortRepos } from './lib/filter'
import { exportHtml, exportJson } from './lib/export'

const LANG_COLORS = 8

type State = {
  username: string
  repos: StarredRepo[]
  filters: Filters
  sort: SortKey
  view: ViewMode
  tags: LocalTagMap
  loading: boolean
  progress: string
  remaining: number | null
  limit: number | null
  error: string | null
  token: string
}

const state: State = {
  username: '',
  repos: [],
  filters: { query: '', language: null, topic: null, excludeForks: false },
  sort: 'starred_at',
  view: 'card',
  tags: loadTags(),
  loading: false,
  progress: '',
  remaining: null,
  limit: null,
  error: null,
  token: loadToken(),
}

let abort: AbortController | null = null
const root = document.querySelector<HTMLDivElement>('#app')!

function qsUser(): string {
  const u = new URLSearchParams(location.search).get('user')
  return u?.trim() ?? ''
}

function setUrlUser(username: string): void {
  const url = new URL(location.href)
  if (username) url.searchParams.set('user', username)
  else url.searchParams.delete('user')
  history.replaceState(null, '', url)
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function visibleRepos(): StarredRepo[] {
  return sortRepos(applyFilters(state.repos, state.filters, state.tags), state.sort)
}

function renderHeader(): string {
  return `
  <header class="app-header">
    <div class="brand"><span class="star">★</span> GitHub Stars Gallery</div>
    <form class="user-form" id="user-form">
      <input type="text" id="username" name="username" placeholder="GitHub username" value="${escapeHtml(state.username)}" autocomplete="username" required />
      <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Loading…' : 'Load'}</button>
      <button class="btn" type="button" id="btn-refresh" title="Force refresh" ${state.loading || !state.username ? 'disabled' : ''}>↻</button>
    </form>
    <button class="btn btn-ghost" type="button" id="btn-token" title="Optional PAT">${state.token ? '🔑 PAT ✓' : '🔑 PAT'}</button>
  </header>`
}

function renderToolbar(filtered: StarredRepo[]): string {
  const langs = allLanguages(state.repos)
  const topics = allTopics(state.repos)
  return `
  <div class="toolbar">
    <input type="search" id="search" placeholder="Search name, description, owner, topics, local tags…" value="${escapeHtml(state.filters.query)}" ${state.repos.length ? '' : 'disabled'} />
    <select id="language" ${state.repos.length ? '' : 'disabled'}>
      <option value="">All languages</option>
      ${langs.map((l) => `<option value="${escapeHtml(l)}" ${state.filters.language === l ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
    </select>
    <select id="topic" ${state.repos.length ? '' : 'disabled'}>
      <option value="">All topics</option>
      ${topics.map((t) => `<option value="${escapeHtml(t)}" ${state.filters.topic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
    </select>
    <select id="sort" ${state.repos.length ? '' : 'disabled'}>
      <option value="starred_at" ${state.sort === 'starred_at' ? 'selected' : ''}>Recently starred</option>
      <option value="stars" ${state.sort === 'stars' ? 'selected' : ''}>Most stars</option>
      <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Recently updated</option>
      <option value="name" ${state.sort === 'name' ? 'selected' : ''}>Name A–Z</option>
    </select>
    <label class="meta-row"><input type="checkbox" id="exclude-forks" ${state.filters.excludeForks ? 'checked' : ''} ${state.repos.length ? '' : 'disabled'}/> Exclude forks</label>
    <div class="btn-group" style="display:flex;gap:.35rem">
      <button type="button" class="btn ${state.view === 'card' ? 'active' : ''}" id="view-card" ${state.repos.length ? '' : 'disabled'}>Cards</button>
      <button type="button" class="btn ${state.view === 'list' ? 'active' : ''}" id="view-list" ${state.repos.length ? '' : 'disabled'}>List</button>
    </div>
    <div class="spacer"></div>
    <button type="button" class="btn" id="export-json" ${filtered.length ? '' : 'disabled'}>Export JSON</button>
    <button type="button" class="btn" id="export-html" ${filtered.length ? '' : 'disabled'}>Export HTML</button>
  </div>`
}

function renderStatus(): string {
  const parts: string[] = []
  if (state.loading) {
    parts.push(`<div class="progress"><i></i></div><span>${escapeHtml(state.progress || 'Fetching…')}</span>`)
  } else if (state.repos.length) {
    const v = visibleRepos().length
    parts.push(`<span class="ok">${fmtNum(v)} shown · ${fmtNum(state.repos.length)} starred</span>`)
  }
  if (state.remaining != null && state.limit != null) {
    parts.push(`<span>API remaining: ${state.remaining}/${state.limit}</span>`)
  }
  if (state.error) parts.push(`<span class="error">${escapeHtml(state.error)}</span>`)
  return `<div class="status-bar">${parts.join('') || '<span>Enter a GitHub username to load starred repos.</span>'}</div>`
}

function renderStats(): string {
  if (!state.repos.length) return ''
  const stats = languageStats(applyFilters(state.repos, { ...state.filters, language: null }, state.tags))
  const total = stats.reduce((s, x) => s + x.count, 0) || 1
  const top = stats.slice(0, 8)
  const other = stats.slice(8).reduce((s, x) => s + x.count, 0)
  const segs = [...top]
  if (other) segs.push({ language: 'Other', count: other })
  return `
  <section class="stats">
    <div class="stats-bar">
      ${segs
        .map(
          (s, i) =>
            `<div class="stats-seg lang-palette-${i % LANG_COLORS}" style="width:${(s.count / total) * 100}%" title="${escapeHtml(s.language)}: ${s.count}"></div>`,
        )
        .join('')}
    </div>
    <div class="stats-legend">
      ${segs
        .map(
          (s, i) =>
            `<span><i class="dot lang-palette-${i % LANG_COLORS}"></i>${escapeHtml(s.language)} ${s.count}</span>`,
        )
        .join('')}
    </div>
  </section>`
}

function renderCard(r: StarredRepo): string {
  const local = state.tags[r.full_name] ?? []
  return `
  <article class="card" data-id="${r.id}">
    <h3><a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener">${escapeHtml(r.full_name)}</a>
      ${r.archived ? '<span class="badge">archived</span>' : ''}
      ${r.fork ? '<span class="badge">fork</span>' : ''}
    </h3>
    <p class="desc">${escapeHtml(r.description || 'No description')}</p>
    <div class="meta-row">
      <span class="chip lang">${escapeHtml(r.language || '—')}</span>
      <span>★ ${fmtNum(r.stargazers_count)}</span>
      <span>Starred ${fmtDate(r.starred_at)}</span>
      <span>Updated ${fmtDate(r.updated_at)}</span>
    </div>
    <div class="topics">${r.topics
      .slice(0, 8)
      .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
      .join('')}</div>
    <div class="local-tags">${local.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>
    <div class="tag-edit">
      <input type="text" data-tag-input="${escapeHtml(r.full_name)}" placeholder="Local tags (comma-separated)" value="${escapeHtml(local.join(', '))}" />
      <button type="button" class="btn" data-tag-save="${escapeHtml(r.full_name)}">Save</button>
    </div>
  </article>`
}

function renderListItem(r: StarredRepo): string {
  return `
  <div class="list-item">
    <div><a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener"><strong>${escapeHtml(r.full_name)}</strong></a></div>
    <p class="desc">${escapeHtml(r.description || '')}</p>
    <span class="chip lang">${escapeHtml(r.language || '—')}</span>
    <span class="meta-row">★ ${fmtNum(r.stargazers_count)} · ${fmtDate(r.starred_at)}</span>
  </div>`
}

function renderMain(): string {
  if (!state.repos.length && !state.loading) {
    return `<main class="main"><div class="empty"><h2>Turn starred repos into a searchable gallery</h2>
      <p>Load any public GitHub username. Optional PAT raises rate limits. Tags stay in your browser only.</p>
      <p>Try <a href="?user=godfay-g">?user=godfay-g</a> or your own username.</p></div></main>`
  }
  const list = visibleRepos()
  if (!list.length && state.repos.length) {
    return `<main class="main"><div class="empty"><h2>No matches</h2><p>Try clearing filters or search.</p></div></main>`
  }
  if (state.view === 'list') {
    return `<main class="main"><div class="list">${list.map(renderListItem).join('')}</div></main>`
  }
  return `<main class="main"><div class="grid">${list.map(renderCard).join('')}</div></main>`
}

function renderFooter(): string {
  return `<footer class="app-footer">
    <span>MIT · Client-side only · PAT never leaves your browser for third parties (only GitHub API)</span>
    <span><a href="https://github.com/godfay-g/github-stars-gallery" target="_blank" rel="noopener">Source</a></span>
  </footer>`
}

function renderTokenModal(): void {
  const existing = document.getElementById('token-modal')
  if (existing) existing.remove()
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop'
  backdrop.id = 'token-modal'
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h2>Optional GitHub PAT</h2>
      <p>Stored in <code>localStorage</code> only. Use a fine-grained token with <strong>read-only</strong> public repo access, or classic <code>public_repo</code>. Never commit tokens.</p>
      <p>Anonymous ≈ 60 req/h · Authenticated ≈ 5,000 req/h.</p>
      <input type="password" id="pat-input" placeholder="ghp_… or github_pat_…" value="${escapeHtml(state.token)}" autocomplete="off" />
      <div class="modal-actions">
        <button type="button" class="btn" id="pat-clear">Clear</button>
        <button type="button" class="btn btn-ghost" id="pat-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="pat-save">Save</button>
      </div>
    </div>`
  document.body.appendChild(backdrop)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove()
  })
  backdrop.querySelector('#pat-cancel')!.addEventListener('click', () => backdrop.remove())
  backdrop.querySelector('#pat-clear')!.addEventListener('click', () => {
    state.token = ''
    saveToken('')
    backdrop.remove()
    render()
  })
  backdrop.querySelector('#pat-save')!.addEventListener('click', () => {
    const v = (backdrop.querySelector('#pat-input') as HTMLInputElement).value.trim()
    state.token = v
    saveToken(v)
    backdrop.remove()
    render()
  })
}

function bind(): void {
  document.getElementById('user-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const u = (document.getElementById('username') as HTMLInputElement).value.trim().replace(/^@/, '')
    void loadUser(u, false)
  })
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    if (state.username) void loadUser(state.username, true)
  })
  document.getElementById('btn-token')?.addEventListener('click', renderTokenModal)
  document.getElementById('search')?.addEventListener('input', (e) => {
    state.filters.query = (e.target as HTMLInputElement).value
    render()
    ;(document.getElementById('search') as HTMLInputElement)?.focus()
    const el = document.getElementById('search') as HTMLInputElement
    if (el) {
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  })
  document.getElementById('language')?.addEventListener('change', (e) => {
    state.filters.language = (e.target as HTMLSelectElement).value || null
    render()
  })
  document.getElementById('topic')?.addEventListener('change', (e) => {
    state.filters.topic = (e.target as HTMLSelectElement).value || null
    render()
  })
  document.getElementById('sort')?.addEventListener('change', (e) => {
    state.sort = (e.target as HTMLSelectElement).value as SortKey
    render()
  })
  document.getElementById('exclude-forks')?.addEventListener('change', (e) => {
    state.filters.excludeForks = (e.target as HTMLInputElement).checked
    render()
  })
  document.getElementById('view-card')?.addEventListener('click', () => {
    state.view = 'card'
    render()
  })
  document.getElementById('view-list')?.addEventListener('click', () => {
    state.view = 'list'
    render()
  })
  document.getElementById('export-json')?.addEventListener('click', () => {
    exportJson(state.username, visibleRepos())
  })
  document.getElementById('export-html')?.addEventListener('click', () => {
    exportHtml(state.username, visibleRepos())
  })
  root.querySelectorAll<HTMLButtonElement>('[data-tag-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-tag-save')!
      const input = root.querySelector<HTMLInputElement>(`[data-tag-input="${CSS.escape(name)}"]`)
      if (!input) return
      const tags = input.value.split(',').map((t) => t.trim()).filter(Boolean)
      state.tags = setRepoTags(state.tags, name, tags)
      render()
    })
  })
}

function render(): void {
  const filtered = visibleRepos()
  root.innerHTML =
    renderHeader() +
    renderToolbar(filtered) +
    renderStatus() +
    renderStats() +
    renderMain() +
    renderFooter()
  bind()
}

async function loadUser(username: string, force: boolean): Promise<void> {
  if (!username) return
  abort?.abort()
  abort = new AbortController()
  state.username = username
  state.loading = true
  state.error = null
  state.progress = force ? 'Refreshing…' : 'Loading…'
  setUrlUser(username)
  if (force) clearCache(username)
  render()
  try {
    const repos = await fetchAllStarred({
      username,
      token: state.token || undefined,
      signal: abort.signal,
      force,
      onPage: (page, acc, remaining, limit) => {
        state.progress = page === 0 ? `Cache hit · ${acc} repos` : `Page ${page} · ${acc} repos`
        state.remaining = remaining
        state.limit = limit
        render()
      },
    })
    state.repos = repos
    state.progress = ''
  } catch (err) {
    if (err instanceof GithubApiError && err.code === 'ABORT') return
    if (err instanceof GithubApiError && err.code === 'BAD_TOKEN') {
      state.token = ''
      saveToken('')
    }
    state.error = err instanceof Error ? err.message : String(err)
    state.repos = []
  } finally {
    state.loading = false
    render()
  }
}

render()
const initial = qsUser()
if (initial) void loadUser(initial, false)
