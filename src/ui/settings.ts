/**
 * Runtime settings panel. Lives on document.body (survives page re-renders) and applies every
 * change immediately through the SettingsCtx callbacks — nothing re-mounts the star map (F4).
 */
import type { SettingsCtx } from '../main'
import { tc } from '../i18n-config'
import { escapeHtml } from '../lib/html'
import { getCategories } from '../lib/categories'
import { downloadBlob } from '../lib/export'
import {
  DENSITIES,
  MAX_NODES_RANGE,
  MOTIONS,
  OTHER_ID,
  THEMES,
  VIEWS,
  cleanList,
  exportLocalSettings,
  isColor,
  parseLocalSettingsText,
  type CategoryRule,
  type Prefs,
} from '../config/schema'

let ctx: SettingsCtx | null = null
let host: HTMLDivElement | null = null
let notice: { kind: 'ok' | 'warn' | 'err'; text: string; list?: string[] } | null = null
let lastFocus: HTMLElement | null = null

export function openSettings(c: SettingsCtx): void {
  ctx = c
  notice = null
  if (!host) {
    lastFocus = document.activeElement as HTMLElement | null
    host = document.createElement('div')
    host.className = 'modal-backdrop settings-backdrop'
    host.id = 'settings-modal'
    document.body.appendChild(host)
    bind(host)
  }
  paint()
  host.querySelector<HTMLElement>('.settings-close')?.focus()
}

export function closeSettings(): void {
  host?.remove()
  host = null
  lastFocus?.focus?.()
}

/** Re-paint if open (e.g. locale switched in the header, or a card was re-assigned). */
export function refreshSettings(): void {
  if (host) paint()
}

function seg<T extends string>(name: string, values: readonly T[], current: T, label: (v: T) => string): string {
  return `<div class="seg" role="radiogroup">${values
    .map(
      (v) =>
        `<label class="seg-item ${v === current ? 'active' : ''}"><input type="radio" name="${name}" value="${v}" ${v === current ? 'checked' : ''}/>${escapeHtml(label(v))}</label>`,
    )
    .join('')}</div>`
}

function row(label: string, control: string): string {
  return `<div class="set-row"><div class="set-label">${escapeHtml(label)}</div><div class="set-control">${control}</div></div>`
}

function catEditor(rules: CategoryRule[], locale: 'zh' | 'en'): string {
  const cd = tc(locale)
  return rules
    .map((r, i) => {
      const other = r.id === OTHER_ID
      return `<div class="cat-edit" data-cat-index="${i}">
      <div class="cat-edit-head">
        <input type="color" value="${escapeHtml(expandHex(r.color))}" data-cat-field="color" aria-label="color"/>
        <input type="text" value="${escapeHtml(r.label.zh)}" data-cat-field="zh" placeholder="${escapeHtml(cd.catName)}" aria-label="${escapeHtml(cd.catName)}"/>
        <input type="text" value="${escapeHtml(r.label.en)}" data-cat-field="en" placeholder="${escapeHtml(cd.catNameEn)}" aria-label="${escapeHtml(cd.catNameEn)}"/>
        <code class="cat-id">${escapeHtml(r.id)}</code>
        <span class="cat-edit-actions">
          ${other ? '' : `<button type="button" class="btn btn-ghost" data-cat-act="up" title="${escapeHtml(cd.catUp)}" ${i === 0 ? 'disabled' : ''}>↑</button>`}
          ${other ? '' : `<button type="button" class="btn btn-ghost" data-cat-act="down" title="${escapeHtml(cd.catDown)}" ${i >= rules.length - 2 ? 'disabled' : ''}>↓</button>`}
          ${other ? '' : `<button type="button" class="btn btn-ghost danger" data-cat-act="del" title="${escapeHtml(cd.catDelete)}">✕</button>`}
        </span>
      </div>
      ${
        other
          ? ''
          : `<div class="cat-edit-lists">
        <label><span>${escapeHtml(cd.catKeywords)}</span><input type="text" value="${escapeHtml(r.keywords.join(', '))}" data-cat-field="keywords"/></label>
        <label><span>${escapeHtml(cd.catTopics)}</span><input type="text" value="${escapeHtml(r.topics.join(', '))}" data-cat-field="topics"/></label>
        <label><span>${escapeHtml(cd.catLanguages)}</span><input type="text" value="${escapeHtml(r.languages.join(', '))}" data-cat-field="languages"/></label>
      </div>`
      }
    </div>`
    })
    .join('')
}

function expandHex(c: string): string {
  return /^#[0-9a-f]{3}$/i.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c
}

function paint(): void {
  if (!host || !ctx) return
  const locale = ctx.locale()
  const cd = tc(locale)
  const p = ctx.prefs()
  const local = ctx.local()
  const scroll = host.querySelector('.settings-body')?.scrollTop ?? 0
  const nOverrides = Object.keys(local.overrides).length
  const viewLabel = (v: string) => (v === 'map' ? (locale === 'zh' ? '星图' : 'Map') : v === 'card' ? (locale === 'zh' ? '卡片' : 'Cards') : locale === 'zh' ? '列表' : 'List')
  const noticeHtml = notice
    ? `<div class="set-notice ${notice.kind}" role="status">${escapeHtml(notice.text)}${
        notice.list?.length ? `<ul>${notice.list.slice(0, 10).map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join('')}</ul>` : ''
      }</div>`
    : ''
  host.innerHTML = `
  <div class="modal settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="settings-head">
      <h2 id="settings-title">${escapeHtml(cd.settings)}</h2>
      <button type="button" class="btn btn-ghost settings-close" data-set-act="close" aria-label="${escapeHtml(cd.close)}">✕</button>
    </div>
    <div class="settings-body">
      ${noticeHtml}
      <section><h3>${escapeHtml(cd.secLook)}</h3>
        ${row(cd.theme, seg('theme', THEMES, p.theme, (v) => (v === 'dark' ? cd.themeDark : v === 'light' ? cd.themeLight : cd.themeSystem)))}
        ${row(cd.language, seg('lang', ['zh', 'en', 'auto'] as const, p.lang, (v) => (v === 'zh' ? '中文' : v === 'en' ? 'English' : cd.langAuto)))}
        ${row(cd.defaultView, seg('view', VIEWS, p.view, viewLabel))}
        ${row(cd.motion, seg('motion', MOTIONS, p.motion, (v) => (v === 'off' ? cd.motionOff : v === 'light' ? cd.motionLight : cd.motionStandard)))}
        ${row(cd.density, seg('density', DENSITIES, p.density, (v) => (v === 'compact' ? cd.densityCompact : cd.densityComfortable)))}
        ${row(
          cd.maxNodes,
          `<input type="range" min="${MAX_NODES_RANGE.min}" max="${MAX_NODES_RANGE.max}" step="10" value="${p.maxNodesPerCategory}" data-pref="maxNodesPerCategory"/> <output>${p.maxNodesPerCategory}</output>`,
        )}
        <label class="check-plain set-check"><input type="checkbox" data-pref="autoOpenLastUser" ${p.autoOpenLastUser ? 'checked' : ''}/> ${escapeHtml(cd.autoOpen)}</label>
      </section>
      <section><h3>${escapeHtml(cd.secCats)}</h3>
        <p class="muted">${escapeHtml(cd.catsHint)}</p>
        <div class="cat-list">${catEditor(getCategories(), locale)}</div>
        <div class="set-actions">
          <button type="button" class="btn" data-set-act="cat-add">${escapeHtml(cd.catAdd)}</button>
          <button type="button" class="btn btn-ghost" data-set-act="cat-reset" ${local.categories ? '' : 'disabled'}>${escapeHtml(cd.catResetDefaults)}</button>
        </div>
      </section>
      <section><h3>${escapeHtml(cd.secAssign)}</h3>
        <p class="muted">${escapeHtml(cd.assignHint)} ${escapeHtml(cd.assignCount.replace('{n}', String(nOverrides)))}</p>
        <button type="button" class="btn" data-set-act="assign-clear" ${nOverrides ? '' : 'disabled'}>${escapeHtml(cd.assignClear)}</button>
      </section>
      <section><h3>${escapeHtml(cd.secTags)}</h3>
        <p class="muted">${escapeHtml(cd.tagsCount.replace('{n}', String(ctx.tagsCount())))}</p>
        <button type="button" class="btn" data-set-act="tags-clear" ${ctx.tagsCount() ? '' : 'disabled'}>${escapeHtml(cd.tagsClear)}</button>
      </section>
      <section><h3>${escapeHtml(cd.secFile)}</h3>
        <p class="muted">${escapeHtml(cd.fileHint)}</p>
        <div class="set-actions">
          <button type="button" class="btn" data-set-act="export">${escapeHtml(cd.exportSettings)}</button>
          <label class="btn">${escapeHtml(cd.importSettings)}<input type="file" accept="application/json,.json" data-set-act="import" hidden/></label>
          <button type="button" class="btn danger" data-set-act="reset">${escapeHtml(cd.resetAll)}</button>
        </div>
      </section>
    </div>
  </div>`
  const body = host.querySelector('.settings-body')
  if (body) body.scrollTop = scroll
}

function currentRules(): CategoryRule[] {
  return getCategories().map((r) => ({ ...r, label: { ...r.label }, keywords: [...r.keywords], topics: [...r.topics], languages: [...r.languages] }))
}

function newId(rules: CategoryRule[]): string {
  let i = 1
  while (rules.some((r) => r.id === `custom-${i}`)) i++
  return `custom-${i}`
}

function bind(el: HTMLDivElement): void {
  el.addEventListener('click', (e) => {
    if (!ctx) return
    if (e.target === el) return closeSettings()
    const btn = (e.target as HTMLElement).closest?.('[data-set-act], [data-cat-act]') as HTMLElement | null
    if (!btn || btn instanceof HTMLInputElement) return
    const cd = tc(ctx.locale())
    const act = btn.dataset.setAct
    const catAct = btn.dataset.catAct
    if (catAct) {
      const idx = Number(btn.closest<HTMLElement>('[data-cat-index]')?.dataset.catIndex)
      const rules = currentRules()
      if (catAct === 'del') rules.splice(idx, 1)
      else if (catAct === 'up' && idx > 0) [rules[idx - 1], rules[idx]] = [rules[idx], rules[idx - 1]]
      else if (catAct === 'down' && idx < rules.length - 2) [rules[idx + 1], rules[idx]] = [rules[idx], rules[idx + 1]]
      ctx.setCategories(rules)
      return paint()
    }
    switch (act) {
      case 'close':
        return closeSettings()
      case 'cat-add': {
        const rules = currentRules()
        const id = newId(rules)
        const palette = ['#f778ba', '#56d364', '#e3b341', '#79c0ff', '#ff7b72', '#d2a8ff']
        rules.splice(rules.length - 1, 0, {
          id,
          label: { zh: `${cd.catNewName} ${id.slice(7)}`, en: `${tc('en').catNewName} ${id.slice(7)}` },
          color: palette[rules.length % palette.length],
          keywords: [],
          topics: [],
          languages: [],
        })
        ctx.setCategories(rules)
        paint()
        el.querySelector<HTMLInputElement>(`[data-cat-index="${rules.length - 2}"] [data-cat-field="zh"]`)?.focus()
        return
      }
      case 'cat-reset':
        ctx.setCategories(undefined)
        return paint()
      case 'assign-clear':
        ctx.clearOverrides()
        return paint()
      case 'tags-clear':
        ctx.clearTags()
        return paint()
      case 'export': {
        const payload = exportLocalSettings({ ...ctx.local(), categories: ctx.local().categories, tags: ctx.tags() })
        downloadBlob('github-stars-gallery-settings.json', new Blob([payload], { type: 'application/json' }))
        return
      }
      case 'reset':
        if (!window.confirm(cd.resetConfirm)) return
        ctx.resetAll()
        notice = { kind: 'ok', text: cd.saved }
        return paint()
    }
  })

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings()
  })

  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement
    if (t.dataset.pref === 'maxNodesPerCategory') {
      const out = t.nextElementSibling as HTMLOutputElement | null
      if (out) out.textContent = t.value
    }
  })

  el.addEventListener('change', (e) => {
    if (!ctx) return
    const t = e.target as HTMLInputElement
    const cd = tc(ctx.locale())
    if (t.type === 'radio') {
      ctx.setPref(t.name as keyof Prefs, t.value as never)
      return paint()
    }
    if (t.dataset.pref === 'maxNodesPerCategory') return ctx.setPref('maxNodesPerCategory', Number(t.value))
    if (t.dataset.pref === 'autoOpenLastUser') return ctx.setPref('autoOpenLastUser', t.checked)
    if (t.dataset.catField) {
      const idx = Number(t.closest<HTMLElement>('[data-cat-index]')?.dataset.catIndex)
      const rules = currentRules()
      const r = rules[idx]
      if (!r) return
      const f = t.dataset.catField
      if (f === 'color') {
        if (isColor(t.value)) r.color = t.value.toLowerCase()
      } else if (f === 'zh' || f === 'en') {
        const v = t.value.trim().slice(0, 40)
        if (v) r.label[f] = v
      } else if (f === 'keywords' || f === 'topics' || f === 'languages') {
        r[f] = cleanList(t.value.split(','), f !== 'languages') ?? []
      }
      ctx.setCategories(rules)
      return
    }
    if (t.dataset.setAct === 'import' && t.files?.[0]) {
      const file = t.files[0]
      void file.text().then((text) => {
        if (!ctx) return
        let parsedOk = true
        try {
          JSON.parse(text)
        } catch {
          parsedOk = false
        }
        const res = parseLocalSettingsText(text)
        if (!parsedOk || (res.errors.length && res.errors[0].startsWith('settings:'))) {
          notice = { kind: 'err', text: cd.importBad, list: res.errors }
        } else {
          ctx.importSettings(res.value)
          notice = res.errors.length ? { kind: 'warn', text: cd.importErrors, list: res.errors } : { kind: 'ok', text: cd.importOk }
        }
        paint()
      })
    }
  })
}

