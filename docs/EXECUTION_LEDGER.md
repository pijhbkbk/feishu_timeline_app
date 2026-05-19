# EXECUTION_LEDGER.md

> 用途：记录 Codex 每一轮执行情况、验收结果、风险、遗留问题与下一轮决策。
> 要求：每完成一轮，必须更新本文件。

---

## 项目基本信息

- 项目名称：轻卡定制颜色开发项目管理系统
- 当前阶段：R21 项目实时流程地图 UI 实现
- 当前轮次：R21_FLOW_MAP_REALTIME_PROGRESS
- 总体状态：PASSED
- 仓库路径：`/Users/lixiaochen/Downloads/feishu_timeline_app`
- 默认分支：`main`
- 最近更新时间：`2026-05-19`

---

## 冻结业务规则摘要

1. 第 4 步完成后自动并行创建第 5 步和第 6 步。
2. 第 9 步独立进行，不阻塞主线。
3. 第 12 步评审通过时间人工录入。
4. 第 12 步不通过退回第 11 步并生成新轮次。
5. 第 13 步“颜色开发收费”固定金额 10000 元。
6. 第 16 步为“批量生产”。
7. 第 17 步为“整车色差一致性评审”，每月一次，共 12 个月。
8. 第 18 步支持人工录入年产量并给出退出建议。

---

## 总体路线图状态

| Round | 名称 | 状态 | 决策 | 备注 |
|---|---|---|---|---|
| R00 | 仓库审计 + 执行底座搭建 | PASSED | CONTINUE | 已建立执行底座并完成仓库审计 |
| R01 | 工程底座与本地开发环境打通 | PASSED | CONTINUE | 已验证本地基础设施、命令、health check 和启动链路 |
| R02 | 数据库 Schema、迁移脚本、种子数据 | PASSED | CONTINUE | 已补齐流程模板、节点定义扩展、系统参数、工作日历与周期任务基础模型 |
| R03 | 后端领域模型 + 流程引擎核心 | PASSED | CONTINUE | 已补工作日 SLA、月度周期计划生成、退回轮次元数据与流程模板版本化 |
| R04 | 认证、权限、附件、审计、通知调度 | PASSED | CONTINUE | 已补齐权限守卫、项目级访问控制、附件/审计接权、通知扫描与手动触发入口 |
| R05 | API 层与 OpenAPI 文档 | PASSED | CONTINUE | 已补 Swagger、DTO 校验、项目/节点/月度评审/退出治理主接口与权限接入 |
| R06 | 前端骨架与核心业务页面 | PASSED | CONTINUE | 已补前端主业务页、节点详情/轮次历史、固定收费金额展示，并修复附件上传权限错配 |
| R07 | 流程可视化、甘特图、看板、月度评审台账 | PASSED | CONTINUE | 已补流程图、甘特、看板、日历、负责人/部门视图、第 17 步月度评审台账与第 18 步退出建议展示 |
| R08 | 自动化测试体系 | PASSED | CONTINUE | 已补关键单测、权限/附件校验、HTTP E2E 主链路与测试覆盖说明 |
| R09 | 部署脚本、CI/CD、监控、备份、预发布 | PASSED | STOP | 已完成 Docker 化、staging 一键部署、健康检查、回滚脚本与部署文档，等待确认后进入 R10 |
| R10 | UAT、试运行、上线收口 | PASSED | CONTINUE | 已完成 deploy readiness audit、生产部署、HTTPS 验证与 smoke test，并进入生产口径 UAT 收口 |
| R11 | 生产 UAT 与硬门禁收口 | PASSED | CONTINUE | 已完成真实业务口径 UAT、固定收费/权限最小修复、硬门禁证据化与账本收口 |
| R12 | 稳定性、监控、告警、备份恢复 | PASSED | STOP | 已完成生产巡检、增强 health-check、补齐 ops/SSL/5xx/备份脚本、完成备份恢复演练并沉淀运维文档 |
| R13 | UI/UX 精修 + Playwright 浏览器级回归 | PASSED | STOP | 已完成关键页面精修、统一反馈与状态组件、接入 Playwright 5 条关键回归并补齐 CI 入口 |
| Release Closure | 正式发布收口（v1.0.0） | PASSED | STOP | 已完成 main 合并、生产从 main 重部署、release verify / production acceptance，并进入 v1.0.0 tag 收口 |
| R14 | 中文化 UI + 时间线看板 + 实时项目进度驾驶舱 | PASSED | STOP | 已完成中文驾驶舱、项目时间线看板、单项目详情时间线、月度评审看板优化和聚合 API |
| R14_PPT_UI_IMPLEMENTATION | PPT UI 蓝图实装 + 线上部署 | PASSED | STOP | 已按 PPT 结构补齐材料中心、月度评审总账、数据中心、项目列表筛选、详情刷新与线上部署闭环 |
| R16 | UI 自动化验收 + 业务流程网页测试与迭代修复 | PASSED | STOP | 已补 Playwright 网页级业务 UAT、稳定选择器、正式中文文案和节点展示顺序保护 |
| R19 | 公司私有云与飞书工作台上线前安全准入 | BLOCKED | STOP | 代码与本地安全扫描已收口；私有云主机、飞书后台、镜像和 staging 证据待公司侧提供 |
| R20 | 真实业务场景自动化实操测试与迭代修复 | PASSED | CONTINUE | 已完成 13 条 R20 真实浏览器 UAT；全量 Playwright 28/28 通过 |
| R21 | 项目实时流程地图 UI 实现 | PASSED | STOP | 已完成单项目实时流程地图、聚合 API、节点抽屉、风险筛选、自动刷新与全量回归 |

状态枚举建议：

- `NOT_STARTED`
- `IN_PROGRESS`
- `PASSED`
- `FAILED`
- `BLOCKED`
- `SKIPPED`

---

## 当前阻塞项

- 无

---

## 当前技术假设

- 前端：`Next.js 15 + React 19 + TypeScript`
- 后端：`NestJS 11 + TypeScript`
- 数据库：`PostgreSQL 16（本地 compose）`
- ORM：`Prisma 6`
- 缓存/调度：`Redis 7（本地 compose）`
- 测试框架：`Vitest + Playwright`
- 包管理：`pnpm workspace`
- 部署方式：`Docker Compose + GCE/systemd + Nginx`

---

## 总体验收硬门禁

- [x] 流程主线可跑通到第 16 步
- [x] 第 12 步不通过可退回第 11 步新轮次
- [x] 第 9 步不阻塞主线
- [x] 第 17 步自动生成 12 个按月实例
- [x] 第 13 步固定金额 10000
- [x] 第 18 步支持人工录入年产量
- [x] 关键动作具备审计日志
- [x] staging 部署可重复执行

### 硬门禁证据索引

- `docs/UAT_R11.md`：覆盖 1→16 主线、第 12 步退回新轮次、第 9 步不阻塞、第 17 步 12 个月实例、第 18 步退出建议、权限验收与审计日志证据
- `docs/TEST_COVERAGE_R08.md`：覆盖工作流、权限、附件、月度评审、退出治理与固定收费规则的自动化测试基线
- `docs/STAGING_DEPLOYMENT.md`：覆盖 staging 一键部署、健康检查、迁移/seed 说明与回滚入口
- `docs/UI_REFINEMENT_R13.md`：覆盖页面标题、按钮、状态色、反馈组件、关键工作区精修口径与浏览器回归入口
- `docs/UI_TIMELINE_BOARD_R14.md`：覆盖中文项目进度驾驶舱、时间线看板、状态颜色规则、自动刷新策略和后续优化项
- `docs/UAT_WEB_TEST_R16.md`：覆盖 R16 网页 UAT 策略、稳定选择器、18 步测试基准、测试项目和线上只读 smoke
- `docs/PLAYWRIGHT_TEST_REPORT_R16.md`：覆盖 R16 专项 Playwright、全量 Playwright 和全部门禁命令结果
- `docs/UI_ISSUES_AND_FIXES_R16.md`：覆盖 R16 发现的问题分级、修复项和延期优化项
- `docs/testing/R20_TEST_RUN_REPORT.md`：覆盖 R20 真实浏览器 UAT 13 条用例、测试项目、角色、证据路径和执行结果
- `docs/testing/R20_FINAL_ACCEPTANCE.md`：覆盖第 4/6/9/12/13/16/17/18 关键规则、材料、权限、数据中心和 UI 验收结论

---

## Round 记录模板（复制使用）

````md
## Round RXX

### Goal
<本轮目标>

### Scope
<修改范围>

### Inputs Read
- AGENTS.md
- docs/EXECUTION_LEDGER.md
- docs/rounds/RXX.md
- <其他文档>

### Files Changed
- path/a
- path/b

### Commands Run
```bash
<命令>
```

### Acceptance Result
- [x] 通过项 A
- [ ] 未通过项 B

### Risks / Debt
- ...

### Decision
CONTINUE / STOP

### Next Round
RXX
````

---

## 执行记录

> 从 R00 开始，按时间顺序追加。

### Round R00

#### Goal
建立当前仓库的轮次执行底座，审计现有工程能力与目标文档差异，并给出后续轮次的真实推进基线。

#### Scope
- 建立 `docs/rounds/R00.md` ~ `R10.md`
- 建立 `docs/repo-audit.md`
- 建立 `docs/ARCHITECTURE_DECISIONS.md`
- 建立 `docs/ACCEPTANCE_CHECKLIST.md`
- 建立 `scripts/codex/*`
- 更新 `AGENTS.md`
- 更新本账本

#### Inputs Read
- `/Users/lixiaochen/Downloads/codex_templates/AGENTS.md`
- `/Users/lixiaochen/Downloads/codex_templates/docs/EXECUTION_LEDGER.md`
- `/Users/lixiaochen/Downloads/codex_templates/docs/rounds/R00.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`
- `docker-compose.yml`

#### Files Changed
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/repo-audit.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/rounds/R00.md`
- `docs/rounds/R01.md`
- `docs/rounds/R02.md`
- `docs/rounds/R03.md`
- `docs/rounds/R04.md`
- `docs/rounds/R05.md`
- `docs/rounds/R06.md`
- `docs/rounds/R07.md`
- `docs/rounds/R08.md`
- `docs/rounds/R09.md`
- `docs/rounds/R10.md`
- `scripts/codex/run-round.sh`
- `scripts/codex/continue.sh`
- `scripts/codex/final-gate.sh`

#### Commands Run
```bash
pwd
ls -la
find . -maxdepth 3 -type f | sed 's#^\./##' | sort | head -n 300
node -v || true
pnpm -v || true
npm -v || true
git status --short
cat package.json
find . -maxdepth 3 \( -name "package.json" -o -name "pnpm-workspace.yaml" -o -name "turbo.json" -o -name "nx.json" \) | sort
sed -n '1,260p' AGENTS.md
sed -n '1,220p' README.md
sed -n '1,240p' apps/api/package.json
sed -n '1,240p' apps/web/package.json
sed -n '1,220p' packages/shared/package.json
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' /Users/lixiaochen/Downloads/codex_templates/AGENTS.md
sed -n '1,260p' /Users/lixiaochen/Downloads/codex_templates/docs/EXECUTION_LEDGER.md
sed -n '1,260p' /Users/lixiaochen/Downloads/codex_templates/docs/rounds/R00.md
sed -n '1,220p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md
sed -n '1,260p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md
sed -n '1,260p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
git branch --show-current
scripts/codex/run-round.sh R00
pnpm install --frozen-lockfile
```

#### Acceptance Result
- [x] 能清楚识别当前仓库结构与技术栈
- [x] `docs/repo-audit.md` 已生成且内容完整
- [x] `scripts/codex/*` 基础脚本已存在
- [x] `docs/ARCHITECTURE_DECISIONS.md` 已生成
- [x] `docs/ACCEPTANCE_CHECKLIST.md` 已生成
- [x] `docs/EXECUTION_LEDGER.md` 已更新
- [x] 已给出后续轮次命令基线和风险提示

#### Risks / Debt
- 当前仓库与三份正式文档存在明显范围差异，需在后续轮次增量对齐。
- 当前仓库末端流程尚未实现正式文档要求的“第 17 步 12 个月度实例 + 第 18 步退出治理”。
- 当前工作树存在用户未提交改动，后续轮次必须避免覆盖。

#### Decision
CONTINUE

#### Next Round
R01

### Round R01

#### Goal
打通本地开发环境、数据库容器、缓存容器、环境变量模板、统一开发命令与 health check，并验证前后端可分别启动。

#### Scope
- 验证 Docker Compose、环境变量模板、health check、统一命令
- 修复影响开发态启动的工程底座问题
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R01.md`
- `docs/repo-audit.md`
- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docker-compose.yml`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/package.json`

#### Files Changed
- `apps/api/package.json`
- `apps/api/src/infra/redis/redis.service.ts`
- `apps/api/src/infra/redis/redis.module.ts`
- `apps/api/src/infra/storage/object-storage.service.ts`
- `apps/api/src/infra/storage/storage.module.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,220p' .env.example
sed -n '1,260p' apps/api/.env.example
sed -n '1,220p' apps/web/.env.example
sed -n '1,220p' apps/api/src/modules/health/health.controller.ts
docker compose up -d postgres redis
docker info
open -a Docker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm typecheck
pnpm install
pnpm --filter @feishu-timeline/api dev
curl -fsS http://localhost:3001/api/health
pnpm --filter @feishu-timeline/web dev
curl -I http://localhost:3000
```

#### Acceptance Result
- [x] 本地 PostgreSQL 可启动
- [x] 本地 Redis 可启动
- [x] 前后端可分别启动
- [x] 至少存在一个 health check
- [x] 存在统一开发命令
- [x] 环境变量模板完整
- [x] 账本已更新

#### Risks / Debt
- `pnpm typecheck` 首次执行依赖 `.next/types`，需要先有一次 Next build 才能稳定通过；后续可考虑继续收敛为更稳的前端 typecheck 策略。
- `apps/api` 原 `dev` 脚本使用 `tsx watch`，会丢失 Nest 运行时注入元数据；本轮已改为 `ts-node` 方案。
- 当前仓库虽然已能本地启动，但正式文档要求的周期任务和退出治理能力仍未在模型层落地。

#### Decision
CONTINUE

#### Next Round
R02

### Round R02

#### Goal
将三份正式文档中的核心数据模型落地为 Prisma schema、migration 与 seed，并保证空库可重复初始化。

#### Scope
- 扩展 Prisma schema 的流程模板、节点定义、周期计划、系统参数、工作日历与颜色退出字段
- 生成并应用正式 migration
- 更新 seed 初始化角色、权限、18 个节点定义、关键参数和工作日历
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R02.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/migrations/*`

#### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/migrations/20260419120000_r02_process_foundation/migration.sql`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' apps/api/prisma/schema.prisma
sed -n '1,320p' apps/api/prisma/seed.ts
rg -n "model (RolePermission|WorkflowNodeDefinition|ProcessTemplate|WorkCalendar|SystemParameter|RecurringPlan|RecurringTask|WorkflowInstance|WorkflowTask|ColorExit)|enum (WorkflowDurationType|ProcessTemplateStatus|WorkCalendarDayType|RecurringPlanStatus|RecurringTaskStatus|SystemParameterValueType|ColorExitSuggestion)" apps/api/prisma/schema.prisma
sed -n '260,940p' apps/api/prisma/schema.prisma
sed -n '320,1200p' apps/api/prisma/seed.ts
pnpm --filter @feishu-timeline/api prisma:validate
docker compose ps
pnpm exec dotenv -e .env.example -- prisma migrate dev --schema prisma/schema.prisma --name r02_process_foundation
find . -type d -name '20260324022432_feishutimeline'
pnpm exec dotenv -e .env.example -- prisma migrate status --schema prisma/schema.prisma
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select migration_name, finished_at from _prisma_migrations order by finished_at;"
pnpm exec dotenv -e .env.example -- prisma migrate reset --schema prisma/schema.prisma --force --skip-seed
pnpm exec prisma migrate diff --from-url "postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public" --to-schema-datamodel prisma/schema.prisma --script
pnpm exec dotenv -e .env.example -- prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @feishu-timeline/api prisma:seed
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select code, version, status, \"isDefault\" from process_templates; select count(*) as workflow_nodes_with_step_code from workflow_node_definitions where \"stepCode\" is not null; select count(*) as work_calendar_rows from work_calendar; select category, code, \"valueType\" from system_parameters order by category, code; select count(*) as role_permission_rows from role_permissions;"
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select \"stepCode\", \"nodeCode\", name, \"durationType\", \"durationValue\", \"isBlocking\", \"isDecisionNode\", \"allowRework\", \"allowManualDueAt\", \"defaultChargeAmount\" from workflow_node_definitions where \"stepCode\" in ('04','06','12','16') order by \"stepCode\";"
pnpm --filter @feishu-timeline/api build
```

#### Acceptance Result
- [x] 空库可成功迁移
- [x] 空库可成功 seed
- [x] `workflow_node_definitions` 中已有 18 个带 `stepCode` 的节点
- [x] 第 4、6、12、16 节点的规则字段已初始化到位
- [x] 固定收费金额 10000 已初始化到 `system_parameters`
- [x] 数据库唯一约束、索引和外键已补齐，可拦截明显脏数据
- [x] 账本已更新

#### Risks / Debt
- 当前仓库仍沿用既有命名：`workflow_instances/workflow_tasks/review_records/notifications` 对应模板中的 `process_instances/node_instances/approval_records/notification_logs`，后续实现需持续遵守这套映射，避免再并行造一套表。
- 本地开发库此前存在一条仓库缺失 migration，R02 为完成验收已对开发库做 reset；后续若团队共享数据库，需要统一迁移来源，避免再次出现 drift。
- 第 17 步和第 18 步的数据结构已落地，但调度生成、状态推进和退出判定服务尚未实现，属于 R03 及后续轮次。

#### Decision
CONTINUE

#### Next Round
R03

### Round R03

#### Goal
实现项目创建自动建流程、主链路状态机增强、工作日 SLA 计算、月度周期计划生成和 11/12 轮次闭环基础能力。

#### Scope
- 新增工作日/SLA 服务
- 新增月度周期计划服务
- 改造 `WorkflowsService` 接入节点级 SLA、周期任务生成与轮次元数据
- 补单元测试
- 更新冻结规则文档与本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R03.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/reviews/reviews.service.ts`
- `apps/api/src/modules/mass-productions/mass-productions.service.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`

#### Files Changed
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflows.module.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflow-date.utils.ts`
- `apps/api/src/modules/workflows/workflow-deadline.service.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.ts`
- `apps/api/src/modules/workflows/workflow-deadline.service.spec.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R03.md
find apps/api/src -maxdepth 3 -type f | rg '/(workflows|projects|reviews|activity-logs|notifications|attachments)/.*\.ts$' | sort
rg -n "class .*Service|Controller\(|@Controller|transition|workflow|review|audit|notification|attachment" apps/api/src/modules apps/api/src/infra -g '*.ts'
sed -n '1,520p' apps/api/src/modules/workflows/workflow-node.constants.ts
sed -n '1,940p' apps/api/src/modules/workflows/workflows.service.ts
sed -n '1,320p' apps/api/src/modules/workflows/workflow-acceptance.spec.ts
sed -n '1,320p' apps/api/src/modules/projects/projects.service.ts
sed -n '1,640p' apps/api/src/modules/reviews/reviews.service.ts
sed -n '1,520p' apps/api/src/modules/mass-productions/mass-productions.service.ts
sed -n '1,560p' apps/api/src/modules/color-exits/color-exits.service.ts
sed -n '538,620p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
sed -n '878,970p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
```

#### Acceptance Result
- [x] 可通过后端服务创建项目并生成流程
- [x] 主链路规则可推进到第 16 步，且第 9、13 步保持非阻塞支线
- [x] 第 12 步不通过会生成第 11 步新轮次，并保留退回来源与整改原因
- [x] 第 16 步完成后可自动创建第 17 步周期计划并生成 12 条月度实例
- [x] 工作日 SLA 算法可运行，并能刷新活跃任务 `overdueDays`
- [x] 账本已更新

#### Risks / Debt
- 当前第 17 步是“workflow task 入口 + recurring_plan / recurring_tasks”并存的混合实现，尚未完全替换旧的一次性第 17 步工作区逻辑。
- 当前只完成了“第 16 步触发第 17 步计划”，尚未完成“12 条月度任务全部完成后自动创建第 18 步”的完整收口。
- `effectiveDueAt/overdueDays` 已进入流程核心，但还未全面接入所有查询与前端展示。

#### Decision
CONTINUE

#### Next Round
R04

### Round R04

#### Goal
补齐认证、RBAC、项目级访问控制、附件/审计权限接入，以及通知扫描与月度任务调度的运行能力。

#### Scope
- 建立权限装饰器、权限守卫与角色权限映射
- 为附件、审计日志、内部通知调度入口接入权限与项目级访问控制
- 扩展通知队列，补到期提醒、逾期提醒和月度评审调度扫描
- 补充对应单元测试
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R04.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/api/src/modules/auth/*`
- `apps/api/src/modules/attachments/*`
- `apps/api/src/modules/activity-logs/*`
- `apps/api/src/modules/notifications/*`
- `apps/api/src/modules/queue/*`
- `apps/api/src/modules/users/users.service.ts`

#### Files Changed
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/auth.types.ts`
- `apps/api/src/modules/auth/permissions.decorator.ts`
- `apps/api/src/modules/auth/permissions.guard.ts`
- `apps/api/src/modules/auth/permissions.guard.spec.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/auth/project-access.service.spec.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/attachments/attachments.module.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/attachments/attachments.controller.spec.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.service.spec.ts`
- `apps/api/src/modules/activity-logs/activity-logs.module.ts`
- `apps/api/src/modules/activity-logs/activity-logs.controller.ts`
- `apps/api/src/modules/activity-logs/activity-logs.service.ts`
- `apps/api/src/modules/activity-logs/activity-logs.service.spec.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/queue/internal-notifications.controller.ts`
- `apps/api/src/modules/queue/internal-notifications.controller.spec.ts`
- `apps/api/src/modules/queue/notification-queue.service.ts`
- `apps/api/src/modules/queue/notification-queue.service.spec.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api start:dev
curl -fsS http://localhost:3001/api/health
curl -i -c /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/auth/mock-login -H 'Content-Type: application/json' -d '{"roleCodes":["admin"]}'
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-due-reminder-scan
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-monthly-review-schedule
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-overdue-scan
```

#### Acceptance Result
- [x] 不同角色可得到不同访问结果
- [x] 附件元数据可保存
- [x] 关键动作具备审计记录
- [x] 调度任务可被手动触发和自动触发
- [x] 通知日志可写入数据库
- [x] 账本已更新

#### Risks / Debt
- 本轮完成的是权限与项目级访问控制基础设施，当前已明确接入附件、审计日志和内部通知管理入口；其余项目域接口仍需在后续轮次继续接权。
- 月度评审调度当前覆盖“第 17 步计划实例提醒与逾期标记”，尚未补完“12 个周期实例全部完成后自动创建第 18 步”的收口逻辑。
- `mock-login` 和内部通知入口已可用于开发验收，但正式 Feishu 登录联调和外部通知通道稳定性仍需后续环境验证。

#### Decision
CONTINUE

#### Next Round
R05

### Round R05

#### Goal
将后端能力整理为稳定 API，并补齐 Swagger/OpenAPI、DTO 校验、主业务接口权限接入，以及第 17/18 步的查询与治理入口。

#### Scope
- 为主业务接口补 DTO 与参数校验
- 挂载 Swagger/OpenAPI 文档
- 补齐项目、节点、第 17 步月度评审、第 18 步颜色退出相关接口
- 将项目级访问控制接入项目/流程/颜色退出主路径
- 补控制器元数据测试与基础单测适配
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R05.md`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/projects/*`
- `apps/api/src/modules/workflows/*`
- `apps/api/src/modules/color-exits/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/tasks/*`
- `apps/api/src/modules/reviews/*`

#### Files Changed
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.module.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/projects/projects.controller.spec.ts`
- `apps/api/src/modules/projects/projects.service.spec.ts`
- `apps/api/src/modules/projects/dto/project-member.dto.ts`
- `apps/api/src/modules/projects/dto/create-project.dto.ts`
- `apps/api/src/modules/projects/dto/update-project.dto.ts`
- `apps/api/src/modules/projects/dto/replace-project-members.dto.ts`
- `apps/api/src/modules/projects/dto/project-list-query.dto.ts`
- `apps/api/src/modules/workflows/workflows.controller.ts`
- `apps/api/src/modules/workflows/workflows.module.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflows.controller.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `apps/api/src/modules/workflows/dto/workflow-action.dto.ts`
- `apps/api/src/modules/workflows/dto/save-workflow-task-form.dto.ts`
- `apps/api/src/modules/color-exits/color-exits.controller.ts`
- `apps/api/src/modules/color-exits/color-exits.module.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/src/modules/color-exits/color-exits.controller.spec.ts`
- `apps/api/src/modules/color-exits/dto/color-exit-write.dto.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.spec.ts`
- `pnpm-lock.yaml`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api add @nestjs/swagger swagger-ui-express class-validator class-transformer
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api start:dev
curl -I http://localhost:3001/api/docs
curl -fsS http://localhost:3001/api/docs-json | head -c 300
curl -i -c /tmp/codex_api_cookie_r05.txt -X POST http://localhost:3001/api/auth/mock-login -H 'Content-Type: application/json' -d '{"roleCodes":["admin"]}'
curl -fsS -b /tmp/codex_api_cookie_r05.txt 'http://localhost:3001/api/projects?page=1&pageSize=2'
curl -i -b /tmp/codex_api_cookie_r05.txt -X POST http://localhost:3001/api/projects -H 'Content-Type: application/json' -d '{"name":"invalid"}'
curl -i http://localhost:3001/api/projects
curl -i -b /tmp/codex_api_cookie_guest.txt -X POST http://localhost:3001/api/internal/notifications/process-overdue-scan
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/stage-overview
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx/history-rounds
```

#### Acceptance Result
- [x] OpenAPI 文档可打开
- [x] 主业务接口可调通
- [x] 权限错误码清晰
- [x] 参数校验可用
- [x] 幂等接口边界清晰
- [x] 账本已更新

#### Risks / Debt
- R05 已补齐项目、节点、第 17 步月度评审查询、第 18 步颜色退出的 API 主路径，但仓库里仍存在若干历史业务控制器沿用手写 payload 解析，后续前端接入时要继续收敛接口风格。
- 第 17 步当前补的是 recurring plan / recurring task 查询接口；月度评审写动作仍复用既有 `reviews/consistency` 评审接口，尚未完全统一为单一 API 视图。
- `mock-login` 在未显式传角色时会回落到默认角色，这对开发验收方便，但也意味着“空权限用户”场景不能直接靠该入口验证。

#### Decision
CONTINUE

#### Next Round
R06

### Round R06

#### Goal
完成前端主业务闭环，覆盖登录、新建项目、项目详情、流程页、轮次历史、第 13 步固定收费金额展示，以及附件上传交互。

#### Scope
- 补齐登录页、项目新建/详情/流程相关前端交互
- 接入 R05 新增的节点详情与轮次历史接口
- 固化第 13 步收费金额 10000 的前端展示与提交约束
- 联调附件上传工作区
- 修复验收过程中暴露的前后端权限错配
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R06.md`
- `apps/web/src/app/**/*`
- `apps/web/src/components/**/*`
- `apps/web/src/lib/**/*`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/fees-workspace.tsx`
- `apps/web/src/components/fees-workspace.test.tsx`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/lib/fees-client.ts`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/api/prisma/seed.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,240p' docs/rounds/R06.md
rg -n "mock-login|login|projectId|workflow|fees|attachments" apps/web/src/app apps/web/src/components apps/web/src/lib
sed -n '1,240p' apps/web/src/app/login/page.tsx
sed -n '1,320p' apps/web/src/components/project-editor.tsx
sed -n '320,620p' apps/web/src/components/project-editor.tsx
sed -n '1,280p' apps/web/src/components/project-workflow-workspace.tsx
sed -n '280,620p' apps/web/src/components/project-workflow-workspace.tsx
sed -n '1,260p' apps/web/src/components/attachments-workspace.tsx
sed -n '1,520p' apps/web/src/components/fees-workspace.tsx
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web test
pnpm --filter @feishu-timeline/web build
open -a Safari 'http://localhost:3000/login'
open -a Safari 'http://localhost:3000/projects/new'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/workflow'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/fees'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/attachments'
curl -s -c /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{"username":"mock_project_manager","roleCodes":["project_manager"]}' http://localhost:3001/api/auth/mock-login
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects?page=1&pageSize=10'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqof00n49klrs95jckfe'
curl -s -X POST -b /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{}' 'http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx/reject'
curl -s -X POST -b /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{}' 'http://localhost:3001/api/workflows/tasks/cmo6ug2qm00109kf0cgjjxi9w/complete'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/tasks/cmo6ugayn001a9kf0al5g3ido'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/tasks/cmo6ugayn001a9kf0al5g3ido/history-rounds'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/fees'
rg -n "attachment.manage|rolePermissionMap|permissionCodes" apps/api/src apps/api/prisma -g '!**/*.spec.ts'
sed -n '1,200p' apps/api/src/modules/auth/auth.constants.ts
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/auth/permissions.guard.spec.ts src/modules/attachments/attachments.controller.spec.ts
curl -s -b /tmp/r06_pm_cookie.txt -F "file=@/tmp/r06-attachment-XXXXXX.txt;type=text/plain" -F 'entityType=PROJECT' -F 'entityId=cmo6srqof00n49klrs95jckfe' 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments/upload'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments/by-entity?entityType=PROJECT&entityId=cmo6srqof00n49klrs95jckfe'
```

#### Acceptance Result
- [x] Mock 登录、新建项目与项目概览前端可用
- [x] 流程页已接入节点详情、轮次历史与时间线，且第 12 步驳回后可看到第 11 步回退与第 12 步第 2 轮
- [x] 第 13 步固定金额 10000 在前端以只读方式展示
- [x] 附件上传入口、上传接口与附件列表读写链路可用
- [x] 验收中发现的项目经理/评审人附件权限错配已修复并补测试
- [x] 账本已更新

#### Risks / Debt
- R06 的第 12 步联调主要基于演示种子项目完成，未从全新项目逐步人工点击 1~12 全链路。
- 已完成项目的种子收费记录仍保留旧的 `TESTING/8600` 演示数据，和冻结后的“固定 10000”规则不一致，后续应清理种子数据口径。
- 当前流程页动作仍是无评论快捷执行，`REJECT/RETURN` 的原因录入体验可以在后续轮次继续加强。

#### Decision
CONTINUE

#### Next Round
R07

### Round R07

#### Goal
提升系统可视化与工程现场可读性，完成流程图、甘特图、看板、截止日历、第 17 步月度评审台账和第 18 步颜色退出页。

#### Scope
- 补齐流程页的流程图、甘特图、看板、截止日历展示
- 在任务页增加负责人视图与部门视图
- 在评审页补齐第 17 步 12 个月度评审台账和周期详情
- 在颜色退出页补齐年产量、退出阈值、系统建议、人工结论、生效日期展示
- 调整演示种子数据以覆盖 12 个月月度评审和完成态退出记录
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R07.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/web/src/components/**/*`
- `apps/web/src/lib/**/*`
- `apps/api/src/modules/color-exits/**/*`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `apps/api/src/modules/color-exits/color-exits.rules.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.spec.ts`
- `apps/api/src/modules/color-exits/dto/color-exit-write.dto.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/project-reviews-workspace.tsx`
- `apps/web/src/components/project-reviews-workspace.test.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.test.tsx`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/lib/color-exits-client.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R07.md
rg -n "workflow|gantt|kanban|calendar|monthly|color-exit|review" apps/web/src/components apps/web/src/lib apps/api/src/modules/color-exits apps/api/prisma
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/api exec vitest run src/modules/color-exits/color-exits.rules.spec.ts src/modules/auth/auth.constants.spec.ts
pnpm --filter @feishu-timeline/web exec vitest run src/components/project-reviews-workspace.test.tsx src/components/color-exit-workspace.test.tsx
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/api prisma:seed
curl -s -c /tmp/r07_pm_cookie.txt -H 'Content-Type: application/json' -d '{"username":"mock_project_manager","roleCodes":["project_manager"]}' http://localhost:3001/api/auth/mock-login
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/projects?page=1&pageSize=20'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqqa00pk9klri6b7walk/color-exit'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews/cmo6vclqw00nt9kd6btvltqru'
kill 36743 36792
pnpm --filter @feishu-timeline/web dev
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/workflow'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/tasks'
open -a Safari 'http://localhost:3000/projects/cmo6srqqa00pk9klri6b7walk/reviews'
open -a Safari 'http://localhost:3000/projects/cmo6srqqa00pk9klri6b7walk/color-exit'
```

#### Acceptance Result
- [x] 同一项目在任务表格、流程图、甘特图、看板与日历中的状态展示保持一致
- [x] 任务页已补负责人视图与部门视图，可按责任人和部门聚合查看任务
- [x] 第 17 步 12 个按月实例已在评审页形成可视台账，支持月份卡片、台账表和周期详情查看
- [x] 第 18 步退出建议逻辑前端可见，已展示退出阈值、年产量、系统建议、人工结论和生效日期
- [x] `pnpm --filter @feishu-timeline/web build` 通过，Safari 实测页面加载与交互性能可接受
- [x] 账本已更新

#### Risks / Debt
- 第 17 步周期详情页当前主要基于 recurring task 建档数据，演示项目中“关联评审记录”仍可能为空，后续需要把月度评审记录与周期实例做更严格绑定。
- 流程页截止日历当前展示的是流程任务口径，不包含 recurring task 的月度计划；如需统一为全域日历，需要在后续轮次扩口径。
- Next.js 开发态本轮出现过一次缓存失效导致的 `Cannot find module './953.js'`，通过重启 `web dev` 恢复，暂不构成代码 blocker，但 R08 做自动化时应继续观察。

#### Decision
CONTINUE

#### Next Round
R08

### Round R08

#### Goal
建立单元测试、集成测试、接口测试和 E2E 测试，覆盖流程型系统最关键的业务路径与边界条件。

#### Scope
- 补齐工作日 SLA、并行节点、周期任务、退出建议等关键单测
- 补齐主线不被并行任务阻塞的流程服务测试
- 增加一条真实 HTTP 主链路 E2E，覆盖创建项目、退回重跑、批量生产和第 17 步月度评审
- 增加测试说明文档和仓库级 `test:e2e` 命令
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R08.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `apps/api/src/modules/workflows/**/*`
- `apps/api/src/modules/auth/**/*`
- `apps/api/src/modules/attachments/**/*`
- `apps/api/src/modules/color-exits/**/*`
- `apps/web/package.json`

#### Files Changed
- `apps/api/src/modules/workflows/workflow-deadline.service.spec.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.spec.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.spec.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `apps/web/package.json`
- `package.json`
- `docs/TEST_COVERAGE_R08.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R08.md
sed -n '1,220p' docs/ACCEPTANCE_CHECKLIST.md
rg -n "ensureMonthlyReviewPlan|buildTaskSchedule|getWorkflowNextTaskTemplates|attachment|mock-login|createProject" apps/api/src apps/web/src
pnpm --filter @feishu-timeline/api exec vitest run src/modules/workflows/workflow-deadline.service.spec.ts src/modules/workflows/workflow-node.constants.spec.ts src/modules/workflows/workflow-recurring.service.spec.ts src/modules/workflows/workflows.service.spec.ts src/modules/color-exits/color-exits.rules.spec.ts
pnpm --filter @feishu-timeline/web test:e2e
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
```

#### Acceptance Result
- [x] API 与流程引擎关键路径测试通过
- [x] E2E 主链路可跑通，覆盖创建项目 → 推进流程 → 退回 → 再推进 → 批量生产 → 月度评审
- [x] 权限测试覆盖关键边界，已验证 `finance` 角色无项目创建权限
- [x] 测试结果报告可读，已新增 `docs/TEST_COVERAGE_R08.md`
- [x] 账本已更新

#### Risks / Debt
- 当前 E2E 采用 HTTP + Web SSR 壳校验，已经能验证真实路由、会话和主链路，但还不是浏览器点击级自动化；后续若需要更强前端回归，可再接 Playwright。
- E2E 默认复用本地 PostgreSQL / Redis，并会在现有 seed 数据上新增项目；后续若上 CI，建议切换到独立测试库与一次性测试数据清理策略。
- 当前测试结果以通过日志和覆盖说明文档为主，尚未引入正式覆盖率采集插件。

#### Decision
CONTINUE

#### Next Round
R09

### Round R09

#### Goal
完成容器化、CI/CD、staging 一键部署、健康检查、回滚脚本与部署文档，使系统达到“可部署、可回滚、可巡检”的预发布基线。

#### Scope
- 新增 API / Web Dockerfile 与 `.dockerignore`
- 新增 staging compose、环境模板、Nginx 配置与 deploy 脚本
- 新增 CI 工作流与部署文档
- 验证 staging 可从空环境启动并可重复执行
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R09.md`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `.env.example`
- `.env.production.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docker-compose.yml`
- `apps/web/next.config.ts`
- `apps/api/src/main.ts`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-release-verify.sh`
- `deploy/nginx/feishu-timeline.conf`
- `deploy/systemd/feishu-timeline-api.service`
- `deploy/systemd/feishu-timeline-web.service`
- `docs/DEVELOPMENT.md`
- `README.md`

#### Files Changed
- `.dockerignore`
- `.github/workflows/ci.yml`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `deploy/compose.staging.yml`
- `deploy/env/staging.env.example`
- `deploy/nginx/compose.staging.conf`
- `scripts/deploy/common.sh`
- `scripts/deploy/staging-up.sh`
- `scripts/deploy/migrate.sh`
- `scripts/deploy/seed.sh`
- `scripts/deploy/health-check.sh`
- `scripts/deploy/staging-log-tail.sh`
- `scripts/deploy/staging-rollback.sh`
- `scripts/deploy/rollback-check.sh`
- `docs/STAGING_DEPLOYMENT.md`
- `package.json`
- `README.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/EXECUTION_LEDGER.md
sed -n '1,260p' docs/rounds/R09.md
sed -n '1,220p' package.json
sed -n '1,220p' apps/api/package.json
sed -n '1,220p' apps/web/package.json
sed -n '1,220p' .env.example
sed -n '1,220p' .env.production.example
sed -n '1,220p' apps/api/.env.example
sed -n '1,220p' apps/web/.env.example
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' apps/web/next.config.ts
sed -n '1,220p' apps/api/src/main.ts
sed -n '1,220p' scripts/deploy/gce-sync-and-build.sh
sed -n '1,220p' scripts/deploy/gce-release-verify.sh
sed -n '1,220p' deploy/nginx/feishu-timeline.conf
sed -n '1,220p' deploy/systemd/feishu-timeline-api.service
sed -n '1,220p' deploy/systemd/feishu-timeline-web.service
bash -n scripts/deploy/staging-up.sh
bash -n scripts/deploy/health-check.sh
bash -n scripts/deploy/staging-rollback.sh
bash -n scripts/deploy/rollback-check.sh
bash -n scripts/deploy/migrate.sh
bash -n scripts/deploy/seed.sh
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
bash scripts/deploy/staging-up.sh
bash scripts/deploy/health-check.sh
bash scripts/deploy/rollback-check.sh
docker run --rm --entrypoint sh feishu-timeline-api:90a3832 -c 'exec /app/apps/api/node_modules/.bin/prisma -v'
docker run --rm --entrypoint sh feishu-timeline-web:90a3832 -c 'exec /app/apps/web/node_modules/.bin/next --version'
docker build -t feishu-timeline-web:90a3832 -f apps/web/Dockerfile .
bash scripts/deploy/staging-up.sh
bash scripts/deploy/health-check.sh
bash scripts/deploy/rollback-check.sh
```

#### Acceptance Result
- [x] API / Web 已完成容器化，staging compose 可渲染并通过配置校验
- [x] staging 可从空环境启动，`postgres` / `redis` / `api` / `web` / `nginx` 全部达到 healthy
- [x] `staging-up.sh` 已覆盖 build / migrate / start / health-check 主链路
- [x] `migrate.sh` 与 `seed.sh` 已分离，健康检查、日志查看、回滚检查与回滚脚本齐备
- [x] 基础 CI 工作流已补齐，包含 lint / typecheck / test / build / prisma validate / compose config / Docker build
- [x] 重复执行 `staging-up.sh` 已验证通过，staging 部署可重复执行
- [x] `docs/STAGING_DEPLOYMENT.md`、`README.md` 与本账本已更新

#### Revalidation
- 按用户要求重新执行了 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`。
- 按用户要求重新执行了 `docker compose -f deploy/compose.staging.yml config`、`docker compose -f deploy/compose.staging.yml up -d` 与 `bash scripts/deploy/health-check.sh`，结果均通过。
- 本轮停留在 `R09`，等待用户确认后再决定是否进入 `R10`。

#### Git Delivery
- 交付分支：`feat/color-pm-r09-r10`
- 远端：`https://github.com/pijhbkbk/feishu_timeline_app.git`
- 首次交付 commit：`1e7f84c61954d1800cdb7e8f6d5fdb4aababb0b8`
- `git push -u origin feat/color-pm-r09-r10` 已成功
- 当前已具备进入 VPS 部署前审计的代码与 staging 基线，但本轮未操作生产 VPS

#### Risks / Debt
- 首次构建一个本机尚未缓存的基础镜像时，仍依赖 Docker Hub 网络可用性；本轮已把“同一 tag 重复部署”优化为优先复用本地镜像。
- 本地反复对同一 commit 强制重建时，`deploy/.state/current.env` 与 `previous.env` 可能落在同一 `IMAGE_TAG`；实际 staging / VPS 发版应在干净工作树上执行，或显式指定新的 `IMAGE_TAG`。
- 当前 health-check 以服务健康、首页、登录页和 `/api/health` 为主，真正的生产域名、HTTPS 和切流验证留到 R10。

#### Decision
STOP

#### Next Round
R10（待用户确认）

### Round R10

#### Goal
完成 VPS deploy readiness audit、按交付分支执行生产部署、验证 HTTPS/健康检查/基础 smoke test，并形成可追溯的上线记录；暂不合并 `main`，暂不打 tag。

#### Scope
- 审计 GCE 实例 SSH、域名、证书、代理、运行时、数据库与回滚入口
- 复用现有 `scripts/deploy/gce-*`、`deploy/nginx/*`、`deploy/systemd/*` 资产完成原地部署
- 从 `feat/color-pm-r09-r10` 分支部署到生产 VPS
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R10.md`
- `.env.production.example`
- `deploy/nginx/feishu-timeline.conf`
- `deploy/nginx/timeline.all-too-well.com.conf`
- `scripts/deploy/gce-bootstrap.sh`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-network-and-https.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`
- `scripts/deploy/gce-redeploy.sh`
- `scripts/deploy/gce-rollback-checklist.sh`
- 当前 Git 分支与最近一次 push 结果

#### Files Changed
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git branch --show-current
git rev-parse HEAD
git log -1 --oneline --decorate --no-color
git remote -v
gcloud --version
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'whoami && hostname && uname -a'
gcloud compute instances describe instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
dig @1.1.1.1 +short all-too-well.com A
dig @8.8.8.8 +short all-too-well.com A
dig @1.1.1.1 +short www.all-too-well.com A
dig @8.8.8.8 +short www.all-too-well.com A
dig @1.1.1.1 +short timeline.all-too-well.com A
dig @8.8.8.8 +short timeline.all-too-well.com A
curl -k -I --resolve timeline.all-too-well.com:443:35.212.246.199 https://timeline.all-too-well.com/
curl -k -I --resolve timeline.all-too-well.com:443:35.212.246.199 https://timeline.all-too-well.com/api/health
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...readiness audit...'
GIT_REF=feat/color-pm-r09-r10 RUN_PRISMA_MIGRATE_DEPLOY=yes RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'git -C /opt/feishu_timeline_app rev-parse HEAD && systemctl is-active feishu-timeline-api && systemctl is-active feishu-timeline-web && systemctl is-active nginx && systemctl is-active postgresql && systemctl is-active redis-server'
curl -k -I https://timeline.all-too-well.com/
curl -k -I https://timeline.all-too-well.com/api/health
curl -k -I https://timeline.all-too-well.com/_next/static/chunks/742-d77a3f8ae5a58995.js
curl -k -sS -D - 'https://timeline.all-too-well.com/api/projects?page=1&pageSize=1'
```

#### Acceptance Result
- [x] deploy readiness audit 通过：SSH 可达，公网 IP 为 `35.212.246.199`
- [x] 生产机当前采用 `systemd + nginx + PostgreSQL + Redis` 形态；Docker / Compose 未安装，但不是本次部署 blocker
- [x] 80/443 由 `nginx` 占用，3000/3001/5432/6379 由现有生产服务占用，说明可采用原地更新而非另起一套端口
- [x] `apps/api/.env.production` 与 `apps/web/.env.production` 已存在，关键生产变量已就位，未发现示例占位值
- [x] Nginx 已安装且在线，Certbot 证书有效：`all-too-well.com` / `www.all-too-well.com` / `timeline.all-too-well.com`
- [x] 回滚入口明确：远端已有 `/var/backups/feishu-timeline-step5/*`、`/var/backups/feishu-timeline-step6/*`，并可通过 `git reset --hard <known-good-commit>` + `systemctl restart` 回退
- [x] 已从 `origin/feat/color-pm-r09-r10` 部署到 VPS，远端当前代码为 `8521552db6b596bd24e558ddd0653c017a0a2cad`
- [x] `prisma migrate deploy` 已执行并成功应用 `20260419120000_r02_process_foundation`
- [x] `feishu-timeline-api`、`feishu-timeline-web`、`nginx`、`postgresql`、`redis-server` 全部 `active`
- [x] 外部访问通过：`https://timeline.all-too-well.com/` 返回 `307 -> /dashboard`，`https://timeline.all-too-well.com/api/health` 返回 `200`
- [x] HTTPS 正常，`Strict-Transport-Security`、证书 SAN 和 Nginx 配置验证通过
- [x] smoke test 通过：首页、`/login`、`/dashboard`、`/projects`、静态资源 `/_next/static/chunks/742-d77a3f8ae5a58995.js`、`/api/health`、`/api/auth/session`、`/api/auth/feishu/login-url` 均通过
- [x] 受保护业务接口 `GET /api/projects?page=1&pageSize=1` 返回 `401 Authentication required`，表明业务 API 路由与认证边界工作正常

#### Risks / Debt
- 生产机当前仍沿用 `systemd + nginx` 部署链路，未统一到 Docker；这不是上线 blocker，但后续若要统一环境，需单独规划切换窗口。
- 本轮未执行真实业务用户的 Feishu 登录与全链路业务 UAT，只完成了匿名可达性、认证入口和受保护接口边界检查。
- 远端工作树分支名当前仍显示为 `master`，但 `HEAD` 已对齐到 `origin/feat/color-pm-r09-r10` 的最新提交；后续若要长期维护，建议把远端显式切换为同名跟踪分支。

#### Decision
STOP

#### Next Round
合并 `main` + 创建 `v1.0.0` tag（待用户确认）

### Round R11

#### Goal
在不做大范围新功能开发的前提下，完成生产口径 UAT、补齐业务硬门禁、清理演示口径偏差，并把结果沉淀为可复用的业务验收资料。

#### Scope
- 基于生产机隔离 schema + 临时 API 执行真实业务口径 UAT
- 最小修复第 13 步固定收费金额、关键角色流程推进权限与种子数据口径
- 复核并勾选总体验收硬门禁
- 生成 UAT 文档并更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/TEST_COVERAGE_R08.md`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.ts`
- `apps/api/src/modules/reviews/reviews.service.ts`
- `apps/api/src/modules/fees/fees.service.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/src/modules/pilot-productions/pilot-productions.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/scripts/e2e-mainline.mjs`

#### Files Changed
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/api/src/modules/fees/fees.rules.ts`
- `apps/api/src/modules/fees/fees.rules.spec.ts`
- `apps/api/src/modules/fees/fees.service.ts`
- `apps/api/prisma/seed.ts`
- `docs/UAT_R11.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/fees/fees.rules.spec.ts
pnpm --filter @feishu-timeline/api typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
curl -sS https://timeline.all-too-well.com/api/health
curl -sS https://timeline.all-too-well.com/api/auth/session
curl -sS https://timeline.all-too-well.com/api/auth/feishu/login-url
curl -I https://timeline.all-too-well.com/login/callback
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...prepare isolated schema + temp api + run UAT script...'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'pnpm exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/fees/fees.rules.spec.ts'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'pnpm build && sudo -n systemctl restart feishu-timeline-api'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...cleanup isolated schema and temp api artifacts...'
```

#### Acceptance Result
- [x] `docs/UAT_R11.md` 已生成，沉淀 5 条业务验收场景、权限验收与 Feishu 登录链路验证结果
- [x] 生产机隔离 schema UAT 通过 `5 / 5`：主线 1→16、第 12 步退回新轮次、第 9 步不阻塞、第 17 步 12 个月实例、第 18 步退出建议全部通过
- [x] 第 13 步固定收费金额后端门禁已补齐，`8600` 会被拒绝，系统固定金额统一为 `10000`
- [x] `reviewer`、`quality_engineer`、`finance`、`purchaser` 已补齐 `workflow.transition` 权限，真实评审/收费流程不再因权限映射缺口失败
- [x] 旧演示 / seed 中与冻结规则不一致的 `8600` 口径已清理为 `10000`
- [x] 顶部“总体验收硬门禁”已全部勾选并附证据索引
- [x] 生产 `Feishu` 登录入口、登录 URL、回调地址与匿名会话状态已验证；未执行真人交互式授权回调，结论为非 blocker 运行债务
- [x] 本轮最小修复已在生产 API 上完成构建与重启验证，`/api/health` 保持正常

#### Risks / Debt
- 真实 Feishu 账号授权后的交互式会话闭环尚未人工点击验证；当前只确认登录入口、授权 URL 和回调地址配置正确。
- 本轮业务 UAT 为“生产机隔离 schema + 临时 API”模式，不会污染正式业务数据；后续若要引入长期回归 UAT，建议沉淀为固定脚本与专用测试账户。

#### Decision
STOP

#### Next Round
R12（待用户确认）

### Round R12

#### Goal
在不改动核心业务规则的前提下，补齐线上系统的可观测性、告警、备份恢复与运行稳定性基线。

#### Scope
- 增强生产 `health-check`
- 新增 `ops-check`、证书有效期检查、5xx 日志筛查、PostgreSQL 备份演练脚本
- 完成一次生产巡检与一次备份恢复演练
- 生成运维、告警、备份恢复文档
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `Round R09`
- `Round R10`
- `scripts/deploy/*`
- `deploy/nginx/*`
- `deploy/systemd/*`
- 当前生产环境 `systemctl` / `journalctl` / `nginx` 日志 / 健康检查与回滚脚本

#### Files Changed
- `scripts/deploy/gce-common.sh`
- `scripts/deploy/health-check.sh`
- `scripts/deploy/ops-check.sh`
- `scripts/deploy/check-ssl-expiry.sh`
- `scripts/deploy/check-http-errors.sh`
- `scripts/deploy/backup-postgres.sh`
- `docs/OPERATIONS_R12.md`
- `docs/ALERTING_R12.md`
- `docs/BACKUP_AND_RESTORE_R12.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
bash -n scripts/deploy/gce-common.sh
bash -n scripts/deploy/health-check.sh
bash -n scripts/deploy/ops-check.sh
bash -n scripts/deploy/check-ssl-expiry.sh
bash -n scripts/deploy/check-http-errors.sh
bash -n scripts/deploy/backup-postgres.sh
bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
bash scripts/deploy/ops-check.sh
bash scripts/deploy/check-ssl-expiry.sh
bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'
bash scripts/deploy/backup-postgres.sh RUN_RESTORE_DRILL=yes
curl -I https://timeline.all-too-well.com/
curl -I https://timeline.all-too-well.com/login
curl -I https://timeline.all-too-well.com/dashboard
curl -I https://timeline.all-too-well.com/projects
curl -I https://timeline.all-too-well.com/api/health
python3 - <<'PY'
# 连续请求稳定性采样
PY
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...systemd / df -h / free -h / ss -tlnp / psql / redis-cli / certbot / logs...'
```

#### Acceptance Result
- [x] `docs/OPERATIONS_R12.md` 已生成
- [x] `docs/ALERTING_R12.md` 已生成
- [x] `docs/BACKUP_AND_RESTORE_R12.md` 已生成
- [x] `health-check.sh` 已增强，支持生产模式下的服务状态、关键 URL、HTTP 状态码和失败摘要输出
- [x] `ops-check.sh` 已新增并可运行，覆盖服务状态、磁盘、内存、端口、证书、数据库、Redis
- [x] `check-ssl-expiry.sh` 与 `check-http-errors.sh` 已新增并通过实际生产校验
- [x] 已完成一次 PostgreSQL 备份文件生成 + 临时 schema 恢复演练，结果 `restore_status=ok`
- [x] 已完成一次生产巡检并记录结果：服务全部 `active`、根分区 `20%`、可用内存约 `3070MB`、最近 300 行 Nginx access log 中 `5xx=0`
- [x] 连续请求稳定性检查已完成，`/`、`/dashboard`、`/projects`、`/api/health` 10 次请求均未出现异常状态码
- [x] `docs/EXECUTION_LEDGER.md` 已更新

#### Risks / Debt
- 当前告警仍是“脚本 + 非零退出码”模式，尚未接入 webhook / 邮件 / 监控平台。
- PostgreSQL 未启用 `pg_stat_statements`，SQL 热点与慢语句只能做到“无长查询”级别观察，缺少语句级排行。
- 生产环境仍以 `systemd + nginx` 手工脚本运维为主，运维能力已可用，但离全自动化监控和统一观察面仍有距离。

#### Decision
STOP

#### Next Round
R13（待用户确认）

### Round R13

#### Goal
提升系统界面一致性、关键流程交互体验和浏览器级自动化回归能力，使系统达到“稳定且美观”的交付水平。

#### Scope
- 统一页面标题、按钮、状态色、空态/错误态/无权限态和页内反馈组件
- 精修第 12 步评审工作区、第 17 步月度评审台账、第 18 步颜色退出页，以及流程页任务动作与截止日历说明
- 接入 Playwright 浏览器级回归与基础 CI 入口
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `Round R06`
- `Round R07`
- `Round R08`
- `docs/TEST_COVERAGE_R08.md`
- `apps/web/src/components/*`
- `apps/web/src/app/*`
- `apps/web/scripts/e2e-mainline.mjs`
- `.github/workflows/ci.yml`

#### Files Changed
- `.github/workflows/ci.yml`
- `.gitignore`
- `package.json`
- `apps/web/package.json`
- `apps/web/vitest.config.mts`
- `apps/web/playwright.config.mjs`
- `apps/web/scripts/playwright-runner.mjs`
- `apps/web/tests/playwright/helpers.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/project-editor.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/cabin-review-workspace.tsx`
- `apps/web/src/components/consistency-review-workspace.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/feedback-banner.tsx`
- `apps/web/src/components/state-panel.tsx`
- `docs/UI_REFINEMENT_R13.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/web add -D @playwright/test@^1.51.1
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] `docs/UI_REFINEMENT_R13.md` 已生成，沉淀标题层级、按钮层级、状态颜色体系、状态组件与浏览器回归入口
- [x] 第 12 步评审工作区已完成按钮层级、驳回/整改提示、时间线历史与统一反馈精修
- [x] 第 17 步月度评审台账已完成月份状态着色、摘要卡、绑定规则提示与固定表头滚动表格
- [x] 第 18 步颜色退出页已完成阈值/建议/人工结论摘要、保存与完成动作分层和统一状态反馈
- [x] 流程页 / 看板 / 日历已统一状态色与动作按钮层级，并明确 recurring task 只在评审台账展示、不在截止日历重复投影
- [x] 第 13 步固定收费金额口径保持 `10000`，未引入与冻结规则冲突的新展示
- [x] Playwright 已接入并通过 5 条关键浏览器级回归：登录入口、创建项目并进入流程页、第 12 步驳回生成新轮次并验证上传入口、第 17 步 12 个月实例、第 18 步退出页摘要
- [x] `.github/workflows/ci.yml` 已增加可选 `playwright-smoke` 入口，本地可通过 `pnpm playwright:test` 一键复跑
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过
- [x] `docs/EXECUTION_LEDGER.md` 已更新

#### Risks / Debt
- 当前关键动作反馈以页内 `FeedbackBanner` 为主，尚未接入全局 toast 队列；交付层面已经统一，但还不是完整通知中心。
- recurring task 目前通过“展示边界说明”而不是直接并入流程日历解决；若后续需要统一时间视图，仍需单独设计信息密度与筛选策略。
- Playwright 当前覆盖 5 条关键路径，已满足本轮门禁，但尚未扩到更多角色矩阵、移动端视口和视觉截图基线。

#### Decision
STOP

#### Next Round
等待用户确认是否进入 `main` 合并与正式 tag 收口

### Round Release Closure

#### Goal
将已经通过 R13 的代码与线上状态正式收口为 `v1.0.0`，确保文档、Git 与生产环境基线一致。

#### Scope
- 更新发布文档与账本状态
- 将正式交付分支合并到 `main`
- 从 `main` 重新部署生产并执行 release verify / production acceptance
- 准备正式 `v1.0.0` tag

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `Round R11`
- `Round R12`
- `Round R13`
- `git status`
- `git branch --show-current`
- `git remote -v`
- `git tag --list`
- `scripts/deploy/gce-redeploy.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`

#### Files Changed
- `.gitignore`
- `docs/EXECUTION_LEDGER.md`
- `docs/RELEASE_NOTES_v1.0.0.md`
- `docs/PRODUCTION_HANDOFF_v1.0.0.md`

#### Commands Run
```bash
git status --short
git branch --show-current
git remote -v
git tag --list --sort=-creatordate | head -n 20
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
pnpm --filter @feishu-timeline/web build
git checkout feat/color-pm-r09-r10
git add .
git commit -m "feat: finalize release candidate for v1.0.0"
git push origin feat/color-pm-r09-r10
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/color-pm-r09-r10 -m "Merge branch 'feat/color-pm-r09-r10' for v1.0.0 release"
git push origin main
RUN_PRISMA_MIGRATE_DEPLOY=yes bash scripts/deploy/gce-redeploy.sh
```

#### Acceptance Result
- [x] `docs/RELEASE_NOTES_v1.0.0.md` 已生成
- [x] `docs/PRODUCTION_HANDOFF_v1.0.0.md` 已生成
- [x] 顶部当前阶段 / 当前轮次已切换为 `Release Closure`
- [x] 正式交付分支 `feat/color-pm-r09-r10` 已更新并推送到远端
- [x] `main` 已通过 merge commit 合并正式交付分支
- [x] 生产环境已从 `main` 重新部署，并确认不再停留于 `master@8521552`
- [x] `gce-release-verify.sh` 通过：域名、HTTPS、HSTS、首页、`/login`、`/dashboard`、`/projects`、`/api/health`、认证边界与证书状态全部通过
- [x] `gce-production-acceptance.sh` 通过：远端 `systemd`、`nginx`、`postgresql`、`redis`、生产环境变量与认证入口全部通过
- [x] 生产运行基线已确认切换到 `main` 合并提交 `9ec8d62`

#### Risks / Debt
- 当前正式发布已经完成 `main` 合并与生产对齐，但最终正式版本仍以 `v1.0.0` tag 和 tag 对应的 `main` HEAD 为准。
- 告警平台与更细粒度性能观测仍属于发布后可延期优化项，不影响本次 `v1.0.0` 正式交付。

#### Decision
STOP

#### Next Round
发布后观察期

### Round R14

#### Goal
在不改变已冻结业务规则和流程状态机的前提下，将系统 UI 升级为中文项目进度驾驶舱，并新增能实时展示轻卡定制颜色开发项目进度的时间线看板。

#### Scope
- 全站导航、页面标题、按钮、状态、空态、错误提示和核心业务文案中文化
- 首页 `/dashboard` 改造为“项目进度驾驶舱”
- 新增 `/projects/timeline-board` 项目时间线看板
- 项目详情流程页增加单项目完整节点时间线
- 优化第 17 步整车色差一致性评审台账月份卡片与本月任务展示
- 新增只读聚合 API，减少前端多接口拼装
- 更新 R14 文档与本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `apps/web/src/app/dashboard`
- `apps/web/src/app/projects`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/lib/*`

#### Files Changed
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.spec.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/projects/projects.controller.spec.ts`
- `apps/web/src/lib/status-labels.ts`
- `apps/web/src/lib/dashboard-client.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/app/projects/timeline-board/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/components/project-timeline-board.test.tsx`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] 用户可见核心界面已中文化，导航、标题、按钮、状态、空态、错误提示和核心业务文案不再保留明显英文业务文案。
- [x] 首页已改造为“项目进度驾驶舱”，包含项目总数、进行中项目、逾期任务、本月待评审、月度色差评审待完成、待退出颜色、最近更新时间和手动刷新。
- [x] `/projects/timeline-board` 已新增项目时间线看板，项目卡片展示 18 个流程节点、当前节点、责任人、截止时间、逾期天数、进度百分比、下一步和查看详情入口。
- [x] 项目详情流程页已增加单项目时间线，并覆盖第 12 步评审、第 17 步月度进度、第 18 步颜色退出摘要。
- [x] 第 17 步月度评审台账已显示 12 个月份卡片、完成进度和本月任务标识，并支持跳转对应月份详情。
- [x] 首页和项目时间线看板每 30 秒刷新，项目详情流程页每 15 秒刷新，均提供“立即刷新”。
- [x] 新增/扩展只读聚合 API：`GET /api/dashboard/overview`、`GET /api/dashboard/project-timelines`、`GET /api/projects/:projectId/timeline`、`GET /api/dashboard/monthly-review-board`。
- [x] `docs/UI_TIMELINE_BOARD_R14.md` 已生成。
- [x] `docs/EXECUTION_LEDGER.md` 已更新。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Risks / Debt
- 当前实时刷新采用轮询和手动刷新，未引入 WebSocket；满足 MVP 驾驶舱实时性，但不提供秒级协同。
- 时间线看板当前以横向滚动承载 18 个节点，普通笔记本可读；后续可针对移动端增加压缩视图和筛选器。
- 聚合接口目前未做服务端分页和缓存；数据量显著增长后需补排序、分页和缓存策略。

#### Decision
STOP

#### Next Round
建议先部署到 VPS 做业务方验收和真实数据观察，再评估移动端压缩视图、看板筛选和聚合接口缓存。

### Round R14_PPT_UI_IMPLEMENTATION

#### Goal
按 PPT 设计稿将线上系统升级为中文项目进度驾驶舱、项目时间线看板、材料提交平台、整车色差一致性评审台账和数据中心，并部署到 `https://timeline.all-too-well.com`。

#### Scope
- 复制并归档 PPT 设计稿到 `docs/design`
- 新增 `docs/PPT_UI_IMPLEMENTATION_R14.md`，建立 PPT slide-to-code 映射
- 补齐 `/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics` 和 `/projects/:id/materials`
- 优化 `/projects` 项目列表筛选和 `/projects/:id/overview` 详情刷新
- 扩展材料中心、月度评审总账、数据中心聚合展示
- 新增 `GET /api/analytics/overview`
- 保持业务状态机、评审门禁、固定收费和颜色退出规则不变

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `/Users/lixiaochen/Desktop/U I-1.md`
- `/Users/lixiaochen/Downloads/轻卡颜色开发项目管理系统_UI界面设计稿.pptx`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_UI界面方案.pptx`
- 当前 dashboard、projects、workflow、reviews、color-exit、attachments、API 与前端组件结构

#### Files Changed
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/analytics/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/app/analytics/page.tsx`
- `apps/web/src/app/materials/page.tsx`
- `apps/web/src/app/monthly-reviews/page.tsx`
- `apps/web/src/app/projects/timeline/page.tsx`
- `apps/web/src/app/projects/timeline-board/page.tsx`
- `apps/web/src/app/projects/[projectId]/materials/page.tsx`
- `apps/web/src/components/analytics-center.tsx`
- `apps/web/src/components/materials-center.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-overview-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/attachments-workspace.tsx`
- `apps/web/src/lib/analytics-client.ts`
- `apps/web/src/lib/status-labels.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ppt-ui-r14.test.tsx`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `scripts/deploy/gce-common.sh`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`
- `docs/PPT_UI_IMPLEMENTATION_R14.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/design/*`

#### Commands Run
```bash
git switch -c feat/ppt-ui-r14
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
git add apps/api/src/app.module.ts apps/api/src/modules/dashboard apps/api/src/modules/projects apps/api/src/modules/analytics apps/web/scripts/e2e-mainline.mjs apps/web/src/app apps/web/src/components apps/web/src/lib apps/web/tests/playwright docs/EXECUTION_LEDGER.md docs/PPT_UI_IMPLEMENTATION_R14.md docs/UI_TIMELINE_BOARD_R14.md docs/design
git commit -m "feat: implement PPT UI blueprint for Chinese project timeline dashboard"
git push -u origin feat/ppt-ui-r14
GIT_REF=feat/ppt-ui-r14 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --tunnel-through-iap --command 'whoami'
bash -n scripts/deploy/gce-common.sh scripts/deploy/gce-sync-and-build.sh scripts/deploy/gce-release-verify.sh scripts/deploy/gce-production-acceptance.sh
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/ppt-ui-r14 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh
curl https://timeline.all-too-well.com/dashboard
curl https://timeline.all-too-well.com/projects
curl https://timeline.all-too-well.com/projects/timeline
curl https://timeline.all-too-well.com/materials
curl https://timeline.all-too-well.com/monthly-reviews
curl https://timeline.all-too-well.com/analytics
curl https://timeline.all-too-well.com/api/health
```

#### Acceptance Result
- [x] PPT 设计稿已复制到 `docs/design`，并生成首屏 Quick Look 参考图。
- [x] `docs/PPT_UI_IMPLEMENTATION_R14.md` 已建立 PPT 页面到代码/API/测试映射。
- [x] 全站核心导航、标题、按钮、状态、空态和业务提示已统一中文化，并将“超期”统一为“逾期”。
- [x] `/dashboard` 为中文项目进度驾驶舱，保留 30 秒轮询和手动刷新。
- [x] `/projects/timeline` 为项目时间线看板，展示 18 个节点、当前节点、责任人、逾期、进度、下一步，并支持关键词、状态、部门、负责人和逾期筛选。
- [x] `/projects` 项目列表支持颜色、当前工序、责任部门、负责人、逾期状态和日期筛选。
- [x] `/projects/:id/overview` 每 15 秒自动刷新，编辑表单时暂停覆盖未保存输入。
- [x] `/projects/:id/workflow` 与 `/projects/:id/tasks` 提供单项目完整节点时间线、工序清单和节点详情。
- [x] `/materials` 与 `/projects/:id/materials` 提供材料提交入口、上传、预览和归属管理。
- [x] `/monthly-reviews` 提供第 17 步全局 12 个月评审台账，项目评审页继续展示单项目月份卡片和详情。
- [x] `/analytics` 提供项目概览、流程效率、部门负载、返工、月度评审、颜色退出和费用摘要。
- [x] 新增只读聚合 API `GET /api/analytics/overview`，未修改冻结业务状态机与流程规则。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。
- [x] 已创建并推送 `feat/ppt-ui-r14`，实现提交为 `4f315aa`。
- [x] 直连 SSH 被远端关闭后，已为 GCE 部署脚本补充可选 `GCE_TUNNEL_THROUGH_IAP=yes` 开关，默认直连行为不变。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 `pnpm build`、Prisma validate、release verification 和 production acceptance 全部通过。
- [x] 线上 `/dashboard`、`/projects`、`/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics`、`/api/health` 均返回 200；受保护聚合 API 在未登录状态返回 401，符合生产鉴权预期。
- [x] `ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 23%，可用内存 3057MB，证书剩余 62 天。

#### Risks / Debt
- 本地环境未安装 LibreOffice，PPT 仅完成文本结构抽取和首屏 Quick Look 渲染，未逐页生成图片证据。
- 当前本机到 GCE 的直连 SSH 会被远端关闭，本次部署和巡检使用 `GCE_TUNNEL_THROUGH_IAP=yes`；该开关已写入脚本，后续运维可继续复用。
- 时间线看板已满足普通笔记本阅读，移动端仍以横向滚动为主，后续可增加折叠式节点视图。
- 聚合 API 当前为 MVP 只读查询，数据量提升后建议增加服务端分页、缓存和排序。

#### Decision
STOP

#### Next Round
生产观察期：收集真实项目数据下的时间线密度、月度评审总账和数据中心指标反馈。

### Round R16_UI_BUSINESS_E2E_TEST_AND_ITERATE

#### Goal
基于 `https://timeline.all-too-well.com` 的线上页面口径和本地可写测试环境，使用 Playwright 操作真实网页验证中文 UI、项目看板、18 步工序、材料提交、第 12 步退回、第 17 步月度评审、第 18 步颜色退出、数据中心与业务规则。

#### Scope
- 补充关键页面 `data-testid`，提升 Playwright 选择器稳定性。
- 新增 R16 Playwright fixtures 和 3 组专项测试：中文 UI、新建项目、18 步业务流。
- 修复用户可见“占位”类临时文案，改为正式中文业务描述。
- 修正第 7/8/9 步显示顺序与名称，保持冻结状态机不变。
- 后端项目列表节点筛选项改用流程常量排序和命名，避免生产旧节点定义影响展示。
- 更新 R16 UAT、Playwright 报告、问题修复文档和本账本。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `/Users/lixiaochen/Desktop/UI-2.md`
- 当前 dashboard、projects、workflow、reviews、color-exit、materials、monthly-reviews、analytics、API 与前端组件结构

#### Files Changed
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/web/src/app/admin/[section]/page.tsx`
- `apps/web/src/app/projects/[projectId]/[section]/page.tsx`
- `apps/web/src/app/reviews/page.tsx`
- `apps/web/src/components/analytics-center.tsx`
- `apps/web/src/components/attachments-workspace.tsx`
- `apps/web/src/components/cabin-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/materials-center.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/page-placeholder.tsx`
- `apps/web/src/components/project-editor.tsx`
- `apps/web/src/components/project-overview-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-ui-chinese.spec.ts`
- `apps/web/tests/playwright/r16-create-project.spec.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `docs/UAT_WEB_TEST_R16.md`
- `docs/PLAYWRIGHT_TEST_REPORT_R16.md`
- `docs/UI_ISSUES_AND_FIXES_R16.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm --filter @feishu-timeline/web exec playwright install --with-deps chromium
pnpm playwright:test -- --grep R16
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select code, name, \"createdAt\" from projects where name like 'UAT-自动化-%' or code like 'R16-UAT-%' order by \"createdAt\" desc limit 20;"
git add -- apps/api/prisma/seed.ts apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/workflows/workflow-node.constants.ts 'apps/web/src/app/admin/[section]/page.tsx' 'apps/web/src/app/projects/[projectId]/[section]/page.tsx' apps/web/src/app/reviews/page.tsx apps/web/src/components/analytics-center.tsx apps/web/src/components/attachments-workspace.tsx apps/web/src/components/cabin-review-workspace.tsx apps/web/src/components/color-exit-workspace.tsx apps/web/src/components/dashboard-workspace.tsx apps/web/src/components/materials-center.tsx apps/web/src/components/monthly-reviews-board.tsx apps/web/src/components/page-placeholder.tsx apps/web/src/components/project-editor.tsx apps/web/src/components/project-overview-client.tsx apps/web/src/components/project-workflow-workspace.tsx apps/web/src/components/projects-list-client.tsx apps/web/src/lib/navigation.ts apps/web/src/lib/projects-client.ts apps/web/tests/playwright/r16-fixtures.ts apps/web/tests/playwright/r16-ui-chinese.spec.ts apps/web/tests/playwright/r16-create-project.spec.ts apps/web/tests/playwright/r16-business-flow.spec.ts docs/UAT_WEB_TEST_R16.md docs/PLAYWRIGHT_TEST_REPORT_R16.md docs/UI_ISSUES_AND_FIXES_R16.md docs/EXECUTION_LEDGER.md
git commit -m "test: add R16 browser UAT coverage"
git push -u origin feat/r16-ui-business-e2e
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/r16-ui-business-e2e RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh
node - <<'NODE'
const paths = ['/dashboard','/projects','/projects/timeline','/materials','/monthly-reviews','/analytics','/api/health'];
for (const path of paths) {
  const response = await fetch(`https://timeline.all-too-well.com${path}`, { redirect: 'follow' });
  console.log(`${path} ${response.status}`);
}
NODE
```

#### Acceptance Result
- [x] `/dashboard`、`/projects`、`/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics`、`/api/health` 线上只读 smoke 均返回 200。
- [x] 本轮未在生产写入 UAT 项目；写入型测试均在本地测试库执行。
- [x] 已补充关键页面与组件的稳定 `data-testid`。
- [x] 中文 UI 检查通过，未发现明显英文业务文案、长期加载、空白页或严重控制台错误。
- [x] Playwright 真实网页创建了 `UAT-自动化-深海蓝-*`、`UAT-自动化-星河银-*`、`UAT-自动化-极光白-*` 本地测试项目。
- [x] 第 4 步完成后并行创建第 5/6 步通过。
- [x] 第 9 步独立进行且不阻塞主线通过。
- [x] 第 12 步不通过退回第 11 步并生成第 2 轮通过。
- [x] 第 13 步固定金额 `10000` 元通过。
- [x] 第 16 步完成后第 17 步 12 个月度评审卡片可见通过。
- [x] 第 18 步颜色退出阈值、系统建议、人工结论和材料上传通过。
- [x] 材料提交平台和数据中心页面通过。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/web build`、`pnpm test:e2e`、`pnpm playwright:test -- --grep R16`、`pnpm playwright:test` 全部通过。
- [x] `docs/UAT_WEB_TEST_R16.md`、`docs/PLAYWRIGHT_TEST_REPORT_R16.md`、`docs/UI_ISSUES_AND_FIXES_R16.md` 已生成。
- [x] 已创建并推送 `feat/r16-ui-business-e2e`，实现提交为 `c98ec4f`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 `pnpm build`、Prisma validate、release verification 和 production acceptance 全部通过。
- [x] `ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 23%，可用内存 3050MB，证书剩余 62 天。

#### Risks / Debt
- 生产环境未开启 mock 登录，自动化写入型 UAT 仍只建议在本地或 staging 执行。
- 月度评审卡片与跳转已通过，后续可继续增强单月评审填报向导。
- 时间线看板在移动端仍以横向滚动为主，可后续补折叠式节点视图。
- 数据中心当前为 MVP 聚合视图，真实项目数据量上来后建议补分页、缓存和钻取。

#### Decision
STOP

#### Next Round
如需继续推进，建议进入生产试运行数据观察与移动端时间线阅读体验优化。

### Round R17_TIMELINE_NODE_INTERACTION

#### Goal
将“项目时间线看板”升级为主操作入口：用户点击 `/projects/timeline` 和 `/projects/:id/workflow` 的工序节点后，在当前页面打开工序详情抽屉，查看负责人、责任部门、材料、附件、SLA、评审/审批专项、流转记录与可执行动作。

#### Scope
- 新增时间线节点 hover 提示和 click 交互。
- 新增 `TaskDetailDrawer` 及工序概况、责任信息、时间与 SLA、材料附件、评审/审批、流转记录分区。
- 新增后端工序详情聚合 API，不改动冻结流程状态机和第 4/6/9/12/13/16/17/18 步核心规则。
- 完善项目时间线看板节点数据字段，确保节点携带 `taskId`、负责人、责任部门、截止时间、阻塞和节点类型信息。
- 新增 R17 Playwright 场景，覆盖第 1/6/12/13/17/18 步抽屉展示和 `taskId` URL 恢复。
- 新增 R17 设计与 API 文档。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/workflows/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/lib/*`
- `apps/web/tests/playwright/*`

#### Files Changed
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/workflows/workflows.controller.ts`
- `apps/api/src/modules/workflows/workflows.controller.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/web/playwright.config.mjs`
- `apps/web/e2e/r17-timeline-node-interaction.spec.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ppt-ui-r14.test.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-timeline-board.test.tsx`
- `apps/web/src/components/task-detail-drawer.tsx`
- `apps/web/src/components/timeline-node.tsx`
- `apps/web/src/lib/dashboard-client.ts`
- `apps/web/src/lib/workflows-client.ts`
- `docs/TIMELINE_NODE_INTERACTION_R17.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm test:e2e
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm playwright:test
git add .
git commit -m "feat: add interactive timeline task detail drawer"
git push -u origin feat/timeline-node-interaction-r17
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/timeline-node-interaction-r17 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh || true
curl -k -sS -L -o /tmp/r17-timeline.html -w 'timeline code=%{http_code} url=%{url_effective}\n' https://timeline.all-too-well.com/projects/timeline
curl -k -sS https://timeline.all-too-well.com/api/health
curl -k -sS https://timeline.all-too-well.com/api/auth/session
curl -k -sS https://timeline.all-too-well.com/api/auth/feishu/login-url
```

#### Acceptance Result
- [x] `/projects/timeline` 节点 hover 显示步骤号、工序名称、状态、负责人、责任部门、截止时间、逾期/剩余工作日和点击提示。
- [x] `/projects/timeline` 点击已触发节点打开右侧“工序详情抽屉”，页面不跳转，并写入 `projectId` 与 `taskId`。
- [x] `/projects/:id/workflow` 单项目时间线节点可直接打开相同详情抽屉。
- [x] 刷新带 `taskId` 的 URL 后，抽屉可自动恢复打开。
- [x] 抽屉展示工序概况、责任信息、时间与 SLA、材料与附件、评审 / 审批、流转记录。
- [x] 加载中、加载失败、无权限、无附件、无流转记录均为中文状态。
- [x] 第 12 步展示通过、不通过 / 退回、原因、整改要求、责任人、通过时间和历史轮次。
- [x] 第 13 步展示固定金额 `10000 元`、收费状态、收费凭证和财务确认人。
- [x] 第 17 步展示 `12 个月`周期、已完成 `n / 12`、本月状态、逾期月份和月度评审台账入口。
- [x] 第 18 步展示年产量、退出阈值、系统建议、人工结论、退出原因和生效日期。
- [x] `GET /api/workflows/tasks/:taskId/detail` 返回真实聚合数据，不使用静态假详情冒充执行信息。
- [x] `GET /api/dashboard/project-timelines` 节点补充 `stepCode`、`stepName`、`status`、`ownerName`、`departmentName`、`isBlocking`、`nodeType`。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Online Verification
- [x] 已推送 `feat/timeline-node-interaction-r17`，实现提交为 `92a9e1c`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 checkout `92a9e1c`，`pnpm install`、Prisma validate、Web/API build、systemd restart、release verification 和 production acceptance 全部通过。
- [x] `scripts/deploy/health-check.sh DEPLOY_TARGET=production` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，`/api/health` 返回 `200` 且 `status=ok`，关键页面与静态资源返回 200。
- [x] `scripts/deploy/ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 21%，可用内存 3086MB，证书剩余 50 天。
- [x] 线上只读 smoke：`/projects/timeline` 返回 200，`/api/health` 返回 `{"status":"ok"}`。
- [x] 生产登录状态验证：`/api/auth/session` 返回 `authenticated=false`、`mockEnabled=false`、`feishuEnabled=true`，飞书登录 URL 可生成。
- [ ] 线上真实点击节点需要有效飞书用户会话；本轮未使用生产账号执行写入或点击型 UAT。节点点击、专项展示、刷新恢复已由本地 Playwright 全流程覆盖。

#### Risks / Debt
- “保存”和“转交负责人”按钮当前展示为不可用占位，后续需要专用表单保存和负责人转交 API。
- 必交材料清单依赖 `workflow_node_definitions.requiredAttachments`，当前种子数据未配置时展示“暂无必交材料配置”。
- 抽屉支持附件查看 / 下载 / 上传入口，后续可在抽屉内嵌上传控件。
- `flowLogs` 当前取最近 30 条聚合记录，真实数据量上来后可分页。

#### Decision
STOP

#### Next Round
建议继续补充抽屉内表单保存、负责人转交、材料内嵌上传和流转记录分页。

### Round R18_SYSTEM_GUIDE_INTRO_PAGE

#### Goal
新增 `/guide`“系统导览”介绍页，帮助首次进入系统的用户理解轻卡定制颜色开发 18 步流程、网站操作步骤、角色分工、关键业务规则、材料归档和快速入口。

#### Scope
- 新增系统导览页面和组件，页面内容全部中文化。
- 将“系统导览”加入用户端主导航最前面，并加入顶部主导航。
- 页面展示 Hero、流程总览、18 步展开清单、关键业务规则、8 步操作、角色指南、材料说明、快速入口和常见问题。
- 第 12、17、18 步作为关键节点突出展示。
- `/guide` 作为公共说明页可未登录阅读；进入业务功能后仍沿用既有登录与后端权限校验。
- 不改动后端流程规则，不改动第 4、6、9、12、13、16、17、18 步核心逻辑。
- 新增 R18 Playwright 场景和 R18 文档。

#### Inputs Read
- `AGENTS.md`
- `/Users/lixiaochen/Desktop/轻卡颜色开发系统_系统导览界面概念稿.pptx`
- `docs/EXECUTION_LEDGER.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/TIMELINE_NODE_INTERACTION_R17.md`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tests/playwright/r16-fixtures.ts`

#### Files Changed
- `apps/web/src/app/guide/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/route-smoke.test.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/e2e/r18-system-guide.spec.ts`
- `docs/SYSTEM_GUIDE_R18.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/system-guide-r18
pnpm install
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web test
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web playwright:test:raw -- e2e/r18-system-guide.spec.ts
pnpm lint
pnpm typecheck
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm test:e2e
pnpm playwright:test
git add .
git commit -m "feat: add system guide intro page for color development workflow"
git push -u origin feat/system-guide-r18
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/system-guide-r18 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh || true
pnpm --filter @feishu-timeline/web exec node --input-type=module # 线上 /guide 可见内容与移动端截图检查
curl -k -sS -L -o /tmp/r18-guide.html -w 'guide code=%{http_code} url=%{url_effective}\n' https://timeline.all-too-well.com/guide
curl -k -sS https://timeline.all-too-well.com/api/health
```

#### Acceptance Result
- [x] `/guide` 页面已新增，页面名称为“系统导览”。
- [x] 主导航和用户端侧边导航最前面已增加“系统导览”。
- [x] Hero 展示“轻卡定制颜色开发项目管理系统”标题、副标题和三个入口按钮。
- [x] 18 个工序按 4 个阶段完整展示，并支持展开 / 收起详细清单。
- [x] 第 12、17、18 步作为关键节点突出展示。
- [x] 关键业务规则覆盖自动流转、并行工序、非阻塞工序、评审退回、固定收费、月度评审与颜色退出。
- [x] 网站操作步骤覆盖 8 步。
- [x] 角色指南覆盖营销公司、涂装工艺部、采购部、质量管理部、生产部 / 涂装厂、财务部。
- [x] 快速入口可跳转到工作台、项目看板、新建项目、我的待办、材料中心、月度评审和数据中心。
- [x] 常见问题覆盖第 4、9、12、13、17、18 步的易误解点。
- [x] R18 Playwright 场景通过。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Online Verification
- [x] 已推送 `feat/system-guide-r18`，功能实现提交为 `0807096`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 checkout `0807096`，`pnpm install`、Web/API build、Prisma validate、systemd restart、release verification 和 production acceptance 全部通过。
- [x] `scripts/deploy/health-check.sh DEPLOY_TARGET=production` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，`/api/health` 返回 `200` 且 `status=ok`，关键页面与静态资源返回 200。
- [x] `scripts/deploy/ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 21%，可用内存 3082MB，证书剩余 50 天。
- [x] 线上 `/guide` 返回 200，页面可未登录访问并展示“系统导览”。
- [x] 线上 Playwright 可见内容检查通过：导航出现“系统导览”，18 步流程完整，网站操作步骤完整，角色指南与常见问题可见，快速入口跳转到 `/projects/timeline`。
- [x] 线上中文化检查通过，未发现明显英文业务文案。
- [x] 线上 1440px 与 390px 截图检查通过，页面低饱和、清晰、移动端可阅读。
- [x] 线上 `/api/health` 返回 `{"status":"ok"}`。

#### Risks / Debt
- 导览页材料说明为文档化清单，后续可与后端节点必交材料配置联动。
- 可后续增加首次登录导览完成状态，避免老用户反复看到新手引导。
- 可后续补充部门培训截图和可下载操作手册。

#### Decision
STOP

#### Next Round
建议继续增强首次登录导览完成状态、导览页截图化培训材料，以及材料清单与后端必交材料配置联动。

### Round R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU

#### Goal
按公司上线前安全准入口径，为正式部署到公司私有云和上架飞书工作台建立 R19 安全检查范围、检查清单、威胁模型和自动化安全脚本基线。当前阶段只做范围确认和脚本准备，不执行全量扫描、不对生产做主动测试。

#### Scope
- 新增 R19 安全范围文档、检查清单和威胁模型。
- 新增 `scripts/security` 基础脚本，覆盖 SAST、SCA、密钥扫描、ZAP baseline、安全响应头、主机检查、构建完整性生成与校验。
- 新增 `docs/rounds/R19.md` 作为下一轮入口。
- 增加 root `package.json` 安全脚本入口。
- 收紧 `.gitignore`，避免 `.env.production`、应用目录环境文件和原始安全扫描报告误入库。
- 不执行全量扫描，不扫描飞书开放平台域名，不扫描公司未授权 IP，不输出任何真实密钥。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/deploy-gce-security.md`
- `scripts/deploy/gce-security-hardening.sh`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/common/app-config.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/feishu/feishu-auth.adapter.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/auth/permissions.guard.ts`
- `apps/api/src/modules/auth/project-access.service.ts`

#### Files Changed
- `.gitignore`
- `package.json`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R19.md`
- `docs/security/SECURITY_SCOPE_R19.md`
- `docs/security/SECURITY_CHECKLIST_R19.md`
- `docs/security/THREAT_MODEL_R19.md`
- `scripts/security/run-sast.sh`
- `scripts/security/run-sca.sh`
- `scripts/security/run-secrets-scan.sh`
- `scripts/security/run-zap-baseline.sh`
- `scripts/security/check-security-headers.sh`
- `scripts/security/host-security-check.sh`
- `scripts/security/generate-build-integrity.sh`
- `scripts/security/check-build-integrity.sh`

#### Commands Run
```bash
git switch -c feat/security-audit-r19
mkdir -p docs/security scripts/security reports/security/{sast,sca,zap,headers,host,integrity}
chmod +x scripts/security/*.sh
bash -n scripts/security/run-sast.sh
bash -n scripts/security/run-sca.sh
bash -n scripts/security/run-secrets-scan.sh
bash -n scripts/security/run-zap-baseline.sh
bash -n scripts/security/check-security-headers.sh
bash -n scripts/security/host-security-check.sh
bash -n scripts/security/generate-build-integrity.sh
bash -n scripts/security/check-build-integrity.sh
```

#### Acceptance Result
- [x] `SECURITY_SCOPE_R19.md` 已覆盖系统名称、业务模块、接口、数据、环境和禁止范围。
- [x] `SECURITY_CHECKLIST_R19.md` 已覆盖主机、SAST、SCA、密钥、DAST、认证、权限、输入输出、文件上传、网页防篡改、业务逻辑和飞书工作台。
- [x] `THREAT_MODEL_R19.md` 已覆盖资产、攻击者、关键威胁、风险分级和安全目标。
- [x] `scripts/security` 基础脚本已建立，默认优先本地目标，远端 DAST / headers 检查需要显式授权。
- [x] 脚本语法检查通过。
- [x] 当前阶段未执行全量扫描，未对飞书平台、公司未授权 IP 或生产环境做主动测试。

#### Risks / Debt
- 飞书 OAuth `state` 当前需要在全量阶段优先复测并补齐一次性服务端校验。
- 附件上传当前需要在全量阶段复测扩展名白名单、文件魔数校验和危险内容响应头。
- 私有云主机 IP、测试账号、飞书后台权限和可用范围需要由用户或公司信息安全负责人确认后再写入最终准入报告。
- `SAST_REPORT_R19.md` 等扫描报告文档尚未生成；需要范围确认后执行对应脚本。

#### Decision
STOP

#### Next Round
等待用户确认 `docs/security/SECURITY_SCOPE_R19.md` 和 `docs/security/SECURITY_CHECKLIST_R19.md` 后，进入 R19 全量扫描、漏洞修复和复测闭环。

### Round R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU_EXECUTION

#### Goal
在 R19 范围确认后执行公司私有云部署与飞书工作台上架前安全检查、自动化扫描、权限/附件/业务逻辑专项测试、漏洞整改和复测闭环，并形成可提交信息安全部门的报告材料。

#### Scope
- 执行基础质量门禁、SAST、SCA、密钥扫描、ZAP baseline、安全响应头、主机检查和网页防篡改检查。
- 修复已确认的 High / Medium 应用安全问题。
- 新增 Feishu OAuth state、权限越权、文件上传、输入输出和业务逻辑安全测试。
- 不对飞书开放平台域名、公司未授权 IP 或生产环境执行主动扫描。
- 私有云主机和飞书后台配置因未提供授权证据，仅做代码/本地和待确认项记录。

#### Inputs Read
- `/Users/lixiaochen/Desktop/anquan.md`
- `AGENTS.md`
- `docs/security/SECURITY_SCOPE_R19.md`
- `docs/security/SECURITY_CHECKLIST_R19.md`
- `docs/security/THREAT_MODEL_R19.md`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/session-store.service.ts`
- `apps/api/src/modules/feishu/feishu-auth.adapter.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/fees/fees.rules.ts`
- `apps/api/src/modules/reviews/reviews.rules.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.ts`
- `apps/web/next.config.ts`
- `scripts/security/*.sh`

#### Files Changed
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.service.spec.ts`
- `apps/api/src/modules/auth/session-store.service.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.rules.spec.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.service.spec.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/test/security/r19-permission-security.spec.ts`
- `apps/api/test/security/r19-api-input-security.spec.ts`
- `apps/api/test/security/r19-business-logic-security.spec.ts`
- `apps/api/test/security/r19-file-upload-security.spec.ts`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/web/next.config.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`
- `pnpm-lock.yaml`
- `scripts/security/run-sast.sh`
- `scripts/security/run-sca.sh`
- `scripts/security/run-secrets-scan.sh`
- `scripts/security/run-zap-baseline.sh`
- `scripts/security/check-security-headers.sh`
- `scripts/security/host-security-check.sh`
- `scripts/security/generate-build-integrity.sh`
- `docs/security/*.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm playwright:test
bash scripts/security/run-sast.sh
bash scripts/security/run-sca.sh
bash scripts/security/run-secrets-scan.sh
TARGET_URL=http://host.docker.internal:3000 bash scripts/security/run-zap-baseline.sh
BASE_URL=http://localhost:3000 bash scripts/security/check-security-headers.sh
bash scripts/security/host-security-check.sh
bash scripts/security/generate-build-integrity.sh
bash scripts/security/check-build-integrity.sh
```

#### Acceptance Result
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、API/Web build、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。
- [x] `pnpm test` 通过：Web 20 files / 61 tests，API 48 files / 129 tests。
- [x] SAST 通过：Semgrep 0 findings；dangerous grep 均分诊为 Info / positive controls / test runners。
- [x] SCA 通过：`pnpm audit`、OSV、Trivy fs 均无 High/Critical；Docker image scan 因本地未构建镜像而跳过。
- [x] 密钥扫描通过：gitleaks current tree 和 git history 均 no leaks found。
- [x] ZAP baseline 在本地 production build 上无 Critical/High；CSP inline 类 Medium 已记录为后续 hardening。
- [x] Feishu OAuth state 已改为服务端保存、TTL、一次性消费并补测试。
- [x] 附件上传已补扩展名、MIME、魔数、路径穿越和响应头校验并补测试。
- [x] 权限、输入输出、文件上传、业务逻辑 R19 专项测试已新增并通过。
- [x] 本地 build integrity manifest 生成与复核通过。

#### Findings Summary
- Critical：0
- High：3，全部修复并复测
- Medium：3，其中 2 个修复，1 个 CSP inline hardening 延期
- Low：1，接受
- Info：6，接受或等待外部证据

#### Risks / Debt
- 公司私有云 IP / 主机访问 / 主机安全平台证据未提供，无法给私有云主机安全 PASS。
- 飞书后台权限、redirect URL、可用范围、通讯录范围和发布审核证据未提供，无法给飞书上架 PASS。
- Docker 镜像未在本地构建，Trivy image scan 待私有云镜像产物生成后执行。
- CSP 仍允许 inline script/style，建议后续引入 nonce/hash 或框架级 CSP hardening。
- 未提供 staging URL，未执行认证后 staging DAST。

#### Decision
STOP

#### Next Round
由用户或公司 IT / 飞书管理员补充私有云主机证据、Feishu 后台配置证据、staging URL 和镜像产物后，执行 R19 复审；证据齐全且无新 Critical/High 后再将上线建议从 `FAIL` 调整为 `PASS_WITH_RISK_ACCEPTANCE` 或 `PASS`。

### Round R20_REAL_WORLD_UAT_AUTOMATION

#### Goal
用 Playwright 操作真实网页，模拟营销、涂装工艺、采购、质量、生产、财务、项目经理、普通查看者和未登录用户，完整验证定制颜色开发系统的真实业务流程、权限边界、材料平台、数据中心和 UI 可用性，并对发现问题完成修复与复测。

#### Scope
- 新增 R20 测试计划、测试用例、运行报告、问题修复记录和最终验收文档。
- 新增 13 条 R20 Playwright 浏览器级 UAT 用例，覆盖核心页面、项目创建、第 1-18 步关键规则、材料、权限、数据中心和 UI。
- 新增 `pnpm playwright:test:r20`，支持只跑 R20 专项用例。
- 增加普通查看者 `viewer` 角色，用于真实只读权限验证。
- 补稳定 `data-testid`，降低业务页面浏览器测试脆弱性。
- 修复移动端时间线横向溢出风险。
- 修复 R16 / regression 月度评审断言在多 UAT 项目并存时的误判。
- 本轮完整写入测试仅在 local 执行，未对生产执行写入测试。

#### Inputs Read
- `/Users/lixiaochen/Desktop/ceshi.md`
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/app/globals.css`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `.gitignore`
- `package.json`
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/web/package.json`
- `apps/web/playwright.config.mjs`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/lib/auth-client.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/tests/playwright/r20-fixtures.ts`
- `apps/web/tests/playwright/r20-guide-dashboard.spec.ts`
- `apps/web/tests/playwright/r20-create-project.spec.ts`
- `apps/web/tests/playwright/r20-process-mainline.spec.ts`
- `apps/web/tests/playwright/r20-parallel-after-step6.spec.ts`
- `apps/web/tests/playwright/r20-nonblocking-step9.spec.ts`
- `apps/web/tests/playwright/r20-step12-rework.spec.ts`
- `apps/web/tests/playwright/r20-fee-fixed-10000.spec.ts`
- `apps/web/tests/playwright/r20-batch-to-monthly-review.spec.ts`
- `apps/web/tests/playwright/r20-color-exit.spec.ts`
- `apps/web/tests/playwright/r20-materials.spec.ts`
- `apps/web/tests/playwright/r20-permissions.spec.ts`
- `apps/web/tests/playwright/r20-analytics-consistency.spec.ts`
- `apps/web/tests/playwright/r20-ui-quality.spec.ts`
- `docs/testing/R20_REAL_WORLD_UAT_PLAN.md`
- `docs/testing/R20_TEST_CASES.md`
- `docs/testing/R20_TEST_RUN_REPORT.md`
- `docs/testing/R20_ISSUES_AND_FIXES.md`
- `docs/testing/R20_FINAL_ACCEPTANCE.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/real-world-uat-r20
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep @r20 --list
rm -rf test-results/r20
pnpm playwright:test:r20
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-009|R20-007|R20-005|R20-011|R20-013"
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-005"
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-011"
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

#### Acceptance Result
- [x] R20 专项测试清单识别 13 条用例。
- [x] `pnpm install` 通过。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 20 files / 61 tests，API 48 files / 130 tests。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/web build` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：28 passed。
- [x] `pnpm playwright:test:r20` 通过：13 passed。
- [x] 第 4 步完成后仅自动并行创建第 5 步和第 6 步。
- [x] 第 6 步完成后仅自动并行创建第 7 步、第 9 步和第 10 步。
- [x] 第 9 步未完成时主线仍可推进到第 12 步。
- [x] 第 12 步不通过必须填写原因，并退回第 11 步新轮次；第二轮通过后生成第 13、14 步。
- [x] 第 13 步固定 10000 元，且不阻塞第 14、15、16 步。
- [x] 第 16 步完成后当前项目生成 12 个月度评审实例。
- [x] 第 18 步按年产量给出建议，最终结论由人工确认。
- [x] 材料提交平台上传、归档、下载、元数据和权限校验通过。
- [x] 多角色权限、未登录访问和跨部门受限项目 IDOR smoke 通过。
- [x] 数据中心统计一致性通过。
- [x] UI 中文化、状态颜色、抽屉交互、1440px / 1920px / 移动端基本可读性通过。

#### Evidence
- `test-results/r20/screenshots/`：33 个截图文件。
- `test-results/r20/api-snapshots/`：8 个 API / 页面快照。
- `test-results/r20/exported-test-records/`：13 个结构化用例记录。
- `test-results/r20/traces/`：34 个 trace 附件 / 截图附件。
- `docs/testing/R20_TEST_RUN_REPORT.md`
- `docs/testing/R20_FINAL_ACCEPTANCE.md`

#### Issues Fixed
- 第 18 步颜色退出测试补齐必填退出日期和生效日期。
- 第 13 步收费测试在财务校验后切回项目经理推进主线。
- R20 mock 登录用户名改为角色维度稳定值，避免切换角色后项目可见性不稳定。
- 移动端时间线容器补响应式约束，修复横向溢出风险。
- R16 / regression 月度评审断言改为当前项目作用域，避免多个 UAT 项目并存误判。
- R20 权限 IDOR smoke 改为使用 seed 演示项目验证跨部门受限访问。

#### Risks / Debt
- 本轮完整写入 UAT 仅在 local 执行，未覆盖 staging / 生产网络、域名、证书、Nginx 和真实飞书入口。
- 本轮使用本地 mock-login 角色，不代表真实飞书企业自建应用授权链路。
- `test-results/` 证据目录为本地运行产物，不入库；交付给业务或测试人员时需从执行机器导出。
- R20 测试项目保留为证据数据，后续可按 `UAT-R20-` 前缀归档或清理。

#### Decision
CONTINUE

#### Next Round
建议进入 staging 部署验证和业务人工验收；不建议跳过 staging 直接在生产环境执行写入型 UAT。

---

### Round R21_FLOW_MAP_REALTIME_PROGRESS

#### Goal
将用户提供的轻卡颜色开发流程图升级为单项目“项目实时流程地图”，在不改变已冻结业务状态机和流程规则的前提下，让项目经理一眼识别 18 个节点的当前进度、并行支线、退回路径、风险节点、责任人、材料进度和下一步动作。

#### Scope
- 新增单项目实时流程地图页面 `/projects/:projectId/flow-map`。
- 新增后端聚合接口 `GET /api/projects/:projectId/flow-map`，避免前端拼装大量散接口。
- 在项目列表、项目时间线看板、项目上下文导航和工作台风险项目中增加流程地图入口。
- 保留第 4 / 6 步并行、第 9 / 13 步非阻塞、第 12 步退回、第 17 步 12 个月评审、第 18 步退出治理等冻结规则。
- 增加 30 秒地图轮询、15 秒抽屉轮询、手动刷新、风险筛选和节点点击抽屉。
- 补充组件测试与 Playwright 浏览器回归。
- 新增 R21 文档并更新执行账本。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `/Users/lixiaochen/Desktop/R21_FLOW_MAP_REALTIME_PROGRESS_Codex执行提示词.md`
- `/Users/lixiaochen/Desktop/ditu.md`
- `/Users/lixiaochen/Desktop/20260519-102141.png`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/task-detail-drawer.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/tests/playwright/regression.spec.ts`

#### Files Changed
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/projects/[projectId]/flow-map/page.tsx`
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/components/flow-map-workspace.test.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `docs/FLOW_MAP_REALTIME_PROGRESS_R21.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/flow-map-realtime-r21
pnpm --filter @feishu-timeline/web test -- flow-map-workspace.test.tsx
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/r21-flow-map-realtime-progress.spec.ts --config playwright.config.mjs
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/regression.spec.ts:134 --config playwright.config.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] 用户可见流程地图页面为中文 UI，无明显英文业务占位文案。
- [x] 项目详情新增“流程地图”页面，保留用户流程图拓扑。
- [x] 每个项目节点可显示步骤号、节点名称、状态颜色、负责人、截止时间、逾期天数、材料进度。
- [x] 第 12 步展示评审通过 / 退回路径和轮次信息。
- [x] 第 13 步展示固定 10000 元与非阻塞属性。
- [x] 第 17 步展示 12 个月整车色差一致性评审进度。
- [x] 第 18 步展示年产量、退出阈值、系统建议和人工结论。
- [x] 节点点击可打开工序详情抽屉，URL `taskId` 可恢复。
- [x] 风险筛选、主线筛选、我的任务筛选和未完成筛选可用。
- [x] 流程地图每 30 秒自动刷新，工序抽屉每 15 秒自动刷新，手动刷新可用。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 21 files / 65 tests，API 48 files / 130 tests。
- [x] `pnpm --filter @feishu-timeline/web build` 通过，包含 `/projects/[projectId]/flow-map`。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/api prisma:validate` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：29 passed。

#### Evidence
- `docs/FLOW_MAP_REALTIME_PROGRESS_R21.md`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `apps/web/src/components/flow-map-workspace.test.tsx`
- `test-results/r20/traces/`：Playwright 全量回归产物。

#### Issues Fixed
- R21 新增用例首次断言“最近更新”失败：将流程地图顶部最近更新时间拆为独立中文文案，并按 `YYYY-MM-DD HH:mm:ss` 输出。
- 全量 Playwright 发现月度评审页存在重复同名标题导致严格定位冲突：保留顶栏页面名，页面内卡片标题改为“月度评审进度总览”。

#### Risks / Debt
- 流程地图当前采用固定拓扑坐标，后续可补缩放、拖拽和平移。
- 实时刷新采用轮询，满足本轮要求；多人协同提醒可延期接 SSE / WebSocket。
- 全局多项目流程地图仍以现有时间线看板为主，本轮重点完成单项目实时流程地图。

#### Decision
STOP

#### Next Round
建议 R22 聚焦生产环境真实项目演示数据、流程地图截图证据归档，以及根据业务评审反馈优化节点密度、缩放和平移体验。
