/**
 * Fluid star map.
 *
 * - Mounted once: the host element + SVG live for the whole session. Re-renders of the page
 *   only detach/re-attach `host`; filters call `setFilter()` which changes node targets
 *   (opacity / scale / home position) — never innerHTML of the map.
 * - Physics: d3-force (forceX/forceY towards "home", collide, many-body). We drive ticks
 *   ourselves from a single rAF loop, and per frame only write `transform` / `opacity`
 *   attributes on persistent SVG elements.
 * - Camera: own pan/zoom; Ctrl/⌘+wheel or trackpad pinch zooms at the cursor, plain wheel scrolls the page;
 *   touch: one finger scrolls the page (touch-action: pan-y), two fingers pan/zoom. Inertia, no CSS transitions.
 */
import { forceCollide, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force'
import type { StarredRepo } from '../types'
import { categorizeRepo, getCategories, humanBlurb, type CategoryId } from '../lib/categories'
import { labelOf, type Motion } from '../config/schema'
import { formatStars, languageColor, type Locale } from '../lib/format'
import { avatarUrl, escapeHtml } from '../lib/html'
import { boundsOf, capList, MAX_REPO_NODES, catRadius, exceedsThreshold, LOD_ZOOM, phyllotaxis, ringPositions, type Vec } from './layout'
import { dragIntent, wheelIntent } from './gestures'
import { clampK, decay, fitBounds, smoothing, toWorld, zoomAt, type Cam } from './camera'
import './starmap.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const REPO_R = 20
const REPO_SPACING = 44
const REPO_OFFSET = 3.2

type Kind = 'center' | 'cat' | 'repo' | 'more'

interface MNode extends SimulationNodeDatum {
  key: string
  kind: Kind
  cat?: CategoryId
  repo?: StarredRepo
  r: number
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  /** rendered opacity / target */
  op: number
  opT: number
  /** rendered scale / target / spring velocity */
  sc: number
  scT: number
  scV: number
  phase: number
  active: boolean
  parent: MNode | null
  releaseAt: number
  bvx: number
  bvy: number
  ox: number
  oy: number
  rx: number
  ry: number
  el: SVGGElement
  link: SVGLineElement | null
  lastOp: number
  dimmed: boolean
}

export type StarMapLabels = {
  back: string
  zoomIn: string
  zoomOut: string
  fit: string
  hint: string
  tipExpand: string
  tipOpen: string
  tipBack: string
  more: (n: number) => string
}

export type StarMapOptions = {
  locale: Locale
  labels: StarMapLabels
  onFocusChange: (cat: CategoryId | null) => void
  onMore: () => void
}

export type StarMapFilter = {
  /** Repos passing every filter except category, already sorted. */
  visible: StarredRepo[]
  selectedCats: string[]
}

type Mode = 'idle' | 'pending' | 'pan' | 'node' | 'pinch' | 'done'

export class StarMap {
  readonly host: HTMLDivElement
  private svg: SVGSVGElement
  private stage: SVGGElement
  private linkLayer: SVGGElement
  private nodeLayer: SVGGElement
  private tip: HTMLDivElement
  private backBtn: HTMLButtonElement
  private hintEl: HTMLParagraphElement

  private opts: StarMapOptions
  /** OS-level prefers-reduced-motion. */
  private sysReduced: boolean
  /** User setting: off = like reduced motion; light = no breathing; standard = everything. */
  private motion: Motion = 'standard'
  private maxNodes = MAX_REPO_NODES
  private animating = false
  private get reduced(): boolean {
    return this.sysReduced || this.motion === 'off'
  }
  private sim: Simulation<MNode, undefined>
  private nodes = new Map<string, MNode>()
  private center: MNode
  private repoCat = new Map<number, CategoryId>()
  private username = ''
  private repos: StarredRepo[] = []
  private filter: StarMapFilter = { visible: [], selectedCats: [] }
  private visibleByCat = new Map<CategoryId, StarredRepo[]>()
  focusCat: CategoryId | null = null

  private width = 800
  private height = 560
  private cam: Cam = { x: 400, y: 280, k: 1 }
  private camGoal: Cam | null = null
  private zoomGoal: { k: number; anchor: Vec } | null = null
  private inertia: Vec | null = null
  private lastCamStr = ''
  private lod = false
  /** True once the user pans/zooms by hand; until then filter changes re-fit the camera smoothly. */
  private userMoved = false

  private raf = 0
  private lastT = 0
  private attached = false
  private needsFit = true
  private simDirty = true
  private hover: MNode | null = null
  private hot = new Set<MNode>()

  private pointers = new Map<number, Vec>()
  private mode: Mode = 'idle'
  private downAt: Vec = { x: 0, y: 0 }
  private downNode: MNode | null = null
  private lastMove: Vec & { t: number } = { x: 0, y: 0, t: 0 }
  private vel: Vec = { x: 0, y: 0 }
  private pinch: { dist: number; mid: Vec; cam: Cam } | null = null

  private frameTimes: number[] = []
  /** JS time spent inside our frame callback (physics + attribute writes). */
  private frameCosts: number[] = []
  private ro: ResizeObserver
  private io: IntersectionObserver
  private inView = true

  constructor(opts: StarMapOptions) {
    this.opts = opts
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.sysReduced = mq.matches
    mq.addEventListener?.('change', (e) => {
      this.sysReduced = e.matches
      this.relayout()
    })

    this.host = document.createElement('div')
    this.host.className = 'sm-wrap'
    this.host.innerHTML = `
      <div class="sm-toolbar">
        <p class="muted sm-hint"></p>
        <div class="sm-actions">
          <button type="button" class="btn sm-back" data-sm="back"></button>
          <button type="button" class="btn" data-sm="in">＋</button>
          <button type="button" class="btn" data-sm="out">－</button>
          <button type="button" class="btn" data-sm="fit">⤢</button>
        </div>
      </div>
      <div class="sm-viewport">
        <svg class="sm-svg" xmlns="${SVG_NS}">
          <defs>
            <clipPath id="sm-clip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath>
            <radialGradient id="sm-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#f0c14b" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="#f0c14b" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <g class="sm-stage"><g class="sm-links"></g><g class="sm-nodes"></g></g>
        </svg>
        <div class="sm-tip" aria-hidden="true"><div class="sm-tip-card"></div></div>
      </div>`
    this.svg = this.host.querySelector('svg')!
    this.stage = this.host.querySelector('.sm-stage')!
    this.linkLayer = this.host.querySelector('.sm-links')!
    this.nodeLayer = this.host.querySelector('.sm-nodes')!
    this.tip = this.host.querySelector('.sm-tip')!
    this.backBtn = this.host.querySelector('.sm-back')!
    this.hintEl = this.host.querySelector('.sm-hint')!
    this.applyLabels()

    this.center = this.makeNode('center', 'center')
    this.center.r = 40
    this.center.fx = 0
    this.center.fy = 0
    this.center.active = true
    this.center.op = this.center.opT = 1
    this.center.sc = this.center.scT = 1

    this.sim = forceSimulation<MNode>([])
      .stop()
      .velocityDecay(0.28)
      .alphaDecay(0.018)
      .force('x', forceX<MNode>((d) => d.hx).strength((d) => (d.kind === 'cat' ? 0.1 : 0.075)))
      .force('y', forceY<MNode>((d) => d.hy).strength((d) => (d.kind === 'cat' ? 0.1 : 0.075)))
      .force(
        'collide',
        forceCollide<MNode>((d) => (d.opT > 0 ? d.r * d.scT + 4 : 0)).strength(0.55).iterations(1),
      )
      // only category bubbles repel each other; repo homes are already non-overlapping (phyllotaxis)
      .force('charge', forceManyBody<MNode>().strength((d) => (d.opT > 0 && d.kind === 'cat' ? -40 : 0)).distanceMin(30).distanceMax(220))

    this.bindEvents()
    this.ro = new ResizeObserver(() => this.measure())
    this.ro.observe(this.host.querySelector('.sm-viewport')!)
    // pause the rAF loop (breathing) entirely while the map is scrolled out of view
    this.io = new IntersectionObserver((entries) => {
      this.inView = entries.some((e) => e.isIntersecting)
      if (this.inView) this.kick()
    })
    this.io.observe(this.host)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.kick()
    })
    if (import.meta.env.DEV || location.search.includes('smdebug')) {
      ;(window as unknown as { __starMap: StarMap }).__starMap = this
    }
  }

  // ---------------------------------------------------------------- public API

  attach(slot: HTMLElement): void {
    if (this.host.parentElement !== slot) slot.appendChild(this.host)
    this.attached = true
    this.measure()
    this.kick()
  }

  detach(): void {
    this.attached = false
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.setHover(null)
    this.host.remove()
  }

  setLocale(locale: Locale, labels: StarMapLabels): void {
    if (locale === this.opts.locale) return
    this.opts.locale = locale
    this.opts.labels = labels
    this.applyLabels()
    for (const n of this.nodes.values()) if (n.kind === 'cat') this.fillCat(n)
    this.updateMore()
  }

  setUser(username: string): void {
    if (username === this.username) return
    this.username = username
    this.fillCenter()
  }

  /** Runtime options (settings panel). Applied live; never re-mounts the map (F4). */
  setOptions(o: { motion?: Motion; maxNodesPerCategory?: number }): void {
    let changed = false
    if (o.motion && o.motion !== this.motion) {
      this.motion = o.motion
      changed = true
    }
    if (o.maxNodesPerCategory && o.maxNodesPerCategory !== this.maxNodes) {
      this.maxNodes = o.maxNodesPerCategory
      changed = true
    }
    if (changed) {
      this.relayout()
      if (this.focusCat && !this.userMoved && this.attached) this.fitView(true)
    }
  }

  /** Category rules changed (custom categories / manual assignment): rebuild nodes, keep the SVG. */
  refreshCategories(): void {
    const focus = this.focusCat
    const repos = this.repos
    this.repos = []
    this.setData(repos)
    this.setFilter(this.filter)
    if (focus && this.nodes.has(`cat:${focus}`)) this.focus(focus, false)
  }

  /** Full data swap (new user / refresh). Keeps the SVG, rebuilds node set. */
  setData(repos: StarredRepo[]): void {
    if (repos === this.repos) return
    this.setHover(null)
    this.repos = repos
    this.repoCat.clear()
    for (const r of repos) this.repoCat.set(r.id, categorizeRepo(r))
    for (const n of [...this.nodes.values()]) {
      if (n === this.center) continue
      n.el.remove()
      n.link?.remove()
      this.nodes.delete(n.key)
    }
    this.focusCat = null
    const present = new Set(this.repoCat.values())
    for (const c of getCategories()) {
      if (!present.has(c.id)) continue
      const n = this.makeNode(`cat:${c.id}`, 'cat')
      n.cat = c.id
      n.parent = this.center
      n.link = this.makeLink(c.color)
      this.fillCat(n)
    }
    this.needsFit = true
    this.fillCenter()
  }

  setFilter(f: StarMapFilter): void {
    this.filter = f
    this.visibleByCat.clear()
    for (const r of f.visible) {
      const c = this.repoCat.get(r.id) ?? 'other'
      let arr = this.visibleByCat.get(c)
      if (!arr) this.visibleByCat.set(c, (arr = []))
      arr.push(r)
    }
    for (const n of this.nodes.values()) if (n.kind === 'cat') this.updateCatCount(n)
    this.relayout()
    if (this.focusCat && !this.userMoved && this.attached) this.fitView(true)
  }

  focus(cat: CategoryId | null, emit = true): void {
    if (cat && !this.nodes.has(`cat:${cat}`)) cat = null
    if (cat === this.focusCat) return
    const prev = this.focusCat
    this.focusCat = cat
    this.setHover(null)
    this.relayout(prev)
    this.fitView(true)
    if (emit) this.opts.onFocusChange(cat)
  }

  fitView(animate: boolean): void {
    const pts: (Vec & { r: number })[] = []
    for (const n of this.nodes.values()) {
      if (n.opT < 0.5 || !n.active) continue
      pts.push({ x: n.hx, y: n.hy, r: n.r * n.scT + 18 })
    }
    const goal = fitBounds(boundsOf(pts), this.width, this.height, 28, this.focusCat ? 1.15 : 1.1)
    this.zoomGoal = null
    this.inertia = null
    this.userMoved = false
    if (animate && !this.reduced) this.camGoal = goal
    else {
      this.cam = goal
      this.camGoal = null
    }
    this.kick()
  }

  /** Debug/perf: frame time stats over the last ~2s. */
  stats(): { frames: number; avgMs: number; p95Ms: number; fps: number; jsAvgMs: number; jsMaxMs: number; activeNodes: number } {
    const f = [...this.frameTimes].sort((a, b) => a - b)
    const c = this.frameCosts
    const avg = f.reduce((s, x) => s + x, 0) / Math.max(1, f.length)
    return {
      frames: f.length,
      avgMs: +avg.toFixed(2),
      p95Ms: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(2),
      fps: +(1000 / Math.max(avg, 0.001)).toFixed(1),
      jsAvgMs: +(c.reduce((s, x) => s + x, 0) / Math.max(1, c.length)).toFixed(2),
      jsMaxMs: +Math.max(0, ...c).toFixed(2),
      activeNodes: [...this.nodes.values()].filter((n) => n.active).length,
    }
  }

  // ---------------------------------------------------------------- DOM builders

  private applyLabels(): void {
    const L = this.opts.labels
    this.hintEl.textContent = L.hint
    this.backBtn.textContent = `← ${L.back}`
    ;(this.host.querySelector('[data-sm="in"]') as HTMLElement).title = L.zoomIn
    ;(this.host.querySelector('[data-sm="out"]') as HTMLElement).title = L.zoomOut
    ;(this.host.querySelector('[data-sm="fit"]') as HTMLElement).title = L.fit
  }

  private makeNode(key: string, kind: Kind): MNode {
    const el = document.createElementNS(SVG_NS, 'g') as SVGGElement
    el.setAttribute('class', `sm-node sm-${kind}`)
    el.setAttribute('display', 'none')
    el.dataset.key = key
    this.nodeLayer.appendChild(el)
    const n: MNode = {
      key,
      kind,
      r: REPO_R,
      hx: 0,
      hy: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      op: 0,
      opT: 0,
      sc: 0.3,
      scT: 0.3,
      scV: 0,
      phase: Math.random() * Math.PI * 2,
      active: false,
      parent: null,
      releaseAt: 0,
      bvx: 0,
      bvy: 0,
      ox: 0,
      oy: 0,
      rx: 0,
      ry: 0,
      el,
      link: null,
      lastOp: -1,
      dimmed: false,
    }
    this.nodes.set(key, n)
    return n
  }

  private makeLink(color: string): SVGLineElement {
    const l = document.createElementNS(SVG_NS, 'line') as SVGLineElement
    l.setAttribute('class', 'sm-link')
    l.setAttribute('stroke', color)
    l.setAttribute('display', 'none')
    this.linkLayer.appendChild(l)
    return l
  }

  private fillCenter(): void {
    const label = this.username ? `@${this.username}` : ''
    this.center.el.innerHTML = `<g class="sm-inner">
      <circle r="56" fill="url(#sm-glow)"/>
      <circle r="38" class="sm-core" fill="#0d1117" stroke="#f0c14b" stroke-width="3"/>
      <image href="${escapeHtml(avatarUrl(this.username))}" x="-24" y="-24" width="48" height="48" clip-path="url(#sm-clip)" preserveAspectRatio="xMidYMid slice"/>
      <text y="60" text-anchor="middle" class="sm-title">${escapeHtml(label)}</text>
    </g>`
  }

  private catDef(id: CategoryId) {
    const cats = getCategories()
    return cats.find((c) => c.id === id) ?? cats[cats.length - 1]
  }

  private fillCat(n: MNode): void {
    const def = this.catDef(n.cat!)
    const total = [...this.repoCat.values()].filter((c) => c === n.cat).length
    n.r = catRadius(total)
    const label = labelOf(def, this.opts.locale, def.id).split(' / ')[0].slice(0, 14)
    n.el.innerHTML = `<g class="sm-inner">
      <circle class="sm-halo" r="${n.r + 10}" fill="${def.color}"/>
      <circle class="sm-core" r="${n.r}" fill="#121820" stroke="${def.color}" stroke-width="2.5"/>
      <text y="-1" text-anchor="middle" class="sm-count">${total}</text>
      <text y="${Math.min(17, n.r * 0.55)}" text-anchor="middle" class="sm-label">${escapeHtml(label)}</text>
    </g>`
    this.updateCatCount(n)
  }

  private updateCatCount(n: MNode): void {
    const t = n.el.querySelector('.sm-count')
    const c = this.visibleByCat.get(n.cat!)?.length ?? 0
    if (t && t.textContent !== String(c)) t.textContent = String(c)
  }

  private ensureRepoNode(r: StarredRepo, parent: MNode): MNode {
    const key = `repo:${r.id}`
    let n = this.nodes.get(key)
    if (n) return n
    n = this.makeNode(key, 'repo')
    n.repo = r
    n.parent = parent
    const color = this.catDef(parent.cat!).color
    n.link = this.makeLink(color)
    const name = (r.full_name.split('/')[1] ?? r.full_name).slice(0, 16)
    n.el.innerHTML = `<g class="sm-inner">
      <circle class="sm-core" r="${REPO_R}" fill="#161b22" stroke="${color}" stroke-width="2"/>
      <circle class="sm-dot" r="11" fill="${languageColor(r.language) || color}"/>
      <image class="sm-avatar" href="${escapeHtml(avatarUrl(r.owner_login, 64))}" x="-15" y="-15" width="30" height="30" clip-path="url(#sm-clip)" preserveAspectRatio="xMidYMid slice"/>
      <text y="34" text-anchor="middle" class="sm-label">${escapeHtml(name)}</text>
    </g>`
    return n
  }

  private updateMore(): void {
    const n = this.nodes.get('more')
    if (!n) return
    const t = n.el.querySelector('text')
    if (t) t.textContent = `+${n.el.dataset.count || 0}`
  }

  // ---------------------------------------------------------------- layout

  private catNodes(): MNode[] {
    return [...this.nodes.values()].filter((n) => n.kind === 'cat')
  }

  /** Recompute targets (home/opacity/scale) for the current focus + filter. Never touches innerHTML of existing nodes. */
  private relayout(prevFocus: CategoryId | null = this.focusCat): void {
    const cats = this.catNodes()
    const focus = this.focusCat
    const sel = this.filter.selectedCats
    const maxR = Math.max(30, ...cats.map((c) => c.r))
    const ringR = Math.max(170, (cats.length * (maxR * 2 + 26)) / (Math.PI * 2))
    const ring = ringPositions(cats.length, ringR)
    const now = performance.now()

    this.center.opT = focus ? 0 : 1
    this.center.scT = focus ? 0.4 : 1

    const focusCount = focus ? Math.min(this.visibleByCat.get(focus)?.length ?? 0, 151) : 0
    const cloudR = REPO_SPACING * Math.sqrt(focusCount + REPO_OFFSET) + REPO_R
    let focusNode: MNode | null = null
    cats.forEach((c, i) => {
      const count = this.visibleByCat.get(c.cat!)?.length ?? 0
      c.active = true
      if (focus) {
        if (c.cat === focus) {
          focusNode = c
          c.hx = 0
          c.hy = 0
          c.opT = 1
          c.scT = 1.12
        } else {
          // retreat outward, dim
          const outer = Math.max(ringR * 2.3, cloudR + 140)
          c.hx = (ring[i].x / ringR) * outer
          c.hy = (ring[i].y / ringR) * outer
          c.opT = 0.12
          c.scT = 0.7
        }
      } else {
        c.hx = ring[i].x
        c.hy = ring[i].y
        const picked = sel.length === 0 || sel.includes(c.cat!)
        c.opT = count === 0 ? 0.15 : picked ? 1 : 0.3
        c.scT = count === 0 ? 0.75 : 1
      }
    })

    // repo nodes
    const shownKeys = new Set<string>()
    let overflow = 0
    if (focus && focusNode) {
      const fnode = focusNode as MNode
      const list = this.visibleByCat.get(focus) ?? []
      const { shown, overflow: of } = capList(list, this.maxNodes)
      overflow = of
      const homes = phyllotaxis(shown.length + (of ? 1 : 0), REPO_SPACING, REPO_OFFSET)
      const fresh = prevFocus !== focus
      shown.forEach((r, i) => {
        const n = this.ensureRepoNode(r, fnode)
        shownKeys.add(n.key)
        const wasHidden = !n.active || n.op < 0.05
        n.active = true
        n.hx = homes[i].x
        n.hy = homes[i].y
        n.opT = 1
        n.scT = 1
        if (wasHidden) {
          // burst out from the category node (its current position), staggered; start slightly
          // along the home direction so no two nodes ever share a point (avoids collide explosions)
          const a = Math.atan2(homes[i].y, homes[i].x)
          n.bvx = n.vx = Math.cos(a) * 5
          n.bvy = n.vy = Math.sin(a) * 5
          n.ox = homes[i].x * 0.08
          n.oy = homes[i].y * 0.08
          n.x = fnode.x + n.ox
          n.y = fnode.y + n.oy
          n.sc = 0.2
          n.scV = 0
          n.op = 0
          n.releaseAt = fresh ? now + Math.min(i * 5, 420) : now
        }
      })
      if (of) {
        let more = this.nodes.get('more')
        if (!more) {
          more = this.makeNode('more', 'more')
          more.r = 26
          more.el.innerHTML = `<g class="sm-inner"><circle class="sm-core" r="26" fill="#0d1117" stroke-dasharray="4 4"/><text y="5" text-anchor="middle" class="sm-count"></text></g>`
        }
        more.parent = fnode
        more.el.dataset.count = String(of)
        more.el.querySelector('circle')!.setAttribute('stroke', this.catDef(focus).color)
        this.updateMore()
        const h = homes[shown.length]
        if (!more.active || more.op < 0.05) {
          more.ox = h.x * 0.08
          more.oy = h.y * 0.08
          more.x = fnode.x + more.ox
          more.y = fnode.y + more.oy
          more.op = 0
          more.sc = 0.2
          more.releaseAt = now + 300
        }
        more.active = true
        more.hx = h.x
        more.hy = h.y
        more.opT = 1
        more.scT = 1
        shownKeys.add('more')
      }
    }
    for (const n of this.nodes.values()) {
      if ((n.kind !== 'repo' && n.kind !== 'more') || shownKeys.has(n.key)) continue
      if (!n.active) continue
      // collapse back into the parent category
      const p = n.parent!
      n.hx = p.hx
      n.hy = p.hy
      n.opT = 0
      n.scT = 0.2
      n.releaseAt = 0
    }
    this.backBtn.classList.toggle('show', !!focus)
    this.host.classList.toggle('is-focused', !!focus)
    void overflow

    this.simDirty = true
    if (this.reduced) {
      // instant switch: snap everything, no physics
      for (const n of this.nodes.values()) {
        if (!n.active) continue
        n.x = n.hx
        n.y = n.hy
        n.vx = n.vy = 0
        n.op = n.opT
        n.sc = n.scT
        n.scV = 0
        n.releaseAt = 0
        if (n.opT === 0) this.deactivate(n)
      }
      this.sim.alpha(0)
    } else {
      this.sim.alpha(Math.max(this.sim.alpha(), 0.8))
    }
    if (this.needsFit && this.attached && this.width > 0) {
      this.needsFit = false
      for (const n of this.nodes.values()) if (n.kind === 'cat' && n.op === 0) { n.x = n.hx * 0.3; n.y = n.hy * 0.3 }
      this.fitView(false)
    }
    this.kick()
  }

  private deactivate(n: MNode): void {
    n.active = false
    n.el.setAttribute('display', 'none')
    n.link?.setAttribute('display', 'none')
    n.lastOp = -1
    this.simDirty = true
  }

  // ---------------------------------------------------------------- loop

  private kick(): void {
    if (!this.attached || this.raf) return
    this.lastT = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (t: number): void => {
    this.raf = 0
    if (!this.attached || document.hidden || !this.inView) return
    const dt = Math.min(48, Math.max(1, t - this.lastT))
    this.lastT = t
    const t0 = performance.now()

    if (this.simDirty) {
      this.simDirty = false
      this.sim.nodes([...this.nodes.values()].filter((n) => n.active && n !== this.center))
    }
    // release staggered nodes
    for (const n of this.nodes.values()) {
      if (!n.releaseAt) continue
      const p = n.parent!
      n.x = p.x + n.ox
      n.y = p.y + n.oy
      n.vx = n.bvx
      n.vy = n.bvy
      if (t < n.releaseAt) {
        n.op = 0
        n.sc = 0.2
        n.scV = 0
      } else n.releaseAt = 0
    }
    if (!this.reduced && this.sim.alpha() > this.sim.alphaMin()) this.sim.tick()

    this.stepCamera(dt)
    this.drawNodes(t, dt)
    this.positionTip()

    this.frameTimes.push(dt)
    this.frameCosts.push(performance.now() - t0)
    if (this.frameTimes.length > 120) this.frameTimes.shift()
    if (this.frameCosts.length > 120) this.frameCosts.shift()

    // keep running while anything moves (breathing counts); otherwise idle until the next kick().
    const busy =
      (!this.reduced && this.motion === 'standard') ||
      this.animating ||
      (!this.reduced && this.sim.alpha() > this.sim.alphaMin()) ||
      this.inertia != null ||
      this.camGoal != null ||
      this.zoomGoal != null ||
      this.mode !== 'idle'
    if (busy) this.raf = requestAnimationFrame(this.frame)
  }

  private stepCamera(dt: number): void {
    const c = this.cam
    if (this.zoomGoal) {
      const f = this.reduced ? 1 : smoothing(0.28, dt)
      const k = c.k + (this.zoomGoal.k - c.k) * f
      this.cam = zoomAt(c, this.zoomGoal.anchor, k)
      if (Math.abs(this.zoomGoal.k - k) < 0.0008) this.zoomGoal = null
    } else if (this.camGoal) {
      const g = this.camGoal
      const f = smoothing(0.12, dt)
      this.cam = { x: c.x + (g.x - c.x) * f, y: c.y + (g.y - c.y) * f, k: c.k + (g.k - c.k) * f }
      if (Math.abs(g.x - this.cam.x) < 0.3 && Math.abs(g.y - this.cam.y) < 0.3 && Math.abs(g.k - this.cam.k) < 0.0005) {
        this.cam = g
        this.camGoal = null
      }
    } else if (this.inertia) {
      this.cam = { ...c, x: c.x + this.inertia.x * dt, y: c.y + this.inertia.y * dt }
      this.inertia = { x: decay(this.inertia.x, 0.93, dt), y: decay(this.inertia.y, 0.93, dt) }
      if (Math.hypot(this.inertia.x, this.inertia.y) < 0.01) this.inertia = null
    }
    const s = `translate(${this.cam.x.toFixed(2)},${this.cam.y.toFixed(2)}) scale(${this.cam.k.toFixed(4)})`
    if (s !== this.lastCamStr) {
      this.lastCamStr = s
      this.stage.setAttribute('transform', s)
    }
    const lod = this.cam.k < LOD_ZOOM
    if (lod !== this.lod) {
      this.lod = lod
      this.svg.classList.toggle('lod-dots', lod)
    }
  }

  private drawNodes(t: number, dt: number): void {
    const opF = smoothing(this.reduced ? 1 : 0.14, dt)
    const breathe = !this.reduced && this.motion === 'standard'
    let animating = false
    const dts = dt / 1000
    for (const n of this.nodes.values()) {
      if (!n.active) continue
      // opacity: exponential approach; scale: underdamped spring (gives the "pop")
      n.op += (n.opT - n.op) * opF
      if (this.reduced) {
        n.sc = n.scT
      } else {
        const stiffness = 210
        const damping = 17
        const a = stiffness * (n.scT - n.sc) - damping * n.scV
        n.scV += a * dts
        n.sc += n.scV * dts
      }
      if (Math.abs(n.opT - n.op) > 0.004 || Math.abs(n.scT - n.sc) > 0.002 || Math.abs(n.scV) > 0.01) animating = true
      if (n.opT === 0 && n.op < 0.01 && n.kind !== 'center') {
        this.deactivate(n)
        continue
      }
      let x = n.x
      let y = n.y
      if (breathe && n.fx == null && n !== this.downNode) {
        const amp = n.kind === 'cat' ? 3 : n.kind === 'center' ? 1.5 : 2
        x += Math.sin(t * 0.0009 + n.phase) * amp
        y += Math.cos(t * 0.0011 + n.phase * 1.7) * amp
      }
      if (n.el.getAttribute('display') === 'none') n.el.removeAttribute('display')
      n.el.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${Math.max(0.01, n.sc).toFixed(3)})`)
      const op = Math.round(n.op * 1000) / 1000
      if (op !== n.lastOp) {
        n.lastOp = op
        n.el.setAttribute('opacity', String(op))
      }
      n.rx = x
      n.ry = y
    }
    this.animating = animating
    // links follow rendered positions
    for (const n of this.nodes.values()) {
      if (!n.active || !n.link || !n.parent) continue
      const p = n.parent
      const c = n
      const l = n.link
      const vis = Math.min(n.op, p.active ? p.op : 0)
      if (vis < 0.02) {
        if (l.getAttribute('display') !== 'none') l.setAttribute('display', 'none')
        continue
      }
      if (l.getAttribute('display') === 'none') l.removeAttribute('display')
      l.setAttribute('x1', p.rx.toFixed(1))
      l.setAttribute('y1', p.ry.toFixed(1))
      l.setAttribute('x2', c.rx.toFixed(1))
      l.setAttribute('y2', c.ry.toFixed(1))
      l.setAttribute('opacity', (vis * (n.kind === 'cat' ? 0.45 : 0.3)).toFixed(3))
    }
  }

  // ---------------------------------------------------------------- hover / tooltip

  private setHover(n: MNode | null): void {
    if (n === this.hover) return
    for (const h of this.hot) h.el.classList.remove('is-hot', 'is-hover')
    for (const l of this.linkLayer.querySelectorAll('.sm-link.is-hot')) l.classList.remove('is-hot')
    this.hot.clear()
    this.hover = n
    if (!n || n.op < 0.3) {
      this.hover = null
      this.svg.classList.remove('has-hover')
      this.tip.classList.remove('show')
      return
    }
    this.hot.add(n)
    n.link?.classList.add('is-hot')
    if (n.parent && n.parent.active) this.hot.add(n.parent)
    for (const m of this.nodes.values()) {
      if (m.parent !== n || !m.active) continue
      this.hot.add(m)
      m.link?.classList.add('is-hot')
    }
    for (const h of this.hot) h.el.classList.add('is-hot')
    n.el.classList.add('is-hover')
    this.svg.classList.add('has-hover')
    this.fillTip(n)
    this.tip.classList.add('show')
    this.positionTip()
  }

  private fillTip(n: MNode): void {
    const L = this.opts.labels
    const loc = this.opts.locale
    const card = this.tip.firstElementChild as HTMLElement
    if (n.kind === 'repo' && n.repo) {
      const r = n.repo
      card.innerHTML = `<div class="sm-tip-head">
          <img src="${escapeHtml(avatarUrl(r.owner_login, 64))}" alt="" width="32" height="32"/>
          <div><div class="sm-tip-owner">${escapeHtml(r.owner_login)}</div><strong>${escapeHtml(r.full_name.split('/')[1] ?? r.full_name)}</strong></div>
          <span class="sm-tip-star">★ ${formatStars(r.stargazers_count, loc)}</span>
        </div>
        <p>${escapeHtml(humanBlurb(r, loc))}</p>
        <div class="sm-tip-foot">${escapeHtml(L.tipOpen)}</div>`
    } else if (n.kind === 'cat') {
      const def = this.catDef(n.cat!)
      const list = this.visibleByCat.get(n.cat!) ?? []
      const top = [...list].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3)
      card.innerHTML = `<div class="sm-tip-head"><i class="sm-tip-dot" style="background:${def.color}"></i>
          <strong>${escapeHtml(labelOf(def, loc, def.id))}</strong><span class="sm-tip-star">${list.length}</span></div>
        ${top.length ? `<p>${top.map((r) => escapeHtml(r.full_name)).join('<br/>')}</p>` : ''}
        <div class="sm-tip-foot">${escapeHtml(this.focusCat === n.cat ? L.tipBack : L.tipExpand)}</div>`
    } else if (n.kind === 'more') {
      card.innerHTML = `<strong>${escapeHtml(L.more(Number(n.el.dataset.count || 0)))}</strong>`
    } else {
      card.innerHTML = `<strong>${escapeHtml(this.username ? `@${this.username}` : '')}</strong><p>${this.repos.length} ★</p>`
    }
  }

  private positionTip(): void {
    const n = this.hover
    if (!n) return
    const sx = n.rx * this.cam.k + this.cam.x
    const sy = n.ry * this.cam.k + this.cam.y
    const off = (n.r * n.sc + 10) * this.cam.k
    const tw = 280
    let x = sx + off
    if (x + tw > this.width - 8) x = sx - off - tw
    x = Math.max(8, x)
    const y = Math.min(Math.max(8, sy - 30), this.height - 120)
    this.tip.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
  }

  // ---------------------------------------------------------------- input

  private nodeFromEvent(e: Event): MNode | null {
    const g = (e.target as Element).closest?.('.sm-node') as SVGGElement | null
    if (!g) return null
    const n = this.nodes.get(g.dataset.key ?? '')
    return n && n.active && n.op > 0.3 ? n : null
  }

  private local(e: PointerEvent | WheelEvent | MouseEvent): Vec {
    const r = this.svg.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private measure(): void {
    const r = this.svg.getBoundingClientRect()
    if (!r.width || !r.height) return
    const changed = Math.abs(r.width - this.width) > 1 || Math.abs(r.height - this.height) > 1
    this.width = r.width
    this.height = r.height
    if (this.needsFit && this.nodes.size > 1) {
      this.needsFit = false
      this.fitView(false)
    } else if (changed) this.fitView(false)
  }

  private bindEvents(): void {
    const svg = this.svg

    this.host.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('[data-sm]') as HTMLElement | null
      if (!b) return
      const kind = b.dataset.sm
      const mid = { x: this.width / 2, y: this.height / 2 }
      if (kind === 'back') this.focus(null)
      else if (kind === 'fit') this.fitView(true)
      else {
        const base = this.zoomGoal?.k ?? this.cam.k
        this.camGoal = null
        this.inertia = null
        this.userMoved = true
        this.zoomGoal = { k: clampK(base * (kind === 'in' ? 1.4 : 1 / 1.4)), anchor: mid }
        if (this.reduced) {
          this.cam = zoomAt(this.cam, mid, this.zoomGoal.k)
          this.zoomGoal = null
        }
        this.kick()
      }
    })

    svg.addEventListener(
      'wheel',
      (e) => {
        // Plain wheel / two-finger trackpad scroll belongs to the page — don't preventDefault.
        if (wheelIntent(e) === 'scroll') return
        // Ctrl/⌘ + wheel, or trackpad pinch (reported as wheel + ctrlKey): cursor-centred zoom.
        e.preventDefault()
        const p = this.local(e)
        this.userMoved = true
        this.camGoal = null
        this.inertia = null
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
        const dy = e.deltaY * unit
        // pinch deltas are small and fine-grained; mouse wheel notches are ~100px
        const rate = Math.abs(dy) < 50 ? 0.012 : 0.0025
        const base = this.zoomGoal?.k ?? this.cam.k
        this.zoomGoal = { k: clampK(base * Math.exp(-dy * rate)), anchor: p }
        if (this.reduced) {
          this.cam = zoomAt(this.cam, p, this.zoomGoal.k)
          this.zoomGoal = null
        }
        this.kick()
      },
      { passive: false },
    )

    svg.addEventListener('dblclick', (e) => {
      if (this.nodeFromEvent(e)) return
      e.preventDefault()
      this.fitView(true)
    })

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      svg.setPointerCapture(e.pointerId)
      const p = this.local(e)
      this.pointers.set(e.pointerId, p)
      this.camGoal = null
      this.zoomGoal = null
      this.inertia = null
      if (this.pointers.size === 2) {
        this.releaseNodeDrag(false)
        const [a, b] = [...this.pointers.values()]
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...this.cam } }
        this.mode = 'pinch'
        this.userMoved = true
        this.setHover(null)
      } else if (this.pointers.size === 1) {
        this.mode = 'pending'
        this.downAt = p
        this.downNode = this.nodeFromEvent(e)
        this.lastMove = { ...p, t: e.timeStamp }
        this.vel = { x: 0, y: 0 }
      }
      this.kick()
    })

    svg.addEventListener('pointermove', (e) => {
      const p = this.local(e)
      if (!this.pointers.has(e.pointerId)) {
        // hover (mouse / pen without buttons)
        if (e.pointerType !== 'touch') this.setHover(this.nodeFromEvent(e))
        return
      }
      this.pointers.set(e.pointerId, p)
      if (this.mode === 'done') return
      if (this.mode === 'pinch' && this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const s = this.pinch
        const k = clampK(s.cam.k * (dist / s.dist))
        const w = toWorld(s.cam, s.mid)
        this.cam = { x: mid.x - w.x * k, y: mid.y - w.y * k, k }
        return
      }
      if (this.mode === 'pending' && exceedsThreshold(p.x - this.downAt.x, p.y - this.downAt.y)) {
        const intent = dragIntent(e.pointerType, this.pointers.size, !!this.downNode)
        if (intent === 'none') {
          // one finger on touch: the page scrolls (touch-action: pan-y); this is no longer a tap
          this.mode = 'done'
          this.downNode = null
          return
        }
        this.mode = intent === 'node' ? 'node' : 'pan'
        svg.classList.add('is-dragging')
        if (this.mode === 'pan') {
          this.userMoved = true
          this.setHover(null)
        }
        if (this.mode === 'node' && this.downNode) {
          const n = this.downNode
          n.fx = n.x
          n.fy = n.y
          if (!this.reduced) this.sim.alphaTarget(0.25).alpha(Math.max(this.sim.alpha(), 0.3))
        }
      }
      const dtm = Math.max(1, e.timeStamp - this.lastMove.t)
      const dx = p.x - this.lastMove.x
      const dy = p.y - this.lastMove.y
      // EMA of pointer velocity (px/ms) for inertia
      this.vel = { x: this.vel.x * 0.6 + (dx / dtm) * 0.4, y: this.vel.y * 0.6 + (dy / dtm) * 0.4 }
      this.lastMove = { ...p, t: e.timeStamp }
      if (this.mode === 'pan') {
        this.cam = { ...this.cam, x: this.cam.x + dx, y: this.cam.y + dy }
      } else if (this.mode === 'node' && this.downNode) {
        const w = toWorld(this.cam, p)
        this.downNode.fx = w.x
        this.downNode.fy = w.y
        this.downNode.x = w.x
        this.downNode.y = w.y
        if (this.reduced) this.kick()
      }
    })

    const end = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.delete(e.pointerId)
      const cancelled = e.type === 'pointercancel'
      if (this.mode === 'pinch') {
        if (this.pointers.size === 0) this.mode = 'idle'
        else this.mode = 'done'
        return
      }
      if (this.pointers.size > 0) return
      const staleVel = e.timeStamp - this.lastMove.t > 80
      if (this.mode === 'pending' && !cancelled) {
        const n = this.downNode
        if (n) this.activate(n)
      } else if (this.mode === 'pan' && !this.reduced && !staleVel) {
        this.inertia = { ...this.vel }
      } else if (this.mode === 'node') {
        this.releaseNodeDrag(!staleVel)
      }
      this.mode = 'idle'
      this.downNode = null
      svg.classList.remove('is-dragging')
      if (e.pointerType !== 'touch' && !cancelled) this.setHover(this.nodeFromEvent(e))
      this.kick()
    }
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
    svg.addEventListener('pointerleave', (e) => {
      if (!this.pointers.has(e.pointerId)) this.setHover(null)
    })
  }

  private releaseNodeDrag(withInertia: boolean): void {
    const n = this.downNode
    if (!n || n.fx == null) return
    n.fx = null
    n.fy = null
    if (this.reduced) {
      n.x = n.hx
      n.y = n.hy
      n.vx = n.vy = 0
    } else if (withInertia) {
      // px/ms in screen → world units per tick (~16.7ms)
      n.vx = (this.vel.x * 16.7 * 0.8) / this.cam.k
      n.vy = (this.vel.y * 16.7 * 0.8) / this.cam.k
    }
    this.sim.alphaTarget(0)
    this.sim.alpha(Math.max(this.sim.alpha(), 0.5))
    this.downNode = null
  }

  private activate(n: MNode): void {
    if (n.kind === 'cat') {
      this.focus(this.focusCat === n.cat ? null : n.cat!)
    } else if (n.kind === 'repo' && n.repo) {
      window.open(n.repo.html_url, '_blank', 'noopener')
    } else if (n.kind === 'more') {
      this.opts.onMore()
    }
  }
}
