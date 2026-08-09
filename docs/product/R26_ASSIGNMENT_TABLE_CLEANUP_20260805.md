# R26 分工配置表辅助文字清理

日期：2026-08-05

## 目标

- 在 `/admin/assignments` 删除表格内全部灰色辅助小字，只保留可直接用于判断分工的主数据。
- 保持项目切换、18 节点分工读取和受控“编辑分工”入口可用。
- 不修改 API、数据库、权限、分工数据或工作流。

## 实施结果

- 删除工序编码、字段类型、内联“编辑”提示、协同部门、匹配原因、分配说明等二级小字。
- 删除页面顶部“真实数据由服务端实时返回”、项目分工版本和字段类型说明。
- 保留步骤、工序、主责部门、当前负责人、协同人员、评审人员、匹配状态、分配来源与编辑操作。
- 将 `SUGGESTED` 状态统一显示为中文“建议匹配”，并复用蓝色建议状态样式。
- 缩短单元格内边距与最小高度，保持 18 行数据清晰、等距且双向居中。

## 本机真实页面验证

- URL：`http://localhost:8080/admin/assignments`
- 数据源：本机 Docker staging API 与 PostgreSQL，页面实际返回 18 个节点。
- DOM 结果：表格 `small` 元素 `0`，字段说明区块 `0`，灰色辅助文案命中 `0`，英文
  `SUGGESTED` 命中 `0`。
- 交互：切换项目后仍返回 18 个节点；点击“编辑分工”可打开受控编辑面板并正常关闭；未提交保存，
  本轮业务写请求为 `0`。
- 控制台：页面错误 `0`。
- 截图：`docs/product/evidence/R26_ASSIGNMENT_TABLE_CLEANUP_20260805/assignment-table-clean.png`。

## 运行身份

- Environment：本机 Docker staging。
- Web image：`feishu-timeline-web:local-assignment-table-clean-20260805`。
- Image digest：`sha256:db26b50adef18bafd591686cccb008e9ba3acc026937bc4b7f4dab77c9bb6a0d`。
- Web metadata：`runtimeCommit=unknown / buildTime=unknown / release=development`。
- 该本机镜像包含当前未提交工作树，不作为 production 或不可变 Git commit 证明。

## 质量门禁

- `pnpm install --frozen-lockfile`、lint、typecheck、Web/API build、Prisma validate 与
  `git diff --check` 全部通过。
- Web：`45 files / 178 tests` 通过。
- API：首次全量运行发生 Vitest worker 取模块超时；失败用例单独复跑 `3/3` 通过，随后完整
  API 测试 `69 files / 318 tests` 通过，确认为一次性工作线程超时而非业务失败。
- Placeholder 全量原始扫描 `22` 行，目标组件命中 `0`；本轮未删除或隐藏历史测试文案规避门禁。

## 状态

`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_DOCKER_STAGING_VERIFIED /
PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`
