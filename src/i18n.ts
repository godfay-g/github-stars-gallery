import type { Locale } from './lib/format'

export type Dict = {
  brand: string
  load: string
  loading: string
  refresh: string
  searchPlaceholder: string
  allLanguages: string
  allTopics: string
  allCategories: string
  catMultiHint: string
  catCurrent: string
  catRemove: string
  catClearAll: string
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
  mapTipExpand: string
  mapTipOpen: string
  mapTipBack: string
  mapMore: string
  clearFilters: string
  forks: string
}

const zh: Dict = {
  brand: 'GitHub 收藏图库',
  load: '开始整理',
  loading: '加载中…',
  refresh: '重新同步',
  searchPlaceholder: '搜仓库名、一句话简介或标签…',
  allLanguages: '全部语言',
  allTopics: '全部主题',
  allCategories: '全部',
  catMultiHint: '按住 ⌘/Ctrl 点击可多选',
  catCurrent: '当前：',
  catRemove: '移除「{name}」',
  catClearAll: '全部清除',
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
  localTags: '本地标签',
  saveTags: '保存',
  localeZh: '中文',
  localeEn: 'EN',
  apiRemaining: '接口余额',
  starMapHint: '点分类展开；拖动节点会弹回；按住 Ctrl/⌘ 滚动缩放（手机双指），双击空白回到全景',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomReset: '回到全景',
  backToMap: '返回星图总览',
  mapTipExpand: '点击展开这一类',
  mapTipOpen: '点击在 GitHub 打开',
  mapTipBack: '点击收起，回到全景',
  mapMore: '还有 {n} 个，见下方列表',
  clearFilters: '清除筛选',
  forks: 'Fork',
}

const en: Dict = {
  brand: 'GitHub Stars Gallery',
  load: 'Open gallery',
  loading: 'Loading…',
  refresh: 'Refresh',
  searchPlaceholder: 'Search name, one-liner, or tags…',
  allLanguages: 'All languages',
  allTopics: 'All topics',
  allCategories: 'All',
  catMultiHint: 'Hold ⌘/Ctrl to select several',
  catCurrent: 'Showing:',
  catRemove: 'Remove “{name}”',
  catClearAll: 'Clear all',
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
  localTags: 'Local tags',
  saveTags: 'Save',
  localeZh: '中文',
  localeEn: 'EN',
  apiRemaining: 'API left',
  starMapHint: 'Click a category to expand; drag nodes and they spring back; hold Ctrl/⌘ and scroll to zoom (pinch on touch); double-click empty space to fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Fit all',
  backToMap: 'Back to full map',
  mapTipExpand: 'Click to expand this category',
  mapTipOpen: 'Click to open on GitHub',
  mapTipBack: 'Click to collapse',
  mapMore: '{n} more — see the list below',
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
