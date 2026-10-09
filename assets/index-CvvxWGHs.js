(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))a(o);new MutationObserver(o=>{for(const s of o)if(s.type==="childList")for(const i of s.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&a(i)}).observe(document,{childList:!0,subtree:!0});function t(o){const s={};return o.integrity&&(s.integrity=o.integrity),o.referrerPolicy&&(s.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?s.credentials="include":o.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function a(o){if(o.ep)return;o.ep=!0;const s=t(o);fetch(o.href,s)}})();const j="gsg:cache:",R=15*60*1e3;function L(e){return`${j}${e.toLowerCase()}`}function D(e){try{const n=localStorage.getItem(L(e));if(!n)return null;const t=JSON.parse(n);return!(t!=null&&t.repos)||!t.fetchedAt||Date.now()-t.fetchedAt>R?null:t.repos}catch{return null}}function U(e,n){const t={fetchedAt:Date.now(),username:e,repos:n};try{localStorage.setItem(L(e),JSON.stringify(t))}catch{}}function H(e){localStorage.removeItem(L(e))}const M="https://api.github.com",z="application/vnd.github.star+json",F="2022-11-28",G="github-stars-gallery";class g extends Error{constructor(n,t,a){super(n),this.code=t,this.status=a,this.name="GithubApiError"}}function J(e){var o;const n=e,t=n.repo??n,a=n.starred_at;if(!(t!=null&&t.id)||!t.full_name||!a)throw new Error("Invalid starred payload: missing id/full_name/starred_at (check Accept header)");return{id:t.id,full_name:t.full_name,html_url:t.html_url??`https://github.com/${t.full_name}`,description:t.description??null,language:t.language??null,stargazers_count:t.stargazers_count??0,forks_count:t.forks_count??0,topics:Array.isArray(t.topics)?t.topics:[],updated_at:t.updated_at??new Date(0).toISOString(),starred_at:a,owner_login:((o=t.owner)==null?void 0:o.login)??t.full_name.split("/")[0]??"",archived:!!t.archived,fork:!!t.fork}}function K(e){if(!e)return null;for(const n of e.split(",")){const t=n.match(/<([^>]+)>;\s*rel="next"/);if(t)return t[1]}return null}function Y(e,n){return new Promise((t,a)=>{if(n!=null&&n.aborted){a(new g("Aborted","ABORT"));return}const o=setTimeout(t,e);n==null||n.addEventListener("abort",()=>{clearTimeout(o),a(new g("Aborted","ABORT"))},{once:!0})})}async function B(e,n,t,a=0){if(t!=null&&t.aborted)throw new g("Aborted","ABORT");const o={Accept:z,"X-GitHub-Api-Version":F,"User-Agent":G};n&&(o.Authorization=`Bearer ${n}`);const s=await fetch(e,{headers:o,signal:t}),i=s.headers.get("x-ratelimit-remaining"),p=s.headers.get("x-ratelimit-limit"),m=s.headers.get("x-ratelimit-reset");if(s.status===401)throw new g("Invalid token (401). Clear or replace your PAT.","BAD_TOKEN",401);if(s.status===404)throw new g("User not found.","NOT_FOUND",404);if(s.status===403||s.status===429){const c=s.headers.get("retry-after");let u=1e3*Math.pow(2,a);if(c?u=Number(c)*1e3:i==="0"&&m&&(u=Math.max(0,Number(m)*1e3-Date.now())+Math.random()*500),a>=3)throw new g(`Rate limited. ${n?"Wait and retry.":"Add a PAT (public_repo / read-only) for ~5000 req/h (anonymous ≈60/h)."}`,"RATE_LIMIT",s.status);return await Y(u+Math.random()*500,t),B(e,n,t,a+1)}if(!s.ok)throw new g(`GitHub API error ${s.status}`,"HTTP",s.status);const f=(await s.json()).map(J),$=K(s.headers.get("link"));return{repos:f,next:$,remaining:i!=null?Number(i):null,limit:p!=null?Number(p):null}}async function V(e){var s,i;const n=e.username.trim().replace(/^@/,"");if(!n)throw new g("Username required","HTTP");if(!e.force){const p=D(n);if(p)return(s=e.onPage)==null||s.call(e,0,p.length,null,null),p}let t=`${M}/users/${encodeURIComponent(n)}/starred?per_page=100`;const a=[];let o=0;for(;t;){o+=1;const{repos:p,next:m,remaining:h,limit:f}=await B(t,e.token,e.signal);a.push(...p),(i=e.onPage)==null||i.call(e,o,a.length,h,f),t=m}return U(n,a),a}const A="gsg:pat";function X(){try{return localStorage.getItem(A)??""}catch{return""}}function E(e){try{e?localStorage.setItem(A,e):localStorage.removeItem(A)}catch{}}const P="gsg:tags";function W(){try{const e=localStorage.getItem(P);if(!e)return{};const n=JSON.parse(e);return n&&typeof n=="object"?n:{}}catch{return{}}}function Z(e){try{localStorage.setItem(P,JSON.stringify(e))}catch{}}function Q(e,n){return e[n]??[]}function ee(e,n,t){const a={...e},o=[...new Set(t.map(s=>s.trim()).filter(Boolean))];return o.length===0?delete a[n]:a[n]=o,Z(a),a}function C(e,n,t){const a=n.query.trim().toLowerCase();return e.filter(o=>{if(n.excludeForks&&o.fork||n.language&&o.language!==n.language||n.topic&&!o.topics.includes(n.topic))return!1;if(!a)return!0;const s=Q(t,o.full_name).join(" ");return[o.full_name,o.description??"",o.owner_login,o.topics.join(" "),o.language??"",s].join(" ").toLowerCase().includes(a)})}function te(e,n){const t=[...e];switch(n){case"starred_at":return t.sort((a,o)=>o.starred_at.localeCompare(a.starred_at));case"stars":return t.sort((a,o)=>o.stargazers_count-a.stargazers_count);case"updated":return t.sort((a,o)=>o.updated_at.localeCompare(a.updated_at));case"name":return t.sort((a,o)=>a.full_name.localeCompare(o.full_name));default:return t}}function ne(e){const n=new Map;for(const t of e){const a=t.language||"Unknown";n.set(a,(n.get(a)??0)+1)}return[...n.entries()].map(([t,a])=>({language:t,count:a})).sort((t,a)=>a.count-t.count)}function re(e){const n=new Set;for(const t of e)for(const a of t.topics)n.add(a);return[...n].sort((t,a)=>t.localeCompare(a))}function ae(e){const n=new Set;for(const t of e)t.language&&n.add(t.language);return[...n].sort((t,a)=>t.localeCompare(a))}function N(e,n){const t=URL.createObjectURL(n),a=document.createElement("a");a.href=t,a.download=e,a.click(),URL.revokeObjectURL(t)}function oe(e,n){const t={generated_at:new Date().toISOString(),username:e,count:n.length,repos:n};N(`${e}-stars.json`,new Blob([JSON.stringify(t,null,2)],{type:"application/json"}))}function T(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function se(e,n){const t=JSON.stringify({username:e,repos:n,generated_at:new Date().toISOString()});return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${T(e)} — Starred repos</title>
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
  <h1>★ ${T(e)} stars</h1>
  <input id="q" type="search" placeholder="Search name, description, topics…" autofocus/>
  <span class="meta" id="meta"></span>
</header>
<main class="grid" id="grid"></main>
<script>
const DATA=${t};
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
<\/script>
</body>
</html>`}function ie(e,n){const t=se(e,n);N(`${e}-stars.html`,new Blob([t],{type:"text/html;charset=utf-8"}))}const I=8,r={username:"",repos:[],filters:{query:"",language:null,topic:null,excludeForks:!1},sort:"starred_at",view:"card",tags:W(),loading:!1,progress:"",remaining:null,limit:null,error:null,token:X()};let v=null;const S=document.querySelector("#app");function le(){const e=new URLSearchParams(location.search).get("user");return(e==null?void 0:e.trim())??""}function ce(e){const n=new URL(location.href);e?n.searchParams.set("user",e):n.searchParams.delete("user"),history.replaceState(null,"",n)}function x(e){try{return new Date(e).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"})}catch{return e.slice(0,10)}}function _(e){return e.toLocaleString()}function l(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function y(){return te(C(r.repos,r.filters,r.tags),r.sort)}function de(){return`
  <header class="app-header">
    <div class="brand"><span class="star">★</span> GitHub Stars Gallery</div>
    <form class="user-form" id="user-form">
      <input type="text" id="username" name="username" placeholder="GitHub username" value="${l(r.username)}" autocomplete="username" required />
      <button class="btn btn-primary" type="submit" ${r.loading?"disabled":""}>${r.loading?"Loading…":"Load"}</button>
      <button class="btn" type="button" id="btn-refresh" title="Force refresh" ${r.loading||!r.username?"disabled":""}>↻</button>
    </form>
    <button class="btn btn-ghost" type="button" id="btn-token" title="Optional PAT">${r.token?"🔑 PAT ✓":"🔑 PAT"}</button>
  </header>`}function ue(e){const n=ae(r.repos),t=re(r.repos);return`
  <div class="toolbar">
    <input type="search" id="search" placeholder="Search name, description, owner, topics, local tags…" value="${l(r.filters.query)}" ${r.repos.length?"":"disabled"} />
    <select id="language" ${r.repos.length?"":"disabled"}>
      <option value="">All languages</option>
      ${n.map(a=>`<option value="${l(a)}" ${r.filters.language===a?"selected":""}>${l(a)}</option>`).join("")}
    </select>
    <select id="topic" ${r.repos.length?"":"disabled"}>
      <option value="">All topics</option>
      ${t.map(a=>`<option value="${l(a)}" ${r.filters.topic===a?"selected":""}>${l(a)}</option>`).join("")}
    </select>
    <select id="sort" ${r.repos.length?"":"disabled"}>
      <option value="starred_at" ${r.sort==="starred_at"?"selected":""}>Recently starred</option>
      <option value="stars" ${r.sort==="stars"?"selected":""}>Most stars</option>
      <option value="updated" ${r.sort==="updated"?"selected":""}>Recently updated</option>
      <option value="name" ${r.sort==="name"?"selected":""}>Name A–Z</option>
    </select>
    <label class="meta-row"><input type="checkbox" id="exclude-forks" ${r.filters.excludeForks?"checked":""} ${r.repos.length?"":"disabled"}/> Exclude forks</label>
    <div class="btn-group" style="display:flex;gap:.35rem">
      <button type="button" class="btn ${r.view==="card"?"active":""}" id="view-card" ${r.repos.length?"":"disabled"}>Cards</button>
      <button type="button" class="btn ${r.view==="list"?"active":""}" id="view-list" ${r.repos.length?"":"disabled"}>List</button>
    </div>
    <div class="spacer"></div>
    <button type="button" class="btn" id="export-json" ${e.length?"":"disabled"}>Export JSON</button>
    <button type="button" class="btn" id="export-html" ${e.length?"":"disabled"}>Export HTML</button>
  </div>`}function pe(){const e=[];if(r.loading)e.push(`<div class="progress"><i></i></div><span>${l(r.progress||"Fetching…")}</span>`);else if(r.repos.length){const n=y().length;e.push(`<span class="ok">${_(n)} shown · ${_(r.repos.length)} starred</span>`)}return r.remaining!=null&&r.limit!=null&&e.push(`<span>API remaining: ${r.remaining}/${r.limit}</span>`),r.error&&e.push(`<span class="error">${l(r.error)}</span>`),`<div class="status-bar">${e.join("")||"<span>Enter a GitHub username to load starred repos.</span>"}</div>`}function ge(){if(!r.repos.length)return"";const e=ne(C(r.repos,{...r.filters,language:null},r.tags)),n=e.reduce((s,i)=>s+i.count,0)||1,t=e.slice(0,8),a=e.slice(8).reduce((s,i)=>s+i.count,0),o=[...t];return a&&o.push({language:"Other",count:a}),`
  <section class="stats">
    <div class="stats-bar">
      ${o.map((s,i)=>`<div class="stats-seg lang-palette-${i%I}" style="width:${s.count/n*100}%" title="${l(s.language)}: ${s.count}"></div>`).join("")}
    </div>
    <div class="stats-legend">
      ${o.map((s,i)=>`<span><i class="dot lang-palette-${i%I}"></i>${l(s.language)} ${s.count}</span>`).join("")}
    </div>
  </section>`}function me(e){const n=r.tags[e.full_name]??[];return`
  <article class="card" data-id="${e.id}">
    <h3><a href="${l(e.html_url)}" target="_blank" rel="noopener">${l(e.full_name)}</a>
      ${e.archived?'<span class="badge">archived</span>':""}
      ${e.fork?'<span class="badge">fork</span>':""}
    </h3>
    <p class="desc">${l(e.description||"No description")}</p>
    <div class="meta-row">
      <span class="chip lang">${l(e.language||"—")}</span>
      <span>★ ${_(e.stargazers_count)}</span>
      <span>Starred ${x(e.starred_at)}</span>
      <span>Updated ${x(e.updated_at)}</span>
    </div>
    <div class="topics">${e.topics.slice(0,8).map(t=>`<span class="chip">${l(t)}</span>`).join("")}</div>
    <div class="local-tags">${n.map(t=>`<span class="chip">${l(t)}</span>`).join("")}</div>
    <div class="tag-edit">
      <input type="text" data-tag-input="${l(e.full_name)}" placeholder="Local tags (comma-separated)" value="${l(n.join(", "))}" />
      <button type="button" class="btn" data-tag-save="${l(e.full_name)}">Save</button>
    </div>
  </article>`}function fe(e){return`
  <div class="list-item">
    <div><a href="${l(e.html_url)}" target="_blank" rel="noopener"><strong>${l(e.full_name)}</strong></a></div>
    <p class="desc">${l(e.description||"")}</p>
    <span class="chip lang">${l(e.language||"—")}</span>
    <span class="meta-row">★ ${_(e.stargazers_count)} · ${x(e.starred_at)}</span>
  </div>`}function he(){if(!r.repos.length&&!r.loading)return`<main class="main"><div class="empty"><h2>Turn starred repos into a searchable gallery</h2>
      <p>Load any public GitHub username. Optional PAT raises rate limits. Tags stay in your browser only.</p>
      <p>Try <a href="?user=godfay-g">?user=godfay-g</a> or your own username.</p></div></main>`;const e=y();return!e.length&&r.repos.length?'<main class="main"><div class="empty"><h2>No matches</h2><p>Try clearing filters or search.</p></div></main>':r.view==="list"?`<main class="main"><div class="list">${e.map(fe).join("")}</div></main>`:`<main class="main"><div class="grid">${e.map(me).join("")}</div></main>`}function be(){return`<footer class="app-footer">
    <span>MIT · Client-side only · PAT never leaves your browser for third parties (only GitHub API)</span>
    <span><a href="https://github.com/godfay-g/github-stars-gallery" target="_blank" rel="noopener">Source</a></span>
  </footer>`}function ve(){const e=document.getElementById("token-modal");e&&e.remove();const n=document.createElement("div");n.className="modal-backdrop",n.id="token-modal",n.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true">
      <h2>Optional GitHub PAT</h2>
      <p>Stored in <code>localStorage</code> only. Use a fine-grained token with <strong>read-only</strong> public repo access, or classic <code>public_repo</code>. Never commit tokens.</p>
      <p>Anonymous ≈ 60 req/h · Authenticated ≈ 5,000 req/h.</p>
      <input type="password" id="pat-input" placeholder="ghp_… or github_pat_…" value="${l(r.token)}" autocomplete="off" />
      <div class="modal-actions">
        <button type="button" class="btn" id="pat-clear">Clear</button>
        <button type="button" class="btn btn-ghost" id="pat-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="pat-save">Save</button>
      </div>
    </div>`,document.body.appendChild(n),n.addEventListener("click",t=>{t.target===n&&n.remove()}),n.querySelector("#pat-cancel").addEventListener("click",()=>n.remove()),n.querySelector("#pat-clear").addEventListener("click",()=>{r.token="",E(""),n.remove(),d()}),n.querySelector("#pat-save").addEventListener("click",()=>{const t=n.querySelector("#pat-input").value.trim();r.token=t,E(t),n.remove(),d()})}function ye(){var e,n,t,a,o,s,i,p,m,h,f,$;(e=document.getElementById("user-form"))==null||e.addEventListener("submit",c=>{c.preventDefault();const u=document.getElementById("username").value.trim().replace(/^@/,"");k(u,!1)}),(n=document.getElementById("btn-refresh"))==null||n.addEventListener("click",()=>{r.username&&k(r.username,!0)}),(t=document.getElementById("btn-token"))==null||t.addEventListener("click",ve),(a=document.getElementById("search"))==null||a.addEventListener("input",c=>{var b;r.filters.query=c.target.value,d(),(b=document.getElementById("search"))==null||b.focus();const u=document.getElementById("search");if(u){const w=u.value.length;u.setSelectionRange(w,w)}}),(o=document.getElementById("language"))==null||o.addEventListener("change",c=>{r.filters.language=c.target.value||null,d()}),(s=document.getElementById("topic"))==null||s.addEventListener("change",c=>{r.filters.topic=c.target.value||null,d()}),(i=document.getElementById("sort"))==null||i.addEventListener("change",c=>{r.sort=c.target.value,d()}),(p=document.getElementById("exclude-forks"))==null||p.addEventListener("change",c=>{r.filters.excludeForks=c.target.checked,d()}),(m=document.getElementById("view-card"))==null||m.addEventListener("click",()=>{r.view="card",d()}),(h=document.getElementById("view-list"))==null||h.addEventListener("click",()=>{r.view="list",d()}),(f=document.getElementById("export-json"))==null||f.addEventListener("click",()=>{oe(r.username,y())}),($=document.getElementById("export-html"))==null||$.addEventListener("click",()=>{ie(r.username,y())}),S.querySelectorAll("[data-tag-save]").forEach(c=>{c.addEventListener("click",()=>{const u=c.getAttribute("data-tag-save"),b=S.querySelector(`[data-tag-input="${CSS.escape(u)}"]`);if(!b)return;const w=b.value.split(",").map(q=>q.trim()).filter(Boolean);r.tags=ee(r.tags,u,w),d()})})}function d(){const e=y();S.innerHTML=de()+ue(e)+pe()+ge()+he()+be(),ye()}async function k(e,n){if(e){v==null||v.abort(),v=new AbortController,r.username=e,r.loading=!0,r.error=null,r.progress=n?"Refreshing…":"Loading…",ce(e),n&&H(e),d();try{const t=await V({username:e,token:r.token||void 0,signal:v.signal,force:n,onPage:(a,o,s,i)=>{r.progress=a===0?`Cache hit · ${o} repos`:`Page ${a} · ${o} repos`,r.remaining=s,r.limit=i,d()}});r.repos=t,r.progress=""}catch(t){if(t instanceof g&&t.code==="ABORT")return;t instanceof g&&t.code==="BAD_TOKEN"&&(r.token="",E("")),r.error=t instanceof Error?t.message:String(t),r.repos=[]}finally{r.loading=!1,d()}}}d();const O=le();O&&k(O,!1);
//# sourceMappingURL=index-CvvxWGHs.js.map
