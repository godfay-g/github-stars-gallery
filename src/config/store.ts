/** Browser persistence + loading for configuration layers. All inputs go through schema validators. */
import {
  emptyLocalSettings,
  isUsername,
  parseLocalSettingsText,
  parseSiteConfigText,
  validateLocalSettings,
  type LocalSettings,
  type SiteConfigLayer,
  type Theme,
  type ValidationResult,
} from './schema'

const SETTINGS_KEY = 'gsg:settings'
const RECENT_KEY = 'gsg:recent'
/** Last resolved theme, read by the inline script in index.html before first paint (F2). */
export const THEME_CACHE_KEY = 'gsg:theme'
const LEGACY_LOCALE_KEY = 'gsg:locale'
const MAX_RECENT = 8

function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode / quota: settings just won't persist */
  }
}

export function loadLocalSettings(): ValidationResult<LocalSettings> {
  const r = parseLocalSettingsText(get(SETTINGS_KEY))
  // migrate the pre-settings language toggle
  const legacy = get(LEGACY_LOCALE_KEY)
  if (r.value.prefs.lang === undefined && (legacy === 'zh' || legacy === 'en')) r.value.prefs.lang = legacy
  return r
}

/** Persist prefs/categories/overrides. Tags live in their own key (state/tags.ts); tokens never here (A3). */
export function saveLocalSettings(s: LocalSettings): void {
  const clean = validateLocalSettings({ ...s, tags: {} }).value
  const { tags: _tags, ...rest } = clean
  void _tags
  set(SETTINGS_KEY, JSON.stringify(rest))
  set(LEGACY_LOCALE_KEY, null)
}

export function clearLocalSettings(): void {
  set(SETTINGS_KEY, null)
  set(LEGACY_LOCALE_KEY, null)
}

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(get(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(isUsername).slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export function pushRecent(user: string): string[] {
  if (!isUsername(user)) return loadRecent()
  const next = [user, ...loadRecent().filter((u) => u.toLowerCase() !== user.toLowerCase())].slice(0, MAX_RECENT)
  set(RECENT_KEY, JSON.stringify(next))
  return next
}

export function removeRecent(user: string): string[] {
  const next = loadRecent().filter((u) => u !== user)
  set(RECENT_KEY, JSON.stringify(next))
  return next
}

/**
 * F1: relative URL (works under any base path / repo name). 404, network error or bad JSON
 * all fall back to built-in defaults with a friendly error list — never a blank page (A2).
 */
export async function loadSiteConfig(url = './config.json'): Promise<ValidationResult<SiteConfigLayer> & { found: boolean }> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (res.status === 404) return { ...parseSiteConfigText(null), found: false }
    if (!res.ok) return { ...parseSiteConfigText(null), errors: [`config.json: HTTP ${res.status}, using defaults`], found: false }
    return { ...parseSiteConfigText(await res.text()), found: true }
  } catch (e) {
    return { ...parseSiteConfigText(null), errors: [`config.json could not be loaded (${(e as Error).message}); using defaults`], found: false }
  }
}

export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme, accent: string): void {
  const resolved = resolveTheme(theme)
  const html = document.documentElement
  html.dataset.theme = resolved
  html.style.setProperty('--accent', accent)
  html.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`)
  set(THEME_CACHE_KEY, resolved)
}

export { emptyLocalSettings }
