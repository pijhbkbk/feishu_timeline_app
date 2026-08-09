# R26 共享顶部导航响应式收敛（2026-08-07）

## 问题与根因

- 原失败 URL：`http://localhost:8080/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`。
- 原失败视口：`390 × 844`。
- 共享 `AppShell` 和 `V2Shell` 在窄屏时都会隐藏页头主导航，并在页面底部
  渲染第二套固定导航。结果是同一套产品在宽屏使用顶部导航、窄屏改到底部，
  还会与固定操作栏、表单和浏览器安全区竞争空间。

## 修复

- 两套正式外壳都只保留一套主导航，且主导航始终位于页头。
- 窄屏页头改成两行：品牌与账号工具位于第一行，四项主导航位于第二行。
- 主导航使用等宽紧凑入口和横向滚动兜底，不产生整页横向溢出。
- 移除固定底部导航，并同步取消原先为其预留的页面底部空间。
- 调整窄屏粘性步骤条、项目页签、工作区跳转和提示条位置，避免被增高后的页头遮挡。
- 新增两套共享外壳的 CSS/组件契约回归，禁止再次渲染第二套底部导航。

## 本机浏览器证据

| 检查项 | 结果 |
|---|---|
| 断点 `1440 / 1024 / 390` | 6 个正式路由 × 3 个视口，共 18 组全部通过 |
| 路由 | `/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`、`/dashboard`、`/projects`、`/tasks`、`/projects/cmryawpo40001pa01qbz0aly5`、`/admin/organization` |
| 导航位置 | 18/18 均为页头顶部导航；旧固定底部导航节点为 0 |
| 当前项 | 18/18 正确；材料上传和进展提交归入“我的任务”链路 |
| 真实点击 | 在 390px 原失败页面依次点击工作台、项目列表、我的任务、系统管理，4/4 路由、URL 与当前态正确 |
| 真实滚动 | 原失败页面滚动至 `scrollY=1031` 后导航仍位于页头，页面内容和操作区未被旧底栏遮挡 |
| 横向溢出 | 18/18 的 `scrollWidth == clientWidth`，页面级横向溢出为 0 |
| page error | 真实浏览器未出现 Next.js 错误页、白屏或交互异常 |
| console | 浏览器控制接口不提供 DevTools Console 流，因此不伪报 console error 0；本轮只确认可观察页面错误为 0 |

截图证据：

- `docs/product/evidence/R26_RESPONSIVE_NAV_FIX_20260807/materials-upload-1440.png`
- `docs/product/evidence/R26_RESPONSIVE_NAV_FIX_20260807/materials-upload-1024.png`
- `docs/product/evidence/R26_RESPONSIVE_NAV_FIX_20260807/materials-upload-390.png`

## 自动化与构建

```text
pnpm --filter web test -- --run \
  src/features/v2/v2-shell.test.tsx \
  src/lib/navigation.test.ts \
  src/features/v2/v2-shell-responsive.contract.test.ts
PASS: 3 files / 31 tests

pnpm --filter web lint
PASS

pnpm --filter web typecheck
PASS

pnpm --filter web test
PASS: 48 files / 194 tests

pnpm --filter web build
PASS: Next.js 15.5.21 production build，33 个静态页面
```

## 环境边界

- 验证环境：本机 Docker staging，`http://localhost:8080`。
- 原失败精确 URL：`http://localhost:8080/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`。
- Web image：`feishu-timeline-web:local-top-nav-only-20260807b`。
- Web image identity：`sha256:c8c3c2ebd0de2f777c2fb5e2a0fd1520a925cb283dd7fb7ee6266831715cc63d`。
- API image identity：`sha256:2e552ff3d420ab37aa70d6abd070dfffa4cbccb81501c52d1923a65574dc5781`；本轮未重建 API。
- Nginx image identity：`sha256:ec664813a30459a8e7176315268a623f6b31abc370eeac51c7de81cd4ec4d451`；本轮未修改 upstream。
- Web 容器创建时间：`2026-08-07T14:06:28.358221136Z`。
- 当前工作树包含未提交的既有修改，因此 Web build metadata 不能作为不可变 runtime commit；准确值为 `runtimeCommit=unknown`。
- 数据库、API、Redis、Nginx 和业务数据均未改变。
- 未提交、未推送、未修改 production、main 或 tag。
- Placeholder 扫描：全仓原始模式命中 22 行；本轮 6 个正式验收路由命中 0；历史 `PagePlaceholder` 正式路由 4 个，不在本轮范围。

当前状态：

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
LOCAL_DOCKER_STAGING_VERIFIED
PRODUCTION_NOT_DEPLOYED
MAIN_UNCHANGED
TAG_UNCHANGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
