# R26 关闭按钮视觉居中修复（2026-08-05）

## 问题与根因

- 原失败环境：本机 Docker staging。
- 原失败 URL：`http://localhost:8080/admin/organization`。
- 原失败入口：公司部门 → 编辑部门。
- 根因：管理抽屉使用原生文字字形 `×`，按钮仍带浏览器默认内边距和行盒；44×44 按钮中
  字形中心相对按钮中心向下偏移 1px，视觉上不对称。

## 修复

- 管理编辑抽屉和审计详情抽屉统一使用 `CloseIcon` SVG，不再使用原生 `×` 字形。
- 图标按钮明确使用 Grid/Flex 居中、`padding: 0`、`line-height: 0`，SVG 固定宽高并
  `display: block`。
- 同步收紧项目工作区工序详情、成员管理和完成工序抽屉的关闭按钮规则，防止同类默认样式回归。
- 文本型“关闭”按钮不改成图标，避免无关交互和可访问性变化。

## 本机真实页面证据

| 路由 | 入口 | 按钮 / 图标 | 中心偏差 X / Y | 结果 |
|---|---|---:|---:|---|
| `/admin/organization` | 公司部门 → 编辑部门 | 44×44 / 20×20 | 0px / 0px | PASS |
| `/admin/audit-logs` | 查看详情 | 38×38 / 18×18 | 0px / 0px | PASS |

- 组织抽屉截图：`docs/product/evidence/R26_CLOSE_BUTTON_ALIGNMENT_20260805/organization-department-centered.png`
- 审计抽屉截图：`docs/product/evidence/R26_CLOSE_BUTTON_ALIGNMENT_20260805/audit-detail-centered.png`
- 两个页面浏览器 console warning/error：`0`。
- 组织抽屉关闭按钮经过真实点击后，dialog 数量由 `1` 变为 `0`；再次点击“编辑部门”可正常恢复抽屉。

## 自动化与构建门禁

- 定向回归：`2` 个测试文件、`19/19` 项通过。
- 全量 Web：`45` 个测试文件、`178/178` 项通过。
- 全量 API：`69` 个测试文件、`318/318` 项通过。
- `pnpm install --frozen-lockfile`、lint、typecheck、Web/API build、Prisma validate 与
  `git diff --check` 全部通过。
- Placeholder 全量原始扫描命中 `22` 行；本轮两个正式路由组件没有新增 Placeholder，也没有
  通过删除测试或隐藏文案规避门禁。

## 本机环境身份

- URL：`http://localhost:8080/admin/organization` 与
  `http://localhost:8080/admin/audit-logs`。
- environment：本机 Docker staging；数据库为本机 staging PostgreSQL。
- Web image：`feishu-timeline-web:local-close-button-center-20260805`。
- Web image digest：
  `sha256:b6d491f89209593ea2ec57b3c0d3ad76af48bc932f6efe6c9b43bfe62b0b01d3`。
- 健康端点返回 `runtimeCommit=unknown / buildTime=unknown / release=development`；该镜像包含
  未提交工作树，不能作为不可变 commit 或 production 部署证明。

## 范围与状态

- 本轮只修改关闭图标与其布局样式，不修改 API、数据库、权限、工作流或业务数据。
- production、`main` 与 tag 均未修改。
- 当前状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_DOCKER_STAGING_VERIFIED / PRODUCTION_UNCHANGED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`。
