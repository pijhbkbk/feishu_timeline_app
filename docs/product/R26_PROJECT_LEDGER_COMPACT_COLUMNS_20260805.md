# R26 项目总台账固定精简列

日期：2026-08-05

## 产品决定

`/admin/projects` 固定使用精简列，不再提供“显示完整列”或“使用精简列”按钮，也不保留隐藏的
完整列页面状态和渲染分支。

## 实现结果

- 删除项目台账工具栏中的列模式切换按钮。
- 删除 `fullColumns` 状态、属性和项目/工序表完整列条件分支。
- 项目表固定展示九列：项目、颜色 / 车型、当前工序、负责人 / 部门、风险、进度、计划结束、
  数据版本、操作。
- 保留搜索、分页和既有受控编辑能力；未改变 API、权限、数据库和工作流。

## 本机验收

- URL：`http://localhost:8080/admin/projects`
- 数据源：本机 Docker PostgreSQL 真实数据
- Web 镜像：`feishu-timeline-web:local-project-ledger-compact-20260805`
- “显示完整列”命中数：`0`
- “使用精简列”命中数：`0`
- 表头：固定九列
- 真实搜索：`R26-G3A-UAT-成员分工` 命中项目
- 刷新：通过，仍保持固定精简列
- console/page error：`0`

## 自动化证据

- 前端契约测试：`14/14` PASS
- 全仓 lint、typecheck：PASS
- 全仓测试：Web `45 files / 176 tests`；API `68 files / 315 tests`
- Web build、API build、Prisma validate、`git diff --check`：PASS
- Placeholder 原始扫描：全量 `22` 行；目标路由与组件 `0`

截图：
`docs/product/evidence/R26_PROJECT_LEDGER_COMPACT_COLUMNS_20260805/local-admin-projects-compact.png`

## 环境边界

本轮未提交、未推送、未部署 `https://timeline.all-too-well.com`，也未改变 `main` 或 tag。
当前状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_UNCHANGED /
AWAITING_PRODUCT_OWNER_CONFIRMATION`。
