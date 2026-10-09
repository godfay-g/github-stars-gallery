import { describe, expect, it } from 'vitest'
import { clickCategory, focusForSelection, isAdditiveClick, removeCategory, selectionFromMapFocus } from './catSelect'
import { renderCategoryPills, renderCurrentCategories } from '../ui/categoryPills'
import { parseUrlState, serializeUrlState } from '../config/schema'
import mainSource from '../main.ts?raw'

describe('category selection: plain click vs ⌘/Ctrl click', () => {
  it('plain click switches to that single category, clicking it again clears', () => {
    expect(clickCategory([], 'ai', false)).toEqual(['ai'])
    expect(clickCategory(['ai'], 'web', false)).toEqual(['web'])
    expect(clickCategory(['ai'], 'ai', false)).toEqual([])
    // plain click inside a multi-selection collapses to just that one
    expect(clickCategory(['ai', 'web'], 'ai', false)).toEqual(['ai'])
  })

  it('⌘/Ctrl click adds and removes (multi-select)', () => {
    expect(clickCategory(['ai'], 'web', true)).toEqual(['ai', 'web'])
    expect(clickCategory(['ai', 'web'], 'ai', true)).toEqual(['web'])
    expect(clickCategory([], 'ai', true)).toEqual(['ai'])
  })

  it('either modifier counts as additive', () => {
    expect(isAdditiveClick({ metaKey: true })).toBe(true)
    expect(isAdditiveClick({ ctrlKey: true })).toBe(true)
    expect(isAdditiveClick({})).toBe(false)
  })

  it('× removes one', () => {
    expect(removeCategory(['ai', 'web'], 'ai')).toEqual(['web'])
  })
})

describe('pills ↔ star map focus', () => {
  it('single → expand, multi → highlight only (no focus), none → overview', () => {
    expect(focusForSelection(['ai'])).toBe('ai')
    expect(focusForSelection(['ai', 'web'])).toBeNull()
    expect(focusForSelection([])).toBeNull()
  })

  it('map expand selects exactly that category; map back clears a single selection', () => {
    expect(selectionFromMapFocus([], 'ai')).toEqual(['ai'])
    expect(selectionFromMapFocus(['ai', 'web'], 'game')).toEqual(['game'])
    expect(selectionFromMapFocus(['ai'], null)).toEqual([])
    expect(selectionFromMapFocus(['ai', 'web'], null)).toEqual(['ai', 'web'])
  })

  it('round-trip: selection → focus → map event gives the same selection', () => {
    for (const sel of [[], ['ai']]) expect(selectionFromMapFocus(sel, focusForSelection(sel))).toEqual(sel)
  })
})

describe('?cat= restores (multi-)selection', () => {
  it('?cat=a,b round-trips and maps to highlight-only', () => {
    const cat = parseUrlState('?user=octocat&cat=ai,web').value.cat!
    expect(cat).toEqual(['ai', 'web'])
    expect(focusForSelection(cat)).toBeNull()
    expect(serializeUrlState({ user: 'octocat', cat })).toBe('?user=octocat&cat=ai,web')
    expect(focusForSelection(parseUrlState('?cat=ai').value.cat!)).toBe('ai')
  })
})

describe('single category entry', () => {
  const buckets = [
    { id: 'ai', label: 'AI', color: '#a371f7', count: 3 },
    { id: 'web', label: 'Web', color: '#58a6ff', count: 5 },
  ]
  const labels = { title: '智能分类', all: '全部', hint: 'hint' }

  it('pills start with "全部", mark selection with aria-pressed', () => {
    const html = renderCategoryPills(buckets, ['web'], labels, 8)
    expect(html.indexOf('data-cat-all')).toBeLessThan(html.indexOf('data-cat-pill'))
    expect(html).toMatch(/data-cat-all="1" aria-pressed="false"/)
    expect(html).toMatch(/data-cat-pill="web" aria-pressed="true"/)
    expect(html).toMatch(/data-cat-pill="ai" aria-pressed="false"/)
    expect(renderCategoryPills(buckets, [], labels, 8)).toMatch(/data-cat-all="1" aria-pressed="true"/)
    expect(html.match(/data-cat-selector/g)).toHaveLength(1)
  })

  it('current bar lists every selected category with its own ×', () => {
    expect(renderCurrentCategories([], { current: '当前：', remove: '移除{name}', clear: '清除' })).toBe('')
    const html = renderCurrentCategories(
      [
        { id: 'ai', label: 'AI / 机器学习', color: '#a', },
        { id: 'web', label: 'Web', color: '#b' },
      ],
      { current: '当前：', remove: '移除{name}', clear: '清除' },
    )
    expect(html).toContain('当前：')
    expect(html).toContain('AI / 机器学习')
    expect(html.match(/data-cat-remove=/g)).toHaveLength(2)
  })

  it('main.ts renders no second category chip row in the toolbar', () => {
    expect(mainSource).not.toMatch(/renderChipRow\(\s*'categories'/)
    expect(mainSource.match(/renderCategoryPills\(/g)).toHaveLength(1)
  })
})
