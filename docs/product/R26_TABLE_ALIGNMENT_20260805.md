# R26 后台表格双向居中修复（2026-08-05）

## 产品要求

- 后台表格的表头与单元格文字同时水平、竖直居中。
- 公司部门表中“启用”和“编辑部门”保持清晰间距。
- 检查全部正式后台表格，避免只修复单一路由。

## 实现

- 统一 `.admin-cc-table` 与通用 `.data-table` 的 `text-align: center`、
  `vertical-align: middle`。
- 补齐项目成员、材料、分工配置等 Grid 表格的水平居中、竖直居中规则。
- 公司部门行操作区使用居中布局与 `14px` 间距，避免状态和按钮粘连。
- 权限矩阵最左侧角色列不再例外左对齐，保持表头与数据列一致。

## 本机真实浏览器复核

环境：`http://localhost:8080`，本机 Docker staging、本机 PostgreSQL。

| 路由 | 表头 | 单元格 | 结果 |
|---|---:|---:|---|
| `/admin/projects` | 9 | 153 | 全部 `center / middle` |
| `/admin/tasks` | 11 | 220 | 全部 `center / middle` |
| `/admin/organization` | 8 | 80 | 全部 `center / middle`；操作区 `gap=14px` |
| `/admin/assignments` | 9 | 162 | 全部 `center / middle` |
| `/admin/permissions` | 15 | 135 | 全部 `center / middle` |
| `/admin/audit-logs` | 8 | 200 | 全部 `center / middle` |

截图位于：

`docs/product/evidence/R26_TABLE_ALIGNMENT_20260805/`

## 自动化回归

- `admin-control-center.contract.test.ts` 新增 CSS 合同，锁定表头、单元格双向居中与操作区间距。
- 定向测试：`15 / 15` 通过。
- `pnpm install`、全仓 lint、typecheck、test、Web/API build、Prisma validate 与
  `git diff --check` 全部通过；Web `45 files / 177 tests`，API `68 files / 315 tests`。
- Placeholder 全量原始扫描命中 `22` 行；本轮六个正式后台路由命中 `0`。

## 环境与边界

- 本机 Web 镜像：`feishu-timeline-web:local-table-alignment-20260805`。
- 镜像 manifest digest：
  `sha256:3bbf105d27915a9630189d3a82bb8902e6f378c5fdd3f136d8ec80cbf392f6ed`。
- 本机构建基于源码 HEAD `2081c3920bb5c41578ef9c189477d05f392896ad`，并包含未提交工作树变更；
  不得将该 HEAD 冒充不可变 runtime commit。
- Web、API、Nginx、PostgreSQL 与 Redis 容器均为 healthy；Web/API build metadata 均为
  `runtimeCommit=unknown / release=development`，因此只作为本机验证，不作为生产运行版本证明。
- 未修改 API、数据库、权限、工作流或业务数据。
- 未提交、未推送、未部署 production，`main` 指针与 tag 未改变。

## 当前状态

`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_STAGING_VERIFIED /
PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`
