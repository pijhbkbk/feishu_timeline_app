# R26 公司部门删除与保存视图清理

日期：2026-08-03

## 目标

- 从后台控制中心删除“保存视图”全部前端入口和请求。
- 在公司部门页增加逐行选择、当前页全选、取消选择和批量删除。
- 删除必须由服务端裁决，不允许前端自行判断部门是否安全可删。

## 实现边界

- 路由：`/admin/organization?tab=departments`。
- 命令：`POST /api/admin/organization/departments/batch-delete`。
- 权限：`admin` 角色、`system.manage` 权限以及 `isSystemAdmin=true` 三重约束。
- 请求：部门 ID、部门数据版本、原因、`Idempotency-Key`、后果确认。
- 事务门禁：根部门、人员、下级部门、项目、工序、节点分工和标准板发放记录。
- 审计：每个成功删除的部门写入一条 `ADMIN_DEPARTMENT_DELETED`。

## 真实本机验证

环境：`http://localhost:8080`，本机 Docker PostgreSQL/Redis。

```text
AUTHENTICATED=true SYSTEM_ADMIN=true
ROOT_DELETE_HTTP=409
CODE=DEPARTMENT_DELETE_BLOCKED
REASON=组织根部门不能删除

ordinary user delete = 403
first delete idempotentReplay = false
same key replay idempotentReplay = true
deleted department remaining rows = 0
ADMIN_DEPARTMENT_DELETED audit rows = 1
```

一次性部门在验证结束时已删除；只保留不可变审计记录。测试认证会话已删除。

## 构建检查

```text
SAVED_VIEW_UI_BUNDLE_FILES=0
API/Web/nginx/PostgreSQL/Redis=healthy
```

本地 Web/API 镜像 tag 为 `local-department-delete-20260803`。本地构建未注入 Git 元数据，
`/api/health` 返回 `runtimeCommit=unknown`，因此不将其作为 staging 或 production 部署证据。

## 待人工视觉确认

既有内置浏览器标签停留在 Chrome 的 `ERR_CONNECTION_REFUSED` 数据错误页；工具安全策略明确
禁止从该受限页面重新导航到 localhost。未尝试通过其他浏览器控制面绕过。请在新的本地标签页
打开 `/admin/organization`，确认：

1. 页面没有“保存视图”和“保存当前视图”；
2. 公司部门表首列为选择框；
3. 选择部门后出现删除操作条；
4. 根部门提交删除时显示明确阻断原因；
5. 空且无引用部门可删除，刷新后不再出现。

## 当前状态

```text
CODE_IMPLEMENTED
LOCAL_API_VERIFIED
LOCAL_BROWSER_VISUAL_RECHECK_PENDING
PRODUCTION_UNCHANGED
MAIN_UNCHANGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
