# R26 Gate 1 静态 V2 原型报告

## 结论

本轮 `R26_PRODUCT_UI_RECOVERY_GATE1_STATIC_V2_PROTOTYPE` 已实现四个隔离的静态 V2 场景，当前停在产品负责人视觉与交互确认闸门。

```text
R26_GATE1_IMPLEMENTED / STATIC_V2_ONLY / AWAITING_PRODUCT_OWNER_VISUAL_CONFIRMATION / NO_API_INTEGRATION / NO_DEPLOY / STOP
```

这不是生产完成结论，也不授权进入 Gate 2。

## 实现范围

| 路由 | 核心问题 | 已实现结果 |
| --- | --- | --- |
| `/v2/dashboard` | 今天最应该推进什么？ | 大字号问候、唯一当前任务卡、六阶段摘要、四类事实、最近动态和唯一主动作 |
| `/v2/projects` | 哪些项目需要介入，为什么？ | 四个 KPI、五种即时筛选、三张项目卡、直接可见的停滞原因和受控“新建项目”提示 |
| `/v2/projects/demo-r26` | 当前在哪一步，谁负责，下一步是什么？ | 项目总览、固定 SVG 流程地图、节点点击、URL 恢复、工序详情和活动记录 |
| `/v2/progress?projectId=demo-r26&taskId=t006` | 如何在 60 秒内提交可信进展？ | 自动带出上下文、三步表单、条件阻塞字段、本地文件名交互、成功反馈和跨页本地联动 |

## 双重隔离

- 路由隔离：所有新增页面均位于 `/v2/*`。
- Feature Flag：仅 `NEXT_PUBLIC_R26_V2_PROTOTYPE=true` 时可用；关闭时返回 404。
- V2 根运行时不加载 V1 `Providers`、旧 `AppShell` 或认证/API 初始化。
- V1 页面和导航没有改写；根布局仅按请求路径选择原有 V1 运行时或 V2 运行时。
- V2 CSS 全部作用域化在 `[data-ui-version="r26-v2"]`。
- 未导入旧 `PagePlaceholder`、旧时间线、旧流程地图或旧项目工作区。
- 浏览器网络守卫确认四个 V2 路由产生的 `/api/` 请求为 0。

## 静态数据与本地联动

- 唯一 typed fixtures 位于 `apps/web/src/features/v2/fixtures.ts`。
- 当前用户为张七巧；项目为深海蓝、星河银、极光白。
- `R26PrototypeStore` 只使用 `sessionStorage`，键名为 `R26PrototypeStore`。
- 上传交互只保存本地文件名，不读取文件内容，不上传文件。
- 提交后只在当前浏览器会话中联动：
  - 工作台当前任务显示已完成；
  - 第 06 步变为已完成；
  - 第 07、09、10 步显示已创建，其中第 10 步进入进行中；
  - 最近动态增加本地记录。
- UI 提供“重置本地原型”，不会写入数据库、对象存储或真实业务服务。

## 固定流程地图

- SVG 固定为 `viewBox="0 0 1440 1740"` 和 `preserveAspectRatio="xMidYMin meet"`。
- 18 个节点逐项使用 `R26_FLOW_MAP_SPEC.md` 冻结的坐标、尺寸、形状和固定路径。
- 状态覆盖 `COMPLETED`、`IN_PROGRESS`、`PENDING_REVIEW`、`OVERDUE`、`RETURNED`、`MONTHLY_TRACKING`、`EXIT_PENDING`、`NOT_STARTED`。
- 连线区分主线、并行、非阻塞和退回四类语义。
- 第 12 步为菱形，显示第 2 轮、退回原因、整改要求和只读历史。
- 第 17 步为 `3 / 12` 环形进度，显示逾期月份和下次评审日期。
- 第 18 步显示年产量、阈值、系统建议和人工决定边界。
- 自动化验证 18 节点无矩形重叠，全部固定连线路径为正交折线，没有长斜线。

## 响应式结果

- 1440：地图约占 70%，详情约占 30%。
- 1024：地图为主，详情为右侧 overlay drawer。
- 390：页面无横向溢出，主导航变为底部导航；地图保留内部缩放/平移，工序详情使用全屏 sheet。
- 所有核心页面已生成 1440×900、1024×900、390×844 视口截图。

## 自动化结果

`apps/web/e2e/r26-gate1-static-v2.spec.ts` 共 7 个串行场景，覆盖：

- Feature Flag 关闭/开启；
- 四页访问、V1 隔离和 `/api/` 请求为 0；
- 工作台主动作、项目筛选和项目卡跳转；
- 使用独立冻结基准核对 18 节点代码、名称、坐标、尺寸、形状和全部固定路径，并检查重叠与斜线；
- 第 12、17、18 步专项；
- 节点点击、`taskId`/`nodeCode` URL 恢复和关闭详情不重置地图比例；
- 进展三步、阻塞字段、本地材料文件名和跨页状态联动；
- 三种视口无页面级横向溢出；
- console error 0、page error 0；
- 三段本地交互录像。

最终命令与结果：

```text
pnpm install --frozen-lockfile                                                    PASS
pnpm --filter @feishu-timeline/web lint                                          PASS
pnpm --filter @feishu-timeline/web typecheck                                     PASS
pnpm --filter @feishu-timeline/web test                                          PASS（28 files / 84 tests）
pnpm --filter @feishu-timeline/web build                                         PASS
NEXT_PUBLIC_R26_V2_PROTOTYPE=true ... playwright ... r26-gate1-static-v2.spec.ts PASS（7/7）
pnpm lint                                                                         PASS
pnpm typecheck                                                                    PASS
git diff --check                                                                  PASS
```

其中 Playwright 使用本机 Google Chrome 可执行文件；Feature Flag 关闭态由独立的本地 3101 端口和独立 Next 构建目录验证。没有启动 API 服务。

## 视觉证据

- 截图索引：`docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- 人工复核表：`docs/product/R26_GATE1_HUMAN_REVIEW.md`
- 本机证据根目录：`/Users/lixiaochen/Downloads/feishu_timeline_app/test-results/r26-gate1/`

证据目录受 `.gitignore` 管理，不提交视频、临时浏览器文件或大型截图二进制。

## 可观察差异

以下只是差异记录，不是 Codex 自评分：

1. P1 页面稿偏向单页构图；Web 原型加入了冻结的五项产品导航和本地原型标识，用于验证真实产品壳层级。
2. P2 流程地图参考页是横向总览；Web 必须服从冻结的 1440×1740 SVG 拓扑，因此桌面首屏展示当前节点附近内容，完整拓扑通过纵向页面和地图缩放查看。
3. 1024 overlay drawer、390 全屏 sheet 和移动端底部导航是响应式推导，PPT 没有逐状态展示。
4. 搜索、通知、帮助和个人中心目前仅有静态反馈；“我的任务”“复盘分析”保持 `aria-disabled=true` 并提示 Gate 2 后接入。
5. 项目创建、评审通过/退回、文件上传和进展提交均为本地视觉交互，没有真实业务写入。
6. Fixture 使用相对业务时间文案，不代表生产数据。

上述差异和全部体验项仍需产品负责人通过截图和录像人工确认。

## 未执行

```text
真实 API 联调      NOT RUN
后端/数据库修改    NOT RUN
V1 迁移           NOT RUN
staging deploy    NOT RUN
production deploy NOT RUN
main merge        NOT RUN
tag               NOT RUN
Gate 2            NOT STARTED
```
