import type { StarredRepo } from '../types'

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportJson(username: string, repos: StarredRepo[]): void {
  const payload = {
    generated_at: new Date().toISOString(),
    username,
    count: repos.length,
    repos,
  }
  downloadBlob(
    `${username}-stars.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildStandaloneHtml(username: string, repos: StarredRepo[]): string {
  const data = JSON.stringify({ username, repos, generated_at: new Date().toISOString() })
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(username)} — Starred repos</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--star:#f0c14b}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
h1{font-size:1.15rem;margin:0}input{flex:1;min-width:180px;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--text)}
.meta{color:var(--muted);font-size:.85rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;padding:1.25rem}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.5rem}
.card a{color:var(--accent);text-decoration:none;font-weight:600}.card a:hover{text-decoration:underline}
.desc{color:var(--muted);font-size:.9rem;flex:1}.row{display:flex;gap:.75rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}
.lang::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:4px}
.topic{background:#21262d;border-radius:999px;padding:.1rem .5rem;font-size:.75rem}
.hidden{display:none!important}
</style>
</head>
<body>
<header>
  <h1>★ ${escapeHtml(username)} stars</h1>
  <input id="q" type="search" placeholder="Search name, description, topics…" autofocus/>
  <span class="meta" id="meta"></span>
</header>
<main class="grid" id="grid"></main>
<script>
const DATA=${data};
const grid=document.getElementById('grid');
const meta=document.getElementById('meta');
const q=document.getElementById('q');
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function render(list){
  meta.textContent=list.length+' / '+DATA.repos.length+' · '+DATA.generated_at.slice(0,10);
  grid.innerHTML=list.map(r=>\`<article class="card" data-hay="\${esc((r.full_name+' '+(r.description||'')+' '+r.owner_login+' '+(r.topics||[]).join(' ')+' '+(r.language||'')).toLowerCase())}">
    <a href="\${esc(r.html_url)}" target="_blank" rel="noopener">\${esc(r.full_name)}</a>
    <p class="desc">\${esc(r.description||'No description')}</p>
    <div class="row">
      <span class="lang">\${esc(r.language||'—')}</span>
      <span>★ \${r.stargazers_count.toLocaleString()}</span>
      <span>starred \${esc(r.starred_at.slice(0,10))}</span>
    </div>
    <div class="row">\${(r.topics||[]).slice(0,6).map(t=>'<span class="topic">'+esc(t)+'</span>').join('')}</div>
  </article>\`).join('');
}
function filter(){
  const term=q.value.trim().toLowerCase();
  if(!term){render(DATA.repos);return;}
  render(DATA.repos.filter(r=>{
    const hay=(r.full_name+' '+(r.description||'')+' '+r.owner_login+' '+(r.topics||[]).join(' ')+' '+(r.language||'')).toLowerCase();
    return hay.includes(term);
  }));
}
q.addEventListener('input',filter);
render(DATA.repos);
</script>
</body>
</html>`
}

export function exportHtml(username: string, repos: StarredRepo[]): void {
  const html = buildStandaloneHtml(username, repos)
  downloadBlob(`${username}-stars.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))
}
