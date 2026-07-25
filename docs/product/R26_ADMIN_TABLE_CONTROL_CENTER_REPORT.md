# R26 后台表格控制中心实施报告

## 结论

R26 后台已从占位页改造成真实数据管理控制中心。总览卡片保留为入口，正式管理能力由
项目、工序、组织、分工、权限、模板、字典和审计数据表承载。

## 数据与页面

| 页面 | 数据来源 | 管理能力 |
|---|---|---|
| `/admin` | 数据库聚合 | 项目、工序、组织、分工、模板、异常摘要 |
| `/admin/projects` | Project/Color/WorkflowTask | 查询、分页、列设置、基础信息白名单编辑 |
| `/admin/tasks` | WorkflowTask/Definition/Attachment/Blocker | 预设视图、分页、完整列、导出、批量与导入 |
| `/admin/organization` | User/Department/ProjectMember | 用户、部门、项目成员；用户状态受控修改 |
| `/admin/assignments` | Gate 3A 分配服务 | 18 节点多字段分工表、影响预览与受控保存 |
| `/admin/permissions` | Role/RolePermission | 真实 RBAC 矩阵，只读展示服务端边界 |
| `/admin/workflow-templates` | ProcessTemplate/NodeDefinition | 版本化模板管理，运行中项目不受影响 |
| `/admin/dictionaries` | SystemEnumItem/SystemParameter | 非保留项维护，核心参数锁定 |
| `/admin/audit-logs` | AuditLog | 永久只读、脱敏、分页审计 |

## 安全边界

- Controller 统一要求 `admin` 角色与 `system.manage` 权限；
- 写接口均为明确 command，无万能 PATCH；
- DTO 白名单限制字段、长度、枚举和批量上限；
- 每次写入校验当前数据版本并使用 `Idempotency-Key`；
- 分工配置只接受项目有效成员和启用部门；人员关系去重且评审字段受节点类型约束；
- 命令与审计在同一 Prisma 事务中提交；
- 已完成、已退回、已取消等历史工序拒绝日期与分工修改；
- 状态、当前节点、实际完成时间和专项结论没有直接写接口；
- CSV 导出防公式注入；导入限制 1 MB/100 行并拒绝公式前缀。

## 响应式

- 1440：完整数据表、列组、批量选择和右侧受控操作面板；
- 1024：保留横向滚动、筛选和抽屉；
- 390：项目、工序和组织切换为可读卡片，复杂编辑明确提示使用桌面端。

分工配置的详细字段、并发验证与飞书多维表格边界见
`R26_ADMIN_ASSIGNMENT_GRID_REPORT.md` 和
`R26_FEISHU_BITABLE_INTEGRATION_BOUNDARY.md`。

## 自动化结果

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 44 files / 172 tests；API 67 files / 301 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

## Staging 证据

独立 staging `http://localhost:8080` 已使用真实飞书会话完成浏览器验收：

- 九个后台入口均读取真实数据库数据，无占位骨架；
- 1440px 完成项目、工序、组织、分工、权限、模板、字典和审计逐页检查；
- 1024px 保留可读表格、横向滚动和完整影响预览；
- 390px 改用只读卡片，隐藏保存视图、完整列、导入和批量写操作；
- 主导航逐页仅有一个当前项，名称固定为“项目列表”和“系统管理”；
- 计划日期先预览、再执行、最后恢复原值，两次命令均成功且各写入一条审计日志；
- 分工候选不足时服务端返回明确阻断原因，前端禁用确认按钮；
- 浏览器 console/page error 为 0；
- 所有验收请求仅发送到本机 staging，production 请求为 0。

数据库证据：

```text
20260725183000_r26_admin_control_center migration    APPLIED
admin_command_requests / ADMIN_TASK_SCHEDULE_CHANGED 2
audit_logs / ADMIN_TASK_SCHEDULE_CHANGED             2
staging task plannedDueAt after UAT restore          2026-08-01 07:59
```

截图与逐项记录归档在
`docs/product/evidence/R26_ADMIN_TABLE_CONTROL_CENTER/`。

## 门禁

本轮不部署 production，不合并 `main`，不创建 tag。staging 完成后停在产品负责人
人工验收门禁。
