# R20_REAL_WORLD_UAT_AUTOMATION Plan

## 1. 目标

本轮目标是用 Playwright 操作真实网页，按真实业务角色完成“轻卡定制颜色开发项目管理系统”的端到端 UAT 自动化实操测试，并在发现 P0/P1/P2 问题时完成修复、复测和记录。

测试重点不是页面能否打开，而是系统是否能承载真实业务：

- 项目创建、项目列表、项目详情和项目时间线。
- 第 1 步到第 18 步核心流程。
- 第 4 步、第 6 步并行节点自动生成。
- 第 9 步非阻塞主线。
- 第 12 步评审退回和新轮次。
- 第 13 步固定 10000 元收费。
- 第 16 步后第 17 步生成 12 个月度评审实例。
- 第 18 步年产量退出建议和人工最终结论。
- 材料上传、归档、下载和权限。
- 多角色权限边界、未登录访问和 IDOR smoke。
- 数据中心统计一致性。
- 中文化、抽屉交互、桌面和移动端可读性。

## 2. 测试原则

- 不破坏生产数据。
- 完整写入测试优先在 local 或 staging 执行。
- 如果必须在生产验证，只允许使用 `UAT-R20-` 前缀项目做 smoke 级验证，并记录清理方式。
- 不使用假截图或静态数据冒充测试。
- 每个 Playwright 用例必须记录测试项目、预期结果、实际结果和证据。
- P0/P1 必须修复并复测；影响使用的 P2 在本轮尽量修复。

## 3. 测试环境

| 环境 | 用途 | 本轮状态 |
|---|---|---|
| local | 完整写入 UAT、自动修复、全量回归 | 已执行 |
| staging | 推荐后续完整复测环境 | 未提供可用地址 |
| production `https://timeline.all-too-well.com` | 仅建议后续 smoke / 被动验证 | 本轮未做写入测试 |

本轮最终通过结果基于本地 Playwright 自动启动的 Web/API 测试环境。

## 4. 测试角色

| 业务角色 | 自动化模拟角色 | 主要覆盖内容 |
|---|---|---|
| 营销公司 | `project_manager` | 项目创建、市场需求、客户颜色样板 |
| 涂装工艺部 | `process_engineer` | 涂料开发、样板确认、颜色一致性评审 |
| 采购部 | `purchaser` | 涂料采购、采购材料 |
| 质量管理部 | `quality_engineer` | 第 12 步评审、第 17 步月度评审 |
| 生产部 / 涂装厂 | `process_engineer` | 首台生产计划、样车试制、批量生产 |
| 财务部 | `finance` | 第 13 步收费凭证和金额校验 |
| 项目经理 | `project_manager` | 全局进度、数据中心、颜色退出 |
| 普通查看者 | `viewer` | 只读访问和禁止写操作 |
| 未登录用户 | 无登录态 | 登录拦截和接口未授权检查 |

测试账号通过本地 `mock-login` 创建或复用，不在报告中记录明文密码。

## 5. 测试项目

| 项目基准名称 | 用途 |
|---|---|
| `UAT-R20-正常流程-深海蓝` | 标准通过路径、收费、月度评审、颜色退出、UI 证据 |
| `UAT-R20-评审退回-星河银` | 第 12 步不通过、退回第 11 步并生成新轮次 |
| `UAT-R20-非阻塞测试-极光白` | 第 9 步非阻塞、第 4/6 步并行幂等 |
| `UAT-R20-逾期测试-赤霞红` | 逾期项目、数据中心统计 |
| `UAT-R20-权限材料-沙岩灰` | 材料上传、归档、下载、权限隔离 |

自动化实际创建的项目会在基准名称后追加时间戳；测试完成后保留为 UAT 证据，可由测试管理员按 `UAT-R20-` 前缀归档或清理。

## 6. Playwright 用例范围

| 用例 | 文件 | 覆盖场景 |
|---|---|---|
| R20-001 | `apps/web/tests/playwright/r20-guide-dashboard.spec.ts` | 导览、工作台、项目、材料、月度评审、数据中心可用性 |
| R20-002 | `apps/web/tests/playwright/r20-create-project.spec.ts` | 真实网页新建项目 |
| R20-003 | `apps/web/tests/playwright/r20-process-mainline.spec.ts` | 第 1-4 步主线推进和第 5/6 步生成 |
| R20-004 | `apps/web/tests/playwright/r20-parallel-after-step6.spec.ts` | 第 4/6 步并行节点幂等 |
| R20-005 | `apps/web/tests/playwright/r20-nonblocking-step9.spec.ts` | 第 9 步非阻塞主线 |
| R20-006 | `apps/web/tests/playwright/r20-step12-rework.spec.ts` | 第 12 步退回、新轮次和第二轮通过 |
| R20-007 | `apps/web/tests/playwright/r20-fee-fixed-10000.spec.ts` | 第 13 步固定 10000 元且不阻塞主线 |
| R20-008 | `apps/web/tests/playwright/r20-batch-to-monthly-review.spec.ts` | 第 16 步后第 17 步 12 个月度评审 |
| R20-009 | `apps/web/tests/playwright/r20-color-exit.spec.ts` | 第 18 步退出建议和人工结论 |
| R20-010 | `apps/web/tests/playwright/r20-materials.spec.ts` | 材料提交平台和权限 |
| R20-011 | `apps/web/tests/playwright/r20-permissions.spec.ts` | 多角色权限、未登录访问、IDOR smoke |
| R20-012 | `apps/web/tests/playwright/r20-analytics-consistency.spec.ts` | 数据中心统计一致性 |
| R20-013 | `apps/web/tests/playwright/r20-ui-quality.spec.ts` | UI 中文化、状态颜色、抽屉、1440/1920/移动端 |

## 7. 证据目录

| 类型 | 路径 |
|---|---|
| 截图 | `test-results/r20/screenshots/` |
| Trace / 附件 | `test-results/r20/traces/` |
| HTML 报告 | `test-results/r20/reports/playwright-report/` |
| API / 页面快照 | `test-results/r20/api-snapshots/` |
| 每用例记录 | `test-results/r20/exported-test-records/` |
| 视频 | `test-results/r20/videos/` |

`test-results/` 为本地测试证据目录，不入库；报告文档记录证据路径和数量。

## 8. 执行命令

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
pnpm playwright:test:r20
```

## 9. 验收标准

| 结论 | 标准 |
|---|---|
| PASS | 核心流程、关键规则、权限、材料、数据中心、UI 可用性全部通过 |
| PASS_WITH_ISSUES | 核心流程通过，但存在可接受的 P2/P3 体验或环境限制 |
| FAIL | 存在 P0/P1 问题，不能进入正式使用或下一轮验收 |

