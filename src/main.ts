import './styles/main.css'
import type { Filters, LocalTagMap, SortKey, StarredRepo, ViewMode } from './types'
import { fetchAllStarred, GithubApiError, loadToken, saveToken } from './api/github'
import { clearCache } from './api/cache'
import { loadTags, saveTags, setRepoTags } from './state/tags'
import { allLanguages, applyFilters, languageStats, sortRepos } from './lib/filter'
import { exportHtml, exportJson } from './lib/export'
import {
  buildCategoryBuckets,
  categorizeRepo,
  categoryColor,
  categoryLabel,
  getCategories,
  humanBlurb,
  setCategoryRules,
  type CategoryId,
} from './lib/categories'
import { formatRelative, formatStars, languageColor, type Locale } from './lib/format'
import { avatarUrl, escapeHtml } from './lib/html'
import { t, type Dict } from './i18n'
import { tc, type ConfigDict } from './i18n-config'
import { StarMap, type StarMapLabels } from './starmap/StarMap'
import {
  DEFAULT_SITE_CONFIG,
  emptyLocalSettings,
  initialUser,
  isUsername,
  parseUrlState,
  resolveCategories,
  resolveLocale,
  resolvePrefs,
  serializeUrlState,
  urlPrefs,
  type LocalSettings,
  type Prefs,
  type SiteConfig,
  type UrlState,
} from './config/schema'
import { applyTheme, loadLocalSettings, loadRecent, loadSiteConfig, pushRecent, removeRecent, saveLocalSettings } from './config/store'
import { openSettings, refreshSettings } from './ui/settings'
import { renderCategoryPills, renderCurrentCategories, syncPillsDom } from './ui/categoryPills'
import { clickCategory, focusForSelection, isAdditiveClick, removeCategory, selectionFromMapFocus } from './lib/catSelect'

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
  assigning: string | null
  mapFocus: CategoryId | null
  advancedOpen: boolean
  welcomeError: string | null
}

/** Configuration layers (A5). URL layer is session-only; local is persisted; site comes from config.json. */
const layers = {
  site: DEFAULT_SITE_CONFIG as SiteConfig,
  siteFound: false,
  filePrefs: {} as Partial<Prefs>,
  local: emptyLocalSettings() as LocalSettings,
  url: {} as UrlState,
  errors: [] as string[],
  errorsDismissed: false,
}
let prefs: Prefs = resolvePrefs()
let recent: string[] = loadRecent()

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
  locale: 'zh',
  editingTag: null,
  assigning: null,
  mapFocus: null,
  advancedOpen: false,
  welcomeError: null,
}

let abort: AbortController | null = null
let shellBound = false
/** True only while doing a full-page render, so entrance animations don't replay on partial updates (fixes chip flicker). */
let entering = false
let starMap: StarMap | null = null
const root = document.querySelector<HTMLDivElement>('#app')!

function d(): Dict {
  return t(state.locale)
}
function c(): ConfigDict {
  return tc(state.locale)
}
function siteTitle(): string {
  return layers.site.site.title[state.locale]
}

function fx(): string {
  return entering ? 'fade-in' : ''
}

// ------------------------------------------------------------------ config application

function recomputePrefs(): void {
  prefs = resolvePrefs(layers.filePrefs, layers.local.prefs, urlPrefs(layers.url))
}

/** Apply prefs that don't need a re-render: theme, accent, density, motion, star-map options. */
function applyLivePrefs(): void {
  applyTheme(prefs.theme, layers.site.accentColor)
  const html = document.documentElement
  html.dataset.density = prefs.density
  html.dataset.motion = prefs.motion
  starMap?.setOptions({ motion: prefs.motion, maxNodesPerCategory: prefs.maxNodesPerCategory })
}

function applyDocumentMeta(): void {
  const title = siteTitle()
  document.title = state.username ? `@${state.username} · ${title}` : title
  document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en'
  document.querySelector('meta[name="description"]')?.setAttribute('content', layers.site.site.subtitle[state.locale])
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
}

function applyCategoryRules(): void {
  setCategoryRules(resolveCategories(layers.site, layers.local), layers.local.overrides)
}

function persistLocal(): void {
  saveLocalSettings(layers.local)
}

// ------------------------------------------------------------------ URL state (F3)

let urlTimer = 0

function currentUrlState(): UrlState {
  const u: UrlState = {
    user: state.username || undefined,
    view: state.view,
    sort: state.sort,
    q: state.filters.query || undefined,
    langFilter: state.filters.languages,
    topics: state.filters.topics,
    cat: state.filters.categories,
  }
  // lang/theme only travel in the URL if the link already carried them (keep shared links stable)
  if (layers.url.lang) u.lang = state.locale
  if (layers.url.theme) u.theme = layers.url.theme
  return u
}

function writeUrl(mode: 'push' | 'replace'): void {
  clearTimeout(urlTimer)
  const qs = serializeUrlState(currentUrlState(), { view: layers.site.defaults.view, sort: layers.site.defaults.sort })
  const path = layers.site.basePath || location.pathname
  const next = `${path}${qs}${location.hash}`
  if (next === `${location.pathname}${location.search}${location.hash}`) return
  if (mode === 'push') history.pushState(null, '', next)
  else history.replaceState(null, '', next)
}

/** Search / filters: replaceState with ~300ms debounce. */
function scheduleUrl(): void {
  clearTimeout(urlTimer)
  urlTimer = window.setTimeout(() => writeUrl('replace'), 300)
}

function filtersFromUrl(u: UrlState): Filters {
  return {
    query: u.q ?? '',
    languages: u.langFilter ?? [],
    topics: u.topics ?? [],
    categories: u.cat ?? [],
    excludeForks: false,
  }
}

// ------------------------------------------------------------------ star map

function mapLabels(): StarMapLabels {
  const dict = d()
  return {
    back: dict.backToMap,
    zoomIn: dict.zoomIn,
    zoomOut: dict.zoomOut,
    fit: dict.zoomReset,
    hint: dict.starMapHint,
    tipExpand: dict.mapTipExpand,
    tipOpen: dict.mapTipOpen,
    tipBack: dict.mapTipBack,
    more: (n) => dict.mapMore.replace('{n}', String(n)),
  }
}

function getStarMap(): StarMap {
  if (!starMap) {
    starMap = new StarMap({
      locale: state.locale,
      labels: mapLabels(),
      onFocusChange: (cat) => {
        // map → pills: expanding selects that category, collapsing returns to "all" (multi-select kept)
        state.mapFocus = cat
        state.filters.categories = selectionFromMapFocus(state.filters.categories, cat)
        syncPillsDom(document, state.filters.categories)
        scheduleUrl()
        // Let the expand/collapse animation own the first ~400ms; heavy card DOM lands after.
        updateUI(true)
      },
      onMore: () => {
        document.getElementById('results-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
    })
    starMap.setOptions({ motion: prefs.motion, maxNodesPerCategory: prefs.maxNodesPerCategory })
  }
  return starMap
}

/** Push current state into the (persistent) star map: data, locale, filter, focus. Never re-creates it. */
function syncStarMap(): void {
  if (!starMap) return
  starMap.setUser(state.username)
  starMap.setData(state.repos)
  starMap.setLocale(state.locale, mapLabels())
  starMap.setFilter({
    visible: sortRepos(applyFilters(state.repos, { ...state.filters, categories: [] }, state.tags), state.sort),
    selectedCats: state.filters.categories,
  })
  if (starMap.focusCat !== state.mapFocus) starMap.focus(state.mapFocus, false)
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

// ------------------------------------------------------------------ rendering

function renderLogo(): string {
  const logo = layers.site.site.logo
  if (/^(https?:\/\/|\.{0,2}\/)/.test(logo)) return `<img class="brand-logo" src="${escapeHtml(logo)}" alt="" width="28" height="28"/>`
  return `<span class="star" aria-hidden="true">${escapeHtml(logo)}</span>`
}

function renderHeader(): string {
  const dict = d()
  const cd = c()
  const welcome = !state.username
  return `
  <header class="app-header">
    <a class="brand" href="./" data-home="1" title="${escapeHtml(cd.home)}">
      ${renderLogo()}
      <div>
        <div class="brand-title">${escapeHtml(siteTitle())}</div>
        <div class="brand-sub">${escapeHtml(layers.site.site.subtitle[state.locale])}</div>
      </div>
    </a>
    ${
      welcome
        ? '<div class="header-spacer"></div>'
        : `<form class="user-form" id="user-form">
      <input type="text" id="username" name="username" list="recent-users" placeholder="${escapeHtml(cd.switchUser)}" value="${escapeHtml(state.username)}" autocomplete="off" spellcheck="false" required />
      <datalist id="recent-users">${recent.map((u) => `<option value="${escapeHtml(u)}"></option>`).join('')}</datalist>
      <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? escapeHtml(dict.loading) : escapeHtml(dict.load)}</button>
      <button class="btn" type="button" id="btn-refresh" title="${escapeHtml(dict.refresh)}" ${state.loading || !state.username ? 'disabled' : ''}>↻</button>
    </form>`
    }
    <div class="header-actions">
      <div class="locale-switch" role="group" aria-label="Language">
        <button type="button" class="btn btn-ghost ${state.locale === 'zh' ? 'active' : ''}" data-locale="zh">${escapeHtml(dict.localeZh)}</button>
        <button type="button" class="btn btn-ghost ${state.locale === 'en' ? 'active' : ''}" data-locale="en">${escapeHtml(dict.localeEn)}</button>
      </div>
      <button type="button" class="btn btn-ghost" id="btn-settings" title="${escapeHtml(cd.settings)}" aria-label="${escapeHtml(cd.settings)}">⚙︎ ${escapeHtml(cd.settings)}</button>
    </div>
  </header>`
}

function renderConfigBanner(): string {
  if (!layers.errors.length || layers.errorsDismissed) return ''
  const cd = c()
  return `<div class="config-banner" id="config-banner" role="status">
    <div><strong>${escapeHtml(cd.configBanner)}</strong>
      <ul>${layers.errors.slice(0, 8).map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join('')}${layers.errors.length > 8 ? `<li>… +${layers.errors.length - 8}</li>` : ''}</ul>
    </div>
    <button type="button" class="btn" id="btn-dismiss-config">${escapeHtml(cd.dismiss)}</button>
  </div>`
}

/** A6: welcome page — input + explanation only. Renders nothing that hits the GitHub API. */
function renderWelcome(): string {
  const cd = c()
  const example = layers.site.exampleUser || layers.site.defaultUser
  return `<main class="main welcome ${fx()}" id="main-root">
    <section class="welcome-hero">
      <div class="welcome-logo" aria-hidden="true">${renderLogo()}</div>
      <h1>${escapeHtml(cd.welcomeTitle)}</h1>
      <p class="welcome-body">${escapeHtml(cd.welcomeBody)}</p>
      <form class="welcome-form" id="welcome-form" novalidate>
        <div class="welcome-field">
          <span class="welcome-at" aria-hidden="true">@</span>
          <input type="text" id="welcome-user" name="user" placeholder="${escapeHtml(cd.welcomeInput)}" aria-label="${escapeHtml(cd.welcomeInput)}" autocomplete="off" autocapitalize="off" spellcheck="false" autofocus />
        </div>
        <button class="btn btn-primary" type="submit">${escapeHtml(cd.welcomeGo)} →</button>
      </form>
      ${state.welcomeError ? `<p class="welcome-error" role="alert">${escapeHtml(state.welcomeError)}</p>` : ''}
      ${example ? `<p class="welcome-example"><button type="button" class="btn btn-ghost" data-open-user="${escapeHtml(example)}">${escapeHtml(cd.welcomeExample)} · @${escapeHtml(example)}</button></p>` : ''}
      ${
        recent.length
          ? `<div class="welcome-recent"><span class="muted">${escapeHtml(cd.welcomeRecent)}</span>
          ${recent
            .map(
              (u) => `<span class="recent-chip"><button type="button" class="chip-filter" data-open-user="${escapeHtml(u)}">@${escapeHtml(u)}</button><button type="button" class="recent-x" data-remove-recent="${escapeHtml(u)}" title="${escapeHtml(cd.welcomeRemove)}" aria-label="${escapeHtml(cd.welcomeRemove)}">×</button></span>`,
            )
            .join('')}</div>`
          : ''
      }
    </section>
  </main>`
}

function renderChipRow(
  kind: 'languages' | 'topics',
  items: { label: string; value: string; color?: string }[],
  allLabel: string,
): string {
  const selected = new Set(state.filters[kind])
  const disabled = !state.repos.length
  return `
  <div class="chip-row" data-chip-kind="${kind}">
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
  const langs = allLanguages(state.repos)
    .slice(0, 12)
    .map((l) => ({ label: l, value: l, color: languageColor(l) }))
  // keep URL-selected values visible even if they are not in the top 12
  for (const l of state.filters.languages) if (!langs.some((x) => x.value === l)) langs.push({ label: l, value: l, color: languageColor(l) })
  const topics = topicCounts(state.repos)
    .slice(0, 12)
    .map((x) => ({ label: `${x.topic}`, value: x.topic }))
  for (const tp of state.filters.topics) if (!topics.some((x) => x.value === tp)) topics.push({ label: tp, value: tp })
  const opt = (v: SortKey, label: string) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${escapeHtml(label)}</option>`

  return `
  <div class="toolbar gallery-toolbar" id="toolbar">
    <div class="toolbar-top">
      <input type="search" id="search" class="search-hero" placeholder="${escapeHtml(dict.searchPlaceholder)}" value="${escapeHtml(state.filters.query)}" ${has ? '' : 'disabled'} />
      <select id="sort" ${has ? '' : 'disabled'}>
        ${opt('starred_at', dict.sortStarred)}${opt('stars', dict.sortStars)}${opt('updated', dict.sortUpdated)}${opt('name', dict.sortName)}
      </select>
      <div class="view-toggle btn-group">
        <button type="button" class="btn ${state.view === 'map' ? 'active' : ''}" id="view-map" ${has ? '' : 'disabled'}>${escapeHtml(dict.map)}</button>
        <button type="button" class="btn ${state.view === 'card' ? 'active' : ''}" id="view-card" ${has ? '' : 'disabled'}>${escapeHtml(dict.cards)}</button>
        <button type="button" class="btn ${state.view === 'list' ? 'active' : ''}" id="view-list" ${has ? '' : 'disabled'}>${escapeHtml(dict.list)}</button>
      </div>
      ${hasActiveFilters() ? `<button type="button" class="btn" id="btn-clear-filters">${escapeHtml(dict.clearFilters)}</button>` : ''}
    </div>
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
  <section class="overview ${fx()}" id="stats-root">
    <div class="overview-head">
      <h2>${escapeHtml(dict.overview)}</h2>
      <div class="overview-total"><span class="num">${formatStars(total, state.locale)}</span><span class="lbl">${escapeHtml(dict.total)}</span></div>
    </div>
    ${renderCategoryPills(
      buckets.map((b) => ({ id: b.id, label: b.label, color: b.color, count: b.repos.length })),
      state.filters.categories,
      { title: dict.categories, all: dict.allCategories, hint: dict.catMultiHint },
      total,
    )}
    <div class="overview-grid">
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

function renderCard(r: StarredRepo): string {
  const dict = d()
  const cd = c()
  const local = state.tags[r.full_name] ?? []
  const editing = state.editingTag === r.full_name
  const assigning = state.assigning === r.full_name
  const blurb = humanBlurb(r, state.locale)
  const cat = categorizeRepo(r)
  const catColor = categoryColor(cat)
  const manual = Boolean(layers.local.overrides[r.full_name])
  const name = r.full_name.split('/')
  const key = escapeHtml(r.full_name)
  let tail: string
  if (assigning) {
    tail = `<div class="tag-edit assign-edit">
      <select data-assign-select="${key}" aria-label="${escapeHtml(cd.assignTitle)}">
        <option value="">${escapeHtml(cd.assignAuto)}</option>
        ${getCategories()
          .map((x) => `<option value="${escapeHtml(x.id)}" ${manual && x.id === cat ? 'selected' : ''}>${escapeHtml(x.label[state.locale])}</option>`)
          .join('')}
      </select>
      <button type="button" class="btn" data-assign-cancel="${key}">${escapeHtml(dict.cancel)}</button>
    </div>`
  } else if (editing) {
    tail = `<div class="tag-edit">
      <input type="text" data-tag-input="${key}" placeholder="${escapeHtml(dict.localTags)}" value="${escapeHtml(local.join(', '))}" />
      <button type="button" class="btn btn-primary" data-tag-save="${key}">${escapeHtml(dict.saveTags)}</button>
      <button type="button" class="btn" data-tag-cancel="${key}">${escapeHtml(dict.cancel)}</button>
    </div>`
  } else {
    tail = `<button type="button" class="btn btn-ghost btn-tag" data-tag-edit="${key}">＋ ${escapeHtml(dict.localTags)}</button>`
  }
  return `
  <article class="card gallery-card ${fx()}" data-id="${r.id}">
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
        <span class="cat-badge ${manual ? 'manual' : ''}" role="button" tabindex="0" data-assign="${key}" title="${escapeHtml(cd.assignTitle)}" style="--c:${catColor}">${manual ? '📌 ' : ''}${escapeHtml(categoryLabel(cat, state.locale))} ▾</span>
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
    ${tail}
  </article>`
}

function renderListItem(r: StarredRepo): string {
  const blurb = humanBlurb(r, state.locale)
  return `
  <a class="list-item gallery-list ${fx()}" href="${escapeHtml(r.html_url)}" target="_blank" rel="noopener">
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
  if (!state.username && !state.loading) return renderWelcome()
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
      <p><a href="./" data-home="1">${escapeHtml(c().home)}</a></p>
    </div></main>`
  }
  if (!state.repos.length) {
    return `<main class="main" id="main-root"><div class="empty gallery-empty fade-in">
      <div class="empty-illu">★</div>
      <h2>${escapeHtml(dict.noMatchTitle)}</h2>
    </div></main>`
  }
  if (state.view === 'map') {
    return `<main class="main" id="main-root">
      <div id="star-map-slot"></div>
      <div id="results-root">${renderResultsInner()}</div>
    </main>`
  }
  return `<main class="main" id="main-root"><div id="results-root">${renderResultsInner()}</div></main>`
}

/** Everything below the star map that depends on filters. The star map itself is never in here. */
function renderResultsInner(): string {
  const dict = d()
  const list = visibleRepos()
  const current = renderCurrentBar()
  if (state.view === 'map') {
    const foot = `<p class="muted map-foot">${escapeHtml(dict.shown)} ${list.length} / ${state.repos.length}</p>`
    return state.filters.categories.length
      ? `${current}${foot}<div class="grid gallery-grid map-follow" id="results-grid">${progressiveCards(list)}</div>`
      : foot
  }
  if (!list.length) {
    return `${current}<div class="empty ${fx()}">
      <h2>${escapeHtml(dict.noMatchTitle)}</h2>
      <p>${escapeHtml(dict.noMatchBody)}</p>
      <button type="button" class="btn btn-primary" id="btn-clear-filters-empty">${escapeHtml(dict.clearFilters)}</button>
    </div>`
  }
  if (state.view === 'list') return `${current}<div class="list">${list.map(renderListItem).join('')}</div>`
  return `${current}<div class="grid gallery-grid" id="results-grid">${progressiveCards(list)}</div>`
}

/** 「当前：AI / 机器学习 ×」 — shows the active categories above the results; × removes one. */
function renderCurrentBar(): string {
  const dict = d()
  return renderCurrentCategories(
    state.filters.categories.map((id) => ({ id, label: categoryLabel(id, state.locale), color: categoryColor(id) })),
    { current: dict.catCurrent, remove: dict.catRemove, clear: dict.catClearAll },
  )
}

/** Apply a new category selection from any entry point (pills, × tags, URL) and sync the map. */
function setCategorySelection(next: string[]): void {
  state.filters.categories = next
  state.mapFocus = focusForSelection(next)
  scheduleUrl()
  updateUI()
}

/**
 * Render the first chunk of cards synchronously and stream the rest in idle time, so a
 * 1000+ star account never blocks the main thread (and the star map animation) for 100ms+.
 */
const CARD_CHUNK = 24
let pendingCards: StarredRepo[] = []
let cardGen = 0
function progressiveCards(list: StarredRepo[]): string {
  cardGen++
  pendingCards = list.slice(CARD_CHUNK)
  if (pendingCards.length) {
    const gen = cardGen
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 300 }) : setTimeout(cb, 16)
    const pump = () => {
      if (gen !== cardGen) return
      const grid = document.getElementById('results-grid')
      if (!grid) return
      const chunk = pendingCards.splice(0, CARD_CHUNK)
      grid.insertAdjacentHTML('beforeend', chunk.map(renderCard).join(''))
      if (pendingCards.length) idle(pump)
    }
    idle(pump)
  }
  return list.slice(0, CARD_CHUNK).map(renderCard).join('')
}

function renderAdvanced(): string {
  if (!state.username) return ''
  const dict = d()
  const remaining =
    state.remaining != null && state.limit != null
      ? `<p class="muted">${escapeHtml(dict.apiRemaining)}: ${state.remaining}/${state.limit}</p>`
      : ''
  const pat = layers.site.hidePatInput
    ? ''
    : `<button class="btn" type="button" id="btn-token">${state.token ? escapeHtml(dict.patOk) : escapeHtml(dict.pat)}</button>`
  return `
  <details class="advanced" id="advanced" ${state.advancedOpen ? 'open' : ''}>
    <summary>${escapeHtml(dict.advanced)}</summary>
    <div class="advanced-body">
      ${pat}
      <label class="check-plain"><input type="checkbox" id="exclude-forks" ${state.filters.excludeForks ? 'checked' : ''} ${state.repos.length ? '' : 'disabled'}/> ${escapeHtml(dict.excludeForks)}</label>
      <button type="button" class="btn" id="export-json" ${state.repos.length ? '' : 'disabled'}>${escapeHtml(dict.exportJson)}</button>
      <button type="button" class="btn" id="export-html" ${state.repos.length ? '' : 'disabled'}>${escapeHtml(dict.exportHtml)}</button>
      ${remaining}
      ${layers.site.hidePatInput ? '' : `<p class="muted">${escapeHtml(dict.patHint)}</p>`}
    </div>
  </details>`
}

function renderFooter(): string {
  const src = layers.site.site.sourceUrl
  return `<footer class="app-footer">
    <span>MIT · ${escapeHtml(layers.site.site.subtitle[state.locale])}</span>
    ${src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener">GitHub</a>` : ''}
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

function withSearchFocus(fn: () => void): void {
  const searchEl = document.getElementById('search') as HTMLInputElement | null
  const focused = document.activeElement === searchEl
  const pos = searchEl?.selectionStart ?? null
  fn()
  if (focused) {
    const el = document.getElementById('search') as HTMLInputElement | null
    if (el && document.activeElement !== el) {
      el.focus()
      if (pos != null) el.setSelectionRange(pos, pos)
    }
  }
}


/** Partial update: status, overview, results list, and star-map filter. Does NOT touch the star map container. */
function renderResults(): void {
  clearTimeout(deferredResults)
  const status = document.getElementById('status-bar')
  const stats = document.getElementById('stats-root')
  const results = document.getElementById('results-root')
  if (!status || !stats || !results) {
    render()
    return
  }
  withSearchFocus(() => {
    status.outerHTML = renderStatus()
    // Overview content only depends on the full repo set; just sync the active category pills.
    syncPillsDom(stats, state.filters.categories)
    results.innerHTML = renderResultsInner()
  })
  syncStarMap()
}

/** Filter/focus change: refresh toolbar chips + results without a full-page render. */
let deferredResults = 0
function updateUI(deferResults = false): void {
  const toolbar = document.getElementById('toolbar')
  if (!toolbar) {
    render()
    return
  }
  withSearchFocus(() => {
    toolbar.outerHTML = renderToolbar()
  })
  clearTimeout(deferredResults)
  if (deferResults && prefs.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const status = document.getElementById('status-bar')
    if (status) status.outerHTML = renderStatus()
    deferredResults = window.setTimeout(renderResults, 650)
  } else renderResults()
}

/** Category rules / manual assignment changed: re-bucket everything, keep the map mounted. */
function onCategoriesChanged(): void {
  applyCategoryRules()
  const ids = new Set(getCategories().map((x) => x.id))
  state.filters.categories = state.filters.categories.filter((x) => ids.has(x))
  if (state.mapFocus && !ids.has(state.mapFocus)) state.mapFocus = null
  starMap?.refreshCategories()
  if (!state.repos.length) return
  const stats = document.getElementById('stats-root')
  if (stats) stats.outerHTML = renderOverview()
  updateUI()
}

// ------------------------------------------------------------------ settings bridge

function settingsCtx() {
  return {
    locale: () => state.locale,
    prefs: () => prefs,
    local: () => layers.local,
    site: () => layers.site,
    errors: () => layers.errors,
    tagsCount: () => Object.keys(state.tags).length,
    tags: () => state.tags,
    setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
      layers.local.prefs = { ...layers.local.prefs, [k]: v }
      // an explicit choice in the panel beats a value that came in through the URL
      if (k === 'theme') layers.url.theme = undefined
      if (k === 'lang') layers.url.lang = undefined
      persistLocal()
      const prevLocale = state.locale
      recomputePrefs()
      applyLivePrefs()
      if (k === 'lang') {
        state.locale = resolveLocale(prefs.lang, navigator.language)
        if (state.locale !== prevLocale) {
          applyDocumentMeta()
          render()
        }
      }
      if (k === 'theme') writeUrl('replace')
    },
    setCategories: (list: LocalSettings['categories']) => {
      layers.local.categories = list
      persistLocal()
      onCategoriesChanged()
    },
    clearOverrides: () => {
      layers.local.overrides = {}
      persistLocal()
      onCategoriesChanged()
    },
    clearTags: () => {
      state.tags = {}
      saveTags({})
      if (state.repos.length) renderResults()
    },
    importSettings: (s: LocalSettings) => {
      layers.local = { ...s, tags: {} }
      if (Object.keys(s.tags).length) {
        state.tags = { ...state.tags, ...s.tags }
        saveTags(state.tags)
      }
      persistLocal()
      reapplyAll()
    },
    resetAll: () => {
      layers.local = emptyLocalSettings()
      persistLocal()
      reapplyAll()
    },
  }
}
export type SettingsCtx = ReturnType<typeof settingsCtx>

function reapplyAll(): void {
  recomputePrefs()
  state.locale = resolveLocale(prefs.lang, navigator.language)
  applyLivePrefs()
  applyCategoryRules()
  starMap?.refreshCategories()
  applyDocumentMeta()
  render()
}

// ------------------------------------------------------------------ events

function openUser(user: string, mode: 'push' | 'replace' = 'push'): void {
  const u = user.trim().replace(/^@/, '')
  if (!isUsername(u)) {
    state.welcomeError = c().welcomeInvalid
    if (!state.username) render()
    return
  }
  state.welcomeError = null
  // a new user starts from a clean filter state; only lang/theme from the original link carry over
  layers.url = { lang: layers.url.lang, theme: layers.url.theme }
  recomputePrefs()
  void loadUser(u, false, { mode })
}

function goHome(): void {
  abort?.abort()
  state.username = ''
  state.repos = []
  state.loading = false
  state.error = null
  state.mapFocus = null
  state.filters = { query: '', languages: [], topics: [], categories: [], excludeForks: false }
  starMap?.setData([])
  writeUrl('push')
  applyDocumentMeta()
  render()
}

function bindShell(): void {
  if (shellBound) return
  shellBound = true

  root.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement
    if (!(form instanceof HTMLFormElement)) return
    if (form.id === 'user-form') {
      e.preventDefault()
      openUser((document.getElementById('username') as HTMLInputElement).value)
    } else if (form.id === 'welcome-form') {
      e.preventDefault()
      openUser((document.getElementById('welcome-user') as HTMLInputElement).value)
    }
  })

  root.addEventListener('toggle', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'advanced') state.advancedOpen = (el as HTMLDetailsElement).open
  })

  root.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement
    if ((e.key === 'Enter' || e.key === ' ') && el.matches?.('[data-assign]')) {
      e.preventDefault()
      el.click()
    }
  })

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    const home = target.closest?.('[data-home]') as HTMLElement | null
    if (home) {
      e.preventDefault()
      goHome()
      return
    }
    const openU = target.closest?.('[data-open-user]') as HTMLElement | null
    if (openU) {
      openUser(openU.getAttribute('data-open-user') ?? '')
      return
    }
    const rm = target.closest?.('[data-remove-recent]') as HTMLElement | null
    if (rm) {
      recent = removeRecent(rm.getAttribute('data-remove-recent') ?? '')
      render()
      return
    }
    if (target.id === 'btn-dismiss-config') {
      layers.errorsDismissed = true
      document.getElementById('config-banner')?.remove()
      return
    }
    if (target.closest?.('#btn-settings')) {
      openSettings(settingsCtx())
      return
    }

    const localeBtn = target.closest?.('[data-locale]') as HTMLElement | null
    if (localeBtn) {
      const loc = localeBtn.getAttribute('data-locale') === 'en' ? 'en' : 'zh'
      settingsCtx().setPref('lang', loc)
      if (layers.url.lang !== undefined) layers.url.lang = loc
      refreshSettings()
      return
    }

    if (target.id === 'btn-refresh' || target.closest?.('#btn-refresh')) {
      if (state.username) void loadUser(state.username, true, { mode: 'replace', keepFilters: true })
      return
    }
    if (target.id === 'btn-token' || target.closest?.('#btn-token')) {
      renderTokenModal()
      return
    }
    const viewBtn = target.closest?.('#view-map, #view-card, #view-list') as HTMLElement | null
    if (viewBtn) {
      state.view = viewBtn.id === 'view-map' ? 'map' : viewBtn.id === 'view-card' ? 'card' : 'list'
      writeUrl('replace')
      render()
      return
    }
    if (target.id === 'btn-clear-filters' || target.id === 'btn-clear-filters-empty') {
      clearFilters()
      scheduleUrl()
      updateUI()
      return
    }
    if (target.id === 'export-json') {
      exportJson(state.username, visibleRepos())
      return
    }
    if (target.id === 'export-html') {
      exportHtml(state.username, visibleRepos(), {
        rules: getCategories(),
        overrides: layers.local.overrides,
        locale: state.locale,
        title: siteTitle(),
      })
      return
    }

    // categories: the overview pills are the only selector (plus × on the "current" bar)
    if (target.closest?.('[data-cat-all]')) {
      setCategorySelection([])
      return
    }
    const catPill = target.closest?.('[data-cat-pill]') as HTMLElement | null
    if (catPill) {
      setCategorySelection(clickCategory(state.filters.categories, catPill.dataset.catPill ?? '', isAdditiveClick(e)))
      return
    }
    const catRemove = target.closest?.('[data-cat-remove]') as HTMLElement | null
    if (catRemove) {
      setCategorySelection(removeCategory(state.filters.categories, catRemove.dataset.catRemove ?? ''))
      return
    }

    const all = target.closest?.('[data-chip-all]') as HTMLElement | null
    if (all) {
      const kind = all.getAttribute('data-chip-all') as 'languages' | 'topics'
      state.filters[kind] = []
      scheduleUrl()
      updateUI()
      return
    }
    const chip = target.closest?.('[data-chip-value]') as HTMLElement | null
    if (chip) {
      const kind = chip.getAttribute('data-chip-kind') as 'languages' | 'topics'
      const value = chip.getAttribute('data-chip-value')!
      state.filters[kind] = toggleIn(state.filters[kind], value)
      scheduleUrl()
      updateUI()
      return
    }

    const assign = target.closest?.('[data-assign]') as HTMLElement | null
    if (assign) {
      e.preventDefault()
      state.assigning = assign.getAttribute('data-assign')
      state.editingTag = null
      renderResults()
      return
    }
    const assignCancel = target.closest?.('[data-assign-cancel]') as HTMLElement | null
    if (assignCancel) {
      state.assigning = null
      renderResults()
      return
    }

    const edit = target.closest?.('[data-tag-edit]') as HTMLElement | null
    if (edit) {
      e.preventDefault()
      state.editingTag = edit.getAttribute('data-tag-edit')
      state.assigning = null
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
      scheduleUrl()
      renderResults()
    }
  })

  root.addEventListener('change', (e) => {
    const el = e.target as HTMLElement
    if (el.id === 'sort') {
      state.sort = (el as HTMLSelectElement).value as SortKey
      scheduleUrl()
      renderResults()
      return
    }
    if (el.id === 'exclude-forks') {
      state.filters.excludeForks = (el as HTMLInputElement).checked
      updateUI()
      return
    }
    const sel = el.closest?.('[data-assign-select]') as HTMLSelectElement | null
    if (sel) {
      const name = sel.getAttribute('data-assign-select')!
      const next = { ...layers.local.overrides }
      if (sel.value) next[name] = sel.value
      else delete next[name]
      layers.local.overrides = next
      state.assigning = null
      persistLocal()
      onCategoriesChanged()
      refreshSettings()
    }
  })

  // Back/forward: restore user + filters from the URL (F3).
  window.addEventListener('popstate', () => {
    const parsed = parseUrlState(location.search).value
    layers.url = { ...parsed }
    recomputePrefs()
    applyLivePrefs()
    const wantUser = parsed.user ?? ''
    state.view = prefs.view
    state.sort = prefs.sort
    if (wantUser.toLowerCase() !== state.username.toLowerCase()) {
      if (!wantUser) {
        goHomeNoPush()
        return
      }
      state.filters = filtersFromUrl(parsed)
      void loadUser(wantUser, false, { mode: 'none', keepFilters: true })
      return
    }
    state.filters = filtersFromUrl(parsed)
    state.mapFocus = focusForSelection(state.filters.categories)
    render()
  })
}

function goHomeNoPush(): void {
  abort?.abort()
  state.username = ''
  state.repos = []
  state.loading = false
  state.error = null
  state.mapFocus = null
  starMap?.setData([])
  applyDocumentMeta()
  render()
}

function render(): void {
  // The star map is mounted once: detach its host before wiping the page, re-attach after.
  starMap?.detach()
  entering = true
  const hasUser = Boolean(state.username)
  withSearchFocus(() => {
    root.innerHTML =
      renderHeader() +
      renderConfigBanner() +
      (hasUser ? renderToolbar() + renderStatus() + renderOverview() : '') +
      renderMain() +
      renderAdvanced() +
      renderFooter()
  })
  entering = false
  bindShell()
  const slot = document.getElementById('star-map-slot')
  if (slot && state.repos.length) {
    const map = getStarMap()
    syncStarMap()
    map.attach(slot)
  }
}

async function loadUser(
  username: string,
  force: boolean,
  opts: { mode?: 'push' | 'replace' | 'none'; keepFilters?: boolean } = {},
): Promise<void> {
  if (!isUsername(username)) return
  abort?.abort()
  abort = new AbortController()
  const changed = username.toLowerCase() !== state.username.toLowerCase()
  state.username = username
  state.loading = true
  state.error = null
  state.progress = force ? d().loading : d().fetching
  state.editingTag = null
  state.assigning = null
  if (!opts.keepFilters) {
    state.filters = { query: '', languages: [], topics: [], categories: [], excludeForks: false }
    state.view = prefs.view
  }
  state.mapFocus = focusForSelection(state.filters.categories)
  if (changed) state.repos = []
  if (opts.mode && opts.mode !== 'none') writeUrl(opts.mode)
  recent = pushRecent(username)
  applyDocumentMeta()
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
    if (!abort.signal.aborted) {
      state.loading = false
      render()
    }
  }
}

// ------------------------------------------------------------------ boot

async function boot(): Promise<void> {
  const url = parseUrlState(location.search)
  const local = loadLocalSettings()
  layers.url = url.value
  layers.local = local.value
  // Paint something immediately with built-in + local + URL prefs; config.json refines it.
  recomputePrefs()
  state.locale = resolveLocale(prefs.lang, navigator.language)
  applyLivePrefs()

  const cfg = await loadSiteConfig()
  layers.site = cfg.value.config
  layers.siteFound = cfg.found
  layers.filePrefs = cfg.value.prefs
  layers.errors = [
    ...cfg.errors.map((e) => `config.json · ${e}`),
    ...local.errors.map((e) => `localStorage · ${e}`),
    ...url.errors.map((e) => `URL · ${e}`),
  ]
  recomputePrefs()
  state.locale = resolveLocale(prefs.lang, navigator.language)
  state.view = prefs.view
  state.sort = prefs.sort
  state.filters = filtersFromUrl(url.value)
  applyLivePrefs()
  applyCategoryRules()
  applyDocumentMeta()

  // A6: only URL user, opt-in "auto open last user", or config.json defaultUser trigger a fetch.
  const user = initialUser(url.value, prefs, recent, layers.site)
  if (user) void loadUser(user, false, { mode: url.value.user ? 'none' : 'replace', keepFilters: true })
  else render()
}

void boot()
