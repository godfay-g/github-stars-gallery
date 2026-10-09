import type { Locale } from './lib/format'

export type Dict = {
  brand: string
  tagline: string
  usernamePlaceholder: string
  load: string
  loading: string
  refresh: string
  searchPlaceholder: string
  allLanguages: string
  allTopics: string
  allCategories: string
  categories: string
  sortStarred: string
  sortStars: string
  sortUpdated: string
  sortName: string
  excludeForks: string
  map: string
  cards: string
  list: string
  exportJson: string
  exportHtml: string
  overview: string
  total: string
  topLanguages: string
  recentStars: string
  advanced: string
  pat: string
  patOk: string
  patTitle: string
  patBody: string
  patHint: string
  save: string
  cancel: string
  clearPat: string
  emptyTitle: string
  emptyBody: string
  emptyTry: string
  noMatchTitle: string
  noMatchBody: string
  shown: string
  starred: string
  enterUser: string
  fetching: string
  cacheHit: string
  page: string
  archived: string
  fork: string
  noDesc: string
  localTags: string
  saveTags: string
  localeZh: string
  localeEn: string
  apiRemaining: string
  starMapHint: string
  zoomIn: string
  zoomOut: string
  zoomReset: string
  backToMap: string
  clearFilters: string
  forks: string
}

const zh: Dict = {
  brand: 'GitHub 收藏图库',
  tagline: '一眼看懂、按类浏览你的 Star',
  usernamePlaceholder: '输入 GitHub 用户名开始整理收藏',
  load: '开始整理',
  loading: '加载中…',
  refresh: '重新同步',
  searchPlaceholder: '搜仓库名、一句话简介或标签…',
  allLanguages: '全部语言',
  allTopics: '全部主题',
  allCategories: '全部分类',
  categories: '智能分类',
  sortStarred: '最近收藏',
  sortStars: '最受欢迎',
  sortUpdated: '最近更新',
  sortName: '名称 A–Z',
  excludeForks: '隐藏 Fork',
  map: '星状图',
  cards: '卡片',
  list: '列表',
  exportJson: '导出 JSON',
  exportHtml: '导出网页',
  overview: '收藏概览',
  total: '共收藏',
  topLanguages: '语言分布',
  recentStars: '最近收藏',
  advanced: '高级设置',
  pat: '访问令牌',
  patOk: '已设置令牌',
  patTitle: '可选：GitHub 访问令牌',
  patBody: '只存在你的浏览器里，用来提高拉取上限。建议只读权限。',
  patHint: '未登录约 60 次/小时；有令牌约 5000 次/小时。',
  save: '保存',
  cancel: '取消',
  clearPat: '清除',
  emptyTitle: '输入 GitHub 用户名，开始整理收藏',
  emptyBody: '自动按「Web / AI / 工具」等分类，并用星状图一眼看清收藏结构。',
  emptyTry: '先试试',
  noMatchTitle: '没有找到匹配的项目',
  noMatchBody: '换个关键词，或清除筛选看看全部收藏。',
  shown: '正在看',
  starred: '全部收藏',
  enterUser: '输入用户名，开始逛图库。',
  fetching: '正在读取收藏…',
  cacheHit: '已用本地缓存',
  page: '第',
  archived: '已归档',
  fork: 'Fork',
  noDesc: '暂无简介',
  localTags: '本地标签',
  saveTags: '保存',
  localeZh: '中文',
  localeEn: 'EN',
  apiRemaining: '接口余额',
  starMapHint: '点分类展开该组仓库；滚轮缩放，拖动平移',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomReset: '复位',
  backToMap: '返回星图总览',
  clearFilters: '清除筛选',
  forks: 'Fork',
}

const en: Dict = {
  brand: 'GitHub Stars Gallery',
  tagline: 'See what you starred—by category, at a glance',
  usernamePlaceholder: 'Enter a GitHub username to organize stars',
  load: 'Open gallery',
  loading: 'Loading…',
  refresh: 'Refresh',
  searchPlaceholder: 'Search name, one-liner, or tags…',
  allLanguages: 'All languages',
  allTopics: 'All topics',
  allCategories: 'All categories',
  categories: 'Categories',
  sortStarred: 'Recently starred',
  sortStars: 'Most stars',
  sortUpdated: 'Recently updated',
  sortName: 'Name A–Z',
  excludeForks: 'Hide forks',
  map: 'Star map',
  cards: 'Cards',
  list: 'List',
  exportJson: 'Export JSON',
  exportHtml: 'Export HTML',
  overview: 'Overview',
  total: 'Starred',
  topLanguages: 'Languages',
  recentStars: 'Recently starred',
  advanced: 'Advanced',
  pat: 'Access token',
  patOk: 'Token saved',
  patTitle: 'Optional GitHub PAT',
  patBody: 'Stored only in your browser. Prefer a read-only token.',
  patHint: 'Anonymous ≈ 60 req/h · Authenticated ≈ 5,000 req/h.',
  save: 'Save',
  cancel: 'Cancel',
  clearPat: 'Clear',
  emptyTitle: 'Enter a GitHub username to organize stars',
  emptyBody: 'We auto-group into Web / AI / Tools and show a star map of your collection.',
  emptyTry: 'Try',
  noMatchTitle: 'No matches',
  noMatchBody: 'Try another keyword, or clear filters.',
  shown: 'Showing',
  starred: 'starred',
  enterUser: 'Enter a username to start.',
  fetching: 'Fetching stars…',
  cacheHit: 'Loaded from cache',
  page: 'Page',
  archived: 'archived',
  fork: 'fork',
  noDesc: 'No description',
  localTags: 'Local tags',
  saveTags: 'Save',
  localeZh: '中文',
  localeEn: 'EN',
  apiRemaining: 'API left',
  starMapHint: 'Click a category to expand; scroll to zoom, drag to pan',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Reset',
  backToMap: 'Back to full map',
  clearFilters: 'Clear filters',
  forks: 'Forks',
}

export function t(locale: Locale): Dict {
  return locale === 'zh' ? zh : en
}

const LOCALE_KEY = 'gsg:locale'

export function loadLocale(): Locale {
  const v = localStorage.getItem(LOCALE_KEY)
  return v === 'en' ? 'en' : 'zh'
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_KEY, locale)
}
