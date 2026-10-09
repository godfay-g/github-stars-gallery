/**
 * The ONE category selector on the page (overview pills) plus the "当前：… ×" bar above results.
 * Pure string builders so they can be unit-tested without a DOM.
 */
import { escapeHtml } from '../lib/html'

export type PillBucket = { id: string; label: string; color: string; count: number }

export type PillLabels = { title: string; all: string; hint: string }

export function renderCategoryPills(buckets: PillBucket[], selected: string[], labels: PillLabels, total: number): string {
  const sel = new Set(selected)
  const none = sel.size === 0
  return `<div class="overview-card cat-card" id="cat-card">
    <div class="cat-card-head">
      <h3 id="cat-pills-title">${escapeHtml(labels.title)}</h3>
      <span class="muted cat-hint">${escapeHtml(labels.hint)}</span>
    </div>
    <div class="cat-pills" role="group" aria-labelledby="cat-pills-title" data-cat-selector="1">
      <button type="button" class="cat-pill cat-pill-all ${none ? 'active' : ''}" data-cat-all="1" aria-pressed="${none}" style="--c:var(--accent)">
        <span class="cat-count">${total}</span>${escapeHtml(labels.all)}
      </button>
      ${buckets
        .map(
          (b) => `<button type="button" class="cat-pill ${sel.has(b.id) ? 'active' : ''}" data-cat-pill="${escapeHtml(b.id)}" aria-pressed="${sel.has(b.id)}" style="--c:${escapeHtml(b.color)}">
        <span class="cat-count">${b.count}</span>${escapeHtml(b.label)}
      </button>`,
        )
        .join('')}
    </div>
  </div>`
}

export function renderCurrentCategories(
  selected: { id: string; label: string; color: string }[],
  labels: { current: string; remove: string; clear: string },
): string {
  if (!selected.length) return ''
  return `<div class="cat-current" id="cat-current" role="status">
    <span class="muted">${escapeHtml(labels.current)}</span>
    ${selected
      .map(
        (s) => `<span class="cat-current-tag" style="--c:${escapeHtml(s.color)}">${escapeHtml(s.label)}<button type="button" class="cat-current-x" data-cat-remove="${escapeHtml(s.id)}" aria-label="${escapeHtml(labels.remove.replace('{name}', s.label))}" title="${escapeHtml(labels.remove.replace('{name}', s.label))}">×</button></span>`,
      )
      .join('')}
    ${selected.length > 1 ? `<button type="button" class="btn btn-ghost cat-current-clear" data-cat-all="1">${escapeHtml(labels.clear)}</button>` : ''}
  </div>`
}

/** Keep pill state in sync without re-rendering the overview (used on every filter change). */
export function syncPillsDom(root: ParentNode, selected: string[]): void {
  const sel = new Set(selected)
  for (const pill of root.querySelectorAll<HTMLElement>('[data-cat-pill]')) {
    const on = sel.has(pill.dataset.catPill ?? '')
    pill.classList.toggle('active', on)
    pill.setAttribute('aria-pressed', String(on))
  }
  const all = root.querySelector<HTMLElement>('.cat-pill-all')
  if (all) {
    all.classList.toggle('active', sel.size === 0)
    all.setAttribute('aria-pressed', String(sel.size === 0))
  }
}
