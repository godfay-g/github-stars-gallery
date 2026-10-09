# GitHub Stars Gallery

[English](#english) · [中文](#中文)

Turn a GitHub user’s starred repositories into a searchable, filterable gallery. Pure static front-end — deploy on GitHub Pages, optional PAT for higher rate limits, export JSON / offline HTML.

**Live demo:** https://godfay-g.github.io/github-stars-gallery/?user=godfay-g  
**Repo:** https://github.com/godfay-g/github-stars-gallery

![Screenshot](docs/screenshot.png)

---

## English

### Features

- Load public stars by username (`?user=octocat`)
- Pagination via GitHub REST (`Accept: application/vnd.github.star+json` → `starred_at`)
- Optional PAT in `localStorage` (never sent anywhere except GitHub API)
- Progress + rate-limit hints; 15‑minute cache in `localStorage`
- Search (name / description / owner / topics / local tags)
- Filter by language & topic; exclude forks; sort by starred / stars / updated / name
- Card & list views; language distribution bar
- Local custom tags (browser only)
- Export filtered results as JSON or standalone searchable HTML
- CLI: `node scripts/export.mjs <user>`

### Quick start (web)

1. Open the Pages URL (or run locally below).
2. Enter a GitHub username → **Load**.
3. Optional: click **PAT** and paste a token if you hit rate limits.

### Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

### CLI export

```bash
# anonymous (60 req/h) or with token
export GITHUB_TOKEN=ghp_xxx   # optional
node scripts/export.mjs godfay-g
# → data/stars.json + data/stars.html
```

### PAT & privacy

| Mode | Approx. rate limit |
|------|--------------------|
| Anonymous | ~60 requests / hour / IP |
| Authenticated | ~5,000 requests / hour |

**Minimum scopes**

- Classic: `public_repo` (or omit scopes for public read-only fine-grained)
- Fine-grained: Repository permissions → Contents **Read-only** (public repos); no write scopes needed

The token is stored only in your browser `localStorage` under `gsg:pat`. This app does not phone home. Do not commit tokens.

### GitHub Pages

Live site is served from the `gh-pages` branch (built `dist/`).

Sample GitHub Actions workflow (needs a token with `workflow` scope to commit under `.github/workflows/`): see [`docs/pages.workflow.yml`](docs/pages.workflow.yml). Until then, refresh Pages with:

```bash
npm run build
# publish dist/ to gh-pages (example)
git subtree push --prefix dist origin gh-pages   # or any static deploy you prefer
```

---

## 中文

把任意 GitHub 账号的 Star 仓库整理成可搜索、可筛选的图库。纯前端静态站，可部署到 GitHub Pages；可选 PAT 提高限流；支持导出 JSON / 离线 HTML。

### 功能

- 输入用户名拉取公开 Star（支持 `?user=`）
- 分页调用 GitHub API，带 `starred_at`
- PAT 仅存本机 `localStorage`
- 进度与限流提示；本地缓存约 15 分钟
- 搜索、语言 / topics 筛选、排序、卡片/列表、语言分布条
- 本地自定义标签（不写回 GitHub）
- 导出 JSON 与可离线搜索的单文件 HTML
- CLI：`node scripts/export.mjs <user>`

### 本地开发

```bash
npm install
npm run dev
npm run build
```

### PAT 与隐私

匿名约 60 次/小时；带 Token 约 5000 次/小时。最小权限：只读公开仓库即可。Token 只存在浏览器，不会发到第三方。

### License

MIT
