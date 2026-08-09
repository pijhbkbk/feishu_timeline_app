# R26 共享页头动作与材料页英文标签清理

日期：2026-08-08

## 产品决策

- 所有正式页面的共享页头不再提供全局搜索、通知或帮助图标。
- 账号菜单和四项主导航继续保留。
- 页面自身具备真实业务用途的搜索控件继续保留，例如项目列表的关键字搜索。
- 材料上传页不再显示 `Required`、`Upload`、`History`，只保留中文业务标题。

## 复现与根因

原失败 URL：

`http://localhost:8080/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`

`AppShell` 与 `V2Shell` 各自重复渲染全局搜索、通知和帮助入口；材料组件还直接渲染三项英文
overline，因此同类问题会随共享外壳扩散到多个正式路由。

## 实施结果

- 两套共享外壳不再渲染三项全局动作。
- 删除专用通知前端组件和通知客户端，避免保留不可达的前端功能入口。
- 清理对应图标导出与通知样式。
- 材料上传页三项英文标签已删除。
- 项目列表页面内真实搜索逻辑未删除。

## 自动化证据

- `pnpm install`：PASS。
- `pnpm lint`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm test`：PASS；Web 47 files / 193 tests，API 70 files / 329 tests。
- `pnpm --filter web build`：PASS。
- `pnpm --filter api build`：PASS。
- `pnpm --filter api prisma:validate`：PASS。
- `git diff --check`：PASS。

## 本机浏览器证据

环境：`http://localhost:8080`

原失败 URL 在 1280×720 真实重载后：

- 共享页头全局搜索入口：0。
- 共享页头通知入口与角标：0。
- 共享页头帮助入口：0。
- `Required`、`Upload`、`History`：0。
- 主导航与账号菜单：保留并可见。
- console/page error：0。

代表性回归还覆盖 `/projects` 与 `/v2/dashboard`，两套共享外壳均不再出现上述全局动作。

截图：

`docs/product/evidence/R26_HEADER_ACTION_CLEANUP_20260808/after-materials-upload-1280.jpg`

## 运行身份

- Web image：`feishu-timeline-web:local-header-cleanup-20260808`
- Web image identity：
  `sha256:44ae792099411eb6e56ff0073e361d96b4f973529a7e4e94e61082dbf29e035c`
- runtime commit：`unknown`（本机镜像来自未提交工作树）
- source baseline HEAD：`2081c3920bb5c41578ef9c189477d05f392896ad`

## 边界与准确状态

- 本轮没有提交、推送、合并或部署 production。
- 未重新取得 1024/390 受控浏览器视口证据，不把上一轮证据当成本轮证据。
- 本轮目标路由 Placeholder 数量为 0；历史正式 Placeholder 路由组为 4 个。
- 当前状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_RUNTIME_UPDATED / NOT_DEPLOYED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`。
