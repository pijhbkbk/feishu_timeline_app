# R26 第 05 步受控颜色编号

日期：2026-08-05

## 目标

- “颜色编号”只允许在第 05 步“新颜色取号”的正式完成命令中产生。
- 服务端在同一数据库事务内校验编号、确认材料和唯一性，并记录完整来源。
- 颜色数据库及其他业务读模型不再把历史自由填写的 `Color.code` 当作正式颜色编号。

## 服务端裁决

第 05 步完成前，服务端要求：

1. 提交格式有效的颜色编号；
2. 当前任务已关联未删除的“颜色编号确认单”；
3. 编号在系统内不区分大小写唯一；
4. 项目只有一个可确定的目标颜色；
5. 当前任务仍满足原有权限、状态、材料、阻塞、版本和幂等门禁。

完成命令在同一 Serializable 事务中写入：

- `Color.code`；
- `Color.numberingTaskId`；
- `Color.numberedById`；
- `Color.numberedAt`；
- `Color.numberingAttachmentId`；
- 工作流状态转换、项目活动和审计日志。

客户端不能指定目标颜色、下一节点或负责人。重复编号和并发唯一键冲突均由服务端拒绝。

## 读取规则

颜色数据库只查询同时具备以下条件的颜色：

- 编号任务、操作人、操作时间和确认材料来源完整；
- 来源任务是第 05 步且已完成；
- 确认材料未删除，并且关联到同一个编号任务。

项目、工作台、颜色退出、复盘和流程相关读模型也通过同一受控编号判断，避免历史自由字段重新进入业务页面。

## 数据库迁移

迁移文件：

`apps/api/prisma/migrations/20260805213000_add_color_numbering_provenance/migration.sql`

本轮只生成并校验迁移，未应用到本机、staging 或 production 数据库。

## 验证结果

```text
pnpm install --frozen-lockfile                       PASS
pnpm lint                                            PASS
pnpm typecheck                                       PASS
pnpm test                                            PASS（Web 178 / API 327）
pnpm --filter web build                              PASS
pnpm --filter api build                              PASS
pnpm --filter api prisma:validate                    PASS
git diff --check                                     PASS
```

定向回归覆盖：缺少编号、缺少确认材料、编号重复、事务内来源写入、受控颜色归档，以及旧自由编号不进入颜色数据库。

## 当前门禁

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
DATABASE_MIGRATION_NOT_APPLIED
BROWSER_E2E_NOT_RUN
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
