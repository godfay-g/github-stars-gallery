/**
 * Single source of truth for configuration (A1).
 *
 * Used by the web app AND the CLI (`scripts/export.ts --config`). Everything coming from the
 * outside — URL params, public/config.json, imported settings files, localStorage — is
 * untrusted (A2): we validate field by field, drop unknown fields, fall back to defaults on
 * invalid values and never throw. Merging is per field (A5): URL > local settings > config.json > built-in.
 *
 * No DOM / browser APIs in this file.
 */

export const CONFIG_VERSION = 1 as const

export type Locale = 'zh' | 'en'
export type LangPref = Locale | 'auto'
export type Theme = 'dark' | 'light' | 'system'
export type View = 'map' | 'card' | 'list'
export type Sort = 'starred_at' | 'stars' | 'updated' | 'name'
export type Motion = 'off' | 'light' | 'standard'
export type Density = 'comfortable' | 'compact'

export const LANG_PREFS: readonly LangPref[] = ['zh', 'en', 'auto']
export const THEMES: readonly Theme[] = ['dark', 'light', 'system']
export const VIEWS: readonly View[] = ['map', 'card', 'list']
export const SORTS: readonly Sort[] = ['starred_at', 'stars', 'updated', 'name']
export const MOTIONS: readonly Motion[] = ['off', 'light', 'standard']
export const DENSITIES: readonly Density[] = ['comfortable', 'compact']
export const MAX_NODES_RANGE = { min: 20, max: 400 } as const

export type I18nText = { zh: string; en: string }

/**
 * A category rule. Matching is literal only (A4): case-insensitive substring for keywords,
 * exact (case-insensitive) for topics and languages. No regular expressions.
 */
export type CategoryRule = {
  id: string
  label: I18nText
  color: string
  keywords: string[]
  topics: string[]
  languages: string[]
}

/** User-facing preferences: the only part that is merged across all four layers. */
export type Prefs = {
  lang: LangPref
  theme: Theme
  view: View
  sort: Sort
  motion: Motion
  density: Density
  maxNodesPerCategory: number
  autoOpenLastUser: boolean
}

/** Deploy-time config (public/config.json). */
export type SiteConfig = {
  version: typeof CONFIG_VERSION
  site: { title: I18nText; subtitle: I18nText; logo: string; sourceUrl: string }
  defaultUser: string
  exampleUser: string
  accentColor: string
  hidePatInput: boolean
  basePath: string
  defaults: Prefs
  /** How `categories` combine with built-ins: merge by id (default) or replace the whole list. */
  categoriesMode: 'merge' | 'replace'
  categories: CategoryRule[]
}

/** Runtime user settings (localStorage `gsg:settings`, import/export file). Never contains a token (A3). */
export type LocalSettings = {
  version: typeof CONFIG_VERSION
  prefs: Partial<Prefs>
  /** Full custom category list when the user edited categories; undefined = use config/built-in. */
  categories?: CategoryRule[]
  /** Manual assignment: `owner/repo` → category id. */
  overrides: Record<string, string>
  /** Local tags: `owner/repo` → tags. */
  tags: Record<string, string[]>
}

/** Shareable state in the URL (A3: user name, filters, view — nothing secret). */
export type UrlState = {
  user?: string
  view?: View
  lang?: Locale
  theme?: Theme
  q?: string
  langFilter?: string[]
  topics?: string[]
  cat?: string[]
  sort?: Sort
}

export type ValidationResult<T> = { value: T; errors: string[] }

// ------------------------------------------------------------------ built-in defaults

export const OTHER_ID = 'other'

export const DEFAULT_CATEGORIES: CategoryRule[] = [
  {
    id: 'ai',
    label: { zh: 'AI / 机器学习', en: 'AI / ML' },
    color: '#d2a8ff',
    topics: ['ai', 'machine-learning', 'deep-learning', 'llm', 'nlp', 'computer-vision', 'pytorch', 'tensorflow', 'openai', 'chatgpt', 'generative-ai', 'transformers', 'diffusion'],
    keywords: ['llm', 'gpt', 'openai', 'langchain', 'pytorch', 'tensorflow', 'machine learning', 'deep learning', 'neural', 'diffusion', 'agent', 'rag'],
    languages: ['Jupyter Notebook'],
  },
  {
    id: 'security',
    label: { zh: '安全', en: 'Security' },
    color: '#f85149',
    topics: ['security', 'cryptography', 'privacy', 'authentication', 'vulnerability', 'pentest'],
    keywords: ['security', 'crypto', 'cve', 'auth', 'oauth', 'pentest', 'malware'],
    languages: [],
  },
  {
    id: 'web',
    label: { zh: 'Web 前端', en: 'Web' },
    color: '#58a6ff',
    topics: ['frontend', 'react', 'vue', 'angular', 'nextjs', 'svelte', 'css', 'html', 'web', 'ui', 'typescript', 'javascript'],
    keywords: ['react', 'vue', 'next.js', 'frontend', 'tailwind', 'webpack', 'vite'],
    languages: ['TypeScript', 'JavaScript', 'HTML', 'CSS', 'Vue'],
  },
  {
    id: 'mobile',
    label: { zh: '移动端', en: 'Mobile' },
    color: '#f778ba',
    topics: ['android', 'ios', 'flutter', 'react-native', 'mobile', 'swiftui'],
    keywords: ['android', 'ios', 'flutter', 'react native', 'mobile'],
    languages: ['Swift', 'Kotlin', 'Dart', 'Objective-C'],
  },
  {
    id: 'infra',
    label: { zh: '基础设施', en: 'Infrastructure' },
    color: '#ffa657',
    topics: ['docker', 'kubernetes', 'devops', 'terraform', 'ci', 'aws', 'cloud', 'infrastructure', 'ansible', 'helm'],
    keywords: ['docker', 'kubernetes', 'k8s', 'terraform', 'devops', 'ci/cd', 'infra', 'cloud'],
    languages: ['HCL', 'Dockerfile'],
  },
  {
    id: 'data',
    label: { zh: '数据 / 存储', en: 'Data' },
    color: '#79c0ff',
    topics: ['database', 'sql', 'postgres', 'mysql', 'redis', 'elasticsearch', 'mongodb', 'analytics'],
    keywords: ['database', 'postgres', 'mysql', 'redis', 'sql', 'etl'],
    languages: [],
  },
  {
    id: 'game',
    label: { zh: '游戏', en: 'Games' },
    color: '#e3b341',
    topics: ['game', 'gamedev', 'unity', 'godot', 'unreal'],
    keywords: ['game', 'unity', 'godot', 'unreal'],
    languages: [],
  },
  {
    id: 'tools',
    label: { zh: '开发工具', en: 'Tools' },
    color: '#7ee787',
    topics: ['cli', 'devtools', 'vscode', 'tool', 'utility', 'sdk', 'library'],
    keywords: ['cli', 'tool', 'vscode', 'linter', 'formatter', 'sdk'],
    languages: ['Shell', 'Go', 'Rust'],
  },
  {
    id: 'learn',
    label: { zh: '学习资料', en: 'Learning' },
    color: '#3fb950',
    topics: ['awesome', 'tutorial', 'documentation', 'ebook', 'course', 'learning', 'guide'],
    keywords: ['awesome', 'tutorial', 'handbook', 'guide', 'cheat sheet'],
    languages: [],
  },
  { id: OTHER_ID, label: { zh: '其他', en: 'Other' }, color: '#8b949e', topics: [], keywords: [], languages: [] },
]

export const DEFAULT_PREFS: Prefs = {
  lang: 'zh',
  theme: 'dark',
  view: 'map',
  sort: 'starred_at',
  motion: 'standard',
  density: 'comfortable',
  maxNodesPerCategory: 150,
  autoOpenLastUser: false,
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  version: CONFIG_VERSION,
  site: {
    title: { zh: 'GitHub 收藏图库', en: 'GitHub Stars Gallery' },
    subtitle: { zh: '一眼看懂、按类浏览你的 Star', en: 'See what your stars are, by category' },
    logo: '★',
    sourceUrl: 'https://github.com/godfay-g/github-stars-gallery',
  },
  defaultUser: '',
  exampleUser: '',
  accentColor: '#6ea8fe',
  hidePatInput: false,
  basePath: '',
  defaults: DEFAULT_PREFS,
  categoriesMode: 'merge',
  categories: DEFAULT_CATEGORIES,
}

export function emptyLocalSettings(): LocalSettings {
  return { version: CONFIG_VERSION, prefs: {}, overrides: {}, tags: {} }
}

// ------------------------------------------------------------------ primitive validators

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export const USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
const CAT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const MAX_TEXT = 120
const MAX_LIST = 60
const MAX_CATEGORIES = 30
const MAX_REPO_KEY = 140

export function isUsername(v: unknown): v is string {
  return typeof v === 'string' && USERNAME_RE.test(v)
}

export function isColor(v: unknown): v is string {
  return typeof v === 'string' && COLOR_RE.test(v)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

/** Plain text, trimmed and length-capped; control chars stripped. */
export function cleanText(v: unknown, max = MAX_TEXT): string | undefined {
  if (typeof v !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return s.slice(0, max)
}

/** List of literal strings (A4: no regex, used only for substring / equality matching). */
export function cleanList(v: unknown, lower = true, max = MAX_LIST): string[] | undefined {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : undefined
  if (!arr) return undefined
  const out: string[] = []
  for (const x of arr) {
    const s = cleanText(x, 60)
    if (!s) continue
    const t = lower ? s.toLowerCase() : s
    if (!out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

function cleanI18n(v: unknown, fallback: I18nText): I18nText | undefined {
  if (typeof v === 'string') {
    const s = cleanText(v)
    return s ? { zh: s, en: s } : undefined
  }
  if (isObj(v)) {
    const zh = cleanText(v.zh)
    const en = cleanText(v.en)
    if (!zh && !en) return undefined
    return { zh: zh || en || fallback.zh, en: en || zh || fallback.en }
  }
  return undefined
}

function warnUnknown(o: Obj, known: readonly string[], path: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!known.includes(k) && k !== '$schema') errors.push(`${path}${k}: unknown field ignored`)
}

// ------------------------------------------------------------------ structured validators

const PREF_KEYS = ['lang', 'theme', 'view', 'sort', 'motion', 'density', 'maxNodesPerCategory', 'autoOpenLastUser'] as const

/** Returns only the valid fields (partial) — used for every layer so merging stays per-field. */
export function validatePrefs(raw: unknown, path = 'defaults.'): ValidationResult<Partial<Prefs>> {
  const errors: string[] = []
  const out: Partial<Prefs> = {}
  if (raw === undefined) return { value: out, errors }
  if (!isObj(raw)) return { value: out, errors: [`${path.replace(/\.$/, '')}: expected an object`] }
  warnUnknown(raw, PREF_KEYS, path, errors)
  const take = <K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) => {
    if (raw[k] === undefined) return
    if (v === undefined) errors.push(`${path}${k}: invalid value ${JSON.stringify(raw[k])}, using default`)
    else out[k] = v
  }
  take('lang', oneOf(raw.lang, LANG_PREFS))
  take('theme', oneOf(raw.theme, THEMES))
  take('view', oneOf(raw.view, VIEWS))
  take('sort', oneOf(raw.sort, SORTS))
  take('motion', oneOf(raw.motion, MOTIONS))
  take('density', oneOf(raw.density, DENSITIES))
  const n = raw.maxNodesPerCategory
  take(
    'maxNodesPerCategory',
    typeof n === 'number' && Number.isFinite(n)
      ? Math.round(Math.min(MAX_NODES_RANGE.max, Math.max(MAX_NODES_RANGE.min, n)))
      : undefined,
  )
  take('autoOpenLastUser', typeof raw.autoOpenLastUser === 'boolean' ? raw.autoOpenLastUser : undefined)
  return { value: out, errors }
}

const CAT_KEYS = ['id', 'label', 'color', 'keywords', 'topics', 'languages'] as const

/** Validate a category. `base` supplies fields not given (merge-by-id); returns null if unusable. */
export function validateCategory(raw: unknown, path: string, errors: string[], base?: CategoryRule): CategoryRule | null {
  if (!isObj(raw)) {
    errors.push(`${path}: expected an object, ignored`)
    return null
  }
  warnUnknown(raw, CAT_KEYS, `${path}.`, errors)
  const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
  if (!CAT_ID_RE.test(id)) {
    errors.push(`${path}.id: must be 1–32 chars of a-z, 0-9, "-" or "_"; category ignored`)
    return null
  }
  const label = cleanI18n(raw.label, base?.label ?? { zh: id, en: id })
  if (raw.label !== undefined && !label) errors.push(`${path}.label: invalid, using ${base ? 'previous' : 'id'}`)
  if (raw.color !== undefined && !isColor(raw.color)) errors.push(`${path}.color: expected #rgb or #rrggbb`)
  const list = (k: 'keywords' | 'topics' | 'languages', lower: boolean) => {
    if (raw[k] === undefined) return base?.[k] ?? []
    const v = cleanList(raw[k], lower)
    if (!v) {
      errors.push(`${path}.${k}: expected a list of strings`)
      return base?.[k] ?? []
    }
    return v
  }
  return {
    id,
    label: label ?? base?.label ?? { zh: id, en: id },
    color: isColor(raw.color) ? raw.color.toLowerCase() : (base?.color ?? '#8b949e'),
    keywords: list('keywords', true),
    topics: list('topics', true),
    languages: list('languages', false),
  }
}

/** Always keep an "other" fallback bucket last. */
export function ensureOther(list: CategoryRule[]): CategoryRule[] {
  const other = list.find((c) => c.id === OTHER_ID) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]
  return [...list.filter((c) => c.id !== OTHER_ID), other]
}

export function validateCategoryList(
  raw: unknown,
  path: string,
  errors: string[],
  base: CategoryRule[] = [],
  mode: 'merge' | 'replace' = 'replace',
): CategoryRule[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    errors.push(`${path}: expected an array, ignored`)
    return undefined
  }
  const out: CategoryRule[] = mode === 'merge' ? base.map((c) => ({ ...c })) : []
  raw.slice(0, MAX_CATEGORIES).forEach((item, i) => {
    const id = isObj(item) && typeof item.id === 'string' ? item.id.trim().toLowerCase() : ''
    const idx = out.findIndex((c) => c.id === id)
    const prev = mode === 'merge' && idx >= 0 ? out[idx] : undefined
    const c = validateCategory(item, `${path}[${i}]`, errors, prev)
    if (!c) return
    if (idx >= 0) {
      if (mode === 'replace') errors.push(`${path}[${i}].id: duplicate "${id}", later one wins`)
      out[idx] = c
    } else out.push(c)
  })
  if (raw.length > MAX_CATEGORIES) errors.push(`${path}: more than ${MAX_CATEGORIES} categories, extra ignored`)
  return ensureOther(out)
}

// ------------------------------------------------------------------ migrations (A1 hook)

/** version N → N+1 migrations. Add entries here when the schema changes. */
export const MIGRATIONS: Record<number, (raw: Obj) => Obj> = {
  // 1: (raw) => ({ ...raw, version: 2 }),
}

export function migrate(raw: Obj, errors: string[]): Obj {
  let v = raw.version === undefined ? CONFIG_VERSION : raw.version
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    errors.push(`version: invalid ${JSON.stringify(raw.version)}, treated as ${CONFIG_VERSION}`)
    v = CONFIG_VERSION
  }
  let cur: Obj = { ...raw, version: v }
  while ((cur.version as number) < CONFIG_VERSION) {
    const step = MIGRATIONS[cur.version as number]
    if (!step) break
    cur = step(cur)
  }
  if ((cur.version as number) > CONFIG_VERSION) {
    errors.push(`version: ${String(cur.version)} is newer than this app (${CONFIG_VERSION}); reading what we understand`)
  }
  return cur
}

// ------------------------------------------------------------------ site config (config.json)

const SITE_KEYS = ['$schema', 'version', 'site', 'defaultUser', 'exampleUser', 'accentColor', 'hidePatInput', 'basePath', 'defaults', 'categoriesMode', 'categories'] as const

export type SiteConfigLayer = {
  /** Fully resolved site config (built-in defaults filled in). */
  config: SiteConfig
  /** Only the prefs explicitly present in the file — needed for per-field layering. */
  prefs: Partial<Prefs>
}

export function validateSiteConfig(raw: unknown): ValidationResult<SiteConfigLayer> {
  const errors: string[] = []
  const base = DEFAULT_SITE_CONFIG
  if (raw === undefined || raw === null) return { value: { config: base, prefs: {} }, errors }
  if (!isObj(raw)) return { value: { config: base, prefs: {} }, errors: ['config: expected a JSON object, using defaults'] }
  const o = migrate(raw, errors)
  warnUnknown(o, SITE_KEYS, '', errors)

  const site = { ...base.site }
  if (o.site !== undefined) {
    if (!isObj(o.site)) errors.push('site: expected an object')
    else {
      warnUnknown(o.site, ['title', 'subtitle', 'logo', 'sourceUrl'], 'site.', errors)
      const title = cleanI18n(o.site.title, base.site.title)
      if (title) site.title = title
      else if (o.site.title !== undefined) errors.push('site.title: invalid')
      const sub = cleanI18n(o.site.subtitle, base.site.subtitle)
      if (sub) site.subtitle = sub
      else if (o.site.subtitle !== undefined) errors.push('site.subtitle: invalid')
      if (o.site.logo !== undefined) {
        const logo = cleanText(o.site.logo, 300)
        if (logo !== undefined && (logo.length <= 4 || isSafeUrl(logo))) site.logo = logo
        else errors.push('site.logo: expected a short text/emoji or an http(s)/relative image URL')
      }
      if (o.site.sourceUrl !== undefined) {
        const u = cleanText(o.site.sourceUrl, 300)
        if (u === '' || (u && /^https?:\/\//.test(u) && isSafeUrl(u))) site.sourceUrl = u
        else errors.push('site.sourceUrl: expected an http(s) URL or ""')
      }
    }
  }

  const user = (k: 'defaultUser' | 'exampleUser'): string => {
    const v = o[k]
    if (v === undefined || v === '') return ''
    if (isUsername(v)) return v
    errors.push(`${k}: "${String(v)}" is not a valid GitHub username, ignored`)
    return ''
  }
  const accent = o.accentColor === undefined ? base.accentColor : isColor(o.accentColor) ? o.accentColor : (errors.push('accentColor: expected #rgb or #rrggbb'), base.accentColor)
  const hidePat = o.hidePatInput === undefined ? false : typeof o.hidePatInput === 'boolean' ? o.hidePatInput : (errors.push('hidePatInput: expected true/false'), false)
  let basePath = ''
  if (o.basePath !== undefined) {
    const bp = cleanText(o.basePath, 200)
    if (bp !== undefined && (bp === '' || /^\/[A-Za-z0-9._~\-/]*$/.test(bp))) basePath = bp
    else errors.push('basePath: expected "" or an absolute path like "/starhub/"')
  }
  const prefs = validatePrefs(o.defaults)
  errors.push(...prefs.errors)
  const mode = o.categoriesMode === undefined ? 'merge' : oneOf(o.categoriesMode, ['merge', 'replace'] as const) ?? (errors.push('categoriesMode: expected "merge" or "replace"'), 'merge')
  const cats = validateCategoryList(o.categories, 'categories', errors, DEFAULT_CATEGORIES, mode)

  return {
    value: {
      config: {
        version: CONFIG_VERSION,
        site,
        defaultUser: user('defaultUser'),
        exampleUser: user('exampleUser'),
        accentColor: accent,
        hidePatInput: hidePat,
        basePath,
        defaults: { ...DEFAULT_PREFS, ...prefs.value },
        categoriesMode: mode,
        categories: cats ?? DEFAULT_CATEGORIES,
      },
      prefs: prefs.value,
    },
    errors,
  }
}

/** Parse config.json text; bad JSON never throws (A2). */
export function parseSiteConfigText(text: string | null): ValidationResult<SiteConfigLayer> {
  if (text == null) return validateSiteConfig(undefined)
  try {
    return validateSiteConfig(JSON.parse(text))
  } catch (e) {
    const r = validateSiteConfig(undefined)
    return { value: r.value, errors: [`config.json is not valid JSON (${(e as Error).message}); using defaults`] }
  }
}

function isSafeUrl(u: string): boolean {
  if (/^\s*(javascript|data|vbscript):/i.test(u)) return false
  return /^(https?:\/\/|\.{0,2}\/)[^\s"'<>]*$/.test(u)
}

// ------------------------------------------------------------------ local settings (localStorage / import file)

const LOCAL_KEYS = ['version', 'prefs', 'categories', 'overrides', 'tags', 'kind', 'exportedAt'] as const

export function validateLocalSettings(raw: unknown): ValidationResult<LocalSettings> {
  const errors: string[] = []
  const out = emptyLocalSettings()
  if (raw === undefined || raw === null) return { value: out, errors }
  if (!isObj(raw)) return { value: out, errors: ['settings: expected a JSON object'] }
  const o = migrate(raw, errors)
  warnUnknown(o, LOCAL_KEYS, '', errors)
  const p = validatePrefs(o.prefs, 'prefs.')
  out.prefs = p.value
  errors.push(...p.errors)
  const cats = validateCategoryList(o.categories, 'categories', errors)
  if (cats) out.categories = cats
  if (o.overrides !== undefined) {
    if (!isObj(o.overrides)) errors.push('overrides: expected an object')
    else
      for (const [k, v] of Object.entries(o.overrides).slice(0, 5000)) {
        if (k.length <= MAX_REPO_KEY && /^[^/\s]+\/[^/\s]+$/.test(k) && typeof v === 'string' && CAT_ID_RE.test(v)) out.overrides[k] = v
        else errors.push(`overrides.${k}: invalid, ignored`)
      }
  }
  if (o.tags !== undefined) {
    if (!isObj(o.tags)) errors.push('tags: expected an object')
    else
      for (const [k, v] of Object.entries(o.tags).slice(0, 5000)) {
        const list = cleanList(v, false, 20)
        if (k.length <= MAX_REPO_KEY && /^[^/\s]+\/[^/\s]+$/.test(k) && list) {
          if (list.length) out.tags[k] = list
        } else errors.push(`tags.${k}: invalid, ignored`)
      }
  }
  return { value: out, errors }
}

export function parseLocalSettingsText(text: string | null): ValidationResult<LocalSettings> {
  if (!text) return validateLocalSettings(undefined)
  try {
    return validateLocalSettings(JSON.parse(text))
  } catch (e) {
    return { value: emptyLocalSettings(), errors: [`settings are not valid JSON (${(e as Error).message})`] }
  }
}

/** Export payload for "导出配置". A3: never includes a token — there is no field for it. */
export function exportLocalSettings(s: LocalSettings): string {
  const clean = validateLocalSettings(s).value
  return JSON.stringify({ kind: 'github-stars-gallery/settings', exportedAt: new Date().toISOString(), ...clean }, null, 2)
}

// ------------------------------------------------------------------ URL state

const LIST_MAX = 20

export function parseUrlState(search: string): ValidationResult<UrlState> {
  const errors: string[] = []
  const p = new URLSearchParams(search)
  const s: UrlState = {}
  const bad = (k: string) => errors.push(`?${k}= ignored (invalid)`)
  const user = p.get('user')?.trim().replace(/^@/, '')
  if (user) isUsername(user) ? (s.user = user) : bad('user')
  const view = p.get('view')
  if (view) {
    const v = view === 'cards' ? 'card' : view
    oneOf(v, VIEWS) ? (s.view = v as View) : bad('view')
  }
  const lang = p.get('lang')
  if (lang) oneOf(lang, ['zh', 'en'] as const) ? (s.lang = lang as Locale) : bad('lang')
  const theme = p.get('theme')
  if (theme) oneOf(theme, THEMES) ? (s.theme = theme as Theme) : bad('theme')
  const sort = p.get('sort')
  if (sort) oneOf(sort, SORTS) ? (s.sort = sort as Sort) : bad('sort')
  const q = p.get('q')
  if (q) s.q = cleanText(q, 200)
  const list = (k: string, lower: boolean) => {
    const v = p.get(k)
    if (!v) return undefined
    return cleanList(v, lower, LIST_MAX)
  }
  const lf = list('lang_filter', false)
  if (lf?.length) s.langFilter = lf
  const topics = list('topics', true)
  if (topics?.length) s.topics = topics
  const cat = list('cat', true)?.filter((c) => CAT_ID_RE.test(c))
  if (cat?.length) s.cat = cat
  return { value: s, errors }
}

/**
 * Serialize shareable state. Fields equal to `defaults` are omitted to keep links short.
 * A3: there is intentionally no way to put a token in here.
 */
export function serializeUrlState(s: UrlState, defaults?: Partial<Pick<UrlState, 'view' | 'sort'>>): string {
  const p = new URLSearchParams()
  if (s.user && isUsername(s.user)) p.set('user', s.user)
  if (s.view && s.view !== defaults?.view) p.set('view', s.view)
  if (s.lang) p.set('lang', s.lang)
  if (s.theme) p.set('theme', s.theme)
  if (s.q?.trim()) p.set('q', s.q.trim().slice(0, 200))
  if (s.langFilter?.length) p.set('lang_filter', s.langFilter.slice(0, LIST_MAX).join(','))
  if (s.topics?.length) p.set('topics', s.topics.slice(0, LIST_MAX).join(','))
  if (s.cat?.length) p.set('cat', s.cat.slice(0, LIST_MAX).join(','))
  if (s.sort && s.sort !== defaults?.sort) p.set('sort', s.sort)
  const out = p.toString()
  return out ? `?${out.replace(/%2C/g, ',')}` : ''
}

// ------------------------------------------------------------------ layering (A5)

/** Per-field merge: later layers win only for the fields they actually define. */
export function resolvePrefs(...layers: (Partial<Prefs> | undefined)[]): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS }
  for (const layer of layers) {
    if (!layer) continue
    for (const k of PREF_KEYS) {
      const v = layer[k]
      if (v !== undefined) (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

/** URL → prefs layer (only the fields the URL can carry). */
export function urlPrefs(u: UrlState): Partial<Prefs> {
  const p: Partial<Prefs> = {}
  if (u.lang) p.lang = u.lang
  if (u.theme) p.theme = u.theme
  if (u.view) p.view = u.view
  if (u.sort) p.sort = u.sort
  return p
}

/** Categories: local custom list > config.json (already merged onto built-ins) > built-in. */
export function resolveCategories(site: SiteConfig, local: LocalSettings): CategoryRule[] {
  return ensureOther(local.categories ?? site.categories ?? DEFAULT_CATEGORIES)
}

export function resolveLocale(pref: LangPref, navigatorLang = 'zh'): Locale {
  if (pref !== 'auto') return pref
  return navigatorLang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** Which user (if any) to open on first load (A6). Never guesses — no user means the welcome page. */
export function initialUser(url: UrlState, prefs: Prefs, recent: string[], site: SiteConfig): string {
  if (url.user) return url.user
  if (prefs.autoOpenLastUser && recent[0] && isUsername(recent[0])) return recent[0]
  return site.defaultUser || ''
}

// ------------------------------------------------------------------ categorisation (shared with CLI)

export type RepoLike = {
  full_name: string
  description?: string | null
  topics?: string[]
  language?: string | null
}

/**
 * Score: topic exact match 3, keyword substring 2, language exact 1. Ties go to the earlier
 * category (list order = priority). No match → "other". Manual overrides win if the id exists.
 */
export function categorize(repo: RepoLike, rules: CategoryRule[], overrides?: Record<string, string>): string {
  const ov = overrides?.[repo.full_name]
  if (ov && rules.some((r) => r.id === ov)) return ov
  const topics = new Set((repo.topics ?? []).map((t) => t.toLowerCase()))
  const text = [repo.full_name, repo.description ?? '', (repo.topics ?? []).join(' '), repo.language ?? ''].join(' ').toLowerCase()
  const lang = (repo.language ?? '').toLowerCase()
  let best = OTHER_ID
  let bestScore = 0
  for (const rule of rules) {
    if (rule.id === OTHER_ID) continue
    let score = 0
    for (const t of rule.topics) if (topics.has(t.toLowerCase())) score += 3
    for (const kw of rule.keywords) if (kw && text.includes(kw.toLowerCase())) score += 2
    if (lang && rule.languages.some((l) => l.toLowerCase() === lang)) score += 1
    if (score > bestScore) {
      best = rule.id
      bestScore = score
    }
  }
  return best
}

export function labelOf(rule: CategoryRule | undefined, locale: Locale, fallback = ''): string {
  return rule ? rule.label[locale] || rule.label.en || rule.label.zh : fallback
}
