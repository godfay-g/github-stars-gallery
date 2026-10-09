import './styles/main.css'
import type { Filters, LocalTagMap, SortKey, StarredRepo, ViewMode } from './types'
import { fetchAllStarred, GithubApiError, loadToken, saveToken } from './api/github'
import { clearCache } from './api/cache'
import { loadTags, setRepoTags } from './state/tags'
import { allLanguages, applyFilters, languageStats, sortRepos } from './lib/filter'
import { exportHtml, exportJson } from './lib/export'
import {
  buildCategoryBuckets,
  categorizeRepo,
  categoryColor,
  humanBlurb,
  type CategoryId,
} from './lib/categories'
import { formatRelative, formatStars, languageColor, type Locale } from './lib/format'
import { loadLocale, saveLocale, t, type Dict } from './i18n'

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
  locale: Locale
  editingTag: string | null
  mapZoom: number
  mapPanX: number
  mapPanY: number
  mapFocus: CategoryId | null
  advancedOpen: boolean
}

const state: State = {
  username: '',
  repos: [],
  filters: { query: '', languages: [], topics: [], categories: [], excludeForks: false },
  sort: 'starred_at',
  view: 'map',
  tags: loadTags(),
  loading: false,
  progress: '',
  remaining: null,
  limit: null,
  error: null,
  token: loadToken(),
  locale: loadLocale(),
  editingTag: null,
  mapZoom: 1,
  mapPanX: 0,
  mapPanY: 0,
  mapFocus: null,
  advancedOpen: false,
}

let abort: AbortController | null = null
let shellBound = false
let mapGesturesBound = false
const root = document.querySelector<HTMLDivElement>('#app')!

function d(): Dict {
  return t(state.locale)
}

function qsUser(): string {
  return new URLSearchParams(location.search).get('user')?.trim() ?? ''
}

function setUrlUser(username: string): void {
  const url = new URL(location.href)
  if (username) url.searchParams.set('user', username)
  else url.searchParams.delete('user')
  history.replaceState(null, '', url)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login || 'ghost')}.png?size=96`
}

function visibleRepos(): StarredRepo[] {
  return sortRepos(applyFilters(state.repos, state.filters, state.tags), state.sort)
}

function topicCounts(repos: StarredRepo[]): { topic: string; count: number }[] {
  const map = new Map<string, number>()
  for (const r of repos) for (const topic of r.topics) map.set(topic, (map.get(topic) ?? 0) + 1)
  return [...map.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

function hasActiveFilters(): boolean {
  const f = state.filters
  return Boolean(f.query.trim() || f.languages.length || f.topics.length || f.categories.length || f.excludeForks)
}

function clearFilters(): void {
  state.filters = { query: '', languages: [], topics: [], categories: [], excludeForks: false }
  state.mapFocus = null
  const search = document.getElementById('search') as HTMLInputElement | null
  if (search) search.value = ''
}

function renderHeader(): string {
  const dict = d()
  return `
  <header class="app-header">
    <div class="brand">
      <span class="star" aria-hidden="true">★</span>
      <div>
        <div class="brand-title">${escapeHtml(dict.brand)}</div>
        <div class="brand-sub">${escapeHtml(dict.tagline)}</div>
      </div>
    </div>
    <form class="user-form" id="user-form">
      <input type="text" id="username" name="username" placeholder="${escapeHtml(dict.usernamePlaceholder)}" value="${escapeHtml(state.username)}" autocomplete="username" required />
      <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? escapeHtml(dict.loading) : escapeHtml(dict.load)}</button>
      <button class="btn" type="button" id="btn-refresh" title="${escapeHtml(dict.refresh)}" ${state.loading || !state.username ? 'disabled' : ''}>↻</button>
    </form>
    <div class="locale-switch" role="group" aria-label="Language">
      <button type="button" class="btn btn-ghost ${state.locale === 'zh' ? 'active' : ''}" data-locale="zh">${escapeHtml(dict.localeZh)}</button>
      <button type="button" class="btn btn-ghost ${state.locale === 'en' ? 'active' : ''}" data-locale="en">${escapeHtml(dict.localeEn)}</button>
    </div>
  </header>`
}

function renderChipRow(
  kind: 'languages' | 'topics' | 'categories',
  items: { label: string; value: string; color?: string }[],
  allLabel: string,
): string {
  const selected = new Set(state.filters[kind])
  const disabled = !state.repos.length
  return `
  <div class="chip-row fade-in" data-chip-kind="${kind}">
    <button type="button" class="chip-filter ${selected.size === 0 ? 'active' : ''}" data-chip-all="${kind}" ${disabled ? 'disabled' : ''}>${escapeHtml(allLabel)}</button>
    ${items
      .map(
        (it) => `
      <button type="button" class="chip-filter ${selected.has(it.value) ? 'active' : ''}" data-chip-kind="${kind}" data-chip-value="${escapeHtml(it.value)}" ${disabled ? 'disabled' : ''}>
        ${it.color ? `<i class="lang-dot" style="background:${it.color}"></i>` : ''}
        ${escapeHtml(it.label)}
      </button>`,
      )
      .join('')}
  </div>`
}

function renderToolbar(): string {
  const dict = d()
  const has = state.repos.length > 0
  const buckets = buildCategoryBuckets(state.repos, state.locale)
  const langs = allLanguages(state.repos)
    .slice(0, 12)
    .map((l) => ({ label: l, value: l, color: languageColor(l) }))
  const topics = topicCounts(state.repos)
    .slice(0, 12)
    .map((x) => ({ label: `${x.topic}`, value: x.topic }))
  const cats = buckets.map((b) => ({
    label: `${b.label} ${b.repos.length}`,
    value: b.id,
    color: b.color,
  }))

  return `
  <div class="toolbar gallery-toolbar" id="toolbar">
    <div class="toolbar-top">
      <input type="search" id="search" class="search-hero" placeholder="${escapeHtml(dict.searchPlaceholder)}" value="${escapeHtml(state.filters.query)}" ${has ? '' : 'disabled'} />
      <select id="sort" ${has ? '' : 'disabled'}>
        <option value="starred_at" ${state.sort === 'starred_at' ? 'selected' : ''}>${escapeHtml(dict.sortStarred)}</option>
        <option value="stars" ${state.sort === 'stars' ? 'selected' : ''}>${escapeHtml(dict.sortStars)}</option>
        <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>${escapeHtml(dict.sortUpdated)}</option>
        <option value="name" ${state.sort === 'name' ? 'selected' : ''}>${escapeHtml(dict.sortName)}</option>
      </select>
      <div class="view-toggle btn-group">
        <button type="button" class="btn ${state.view === 'map' ? 'active' : ''}" id="view-map" ${has ? '' : 'disabled'}>${escapeHtml(dict.map)}</button>
        <button type="button" class="btn ${state.view === 'card' ? 'active' : ''}" id="view-card" ${has ? '' : 'disabled'}>${escapeHtml(dict.cards)}</button>
        <button type="button" class="btn ${state.view === 'list' ? 'active' : ''}" id="view-list" ${has ? '' : 'disabled'}>${escapeHtml(dict.list)}</button>
      </div>
      ${hasActiveFilters() ? `<button type="button" class="btn" id="btn-clear-filters">${escapeHtml(dict.clearFilters)}</button>` : ''}
    </div>
    ${has ? `<div class="filter-block"><div class="filter-label">${escapeHtml(dict.categories)}</div>${renderChipRow('categories', cats, dict.allCategories)}</div>` : ''}
    ${has ? `<div class="filter-block"><div class="filter-label">${escapeHtml(dict.allLanguages)}</div>${renderChipRow('languages', langs, dict.allLanguages)}</div>` : ''}
    ${has ? `<div class="filter-block"><div class="filter-label">${escapeHtml(dict.allTopics)}</div>${renderChipRow('topics', topics, dict.allTopics)}</div>` : ''}
  </div>`
}

function renderStatus(): string {
  const dict = d()
  const parts: string[] = []
  if (state.loading) {
    parts.push(`<div class="progress"><i></i></div><span>${escapeHtml(state.progress || dict.fetching)}</span>`)
  } else if (state.repos.length) {
    const v = visibleRepos().length
    parts.push(
      `<span class="ok">${escapeHtml(dict.shown)} <strong>${v.toLocaleString()}</strong> · ${escapeHtml(dict.starred)} ${state.repos.length.toLocaleString()}</span>`,
    )
  }
  if (state.error) parts.push(`<span class="error">${escapeHtml(state.error)}</span>`)
  return `<div class="status-bar" id="status-bar">${parts.join('') || `<span>${escapeHtml(dict.enterUser)}</span>`}</div>`
}

function renderOverview(): string {
  const dict = d()
  if (!state.repos.length) return '<div id="stats-root"></div>'
  const stats = languageStats(state.repos)
  const total = state.repos.length
  const top = stats.slice(0, 6)
  const topSum = top.reduce((s, x) => s + x.count, 0) || 1
  const recent = [...state.repos].sort((a, b) => b.starred_at.localeCompare(a.starred_at)).slice(0, 5)
  const buckets = buildCategoryBuckets(state.repos, state.locale)

  return `
  <section class="overview fade-in" id="stats-root">
    <div class="overview-head">
      <h2>${escapeHtml(dict.overview)}</h2>
      <div class="overview-total"><span class="num">${formatStars(total, state.locale)}</span><span class="lbl">${escapeHtml(dict.total)}</span></div>
    </div>
    <div class="overview-grid">
      <div class="overview-card">
        <h3>${escapeHtml(dict.categories)}</h3>
        <div class="cat-pills">
          ${buckets
            .map(
              (b) => `<button type="button" class="cat-pill ${state.filters.categories.includes(b.id) ? 'active' : ''}" data-chip-kind="categories" data-chip-value="${b.id}" style="--c:${b.color}">
                <span class="cat-count">${b.repos.length}</span>${escapeHtml(b.label)}
              </button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="overview-card">
        <h3>${escapeHtml(dict.topLanguages)}</h3>
        <div class="lang-bars">
          ${top
            .map((s) => {
              const pct = Math.round((s.count / topSum) * 100)
              return `<div class="lang-bar-row">
                <span class="lang-bar-label"><i class="lang-dot" style="background:${languageColor(s.language)}"></i>${escapeHtml(s.language)}</span>
                <div class="lang-bar-track"><div class="lang-bar-fill" style="width:${pct}%;background:${languageColor(s.language)}"></div></div>
                <span class="lang-bar-count">${s.count}</span>
              </div>`
            })
            .join('')}
        </div>
      </div>
      <div class="overview-card">
        <h3>${escapeHtml(dict.recentStars)}</h3>
        <ul class="timeline">
          ${recent
            .map(
              (r) => `<li>
              <img class="avatar sm" src="${avatarUrl(r.owner_login)}" alt="" loading="lazy" width="28" height="28"/>
              <div>
                <a href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener">${escapeHtml(r.full_name)}</a>
                <div class="muted">${escapeHtml(formatRelative(r.starred_at, state.locale))}</div>
              </div>
            </li>`,
            )
            .join('')}
        </ul>
      </div>
    </div>
  </section>`
}

function renderStarMap(): string {
  const dict = d()
  const source = applyFilters(
    state.repos,
    { ...state.filters, categories: state.mapFocus ? [state.mapFocus] : state.filters.categories },
    state.tags,
  )
  const buckets = buildCategoryBuckets(
    state.mapFocus ? state.repos.filter((r) => categorizeRepo(r) === state.mapFocus) : applyFilters(state.repos, { ...state.filters, categories: [] }, state.tags),
    state.locale,
  )
  const cx = 400
  const cy = 300
  const radius = 210
  const focus = state.mapFocus
  const focusBucket = focus ? buckets.find((b) => b.id === focus) : null

  let nodes = ''
  let links = ''

  if (focus && focusBucket) {
    const repos = sortRepos(focusBucket.repos, state.sort).slice(0, 18)
    const n = Math.max(repos.length, 1)
    repos.forEach((r, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const x = cx + Math.cos(angle) * (radius - 20)
      const y = cy + Math.sin(angle) * (radius - 20)
      links += `<line class="map-link" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${focusBucket.color}" />`
      nodes += `
        <g class="map-node repo-node" transform="translate(${x},${y})" data-open-url="${escapeHtml(r.html_url)}">
          <circle r="22" fill="#161b22" stroke="${focusBucket.color}" stroke-width="2"/>
          <image href="${avatarUrl(r.owner_login)}" x="-14" y="-14" width="28" height="28" clip-path="circle(14px at 14px 14px)"/>
          <title>${escapeHtml(r.full_name)} — ${escapeHtml(humanBlurb(r, state.locale))}</title>
          <text y="36" text-anchor="middle" class="map-label">${escapeHtml((r.full_name.split('/')[1] ?? r.full_name).slice(0, 14))}</text>
        </g>`
    })
    nodes += `
      <g class="map-node center-node" transform="translate(${cx},${cy})" data-map-back="1">
        <circle r="46" fill="${focusBucket.color}" opacity="0.2"/>
        <circle r="34" fill="#0d1117" stroke="${focusBucket.color}" stroke-width="3"/>
        <text y="-4" text-anchor="middle" class="map-center-title">${escapeHtml(focusBucket.label)}</text>
        <text y="14" text-anchor="middle" class="map-center-sub">${focusBucket.repos.length}</text>
      </g>`
  } else {
    const n = Math.max(buckets.length, 1)
    buckets.forEach((b, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const x = cx + Math.cos(angle) * radius
      const y = cy + Math.sin(angle) * radius
      const size = 28 + Math.min(22, b.repos.length)
      links += `<line class="map-link" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${b.color}" />`
      nodes += `
        <g class="map-node cat-node" transform="translate(${x},${y})" data-map-cat="${b.id}">
          <circle r="${size}" fill="${b.color}" opacity="0.22"/>
          <circle r="${size - 10}" fill="#121820" stroke="${b.color}" stroke-width="2.5"/>
          <text y="-2" text-anchor="middle" class="map-cat-count">${b.repos.length}</text>
          <text y="16" text-anchor="middle" class="map-label">${escapeHtml(b.label.split(' / ')[0])}</text>
          <title>${escapeHtml(b.label)} · ${b.repos.length}</title>
        </g>`
    })
    const label = state.username || 'You'
    nodes += `
      <g class="map-node center-node" transform="translate(${cx},${cy})">
        <circle r="52" fill="url(#centerGlow)"/>
        <circle r="38" fill="#0d1117" stroke="#f0c14b" stroke-width="3"/>
        <image href="${avatarUrl(state.username)}" x="-22" y="-22" width="44" height="44" clip-path="circle(22px at 22px 22px)"/>
        <text y="58" text-anchor="middle" class="map-center-title">@${escapeHtml(label)}</text>
      </g>`
  }

  return `
  <div class="star-map-wrap fade-in" id="star-map-root">
    <div class="star-map-toolbar">
      <p class="muted">${escapeHtml(dict.starMapHint)}</p>
      <div class="star-map-actions">
        ${focus ? `<button type="button" class="btn" id="btn-map-back">${escapeHtml(dict.backToMap)}</button>` : ''}
        <button type="button" class="btn" data-zoom="in" title="${escapeHtml(dict.zoomIn)}">＋</button>
        <button type="button" class="btn" data-zoom="out" title="${escapeHtml(dict.zoomOut)}">－</button>
        <button type="button" class="btn" data-zoom="reset" title="${escapeHtml(dict.zoomReset)}">⟲</button>
      </div>
    </div>
    <div class="star-map-viewport" id="star-map-viewport">
      <svg class="star-map" viewBox="0 0 800 600" role="img" aria-label="${escapeHtml(dict.map)}">
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#f0c14b" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#f0c14b" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <g class="star-map-stage" id="star-map-stage" style="transform:translate(${state.mapPanX}px,${state.mapPanY}px) scale(${state.mapZoom}); transform-origin:400px 300px;">
          ${links}
          ${nodes}
        </g>
      </svg>
    </div>
    <p class="muted map-foot">${escapeHtml(dict.shown)} ${source.length} / ${state.repos.length}</p>
  </div>`
}

function renderCard(r: StarredRepo): string {
  const dict = d()
  const local = state.tags[r.full_name] ?? []
  const editing = state.editingTag === r.full_name
  const blurb = humanBlurb(r, state.locale)
  const cat = categorizeRepo(r)
  const catColor = categoryColor(cat)
  const name = r.full_name.split('/')
  return `
  <article class="card gallery-card fade-in" data-id="${r.id}">
    <a class="card-hit" href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener">
      <div class="card-top">
        <img class="avatar" src="${avatarUrl(r.owner_login)}" alt="" loading="lazy" width="48" height="48"/>
        <div class="card-title-wrap">
          <div class="card-owner">${escapeHtml(name[0] ?? r.owner_login)}</div>
          <h3>${escapeHtml(name[1] ?? r.full_name)}
            ${r.archived ? `<span class="badge">${escapeHtml(dict.archived)}</span>` : ''}
            ${r.fork ? `<span class="badge">${escapeHtml(dict.fork)}</span>` : ''}
          </h3>
        </div>
        <span class="cat-badge" style="--c:${catColor}">${escapeHtml(buildCategoryBuckets([r], state.locale)[0]?.label ?? cat)}</span>
      </div>
      <p class="blurb">${escapeHtml(blurb)}</p>
      <div class="card-facts">
        <span class="fact lang"><i class="lang-dot" style="background:${languageColor(r.language)}"></i>${escapeHtml(r.language || '—')}</span>
        <span class="fact">★ ${formatStars(r.stargazers_count, state.locale)}</span>
        <span class="fact">⑂ ${formatStars(r.forks_count, state.locale)} ${escapeHtml(dict.forks)}</span>
        <span class="fact muted">${escapeHtml(formatRelative(r.starred_at, state.locale))}</span>
      </div>
      <div class="topics">${r.topics
        .slice(0, 6)
        .map((topic) => `<span class="chip">${escapeHtml(topic)}</span>`)
        .join('')}</div>
      ${local.length ? `<div class="local-tags">${local.map((tag) => `<span class="chip mine">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </a>
    ${
      editing
        ? `<div class="tag-edit">
      <input type="text" data-tag-input="${escapeHtml(r.full_name)}" placeholder="${escapeHtml(dict.localTags)}" value="${escapeHtml(local.join(', '))}" />
      <button type="button" class="btn btn-primary" data-tag-save="${escapeHtml(r.full_name)}">${escapeHtml(dict.saveTags)}</button>
      <button type="button" class="btn" data-tag-cancel="${escapeHtml(r.full_name)}">${escapeHtml(dict.cancel)}</button>
    </div>`
        : `<button type="button" class="btn btn-ghost btn-tag" data-tag-edit="${escapeHtml(r.full_name)}">＋ ${escapeHtml(dict.localTags)}</button>`
    }
  </article>`
}

function renderListItem(r: StarredRepo): string {
  const blurb = humanBlurb(r, state.locale)
  return `
  <a class="list-item gallery-list fade-in" href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener">
    <img class="avatar sm" src="${avatarUrl(r.owner_login)}" alt="" loading="lazy" width="36" height="36"/>
    <div class="list-body">
      <strong>${escapeHtml(r.full_name)}</strong>
      <p class="blurb compact">${escapeHtml(blurb)}</p>
    </div>
    <span class="fact lang"><i class="lang-dot" style="background:${languageColor(r.language)}"></i>${escapeHtml(r.language || '—')}</span>
    <span class="meta-row">★ ${formatStars(r.stargazers_count, state.locale)} · ${escapeHtml(formatRelative(r.starred_at, state.locale))}</span>
  </a>`
}

function renderMain(): string {
  const dict = d()
  if (state.loading && !state.repos.length) {
    return `<main class="main" id="main-root"><div class="empty gallery-empty fade-in">
      <div class="progress wide"><i></i></div>
      <h2>${escapeHtml(dict.fetching)}</h2>
      <p>${escapeHtml(state.progress || dict.loading)}</p>
    </div></main>`
  }
  if (state.error && !state.repos.length) {
    return `<main class="main" id="main-root"><div class="empty gallery-empty error-panel fade-in">
      <h2>${escapeHtml(state.error)}</h2>
    </div></main>`
  }
  if (!state.repos.length) {
    return `<main class="main" id="main-root"><div class="empty gallery-empty fade-in">
      <div class="empty-illu">★</div>
      <h2>${escapeHtml(dict.emptyTitle)}</h2>
      <p>${escapeHtml(dict.emptyBody)}</p>
      <p class="empty-cta">${escapeHtml(dict.emptyTry)} <a href="?user=godfay-g">godfay-g</a></p>
    </div></main>`
  }

  if (state.view === 'map') {
    const list = visibleRepos()
    return `<main class="main" id="main-root">
      ${renderStarMap()}
      ${
        state.mapFocus
          ? `<div class="grid gallery-grid map-follow">${list.map(renderCard).join('')}</div>`
          : ''
      }
    </main>`
  }

  const list = visibleRepos()
  if (!list.length) {
    return `<main class="main" id="main-root"><div class="empty fade-in">
      <h2>${escapeHtml(dict.noMatchTitle)}</h2>
      <p>${escapeHtml(dict.noMatchBody)}</p>
      <button type="button" class="btn btn-primary" id="btn-clear-filters-empty">${escapeHtml(dict.clearFilters)}</button>
    </div></main>`
  }
  if (state.view === 'list') {
    return `<main class="main" id="main-root"><div class="list">${list.map(renderListItem).join('')}</div></main>`
  }
  return `<main class="main" id="main-root"><div class="grid gallery-grid">${list.map(renderCard).join('')}</div></main>`
}

function renderAdvanced(): string {
  const dict = d()
  const remaining =
    state.remaining != null && state.limit != null
      ? `<p class="muted">${escapeHtml(dict.apiRemaining)}: ${state.remaining}/${state.limit}</p>`
      : ''
  return `
  <details class="advanced" id="advanced" ${state.advancedOpen ? 'open' : ''}>
    <summary>${escapeHtml(dict.advanced)}</summary>
    <div class="advanced-body">
      <button class="btn" type="button" id="btn-token">${state.token ? escapeHtml(dict.patOk) : escapeHtml(dict.pat)}</button>
      <label class="check-plain"><input type="checkbox" id="exclude-forks" ${state.filters.excludeForks ? 'checked' : ''} ${state.repos.length ? '' : 'disabled'}/> ${escapeHtml(dict.excludeForks)}</label>
      <button type="button" class="btn" id="export-json" ${state.repos.length ? '' : 'disabled'}>${escapeHtml(dict.exportJson)}</button>
      <button type="button" class="btn" id="export-html" ${state.repos.length ? '' : 'disabled'}>${escapeHtml(dict.exportHtml)}</button>
      ${remaining}
      <p class="muted">${escapeHtml(dict.patHint)}</p>
    </div>
  </details>`
}

function renderFooter(): string {
  return `<footer class="app-footer">
    <span>MIT · ${escapeHtml(d().tagline)}</span>
    <a href="https://github.com/godfay-g/github-stars-gallery" target="_blank" rel="noopener">GitHub</a>
  </footer>`
}

function renderTokenModal(): void {
  const dict = d()
  document.getElementById('token-modal')?.remove()
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop'
  backdrop.id = 'token-modal'
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h2>${escapeHtml(dict.patTitle)}</h2>
      <p>${escapeHtml(dict.patBody)}</p>
      <p>${escapeHtml(dict.patHint)}</p>
      <input type="password" id="pat-input" placeholder="ghp_… / github_pat_…" value="${escapeHtml(state.token)}" autocomplete="off" />
      <div class="modal-actions">
        <button type="button" class="btn" id="pat-clear">${escapeHtml(dict.clearPat)}</button>
        <button type="button" class="btn btn-ghost" id="pat-cancel">${escapeHtml(dict.cancel)}</button>
        <button type="button" class="btn btn-primary" id="pat-save">${escapeHtml(dict.save)}</button>
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

function applyMapTransform(): void {
  const stage = document.getElementById('star-map-stage')
  if (!stage) return
  stage.style.transform = `translate(${state.mapPanX}px, ${state.mapPanY}px) scale(${state.mapZoom})`
  stage.style.transformOrigin = '400px 300px'
}

function bindMapGestures(): void {
  const viewport = document.getElementById('star-map-viewport')
  if (!viewport || mapGesturesBound) return
  mapGesturesBound = true
  let dragging = false
  let lastX = 0
  let lastY = 0

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      state.mapZoom = Math.min(2.4, Math.max(0.55, state.mapZoom + delta))
      applyMapTransform()
    },
    { passive: false },
  )

  viewport.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    viewport.setPointerCapture(e.pointerId)
  })
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return
    state.mapPanX += e.clientX - lastX
    state.mapPanY += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    applyMapTransform()
  })
  const end = () => {
    dragging = false
  }
  viewport.addEventListener('pointerup', end)
  viewport.addEventListener('pointercancel', end)
}

function renderResults(): void {
  const status = document.getElementById('status-bar')
  const stats = document.getElementById('stats-root')
  const main = document.getElementById('main-root')
  if (!status || !stats || !main) {
    render()
    return
  }
  const searchEl = document.getElementById('search') as HTMLInputElement | null
  const focused = document.activeElement === searchEl
  const pos = searchEl?.selectionStart ?? null

  mapGesturesBound = false
  status.outerHTML = renderStatus()
  stats.outerHTML = renderOverview()
  main.outerHTML = renderMain()
  bindMapGestures()

  if (focused) {
    const el = document.getElementById('search') as HTMLInputElement | null
    if (el) {
      el.focus()
      if (pos != null) el.setSelectionRange(pos, pos)
    }
  }
}

function focusCategory(id: CategoryId): void {
  state.mapFocus = id
  state.filters.categories = [id]
  state.mapZoom = 1
  state.mapPanX = 0
  state.mapPanY = 0
  if (state.view !== 'map') state.view = 'map'
  renderResults()
  // also refresh chips in toolbar
  render()
}

function bindShell(): void {
  if (shellBound) return
  shellBound = true

  root.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement
    if (!(form instanceof HTMLFormElement) || form.id !== 'user-form') return
    e.preventDefault()
    const u = (document.getElementById('username') as HTMLInputElement).value.trim().replace(/^@/, '')
    void loadUser(u, false)
  })

  root.addEventListener('toggle', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'advanced') state.advancedOpen = (el as HTMLDetailsElement).open
  })

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    const localeBtn = target.closest?.('[data-locale]') as HTMLElement | null
    if (localeBtn) {
      state.locale = localeBtn.getAttribute('data-locale') as Locale
      saveLocale(state.locale)
      document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en'
      render()
      return
    }

    if (target.id === 'btn-refresh' || target.closest?.('#btn-refresh')) {
      if (state.username) void loadUser(state.username, true)
      return
    }
    if (target.id === 'btn-token' || target.closest?.('#btn-token')) {
      renderTokenModal()
      return
    }
    if (target.id === 'view-map') {
      state.view = 'map'
      render()
      return
    }
    if (target.id === 'view-card') {
      state.view = 'card'
      render()
      return
    }
    if (target.id === 'view-list') {
      state.view = 'list'
      render()
      return
    }
    if (target.id === 'btn-clear-filters' || target.id === 'btn-clear-filters-empty') {
      clearFilters()
      render()
      return
    }
    if (target.id === 'btn-map-back' || target.closest?.('[data-map-back]')) {
      state.mapFocus = null
      state.filters.categories = []
      render()
      return
    }
    const zoom = target.closest?.('[data-zoom]') as HTMLElement | null
    if (zoom) {
      const kind = zoom.getAttribute('data-zoom')
      if (kind === 'in') state.mapZoom = Math.min(2.4, state.mapZoom + 0.15)
      if (kind === 'out') state.mapZoom = Math.max(0.55, state.mapZoom - 0.15)
      if (kind === 'reset') {
        state.mapZoom = 1
        state.mapPanX = 0
        state.mapPanY = 0
      }
      applyMapTransform()
      return
    }
    const catNode = target.closest?.('[data-map-cat]') as HTMLElement | null
    if (catNode) {
      focusCategory(catNode.getAttribute('data-map-cat') as CategoryId)
      return
    }
    const openUrl = target.closest?.('[data-open-url]') as HTMLElement | null
    if (openUrl) {
      window.open(openUrl.getAttribute('data-open-url')!, '_blank', 'noopener')
      return
    }
    if (target.id === 'export-json') {
      exportJson(state.username, visibleRepos())
      return
    }
    if (target.id === 'export-html') {
      exportHtml(state.username, visibleRepos())
      return
    }

    const all = target.closest?.('[data-chip-all]') as HTMLElement | null
    if (all) {
      const kind = all.getAttribute('data-chip-all') as 'languages' | 'topics' | 'categories'
      state.filters[kind] = []
      if (kind === 'categories') state.mapFocus = null
      render()
      return
    }
    const chip = target.closest?.('[data-chip-value]') as HTMLElement | null
    if (chip) {
      const kind = chip.getAttribute('data-chip-kind') as 'languages' | 'topics' | 'categories'
      const value = chip.getAttribute('data-chip-value')!
      state.filters[kind] = toggleIn(state.filters[kind], value)
      if (kind === 'categories') {
        state.mapFocus = state.filters.categories.length === 1 ? (state.filters.categories[0] as CategoryId) : null
      }
      render()
      return
    }

    const edit = target.closest?.('[data-tag-edit]') as HTMLElement | null
    if (edit) {
      e.preventDefault()
      state.editingTag = edit.getAttribute('data-tag-edit')
      renderResults()
      return
    }
    const cancel = target.closest?.('[data-tag-cancel]') as HTMLElement | null
    if (cancel) {
      e.preventDefault()
      state.editingTag = null
      renderResults()
      return
    }
    const save = target.closest?.('[data-tag-save]') as HTMLElement | null
    if (save) {
      e.preventDefault()
      const name = save.getAttribute('data-tag-save')!
      const input = root.querySelector<HTMLInputElement>(`[data-tag-input="${CSS.escape(name)}"]`)
      if (!input) return
      const tags = input.value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      state.tags = setRepoTags(state.tags, name, tags)
      state.editingTag = null
      renderResults()
    }
  })

  root.addEventListener('input', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'search') {
      state.filters.query = (el as HTMLInputElement).value
      renderResults()
    }
  })

  root.addEventListener('change', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'sort') {
      state.sort = (el as HTMLSelectElement).value as SortKey
      renderResults()
      return
    }
    if (el.id === 'exclude-forks') {
      state.filters.excludeForks = (el as HTMLInputElement).checked
      renderResults()
    }
  })
}

function render(): void {
  const searchEl = document.getElementById('search') as HTMLInputElement | null
  const searchFocused = document.activeElement === searchEl
  const searchPos = searchEl ? searchEl.selectionStart : null
  mapGesturesBound = false

  root.innerHTML =
    renderHeader() +
    renderToolbar() +
    renderStatus() +
    renderOverview() +
    renderMain() +
    renderAdvanced() +
    renderFooter()
  bindShell()
  bindMapGestures()

  if (searchFocused) {
    const el = document.getElementById('search') as HTMLInputElement | null
    if (el) {
      el.focus()
      if (searchPos != null) el.setSelectionRange(searchPos, searchPos)
    }
  }
}

async function loadUser(username: string, force: boolean): Promise<void> {
  if (!username) return
  abort?.abort()
  abort = new AbortController()
  state.username = username
  state.loading = true
  state.error = null
  state.progress = force ? d().loading : d().fetching
  state.filters = { query: '', languages: [], topics: [], categories: [], excludeForks: false }
  state.editingTag = null
  state.mapFocus = null
  state.mapZoom = 1
  state.mapPanX = 0
  state.mapPanY = 0
  state.view = 'map'
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
        state.progress = page === 0 ? `${d().cacheHit} · ${acc}` : `${d().page} ${page} · ${acc}`
        state.remaining = remaining
        state.limit = limit
        const status = document.getElementById('status-bar')
        if (status) status.outerHTML = renderStatus()
        else render()
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

document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en'
render()
const initial = qsUser()
if (initial) void loadUser(initial, false)
