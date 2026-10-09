#!/usr/bin/env node
/**
 * CLI: fetch starred repos and write stars.json + stars.html
 * Usage: node scripts/export.mjs <username> [--token <pat>] [--out <dir>]
 * Env: GITHUB_TOKEN or GH_TOKEN used if --token omitted
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ACCEPT = 'application/vnd.github.star+json'
const API = 'https://api.github.com'

function usage() {
  console.error(`Usage: node scripts/export.mjs <username> [--token <pat>] [--out <dir>]
Env: GITHUB_TOKEN / GH_TOKEN`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { username: null, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '', out: 'data' }
  const a = [...argv]
  while (a.length) {
    const x = a.shift()
    if (x === '--token') args.token = a.shift() || ''
    else if (x === '--out') args.out = a.shift() || 'data'
    else if (x === '--help' || x === '-h') usage()
    else if (!args.username && !x.startsWith('-')) args.username = x.replace(/^@/, '')
    else {
      console.error('Unknown arg:', x)
      usage()
    }
  }
  if (!args.username) usage()
  return args
}

function mapStarred(raw) {
  const starred_at = raw?.starred_at
  const r = raw?.repo ?? raw
  if (!r?.id || !r.full_name || !starred_at) {
    throw new Error('Invalid payload: need Accept application/vnd.github.star+json')
  }
  return {
    id: r.id,
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description ?? null,
    language: r.language ?? null,
    stargazers_count: r.stargazers_count ?? 0,
    forks_count: r.forks_count ?? 0,
    topics: Array.isArray(r.topics) ? r.topics : [],
    updated_at: r.updated_at,
    starred_at,
    owner_login: r.owner?.login ?? r.full_name.split('/')[0],
    archived: Boolean(r.archived),
    fork: Boolean(r.fork),
  }
}

function parseNext(link) {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAll(username, token) {
  let url = `${API}/users/${encodeURIComponent(username)}/starred?per_page=100`
  const all = []
  let page = 0
  while (url) {
    page += 1
    const headers = {
      Accept: ACCEPT,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-stars-gallery-cli',
    }
    if (token) headers.Authorization = `Bearer ${token}`

    let attempt = 0
    let res
    for (;;) {
      res = await fetch(url, { headers })
      if (res.status === 403 || res.status === 429) {
        if (attempt >= 3) throw new Error(`Rate limited (${res.status})`)
        const ra = res.headers.get('retry-after')
        const wait = ra ? Number(ra) * 1000 : 1000 * 2 ** attempt
        console.warn(`Rate limited, wait ${wait}ms…`)
        await sleep(wait)
        attempt += 1
        continue
      }
      break
    }
    if (res.status === 404) throw new Error(`User not found: ${username}`)
    if (res.status === 401) throw new Error('Invalid token (401)')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const mapped = data.map(mapStarred)
    all.push(...mapped)
    console.log(`Page ${page}: +${mapped.length} (total ${all.length})`)
    url = parseNext(res.headers.get('link'))
  }
  return all
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(username, repos) {
  const data = JSON.stringify({ username, repos, generated_at: new Date().toISOString() })
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(username)} — Starred repos</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
h1{font-size:1.15rem;margin:0}input{flex:1;min-width:180px;padding:.5rem .75rem;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--text)}
.meta{color:var(--muted);font-size:.85rem}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;padding:1.25rem}
.card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.5rem}
.card a{color:var(--accent);text-decoration:none;font-weight:600}.desc{color:var(--muted);font-size:.9rem;flex:1}
.row{display:flex;gap:.75rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}
.topic{background:#21262d;border-radius:999px;padding:.1rem .5rem;font-size:.75rem}
</style></head><body>
<header><h1>★ ${escapeHtml(username)} stars</h1>
<input id="q" type="search" placeholder="Search…" autofocus/><span class="meta" id="meta"></span></header>
<main class="grid" id="grid"></main>
<script>
const DATA=${data};
const grid=document.getElementById('grid'),meta=document.getElementById('meta'),q=document.getElementById('q');
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function render(list){
  meta.textContent=list.length+' / '+DATA.repos.length;
  grid.innerHTML=list.map(r=>'<article class="card"><a href="'+esc(r.html_url)+'" target="_blank" rel="noopener">'+esc(r.full_name)+'</a><p class="desc">'+esc(r.description||'No description')+'</p><div class="row"><span>'+esc(r.language||'—')+'</span><span>★ '+r.stargazers_count+'</span><span>'+esc(String(r.starred_at).slice(0,10))+'</span></div><div class="row">'+(r.topics||[]).slice(0,6).map(t=>'<span class="topic">'+esc(t)+'</span>').join('')+'</div></article>').join('');
}
q.addEventListener('input',()=>{const t=q.value.trim().toLowerCase();
  if(!t){render(DATA.repos);return;}
  render(DATA.repos.filter(r=>(r.full_name+' '+(r.description||'')+' '+r.owner_login+' '+(r.topics||[]).join(' ')+' '+(r.language||'')).toLowerCase().includes(t)));
});
render(DATA.repos);
</script></body></html>`
}

const { username, token, out } = parseArgs(process.argv.slice(2))
const outDir = resolve(out)
mkdirSync(outDir, { recursive: true })

console.log(`Fetching stars for @${username}${token ? ' (authenticated)' : ' (anonymous)'}…`)
const repos = await fetchAll(username, token)
const payload = {
  generated_at: new Date().toISOString(),
  username,
  count: repos.length,
  repos,
}
const jsonPath = join(outDir, 'stars.json')
const htmlPath = join(outDir, 'stars.html')
writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
writeFileSync(htmlPath, buildHtml(username, repos))
console.log(`Wrote ${jsonPath} (${repos.length} repos)`)
console.log(`Wrote ${htmlPath}`)
