export type Locale = 'zh' | 'en'

export function formatStars(n: number, locale: Locale): string {
  if (locale === 'zh') {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`
    if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}万`
    return n.toLocaleString('zh-CN')
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString('en-US')
}

export function formatRelative(iso: string, locale: Locale): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso.slice(0, 10)
  const diff = Date.now() - t
  const sec = Math.max(0, Math.floor(diff / 1000))
  const min = Math.floor(sec / 60)
  const hour = Math.floor(min / 60)
  const day = Math.floor(hour / 24)
  if (locale === 'zh') {
    if (sec < 60) return '刚刚'
    if (min < 60) return `${min} 分钟前`
    if (hour < 24) return `${hour} 小时前`
    if (day === 1) return '昨天'
    if (day < 7) return `${day} 天前`
    if (day < 30) return `${Math.floor(day / 7)} 周前`
    if (day < 365) return `${Math.floor(day / 30)} 个月前`
    return `${Math.floor(day / 365)} 年前`
  }
  if (sec < 60) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hour < 24) return `${hour}h ago`
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day}d ago`
  if (day < 30) return `${Math.floor(day / 7)}w ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

export function languageColor(lang: string | null): string {
  if (!lang) return '#8b949e'
  const map: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Go: '#00ADD8',
    Rust: '#dea584',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Vue: '#41b883',
    'Jupyter Notebook': '#DA5B0B',
  }
  if (map[lang]) return map[lang]
  let h = 0
  for (let i = 0; i < lang.length; i++) h = (h * 31 + lang.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 55% 55%)`
}
