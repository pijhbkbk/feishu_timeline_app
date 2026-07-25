# R26 生产后台按钮修复验收

## 发布身份

```text
production URL        https://timeline.all-too-well.com
target branch         codex/r26-admin-table-control-center
runtime commit        c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
server HEAD           c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
API runtimeCommit     c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
Web runtimeCommit     c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
buildTime             2026-07-25T13:51:54Z
release               r26-admin-c0a0dc83b6a1
Nginx Web upstream    127.0.0.1:3000
Nginx API upstream    127.0.0.1:3001
deployment time       2026-07-25 21:54 Asia/Shanghai
```

生产验收脚本确认 Web、API、Nginx、PostgreSQL 和 Redis 均为 active；正式后台
路由引用 `AdminControlCenter`，Web/API 后台实现源文件存在，生产后台构建产物
Placeholder 命中数为 0。

## 数据库保护

部署前生成：

`/var/backups/feishu-timeline-db/20260725T134828Z/feishu-timeline.dump`

隔离恢复演练结果：

```text
restore_status        ok
public/restore tables 44 / 44
public/restore users  12 / 12
public/restore projects 1 / 1
public/restore audit logs 44 / 44
```

部署时应用 `20260725183000_r26_admin_control_center`，生产现为 22 个 migration，
`prisma migrate status` 返回 database schema is up to date。

## 原 URL 浏览器复测

使用生产域名、现有真实飞书会话和 Safari 硬刷新后完成：

| 入口 | 结果 |
|---|---|
| 总览“项目”卡片 | 进入 `/admin/projects`，真实项目表格可见 |
| 总览“工序”卡片 | 进入 `/admin/tasks`，9 条真实工序可见 |
| 总览“组织与用户”卡片 | 进入 `/admin/organization`，12 个真实用户可见 |
| 总览“分工与权限”卡片 | 进入 `/admin/assignments`，18 节点分工可见 |
| 总览“流程模板”卡片 | 进入 `/admin/workflow-templates`，18 节点模板可见 |
| 总览“审计与异常”卡片 | 进入 `/admin/audit-logs`，筛选和刷新可用 |
| 顶部 8 个后台标签 | 项目、工序、组织、分工、权限、模板、字典、审计均可进入 |
| 审计“刷新”按钮 | 重新读取成功，无错误态 |

Nginx 访问日志同时记录所有页面与 `/api/admin/*` 请求为 HTTP 200，包括：

- `/api/admin/projects`
- `/api/admin/tasks`
- `/api/admin/organization`
- `/api/admin/assignments`
- `/api/admin/permissions`
- `/api/admin/workflow-templates`
- `/api/admin/dictionaries`
- `/api/admin/audit-logs`
- `/api/admin/saved-views`

部署后 API/Web 日志未发现 `ERROR`、`Exception` 或 `Unhandled`。

## 自动化

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 44 files / 171 tests；API 66 files / 299 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

新增回归会拒绝以下生产发布：

- API、Web 或 server HEAD 与候选 commit 不一致；
- 正式后台路由仍引用 `PagePlaceholder`；
- Web/API 真实后台实现缺失；
- 后台生产构建仍命中占位文案。

## 截图

- `production-admin-overview.jpeg`
- `production-admin-projects.jpeg`
- `production-admin-tasks.jpeg`
- `production-admin-organization.jpeg`
- `production-admin-assignments.jpeg`
- `production-admin-permissions.jpeg`
- `production-admin-workflow-templates.jpeg`
- `production-admin-dictionaries.jpeg`
- `production-admin-audit-logs.jpeg`
- `production-admin-audit-card-click.jpeg`

## 当前状态

```text
CODE_IMPLEMENTED
PRODUCTION_DEPLOYED_EXACT_COMMIT
PRODUCTION_ADMIN_ROUTES_AND_BUTTONS_RETESTED
PRODUCTION_ADMIN_PLACEHOLDERS=0
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
