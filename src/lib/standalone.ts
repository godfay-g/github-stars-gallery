/**
 * Standalone single-file HTML export, shared by the web app and the CLI so both use the
 * same category rules (config/schema `categorize`). Pure: no DOM APIs.
 */
import { categorize, labelOf, type CategoryRule, type Locale } from '../config/schema'

export type StandaloneRepo = {
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  topics: string[]
  starred_at: string
  owner_login: string
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** JSON safe to inline in <script>. */
function inlineJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function buildStandaloneHtml(opts: {
  username: string
  repos: StandaloneRepo[]
  rules: CategoryRule[]
  overrides?: Record<string, string>
  locale?: Locale
  title?: string
  generatedAt?: string
}): string {
  const locale = opts.locale ?? 'en'
  const zh = locale === 'zh'
  const cats = opts.rules.map((r) => ({ id: r.id, label: labelOf(r, locale, r.id), color: r.color }))
  const repos = opts.repos.map((r) => ({
    n: r.full_name,
    u: r.html_url,
    d: r.description ?? '',
    l: r.language ?? '',
    s: r.stargazers_count,
    t: r.topics ?? [],
    a: String(r.starred_at).slice(0, 10),
    c: categorize(r, opts.rules, opts.overrides),
  }))
  const counts: Record<string, number> = {}
  for (const r of repos) counts[r.c] = (counts[r.c] ?? 0) + 1
  const title = opts.title ?? `${opts.username} — ${zh ? 'GitHub 收藏' : 'Starred repos'}`
  const data = inlineJson({ cats: cats.filter((c) => counts[c.id]), counts, repos, generatedAt: opts.generatedAt ?? new Date().toISOString() })
  return `<!DOCTYPE html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--star:#f0c14b}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,"PingFang SC","Noto Sans SC",sans-serif;background:var(--bg);color:var(--text)}
header{padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
h1{font-size:1.15rem;margin:0}input{flex:1;min-width:180px;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--text)}
.meta{color:var(--muted);font-size:.85rem}
.chips{display:flex;flex-wrap:wrap;gap:.4rem;padding:.75rem 1.5rem 0}
.chip{border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:999px;padding:.25rem .7rem;cursor:pointer;font:inherit;font-size:.82rem}
.chip i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.chip.on{border-color:var(--accent);background:#1f2a3a}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;padding:1.25rem 1.5rem}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.5rem}
.card a{color:var(--accent);text-decoration:none;font-weight:600}.card a:hover{text-decoration:underline}
.cat{font-size:.72rem;border-radius:999px;padding:.05rem .5rem;border:1px solid;align-self:flex-start}
.desc{color:var(--muted);font-size:.9rem;flex:1;margin:0}.row{display:flex;gap:.75rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}
.topic{background:#21262d;border-radius:999px;padding:.1rem .5rem;font-size:.75rem}
</style>
</head>
<body>
<header>
  <h1>★ ${esc(title)}</h1>
  <input id="q" type="search" placeholder="${zh ? '搜索名称、简介、topics…' : 'Search name, description, topics…'}" autofocus/>
  <span class="meta" id="meta"></span>
</header>
<nav class="chips" id="chips"></nav>
<main class="grid" id="grid"></main>
<script>
const DATA=${data};
const ALL=${JSON.stringify(zh ? '全部' : 'All')};
const NODESC=${JSON.stringify(zh ? '没有简介' : 'No description')};
const grid=document.getElementById('grid'),meta=document.getElementById('meta'),q=document.getElementById('q'),chips=document.getElementById('chips');
const byId=Object.fromEntries(DATA.cats.map(c=>[c.id,c]));
let cat='';
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function drawChips(){chips.innerHTML='<button class="chip'+(cat?'':' on')+'" data-c="">'+ALL+' '+DATA.repos.length+'</button>'+DATA.cats.map(c=>'<button class="chip'+(cat===c.id?' on':'')+'" data-c="'+esc(c.id)+'"><i style="background:'+esc(c.color)+'"></i>'+esc(c.label)+' '+DATA.counts[c.id]+'</button>').join('')}
function render(){
  const t=q.value.trim().toLowerCase();
  const list=DATA.repos.filter(r=>(!cat||r.c===cat)&&(!t||(r.n+' '+r.d+' '+r.t.join(' ')+' '+r.l).toLowerCase().includes(t)));
  meta.textContent=list.length+' / '+DATA.repos.length+' · '+DATA.generatedAt.slice(0,10);
  grid.innerHTML=list.map(r=>{const c=byId[r.c]||{label:r.c,color:'#8b949e'};return '<article class="card"><a href="'+esc(r.u)+'" target="_blank" rel="noopener">'+esc(r.n)+'</a><span class="cat" style="color:'+esc(c.color)+';border-color:'+esc(c.color)+'">'+esc(c.label)+'</span><p class="desc">'+esc(r.d||NODESC)+'</p><div class="row"><span>'+esc(r.l||'—')+'</span><span>★ '+r.s.toLocaleString()+'</span><span>'+esc(r.a)+'</span></div><div class="row">'+r.t.slice(0,6).map(x=>'<span class="topic">'+esc(x)+'</span>').join('')+'</div></article>'}).join('');
}
chips.addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;cat=b.dataset.c;drawChips();render()});
q.addEventListener('input',render);
drawChips();render();
</script>
</body>
</html>`
}
