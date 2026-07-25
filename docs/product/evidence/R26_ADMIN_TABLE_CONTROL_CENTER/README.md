# R26_ADMIN_TABLE_CONTROL_CENTER Evidence

本目录用于归档独立 staging 的：

- 1440 / 1024 / 390 页面截图；
- 项目与工序台账；
- 日期与分工影响预览；
- 批量修改预检；
- CSV 导入 dry-run；
- 18 节点分工矩阵；
- RBAC、模板、字典和审计；
- 网络请求、console/page error 与 production 请求计数；
- 数据库 migration、幂等命令和审计证明。

本目录不得存放 session cookie、App Secret、数据库密码或对象存储密钥。

## 已归档证据

| 证据 | 文件 |
|---|---|
| 后台总览 | `1440-admin-overview.png` |
| 项目总台账 | `1440-admin-projects.png` |
| 工序精简列 / 完整列 | `1440-admin-tasks-compact.png` / `1440-admin-tasks-full-columns.png` |
| 单工序日期影响预览 | `1440-admin-schedule-preview.png` |
| 批量日期 dry-run | `1440-admin-batch-preview.png` |
| 分工阻断预览 | `1440-admin-assignment-preview.png` |
| 组织用户 / 项目成员 | `1440-admin-organization-users.png` / `1440-admin-project-members.png` |
| 18 节点分工矩阵 | `1440-admin-assignments.png` |
| RBAC | `1440-admin-permissions.png` |
| 流程模板 | `1440-admin-workflow-templates.png` |
| 字典与参数 | `1440-admin-dictionaries.png` |
| 审计日志 | `1440-admin-audit-logs.png` |
| 1024px 台账 / 预览 | `1024-admin-tasks.png` / `1024-admin-schedule-preview.png` |
| 390px 项目 / 工序 / 组织 | `390-admin-projects.png` / `390-admin-tasks.png` / `390-admin-organization.png` |

## 浏览器与数据库结果

```text
主导航逐页当前项：
/dashboard → 工作台
/projects  → 项目列表
/tasks     → 我的任务
/progress  → 进展提交
/admin     → 系统管理

admin navigation copies per subsection: 1
V2 shell copies per page: 1
console/page errors: 0
production requests: 0

ADMIN_TASK_SCHEDULE_CHANGED command rows: 2
ADMIN_TASK_SCHEDULE_CHANGED audit rows: 2
UAT task due date restored: 2026-08-01 07:59
```
