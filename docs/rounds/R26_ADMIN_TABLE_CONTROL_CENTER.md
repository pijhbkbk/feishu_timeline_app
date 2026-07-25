# R26_ADMIN_TABLE_CONTROL_CENTER

## 目标

把 R26 的后台视觉入口升级为真实、桌面优先、表格驱动的管理控制中心。所有数据来自
staging 数据库；允许的修改必须经过服务端权限、字段白名单、影响预览、乐观锁、幂等、
事务和审计，不能绕过既有工作流状态机。

## 部署边界

- 分支：`codex/r26-admin-table-control-center`
- 环境：独立 staging
- production：禁止访问与部署
- V1：不修改
- `main`：不合并
- tag：不创建
- 人工门禁：完成 staging 技术验收后停止

## 页面

- `/admin`
- `/admin/projects`
- `/admin/tasks`
- `/admin/organization`
- `/admin/assignments`
- `/admin/permissions`
- `/admin/workflow-templates`
- `/admin/dictionaries`
- `/admin/audit-logs`

## 允许的管理命令

- 项目展示信息修改；
- 工序计划日期预览与调整；
- 工序主责部门、负责人、协同人与评审人预览与调整；
- 多工序原子批量调整；
- 正式 CSV 模板 dry-run 与计划日期导入；
- 用户启用、停用与锁定；
- 非系统保留字典项维护；
- 创建只影响未来项目的新流程模板版本。

## 永久禁止的直接编辑

- 项目状态；
- 工序状态；
- 当前节点；
- 实际完成时间；
- 第 12 步评审结论；
- 第 13 步收费状态与固定金额；
- 第 17 步月度结论；
- 第 18 步人工退出结论；
- 审计记录。

## 验收

1. 九个后台页面均展示真实数据，不出现占位骨架；
2. 项目、工序、组织表使用服务端分页、筛选与排序；
3. 保存视图、精简/完整列、当前筛选导出可用；
4. 批量变更和导入先 dry-run，失败时原子回滚；
5. 写请求均有原因、版本、幂等键、事务和审计；
6. 历史工序不可覆盖，冲突返回 409；
7. 1440、1024 可完整操作，390 为只读卡片；
8. console/page error 为 0，production 请求为 0。
