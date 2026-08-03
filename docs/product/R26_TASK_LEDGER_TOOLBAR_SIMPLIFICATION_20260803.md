# R26 工序总台账工具栏收敛报告

日期：2026-08-03

## 产品要求

`/admin/tasks` 的筛选工具栏只保留左侧搜索框和“查询”按钮，删除右侧全部辅助控件。

## 实施结果

- 保留：搜索输入框、查询按钮。
- 删除：保存视图选择、保存当前视图、显示完整列、导出当前筛选、下载导入模板、导入计划日期。
- 删除了仅为工序导入入口服务的前端文件读取、预览弹窗、写入分支和样式。
- 项目台账与组织人员页面原有的保存视图能力保持不变。
- 后端 API、数据库、权限、工作流状态和业务数据均未修改。

## 自动化验证

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 45 files / 174 tests；API 68 files / 312 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

定向契约测试断言 `/admin/tasks` 只渲染搜索区，并禁止六项已删除控件回归。

## 生产部署身份

```text
environment        production
URL                https://timeline.all-too-well.com/admin/tasks
runtimeCommit      b02927d7cf63657f592b634859dfc025abe748db
buildTime          2026-08-03T01:17:10Z
release            r26-admin-b02927d7cf63
deployment mode    source build + systemd（无容器镜像）
Web upstream       127.0.0.1:3000
API upstream       127.0.0.1:3001
database           production PostgreSQL（migration 本轮跳过）
```

- API `/api/health` 与 Web `/build-info` 均返回同一完整 runtime commit。
- 服务器 HEAD、远端 `origin/main`、Web/API runtime commit 完全一致。
- Web、API、Nginx、PostgreSQL、Redis 均为 active/ready。
- 生产构建的后台 Placeholder 扫描为 0。
- 运行版本截图：`evidence/R26_TASK_LEDGER_TOOLBAR_20260803/01-production-build-info.jpg`。

## 浏览器边界

生产运行版本已用真实浏览器确认；访问受保护的 `/admin/tasks` 时，当前验收浏览器进入飞书账号
选择页。由于本轮没有取得重新登录授权，没有代替产品负责人选择账号。生产代码和运行版本已经
切换，但修改后页面的登录态内视觉结果仍需产品负责人硬刷新后确认。

## 当前状态

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
DEPLOYMENT_ATTEMPTED
DEPLOYMENT_UNVERIFIED
PRODUCTION_ROUTE_AUTHENTICATED_RECHECK_PENDING
MAIN_MERGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
