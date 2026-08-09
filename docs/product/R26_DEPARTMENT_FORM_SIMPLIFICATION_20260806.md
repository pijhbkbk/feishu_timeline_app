# R26 公司部门表单收敛（2026-08-06）

## 目标

- 在“新增公司部门”和所有“编辑公司部门”面板中移除顶部蓝色提示框。
- 不再向管理员展示或要求填写部门编码、显示顺序和变更原因。
- 保留部门名称、所属事业部、部门负责人和启用状态。

## 实现

- Web 部门表单不再渲染或提交 `code`、`sortOrder`、`reason`。
- 部门写命令不再要求上述三个字段。
- 新增部门时，部门编码由服务端根据名称生成，显示顺序由同一事业部下现有部门自动递增。
- 编辑部门时，已有编码和显示顺序保持不变。
- 审计日志仍保留，并由服务端写入系统默认业务原因及 `SYSTEM_DEFAULT` 来源标记。
- 权限校验、所属事业部白名单、乐观锁、幂等、事务和审计边界保持不变。

## 自动化验证

```text
pnpm --filter api test -- admin-control-center.contract.spec.ts   PASS（15）
pnpm --filter web test -- admin-control-center.contract.test.ts  PASS（16）
pnpm lint                                                        PASS
pnpm typecheck                                                   PASS
pnpm test                                                        PASS（Web 180 / API 329）
pnpm --filter web build                                         PASS
pnpm --filter api build                                         PASS
pnpm --filter api prisma:validate                               PASS
```

## 本机真实浏览器验证

- 精确 URL：`http://localhost:8080/admin/organization`。
- 依次打开“财务部”“总部”的编辑面板，并打开“新增公司部门”面板。
- 三个面板中以下文案命中数均为 `0`：
  - `不会直接修改流程状态`
  - `部门编码`
  - `显示顺序`
  - `变更原因`
- 保留字段：部门名称、所属事业部、部门负责人、启用状态。
- 关闭按钮验证通过；关闭后对话框数量为 `0`。
- 浏览器 console error：`0`。
- 未点击“确认保存”，未修改任何部门数据。
- 证据：
  - `docs/product/evidence/R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/edit-finance-after.png`
  - `docs/product/evidence/R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/create-after.png`

## 环境边界

- 精确本机复测 URL：`http://localhost:8080/admin/organization`。
- 本机 Web/API 镜像 tag：`local-department-form-simplified-20260806`。
- production 未部署，main 指针未改变，tag 未改变。
- 产品状态：`AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## 部门负责人文字输入补充

- “新增公司部门”和“编辑公司部门”中的“部门负责人”已由固定下拉框改为自由文字输入框。
- 管理员输入姓名后，由服务端按启用系统用户的姓名精确匹配；前端不拼接或伪造用户 ID。
- 精确匹配到 1 名用户时保存其真实 `leadUserId`；未匹配或匹配到多名同名用户时，服务端返回明确错误并拒绝写入。
- 留空仍表示“待设置”，已有部门负责人打开编辑面板时会回填姓名。
- 部门负责人仍必须是该部门成员，原有成员关系、权限、版本校验、幂等和审计约束不变。

### 本机验证

- 精确 URL：`http://localhost:8080/admin/organization`。
- 打开“涂装工艺部”编辑面板后，“部门负责人”文本输入框数量为 `1`，同名下拉框数量为 `0`。
- 在输入框中键入“演示工艺工程师”后，页面正确保留输入值。
- 点击“取消”退出，未提交写请求，未修改部门数据。
- 本轮本机 Web/API 镜像 tag：`local-department-lead-name-input-20260806`。
