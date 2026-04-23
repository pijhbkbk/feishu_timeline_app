# EXECUTION_LEDGER.md

> 用途：记录 Codex 每一轮执行情况、验收结果、风险、遗留问题与下一轮决策。
> 要求：每完成一轮，必须更新本文件。

---

## 项目基本信息

- 项目名称：轻卡定制颜色开发项目管理系统
- 当前阶段：Release Closure
- 当前轮次：Release Closure
- 总体状态：READY_FOR_RELEASE
- 仓库路径：`/Users/lixiaochen/Downloads/feishu_timeline_app`
- 默认分支：`main`
- 最近更新时间：`2026-04-23`

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
| Release Closure | 正式发布收口（v1.0.0） | IN_PROGRESS | STOP | 进入文档、Git、生产环境三者对齐阶段，待 main 合并、生产重部署与 tag 收口 |

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
