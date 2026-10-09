# GitHub Stars Gallery · 仓库脚手架约定（工程助手）

仓库名建议：`github-stars-gallery`（公开）  
形态：Vite + TypeScript 纯前端静态站 → GitHub Pages  
非目标：服务端 DB、unstar / 写操作、复杂推荐

---

## 1. 目录结构

```
github-stars-gallery/
├── README.md                 # 用户向：做什么、怎么用、PAT、Pages 地址
├── LICENSE                   # MIT（公开工具默认）
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .github/
│   └── workflows/
│       ├── pages.yml         # build + deploy Pages
│       └── snapshot-stars.yml  # 可选：定时拉 star → data/stars.json
├── scripts/
│   └── fetch-stars.ts        # CLI：分页拉 starred，写 data/stars.json（后端同学实现）
├── data/
│   └── .gitkeep              # 可选快照；真实 json 可 gitignore 或提交样例
├── public/
│   └── favicon.svg
└── src/
    ├── main.ts
    ├── app.ts                # 挂载与路由级状态（若无路由则单页）
    ├── styles/
    │   └── main.css
    ├── types/
    │   └── star.ts           # StarredRepo、Filters、SortKey、LocalTagMap
    ├── api/
    │   ├── github.ts         # 客户端接口（后端定契约，前端只调）
    │   ├── rate-limit.ts
    │   └── cache.ts          # 内存 + localStorage 短缓存
    ├── state/
    │   ├── store.ts          # stars 列表、筛选、排序
    │   └── tags.ts           # 本地自定义标签（localStorage）
    ├── ui/
    │   ├── layout.ts
    │   ├── search-bar.ts
    │   ├── filters.ts        # language / topics
    │   ├── sort.ts
    │   ├── view-toggle.ts    # 卡片 | 列表
    │   ├── repo-card.ts
    │   ├── repo-list.ts
    │   └── export-menu.ts    # JSON / 单文件 HTML
    └── lib/
        ├── export-json.ts
        └── export-html.ts    # 打成可离线打开的单文件
```

---

## 2. 类型契约（前后端对齐用）

```ts
/** Accept 头需带 application/vnd.github.star+json 才有 starred_at */
export type StarredRepo = {
  id: number
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  updated_at: string          // ISO
  starred_at: string          // ISO，来自 star+json
  owner_login: string
  archived: boolean
  fork: boolean
}

export type SortKey = 'starred_at' | 'stars' | 'updated'
export type ViewMode = 'card' | 'list'

export type Filters = {
  q: string                   // 搜 name / description / topics
  languages: string[]         // 多选，空 = 全部
  topics: string[]
}

/** localStorage key: gsg:tags:{username} */
export type LocalTagMap = Record<string /* full_name */, string[]>
```

`api/github.ts` 建议暴露：

```ts
export type FetchStarsOptions = {
  username: string
  token?: string              // PAT，可选；存在 localStorage，不进仓库
  signal?: AbortSignal
  onPage?: (page: number, accumulated: number) => void
}

export type GitHubStarsClient = {
  /** 自动分页直到 Link 没 next；尊重 403/429 Retry-After */
  fetchAllStarred(opts: FetchStarsOptions): Promise<StarredRepo[]>
}
```

---

## 3. README 骨架约定（github专家 建仓后填）

必须有的章节：
1. **这是什么 / 不是什么**
2. **在线 Demo**（Pages URL 占位）
3. **怎么用**：输入 username → 可选填 PAT → 刷选导出
4. **PAT**：只要 `public_repo` 读权限即可；存在浏览器 localStorage；永不提交
5. **限流**：无 token ≈ 60 次/时；有 token ≈ 5000；Star 多的号建议带 token
6. **本地开发**：`npm i && npm run dev`
7. **部署**：push `main` → Actions → Pages
8. **可选快照**：`snapshot-stars.yml` + `GH_TOKEN` secret；适合公开 Demo 免每次打 API

---

## 4. 里程碑（建议 3 个 PR）

| # | 目标 | 谁主责 | 完成标准 |
|---|------|--------|----------|
| M1 | 脚手架 + 空页 + CI Pages 能亮 | 工程助手 + github专家 | `npm run build` 绿；Pages 出空白壳 |
| M2 | 拉全量 starred + 基础列表 | 后端 + 前端 | 输入用户名能出卡片；分页与 429 处理有测 |
| M3 | 筛选排序 + 本地标签 + 导出 | 前端（后端补 fetch 脚本/Action） | 搜索/语言/topics/三种排序；导出 JSON 与单文件 HTML |

节奏：M1 当天可合；M2/M3 各一个 PR，避免大爆炸。

---

## 5. 配置约定

- 包管理：`npm`（锁 `package-lock.json`）
- Node：`>=20`
- 路径别名：`@/` → `src/`
- 环境：无强制 `VITE_*`；username / token 全走运行时输入 + localStorage
- localStorage keys：
  - `gsg:pat`（可选）
  - `gsg:last_user`
  - `gsg:tags:{username}`
  - `gsg:cache:{username}`（短 TTL，建议 10–30 min）

---

## 6. 建仓阻塞

用户 GitHub 登录名**未在本群确认**。  
历史线索：此前私有仓曾用过 `godfay-g`，**不能当作已确认**。  
@github专家 请准备 `gh repo create godfay-g/github-stars-gallery --public` 流程，等用户在群里或 1:1 确认用户名后再执行。

---

## 7. 请各角色立刻对齐

- @后端开发：按 §2 的 `GitHubStarsClient` 出实现要点（分页 Link、star+json Accept、429 退避）；若要改字段现在说。
- @前端开发：按 §1 `ui/` 定信息架构（筛选条字段、卡片上露出的字段）；有增减直接回。
- @github专家：按 §3/§6 准备建仓 + Pages/Actions 清单，确认用户名后开干。
