# R27 Source Of Truth Audit

## Gate 0 源码真相与 Gate 1/2 后续状态

R27 已从产品负责人批准的治理提交建立独立 worktree 和安全分支。Git 谱系、运行时代码、
R26 功能、数据库迁移、部署配置和历史功能分支已经完成只读审计。

```text
R27_GATE0_COMPLETE
SOURCE_LINEAGE_UNIFIED
NO_BRANCH_MERGE_REQUIRED
SOURCE_COMPOSITION_APPROVED
PLACEHOLDER_DISPOSITIONS_IMPLEMENTED
R27_RUNTIME_CANDIDATE_COMMIT=359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c
R27_SOURCE_SCAN_COMMIT=27a0338ac0c59217d121fa6defe0feeec45ca252
R27_GATE1_SOURCE_PACKAGE_COMPLETE
R27_GATE2_156_FINDING_TRIAGE_COMPLETE
UNTRIAGED_HISTORICAL_FINDINGS=0
OPEN_NEEDS_SECURITY_REVIEW=13
FORMAL_SECURITY_SCAN_NOT_STARTED
AWAITING_TRIAGE_AND_FIX_LIST_CONFIRMATION
PRODUCTION_UNCHANGED
STOP
```

本报告不代表针对当前不可变基线的正式第一方 SAST、SCA、Secrets、SBOM、许可证、
镜像扫描、业务安全回归或 DAST 已运行。Gate 2 只完成对历史公司 PDF 的逐项研判。

## 不可变身份

| 项目 | 值 |
| --- | --- |
| 原仓库 | `/Users/lixiaochen/Downloads/feishu_timeline_app` |
| 独立 worktree | `/Users/lixiaochen/Downloads/feishu_timeline_app-r27-security` |
| R27 分支 | `security/r27-final-source-clearance` |
| 产品负责人批准的治理基线 | `41b4b166c587692e6f0fb9536dca2e1aab646c70` |
| production runtime/source commit | `535041bb25f21d548d863d07b35e3e952b0aeb2c` |
| production URL | `https://timeline.all-too-well.com` |
| production buildTime | `2026-08-09T06:49:11Z` |
| production release | `r26-admin-535041bb25f2` |
| production database | PostgreSQL `feishu_timeline` |
| R26 Gate 3D staging | `http://localhost:8080`；报告分支 `codex/r26-gate3c2-c3-d-full-lifecycle` |
| R26 Gate 3D staging runtime commit | `UNKNOWN_NOT_RECORDED`；分支证据 tip `85a6267494b5ef4fc259ee836d52e7fc44f732a1` 不能替代运行元数据 |
| R27 Placeholder runtime candidate | `359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c` |
| R27 final source scan commit | `27a0338ac0c59217d121fa6defe0feeec45ca252` |
| migration count | `26` |
| tracked file count | `1171` |
| pnpm-lock SHA-256 | `897bec6a0bf51a3f004ca9c5261606d01f756f50388d926649143ce6a570d9ec` |
| API Dockerfile SHA-256 | `17380e1e7de0255eae6ecb8f5ce56e8f3db12e9313378ff6affabac2a87cc7bf` |
| Web Dockerfile SHA-256 | `56e435169b41e3d42171c6fd568084f4d29ff4a823322472b8dac32980c10148` |

worktree 创建后验证结果：`git status --short` 无输出，`HEAD` 精确等于批准基线，分支名精确为
`security/r27-final-source-clearance`。原仓库中的四个设计草图没有进入此 worktree，也不属于
R27 源码范围。

## Runtime 与治理提交差异

从 production runtime 到治理基线只有两个文档提交：

```text
81fbc6064b79947b0345fabe681f5fd8100258b6 docs(r26): record production release evidence
41b4b166c587692e6f0fb9536dca2e1aab646c70 docs: close R26 product acceptance and prepare R27 security gate
```

差异严格为五个 `docs/**` 文件：

```text
M docs/EXECUTION_LEDGER.md
M docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md
M docs/product/R26_GATE3D_HUMAN_REVIEW.md
A docs/product/R26_PRODUCTION_RELEASE_20260809.md
A docs/rounds/R27.md
```

`apps/**`、`packages/**`、Prisma、Dockerfile、部署配置、package manifest 与
`pnpm-lock.yaml` 的差异均为 0。因此 R27 分支以治理提交为 Git 基线，但实际运行时代码身份继续
单独记录为 `535041bb25f21d548d863d07b35e3e952b0aeb2c`。

## 分支真相矩阵

所有 34 个远端分支相对 production runtime 的独有提交数均为 0。以下 R26 与安全关键分支的
完整 HEAD 都是 production runtime 的祖先，不存在需要重新合并的功能分支。

| Branch | Full commit | 功能范围 | 产品/安全确认 | Runtime 变更 | 建议合入 |
| --- | --- | --- | --- | --- | --- |
| `codex/r26-gate2-read-only-real-data` | `5202c46dfe286ae7b59933b6a1444f87da3ab690` | V2 真实数据只读接入 | 已被 Gate 3D 完整体验接受覆盖 | 是 | 否；已包含 |
| `codex/r26-gate3a-project-member-assignment` | `e52c9d0e6cc213f1b5f4f8609a54517886f7dcb3` | 项目成员、职责与工序分配 | Gate 3A 与完整生命周期证据已接受 | 是 | 否；已包含 |
| `codex/r26-gate3b-progress-materials` | `06d44cd744858a57fe25c16161d652ff26049782` | 进展、阻塞、材料与版本 | 完整生命周期证据已接受 | 是 | 否；已包含 |
| `codex/r26-gate3c1-ordinary-task-completion` | `34a97e101d78f3b37123ef45eb6d2d206a985ee9` | 普通工序完成、并行和非阻塞 | 完整生命周期证据已接受 | 是 | 否；已包含 |
| `codex/r26-gate3c2-c3-d-full-lifecycle` | `85a6267494b5ef4fc259ee836d52e7fc44f732a1` | 第 12～18 步完整生命周期 | `R26_GATE3D_PASSED` | 是 | 否；已包含 |
| `release/r26-v2-production` | `5035f1b0ccbb09cd1990dc75dba6f65dd6a14248` | V2 正式路由与发布门禁 | 已发布历史；R27 将重扫 | 是 | 否；已包含 |
| `fix/r26p-feishu-cn-oauth` | `77fdba8546853f5138cceb7f83876614c270c4df` | 中国区飞书 OAuth | 公共生产 OAuth 链路通过；受保护路由复核待办 | 是 | 否；已包含 |
| `codex/r26-admin-table-control-center` | `ecf4d4728531bafbcf42522254a57672df8d1a59` | 后台项目、工序、权限与审计表格 | 已进入批准扫描基线；生产登录态复核待办 | 是 | 否；已包含 |
| `codex/r26-admin-assignment-grid` | `4e43edd8a6671e3ca6728375f3750d3b5d8b820a` | 分工配置 | 已进入批准扫描基线 | 是 | 否；已包含 |
| `codex/r26-admin-organization-management` | `2466ceb6a2f9b67c27822f10ccaa867f3c4827d9` | 组织与部门管理 | 已进入批准扫描基线 | 是 | 否；已包含 |
| `security/r24-full-reaudit` | `72adbc3ad2ece6dc03b82509aa0af311c55f7147` | SAST/SCA/Secrets/DAST 与配置修复 | R24B 历史门禁通过；R27 必须重新扫描 | 是 | 否；已包含 |
| `release/r25-final-gate` | `1ea034ce9f822e21d6f3c4c60d0cc4b7e7e82669` | 稳定性与发布门禁 | R25 历史门禁通过 | 是 | 否；已包含 |
| `main` runtime | `535041bb25f21d548d863d07b35e3e952b0aeb2c` | 累积产品、后台、OAuth 与迁移最终运行代码 | 已批准作为 R27 runtime source | 是 | 是；作为唯一 runtime source |
| R27 governance | `41b4b166c587692e6f0fb9536dca2e1aab646c70` | R26 验收和 R27 治理文档 | `R27_SOURCE_BASELINE_APPROVED` | 否；仅文档 | 是；作为 R27 Git 基线 |

推荐 merge 顺序：**无**。重新合入任何历史功能分支都会制造重复提交或冲突，不允许执行。

## 最终运行时代码功能覆盖

| 必须覆盖的范围 | 源码证据 | 结论 |
| --- | --- | --- |
| V2 工作台、项目列表与项目工作区 | `apps/web/src/app/v2/**`、`apps/web/src/features/v2/dashboard-page.tsx`、`projects-page.tsx`、`workspace-page.tsx` | 已包含 |
| 实时 18 步流程地图 | `apps/web/src/features/v2/flow-map.tsx`、`real-flow-geometry.ts`、`real-workspace-page.tsx` | 已包含 |
| 项目成员与任务分配 | `apps/api/src/modules/r26-read-model/r26-member-assignment.service.ts`、`apps/web/src/features/v2/r26-gate3-client.ts` | 已包含 |
| 进展、阻塞、材料与版本 | `r26-progress-material.service.ts`、`r26-progress-draft.ts`、`materials-upload-r22.tsx` | 已包含 |
| 普通工序完成、并行、非阻塞、幂等和 409 | `r26-ordinary-completion.service.ts`、`r26-gate3c1-client.ts`、对应单元测试 | 已包含 |
| 第 12 步评审与退回新轮次 | `apps/api/src/modules/reviews/**`、`project-reviews-workspace.tsx`、`lifecycle-actions.ts` | 已包含 |
| 第 13 步固定收费 | `apps/api/src/modules/fees/**`、`fees-workspace.tsx` | 已包含 |
| 第 17 步 12 个月评审 | `workflow-recurring.service.ts`、`reviews.service.ts`、`monthly-review-workspace.tsx` | 已包含 |
| 第 18 步退出治理 | `apps/api/src/modules/color-exits/**`、`color-exit-workspace.tsx` | 已包含 |
| Feishu CN OAuth 与多标签 state 隔离 | `feishu-oauth-provider.ts`、`auth.constants.ts`、`auth.controller.ts` 及回归测试 | 已包含 |
| 后台表格控制中心 | `admin-control-center.controller.ts`、`admin-control-center.service.ts`、`admin-control-center.tsx` | 已包含 |
| 极简后台首页 | `apps/web/src/app/admin/page.tsx`、`admin-dashboard-r22.tsx`、`admin-manage-r26.tsx` | 已包含 |
| 颜色数据库与颜色档案 | `/admin/color-database` 路由、`admin-color-database-r26.tsx`、`admin.service.ts` | 已包含 |
| 权限与审计 | `permissions.guard.ts`、`project-access.service.ts`、`activity-logs/**`、`admin-audit-logs.controller.ts` | 已包含 |
| 上传与浏览器写边界 | `file-upload-options.ts`、`same-origin.middleware.ts` 及测试 | 已包含 |
| 安全扫描脚本 | `scripts/security/**`、`.gitleaks.toml`、根 `security:*` scripts | 已包含；R27 需复核并扩展 |
| Prisma 模型与迁移 | `schema.prisma` 与 26 个 migration | 已包含 |
| Docker、Nginx、systemd、部署脚本与 CI | API/Web Dockerfile、`deploy/**`、`scripts/deploy/**`、`.github/workflows/ci.yml` | 已包含 |

## 源码包边界预检

已执行用户指定的 tracked-file 预检：

```bash
git ls-files | grep -E '(^|/)(node_modules|\.next|dist|coverage|test-results|var/backups)(/|$)'
```

结果无输出。当前没有跟踪 `node_modules`、`.next`、`dist`、coverage、test-results 或
`var/backups`。仓库只跟踪脱敏示例环境文件：`.env.example`、`.env.production.example`、
`apps/api/.env.example`、`apps/web/.env.example`；Gate 1 打包脚本仍必须使用第一方白名单，不能依赖
“当前刚好没有被跟踪”作为唯一排除控制。

## 正式 Placeholder 路由治理结果

产品负责人已明确提供 `R27_GATE0_SOURCE_COMPOSITION_APPROVED` 和
`PLACEHOLDER_DISPOSITIONS_APPROVED`。四项按唯一批准去向实施在不可变 commit
`359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c`：

| URL | 决定 | 最终实现 | 本地验证 |
| --- | --- | --- | --- |
| `/reviews` | `REDIRECTED` | 硬编码服务端 redirect 到 `/projects` | HTTP `307`，Location 精确匹配；单测 PASS |
| `/settings` | `REDIRECTED` | 硬编码服务端 redirect 到 `/admin`；目标权限保持不变 | HTTP `307`，Location 精确匹配；单测 PASS |
| `/colors` | `REDIRECTED` | 硬编码服务端 redirect 到 `/admin/color-database`；目标 scoped read/RBAC 保持不变 | HTTP `307`，Location 精确匹配；单测 PASS |
| `/projects/:projectId/:section` | `REMOVED` | 动态兜底页删除；20 个合法 section 仍有显式页面 | 非法 section HTTP `404`；单测 PASS |

`PagePlaceholder` 在无调用方后删除。正式应用源码的 Placeholder 红线命中为 0；原始 `rg` 仍有
10 行测试负向断言或 Playwright `getByPlaceholder(...)` 选择器，不是生产页面文案。三个跳转均为固定
目标，不接受用户输入，不引入 Open Redirect。这里只证明源码、单测、production build 和本地 HTTP，
未部署 staging/production，也未冒充目标域名验收。

## 未完成项与风险

1. production 正式团队已认证业务路径仍需一次短 smoke；可与源码 SAST 并行，但不得冒充已完成。
2. R26 Gate 3D staging 报告没有记录可验证的 runtime commit；准确值保持
   `UNKNOWN_NOT_RECORDED`，历史分支 tip 只作源码谱系证据。
3. 历史 156 项已逐条研判，但 13 项保持 `NEEDS_SECURITY_REVIEW`，等待当前 SCA 和精确语义复核。
4. 第一方正式 SAST、SCA、Secrets、SBOM、许可证、镜像扫描、业务安全回归与授权 staging DAST
   均未开始，因此当前 Critical/High/Medium 清零尚未建立。
5. 没有新增、合并或挑选任何功能分支；production、`main` 与 tag 均未改变。

## 下一人工闸门

Gate 0 源码组成和四项 Placeholder 去向已经获得确认。Gate 1 源码包与 Gate 2 逐项研判完成后，
必须停在“研判与修复清单确认”人工闸门；建议精确回复：

```text
R27_GATE2_TRIAGE_AND_FIX_LIST_APPROVED
R27_SOURCE_SCAN_COMMIT=27a0338ac0c59217d121fa6defe0feeec45ca252
OPEN_NEEDS_SECURITY_REVIEW=13
```
