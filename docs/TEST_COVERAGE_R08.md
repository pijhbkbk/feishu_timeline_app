# R08 测试覆盖说明

## 目标

补齐流程型系统在 R08 轮次要求的关键自动化测试，覆盖规则计算、并行流转、月度周期、权限边界、附件上传和一条真实 HTTP 主链路。

## 新增覆盖

### 单元 / 服务测试

- `apps/api/src/modules/workflows/workflow-deadline.service.spec.ts`
  - 工作日 SLA 计算
  - 节假日 / 调休覆盖
  - 手工评审通过节点的工作日时限
- `apps/api/src/modules/workflows/workflow-node.constants.spec.ts`
  - 第 4 步通过后并行创建第 5、6 步
  - 第 6 步完成后创建主线与并行任务
  - 标准板完成后自动创建色板明细更新
- `apps/api/src/modules/workflows/workflow-recurring.service.spec.ts`
  - 第 17 步生成 12 个按月实例
  - 已存在周期计划时不重复创建
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
  - 主线节点同步只看活跃主任务，并行任务不阻塞主线
- `apps/api/src/modules/color-exits/color-exits.rules.spec.ts`
  - 第 18 步退出前必须具备统计年度、年产量、人工结论、生效日期

### 现有测试复用

- `apps/api/src/modules/attachments/attachments.service.spec.ts`
  - 附件上传元数据、逻辑删除、实体绑定校验
- `apps/api/src/modules/auth/*.spec.ts`
  - 权限编码、守卫与项目访问控制
- `apps/api/src/modules/reviews/reviews.rules.spec.ts`
  - 第 12 步通过 / 驳回去向

### E2E 主链路

- `apps/web/scripts/e2e-mainline.mjs`
  - `finance` 角色无项目创建权限
  - `project_manager` 可创建项目
  - 项目附件上传成功
  - 主线从立项推进到第 4 步
  - 第 4 步通过后并行创建取号与采购
  - 第 6 步完成后创建首台计划与并行任务
  - 并行任务不阻塞主线推进
  - 第 12 步驳回后退回第 11 步并生成新轮次
  - 再推进到批量生产
  - 第 17 步生成 12 个月度实例
  - Web 流程页与评审页可渲染关键区块

## 执行命令

```bash
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/web test
pnpm --filter @feishu-timeline/web test:e2e
```

## 说明

- `test:e2e` 会先执行 `prisma:seed`，再复用现有 `api/web` 服务；若服务未启动，会自动拉起本地 dev server。
- E2E 依赖本地 PostgreSQL / Redis 可用，这是 R01 已冻结的开发前提。
