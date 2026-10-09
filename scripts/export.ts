/**
 * CLI: fetch a user's starred repos and write stars.json + stars.html.
 * Uses the SAME config schema / category rules as the web app (src/config/schema.ts).
 *
 *   npm run export -- <username> [--config public/config.json] [--lang zh|en] [--token <pat>] [--out data]
 *
 * <username> may be omitted when the config file sets `defaultUser`.
 * Token: --token, or env GITHUB_TOKEN / GH_TOKEN. The token is never written to any output file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isUsername, parseSiteConfigText, resolveLocale, type Locale, type SiteConfigLayer } from '../src/config/schema'
import { buildStandaloneHtml } from '../src/lib/standalone'

const ACCEPT = 'application/vnd.github.star+json'
const API = 'https://api.github.com'

type StarredRow = {
  id: number
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  updated_at: string
  starred_at: string
  owner_login: string
  archived: boolean
  fork: boolean
}

function usage(code = 1): never {
  console.error(`Usage: npm run export -- <username> [--config <config.json>] [--lang zh|en] [--token <pat>] [--out <dir>]
  <username>   optional if the config file sets "defaultUser"
  --config     site config (same format as public/config.json): categories, title, default language
  --lang       language of the generated HTML (default: config defaults.lang, else zh)
  --token      GitHub token (or env GITHUB_TOKEN / GH_TOKEN); never written to output
  --out        output directory (default: data)`)
  process.exit(code)
}

type Args = { username: string | null; token: string; out: string; config: string | null; lang: Locale | null }

export function parseArgs(argv: string[]): Args {
  const args: Args = { username: null, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '', out: 'data', config: null, lang: null }
  const a = [...argv]
  while (a.length) {
    const x = a.shift()!
    if (x === '--token') args.token = a.shift() || ''
    else if (x === '--out') args.out = a.shift() || 'data'
    else if (x === '--config') args.config = a.shift() || null
    else if (x === '--lang') {
      const l = a.shift()
      if (l !== 'zh' && l !== 'en') {
        console.error('--lang must be zh or en')
        usage()
      }
      args.lang = l
    } else if (x === '--help' || x === '-h') usage(0)
    else if (!args.username && !x.startsWith('-')) args.username = x.replace(/^@/, '')
    else {
      console.error('Unknown arg:', x)
      usage()
    }
  }
  return args
}

function loadConfig(path: string | null): SiteConfigLayer {
  if (!path) return parseSiteConfigText(null).value
  let text: string
  try {
    text = readFileSync(resolve(path), 'utf8')
  } catch (e) {
    console.error(`Cannot read config ${path}: ${(e as Error).message}`)
    process.exit(1)
  }
  const res = parseSiteConfigText(text)
  if (res.errors.length) {
    console.warn(`Config ${path}: ${res.errors.length} problem(s), using defaults for these:`)
    for (const e of res.errors) console.warn(`  - ${e}`)
  }
  return res.value
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStarred(raw: any): StarredRow {
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

function parseNext(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAll(username: string, token: string): Promise<StarredRow[]> {
  let url = `${API}/users/${encodeURIComponent(username)}/starred?per_page=100`
  const all: StarredRow[] = []
  let page = 0
  while (url) {
    page += 1
    const headers: Record<string, string> = {
      Accept: ACCEPT,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-stars-gallery-cli',
    }
    if (token) headers.Authorization = `Bearer ${token}`

    let attempt = 0
    let res: Response
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

    const data = (await res.json()) as unknown[]
    const mapped = data.map(mapStarred)
    all.push(...mapped)
    console.log(`Page ${page}: +${mapped.length} (total ${all.length})`)
    url = parseNext(res.headers.get('link'))
  }
  return all
}


async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const cfg = loadConfig(args.config)
  const username = args.username || cfg.config.defaultUser
  if (!username) {
    console.error('No username given and the config has no "defaultUser".')
    usage()
  }
  if (!isUsername(username)) {
    console.error(`Not a valid GitHub username: ${username}`)
    process.exit(1)
  }
  const locale: Locale = args.lang ?? resolveLocale(cfg.config.defaults.lang, process.env.LANG || 'zh')
  const repos = await fetchAll(username, args.token)
  const outDir = resolve(args.out)
  mkdirSync(outDir, { recursive: true })
  const generatedAt = new Date().toISOString()
  writeFileSync(join(outDir, 'stars.json'), JSON.stringify({ username, generated_at: generatedAt, count: repos.length, repos }, null, 2))
  writeFileSync(
    join(outDir, 'stars.html'),
    buildStandaloneHtml({ username, repos, rules: cfg.config.categories, locale, title: cfg.config.site.title[locale], generatedAt }),
  )
  console.log(`Wrote ${repos.length} repos → ${outDir}/stars.json, ${outDir}/stars.html (${cfg.config.categories.length} categories)`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
