# R26 系统管理：组织与人员完整配置报告

## 结论

本轮已将“组织与人员”从只读台账升级为超级管理员受控配置中心。系统用户、公司部门、
项目成员均可在统一界面中新增、编辑或安全移除；所有写操作都由服务端预览影响、校验
权限和数据版本、执行幂等保护并写入审计日志。前端不直接修改工作流状态，也不覆盖飞书
身份主键。

本轮仅在本机开发环境和独立 staging 验证，不包含 production 发布。

## 已实现能力

### 系统用户

- 新增系统用户。
- 编辑登录名、姓名、邮箱、手机号、所属部门、启用/停用/锁定状态、系统角色和超级管理员标记。
- 飞书 User ID、Open ID、Union ID 保持只读，由身份同步维护。
- 禁止停用当前账号、移除最后一名启用中的超级管理员，或停用仍担任部门负责人的用户。
- 用户项目关系、历史任务和审计历史不因基础参数调整而删除。

### 公司部门

- 新增部门；编辑部门编码、名称、上级部门、负责人、排序和状态。
- 服务端维护层级路径，移动或改码时同步重算全部下级路径。
- 禁止循环层级、重复编码、无效负责人和停用仍有关联人员、下级部门、项目或工序的部门。
- 新增真实 `Department.leadUserId` 关系和 Prisma migration。

### 项目成员

- 添加成员、编辑项目职责、成员类型、部门负责人和默认执行人标记。
- 安全移出项目成员，负责人替换和任务转交复用既有 Gate 3A 分配服务。
- 转交候选人只来自当前项目的有效成员，前端不根据部门或角色自行拼负责人。
- 进行中任务必须逐项确认；移除操作先预览，再执行版本校验和审计写入。

## 安全与一致性

- API 同时要求 `admin` 角色、`system.manage` 权限和超级管理员身份。
- 所有写请求要求 `Idempotency-Key`；相同键和相同输入直接返回原结果。
- 用户和部门写入在同一数据库事务内重新校验版本、唯一性、层级、负责人和停用门禁。
- 实际本地写入烟测覆盖：创建部门、创建用户、相同幂等键重放、设置/清除部门负责人、
  停用测试用户和测试部门。测试对象最终保持停用，不删除审计记录。
- 修复了相同幂等键重试被重复数据预校验提前拦截的问题。

## 响应式与浏览器证据

证据目录：`docs/product/evidence/R26_ADMIN_ORGANIZATION_MANAGEMENT/`

- `organization-member-removal-1440.png`：成员移除、项目内候选人和影响预览入口。
- `organization-department-edit-1024.png`：部门完整编辑面板。
- `organization-user-edit-390.png`：移动端全屏用户编辑面板。

真实浏览器结果：

| 视口 | 页面横向溢出 | Console/Page error | 结果 |
| --- | ---: | ---: | --- |
| 1440×900 | 0 | 0 | PASS |
| 1024×900 | 0 | 0 | PASS |
| 390×844 | 0 | 0 | PASS |

1024px 首轮发现后台表格最小宽度撑大整页，修复后表格横向滚动被限制在自身容器，整页
`scrollWidth` 从 1186 降为 1009（等于有效视口宽度）。

## 自动化与构建

```text
pnpm install                         PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS
  Web: 44 files / 174 tests
  API: 67 files / 305 tests
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

## 发布边界

```text
R26_ADMIN_ORGANIZATION_MANAGEMENT_IMPLEMENTED
SUPER_ADMIN_USER_DEPARTMENT_MEMBER_CONTROLS_ENABLED
PREVIEW_IDEMPOTENCY_CONCURRENCY_AUDIT_VERIFIED
PRODUCTION_NOT_TOUCHED
AWAITING_PRODUCT_OWNER_STAGING_CONFIRMATION
```
