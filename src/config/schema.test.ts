import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_PREFS,
  DEFAULT_SITE_CONFIG,
  categorize,
  emptyLocalSettings,
  exportLocalSettings,
  initialUser,
  parseLocalSettingsText,
  parseSiteConfigText,
  parseUrlState,
  resolveCategories,
  resolvePrefs,
  serializeUrlState,
  urlPrefs,
  validateLocalSettings,
  validateSiteConfig,
  type CategoryRule,
} from './schema'
import { loadSiteConfig } from './store'
import { buildStandaloneHtml } from '../lib/standalone'
import repoConfigText from '../../public/config.json?raw'

describe('per-field merge priority (A5): URL > local > config.json > built-in', () => {
  it('each layer only overrides the fields it defines', () => {
    const file = validateSiteConfig({ defaults: { theme: 'light', view: 'list', motion: 'light' } }).value.prefs
    const local = { view: 'card' as const, density: 'compact' as const }
    const url = urlPrefs(parseUrlState('?theme=dark').value)
    const p = resolvePrefs(file, local, url)
    expect(p.theme).toBe('dark') // URL beats config.json
    expect(p.view).toBe('card') // local beats config.json
    expect(p.motion).toBe('light') // config.json beats built-in
    expect(p.density).toBe('compact') // local only
    expect(p.sort).toBe(DEFAULT_PREFS.sort) // nobody set it → built-in
    expect(p.maxNodesPerCategory).toBe(DEFAULT_PREFS.maxNodesPerCategory)
  })

  it('config.json prefs layer contains only fields present in the file', () => {
    const r = validateSiteConfig({ defaults: { lang: 'en' } })
    expect(r.value.prefs).toEqual({ lang: 'en' })
    expect(r.value.config.defaults).toEqual({ ...DEFAULT_PREFS, lang: 'en' })
  })

  it('no layers → built-in defaults', () => {
    expect(resolvePrefs()).toEqual(DEFAULT_PREFS)
    expect(resolvePrefs(undefined, {}, {})).toEqual(DEFAULT_PREFS)
  })

  it('local custom categories beat config.json categories', () => {
    const site = validateSiteConfig({ categoriesMode: 'replace', categories: [{ id: 'a', keywords: ['x'] }] }).value.config
    expect(resolveCategories(site, emptyLocalSettings()).map((c) => c.id)).toEqual(['a', 'other'])
    const local = validateLocalSettings({ categories: [{ id: 'b', keywords: ['y'] }] }).value
    expect(resolveCategories(site, local).map((c) => c.id)).toEqual(['b', 'other'])
  })
})

describe('config.json validation (A2)', () => {
  it('bad JSON → defaults + friendly error, never throws', () => {
    const r = parseSiteConfigText('{ "site": ')
    expect(r.value.config).toEqual(DEFAULT_SITE_CONFIG)
    expect(r.errors[0]).toMatch(/not valid JSON/)
  })

  it('non-object root → defaults', () => {
    expect(validateSiteConfig([1, 2]).value.config).toEqual(DEFAULT_SITE_CONFIG)
    expect(validateSiteConfig('x').errors.length).toBe(1)
  })

  it('drops unknown fields and falls back on invalid values, keeping the valid ones', () => {
    const r = validateSiteConfig({
      version: 1,
      evil: '<script>',
      site: { title: { zh: '我的星', en: 'My stars' }, logo: 'javascript:alert(1)', extra: 1 },
      defaultUser: 'not a user!',
      exampleUser: 'octocat',
      accentColor: 'red',
      hidePatInput: 'yes',
      basePath: 'relative/path',
      defaults: { theme: 'neon', view: 'card', maxNodesPerCategory: 99999 },
    })
    const c = r.value.config
    expect(c).not.toHaveProperty('evil')
    expect(c.site.title.en).toBe('My stars')
    expect(c.site.logo).toBe(DEFAULT_SITE_CONFIG.site.logo)
    expect(c.defaultUser).toBe('')
    expect(c.exampleUser).toBe('octocat')
    expect(c.accentColor).toBe(DEFAULT_SITE_CONFIG.accentColor)
    expect(c.hidePatInput).toBe(false)
    expect(c.basePath).toBe('')
    expect(c.defaults.theme).toBe(DEFAULT_PREFS.theme)
    expect(c.defaults.view).toBe('card')
    expect(c.defaults.maxNodesPerCategory).toBe(400) // clamped
    const joined = r.errors.join('\n')
    for (const k of ['evil', 'site.extra', 'site.logo', 'defaultUser', 'accentColor', 'hidePatInput', 'basePath', 'theme']) {
      expect(joined).toContain(k)
    }
  })

  it('categories: merge by id onto built-ins, keep "other" last, reject bad ids', () => {
    const r = validateSiteConfig({
      categories: [
        { id: 'ai', label: '人工智能', color: '#abc' },
        { id: 'robotics', label: { zh: '机器人', en: 'Robotics' }, keywords: ['ROS', 'robot'] },
        { id: 'Bad Id!' },
      ],
    })
    const ids = r.value.config.categories.map((c) => c.id)
    expect(ids[0]).toBe('ai')
    expect(ids).toContain('robotics')
    expect(ids.at(-1)).toBe('other')
    expect(ids).not.toContain('bad id!')
    const ai = r.value.config.categories[0]
    expect(ai.label.zh).toBe('人工智能')
    expect(ai.keywords).toEqual(DEFAULT_CATEGORIES[0].keywords) // merged, not wiped
    const robotics = r.value.config.categories.find((c) => c.id === 'robotics')!
    expect(robotics.keywords).toEqual(['ros', 'robot'])
    expect(r.errors.some((e) => e.includes('categories[2].id'))).toBe(true)
  })

  it('version: missing = current, newer warns, garbage warns; migration hook runs', () => {
    expect(validateSiteConfig({}).errors).toEqual([])
    expect(validateSiteConfig({ version: CONFIG_VERSION + 1 }).errors[0]).toMatch(/newer/)
    expect(validateSiteConfig({ version: 'x' }).errors[0]).toMatch(/version/)
  })

  it('accepts the $schema hint field', () => {
    expect(validateSiteConfig({ $schema: './config.schema.json' }).errors).toEqual([])
  })
})

describe('loadSiteConfig (F1: relative fetch, no-cache)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('404 → defaults, found=false, no error banner', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await loadSiteConfig()
    expect(fetchMock).toHaveBeenCalledWith('./config.json', { cache: 'no-cache' })
    expect(r.found).toBe(false)
    expect(r.errors).toEqual([])
    expect(r.value.config).toEqual(DEFAULT_SITE_CONFIG)
  })

  it('bad JSON body → defaults + error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{oops', { status: 200 })))
    const r = await loadSiteConfig()
    expect(r.found).toBe(true)
    expect(r.value.config).toEqual(DEFAULT_SITE_CONFIG)
    expect(r.errors[0]).toMatch(/not valid JSON/)
  })

  it('network error → defaults + error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const r = await loadSiteConfig()
    expect(r.value.config).toEqual(DEFAULT_SITE_CONFIG)
    expect(r.errors[0]).toMatch(/offline/)
  })

  it('valid partial file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ exampleUser: 'octocat', defaults: { view: 'list' } }))))
    const r = await loadSiteConfig()
    expect(r.value.config.exampleUser).toBe('octocat')
    expect(r.value.prefs).toEqual({ view: 'list' })
  })
})

describe('URL state round-trip', () => {
  it('parse → serialize → parse is stable', () => {
    const s = '?user=octocat&view=list&lang=en&theme=light&q=react%20hooks&lang_filter=TypeScript,Rust&topics=ai,cli&cat=web,ai&sort=stars'
    const a = parseUrlState(s).value
    expect(a).toEqual({
      user: 'octocat',
      view: 'list',
      lang: 'en',
      theme: 'light',
      q: 'react hooks',
      langFilter: ['TypeScript', 'Rust'],
      topics: ['ai', 'cli'],
      cat: ['web', 'ai'],
      sort: 'stars',
    })
    expect(parseUrlState(serializeUrlState(a)).value).toEqual(a)
  })

  it('view=cards alias, defaults omitted, invalid values dropped with errors', () => {
    expect(parseUrlState('?view=cards').value.view).toBe('card')
    expect(serializeUrlState({ user: 'a', view: 'map', sort: 'starred_at' }, { view: 'map', sort: 'starred_at' })).toBe('?user=a')
    const bad = parseUrlState('?user=-bad-&view=3d&theme=neon&sort=random&cat=Bad!')
    expect(bad.value).toEqual({})
    expect(bad.errors.length).toBe(4)
  })

  it('never carries a token (A3)', () => {
    const s = serializeUrlState({ user: 'a', ...({ token: 'ghp_secret' } as object) })
    expect(s).not.toContain('ghp_')
    expect(parseUrlState('?user=a&token=ghp_x&pat=1').value).toEqual({ user: 'a' })
  })
})

describe('custom category matching (A4: literal only)', () => {
  const rules: CategoryRule[] = [
    { id: 'robots', label: { zh: '机器人', en: 'Robots' }, color: '#f00', keywords: ['robot'], topics: ['ros'], languages: [] },
    { id: 'systems', label: { zh: '系统', en: 'Systems' }, color: '#0f0', keywords: [], topics: [], languages: ['Rust', 'C'] },
    { id: 'regexy', label: { zh: 'r', en: 'r' }, color: '#00f', keywords: ['.*'], topics: [], languages: [] },
    DEFAULT_CATEGORIES.at(-1)!,
  ]
  const repo = (p: Partial<{ full_name: string; description: string; topics: string[]; language: string }>) => ({
    full_name: 'o/x',
    description: '',
    topics: [],
    language: null,
    ...p,
  })

  it('topic > keyword > language scoring, ties to earlier rule', () => {
    expect(categorize(repo({ topics: ['ros'] }), rules)).toBe('robots')
    expect(categorize(repo({ description: 'A Robotics toolkit' }), rules)).toBe('robots')
    expect(categorize(repo({ language: 'rust' }), rules)).toBe('systems')
    expect(categorize(repo({ description: 'robot', language: 'Rust' }), rules)).toBe('robots')
  })

  it('no match → other', () => {
    expect(categorize(repo({ description: 'cooking recipes' }), rules)).toBe('other')
  })

  it('regex metacharacters are matched literally', () => {
    expect(categorize(repo({ description: 'anything at all' }), rules)).toBe('other')
    expect(categorize(repo({ description: 'glob .* pattern' }), rules)).toBe('regexy')
  })

  it('manual override wins when the category exists, ignored otherwise', () => {
    expect(categorize(repo({ topics: ['ros'] }), rules, { 'o/x': 'systems' })).toBe('systems')
    expect(categorize(repo({ topics: ['ros'] }), rules, { 'o/x': 'gone' })).toBe('robots')
  })
})

describe('local settings & import/export', () => {
  it('bad JSON in localStorage → empty settings + error', () => {
    const r = parseLocalSettingsText('not json')
    expect(r.value).toEqual(emptyLocalSettings())
    expect(r.errors[0]).toMatch(/not valid JSON/)
  })

  it('export never contains a token and re-imports cleanly', () => {
    const s = {
      ...emptyLocalSettings(),
      prefs: { theme: 'light' as const },
      overrides: { 'a/b': 'ai' },
      tags: { 'a/b': ['fav'] },
      token: 'ghp_secret',
    }
    const out = exportLocalSettings(s as never)
    expect(out).not.toMatch(/ghp_|token|pat/i)
    const back = parseLocalSettingsText(out)
    expect(back.errors).toEqual([])
    expect(back.value.prefs).toEqual({ theme: 'light' })
    expect(back.value.overrides).toEqual({ 'a/b': 'ai' })
    expect(back.value.tags).toEqual({ 'a/b': ['fav'] })
  })

  it('import drops invalid overrides/tags and unknown keys', () => {
    const r = validateLocalSettings({ prefs: { view: 'grid', motion: 'off' }, overrides: { 'no-slash': 'ai', 'a/b': 'BAD ID' }, junk: 1 })
    expect(r.value.prefs).toEqual({ motion: 'off' })
    expect(r.value.overrides).toEqual({})
    expect(r.errors.length).toBeGreaterThanOrEqual(4)
  })
})

describe('initial user (A6)', () => {
  const site = DEFAULT_SITE_CONFIG
  it('no URL user, no defaultUser → welcome page (empty)', () => {
    expect(initialUser({}, DEFAULT_PREFS, ['someone'], site)).toBe('')
  })
  it('URL user wins; auto-open last user only when opted in; then config defaultUser', () => {
    expect(initialUser({ user: 'u' }, DEFAULT_PREFS, ['r'], { ...site, defaultUser: 'd' })).toBe('u')
    expect(initialUser({}, { ...DEFAULT_PREFS, autoOpenLastUser: true }, ['r'], { ...site, defaultUser: 'd' })).toBe('r')
    expect(initialUser({}, DEFAULT_PREFS, ['r'], { ...site, defaultUser: 'd' })).toBe('d')
  })
  it("this repo's public/config.json does not set defaultUser", () => {
    const r = parseSiteConfigText(repoConfigText)
    expect(r.errors).toEqual([])
    expect(r.value.config.defaultUser).toBe('')
  })
})

describe('standalone HTML export uses the same rules', () => {
  it('embeds custom categories and assigns repos with them', () => {
    const rules = validateSiteConfig({ categoriesMode: 'replace', categories: [{ id: 'k', label: 'Kernel', keywords: ['kernel'] }] }).value.config.categories
    const html = buildStandaloneHtml({
      username: 'u',
      rules,
      locale: 'en',
      repos: [
        { full_name: 'a/linux', html_url: 'https://x', description: 'the kernel', language: 'C', stargazers_count: 1, topics: [], starred_at: '2024-01-01', owner_login: 'a' },
      ],
    })
    expect(html).toContain('Kernel')
    expect(html).toMatch(/"c":"k"/)
  })
})
