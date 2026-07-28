# R26 系统管理首页简化与颜色数据库实施报告

## 结论

- `/admin` 已收敛为系统概况首页，只显示 6 项真实指标和 2 个主入口。
- `/admin/manage` 统一承接原有后台能力，按 5 个业务域组织，不删除既有管理功能。
- `/admin/color-database` 与 `/admin/color-database/:colorId` 已形成颜色资料的只读归档、检索与追溯入口。
- 颜色数据库直接引用既有 `Color`、`Attachment`、项目、工序、上传人和部门关系；不复制文件，不新增上传入口，不建立第二套对象存储。
- 工作流状态机、V1、production、`main` 和 tag 均未修改。

## 页面信息架构

| 路由 | 作用 | 状态 |
| --- | --- | --- |
| `/admin` | 真实系统指标与两个主入口 | 已实现 |
| `/admin/manage` | 项目与工序、组织与成员、分工与权限、流程与参数、审计与异常 | 已实现 |
| `/admin/color-database` | 颜色搜索、筛选、统计、分页、空态和错误恢复 | 已实现 |
| `/admin/color-database/:colorId` | 颜色基本信息、关联项目和七阶段生命周期材料 | 已实现 |

`/admin` 不再显示原横向二级选项卡、后台模块平铺卡片、大字图标、Placeholder 或“已创建骨架”。

## 真实数据口径

系统概况由 `GET /api/admin/overview` 聚合：

- 项目总数：全部项目。
- 进行中项目：状态不是 `COMPLETED` 或 `CANCELLED` 的项目。
- 风险项目：进行中项目中存在逾期任务、开放阻塞或逾期评审任务的项目。
- 启用人员：有效系统用户。
- 启用部门：有效公司部门。
- 已归档颜色：现有颜色主档数量；辅助显示现有附件总数。

颜色数据库由以下既有数据生成服务端只读 ViewModel：

```text
Color / ColorVersion
  -> Project
  -> WorkflowTask(nodeCode, stepCode, nodeName)
  -> Attachment(versionNo, replacesAttachmentId, materialType)
  -> User -> Department
  -> Supplier
```

归档逻辑优先使用附件直接绑定的颜色或颜色版本；工序附件使用项目主颜色。附件根据工序号自动进入七个生命周期阶段。被新附件的 `replacesAttachmentId` 引用的版本标记为“历史版本”，链路末端标记为“当前版本”。文件查看继续使用原附件下载/预览接口。

## 权限与边界

- 系统概况与详细管理继续使用 `admin` 角色及 `system.manage` 权限守卫。
- 颜色列表和详情要求登录并具有 `project.read`；管理员可查看全部，普通成员只返回本人负责、
  参与或所属部门有权访问的项目颜色。匿名请求返回 `401`，越权颜色详情返回 `404`。
- 前端没有颜色合并、拆分、删除、上传或状态机动作。
- 原始附件、附件历史、审计日志和工作流状态均未改变。
- 本轮没有 Prisma schema 或 migration 变更。

## 浏览器验收

Playwright 覆盖：

- `/admin`：1440、1024、390 三档截图；6 个指标、2 个入口、无横向溢出。
- `/admin/manage`：五个管理域真实入口及三档截图。
- `/admin/color-database`：真实颜色列表、搜索、五类筛选、分页、空态、错误态及恢复。
- `/admin/color-database/:colorId`：七阶段材料、项目/工序/人员/部门/版本来源及三档截图。
- console error：0。
- page error：0。
- production 请求：0。
- 管理业务请求：仅 GET。

证据目录：`docs/product/evidence/R26_ADMIN_DASHBOARD_COLOR_DATABASE/`。

当前本地真实数据中存在 2 个颜色档案和 29 份材料；当前数据没有形成可见的替换版本链，因此页面显示的均为当前版本。历史版本识别逻辑由 API 单元测试使用 V1 被 V2 替换的数据覆盖，未伪造 staging 业务数据。

## 已执行测试

- API 颜色数据库单元测试：列表聚合、七阶段分类、V1/V2 当前/历史标记与详情。
- Web 契约测试：极简首页、两入口、颜色列表与详情结构。
- Playwright：3/3 PASS，覆盖三档响应式、真实点击、空态、错误恢复、匿名 401、普通成员
  项目范围隔离和零生产请求。
- 完整仓库检查 PASS：Web 45 files / 170 tests，API 68 files / 310 tests；lint、typecheck、
  Web/API build 与 Prisma validate 全部通过。具体结果见 `docs/EXECUTION_LEDGER.md`。

## 停止状态

```text
R26_ADMIN_DASHBOARD_SIMPLIFIED
COLOR_DATABASE_IMPLEMENTED_ON_STAGING
EXISTING_MATERIALS_AUTOMATICALLY_ARCHIVED
PRODUCTION_UNCHANGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
STOP
```
