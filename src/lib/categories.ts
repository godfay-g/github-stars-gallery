/**
 * Active category rules for the app (wraps the shared, pure `categorize` from config/schema).
 * Rules come from: local custom list > config.json > built-in (see resolveCategories).
 */
import type { StarredRepo } from '../types'
import type { Locale } from './format'
import { categorize, DEFAULT_CATEGORIES, labelOf, OTHER_ID, type CategoryRule } from '../config/schema'

export type CategoryId = string

let rules: CategoryRule[] = DEFAULT_CATEGORIES
let overrides: Record<string, string> = {}
let version = 0
const cache = new Map<number, string>()

/** Replace the active rules/overrides. Bumps `rulesVersion()` so views can refresh. */
export function setCategoryRules(next: CategoryRule[], nextOverrides: Record<string, string> = {}): void {
  rules = next
  overrides = nextOverrides
  cache.clear()
  version++
}

export function rulesVersion(): number {
  return version
}

export function getCategories(): CategoryRule[] {
  return rules
}

export function getOverrides(): Record<string, string> {
  return overrides
}

export function categorizeRepo(r: StarredRepo): CategoryId {
  let c = cache.get(r.id)
  if (c === undefined) {
    c = categorize(r, rules, overrides)
    cache.set(r.id, c)
  }
  return c
}

export type CategoryBucket = { id: CategoryId; label: string; color: string; repos: StarredRepo[] }

export function buildCategoryBuckets(repos: StarredRepo[], locale: Locale): CategoryBucket[] {
  const map = new Map<CategoryId, StarredRepo[]>()
  for (const c of rules) map.set(c.id, [])
  for (const r of repos) {
    const id = categorizeRepo(r)
    ;(map.get(id) ?? map.get(OTHER_ID)!).push(r)
  }
  return rules
    .map((c) => ({ id: c.id, label: labelOf(c, locale, c.id), color: c.color, repos: map.get(c.id) ?? [] }))
    .filter((b) => b.repos.length > 0)
}

export function categoryLabel(id: CategoryId, locale: Locale): string {
  return labelOf(rules.find((x) => x.id === id), locale, id)
}

export function categoryColor(id: CategoryId): string {
  return rules.find((c) => c.id === id)?.color ?? '#8b949e'
}

export function humanBlurb(r: StarredRepo, locale: Locale): string {
  const desc = r.description?.trim()
  if (desc) return desc.length > 140 ? `${desc.slice(0, 138)}…` : desc
  const name = r.full_name.split('/')[1] ?? r.full_name
  const lang = r.language
  const topics = r.topics.slice(0, 3)
  const cat = categoryLabel(categorizeRepo(r), locale)
  if (locale === 'zh') {
    const parts: string[] = []
    if (lang) parts.push(`用 ${lang} 写的`)
    parts.push(`「${name}」`)
    parts.push(`${cat.split(' / ')[0]}相关项目`)
    if (topics.length) parts.push(`，涉及 ${topics.join('、')}`)
    return parts.join('')
  }
  const bits = [lang ? `A ${lang} project` : 'A project', `called ${name}`, `(${cat})`]
  if (topics.length) bits.push(`about ${topics.join(', ')}`)
  return bits.join(' ')
}
