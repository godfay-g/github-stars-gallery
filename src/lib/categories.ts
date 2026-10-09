import type { StarredRepo } from '../types'
import type { Locale } from './format'

export type CategoryId =
  | 'ai' | 'web' | 'mobile' | 'infra' | 'data' | 'security' | 'tools' | 'game' | 'learn' | 'other'

export type CategoryDef = {
  id: CategoryId
  labelZh: string
  labelEn: string
  color: string
  priority: number
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'ai', labelZh: 'AI / 机器学习', labelEn: 'AI / ML', color: '#d2a8ff', priority: 100 },
  { id: 'web', labelZh: 'Web 前端', labelEn: 'Web', color: '#58a6ff', priority: 80 },
  { id: 'mobile', labelZh: '移动端', labelEn: 'Mobile', color: '#f778ba', priority: 75 },
  { id: 'infra', labelZh: '基础设施', labelEn: 'Infrastructure', color: '#ffa657', priority: 70 },
  { id: 'data', labelZh: '数据 / 存储', labelEn: 'Data', color: '#79c0ff', priority: 65 },
  { id: 'security', labelZh: '安全', labelEn: 'Security', color: '#f85149', priority: 85 },
  { id: 'tools', labelZh: '开发工具', labelEn: 'Tools', color: '#7ee787', priority: 50 },
  { id: 'game', labelZh: '游戏', labelEn: 'Games', color: '#e3b341', priority: 60 },
  { id: 'learn', labelZh: '学习资料', labelEn: 'Learning', color: '#3fb950', priority: 40 },
  { id: 'other', labelZh: '其他', labelEn: 'Other', color: '#8b949e', priority: 0 },
]

const RULES: { id: CategoryId; topics: string[]; keywords: string[]; languages?: string[] }[] = [
  { id: 'ai', topics: ['ai','machine-learning','deep-learning','llm','nlp','computer-vision','pytorch','tensorflow','openai','chatgpt','generative-ai','transformers','diffusion'], keywords: ['llm','gpt','openai','langchain','pytorch','tensorflow','machine learning','deep learning','neural','diffusion','agent','rag'], languages: ['Jupyter Notebook'] },
  { id: 'security', topics: ['security','cryptography','privacy','authentication','vulnerability','pentest'], keywords: ['security','crypto','cve','auth','oauth','pentest','malware'] },
  { id: 'web', topics: ['frontend','react','vue','angular','nextjs','svelte','css','html','web','ui','typescript','javascript'], keywords: ['react','vue','next.js','frontend','tailwind','webpack','vite'], languages: ['TypeScript','JavaScript','HTML','CSS','Vue'] },
  { id: 'mobile', topics: ['android','ios','flutter','react-native','mobile','swiftui'], keywords: ['android','ios','flutter','react native','mobile'], languages: ['Swift','Kotlin','Dart','Objective-C'] },
  { id: 'infra', topics: ['docker','kubernetes','devops','terraform','ci','aws','cloud','infrastructure','ansible','helm'], keywords: ['docker','kubernetes','k8s','terraform','devops','ci/cd','infra','cloud'], languages: ['HCL','Dockerfile'] },
  { id: 'data', topics: ['database','sql','postgres','mysql','redis','elasticsearch','mongodb','analytics'], keywords: ['database','postgres','mysql','redis','sql','etl'] },
  { id: 'game', topics: ['game','gamedev','unity','godot','unreal'], keywords: ['game','unity','godot','unreal'] },
  { id: 'learn', topics: ['awesome','tutorial','documentation','ebook','course','learning','guide'], keywords: ['awesome','tutorial','handbook','guide','cheat sheet'] },
  { id: 'tools', topics: ['cli','devtools','vscode','tool','utility','sdk','library'], keywords: ['cli','tool','vscode','linter','formatter','sdk'], languages: ['Shell','Go','Rust'] },
]

function haystack(r: StarredRepo): string {
  return [r.full_name, r.description ?? '', r.topics.join(' '), r.language ?? ''].join(' ').toLowerCase()
}

export function categorizeRepo(r: StarredRepo): CategoryId {
  const topics = new Set(r.topics.map((t) => t.toLowerCase()))
  const text = haystack(r)
  let best: { id: CategoryId; score: number } | null = null
  for (const rule of RULES) {
    const def = CATEGORIES.find((c) => c.id === rule.id)!
    let score = 0
    for (const t of rule.topics) if (topics.has(t)) score += 3
    for (const kw of rule.keywords) if (text.includes(kw)) score += 2
    if (rule.languages && r.language && rule.languages.includes(r.language)) score += 1
    if (score > 0) {
      const weighted = score * 100 + def.priority
      if (!best || weighted > best.score) best = { id: rule.id, score: weighted }
    }
  }
  return best?.id ?? 'other'
}

export type CategoryBucket = { id: CategoryId; label: string; color: string; repos: StarredRepo[] }

export function buildCategoryBuckets(repos: StarredRepo[], locale: Locale): CategoryBucket[] {
  const map = new Map<CategoryId, StarredRepo[]>()
  for (const c of CATEGORIES) map.set(c.id, [])
  for (const r of repos) map.get(categorizeRepo(r))!.push(r)
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: locale === 'zh' ? c.labelZh : c.labelEn,
    color: c.color,
    repos: map.get(c.id) ?? [],
  })).filter((b) => b.repos.length > 0)
}

export function categoryLabel(id: CategoryId, locale: Locale): string {
  const c = CATEGORIES.find((x) => x.id === id)
  if (!c) return id
  return locale === 'zh' ? c.labelZh : c.labelEn
}

export function categoryColor(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.color ?? '#8b949e'
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
