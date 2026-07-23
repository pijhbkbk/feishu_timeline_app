# R26 V2 产品 UI 生产发布记录

## 发布决定

```text
R26_GATE1_STATIC_V2_DEPLOYED / PRODUCT_OWNER_ACCEPTED_AS_IS / GATE2_NOT_STARTED
```

2026-07-23，产品负责人回复“先就这样，部署提交合并代码”，明确授权将
Gate 1 静态 V2 原型提交、合并 `main` 并部署生产。本次发布不代表进入
Gate 2，不接真实业务 API，也未创建稳定 tag。

## 提交与生产基线

- Gate 1 修复提交：`b5f737ec163021608e9643ea83c62b92ecacbfe2`
- 生产预取修复提交：`619f879`（禁用未开放导航的 Next.js 自动预取）
- 发布分支：`main`
- 生产实例：`instance-20260408-091840`
- 正式域名：`https://timeline.all-too-well.com`
- V2 开关：`NEXT_PUBLIC_R26_V2_PROTOTYPE=true`
- 数据库迁移：18 项，0 项待执行

第一次生产浏览器复验发现未开放的 `/v2/tasks` 和
`/v2/retrospectives` 被导航自动预取并产生 404。修复后重新执行 Web
lint、类型检查、84 项测试、生产构建、部署和全部正式验收；最终浏览器
证据中 console error、page error、4xx 资源和 `/api/` 请求均为 0。

## 发布前回滚点

### PostgreSQL

- 备份目录：`/var/backups/feishu-timeline-db/20260723T080006Z`
- 备份文件：`feishu-timeline.dump`
- 大小：216278 bytes
- 权限：`600`
- SHA-256：校验通过
- `pg_restore --list`：通过
- 隔离恢复演练：通过
- 恢复核对：41/41 表、12/12 用户、1/1 项目、22/22 审计日志

### 配置

- 快照目录：`/var/backups/feishu-timeline-release/20260723T080121Z`
- 文件：8 个配置文件及 `SHA256SUMS`
- 权限：全部 `600`
- SHA-256：校验通过

发布记录没有保存或输出 App Secret、数据库密码、OAuth code、Cookie、
token 或浏览器 storageState。

## 自动化与运行时验收

```text
pnpm --filter @feishu-timeline/web lint                         PASS
pnpm --filter @feishu-timeline/web typecheck                    PASS
pnpm --filter @feishu-timeline/web test                         PASS（84）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true pnpm --filter web build       PASS
Prisma migrate deploy                                           PASS（18 / 0 pending）
nginx -t                                                        PASS
PostgreSQL ready / Redis PONG                                   PASS
API / Web / nginx / PostgreSQL / Redis                          active
/api/health                                                     200 status=ok
匿名 /api/projects                                               401
飞书认证                                                        enabled
```

正式入口、DNS、HTTP→HTTPS、HSTS、证书、登录页、飞书登录 URL、API
健康检查和五个 systemd 服务全部通过发布脚本的生产验收。

## 生产 UI 证据

证据位于未纳入 Git 的 `test-results/r26-production/`：

- `screenshots/`：18 张 1440×900、1024×900、390×844 正式域名截图；
- `videos/production-core-flow-1440.webm`；
- `videos/production-workspace-1024.webm`；
- `videos/production-mobile-flow-390.webm`。

### 1440

- 四个 V2 路由全部返回 200；
- 完成风险筛选、进入风险项目、选择第 12 步、刷新恢复同一节点；
- 关闭抽屉后 URL 清理且地图上下文保留；
- 第 17 步显示 `3 / 12`，第 18 步明确人工决定；
- 完成一次三步静态进展提交和材料上传成功反馈。

### 1024

- 四个核心页面可用，无页面横向溢出；
- 固定流程图与 370px 抽屉并存；
- 第 12 步刷新恢复成功；
- console error、page error、4xx 资源均为 0。

### 390

- 当前任务和“提交工作进展”位于工作台第一屏；
- 项目工作区使用 18 节点移动总览，不缩小桌面 SVG；
- 工序详情为 `390 × 844` 固定全屏 sheet；
- 关闭后回到节点总览；
- 进展表单聚焦输入后仍可进入下一步；
- 无横向溢出。

全部生产页面均未出现 `DEMO-ACTIVE`、`DEMO-COMPLETE` 或
`demo-r26 · t006`。

## 最终边界

- 当前部署的是隔离的静态 V2 产品原型，状态仅保存在当前浏览器会话；
- V1 后端业务、数据库、安全修复与既有生产入口保持；
- Gate 2 真实数据联调未开始；
- 未创建 stable tag；
- 后续进入 Gate 2 必须再次获得人工授权。

## 2026-07-23 滚动与导航修复

- 修复流程地图首次以 100% 打开时吞掉页面纵向滚轮的问题；
- 根因是地图容器同时使用 `overflow:auto` 和
  `overscroll-behavior:contain`，导致不可纵向滚动的内层容器阻止滚动链；
- 地图容器现在只负责横向滚动，并明确把纵向滚动传递给页面；
- 新增“首次进入、不调整缩放、鼠标位于地图上”的纵向滚动回归断言；
- 主导航“项目管理”改为“项目列表”；
- 主导航“复盘分析”改为“系统管理”，禁用入口目标为 `/v2/admin`；
- 项目工作区返回文案和面包屑同步改为“项目列表”；
- Web lint、类型检查、84 项单元测试、生产构建和 R26 Playwright 7/7
  全部通过。
- 生产专项验证保持初始 100%，未点击缩放按钮；地图内滚轮 600px 后页面
  `scrollY` 从 0 增加到 600。
- 生产主导航显示“项目列表”和“系统管理”；系统管理目标为 `/v2/admin`
  且仍为禁用入口。
- 正式页面 4xx 资源、console error、page error 均为 0。
- 截图：
  `test-results/r26-production/screenshots/workspace-initial-scroll-fixed-1440.png`。
