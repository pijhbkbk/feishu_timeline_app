# R26_PRODUCT_UI_RECOVERY

## 目标与边界

- 暂停 R25B、生产发布、`main` 合并和稳定 tag。
- 保留后端业务能力、数据库、安全修复与稳定性结果。
- 当前用户端产品验收为 `FAIL`，当前 UI 不允许部署到公司私有云。
- Gate 0 完成设计解析、生产现状取证、路由/组件审计和 V2 规格。
- 用户确认 Gate 0 后，Gate 1 只实现隔离、静态、可交互的 V2 前端原型。
- Gate 1 不接真实 API，不修改后端/数据库，不运行发布流程。

仓库历史已经存在 `docs/rounds/R26.md`，记录“登录入口直达飞书”的已完成历史轮次。本文件使用用户指定的完整轮次名，避免覆盖历史记录。

## 基线

- 分支：`codex/r26-product-ui-recovery-gate0`
- 基线：`main@00d4d182ae34`
- 工作树开始时 clean。
- 未执行 merge、push、deploy、tag。

## 设计源

优先级：

1. Apple 风产品 UI：全局信息架构与正式页面；
2. 项目实时流程地图：项目工作区与固定拓扑；
3. 系统导览：只影响帮助/导览页。

Gate 0 读取了三份 12 页演示稿并生成可视蒙太奇。文件名差异和 SHA-256 记录在：

- `docs/product/R26_DESIGN_SOURCE_PRIORITY.md`

补充的固定拓扑原图已纳入 `docs/product/evidence/r26/design-sources/`，用于确认
第 4、6、12 步的分支关系和第 12 步 Y/N 语义；未改变三份 PPT 的优先级。

## 生产现状取证

- 使用已有 Safari 正式会话只读访问生产域名；
- 取证 48 个正式路由；
- 保存 1 个进展页内部 URL 改写后的空白故障态；
- 未读取或导出 Cookie、token、OAuth code、App Secret、storageState；
- 未创建、更新或删除生产数据。

主要现状：

- 主项目工作区可见层持续骨架屏；
- 进展页改写为 `step=1` 后整页空白；
- 多个项目业务页面长期显示加载态；
- 多个正式路由仍为 `PagePlaceholder`；
- 路由与组件重复，项目流程存在竞争视图；
- 业务事实大量使用 11–14px；
- 存在内部英文标注。

证据：

- `docs/product/evidence/r26/current-production/`
- `docs/product/R26_CURRENT_UI_AUDIT.md`

## Gate 0 输出

- `docs/product/R26_CURRENT_UI_AUDIT.md`
- `docs/product/R26_DESIGN_SOURCE_PRIORITY.md`
- `docs/product/R26_V2_INFORMATION_ARCHITECTURE.md`
- `docs/product/R26_FLOW_MAP_SPEC.md`
- `docs/product/R26_UI_ACCEPTANCE_CRITERIA.md`
- `docs/product/evidence/r26/current-production/README.md`

内容覆盖：

- 当前组件树和全部正式路由；
- 三份 PPT 的 36 页逐页差异矩阵；
- V2 必须废弃、只复用逻辑、继续保留的组件；
- `/v2/*` 与 Feature Flag 双隔离；
- 全部 V2 页面结构；
- 项目工作区 ViewModel 与现有 API/Prisma 映射；
- 固定 1440 × 1740 SVG 拓扑、18 节点和全部连线路径；
- 员工、项目经理、管理层三条操作路径；
- Gate 1 静态原型实施计划；
- Gate 1–4 的可见证据验收标准。

## 未执行

```text
产品代码修改       NOT RUN
lint              NOT RUN（Gate 0 无代码变更，不作为 UI 证据）
build             NOT RUN（Gate 0 无代码变更，不作为 UI 证据）
API 测试           NOT RUN（不作为 Gate 0 UI 证据）
main merge        NOT RUN
push              NOT RUN
production deploy NOT RUN
stable tag        NOT RUN
```

## Gate 0 决定

`R26_PRODUCT_UI_RECOVERY_GATE0_COMPLETE / CURRENT_UI_FAIL / V2_SPEC_FROZEN / STOP_BEFORE_GATE1`

进入 Gate 1 需要用户确认。Gate 1 只能创建隔离的静态 V2 原型，完成后必须在视觉闸门停止，不得部署。

## Gate 1 静态 V2 原型

### 分支与边界

- Gate 0 固定提交：`1e9d5ab57d09c70dc5b77deb8f4c01705d89bfb4`
- Gate 1 分支：`codex/r26-product-ui-recovery-gate1`
- 双重隔离：`/v2/*` + `NEXT_PUBLIC_R26_V2_PROTOTYPE=true`
- 未修改 `apps/api/`、Prisma、migration、数据库、Redis、OAuth、附件安全、审计或部署脚本。
- 未接真实业务 API；V2 自动化观测到的 `/api/` 请求为 0。

### 已实现路由

- `/v2/dashboard`
- `/v2/projects`
- `/v2/projects/demo-r26`
- `/v2/progress?projectId=demo-r26&taskId=t006`

四页使用独立 V2 运行时、typed fixtures、作用域 CSS 和 `sessionStorage` 原型状态；没有复用 V1 AppShell、旧流程地图或旧项目工作区布局。

### 固定流程地图

- `viewBox="0 0 1440 1740"`
- 18 个固定节点、坐标、尺寸、形状和连线路径
- 第 12 步菱形、第 17 步 `3 / 12` 环形进度、第 18 步人工退出决定
- 主线、并行、非阻塞、退回四类固定连线
- 节点点击更新详情并写入 `taskId` 或 `nodeCode`
- 刷新恢复同一节点；关闭详情保留地图比例

### 可见证据

- 固定视口截图：`test-results/r26-gate1/screenshots/`
- 三段交互录像：`test-results/r26-gate1/videos/`
- 四组 PPT 对比：`test-results/r26-gate1/comparisons/`
- 报告：`docs/product/R26_GATE1_STATIC_PROTOTYPE_REPORT.md`
- 索引：`docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- 人工复核：`docs/product/R26_GATE1_HUMAN_REVIEW.md`

### 自动化与质量门禁

```text
pnpm install --frozen-lockfile                                                    PASS
pnpm --filter @feishu-timeline/web lint                                          PASS
pnpm --filter @feishu-timeline/web typecheck                                     PASS
pnpm --filter @feishu-timeline/web test                                          PASS（28 files / 84 tests）
pnpm --filter @feishu-timeline/web build                                         PASS
R26 Playwright                                                                    PASS（7/7）
pnpm lint                                                                         PASS
pnpm typecheck                                                                    PASS
git diff --check                                                                  PASS
```

截图与录像是 Gate 1 的可见证据；lint、build 和路由存在没有被当作 UI 通过结论。

### Gate 1 决定

`R26_GATE1_IMPLEMENTED / STATIC_V2_ONLY / AWAITING_PRODUCT_OWNER_VISUAL_CONFIRMATION / NO_API_INTEGRATION / NO_DEPLOY / STOP`

人工验收项全部保持未勾选。未进入 Gate 2，未部署 staging/production，未合并 `main`，未创建 tag。
