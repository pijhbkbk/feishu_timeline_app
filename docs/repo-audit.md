# 仓库审计报告

## 1. 当前仓库概览

- 仓库路径：`/Users/lixiaochen/Downloads/feishu_timeline_app`
- Git 分支：`main`
- 包管理：`pnpm workspace`
- Node：`v24.14.0`
- pnpm：`9.15.4`
- npm：`11.9.0`

当前仓库是一个模块化单体 monorepo，已经具备前后端、共享包、本地基础设施、部署脚本和业务模块雏形，不是空仓或纯模板仓库。

## 2. 目录与技术栈识别

### 2.1 Monorepo 结构

- `apps/web`：前端应用，`Next.js 15 + React 19 + TypeScript`
- `apps/api`：后端应用，`NestJS 11 + Prisma 6 + TypeScript`
- `packages/shared`：共享常量与类型构建包
- `apps/api/prisma`：Prisma schema、migrations、seed

### 2.2 本地基础设施

- `docker-compose.yml` 已提供：
  - `postgres:16-alpine`
  - `redis:7-alpine`
- 根脚本已提供：
  - `pnpm dev`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm prisma:migrate`
  - `pnpm prisma:validate`
  - `pnpm prisma:seed`

### 2.3 已识别的部署与运维资产

- `deploy/nginx/*`
- `deploy/systemd/*`
- `scripts/deploy/*`
- `docs/deploy-gce-step*.md`
- `docs/migration/*`

### 2.4 已识别的后端业务模块

当前后端已存在多个模块，说明仓库不是“待开发”，而是“已开发一版待工程化对齐”：

- `auth`
- `feishu`
- `projects`
- `workflows`
- `reviews`
- `attachments`
- `activity-logs`
- `notifications`
- `tasks`
- `dashboard`
- `fees`
- `production-plans`
- `mass-productions`
- `color-exits`
- `development-reports`
- `performance-tests`
- `paint-procurements`
- `standard-boards`
- `pilot-productions`
- `samples`

## 3. 当前已具备能力

### 3.1 工程能力

- 已具备根级统一脚本与 workspace 结构。
- 已具备本地 PostgreSQL / Redis compose 配置。
- 已具备 API health controller。
- 已具备 Prisma schema、migration 和 seed。
- 已具备前后端 build / lint / typecheck / test 命令。

### 3.2 业务能力

- 已有项目管理、流程引擎、评审、附件、日志、待办、通知等主模块。
- 已存在后端控制流程流转的实现，不是前端拼状态。
- 已存在审计日志与通知基础设施。
- 已存在与颜色开发流程相关的多个业务工作区页面。

### 3.3 文档能力

- 已有 `README.md`
- 已有 `docs/DEVELOPMENT.md`
- 已有 `docs/MVP_ACCEPTANCE.md`
- 已有部署与迁移文档

## 4. 当前缺失能力

以下能力在当前仓库内缺失或未形成统一执行底座：

- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R00.md` ~ `R10.md`
- `docs/repo-audit.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `scripts/codex/run-round.sh`
- `scripts/codex/continue.sh`
- `scripts/codex/final-gate.sh`
- 明确的 CI 配置（仓库内未发现 `.github/workflows` 等）

## 5. 与目标架构的关键差异

这是本轮最重要的结论。

### 5.1 差异一：仓库已有流程实现，但与正式文档并未完全对齐

三份正式文档要求：

- 第 12 步不通过退回第 11 步并生成新轮次
- 第 17 步是“整车色差一致性评审”，按月生成 12 个周期实例
- 第 18 步是“颜色退出”，支持人工录入年产量和退出建议

当前仓库现状：

- 已有 18 个 workflow 节点常量与多模块实现
- 但末端流程更接近“一次性闭环 + 颜色退出”，并未落实为“第 17 步周期计划 + 12 个月度实例 + 第 18 步退出治理”的正式模型

结论：

- 当前仓库不是缺流程，而是“流程版本和正式文档目标不一致”
- 后续必须做增量对齐，不能把现有实现当成正式目标已完成

### 5.2 差异二：SLA 仍是占位算法

当前 `workflows.service.ts` 的 `computeDueAt()` 仍使用“项目计划时间比例推算”的方式。

与正式文档的差异：

- 正式文档要求节点级 SLA
- 要求支持工作日、当天、当月内、自然月偏移、人工评审通过时间、每月周期
- 要求企业工作日历

结论：

- 当前超期逻辑可以用于 MVP 近似提示
- 不能视为已经满足正式工作日 SLA 规则

### 5.3 差异三：名称和编号口径尚未完全统一

正式文档使用 01~18 的节点编码与明确命名：

- 13：颜色开发收费
- 16：批量生产
- 17：整车色差一致性评审
- 18：颜色退出

当前仓库存在另一套领域命名与节点语义。

结论：

- 后续必须建立“正式文档口径”与“当前实现口径”的映射
- 不能在 UI、后端和测试中混用两套语义

### 5.4 差异四：包名和仓库命名存在历史遗留

- 根 `package.json` 名称仍是 `feishu-timeline-plugin`
- 但仓库与产品名称已经是“轻卡新颜色开发项目管理系统”

结论：

- 这是可控的历史命名遗留
- 不影响 R00，但后续应在合适轮次清理

## 6. 风险识别

### 6.1 高风险

- 正式文档与当前流程实现差异如果不先冻结，会导致后续每轮目标摇摆
- 工作日 SLA 与周期任务若继续缺位，R03 之后会反复返工
- 当前工作树已有未提交变更，后续执行必须避免覆盖用户已有改动

### 6.2 中风险

- 部署文档和脚本较多，但未发现统一 CI 入口
- 当前仓库已有部分 MVP 验收结论，容易让人误判“已完全满足正式文档”

## 7. 后续执行建议

### 7.1 R00 之后的推进策略

建议继续按轮次推进，但采用“增量纠偏”而不是“推倒重写”：

1. `R01` 先确认本地基础设施、环境变量、health check 和统一命令都能跑。
2. `R02` 再把当前 Prisma 模型与正式文档做差异化补模，不要直接重命名所有历史表。
3. `R03` 重点补齐：
   - 第 12 步新轮次闭环
   - 工作日 SLA
   - 第 17 步周期计划与 12 个月度实例
   - 第 18 步年产量退出建议

### 7.2 当前轮次结论

R00 可行，不需要重大重构决策后才能继续。

但后续必须坚持：

- 先冻结目标语义
- 再增量对齐实现
- 不把当前 MVP 口径直接当成正式文档口径
