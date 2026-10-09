# GitHubStarsClient 实现要点（后端）

对齐：`REPO-SCAFFOLD.md` §2 · 前端卡片字段

## 1. 类型：`StarredRepo` 不改

脚手架字段保留。前端 MVP 展示：`full_name`、`description`、`language`、`stargazers_count`、`starred_at`、`topics`、`updated_at`、`archived`；`owner_login`／`html_url`／`id` 拉数与链出去要用。  
`fork`／`forks_count` 先入库不展示，以后要「排除 fork」不用改协议。

## 2. 请求

```
GET https://api.github.com/users/{username}/starred
  ?per_page=100
  &page=1…
Accept: application/vnd.github.star+json
Authorization: Bearer {token}   // 可选；无则匿名
X-GitHub-Api-Version: 2022-11-28
User-Agent: github-stars-gallery
```

映射注意：`star+json` 实际为 `{ starred_at, repo: {…} }`（仓库在 `repo` 内）；兼容扁平 mock。`owner.login` → `owner_login`；缺 `topics` 当 `[]`。

## 3. 分页

- `per_page=100`（上限）
- 跟 `Link: <…>; rel="next"` 直到没有 next；不靠猜测总页
- **串行**翻页（不并发打下一页），避免瞬间打爆限流
- 每页成功回调 `onPage(page, accumulated)`
- 支持 `AbortSignal`：中止后抛／返回已累积由调用方定，建议抛 `AbortError` 且不写半截 cache

## 4. 限流与 429／403

| 情况 | 行为 |
|---|---|
| `403`／`429` 且有 `Retry-After` | 等该秒数 + 抖动（0–500ms），同页最多重试 **3** 次 |
| 有 `x-ratelimit-remaining: 0` | 等到 `x-ratelimit-reset`（unix 秒）再继续 |
| 无 token 且 remaining 低 | 不静默失败；错误信息提示填 PAT（文档：无 token ≈60/h，有 ≈5000/h） |
| 401 | 立即失败：`BAD_TOKEN`，清本地 PAT 由 UI 决定 |

退避：同页重试用指数 `1s → 2s → 4s`，若响应带 `Retry-After` 则以头为准。

## 5. 缓存（`cache.ts`）

- key：`gsg:cache:{username}`
- TTL：**15 min**
- 存：`{ fetchedAt, repos: StarredRepo[] }`
- `fetchAllStarred`：未过期且未 `force` → 直接返回缓存；拉取成功再写入
- PAT **不进** cache blob

## 6. 对外接口（锁定）

```ts
fetchAllStarred(opts: {
  username: string
  token?: string
  signal?: AbortSignal
  force?: boolean            // 忽略缓存
  onPage?: (page: number, accumulated: number) => void
}): Promise<StarredRepo[]>
```

另导出（同模块，给 `scripts/fetch-stars.ts` 复用）：

```ts
mapStarredPayload(raw: unknown): StarredRepo
```

## 7. CLI／Action（M3）

`scripts/fetch-stars.ts`：读 `GITHUB_TOKEN`／`--user`，调同一 client，写 `data/stars.json`（`{ generated_at, username, count, repos }`）。  
Action 只跑脚本，不另写一套分页。

## 8. 测试要点（M2）

- Link 多页拼全
- 429 + Retry-After 只重试当前页
- 无 `starred_at` 的错误 Accept → 显式失败，不默默填 epoch
- abort 中途不污染 cache
