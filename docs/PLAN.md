# GitHub Stars Gallery — 整体方案

## 目标
公共开源工具：读取任意 GitHub 账号的 Star 仓库，整理成可搜索、可筛选的 HTML 页面；解决大量 Star 难找、可视化差的问题。项目建在用户 GitHub 新建仓库，可部署到 GitHub Pages。

## 产品形态（MVP）
- **纯前端静态站**（Vite + TypeScript + 轻量 UI），部署 GitHub Pages，无需自建后端。
- 输入 GitHub **用户名**即可拉取公开 Star 列表；可选粘贴 **PAT**（存 localStorage）提高速率上限。
- 输出：浏览器内交互页；可选一键导出单文件 `stars.html` / `stars.json`。
- 可选增强：GitHub Action 定时把本人 Star 快照到 `data/stars.json`，支持离线浏览与演示。

## 核心功能
1. 分页拉取 `/users/{username}/starred`（含 `starred_at`）
2. 搜索：仓库名、描述、owner、topics
3. 筛选：语言、topics、是否 fork、star 数量区间
4. 排序：最近 Star、仓库 stars、最近更新、名称
5. 视图：卡片 / 紧凑列表；按语言聚合统计条
6. 收藏夹内标签（本地）：自定义 tag，写入 localStorage，不污染 GitHub
7. 导出 JSON / 打印友好 HTML

## 非目标（首版不做）
- 多账号同步中心、服务端数据库
- 自动 unstar / 写操作
- 复杂推荐算法

## 技术选型
| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | Vite + TypeScript + 原生/轻量组件 | 易部署 Pages，依赖少 |
| API | GitHub REST `Accept: application/vnd.github.star+json` | 拿 starred_at |
| 部署 | GitHub Pages + Actions | 公共工具标配 |
| 可选 CLI | Node 脚本 `npx`/`bun` 生成静态包 | 给不想开网页的用户 |

## 仓库结构（建议）
```
github-stars-gallery/
  README.md
  package.json
  src/          # UI + API client
  scripts/      # fetch + export
  .github/workflows/pages.yml
  public/
```

## 里程碑
1. **M0**：仓库脚手架 + Pages 空站 + README
2. **M1**：拉 Star + 列表/搜索/语言筛选（可用）
3. **M2**：排序、topics、本地标签、导出
4. **M3**：Action 快照、单文件导出、打磨 UX

## 风险与对策
- **API 限流**：未认证 60/h → 引导 PAT；分页并发节流
- **Star 极多（>5k）**：增量缓存、后台拉取进度条
- **隐私**：PAT 仅存本机；文档强调 scope 最小（`public_repo` 或只读）

## 分工建议
- **工程助手**：架构落地、仓库初始化、PR 节奏
- **后端**：GitHub API 客户端、分页/限流、Action 快照脚本
- **前端**：页面交互、筛选排序、导出 HTML
- **github专家**：新建公开仓、Pages/Actions、权限与 README 徽章
