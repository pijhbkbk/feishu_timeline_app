# EXECUTION_LEDGER.md

## R27 Gate 0～2 源码真相、扫描包与历史报告研判（2026-08-09）

- Authorization：产品负责人已提供 `R27_SOURCE_BASELINE_APPROVED=41b4b166c587692e6f0fb9536dca2e1aab646c70`、
  `R27_GATE0_SOURCE_COMPOSITION_APPROVED` 和 `PLACEHOLDER_DISPOSITIONS_APPROVED`。仍禁止部署
  production、合并 `main`、建 tag 或跨过人工闸门。
- Immutable identity：独立 worktree
  `/Users/lixiaochen/Downloads/feishu_timeline_app-r27-security`，分支
  `security/r27-final-source-clearance`；治理基线 `41b4b166c587692e6f0fb9536dca2e1aab646c70`；
  production runtime/source `535041bb25f21d548d863d07b35e3e952b0aeb2c`。两者差异仅五个
  `docs/**`，运行时代码差异为 0。
- Source truth：34 个远端分支对 runtime 的独有提交数为 0；V2、18 步、成员/分配、
  进展/材料、第 12/13/17/18 步、OAuth、后台、颜色库、权限/审计、26 个 migration、
  Docker/Nginx/systemd/部署脚本和 CI 均在同一谱系；不重新合并历史分支。
- Frozen fingerprints：pnpm-lock
  `897bec6a0bf51a3f004ca9c5261606d01f756f50388d926649143ce6a570d9ec`；API Dockerfile
  `17380e1e7de0255eae6ecb8f5ce56e8f3db12e9313378ff6affabac2a87cc7bf`；Web Dockerfile
  `56e435169b41e3d42171c6fd568084f4d29ff4a823322472b8dac32980c10148`。R26 Gate 3D staging runtime
  commit 在历史报告中未记录，准确值为 `UNKNOWN_NOT_RECORDED`。
- Placeholder implementation：批准去向已在
  `359b3cb0c01d294d421cf173e0ef0e1d1c06ad5c` 实施；`/reviews`、`/settings`、`/colors`
  固定跳转，动态 `[section]` 占位兜底删除，20 个合法 section 保留。无开放重定向，
  权限边界未放宽；正式应用源码 Placeholder 红线命中 0，原始 `rg` 10 行均为
  测试负向断言/选择器。
- Placeholder validation：定向回归 `4/4`，Web `48 files / 197 tests`，API
  `70 files / 329 tests`；`pnpm install --frozen-lockfile`、lint、typecheck、Web/API build、
  Prisma validate 和 `git diff --check` 全部 PASS。本地 production HTTP 实测三个 `307`
  Location 精确匹配，非法 section 为 `404`。未执行 staging/生产浏览器验收，不将本地
  HTTP 冒充为产品证据。
- Gate 1：打包器与 PDF 解析器提交为
  `27a0338ac0c59217d121fa6defe0feeec45ca252`。正式第一方包
  `company-source-scan-27a0338ac0c5.tar.gz`，`887239` bytes，SHA-256
  `83aff4f1474819ba370088418f018ddf1de29238d9745bf4139580f09864d940`；627 文件、3 个脱敏
  env 示例排除、禁止路径 0。连续两次 tar 与 5 个 sidecar 逐字节一致，contents 和
  per-file SHA-256 均 `627/627` PASS。
- Package boundary：只从 Git commit 的第一方白名单取文件，强制包含项目审计日志路由、
  Auth、Session、Cookie guard 和 Feishu OAuth；排除依赖、生成物、报告、备份、env、认证
  artifact、DB dump 和未脱敏日志。未编辑 `node_modules` 或 `.next`。
- Gate 2：历史 6609 页 PDF 的 156 项已生成每项 15 字段记录，ID 唯一、证据非空。
  规则统计为 weak hash `80`、setTimeout `38`、eval `22`、setInterval `14`、load `2`；
  ownership 为 FIRST_PARTY `0`、THIRD_PARTY `134`、GENERATED_ARTIFACT `22`；处置为
  FALSE_POSITIVE `55`、NOT_IN_PRODUCTION `88`、NEEDS_SECURITY_REVIEW `13`，未研判 `0`。
  未批量标记误报，13 项保持开放。
- Gate 2 evidence：JSON SHA-256
  `3c217ddc8347ca0cfcc8baf6e9a941e091d40f8105a83257b3675f0c1cda2656`；Markdown SHA-256
  `89224e4d0e3f38374b3c7d65035ed861db773722de96ed63a94ad572ba410cb5`；parser SHA-256
  `76ad46f80114089c36d217e21a8d46abe502984c20631feac1964b2533c57b57`。重生逐字节一致，
  schema/156 ledger rows/15 字段/规则统计验证、代表页视觉抽查、gitleaks 与敏感模式检查均 PASS。
- Evidence files：`docs/security/R27_SOURCE_OF_TRUTH_AUDIT.md`、
  `docs/security/R27_SOURCE_SCAN_MANIFEST.md`、`docs/security/R27_COMPANY_SAST_TRIAGE.md`、
  `reports/security/r27/company-sast-findings.json`、`docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md` 和
  `docs/rounds/R27.md`。JSON 使用精确强制路径纳入版本控制；tar/sidecar 保留在被忽略的本地交付区。
- Boundary：正式当前基线第一方 SAST、SCA、Secrets、SBOM、许可证、镜像扫描、R26 业务
  安全回归和 staging DAST 均未开始。不能宣称 Critical/High/Medium 为 0；当前第一方
  security clearance 尚未建立。production、`main` 和 tag 均未改变，四个设计草图仍仅存于原仓库。
- Decision：`R27_GATE1_SOURCE_PACKAGE_COMPLETE / R27_GATE2_156_FINDING_TRIAGE_COMPLETE /
  UNTRIAGED_HISTORICAL_FINDINGS=0 / OPEN_NEEDS_SECURITY_REVIEW=13 /
  AWAITING_TRIAGE_AND_FIX_LIST_CONFIRMATION / FORMAL_FIRST_PARTY_SAST_NOT_STARTED /
  CURRENT_FIRST_PARTY_SECURITY_CLEARANCE=NOT_ESTABLISHED / PRODUCTION_UNCHANGED / STOP`。

## R26 累积产品与后台更新生产发布（2026-08-09）

- Authorization：产品负责人要求将当前全部代码更新同步到 GitHub、合并 `main`，并发布到
  `https://timeline.all-too-well.com`。
- Runtime code：`535041bb25f21d548d863d07b35e3e952b0aeb2c`，提交信息
  `feat(r26): release accumulated product and admin updates`；发布时本地 HEAD、GitHub
  `origin/main`、生产 server HEAD、API runtimeCommit 与 Web runtimeCommit 五方一致。
- Git：119 个本轮源码、测试与证据文件通过显式路径暂存并提交；四个私有根目录附件未暂存、未提交。
  运行代码提交已推送到 `main`；未创建或移动 tag。
- Local gate：`pnpm install --frozen-lockfile`、lint、typecheck、Web `193` tests、API `329`
  tests、Web/API build、Prisma validate、`git diff --check`、Placeholder 扫描与
  `pnpm security:secrets` 全部通过。
- Backup：生产 PostgreSQL 发布前备份位于
  `/var/backups/feishu-timeline-db/20260809T064545Z/feishu-timeline.dump`，SHA-256
  `622d5457603d620d11fc25a89c9513bb8b266345673224637f1d490f4468ed0b`；隔离恢复并核对
  46 张表与 users `12/12`、projects `1/1`、audit_logs `49/49` 后清理隔离 schema。
- Migration：生产应用 3 个新增 migration；远端共 26 个 migration，Prisma 返回
  `Database schema is up to date!`。
- Production：GCE `instance-20260408-091840`（`axial-acrobat-492709-r7/us-west1-b`），
  systemd 源码部署；Web/API 分别由 Nginx 转发到 `127.0.0.1:3000` 和 `127.0.0.1:3001`。
  API、Web、Nginx 分别在 `06:52:00`、`06:52:05`、`06:52:18 UTC` 进入 active。
- Metadata：`buildTime=2026-08-09T06:49:11Z`，`release=r26-admin-535041bb25f2`；
  `/api/health` 与 `/build-info` 在精确生产域名均返回 HTTP 200 和同一完整 commit。
- Browser：真实浏览器打开精确生产域名后进入中国区飞书 OAuth；回调地址正确。内置验收浏览器当前
  处于无应用权限的 `测试企业 - 20250216`，切换团队后进入正式二维码登录页，未取得正式团队的已认证
  业务会话，因此公共认证入口通过，受保护生产业务路由保持人工复核待办。
- Staging：未建立或部署独立 staging；不得以本机历史截图代替 staging 或生产验收。
- Placeholder：原始扫描 22 行；本轮更新的正式路由命中 0；历史正式 Placeholder 路由组仍为 4 个：
  `/reviews`、`/settings`、`/colors`、`/projects/:projectId/:section`。
- Evidence：`docs/product/R26_PRODUCTION_RELEASE_20260809.md`、
  `docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md`。运行代码提交与发布后证据文档提交分开记录；证据提交
  不重新部署生产。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / MAIN_MERGED / PRODUCTION_DEPLOYED /
  PRODUCTION_BUSINESS_PATH_AWAITING_AUTHENTICATED_RECHECK /
  AWAITING_PRODUCT_OWNER_CONFIRMATION / TAG_UNCHANGED`。

## R26 共享页头动作与材料页英文标签清理（2026-08-08）

- Authorization：按产品负责人截图要求，移除所有正式页面共享页头右上角的搜索、通知和帮助图标及其
  前端功能，并清除材料上传页无业务意义的 `Required`、`Upload`、`History` 英文标签；保留主导航、
  账号菜单和项目页面自身真实搜索能力。
- Reproduction：在原失败 URL
  `http://localhost:8080/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r` 复现三项全局动作图标、
  通知角标以及材料卡片英文 overline；共享 `AppShell` 与 `V2Shell` 导致多个正式路由同时出现。
- UI：从两套共享外壳删除搜索、通知、帮助入口；删除专用通知客户端与前端通知组件；清理已失效的图标
  导出及通知样式；材料页仅保留中文业务标题。本轮没有删除 `/projects` 内真实关键字搜索表单与过滤逻辑。
- Regression：新增/更新共享外壳与材料组件契约，锁定全局动作不回归、账号菜单仍存在、项目内搜索仍存在，
  并锁定 `Required`、`Upload`、`History` 不再渲染。
- Validation：`pnpm install`、lint、typecheck、完整 test、Web/API build、Prisma validate 与
  `git diff --check` 全部通过；Web `47 files / 193 tests`，API `70 files / 329 tests`。首次并行全量测试
  因 Prisma client 生成时序出现一次模块读取失败，随后 API 定向全量与串行完整 `pnpm test` 均通过，
  未通过删除断言或跳过用例规避。
- Browser：本机 Docker staging 在原失败 URL 1280×720 真实重载；共享页头 aria-label 仅保留首页、
  主导航和账号菜单，三项全局动作节点与三项英文标签均为 0，console/page error 为 0。随后访问
  `/projects` 与 `/v2/dashboard`，确认两套外壳均已清理且账号菜单仍可操作。本轮未取得受控 1024/390
  浏览器视口证据，不沿用或冒充上一轮响应式证据。
- Environment：`http://localhost:8080`；Web image
  `feishu-timeline-web:local-header-cleanup-20260808`，image identity
  `sha256:44ae792099411eb6e56ff0073e361d96b4f973529a7e4e94e61082dbf29e035c`；API、数据库、
  Redis 和 Nginx 未重建。当前镜像来自脏工作树，准确记录为 `runtimeCommit=unknown`；源码基线 HEAD
  仍为 `2081c3920bb5c41578ef9c189477d05f392896ad`，不得将其冒充本机镜像 runtime commit。
- Placeholder：本轮目标路由命中 0；历史正式 Placeholder 路由组仍有 4 个：`/reviews`、`/settings`、
  `/colors`、`/projects/:projectId/:section`，不在本轮范围。
- Scope：未提交、未推送、未部署 production，`main` 指针和 tag 均未改变；产品负责人尚未确认。
- Evidence：`docs/product/R26_HEADER_ACTION_CLEANUP_20260808.md`、
  `docs/product/evidence/R26_HEADER_ACTION_CLEANUP_20260808/after-materials-upload-1280.jpg`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_RUNTIME_UPDATED / NOT_DEPLOYED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / TAG_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 共享顶部导航响应式收敛（2026-08-07）

- Authorization：按产品负责人要求，修复材料上传页在窄屏把主导航移动到底部的问题，并审计所有复用
  `AppShell` / `V2Shell` 的正式路由；本轮只修改共享导航、回归测试和证据，不修改业务数据或后端状态机。
- Reproduction：在原失败 URL
  `http://localhost:8080/materials/upload?taskId=cmrlmnwos00pcn401kt7obo1r`、390×844 视口稳定复现：
  顶部主导航被隐藏，页面底部出现第二套固定导航。
- Root cause：两套共享外壳都保留了旧的“窄屏隐藏顶部导航、改用固定底部导航”实现；此前只修过局部页面，
  所以材料、任务和部分旧外壳路由仍会复发。
- UI：两套外壳统一只渲染页头主导航；窄屏页头改成品牌/账号工具与四项主导航两行布局；主导航等宽、
  可横向滚动兜底且不造成整页横向溢出；同步移除旧底栏占位，并调整粘性步骤条、项目页签、工作区跳转
  和提示条位置，避免新页头高度造成遮挡。
- State：`/materials/upload`、`/progress` 及其 V2 规范化路由统一映射到“我的任务”，避免位置修复后当前项仍错误。
- Browser：本机 Docker staging 的 6 个正式路由 × 1440/1024/390 共 18 组全部通过；每组均有四项顶部导航、
  正确当前态、旧底部导航节点 0、页面级横向溢出 0。原失败页面在 390px 依次点击四个入口 4/4 正确，
  滚动到 `scrollY=1031` 后导航仍位于页头。浏览器控制接口不提供 DevTools Console 流，因此只记录
  “可观察 page error 0”，不伪报 console error 0。
- Validation：共享外壳定向门禁 `3 files / 31 tests`；完整 Web lint、typecheck、`48 files / 194 tests`
  和 Next.js 15.5.21 production build（33 个静态页面）全部通过。
- Environment：`http://localhost:8080`；Web image `feishu-timeline-web:local-top-nav-only-20260807b`，
  identity `sha256:c8c3c2ebd0de2f777c2fb5e2a0fd1520a925cb283dd7fb7ee6266831715cc63d`，创建时间
  `2026-08-07T14:06:28.358221136Z`；API、PostgreSQL、Redis 和 Nginx 未重建。当前脏工作树构建没有
  不可变 runtime commit，准确记录为 `runtimeCommit=unknown`。
- Placeholder：全仓原始扫描 22 行，本轮 6 个正式路由命中 0；历史 `PagePlaceholder` 正式路由 4 个，
  不在本轮范围。
- Scope：未提交、未推送、未部署 production，`main` 指针和 tag 均未改变；产品负责人尚未确认。
- Evidence：`docs/product/R26_RESPONSIVE_NAV_FIX_20260807.md`、
  `docs/product/evidence/R26_RESPONSIVE_NAV_FIX_20260807/`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_DOCKER_STAGING_VERIFIED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / TAG_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 角色权限表格文案与编辑按钮排版修复（2026-08-06）

- Authorization：按产品负责人要求，移除 `/admin/permissions` 角色名称下方的灰色角色编码与类型，
  并将最右侧“编辑”按钮固定为横排。
- UI：桌面权限矩阵和移动端角色卡均只显示角色名称；角色列固定最小宽度并禁止中文逐字竖排；
  操作列固定宽度，“编辑”按钮使用 `horizontal-tb / nowrap / keep-all`，尺寸为 64×36px。
- Regression：更新 `admin-control-center.contract.test.ts`，锁定灰色 `<small>` 不回归、操作列类名、
  编辑按钮横排样式和角色名称不换行规则；定向测试 `17/17` 通过。
- Validation：本轮完整门禁 `pnpm install --frozen-lockfile`、lint、typecheck、test、Web/API build、
  Prisma validate 与 `git diff --check` 均通过；最终角色列宽度补丁后再次执行定向测试与 Web build，均通过。
- Browser：最终补丁前已在 `http://localhost:8080/admin/permissions` 的已登录真实数据页确认 9 行角色、
  角色灰字数量 `0`，所有“编辑”按钮计算样式均为横排且尺寸 64×36px；最终补丁仅增加角色名称
  `nowrap / keep-all`。重建本机 Web 容器后原登录态失效，最终构建的再次签入复测未执行，未据此冒充
  产品验收通过。
- Environment：`http://localhost:8080/admin/permissions`，本机 Docker staging；Web image
  `feishu-timeline-web:local-permission-table-cleanup-20260806`，digest
  `sha256:f9a99cd626df12529ba5b455799f373628bda8ba7bcf1cd6d84f40ce5a425573`；
  `runtimeCommit=unknown / release=development`，不作为 production 运行版本证明。
- Scope：未修改 API、数据库、权限裁决或业务数据；未提交、未推送、未部署 production，
  `main` 指针与 tag 均未改变。
- Placeholder：全量原始扫描 `22` 行，目标正式组件命中 `0`。
- Decision：`CODE_IMPLEMENTED / LOCAL_AUTOMATION_VERIFIED / LOCAL_DOCKER_STAGING_BUILT /
  FINAL_SIGNED_IN_BROWSER_RECHECK_PENDING / PRODUCTION_UNCHANGED / MAIN_UNCHANGED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 分工配置表灰色辅助文字清理（2026-08-05）

- Authorization：按产品负责人要求，清除 `/admin/assignments` 表格内全部灰色小字，保持页面整洁。
- UI：删除节点编码、字段类型、编辑提示、协同部门、匹配原因、分配说明、版本与字段说明；保留
  步骤、工序、部门、负责人、协同/评审、匹配状态、分配来源和编辑动作。
- Status copy：将英文 `SUGGESTED` 统一显示为中文“建议匹配”，并使用既有蓝色建议状态语义。
- Browser：本机真实数据页返回 18 行；表格 `small=0`、字段说明区块 `0`、灰色辅助文案 `0`、
  英文状态 `0`；项目切换和编辑面板打开/关闭正常，本轮未提交写操作。
- Regression：更新前端契约，锁定辅助文字不回归，同时保留编辑分工、变更原因、预览和更新接口。
- Validation：`pnpm install --frozen-lockfile`、lint、typecheck、Web/API build、Prisma validate
  与 `git diff --check` 通过；Web `45 files / 178 tests`。API 首次全量运行发生一次 Vitest worker
  模块读取超时；失败用例 `3/3` 单独复跑通过，随后全量 `69 files / 318 tests` 通过。
- Environment：`http://localhost:8080/admin/assignments`，本机 Docker staging；Web image
  `feishu-timeline-web:local-assignment-table-clean-20260805`，digest
  `sha256:db26b50adef18bafd591686cccb008e9ba3acc026937bc4b7f4dab77c9bb6a0d`；
  `runtimeCommit=unknown / release=development`，不作为 production 运行版本证明。
- Scope：未修改 API、数据库、权限、工作流或分工数据；未提交、未推送、未部署 production，
  `main` 指针与 tag 均未改变。
- Placeholder：全量原始扫描 `22` 行，目标正式组件命中 `0`。
- Evidence：`docs/product/R26_ASSIGNMENT_TABLE_CLEANUP_20260805.md` 与
  `docs/product/evidence/R26_ASSIGNMENT_TABLE_CLEANUP_20260805/assignment-table-clean.png`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_DOCKER_STAGING_VERIFIED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 抽屉关闭按钮视觉居中修复（2026-08-05）

- Authorization：按产品负责人截图要求，将公司部门编辑抽屉右上角叉号放在按钮正中心，
  并检查修复所有同类图标型关闭按钮。
- Root cause：原管理抽屉使用原生文字字形 `×`，浏览器默认按钮内边距与字体行盒导致
  44×44 按钮内字形中心向下偏移 1px。
- UI：管理编辑抽屉和审计详情抽屉统一改用 `CloseIcon` SVG；后台与项目工作区图标型关闭
  按钮统一双向居中、零内边距、零行高和固定 SVG 宽高。
- Browser：本机真实数据页 `/admin/organization` 和 `/admin/audit-logs` 已分别打开抽屉；
  44×44/20×20 与 38×38/18×18 两组按钮/图标中心偏差均为 `0px / 0px`，console
  warning/error 为 `0`；组织抽屉真实点击关闭后 dialog 数量由 `1` 变为 `0`，再次打开正常。
- Regression：更新组件契约与审计详情渲染测试，禁止原生 `×` 回归，并锁定管理、审计与
  R26 工作区关闭按钮的居中样式。定向测试 `19/19` 通过；全仓 `pnpm install
  --frozen-lockfile`、lint、typecheck、test、Web/API build、Prisma validate 与
  `git diff --check` 全部通过，Web `45 files / 178 tests`、API `69 files / 318 tests`。
- Environment：`http://localhost:8080`，本机 Docker staging、本机 PostgreSQL；Web
  image `feishu-timeline-web:local-close-button-center-20260805`，digest
  `sha256:b6d491f89209593ea2ec57b3c0d3ad76af48bc932f6efe6c9b43bfe62b0b01d3`；
  `runtimeCommit=unknown / release=development`，不作为 production 运行版本证明。
- Placeholder：全量原始扫描 `22` 行，本轮两个正式路由组件未新增 Placeholder。
- Scope：未修改 API、数据库、权限、工作流或业务数据；未提交、未推送、未部署 production，
  `main` 指针与 tag 均未改变。
- Evidence：`docs/product/R26_CLOSE_BUTTON_ALIGNMENT_20260805.md` 与
  `docs/product/evidence/R26_CLOSE_BUTTON_ALIGNMENT_20260805/`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_DOCKER_STAGING_VERIFIED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 后台表格双向居中修复（2026-08-05）

- Authorization：按产品负责人要求，后台正式表格的表头和正文统一水平、竖直居中，并修复
  `/admin/organization` 中“启用”状态与“编辑部门”按钮间距不足。
- UI：统一 `.admin-cc-table`、`.data-table` 及成员、材料、分工等 Grid 表格的双向居中规则；
  公司部门操作区使用 `14px` 间距，权限矩阵角色列也与其表头居中对齐。
- Browser：在本机真实数据页逐页复核 `/admin/projects`、`/admin/tasks`、
  `/admin/organization`、`/admin/assignments`、`/admin/permissions` 和
  `/admin/audit-logs`；六页所有抽样表头/单元格计算样式均为 `center / middle`，公司部门
  操作区计算间距为 `14px`，未出现可见数据错误页。
- Regression：新增 CSS 合同测试，锁定表头、单元格双向居中与操作区间距；定向测试
  `15/15` 通过。全仓 `pnpm install`、lint、typecheck、test、Web/API build、Prisma validate 与
  `git diff --check` 全部通过；Web `45 files / 177 tests`，API `68 files / 315 tests`。
- Environment：`http://localhost:8080`，本机 Docker staging、本机 PostgreSQL；Web 镜像
  `feishu-timeline-web:local-table-alignment-20260805`，manifest digest
  `sha256:3bbf105d27915a9630189d3a82bb8902e6f378c5fdd3f136d8ec80cbf392f6ed`。
  镜像包含未提交工作树变更，不冒充不可变 runtime commit。
- Runtime：Web、API、Nginx、PostgreSQL 与 Redis 容器均 healthy；Web/API metadata 均为
  `runtimeCommit=unknown / release=development`。Placeholder 全量扫描 `22` 行，本轮六个后台
  路由命中 `0`。
- Scope：未修改 API、数据库、权限、工作流或业务数据；未提交、未推送、未部署 production，
  `main` 指针与 tag 均未改变。
- Evidence：`docs/product/R26_TABLE_ALIGNMENT_20260805.md` 与
  `docs/product/evidence/R26_TABLE_ALIGNMENT_20260805/`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / LOCAL_STAGING_VERIFIED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 项目总台账固定精简列（2026-08-05）

- Authorization：按产品负责人要求，`/admin/projects` 不再提供“显示完整列”或“使用精简列”功能，
  项目总台账固定使用精简列。
- UI：删除列模式切换按钮、`fullColumns` 状态及项目/工序表完整列渲染分支；项目表固定展示
  “项目、颜色 / 车型、当前工序、负责人 / 部门、风险、进度、计划结束、数据版本、操作”九列。
- Regression：更新前端契约，明确禁止 `显示完整列`、`使用精简列` 和 `fullColumns` 回归；定向
  契约测试 `14/14` 通过。全仓 `pnpm install --frozen-lockfile`、lint、typecheck、test、Web/API
  build、Prisma validate 与 `git diff --check` 全部通过；Web `45 files / 176 tests`，API
  `68 files / 315 tests`。
- Browser：在已登录的本机真实数据页 `http://localhost:8080/admin/projects` 验证切换按钮命中数为
  `0`、表头为固定九列；实际搜索 `R26-G3A-UAT-成员分工` 命中项目，刷新后仍保持精简列，
  console/page error 为 `0`。
- Environment：本机 Docker staging、本机 PostgreSQL；Web 镜像
  `feishu-timeline-web:local-project-ledger-compact-20260805`，健康端点返回
  `runtimeCommit=unknown / release=development`，不得作为 production 运行版本证明。
- Scope：未修改 API、数据库、权限、工作流或项目业务数据；未提交、未推送、未部署 production，
  `main` 指针与 tag 均未改变。
- Placeholder：全量原始扫描命中 `22` 行，目标 `/admin/projects` 组件与路由命中 `0`；历史命中
  不属于本轮变更，未通过删除测试或隐藏文案规避门禁。
- Evidence：`docs/product/R26_PROJECT_LEDGER_COMPACT_COLUMNS_20260805.md` 与
  `docs/product/evidence/R26_PROJECT_LEDGER_COMPACT_COLUMNS_20260805/local-admin-projects-compact.png`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_UNCHANGED / MAIN_UNCHANGED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 飞书 OAuth 多标签 state 竞态修复（2026-08-05）

- Failure environment：本机 Docker staging，失败 URL 为
  `http://localhost:8080/login/callback`；页面提示“飞书登录状态与当前浏览器不匹配”。用户原始
  失败截图为 `/Users/lixiaochen/Desktop/截屏2026-08-05 上午8.42.59.png`。
- Root cause：同一浏览器中的多个未登录业务标签会在几乎同一时刻分别请求
  `/api/auth/feishu/start`。旧实现把所有登录尝试写入同一个 HttpOnly state Cookie，后一次请求
  覆盖前一次；飞书回调携带较早 state 时，服务端按安全规则拒绝。
- Fix：每个 OAuth state 使用由 state 的 SHA-256 摘要派生的独立 Cookie 名称；回调仅读取并
  清理当前 state 对应 Cookie。服务端 10 分钟 TTL、一次性消费、浏览器绑定和防重放校验保持
  不变，未放宽 OAuth 安全边界。
- Regression：新增 Service 与 Controller 回归，覆盖两个重叠登录尝试各自保留 Cookie 并分别
  完成回调；定向 auth 测试 `18/18`、API lint 与 typecheck 均通过。真实 HTTP 连续发起两次
  登录后 Cookie jar 同时保留 `2` 个不同的 state Cookie。
- Full validation：`pnpm install --frozen-lockfile`、全仓 lint、typecheck、test、Web/API build、
  Prisma validate 与 `git diff --check` 全部通过；Web `45 files / 176 tests`，API
  `68 files / 315 tests`。Placeholder 原始扫描 `22` 行，其中正式路由仍有 `4` 个历史
  `PagePlaceholder` 文件，本轮登录和项目路由命中数为 `0`。
- Browser：从新的 `/login` 入口重新发起登录，选择已关联的“测试企业 - 20250216”并授权；
  回调成功建立“李晓晨”会话并自动进入 `http://localhost:8080/projects`，真实项目数据可见，
  console/page error 为 `0`。成功截图：
  `docs/product/evidence/R26_LOGIN_STATE_FIX_20260805/login-success-local.png`。
- Environment：`http://localhost:8080`，本机 Docker PostgreSQL；API 镜像
  `feishu-timeline-api:local-oauth-concurrent-state-20260805`、Web 镜像
  `feishu-timeline-web:local-department-delete-20260803`；健康端点返回
  `runtimeCommit=unknown / release=development`，不得作为 production 运行版本证据。
- Scope：本轮仅修改 OAuth state Cookie 的并发隔离及回归测试；未修改数据库模型、项目业务
  数据、权限规则、工作流、production、`main` 指针或 tag。
- Evidence：`docs/product/R26_FEISHU_OAUTH_MULTITAB_STATE_FIX_20260805.md`。
- Decision：`CODE_IMPLEMENTED / LOCAL_REAL_OAUTH_VERIFIED / MULTITAB_STATE_ISOLATED /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 公司部门保存视图移除与受控删除（2026-08-03）

- Authorization：按产品负责人最新截图要求，彻底移除后台控制中心中的“保存视图”选择器与
  “保存当前视图”按钮，并在 `/admin/organization` 的“公司部门”页签增加勾选和删除能力。
- UI：桌面表格新增当前页全选与逐行选择；移动卡片新增“选择此部门”；选中后显示明确的
  已选数量、取消选择和“删除所选部门”，删除确认面板列出部门名称并要求填写变更原因。
- Backend authority：新增 `POST /api/admin/organization/departments/batch-delete` 薄命令接口；
  仅超级管理员可用，必须携带每个部门的 `departmentVersion`、`Idempotency-Key`、原因和
  `acknowledgedConsequences`，全部裁决在服务端事务中完成。
- Delete guards：根部门，以及仍关联人员、下级部门、项目、工序、节点分工或标准板发放记录的
  部门均拒绝删除；批量请求任一项不满足时整批回滚。成功删除逐部门写入
  `ADMIN_DEPARTMENT_DELETED` 审计记录。
- Real local API：临时认证会话只用于本机回归，测试后已清除；根部门删除返回
  `409 / DEPARTMENT_DELETE_BLOCKED / 组织根部门不能删除`；一次性空部门成功删除后数据库
  剩余 `0`、审计记录 `1`；相同幂等键重放返回 `idempotentReplay=true`；普通用户负向调用
  返回 `403`。一次性测试部门均已删除，未改变真实组织数据。
- Bundle check：本地 Web 新构建中“保存视图/保存当前视图”文件命中数为 `0`；删除入口、全选
  与确认文案已进入构建产物。
- Browser：本地服务恢复后，既有内置浏览器标签仍停留在 Chrome `ERR_CONNECTION_REFUSED`
  数据错误页；浏览器安全策略禁止从该受限页重新导航到 localhost。本轮未绕过安全策略，需在
  新开的本地标签页完成最终视觉确认。
- Environment：`http://localhost:8080`，数据库为本机 Docker PostgreSQL；Web/API 镜像 tag
  `local-department-delete-20260803`；API/Web/nginx/PostgreSQL/Redis 均 healthy；本地构建元数据
  为 `runtimeCommit=unknown / release=development`，不作为生产部署证据。
- Scope：production、staging 公网、`main`、tag 均未改变；未部署 `timeline.all-too-well.com`。
- Evidence：`docs/product/R26_DEPARTMENT_DELETE_AND_VIEW_CLEANUP_20260803.md`。
- Decision：`CODE_IMPLEMENTED / LOCAL_API_VERIFIED / LOCAL_BROWSER_VISUAL_RECHECK_PENDING /
  PRODUCTION_UNCHANGED / MAIN_UNCHANGED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 公司部门界面收敛（2026-08-03）

- Authorization：按产品负责人生产截图要求，收敛 `/admin/organization` 的“公司部门”页签。
- Navigation：将“公司部门”移至“系统用户”左侧，“项目成员”保持第三项。
- Table：删除“编码”列及部门名称下方的层级编码；“上级部门”统一改为“所属事业部”，
  桌面表格与移动卡片均不再展示部门编码。
- Interaction：删除“所有变更先预览影响……”提示，并取消公司部门新增/编辑的前端影响预览步骤；
  保存按钮直接显示“确认保存”。
- Safety retained：取消的仅是前端预览步骤；部门写请求仍提交 `expectedVersion`、随机
  `Idempotency-Key`、`acknowledgedConsequences` 和变更原因，服务端权限、字段校验、事务与
  审计逻辑未修改。
- Cleanup：删除未再使用的 `previewAdminDepartmentConfiguration` Web 客户端封装，未删除
  后端兼容接口；服务端部门校验错误文案同步使用“所属事业部”，校验规则本身不变；未修改
  数据库、Prisma schema、migration、工作流状态或业务数据。
- Regression：新增公司部门专用契约，锁定页签顺序、表格列、旧提示/编码/预览调用不回归，
  并验证直接保存仍携带幂等与确认字段。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate、
  `git diff --check` 全部 PASS；Web 45 files / 175 tests，API 68 files / 312 tests。
- Browser：本机 Docker daemon 未运行，真实本地数据栈无法启动；未使用静态假数据或截图冒充
  浏览器验收。
- Scope：production、staging、`main`、tag 均未改变；生产仍运行
  `b02927d7cf63657f592b634859dfc025abe748db`，本轮改动尚未部署。
- Decision：`CODE_IMPLEMENTED / LOCAL_AUTOMATED_VERIFIED / BROWSER_NOT_RUN /
  PRODUCTION_UNCHANGED / AWAITING_DEPLOYMENT_AUTHORIZATION / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 工序总台账工具栏收敛（2026-08-03）

- Authorization：按产品负责人截图要求，`/admin/tasks` 工具栏只保留左侧搜索与“查询”。
- UI：删除右侧保存视图、完整列、导出、模板下载和计划日期导入控件；项目台账和组织人员页的
  独立保存视图能力不受影响。
- Cleanup：删除工序导入入口对应的前端文件读取、预览/确认弹窗分支和专用样式；未删除后端
  接口，未修改数据库、权限、工作流状态或业务数据。
- Regression：更新后台控制中心契约，锁定工序台账不再渲染全部六项右侧工具。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate 与
  `git diff --check` 全部 PASS；Web 45 files / 174 tests，API 68 files / 312 tests。
- Git：runtime commit `b02927d7cf63657f592b634859dfc025abe748db` 已推送 `origin/main`。
- Production：`https://timeline.all-too-well.com` 目标服务器已切换到同一 runtime commit；Web/API metadata、
  server HEAD、服务和 Nginx/数据库/Redis 检查通过，migration 跳过。
- Browser：公开 `/build-info` 已确认新版本；受保护的 `/admin/tasks` 在独立验收浏览器进入飞书
  账号选择页，未代替产品负责人重新授权登录，因此登录态内最终视觉复核仍待人工确认。
- Evidence：`docs/product/R26_TASK_LEDGER_TOOLBAR_SIMPLIFICATION_20260803.md` 及
  `docs/product/evidence/R26_TASK_LEDGER_TOOLBAR_20260803/01-production-build-info.jpg`。
- Decision：`CODE_IMPLEMENTED / LOCAL_VERIFIED / DEPLOYMENT_ATTEMPTED /
  DEPLOYMENT_UNVERIFIED / MAIN_MERGED /
  PRODUCTION_ROUTE_AUTHENTICATED_RECHECK_PENDING / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 角色名称与权限矩阵可编辑（2026-07-29）

- Authorization：按产品负责人要求，允许超级管理员在 `/admin/permissions` 修改角色显示名称，
  并逐项决定角色权限为“允许”或“禁止”；角色编码保持不可变。
- UI：桌面表格与 390px 移动卡片均提供明确的“编辑”入口；编辑面板包含角色名称、12 项
  权限开关、变更原因、取消与“保存角色权限”，保存成功后立即刷新服务端真实矩阵。
- Backend authority：新增受 `admin`、`system.manage` 与超级管理员身份共同保护的角色权限
  命令接口；前端只提交期望权限集合，所有权限合法性、版本、重名和身份裁决均由服务端完成。
- Safety：写入使用 `Idempotency-Key`、乐观锁、事务和审计日志；系统超级管理员身份继续作为
  独立安全兜底，不受可编辑角色矩阵影响；普通 `admin` 角色不再绕过实际权限守卫。
- Real browser：以 0 用户的 `auditor` 角色完成“审计人员 → 审计人员（验收）”及“管理材料
  禁止 → 允许”的真实保存，再恢复原名称与权限；页面即时反馈、刷新后数据一致。
- Database：恢复后 `auditor` 名称为“审计人员”，权限精确为 `project.read`、
  `dashboard.read`、`audit.read`；两次操作均产生 `ADMIN_ROLE_PERMISSIONS_CHANGED` 审计记录。
- Responsive：390×844 下矩阵自动切换为角色卡片，编辑面板单列展示全部权限和保存操作；
  桌面与移动端 console/page error 均为 0。
- Evidence：`docs/product/evidence/R26_ADMIN_PERMISSIONS/role-permission-edit-desktop.png`、
  `role-permission-editor-desktop.png`、`role-permission-edit-mobile-390.png`。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate、
  定向权限测试及 `git diff --check` 全部 PASS；Web 45 files / 172 tests，API 68 files /
  312 tests。
- Staging：本机独立 staging 运行代码提交 `9e08b8e`，服务健康且 migration 无待执行项；
  未部署 production，未修改 V1、`main` 或 tag。
- Decision：`ROLE_NAME_EDITABLE / PERMISSION_MATRIX_EDITABLE / SERVER_ENFORCED_RBAC /
  IDEMPOTENCY_VERSION_AUDIT_VERIFIED / ORIGINAL_AUDITOR_CONFIGURATION_RESTORED /
  LOCAL_STAGING_VERIFIED / PRODUCTION_UNCHANGED`。

## R26 项目成员与分工页签收敛（2026-07-29）

- Authorization：按产品负责人最新版截图要求，删除项目工作区“项目成员与分工”页签
  上方的成员卡片区，只保留下方的工序分配表格。
- UI：移除“真实项目组织”标题、成员数量、添加成员、成员详情卡片、部门摘要及卡片内
  修改职责/移出项目入口；页签直接展示“自动分配预览”与 18 工序表格。
- Behavior：保留表格中的服务端分配状态、负责人、协同/评审、转交任务，以及
  “查看并应用分配”能力；未修改 API、权限、项目成员数据或后端分配规则。
- Cleanup：删除不再可达的卡片渲染、三个成员卡片操作入口及对应专用样式，避免隐藏的
  旧界面继续累积。
- Regression：新增真实页面源码契约，禁止成员卡片区和相关入口回归，并锁定 18 工序
  自动分配表继续存在。
- Browser：在真实项目 `cmryawpo40001pa01qbz0aly5` 验证 1440、1024、390 三档；成员卡片
  和旧成员区命中数均为 0，表格 18 行，页面横向溢出为 0；“查看并应用分配”面板可正常
  打开与关闭，浏览器日志错误为 0。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate
  与 `git diff --check` 全部 PASS；Web 45 files / 171 tests，API 68 files / 310 tests。
- Scope：不修改 API、数据库、权限、工作流状态机、V1、production、`main` 或 tag。
- Decision：`MEMBER_CARDS_REMOVED / ASSIGNMENT_TABLE_PRESERVED /
  FULL_REGRESSION_PASSED / STAGING_VERIFIED / PRODUCTION_UNCHANGED`。

## R26 项目列表顶部信息收敛（2026-07-28）

- Authorization：按产品负责人最新版截图要求，收敛 `/projects` 项目列表顶部信息与操作顺序。
- UI：删除“实时项目组合 / 项目卡、风险和停滞原因由服务端业务规则统一计算。”整条提示；
  将“新建项目”主按钮移至内容区左上角；将项目总数移动到筛选行最左侧。
- Responsive：桌面端项目总数位于筛选按钮之前；移动端项目总数和筛选组均左对齐，筛选按钮
  继续支持横向滚动，页面不产生横向溢出。
- Regression：更新真实数据一致性契约，禁止已删除提示文案回归，并锁定新建按钮、项目总数
  与筛选器的结构顺序和左对齐规则。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate 与
  `git diff --check` 全部 PASS；Web 45 files / 170 tests，API 68 files / 310 tests。
- Scope：不修改 API、数据库、权限、项目数据、工作流状态机、V1、production、`main` 或 tag。
- Decision：`PROJECTS_INFO_BANNER_REMOVED / CREATE_ACTION_MOVED_LEFT /
  PROJECT_COUNT_PRECEDES_FILTERS / FULL_REGRESSION_PASSED / STAGING_VERIFICATION_IN_PROGRESS`。

## R26 详细管理入口去重与操作纵排（2026-07-28）

- Authorization：按产品负责人截图要求，删除与“工序总台账”结果重复的“流程与参数”
  管理组，并将同一卡片内横排的操作按钮统一改为纵排。
- Information architecture：`/admin/manage` 从 5 组收敛为 4 组；“审计与异常”自动由第 05
  组顺延为第 04 组；不再展示“查看运行工序”重复入口。
- Layout：桌面端和移动端均使用纵向操作区；双入口卡片中的“项目总台账 / 工序总台账”及
  “分工配置 / 角色权限”按单列排列，保留统一按钮宽度、间距和点击区域。
- Regression：更新组件契约和 Playwright 断言，锁定 4 组结构、重复入口消失及操作区
  `flex-direction: column`，防止后续回归。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate 与
  `git diff --check` 全部 PASS；Web 45 files / 170 tests，API 68 files / 310 tests。
- Scope：不修改 API、数据库、权限、工作流状态机、V1、production、`main` 或 tag。
- Decision：`DUPLICATE_WORKFLOW_GROUP_REMOVED / MANAGEMENT_ACTIONS_STACKED /
  FULL_REGRESSION_PASSED / STAGING_VERIFICATION_IN_PROGRESS`。

## R26 详细管理页面二次收敛（2026-07-28）

- Authorization：按产品负责人最新版截图要求，继续精简 `/admin/manage`，只保留一个返回
  操作与 5 组实际管理卡片。
- UI：顶部“返回系统概况”改为简洁的“返回”按钮；删除“进入管理”标题及说明；删除左侧
  “项目与工序、组织与成员、分工与权限、流程与参数、审计与异常”5 个页内导航按钮。
- Layout：管理卡片从原 220px 侧栏 + 内容栏改为单列全宽布局；桌面端保持卡片操作右对齐，
  移动端保持卡片和操作纵向排列，没有遗留空白侧栏或横向溢出。
- Regression：新增组件源码契约与 Playwright 断言，锁定页面只能出现一个“返回”入口，且
  不再渲染“进入管理”标题、说明或“管理模块”导航。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate、
  `git diff --check` 全部 PASS；Web 45 files / 170 tests，API 68 files / 310 tests。
- Scope：不修改 API、数据库、权限、工作流状态机、V1、production、`main` 或 tag。
- Decision：`ADMIN_MANAGE_HEADER_SIMPLIFIED / CATEGORY_NAV_REMOVED /
  FULL_WIDTH_MANAGEMENT_CARDS / PRODUCTION_UNCHANGED`。

## R26 系统管理首页简化与颜色数据库（2026-07-28）

- Authorization：按产品负责人要求，将 `/admin` 收敛为真实数据看板和两个主入口，并新增
  按颜色自动归档既有工序材料的颜色数据库。
- Scope：独立分支与 staging；不复制附件、不新增上传入口、不修改状态机、V1、production、
  `main` 或 tag。
- Information architecture：`/admin` 只保留项目总数、进行中项目、风险项目、启用人员、
  启用部门、已归档颜色 6 项指标，以及“进入管理”“颜色数据库”两个大入口；详细后台能力
  收进 `/admin/manage` 的 5 个业务域。
- Color database：新增列表与详情 API/页面，复用既有 Color、ColorVersion、Project、
  WorkflowTask、Attachment、User、Department 和 Supplier，按 1～18 步归并为 7 个生命周期
  阶段；附件只建立读取关系，替换链末端为当前版本，其余版本继续保留为历史版本。
- Security：概况与详细管理沿用服务端 admin + `system.manage` 守卫；颜色资料要求
  `project.read`，管理员看全部，普通成员仅返回本人负责、参与或所属部门有权访问的项目；
  匿名 401、越权详情 404；没有新增颜色写接口，没有删除原附件或审计记录。
- Responsive：1440 为 6 指标一行和双入口并排；1024 为 3×2 和双入口并排；390 为 2 指标
  一行、双入口纵向排列；三档均无横向溢出。
- Browser：四条路由、检索、筛选、空态、错误恢复与真实点击 PASS；console/page error=0；
  管理业务请求只有 GET；production 请求=0。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate 和
  定向 Playwright 全部 PASS；Web 45 files / 170 tests，API 68 files / 310 tests，
  Playwright 3/3 PASS。
- Evidence：`docs/product/R26_ADMIN_DASHBOARD_COLOR_DATABASE_REPORT.md`、人工验收清单及
  `docs/product/evidence/R26_ADMIN_DASHBOARD_COLOR_DATABASE/`。
- Decision：`R26_ADMIN_DASHBOARD_SIMPLIFIED / COLOR_DATABASE_IMPLEMENTED_ON_STAGING /
  EXISTING_MATERIALS_AUTOMATICALLY_ARCHIVED / PRODUCTION_UNCHANGED /
  AWAITING_PRODUCT_OWNER_CONFIRMATION / STOP`。

## R26 项目列表主操作强化（2026-07-28）

- Authorization：按产品负责人截图要求，将项目卡片的“打开项目”从最右侧弱链接移到卡片
  正文右上方，并改为显眼的大按钮。
- Scope：仅调整 V2 项目列表卡片结构、响应式样式与前端契约测试；不修改 API、数据库、
  权限或工作流状态机，不部署 production。
- UI：桌面端“打开项目”使用 168×54px 蓝底白字主按钮，带清晰阴影、悬停和键盘焦点
  状态；右侧栏只保留流程进度环。移动端按钮自动占满卡片宽度，进度环独立居中显示。
- Browser：在 `http://localhost:8080/projects` 使用真实数据验证；1280px 下按钮由原
  79×44px、x=1103 移到 168×54px、x=854，页面无横向溢出；点击后进入对应项目 URL，
  浏览器日志错误为 0。
- Regression：新增结构和 CSS 契约，确保主操作位于卡片正文、尺寸不退化，且 767px 以下
  保持 100% 宽度。
- Validation：`pnpm install --frozen-lockfile`、lint、typecheck、全量测试、Web/API build、
  Prisma validate 全部 PASS；Web 44 files / 166 tests，API 67 files / 307 tests。
- Staging：本机独立 staging 五服务健康，23 migrations / 0 pending；production 未触碰。
- Decision：`PROJECT_OPEN_ACTION_PROMOTED / REAL_CLICK_VERIFIED /
  RESPONSIVE_CONTRACT_PROTECTED / PRODUCTION_NOT_TOUCHED`。

## R26 系统管理总览标题精简（2026-07-27）

- Authorization：按产品负责人要求，删除系统管理总览左上角的“系统管理”“后台管理”及
  “组织、权限、流程参数和审计风险集中在一个管理员工作台。”三行说明。
- Scope：仅调整系统管理总览的 Web 结构与样式；保留“刷新数据”、统计卡片和全部管理入口；
  不修改 API、数据库、权限或工作流状态机，不部署 production。
- UI：移除原 `r22-page-hero`，将刷新操作收敛为独立右对齐工具栏，避免删除标题后遗留无效
  标题占位；工具栏与统计卡片间距为 32px，页面无横向溢出。
- Browser：在 `http://localhost:8080/admin` 真实刷新并点击“刷新数据”；三段指定文案在
  `admin-page` 中命中数均为 0，刷新按钮 1 个、统计卡片 4 张、管理入口 5 个，错误提示 0。
- Regression：补充组件契约断言，禁止“后台管理”标题和原说明文案回归。
- Validation：`pnpm install --frozen-lockfile`、lint、typecheck、全量测试、Web/API build、
  Prisma validate 全部 PASS；Web 44 files / 165 tests，API 67 files / 307 tests。
- Staging：本机独立 staging 五服务健康，23 migrations / 0 pending；production 未触碰。
- Decision：`ADMIN_OVERVIEW_COPY_REMOVED / REFRESH_AND_MANAGEMENT_ENTRY_PRESERVED /
  LOCAL_STAGING_VERIFIED / PRODUCTION_NOT_TOUCHED`。

## R26 组织与人员完整配置（2026-07-27）

- Authorization：按产品负责人要求，使超级管理员能够调整系统用户、公司部门和项目成员
  的全部受控参数，包括增减人员、部门名称/层级/负责人和项目职责关系。
- Scope：独立分支与 staging；不修改 V1 和工作流状态机，不部署 production。
- Data model：新增真实部门负责人 `Department.leadUserId` 关系及 migration
  `20260727090000_r26_admin_organization_management`。
- API：新增用户和部门的 preview/create/update 命令；项目成员增改移继续复用 Gate 3A
  服务；写操作强制超级管理员、版本、幂等、事务和审计。
- UI：组织与人员三类真实台账均提供新增/完整编辑/安全移除入口；飞书身份只读；成员移除
  只允许转交给当前项目有效成员，进行中任务逐项确认。分工配置的主责部门不再是固定下拉项，
  超级管理员可以直接键入现有或新的部门名称；新名称由服务端创建真实公司部门后再关联工序。
- Correctness：真实本地写烟测覆盖创建部门/用户、幂等重放、部门负责人设置/清除和安全
  停用；修复幂等重放被重复数据预检阻断的问题。
- Browser bugfix：真人 staging 操作复现组织表单切换下拉项后白屏；根因为 React 事件对象
  在函数式状态更新器中延迟读取。现已先捕获 value/checked，再更新状态，并为同类字段补
  充契约测试。新增部门名称验收时又发现普通工序错误携带遗留评审人，导致服务端拒绝变更；
  现已在表单初始化、写请求和影响预览三处按服务端流程定义清理非评审节点的评审人值。
- Human UAT：真实完成部门新增/改名/负责人设置与清空、用户新增/改部门/改角色/停用、
  项目成员加入/编辑/安全移出；停用有关联人员部门被正确阻断，迁移人员后可执行；所有动作
  均在审计日志中可追溯。另在第 4 步直接键入 `浏览器自定义部门48970111`，预览明确显示
  `CREATE_AND_LINK`，确认后生成真实部门 `CUSTOM_244AD0AA97486E94` 并关联工序；随后恢复
  `工艺开发部`、停用临时部门，创建/分工/恢复/停用审计均成功。临时用户与部门最终停用，
  临时项目成员关系已移除。
- Responsive：1440/1024/390 真实浏览器 PASS，console/page error=0；修复 1024px
  后台表格撑大整页导致的横向溢出。
- Validation：`pnpm install`、lint、typecheck、全量测试、Web/API build、Prisma validate、
  `git diff --check` 全部 PASS；Web 177 tests，API 307 tests。
- Staging：自定义部门实现 `c4dde16`、普通工序评审值修复 `c41ac39`、预览一致性修复
  `24ac366` 均已推送并在独立 staging 完成真实操作验收；浏览器 console error=0；
  production 未触碰。
- Evidence：`docs/product/R26_ADMIN_ORGANIZATION_MANAGEMENT_REPORT.md` 与
  `docs/product/evidence/R26_ADMIN_ORGANIZATION_MANAGEMENT/`。
- Decision：`IMPLEMENTED / PRODUCTION_NOT_TOUCHED / READY_FOR_ISOLATED_STAGING`。

## R26 生产后台按钮与部署真实性修复（2026-07-25）

- Authorization：修复用户录屏中生产后台管理入口点击后仍落入占位页的问题，并按永久
  Bug 协议在原公开 URL 完成精确提交部署与复测。
- Failure evidence：原始录屏
  `/Users/lixiaochen/Desktop/录屏2026-07-25 下午9.29.53.mov`；
  故障时生产 server HEAD 为 `94d6fd01d8840416fb7154d302970d0a94a0c995`，
  正式 `/admin/[section]` 仍引用 `PagePlaceholder`，真实后台 Web/API 源文件缺失。
- Root cause：此前 `a2296dd` 只在本机 staging 实现，未部署到
  `timeline.all-too-well.com`；Nginx、systemd 和数据库并非本次按钮问题根因。
- Fix：生产发布完整后台表格控制中心；新增 API `/api/health` 与 Web `/build-info`
  非敏感运行版本元数据；生产验收强制比较 API、Web、server HEAD 与候选 commit，
  并阻断正式后台路由/构建产物中的 Placeholder。
- Backup：部署前备份
  `/var/backups/feishu-timeline-db/20260725T134828Z/feishu-timeline.dump`；
  隔离恢复 44/44 表、12/12 用户、1/1 项目、44/44 审计记录一致。
- Validation：lint、typecheck、双端 build、Prisma validate 全部 PASS；Web
  44 files / 171 tests，API 66 files / 299 tests；生产 22 migrations/0 pending。
- Release：branch `codex/r26-admin-table-control-center`；production runtime/API/Web/server
  HEAD 均为 `c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0`；release
  `r26-admin-c0a0dc83b6a1`；后台 build Placeholder=0。
- Production browser：在 `https://timeline.all-too-well.com/admin` 使用真实飞书会话
  逐个点击总览 6 个入口、顶部 8 个后台标签和审计刷新；所有目标路由、真实表格和
  `/api/admin/*` 请求均为 200，部署后 API/Web 错误日志为 0。
- Git：production 已改变；`main`/`origin/main` 仍为
  `9884b2a686ad80ae78797cffc7013b79089c79aa`，未合并；tag 未改变。
- Evidence：
  `docs/product/evidence/R26_ADMIN_BUTTON_PRODUCTION_FIX/` 与
  `docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md`。
- Decision：
  `PRODUCTION_DEPLOYED_EXACT_COMMIT / ADMIN_BUTTONS_RETESTED /
  ADMIN_PLACEHOLDERS=0 / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## R26 登录入口直达飞书（2026-07-22）

- Authorization：按用户截图删除登录后的系统选择页，使主页面“登录”一次点击直达飞书认证。
- Scope：Web 登录入口、`/login` 兼容路由和浏览器回归；随后按明确授权创建 RC、部署 production、执行真实 OAuth/业务烟测并合并 `main`。后端业务规则和数据库模型未修改。
- Changes：AppShell 顶部登录和未登录提示直接调用后端飞书授权入口；`/login` 删除飞书二次按钮及模拟登录表单，改为单次自动跳转；已登录访问返回工作台，配置/网络失败展示受控错误。
- Test：新增同一 Playwright 用例覆盖“顶部登录直达”和“旧 `/login` 自动直达”；定向 1/1 PASS（14.6 s）。Playwright 浏览器/FFmpeg 缺口与测试桩 UTF-8 问题均已修复，最终断言未放宽。
- Commands：`pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、Web/API build、Prisma validate 全部 PASS；Web 83/83、API 223/223。
- Release：runtime `8c1d3264cb4355c5db0551309e31073adc78df8d`，tag `v1.1.0-rc.2`；生产 exact HEAD、五服务 active、18 migrations/0 pending、API/Web restart 0。
- Backup：custom dump 214244 bytes、0600、SHA-256 `1ff9e07a79c58c405f97ea3b4d97843b1e82d8be36113cba0c3199f58eb5a8c4`，`pg_restore --list` PASS；八文件 rollback snapshot 保留。
- Production smoke：真实飞书 OAuth、李晓晨系统管理员、工作台/任务/项目概览/数据中心、进展 100%、合法 PNG、全局审计和真实登出/旧会话拒绝 PASS；无认证材料输出。
- Security：匿名 protected APIs 401；HSTS/CSP/TLS/CORS PASS；未主动扫描 production/飞书域名；Gitleaks current/history 0 finding。
- Risk：观察与回滚阈值继续有效；历史 `v1.1.0-rc.1` 未移动；未创建 stable tag。用户明确要求立即合并 `main`，覆盖历史 72 小时等待项。
- Decision：`R25B_AND_R26_PRODUCTION_RELEASED / RC2_EXACT_RUNTIME / MAIN_INTEGRATION_AUTHORIZED / STABLE_TAG_NOT_CREATED`。
- Detail：`docs/rounds/R26.md`。

## R25A final recovery and R25 closure (2026-07-19)

- Authorization: repair the final audit Playwright synchronization assertion,
  continue every remaining R25 gate on the new application runtime, create an
  RC only after full PASS, and stop before production.
- Base runtime: `6d24378168fd144e539b0e99f975b918b06e37a5`.
- Final application runtime/code commit:
  `4aff07c83a6d63e3aeb3cc0b2e72033021ee74a5`.
- Recovery-tool-only commit: `c7e9a2a`; it fixes backup container stdin and
  complete rollback-state provenance without changing API/Web behavior.
- The product label remains `审计与异常`; stable test IDs/href/roles/ARIA were
  added. The final assertion waits for the first matching row to be visible and
  then requires a positive count.
- Target Playwright: 3/3 PASS (26.0 s). Local quality: lint/typecheck/build/
  Prisma PASS; Web 83/83; API 223/223; E2E PASS; full Playwright 55/55 (6.9 m).
- Exact staging: `r25a-4aff07c83a6d`; clean detached build, `RUN_SEED=no`, 18
  migrations/0 pending, all five services healthy. API/Web OCI revision equals
  `4aff07c...`.
- Audit/admin UAT: list/detail 200, bounded 25/50/100, stable sort and composite
  filters, invalid-input 400, redaction PASS and 390 px PASS. Anonymous 401;
  deterministic ordinary viewer list/detail/project/actor attempts 403 and its
  session was destroyed.
- Management UAT: lifecycle duration/stages/material gap, persisted improvement
  `R25A-MGMT-20260719`, department/due date/rule flag and audit detail PASS.
- Security: Semgrep, Gitleaks, dependency SCA, exact five-image Trivy, standard
  security headers and authenticated low-risk ZAP PASS; final
  Critical/High/Medium/Low/Info=`0/0/0/0/0`. Production/Feishu domains were not
  scanned and no auth value was exported.
- `R25A-10VU-4aff07c-20260719`: 17,189/17,189 checks PASS; read/write p95
  142.933/48.355 ms; audit list/detail 184.769/24.440 ms; HTTP/auth/5xx/
  functional/restart/deadlock/duplicate/queue failures 0.
- `R25A-5VU-4aff07c-20260719`: 34,351/34,351 checks and 34,348 iterations PASS;
  read/write p95 144.526/39.108 ms; audit list/detail 180.243/20.970 ms; idle
  memory +7.8548%; DB max 18; slow/deadlock/restart/5xx/unhandled/duplicate 0.
- Backup/restore PASS: 4,830,319-byte custom archive and checksum verified;
  migrations/projects/workflow/material/review/monthly/exit/audit counts match;
  stable audit-page hash match; temporary database destroyed.
- Rollback/forward PASS: previous `6d24378...` and candidate `4aff07c...` each in
  25 s; health/database/OCI provenance PASS; data loss=0, audit loss=0.
- Final staging UAT PASS for employee, project manager, administrator and
  management. Employee performed a real progress write, legal PNG upload and
  backend-controlled task completion. Real logout left the protected audit page
  at `请先登录`; all temporary authentication/proxy state was destroyed.
- Release integration: `fix/r25-admin-audit-001` fast-forwarded into
  `release/r25-final-gate`; the separate evidence commit contains only
  `docs/release/`, `docs/rounds/R25.md` and this ledger. Candidate tag
  `v1.1.0-rc.1` is created on that evidence commit after the final secrets scan.
- Production/main: unchanged; no stable tag. One real account was used for
  positive UAT and deterministic identities for negative roles; no nine-account
  claim.
- Final decision:
  `R25A_PASSED / R25_PASSED / R25-ADMIN-001_FIXED_RETEST_PASS / P0-P1-P2-P3=0-0-0-0 / READY_FOR_PRODUCTION_APPROVAL`.
- Next decision: stop and await explicit product-owner R25B production approval,
  exact candidate/image verification, fresh production backup, rollback window
  and observation-owner confirmation.

> **HISTORICAL_NON_NORMATIVE — R27B Governance v2.1**
> 以下内容保留为历史记录，不再定义当前 Codex 执行协议。当前规范仅来自根 `AGENTS.md`、已批准 Task Contract 和 `docs/gates/VERIFICATION_GATES.md`。不得据此自动 CONTINUE、进入 Next Round、每条命令更新 Ledger，或对小 patch 重跑完整发布 Gate。

> 用途：记录 Codex 每一轮执行情况、验收结果、风险、遗留问题与下一轮决策。
> 要求：每完成一轮，必须更新本文件。

---

### Round R26_PROJECT_CREATE_FIELDS_20260806

#### Goal And Scope

- 收敛正式新建项目表单：移除“项目编号”和“市场”。
- 新增文字字段“颜色营销单位”和受控下拉字段“涂料供应商”。
- 涂料供应商仅允许巴斯夫、立邦、艾仕得、金力泰、阿克苏诺贝尔、兰陵化工。
- 不部署 staging/production，不合并 main，不创建 tag。

#### Exact Changes

- 正式表单不再展示或提交项目编号、市场。
- 服务端在创建请求没有编号时生成唯一内部编号，旧客户端显式传入编号仍兼容。
- Prisma `Project` 新增 `colorMarketingUnit` 和 `paintSupplier`，并提交独立 migration。
- 创建、编辑、列表、详情和审计快照统一返回新增字段。
- DTO 与 Service 双层校验供应商白名单。
- Playwright 创建项目夹具改用新字段，新增前端合同测试和后端项目创建回归。

#### Validation

```text
pnpm install                                                    PASS
pnpm lint                                                       PASS
pnpm typecheck                                                  PASS
pnpm test                                                       PASS（Web 46 files / 180 tests；API 70 files / 328 tests）
pnpm --filter @feishu-timeline/web build                        PASS
pnpm --filter @feishu-timeline/api build                        PASS
pnpm --filter @feishu-timeline/api prisma:validate              PASS
本机 Docker migration                                          PASS
http://localhost:8080/projects/new 真实浏览器交互               PASS
浏览器 console error                                           0
```

- 本机证据：`docs/product/evidence/R26_PROJECT_CREATE_FIELDS_20260806/projects-new-six-suppliers-local.jpg`。
- 本机镜像：Web/API tag 均为 `local-project-suppliers-six-20260806`；运行元数据为
  `runtimeCommit=unknown / release=development`，不作为 staging 或 production 部署证据。
- production、main、tag 均未改变。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806

#### Goal And Scope

- 收敛“新增公司部门”和全部“编辑公司部门”面板。
- 移除顶部蓝色流程提示、部门编码、显示顺序与变更原因，包括 UI、前端提交和后端填写要求。
- 不部署 staging/production，不合并 main，不创建 tag。

#### Exact Changes

- 部门表单只保留部门名称、所属事业部、部门负责人和启用状态。
- Web 部门命令不再提交 `code`、`sortOrder`、`reason`。
- 服务端在新增时生成部门编码和同级显示顺序；编辑时保留既有值。
- 审计原因由服务端写入系统默认值并标记 `reasonSource=SYSTEM_DEFAULT`。
- 超级管理员权限、六项事业部限制、版本校验、幂等、事务与审计保持不变。

#### Validation

```text
pnpm lint                                                       PASS
pnpm typecheck                                                  PASS
pnpm test                                                       PASS（Web 180 / API 329）
pnpm --filter web build                                         PASS
pnpm --filter api build                                         PASS
pnpm --filter api prisma:validate                               PASS
http://localhost:8080/admin/organization 真实浏览器交互          PASS
财务部 / 总部 / 新增公司部门三类表单禁用文案命中数               0
浏览器 console error                                           0
```

- 详细记录：`docs/product/R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806.md`。
- 本机证据：
  `docs/product/evidence/R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/edit-finance-after.png`、
  `docs/product/evidence/R26_DEPARTMENT_FORM_SIMPLIFICATION_20260806/create-after.png`。
- 本机 Web/API 镜像 tag 均为 `local-department-form-simplified-20260806`；未提交部门写操作。
- production、main、tag 均未改变。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_AUTH_REDIRECT_FIX_20260731

#### Goal And Scope

- 修复未登录或应用会话失效时访问正式 V2 业务路由先显示“真实数据暂时不可用 /
  重新读取”，没有进入飞书登录的问题。
- 不修改飞书 OAuth state、回调校验、数据库模型、业务状态机或生产业务数据。

#### Exact Changes

- `V2Shell` 在业务导航和子页面前增加 `AuthProvider` 会话门禁。
- 未登录时使用 `/login` 进入现有服务端飞书 OAuth 链路。
- 登录服务失败与业务数据失败分开呈现。
- 增加组件回归和 Playwright 未登录 V2 路由回归。

#### Validation And Deployment

```text
runtime commit            63b4998b3893b42ec7f2b80d4181d3ca37f67fa7
production URL            https://timeline.all-too-well.com/projects
build time                2026-07-30T17:56:08Z
release                   r26-admin-63b4998b3893
API/Web runtime match     PASS
server HEAD match         PASS
Nginx upstream            127.0.0.1:3000 / 127.0.0.1:3001
PostgreSQL                feishu_timeline / schema up to date
local mandatory checks    PASS
Playwright redirect       1 / 1 PASS
production browser        /projects -> accounts.feishu.cn PASS
production data writes    0
```

第一次直连 SSH 在远端执行前断开；实例只读核对确认未改变后，改用 IAP 通道完成准确
commit 部署。部署后 API、Web、Nginx、PostgreSQL、Redis 均为 active。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_DEPLOYED
PRODUCTION_USER_PATH_VERIFIED
MAIN_MERGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

## 项目基本信息

- 项目名称：轻卡定制颜色开发项目管理系统
- 当前阶段：R26 Product UI Recovery staging
- 当前轮次：R26_GATE3C1_ORDINARY_TASK_COMPLETION
- 总体状态：IMPLEMENTED ON STAGING（等待产品负责人 Gate 3C1 人工确认；停在 Gate 3C2 前）
- 仓库路径：`/Users/lixiaochen/Downloads/feishu_timeline_app`
- 默认分支：`main`
- 最近更新时间：`2026-07-24`

---

## 冻结业务规则摘要

1. 第 4 步完成后自动并行创建第 5 步和第 6 步。
2. 第 9 步独立进行，不阻塞主线。
3. 第 12 步评审通过时间人工录入。
4. 第 12 步不通过退回第 11 步并生成新轮次。
5. 第 13 步“颜色开发收费”固定金额 10000 元。
6. 第 16 步为“批量生产”。
7. 第 17 步为“整车色差一致性评审”，每月一次，共 12 个月。
8. 第 18 步支持人工录入年产量并给出退出建议。
9. R23 历史验收使用“有效已认证用户完整权限”；R23F 起执行方案 A：普通工序限负责人/项目经理，第 12/17 步限指定评审人/项目经理，第 13 步限财务/管理员，第 18 步限项目经理/管理员，配置限管理员，审计限管理员/审计人员；匿名、停用和锁定用户继续拦截。

---

## 总体路线图状态

| Round | 名称 | 状态 | 决策 | 备注 |
|---|---|---|---|---|
| R00 | 仓库审计 + 执行底座搭建 | PASSED | CONTINUE | 已建立执行底座并完成仓库审计 |
| R01 | 工程底座与本地开发环境打通 | PASSED | CONTINUE | 已验证本地基础设施、命令、health check 和启动链路 |
| R02 | 数据库 Schema、迁移脚本、种子数据 | PASSED | CONTINUE | 已补齐流程模板、节点定义扩展、系统参数、工作日历与周期任务基础模型 |
| R03 | 后端领域模型 + 流程引擎核心 | PASSED | CONTINUE | 已补工作日 SLA、月度周期计划生成、退回轮次元数据与流程模板版本化 |
| R04 | 认证、权限、附件、审计、通知调度 | PASSED | CONTINUE | 已补齐权限守卫、项目级访问控制、附件/审计接权、通知扫描与手动触发入口 |
| R05 | API 层与 OpenAPI 文档 | PASSED | CONTINUE | 已补 Swagger、DTO 校验、项目/节点/月度评审/退出治理主接口与权限接入 |
| R06 | 前端骨架与核心业务页面 | PASSED | CONTINUE | 已补前端主业务页、节点详情/轮次历史、固定收费金额展示，并修复附件上传权限错配 |
| R07 | 流程可视化、甘特图、看板、月度评审台账 | PASSED | CONTINUE | 已补流程图、甘特、看板、日历、负责人/部门视图、第 17 步月度评审台账与第 18 步退出建议展示 |
| R08 | 自动化测试体系 | PASSED | CONTINUE | 已补关键单测、权限/附件校验、HTTP E2E 主链路与测试覆盖说明 |
| R09 | 部署脚本、CI/CD、监控、备份、预发布 | PASSED | STOP | 已完成 Docker 化、staging 一键部署、健康检查、回滚脚本与部署文档，等待确认后进入 R10 |
| R10 | UAT、试运行、上线收口 | PASSED | CONTINUE | 已完成 deploy readiness audit、生产部署、HTTPS 验证与 smoke test，并进入生产口径 UAT 收口 |
| R11 | 生产 UAT 与硬门禁收口 | PASSED | CONTINUE | 已完成真实业务口径 UAT、固定收费/权限最小修复、硬门禁证据化与账本收口 |
| R12 | 稳定性、监控、告警、备份恢复 | PASSED | STOP | 已完成生产巡检、增强 health-check、补齐 ops/SSL/5xx/备份脚本、完成备份恢复演练并沉淀运维文档 |
| R13 | UI/UX 精修 + Playwright 浏览器级回归 | PASSED | STOP | 已完成关键页面精修、统一反馈与状态组件、接入 Playwright 5 条关键回归并补齐 CI 入口 |
| Release Closure | 正式发布收口（v1.0.0） | PASSED | STOP | 已完成 main 合并、生产从 main 重部署、release verify / production acceptance，并进入 v1.0.0 tag 收口 |
| R14 | 中文化 UI + 时间线看板 + 实时项目进度驾驶舱 | PASSED | STOP | 已完成中文驾驶舱、项目时间线看板、单项目详情时间线、月度评审看板优化和聚合 API |
| R14_PPT_UI_IMPLEMENTATION | PPT UI 蓝图实装 + 线上部署 | PASSED | STOP | 已按 PPT 结构补齐材料中心、月度评审总账、数据中心、项目列表筛选、详情刷新与线上部署闭环 |
| R16 | UI 自动化验收 + 业务流程网页测试与迭代修复 | PASSED | STOP | 已补 Playwright 网页级业务 UAT、稳定选择器、正式中文文案和节点展示顺序保护 |
| R19 | 公司私有云与飞书工作台上线前安全准入 | BLOCKED | STOP | 代码与本地安全扫描已收口；私有云主机、飞书后台、镜像和 staging 证据待公司侧提供 |
| R19B | 厂商 SAST 对账、当前漏洞整改与安全门禁重建 | BLOCKED | STOP | 本地已修复并通过全量安全/质量门禁；私有云、飞书、认证态 staging 和最终发布镜像证据待补 |
| R20 | 真实业务场景自动化实操测试与迭代修复 | PASSED | CONTINUE | 已完成 13 条 R20 真实浏览器 UAT；全量 Playwright 28/28 通过 |
| R21 | 项目实时流程地图 UI 实现 | PASSED | STOP | 已完成单项目实时流程地图、聚合 API、节点抽屉、风险筛选、自动刷新与全量回归 |
| R21B | 项目实时流程地图线上可见性修复 | PASSED | STOP | 已新增 `/projects/flow-map` 全局入口、导航入口、失败态修复和生产可见性验收 |
| R21C | 生产流程地图权限与演示数据修复 | PASSED | STOP | 已修复飞书用户默认无角色导致 403，并补齐生产演示项目数据 |
| R21C_UI | 项目实时流程地图 UI 布局重构 | PASSED | STOP | 已按 `map2.md` 调整画布拓扑、顶部工具栏、正交连线、缩放适配与 Playwright 截图验收 |
| R22 | Apple 风产品 UI 全量还原 | PASSED | CONTINUE | Gate 1–8、生产发布、临时管理员撤销和生产验收均已完成 |
| R23 | 真实使用稳定性、UAT 与 Bug 修复 | PASSED | STOP | R23E 已关闭认证耐久、最终回归、logout 和证据 blocker；停在 R24 前 |
| R23B | 已认证全权限、真实写路径与认证耐久收口 | BLOCKED | STOP | 单一真实飞书全权限账号完成七场景并逻辑归档；5 VU × 2h 与 10 VU × 30m 因安全会话注入缺失而 BLOCKED |
| R23E | R23 最终回归与证据关闭 | PASSED | STOP | application/staging 同 commit，耐久、52/52、真实 logout、Gitleaks 全部闭环 |
| R23F | R24 前方案 A 最小权限边界 | PASSED | STOP | 真实角色/项目范围/负责人/指定评审联合授权，最终 commit 52/52、staging 与真实 OAuth 管理员正向路径通过 |
| R24 | 完整安全复审与 R24B 准入收口 | PASSED | STOP | 三个 Medium 已修复；IAP SSH、飞书最小配置、认证态 ZAP 0/0/0、全量回归和材料销毁通过；等待确认后进入 R25 |
| R26_GATE3C1 | 第 1～11 步普通工序完成与自动推进 | IMPLEMENTED | STOP | staging 串行、4/6 步并行、9 步非阻塞、材料/阻塞门禁、幂等与并发已验证；等待产品负责人确认，不进入 Gate 3C2 |

状态枚举建议：

- `NOT_STARTED`
- `IN_PROGRESS`
- `PASSED`
- `FAILED`
- `BLOCKED`
- `SKIPPED`

---

## 当前阻塞项

- R24 无未关闭 Critical、High、Medium 或 gate blocker。
- 当前只有一个真实飞书账号，因此不宣称九账号 OAuth 隔离证据；负向权限和 IDOR 矩阵由独立自动化身份覆盖。
- 三个 ZAP Low 与四个 Informational 已记录和分流，不阻塞 R24B；其中两个 Low 来自临时扫描别名代理，不是部署端点。
- R25 尚未开始，等待用户对 R24B 结果的明确确认。

---

## 当前技术假设

- 前端：`Next.js 15 + React 19 + TypeScript`
- 后端：`NestJS 11 + TypeScript`
- 数据库：`PostgreSQL 16（本地 compose）`
- ORM：`Prisma 6`
- 缓存/调度：`Redis 7（本地 compose）`
- 测试框架：`Vitest + Playwright`
- 包管理：`pnpm workspace`
- 部署方式：`Docker Compose + GCE/systemd + Nginx`

---

## 总体验收硬门禁

- [x] 流程主线可跑通到第 16 步
- [x] 第 12 步不通过可退回第 11 步新轮次
- [x] 第 9 步不阻塞主线
- [x] 第 17 步自动生成 12 个按月实例
- [x] 第 13 步固定金额 10000
- [x] 第 18 步支持人工录入年产量
- [x] 关键动作具备审计日志
- [x] staging 部署可重复执行

### 硬门禁证据索引

- `docs/UAT_R11.md`：覆盖 1→16 主线、第 12 步退回新轮次、第 9 步不阻塞、第 17 步 12 个月实例、第 18 步退出建议、权限验收与审计日志证据
- `docs/TEST_COVERAGE_R08.md`：覆盖工作流、权限、附件、月度评审、退出治理与固定收费规则的自动化测试基线
- `docs/STAGING_DEPLOYMENT.md`：覆盖 staging 一键部署、健康检查、迁移/seed 说明与回滚入口
- `docs/UI_REFINEMENT_R13.md`：覆盖页面标题、按钮、状态色、反馈组件、关键工作区精修口径与浏览器回归入口
- `docs/UI_TIMELINE_BOARD_R14.md`：覆盖中文项目进度驾驶舱、时间线看板、状态颜色规则、自动刷新策略和后续优化项
- `docs/UAT_WEB_TEST_R16.md`：覆盖 R16 网页 UAT 策略、稳定选择器、18 步测试基准、测试项目和线上只读 smoke
- `docs/PLAYWRIGHT_TEST_REPORT_R16.md`：覆盖 R16 专项 Playwright、全量 Playwright 和全部门禁命令结果
- `docs/UI_ISSUES_AND_FIXES_R16.md`：覆盖 R16 发现的问题分级、修复项和延期优化项
- `docs/testing/R20_TEST_RUN_REPORT.md`：覆盖 R20 真实浏览器 UAT 13 条用例、测试项目、角色、证据路径和执行结果
- `docs/testing/R20_FINAL_ACCEPTANCE.md`：覆盖第 4/6/9/12/13/16/17/18 关键规则、材料、权限、数据中心和 UI 验收结论
- `docs/FLOW_MAP_UI_REFINEMENT_R21C.md`：覆盖 R21C 项目实时流程地图 UI 布局、坐标规则、状态色、自动刷新与截图验收

---

> **HISTORICAL_NON_NORMATIVE — R27B Governance v2.1**
> 以下内容保留为历史记录，不再定义当前 Codex 执行协议。当前规范仅来自根 `AGENTS.md`、已批准 Task Contract 和 `docs/gates/VERIFICATION_GATES.md`。不得据此自动 CONTINUE、进入 Next Round、每条命令更新 Ledger，或对小 patch 重跑完整发布 Gate。

## Round 记录模板（复制使用）

````md
## Round RXX

### Goal
<本轮目标>

### Scope
<修改范围>

### Inputs Read
- AGENTS.md
- docs/EXECUTION_LEDGER.md
- docs/rounds/RXX.md
- <其他文档>

### Files Changed
- path/a
- path/b

### Commands Run
```bash
<命令>
```

### Acceptance Result
- [x] 通过项 A
- [ ] 未通过项 B

### Risks / Debt
- ...

### Decision
CONTINUE / STOP

### Next Round
RXX
````

---

## 执行记录

> 从 R00 开始，按时间顺序追加。

### Round R00

#### Goal
建立当前仓库的轮次执行底座，审计现有工程能力与目标文档差异，并给出后续轮次的真实推进基线。

#### Scope
- 建立 `docs/rounds/R00.md` ~ `R10.md`
- 建立 `docs/repo-audit.md`
- 建立 `docs/ARCHITECTURE_DECISIONS.md`
- 建立 `docs/ACCEPTANCE_CHECKLIST.md`
- 建立 `scripts/codex/*`
- 更新 `AGENTS.md`
- 更新本账本

#### Inputs Read
- `/Users/lixiaochen/Downloads/codex_templates/AGENTS.md`
- `/Users/lixiaochen/Downloads/codex_templates/docs/EXECUTION_LEDGER.md`
- `/Users/lixiaochen/Downloads/codex_templates/docs/rounds/R00.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `AGENTS.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`
- `docker-compose.yml`

#### Files Changed
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/repo-audit.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/rounds/R00.md`
- `docs/rounds/R01.md`
- `docs/rounds/R02.md`
- `docs/rounds/R03.md`
- `docs/rounds/R04.md`
- `docs/rounds/R05.md`
- `docs/rounds/R06.md`
- `docs/rounds/R07.md`
- `docs/rounds/R08.md`
- `docs/rounds/R09.md`
- `docs/rounds/R10.md`
- `scripts/codex/run-round.sh`
- `scripts/codex/continue.sh`
- `scripts/codex/final-gate.sh`

#### Commands Run
```bash
pwd
ls -la
find . -maxdepth 3 -type f | sed 's#^\./##' | sort | head -n 300
node -v || true
pnpm -v || true
npm -v || true
git status --short
cat package.json
find . -maxdepth 3 \( -name "package.json" -o -name "pnpm-workspace.yaml" -o -name "turbo.json" -o -name "nx.json" \) | sort
sed -n '1,260p' AGENTS.md
sed -n '1,220p' README.md
sed -n '1,240p' apps/api/package.json
sed -n '1,240p' apps/web/package.json
sed -n '1,220p' packages/shared/package.json
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' /Users/lixiaochen/Downloads/codex_templates/AGENTS.md
sed -n '1,260p' /Users/lixiaochen/Downloads/codex_templates/docs/EXECUTION_LEDGER.md
sed -n '1,260p' /Users/lixiaochen/Downloads/codex_templates/docs/rounds/R00.md
sed -n '1,220p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md
sed -n '1,260p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md
sed -n '1,260p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
git branch --show-current
scripts/codex/run-round.sh R00
pnpm install --frozen-lockfile
```

#### Acceptance Result
- [x] 能清楚识别当前仓库结构与技术栈
- [x] `docs/repo-audit.md` 已生成且内容完整
- [x] `scripts/codex/*` 基础脚本已存在
- [x] `docs/ARCHITECTURE_DECISIONS.md` 已生成
- [x] `docs/ACCEPTANCE_CHECKLIST.md` 已生成
- [x] `docs/EXECUTION_LEDGER.md` 已更新
- [x] 已给出后续轮次命令基线和风险提示

#### Risks / Debt
- 当前仓库与三份正式文档存在明显范围差异，需在后续轮次增量对齐。
- 当前仓库末端流程尚未实现正式文档要求的“第 17 步 12 个月度实例 + 第 18 步退出治理”。
- 当前工作树存在用户未提交改动，后续轮次必须避免覆盖。

#### Decision
CONTINUE

#### Next Round
R01

### Round R01

#### Goal
打通本地开发环境、数据库容器、缓存容器、环境变量模板、统一开发命令与 health check，并验证前后端可分别启动。

#### Scope
- 验证 Docker Compose、环境变量模板、health check、统一命令
- 修复影响开发态启动的工程底座问题
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R01.md`
- `docs/repo-audit.md`
- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docker-compose.yml`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/package.json`

#### Files Changed
- `apps/api/package.json`
- `apps/api/src/infra/redis/redis.service.ts`
- `apps/api/src/infra/redis/redis.module.ts`
- `apps/api/src/infra/storage/object-storage.service.ts`
- `apps/api/src/infra/storage/storage.module.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,220p' .env.example
sed -n '1,260p' apps/api/.env.example
sed -n '1,220p' apps/web/.env.example
sed -n '1,220p' apps/api/src/modules/health/health.controller.ts
docker compose up -d postgres redis
docker info
open -a Docker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm typecheck
pnpm install
pnpm --filter @feishu-timeline/api dev
curl -fsS http://localhost:3001/api/health
pnpm --filter @feishu-timeline/web dev
curl -I http://localhost:3000
```

#### Acceptance Result
- [x] 本地 PostgreSQL 可启动
- [x] 本地 Redis 可启动
- [x] 前后端可分别启动
- [x] 至少存在一个 health check
- [x] 存在统一开发命令
- [x] 环境变量模板完整
- [x] 账本已更新

#### Risks / Debt
- `pnpm typecheck` 首次执行依赖 `.next/types`，需要先有一次 Next build 才能稳定通过；后续可考虑继续收敛为更稳的前端 typecheck 策略。
- `apps/api` 原 `dev` 脚本使用 `tsx watch`，会丢失 Nest 运行时注入元数据；本轮已改为 `ts-node` 方案。
- 当前仓库虽然已能本地启动，但正式文档要求的周期任务和退出治理能力仍未在模型层落地。

#### Decision
CONTINUE

#### Next Round
R02

### Round R02

#### Goal
将三份正式文档中的核心数据模型落地为 Prisma schema、migration 与 seed，并保证空库可重复初始化。

#### Scope
- 扩展 Prisma schema 的流程模板、节点定义、周期计划、系统参数、工作日历与颜色退出字段
- 生成并应用正式 migration
- 更新 seed 初始化角色、权限、18 个节点定义、关键参数和工作日历
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R02.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/02_字段字典_数据库表设计_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/migrations/*`

#### Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/prisma/migrations/20260419120000_r02_process_foundation/migration.sql`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' apps/api/prisma/schema.prisma
sed -n '1,320p' apps/api/prisma/seed.ts
rg -n "model (RolePermission|WorkflowNodeDefinition|ProcessTemplate|WorkCalendar|SystemParameter|RecurringPlan|RecurringTask|WorkflowInstance|WorkflowTask|ColorExit)|enum (WorkflowDurationType|ProcessTemplateStatus|WorkCalendarDayType|RecurringPlanStatus|RecurringTaskStatus|SystemParameterValueType|ColorExitSuggestion)" apps/api/prisma/schema.prisma
sed -n '260,940p' apps/api/prisma/schema.prisma
sed -n '320,1200p' apps/api/prisma/seed.ts
pnpm --filter @feishu-timeline/api prisma:validate
docker compose ps
pnpm exec dotenv -e .env.example -- prisma migrate dev --schema prisma/schema.prisma --name r02_process_foundation
find . -type d -name '20260324022432_feishutimeline'
pnpm exec dotenv -e .env.example -- prisma migrate status --schema prisma/schema.prisma
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select migration_name, finished_at from _prisma_migrations order by finished_at;"
pnpm exec dotenv -e .env.example -- prisma migrate reset --schema prisma/schema.prisma --force --skip-seed
pnpm exec prisma migrate diff --from-url "postgresql://postgres:postgres@localhost:5432/feishu_timeline?schema=public" --to-schema-datamodel prisma/schema.prisma --script
pnpm exec dotenv -e .env.example -- prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @feishu-timeline/api prisma:seed
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select code, version, status, \"isDefault\" from process_templates; select count(*) as workflow_nodes_with_step_code from workflow_node_definitions where \"stepCode\" is not null; select count(*) as work_calendar_rows from work_calendar; select category, code, \"valueType\" from system_parameters order by category, code; select count(*) as role_permission_rows from role_permissions;"
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select \"stepCode\", \"nodeCode\", name, \"durationType\", \"durationValue\", \"isBlocking\", \"isDecisionNode\", \"allowRework\", \"allowManualDueAt\", \"defaultChargeAmount\" from workflow_node_definitions where \"stepCode\" in ('04','06','12','16') order by \"stepCode\";"
pnpm --filter @feishu-timeline/api build
```

#### Acceptance Result
- [x] 空库可成功迁移
- [x] 空库可成功 seed
- [x] `workflow_node_definitions` 中已有 18 个带 `stepCode` 的节点
- [x] 第 4、6、12、16 节点的规则字段已初始化到位
- [x] 固定收费金额 10000 已初始化到 `system_parameters`
- [x] 数据库唯一约束、索引和外键已补齐，可拦截明显脏数据
- [x] 账本已更新

#### Risks / Debt
- 当前仓库仍沿用既有命名：`workflow_instances/workflow_tasks/review_records/notifications` 对应模板中的 `process_instances/node_instances/approval_records/notification_logs`，后续实现需持续遵守这套映射，避免再并行造一套表。
- 本地开发库此前存在一条仓库缺失 migration，R02 为完成验收已对开发库做 reset；后续若团队共享数据库，需要统一迁移来源，避免再次出现 drift。
- 第 17 步和第 18 步的数据结构已落地，但调度生成、状态推进和退出判定服务尚未实现，属于 R03 及后续轮次。

#### Decision
CONTINUE

#### Next Round
R03

### Round R03

#### Goal
实现项目创建自动建流程、主链路状态机增强、工作日 SLA 计算、月度周期计划生成和 11/12 轮次闭环基础能力。

#### Scope
- 新增工作日/SLA 服务
- 新增月度周期计划服务
- 改造 `WorkflowsService` 接入节点级 SLA、周期任务生成与轮次元数据
- 补单元测试
- 更新冻结规则文档与本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R03.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/01_PRD功能说明书_轻卡定制颜色开发项目管理系统.md`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/reviews/reviews.service.ts`
- `apps/api/src/modules/mass-productions/mass-productions.service.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`

#### Files Changed
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/workflows/workflows.module.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflow-date.utils.ts`
- `apps/api/src/modules/workflows/workflow-deadline.service.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.ts`
- `apps/api/src/modules/workflows/workflow-deadline.service.spec.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R03.md
find apps/api/src -maxdepth 3 -type f | rg '/(workflows|projects|reviews|activity-logs|notifications|attachments)/.*\.ts$' | sort
rg -n "class .*Service|Controller\(|@Controller|transition|workflow|review|audit|notification|attachment" apps/api/src/modules apps/api/src/infra -g '*.ts'
sed -n '1,520p' apps/api/src/modules/workflows/workflow-node.constants.ts
sed -n '1,940p' apps/api/src/modules/workflows/workflows.service.ts
sed -n '1,320p' apps/api/src/modules/workflows/workflow-acceptance.spec.ts
sed -n '1,320p' apps/api/src/modules/projects/projects.service.ts
sed -n '1,640p' apps/api/src/modules/reviews/reviews.service.ts
sed -n '1,520p' apps/api/src/modules/mass-productions/mass-productions.service.ts
sed -n '1,560p' apps/api/src/modules/color-exits/color-exits.service.ts
sed -n '538,620p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
sed -n '878,970p' /Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_三份正式文档/03_流程规则配置表_状态机说明_轻卡定制颜色开发项目管理系统.md
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
```

#### Acceptance Result
- [x] 可通过后端服务创建项目并生成流程
- [x] 主链路规则可推进到第 16 步，且第 9、13 步保持非阻塞支线
- [x] 第 12 步不通过会生成第 11 步新轮次，并保留退回来源与整改原因
- [x] 第 16 步完成后可自动创建第 17 步周期计划并生成 12 条月度实例
- [x] 工作日 SLA 算法可运行，并能刷新活跃任务 `overdueDays`
- [x] 账本已更新

#### Risks / Debt
- 当前第 17 步是“workflow task 入口 + recurring_plan / recurring_tasks”并存的混合实现，尚未完全替换旧的一次性第 17 步工作区逻辑。
- 当前只完成了“第 16 步触发第 17 步计划”，尚未完成“12 条月度任务全部完成后自动创建第 18 步”的完整收口。
- `effectiveDueAt/overdueDays` 已进入流程核心，但还未全面接入所有查询与前端展示。

#### Decision
CONTINUE

#### Next Round
R04

### Round R04

#### Goal
补齐认证、RBAC、项目级访问控制、附件/审计权限接入，以及通知扫描与月度任务调度的运行能力。

#### Scope
- 建立权限装饰器、权限守卫与角色权限映射
- 为附件、审计日志、内部通知调度入口接入权限与项目级访问控制
- 扩展通知队列，补到期提醒、逾期提醒和月度评审调度扫描
- 补充对应单元测试
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R04.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/api/src/modules/auth/*`
- `apps/api/src/modules/attachments/*`
- `apps/api/src/modules/activity-logs/*`
- `apps/api/src/modules/notifications/*`
- `apps/api/src/modules/queue/*`
- `apps/api/src/modules/users/users.service.ts`

#### Files Changed
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/auth.types.ts`
- `apps/api/src/modules/auth/permissions.decorator.ts`
- `apps/api/src/modules/auth/permissions.guard.ts`
- `apps/api/src/modules/auth/permissions.guard.spec.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/auth/project-access.service.spec.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/attachments/attachments.module.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/attachments/attachments.controller.spec.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.service.spec.ts`
- `apps/api/src/modules/activity-logs/activity-logs.module.ts`
- `apps/api/src/modules/activity-logs/activity-logs.controller.ts`
- `apps/api/src/modules/activity-logs/activity-logs.service.ts`
- `apps/api/src/modules/activity-logs/activity-logs.service.spec.ts`
- `apps/api/src/modules/notifications/notifications.service.ts`
- `apps/api/src/modules/queue/internal-notifications.controller.ts`
- `apps/api/src/modules/queue/internal-notifications.controller.spec.ts`
- `apps/api/src/modules/queue/notification-queue.service.ts`
- `apps/api/src/modules/queue/notification-queue.service.spec.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api start:dev
curl -fsS http://localhost:3001/api/health
curl -i -c /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/auth/mock-login -H 'Content-Type: application/json' -d '{"roleCodes":["admin"]}'
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-due-reminder-scan
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-monthly-review-schedule
curl -fsS -b /tmp/codex_api_cookie.txt -X POST http://localhost:3001/api/internal/notifications/process-overdue-scan
```

#### Acceptance Result
- [x] 不同角色可得到不同访问结果
- [x] 附件元数据可保存
- [x] 关键动作具备审计记录
- [x] 调度任务可被手动触发和自动触发
- [x] 通知日志可写入数据库
- [x] 账本已更新

#### Risks / Debt
- 本轮完成的是权限与项目级访问控制基础设施，当前已明确接入附件、审计日志和内部通知管理入口；其余项目域接口仍需在后续轮次继续接权。
- 月度评审调度当前覆盖“第 17 步计划实例提醒与逾期标记”，尚未补完“12 个周期实例全部完成后自动创建第 18 步”的收口逻辑。
- `mock-login` 和内部通知入口已可用于开发验收，但正式 Feishu 登录联调和外部通知通道稳定性仍需后续环境验证。

#### Decision
CONTINUE

#### Next Round
R05

### Round R05

#### Goal
将后端能力整理为稳定 API，并补齐 Swagger/OpenAPI、DTO 校验、主业务接口权限接入，以及第 17/18 步的查询与治理入口。

#### Scope
- 为主业务接口补 DTO 与参数校验
- 挂载 Swagger/OpenAPI 文档
- 补齐项目、节点、第 17 步月度评审、第 18 步颜色退出相关接口
- 将项目级访问控制接入项目/流程/颜色退出主路径
- 补控制器元数据测试与基础单测适配
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R05.md`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/projects/*`
- `apps/api/src/modules/workflows/*`
- `apps/api/src/modules/color-exits/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/tasks/*`
- `apps/api/src/modules/reviews/*`

#### Files Changed
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.module.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/projects/projects.controller.spec.ts`
- `apps/api/src/modules/projects/projects.service.spec.ts`
- `apps/api/src/modules/projects/dto/project-member.dto.ts`
- `apps/api/src/modules/projects/dto/create-project.dto.ts`
- `apps/api/src/modules/projects/dto/update-project.dto.ts`
- `apps/api/src/modules/projects/dto/replace-project-members.dto.ts`
- `apps/api/src/modules/projects/dto/project-list-query.dto.ts`
- `apps/api/src/modules/workflows/workflows.controller.ts`
- `apps/api/src/modules/workflows/workflows.module.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflows.controller.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `apps/api/src/modules/workflows/dto/workflow-action.dto.ts`
- `apps/api/src/modules/workflows/dto/save-workflow-task-form.dto.ts`
- `apps/api/src/modules/color-exits/color-exits.controller.ts`
- `apps/api/src/modules/color-exits/color-exits.module.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/src/modules/color-exits/color-exits.controller.spec.ts`
- `apps/api/src/modules/color-exits/dto/color-exit-write.dto.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.spec.ts`
- `pnpm-lock.yaml`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api add @nestjs/swagger swagger-ui-express class-validator class-transformer
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api start:dev
curl -I http://localhost:3001/api/docs
curl -fsS http://localhost:3001/api/docs-json | head -c 300
curl -i -c /tmp/codex_api_cookie_r05.txt -X POST http://localhost:3001/api/auth/mock-login -H 'Content-Type: application/json' -d '{"roleCodes":["admin"]}'
curl -fsS -b /tmp/codex_api_cookie_r05.txt 'http://localhost:3001/api/projects?page=1&pageSize=2'
curl -i -b /tmp/codex_api_cookie_r05.txt -X POST http://localhost:3001/api/projects -H 'Content-Type: application/json' -d '{"name":"invalid"}'
curl -i http://localhost:3001/api/projects
curl -i -b /tmp/codex_api_cookie_guest.txt -X POST http://localhost:3001/api/internal/notifications/process-overdue-scan
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/stage-overview
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx
curl -fsS -b /tmp/codex_api_cookie_r05.txt http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx/history-rounds
```

#### Acceptance Result
- [x] OpenAPI 文档可打开
- [x] 主业务接口可调通
- [x] 权限错误码清晰
- [x] 参数校验可用
- [x] 幂等接口边界清晰
- [x] 账本已更新

#### Risks / Debt
- R05 已补齐项目、节点、第 17 步月度评审查询、第 18 步颜色退出的 API 主路径，但仓库里仍存在若干历史业务控制器沿用手写 payload 解析，后续前端接入时要继续收敛接口风格。
- 第 17 步当前补的是 recurring plan / recurring task 查询接口；月度评审写动作仍复用既有 `reviews/consistency` 评审接口，尚未完全统一为单一 API 视图。
- `mock-login` 在未显式传角色时会回落到默认角色，这对开发验收方便，但也意味着“空权限用户”场景不能直接靠该入口验证。

#### Decision
CONTINUE

#### Next Round
R06

### Round R06

#### Goal
完成前端主业务闭环，覆盖登录、新建项目、项目详情、流程页、轮次历史、第 13 步固定收费金额展示，以及附件上传交互。

#### Scope
- 补齐登录页、项目新建/详情/流程相关前端交互
- 接入 R05 新增的节点详情与轮次历史接口
- 固化第 13 步收费金额 10000 的前端展示与提交约束
- 联调附件上传工作区
- 修复验收过程中暴露的前后端权限错配
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R06.md`
- `apps/web/src/app/**/*`
- `apps/web/src/components/**/*`
- `apps/web/src/lib/**/*`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/fees-workspace.tsx`
- `apps/web/src/components/fees-workspace.test.tsx`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/lib/fees-client.ts`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/api/prisma/seed.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,240p' docs/rounds/R06.md
rg -n "mock-login|login|projectId|workflow|fees|attachments" apps/web/src/app apps/web/src/components apps/web/src/lib
sed -n '1,240p' apps/web/src/app/login/page.tsx
sed -n '1,320p' apps/web/src/components/project-editor.tsx
sed -n '320,620p' apps/web/src/components/project-editor.tsx
sed -n '1,280p' apps/web/src/components/project-workflow-workspace.tsx
sed -n '280,620p' apps/web/src/components/project-workflow-workspace.tsx
sed -n '1,260p' apps/web/src/components/attachments-workspace.tsx
sed -n '1,520p' apps/web/src/components/fees-workspace.tsx
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web test
pnpm --filter @feishu-timeline/web build
open -a Safari 'http://localhost:3000/login'
open -a Safari 'http://localhost:3000/projects/new'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/workflow'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/fees'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/attachments'
curl -s -c /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{"username":"mock_project_manager","roleCodes":["project_manager"]}' http://localhost:3001/api/auth/mock-login
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects?page=1&pageSize=10'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqof00n49klrs95jckfe'
curl -s -X POST -b /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{}' 'http://localhost:3001/api/workflows/tasks/cmo6srqox00o39klr8d068utx/reject'
curl -s -X POST -b /tmp/r06_pm_cookie.txt -H 'Content-Type: application/json' -d '{}' 'http://localhost:3001/api/workflows/tasks/cmo6ug2qm00109kf0cgjjxi9w/complete'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/tasks/cmo6ugayn001a9kf0al5g3ido'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/workflows/tasks/cmo6ugayn001a9kf0al5g3ido/history-rounds'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/fees'
rg -n "attachment.manage|rolePermissionMap|permissionCodes" apps/api/src apps/api/prisma -g '!**/*.spec.ts'
sed -n '1,200p' apps/api/src/modules/auth/auth.constants.ts
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/auth/permissions.guard.spec.ts src/modules/attachments/attachments.controller.spec.ts
curl -s -b /tmp/r06_pm_cookie.txt -F "file=@/tmp/r06-attachment-XXXXXX.txt;type=text/plain" -F 'entityType=PROJECT' -F 'entityId=cmo6srqof00n49klrs95jckfe' 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments/upload'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments'
curl -s -b /tmp/r06_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqof00n49klrs95jckfe/attachments/by-entity?entityType=PROJECT&entityId=cmo6srqof00n49klrs95jckfe'
```

#### Acceptance Result
- [x] Mock 登录、新建项目与项目概览前端可用
- [x] 流程页已接入节点详情、轮次历史与时间线，且第 12 步驳回后可看到第 11 步回退与第 12 步第 2 轮
- [x] 第 13 步固定金额 10000 在前端以只读方式展示
- [x] 附件上传入口、上传接口与附件列表读写链路可用
- [x] 验收中发现的项目经理/评审人附件权限错配已修复并补测试
- [x] 账本已更新

#### Risks / Debt
- R06 的第 12 步联调主要基于演示种子项目完成，未从全新项目逐步人工点击 1~12 全链路。
- 已完成项目的种子收费记录仍保留旧的 `TESTING/8600` 演示数据，和冻结后的“固定 10000”规则不一致，后续应清理种子数据口径。
- 当前流程页动作仍是无评论快捷执行，`REJECT/RETURN` 的原因录入体验可以在后续轮次继续加强。

#### Decision
CONTINUE

#### Next Round
R07

### Round R07

#### Goal
提升系统可视化与工程现场可读性，完成流程图、甘特图、看板、截止日历、第 17 步月度评审台账和第 18 步颜色退出页。

#### Scope
- 补齐流程页的流程图、甘特图、看板、截止日历展示
- 在任务页增加负责人视图与部门视图
- 在评审页补齐第 17 步 12 个月度评审台账和周期详情
- 在颜色退出页补齐年产量、退出阈值、系统建议、人工结论、生效日期展示
- 调整演示种子数据以覆盖 12 个月月度评审和完成态退出记录
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R07.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/web/src/components/**/*`
- `apps/web/src/lib/**/*`
- `apps/api/src/modules/color-exits/**/*`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `apps/api/src/modules/color-exits/color-exits.rules.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.spec.ts`
- `apps/api/src/modules/color-exits/dto/color-exit-write.dto.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/project-reviews-workspace.tsx`
- `apps/web/src/components/project-reviews-workspace.test.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.test.tsx`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/lib/color-exits-client.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R07.md
rg -n "workflow|gantt|kanban|calendar|monthly|color-exit|review" apps/web/src/components apps/web/src/lib apps/api/src/modules/color-exits apps/api/prisma
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/api exec vitest run src/modules/color-exits/color-exits.rules.spec.ts src/modules/auth/auth.constants.spec.ts
pnpm --filter @feishu-timeline/web exec vitest run src/components/project-reviews-workspace.test.tsx src/components/color-exit-workspace.test.tsx
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/api prisma:seed
curl -s -c /tmp/r07_pm_cookie.txt -H 'Content-Type: application/json' -d '{"username":"mock_project_manager","roleCodes":["project_manager"]}' http://localhost:3001/api/auth/mock-login
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/projects?page=1&pageSize=20'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/projects/cmo6srqqa00pk9klri6b7walk/color-exit'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews'
curl -s -b /tmp/r07_pm_cookie.txt 'http://localhost:3001/api/workflows/projects/cmo6srqqa00pk9klri6b7walk/monthly-reviews/cmo6vclqw00nt9kd6btvltqru'
kill 36743 36792
pnpm --filter @feishu-timeline/web dev
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/workflow'
open -a Safari 'http://localhost:3000/projects/cmo6srqof00n49klrs95jckfe/tasks'
open -a Safari 'http://localhost:3000/projects/cmo6srqqa00pk9klri6b7walk/reviews'
open -a Safari 'http://localhost:3000/projects/cmo6srqqa00pk9klri6b7walk/color-exit'
```

#### Acceptance Result
- [x] 同一项目在任务表格、流程图、甘特图、看板与日历中的状态展示保持一致
- [x] 任务页已补负责人视图与部门视图，可按责任人和部门聚合查看任务
- [x] 第 17 步 12 个按月实例已在评审页形成可视台账，支持月份卡片、台账表和周期详情查看
- [x] 第 18 步退出建议逻辑前端可见，已展示退出阈值、年产量、系统建议、人工结论和生效日期
- [x] `pnpm --filter @feishu-timeline/web build` 通过，Safari 实测页面加载与交互性能可接受
- [x] 账本已更新

#### Risks / Debt
- 第 17 步周期详情页当前主要基于 recurring task 建档数据，演示项目中“关联评审记录”仍可能为空，后续需要把月度评审记录与周期实例做更严格绑定。
- 流程页截止日历当前展示的是流程任务口径，不包含 recurring task 的月度计划；如需统一为全域日历，需要在后续轮次扩口径。
- Next.js 开发态本轮出现过一次缓存失效导致的 `Cannot find module './953.js'`，通过重启 `web dev` 恢复，暂不构成代码 blocker，但 R08 做自动化时应继续观察。

#### Decision
CONTINUE

#### Next Round
R08

### Round R08

#### Goal
建立单元测试、集成测试、接口测试和 E2E 测试，覆盖流程型系统最关键的业务路径与边界条件。

#### Scope
- 补齐工作日 SLA、并行节点、周期任务、退出建议等关键单测
- 补齐主线不被并行任务阻塞的流程服务测试
- 增加一条真实 HTTP 主链路 E2E，覆盖创建项目、退回重跑、批量生产和第 17 步月度评审
- 增加测试说明文档和仓库级 `test:e2e` 命令
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R08.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `apps/api/src/modules/workflows/**/*`
- `apps/api/src/modules/auth/**/*`
- `apps/api/src/modules/attachments/**/*`
- `apps/api/src/modules/color-exits/**/*`
- `apps/web/package.json`

#### Files Changed
- `apps/api/src/modules/workflows/workflow-deadline.service.spec.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.spec.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.spec.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.spec.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `apps/web/package.json`
- `package.json`
- `docs/TEST_COVERAGE_R08.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/rounds/R08.md
sed -n '1,220p' docs/ACCEPTANCE_CHECKLIST.md
rg -n "ensureMonthlyReviewPlan|buildTaskSchedule|getWorkflowNextTaskTemplates|attachment|mock-login|createProject" apps/api/src apps/web/src
pnpm --filter @feishu-timeline/api exec vitest run src/modules/workflows/workflow-deadline.service.spec.ts src/modules/workflows/workflow-node.constants.spec.ts src/modules/workflows/workflow-recurring.service.spec.ts src/modules/workflows/workflows.service.spec.ts src/modules/color-exits/color-exits.rules.spec.ts
pnpm --filter @feishu-timeline/web test:e2e
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
```

#### Acceptance Result
- [x] API 与流程引擎关键路径测试通过
- [x] E2E 主链路可跑通，覆盖创建项目 → 推进流程 → 退回 → 再推进 → 批量生产 → 月度评审
- [x] 权限测试覆盖关键边界，已验证 `finance` 角色无项目创建权限
- [x] 测试结果报告可读，已新增 `docs/TEST_COVERAGE_R08.md`
- [x] 账本已更新

#### Risks / Debt
- 当前 E2E 采用 HTTP + Web SSR 壳校验，已经能验证真实路由、会话和主链路，但还不是浏览器点击级自动化；后续若需要更强前端回归，可再接 Playwright。
- E2E 默认复用本地 PostgreSQL / Redis，并会在现有 seed 数据上新增项目；后续若上 CI，建议切换到独立测试库与一次性测试数据清理策略。
- 当前测试结果以通过日志和覆盖说明文档为主，尚未引入正式覆盖率采集插件。

#### Decision
CONTINUE

#### Next Round
R09

### Round R09

#### Goal
完成容器化、CI/CD、staging 一键部署、健康检查、回滚脚本与部署文档，使系统达到“可部署、可回滚、可巡检”的预发布基线。

#### Scope
- 新增 API / Web Dockerfile 与 `.dockerignore`
- 新增 staging compose、环境模板、Nginx 配置与 deploy 脚本
- 新增 CI 工作流与部署文档
- 验证 staging 可从空环境启动并可重复执行
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R09.md`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `.env.example`
- `.env.production.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docker-compose.yml`
- `apps/web/next.config.ts`
- `apps/api/src/main.ts`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-release-verify.sh`
- `deploy/nginx/feishu-timeline.conf`
- `deploy/systemd/feishu-timeline-api.service`
- `deploy/systemd/feishu-timeline-web.service`
- `docs/DEVELOPMENT.md`
- `README.md`

#### Files Changed
- `.dockerignore`
- `.github/workflows/ci.yml`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `deploy/compose.staging.yml`
- `deploy/env/staging.env.example`
- `deploy/nginx/compose.staging.conf`
- `scripts/deploy/common.sh`
- `scripts/deploy/staging-up.sh`
- `scripts/deploy/migrate.sh`
- `scripts/deploy/seed.sh`
- `scripts/deploy/health-check.sh`
- `scripts/deploy/staging-log-tail.sh`
- `scripts/deploy/staging-rollback.sh`
- `scripts/deploy/rollback-check.sh`
- `docs/STAGING_DEPLOYMENT.md`
- `package.json`
- `README.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
sed -n '1,260p' docs/EXECUTION_LEDGER.md
sed -n '1,260p' docs/rounds/R09.md
sed -n '1,220p' package.json
sed -n '1,220p' apps/api/package.json
sed -n '1,220p' apps/web/package.json
sed -n '1,220p' .env.example
sed -n '1,220p' .env.production.example
sed -n '1,220p' apps/api/.env.example
sed -n '1,220p' apps/web/.env.example
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' apps/web/next.config.ts
sed -n '1,220p' apps/api/src/main.ts
sed -n '1,220p' scripts/deploy/gce-sync-and-build.sh
sed -n '1,220p' scripts/deploy/gce-release-verify.sh
sed -n '1,220p' deploy/nginx/feishu-timeline.conf
sed -n '1,220p' deploy/systemd/feishu-timeline-api.service
sed -n '1,220p' deploy/systemd/feishu-timeline-web.service
bash -n scripts/deploy/staging-up.sh
bash -n scripts/deploy/health-check.sh
bash -n scripts/deploy/staging-rollback.sh
bash -n scripts/deploy/rollback-check.sh
bash -n scripts/deploy/migrate.sh
bash -n scripts/deploy/seed.sh
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
bash scripts/deploy/staging-up.sh
bash scripts/deploy/health-check.sh
bash scripts/deploy/rollback-check.sh
docker run --rm --entrypoint sh feishu-timeline-api:90a3832 -c 'exec /app/apps/api/node_modules/.bin/prisma -v'
docker run --rm --entrypoint sh feishu-timeline-web:90a3832 -c 'exec /app/apps/web/node_modules/.bin/next --version'
docker build -t feishu-timeline-web:90a3832 -f apps/web/Dockerfile .
bash scripts/deploy/staging-up.sh
bash scripts/deploy/health-check.sh
bash scripts/deploy/rollback-check.sh
```

#### Acceptance Result
- [x] API / Web 已完成容器化，staging compose 可渲染并通过配置校验
- [x] staging 可从空环境启动，`postgres` / `redis` / `api` / `web` / `nginx` 全部达到 healthy
- [x] `staging-up.sh` 已覆盖 build / migrate / start / health-check 主链路
- [x] `migrate.sh` 与 `seed.sh` 已分离，健康检查、日志查看、回滚检查与回滚脚本齐备
- [x] 基础 CI 工作流已补齐，包含 lint / typecheck / test / build / prisma validate / compose config / Docker build
- [x] 重复执行 `staging-up.sh` 已验证通过，staging 部署可重复执行
- [x] `docs/STAGING_DEPLOYMENT.md`、`README.md` 与本账本已更新

#### Revalidation
- 按用户要求重新执行了 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`。
- 按用户要求重新执行了 `docker compose -f deploy/compose.staging.yml config`、`docker compose -f deploy/compose.staging.yml up -d` 与 `bash scripts/deploy/health-check.sh`，结果均通过。
- 本轮停留在 `R09`，等待用户确认后再决定是否进入 `R10`。

#### Git Delivery
- 交付分支：`feat/color-pm-r09-r10`
- 远端：`https://github.com/pijhbkbk/feishu_timeline_app.git`
- 首次交付 commit：`1e7f84c61954d1800cdb7e8f6d5fdb4aababb0b8`
- `git push -u origin feat/color-pm-r09-r10` 已成功
- 当前已具备进入 VPS 部署前审计的代码与 staging 基线，但本轮未操作生产 VPS

#### Risks / Debt
- 首次构建一个本机尚未缓存的基础镜像时，仍依赖 Docker Hub 网络可用性；本轮已把“同一 tag 重复部署”优化为优先复用本地镜像。
- 本地反复对同一 commit 强制重建时，`deploy/.state/current.env` 与 `previous.env` 可能落在同一 `IMAGE_TAG`；实际 staging / VPS 发版应在干净工作树上执行，或显式指定新的 `IMAGE_TAG`。
- 当前 health-check 以服务健康、首页、登录页和 `/api/health` 为主，真正的生产域名、HTTPS 和切流验证留到 R10。

#### Decision
STOP

#### Next Round
R10（待用户确认）

### Round R10

#### Goal
完成 VPS deploy readiness audit、按交付分支执行生产部署、验证 HTTPS/健康检查/基础 smoke test，并形成可追溯的上线记录；暂不合并 `main`，暂不打 tag。

#### Scope
- 审计 GCE 实例 SSH、域名、证书、代理、运行时、数据库与回滚入口
- 复用现有 `scripts/deploy/gce-*`、`deploy/nginx/*`、`deploy/systemd/*` 资产完成原地部署
- 从 `feat/color-pm-r09-r10` 分支部署到生产 VPS
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R10.md`
- `.env.production.example`
- `deploy/nginx/feishu-timeline.conf`
- `deploy/nginx/timeline.all-too-well.com.conf`
- `scripts/deploy/gce-bootstrap.sh`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-network-and-https.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`
- `scripts/deploy/gce-redeploy.sh`
- `scripts/deploy/gce-rollback-checklist.sh`
- 当前 Git 分支与最近一次 push 结果

#### Files Changed
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git branch --show-current
git rev-parse HEAD
git log -1 --oneline --decorate --no-color
git remote -v
gcloud --version
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'whoami && hostname && uname -a'
gcloud compute instances describe instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
dig @1.1.1.1 +short all-too-well.com A
dig @8.8.8.8 +short all-too-well.com A
dig @1.1.1.1 +short www.all-too-well.com A
dig @8.8.8.8 +short www.all-too-well.com A
dig @1.1.1.1 +short timeline.all-too-well.com A
dig @8.8.8.8 +short timeline.all-too-well.com A
curl -k -I --resolve timeline.all-too-well.com:443:35.212.246.199 https://timeline.all-too-well.com/
curl -k -I --resolve timeline.all-too-well.com:443:35.212.246.199 https://timeline.all-too-well.com/api/health
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...readiness audit...'
GIT_REF=feat/color-pm-r09-r10 RUN_PRISMA_MIGRATE_DEPLOY=yes RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'git -C /opt/feishu_timeline_app rev-parse HEAD && systemctl is-active feishu-timeline-api && systemctl is-active feishu-timeline-web && systemctl is-active nginx && systemctl is-active postgresql && systemctl is-active redis-server'
curl -k -I https://timeline.all-too-well.com/
curl -k -I https://timeline.all-too-well.com/api/health
curl -k -I https://timeline.all-too-well.com/_next/static/chunks/742-d77a3f8ae5a58995.js
curl -k -sS -D - 'https://timeline.all-too-well.com/api/projects?page=1&pageSize=1'
```

#### Acceptance Result
- [x] deploy readiness audit 通过：SSH 可达，公网 IP 为 `35.212.246.199`
- [x] 生产机当前采用 `systemd + nginx + PostgreSQL + Redis` 形态；Docker / Compose 未安装，但不是本次部署 blocker
- [x] 80/443 由 `nginx` 占用，3000/3001/5432/6379 由现有生产服务占用，说明可采用原地更新而非另起一套端口
- [x] `apps/api/.env.production` 与 `apps/web/.env.production` 已存在，关键生产变量已就位，未发现示例占位值
- [x] Nginx 已安装且在线，Certbot 证书有效：`all-too-well.com` / `www.all-too-well.com` / `timeline.all-too-well.com`
- [x] 回滚入口明确：远端已有 `/var/backups/feishu-timeline-step5/*`、`/var/backups/feishu-timeline-step6/*`，并可通过 `git reset --hard <known-good-commit>` + `systemctl restart` 回退
- [x] 已从 `origin/feat/color-pm-r09-r10` 部署到 VPS，远端当前代码为 `8521552db6b596bd24e558ddd0653c017a0a2cad`
- [x] `prisma migrate deploy` 已执行并成功应用 `20260419120000_r02_process_foundation`
- [x] `feishu-timeline-api`、`feishu-timeline-web`、`nginx`、`postgresql`、`redis-server` 全部 `active`
- [x] 外部访问通过：`https://timeline.all-too-well.com/` 返回 `307 -> /dashboard`，`https://timeline.all-too-well.com/api/health` 返回 `200`
- [x] HTTPS 正常，`Strict-Transport-Security`、证书 SAN 和 Nginx 配置验证通过
- [x] smoke test 通过：首页、`/login`、`/dashboard`、`/projects`、静态资源 `/_next/static/chunks/742-d77a3f8ae5a58995.js`、`/api/health`、`/api/auth/session`、`/api/auth/feishu/login-url` 均通过
- [x] 受保护业务接口 `GET /api/projects?page=1&pageSize=1` 返回 `401 Authentication required`，表明业务 API 路由与认证边界工作正常

#### Risks / Debt
- 生产机当前仍沿用 `systemd + nginx` 部署链路，未统一到 Docker；这不是上线 blocker，但后续若要统一环境，需单独规划切换窗口。
- 本轮未执行真实业务用户的 Feishu 登录与全链路业务 UAT，只完成了匿名可达性、认证入口和受保护接口边界检查。
- 远端工作树分支名当前仍显示为 `master`，但 `HEAD` 已对齐到 `origin/feat/color-pm-r09-r10` 的最新提交；后续若要长期维护，建议把远端显式切换为同名跟踪分支。

#### Decision
STOP

#### Next Round
合并 `main` + 创建 `v1.0.0` tag（待用户确认）

### Round R11

#### Goal
在不做大范围新功能开发的前提下，完成生产口径 UAT、补齐业务硬门禁、清理演示口径偏差，并把结果沉淀为可复用的业务验收资料。

#### Scope
- 基于生产机隔离 schema + 临时 API 执行真实业务口径 UAT
- 最小修复第 13 步固定收费金额、关键角色流程推进权限与种子数据口径
- 复核并勾选总体验收硬门禁
- 生成 UAT 文档并更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/TEST_COVERAGE_R08.md`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/workflows/workflow-recurring.service.ts`
- `apps/api/src/modules/reviews/reviews.service.ts`
- `apps/api/src/modules/fees/fees.service.ts`
- `apps/api/src/modules/color-exits/color-exits.service.ts`
- `apps/api/src/modules/pilot-productions/pilot-productions.service.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/scripts/e2e-mainline.mjs`

#### Files Changed
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/api/src/modules/fees/fees.rules.ts`
- `apps/api/src/modules/fees/fees.rules.spec.ts`
- `apps/api/src/modules/fees/fees.service.ts`
- `apps/api/prisma/seed.ts`
- `docs/UAT_R11.md`
- `docs/ACCEPTANCE_CHECKLIST.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/fees/fees.rules.spec.ts
pnpm --filter @feishu-timeline/api typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
curl -sS https://timeline.all-too-well.com/api/health
curl -sS https://timeline.all-too-well.com/api/auth/session
curl -sS https://timeline.all-too-well.com/api/auth/feishu/login-url
curl -I https://timeline.all-too-well.com/login/callback
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...prepare isolated schema + temp api + run UAT script...'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'pnpm exec vitest run src/modules/auth/auth.constants.spec.ts src/modules/fees/fees.rules.spec.ts'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'pnpm build && sudo -n systemctl restart feishu-timeline-api'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...cleanup isolated schema and temp api artifacts...'
```

#### Acceptance Result
- [x] `docs/UAT_R11.md` 已生成，沉淀 5 条业务验收场景、权限验收与 Feishu 登录链路验证结果
- [x] 生产机隔离 schema UAT 通过 `5 / 5`：主线 1→16、第 12 步退回新轮次、第 9 步不阻塞、第 17 步 12 个月实例、第 18 步退出建议全部通过
- [x] 第 13 步固定收费金额后端门禁已补齐，`8600` 会被拒绝，系统固定金额统一为 `10000`
- [x] `reviewer`、`quality_engineer`、`finance`、`purchaser` 已补齐 `workflow.transition` 权限，真实评审/收费流程不再因权限映射缺口失败
- [x] 旧演示 / seed 中与冻结规则不一致的 `8600` 口径已清理为 `10000`
- [x] 顶部“总体验收硬门禁”已全部勾选并附证据索引
- [x] 生产 `Feishu` 登录入口、登录 URL、回调地址与匿名会话状态已验证；未执行真人交互式授权回调，结论为非 blocker 运行债务
- [x] 本轮最小修复已在生产 API 上完成构建与重启验证，`/api/health` 保持正常

#### Risks / Debt
- 真实 Feishu 账号授权后的交互式会话闭环尚未人工点击验证；当前只确认登录入口、授权 URL 和回调地址配置正确。
- 本轮业务 UAT 为“生产机隔离 schema + 临时 API”模式，不会污染正式业务数据；后续若要引入长期回归 UAT，建议沉淀为固定脚本与专用测试账户。

#### Decision
STOP

#### Next Round
R12（待用户确认）

### Round R12

#### Goal
在不改动核心业务规则的前提下，补齐线上系统的可观测性、告警、备份恢复与运行稳定性基线。

#### Scope
- 增强生产 `health-check`
- 新增 `ops-check`、证书有效期检查、5xx 日志筛查、PostgreSQL 备份演练脚本
- 完成一次生产巡检与一次备份恢复演练
- 生成运维、告警、备份恢复文档
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `Round R09`
- `Round R10`
- `scripts/deploy/*`
- `deploy/nginx/*`
- `deploy/systemd/*`
- 当前生产环境 `systemctl` / `journalctl` / `nginx` 日志 / 健康检查与回滚脚本

#### Files Changed
- `scripts/deploy/gce-common.sh`
- `scripts/deploy/health-check.sh`
- `scripts/deploy/ops-check.sh`
- `scripts/deploy/check-ssl-expiry.sh`
- `scripts/deploy/check-http-errors.sh`
- `scripts/deploy/backup-postgres.sh`
- `docs/OPERATIONS_R12.md`
- `docs/ALERTING_R12.md`
- `docs/BACKUP_AND_RESTORE_R12.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
bash -n scripts/deploy/gce-common.sh
bash -n scripts/deploy/health-check.sh
bash -n scripts/deploy/ops-check.sh
bash -n scripts/deploy/check-ssl-expiry.sh
bash -n scripts/deploy/check-http-errors.sh
bash -n scripts/deploy/backup-postgres.sh
bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
bash scripts/deploy/ops-check.sh
bash scripts/deploy/check-ssl-expiry.sh
bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'
bash scripts/deploy/backup-postgres.sh RUN_RESTORE_DRILL=yes
curl -I https://timeline.all-too-well.com/
curl -I https://timeline.all-too-well.com/login
curl -I https://timeline.all-too-well.com/dashboard
curl -I https://timeline.all-too-well.com/projects
curl -I https://timeline.all-too-well.com/api/health
python3 - <<'PY'
# 连续请求稳定性采样
PY
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '...systemd / df -h / free -h / ss -tlnp / psql / redis-cli / certbot / logs...'
```

#### Acceptance Result
- [x] `docs/OPERATIONS_R12.md` 已生成
- [x] `docs/ALERTING_R12.md` 已生成
- [x] `docs/BACKUP_AND_RESTORE_R12.md` 已生成
- [x] `health-check.sh` 已增强，支持生产模式下的服务状态、关键 URL、HTTP 状态码和失败摘要输出
- [x] `ops-check.sh` 已新增并可运行，覆盖服务状态、磁盘、内存、端口、证书、数据库、Redis
- [x] `check-ssl-expiry.sh` 与 `check-http-errors.sh` 已新增并通过实际生产校验
- [x] 已完成一次 PostgreSQL 备份文件生成 + 临时 schema 恢复演练，结果 `restore_status=ok`
- [x] 已完成一次生产巡检并记录结果：服务全部 `active`、根分区 `20%`、可用内存约 `3070MB`、最近 300 行 Nginx access log 中 `5xx=0`
- [x] 连续请求稳定性检查已完成，`/`、`/dashboard`、`/projects`、`/api/health` 10 次请求均未出现异常状态码
- [x] `docs/EXECUTION_LEDGER.md` 已更新

#### Risks / Debt
- 当前告警仍是“脚本 + 非零退出码”模式，尚未接入 webhook / 邮件 / 监控平台。
- PostgreSQL 未启用 `pg_stat_statements`，SQL 热点与慢语句只能做到“无长查询”级别观察，缺少语句级排行。
- 生产环境仍以 `systemd + nginx` 手工脚本运维为主，运维能力已可用，但离全自动化监控和统一观察面仍有距离。

#### Decision
STOP

#### Next Round
R13（待用户确认）

### Round R13

#### Goal
提升系统界面一致性、关键流程交互体验和浏览器级自动化回归能力，使系统达到“稳定且美观”的交付水平。

#### Scope
- 统一页面标题、按钮、状态色、空态/错误态/无权限态和页内反馈组件
- 精修第 12 步评审工作区、第 17 步月度评审台账、第 18 步颜色退出页，以及流程页任务动作与截止日历说明
- 接入 Playwright 浏览器级回归与基础 CI 入口
- 更新本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `Round R06`
- `Round R07`
- `Round R08`
- `docs/TEST_COVERAGE_R08.md`
- `apps/web/src/components/*`
- `apps/web/src/app/*`
- `apps/web/scripts/e2e-mainline.mjs`
- `.github/workflows/ci.yml`

#### Files Changed
- `.github/workflows/ci.yml`
- `.gitignore`
- `package.json`
- `apps/web/package.json`
- `apps/web/vitest.config.mts`
- `apps/web/playwright.config.mjs`
- `apps/web/scripts/playwright-runner.mjs`
- `apps/web/tests/playwright/helpers.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/project-editor.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/cabin-review-workspace.tsx`
- `apps/web/src/components/consistency-review-workspace.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/feedback-banner.tsx`
- `apps/web/src/components/state-panel.tsx`
- `docs/UI_REFINEMENT_R13.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/web add -D @playwright/test@^1.51.1
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] `docs/UI_REFINEMENT_R13.md` 已生成，沉淀标题层级、按钮层级、状态颜色体系、状态组件与浏览器回归入口
- [x] 第 12 步评审工作区已完成按钮层级、驳回/整改提示、时间线历史与统一反馈精修
- [x] 第 17 步月度评审台账已完成月份状态着色、摘要卡、绑定规则提示与固定表头滚动表格
- [x] 第 18 步颜色退出页已完成阈值/建议/人工结论摘要、保存与完成动作分层和统一状态反馈
- [x] 流程页 / 看板 / 日历已统一状态色与动作按钮层级，并明确 recurring task 只在评审台账展示、不在截止日历重复投影
- [x] 第 13 步固定收费金额口径保持 `10000`，未引入与冻结规则冲突的新展示
- [x] Playwright 已接入并通过 5 条关键浏览器级回归：登录入口、创建项目并进入流程页、第 12 步驳回生成新轮次并验证上传入口、第 17 步 12 个月实例、第 18 步退出页摘要
- [x] `.github/workflows/ci.yml` 已增加可选 `playwright-smoke` 入口，本地可通过 `pnpm playwright:test` 一键复跑
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过
- [x] `docs/EXECUTION_LEDGER.md` 已更新

#### Risks / Debt
- 当前关键动作反馈以页内 `FeedbackBanner` 为主，尚未接入全局 toast 队列；交付层面已经统一，但还不是完整通知中心。
- recurring task 目前通过“展示边界说明”而不是直接并入流程日历解决；若后续需要统一时间视图，仍需单独设计信息密度与筛选策略。
- Playwright 当前覆盖 5 条关键路径，已满足本轮门禁，但尚未扩到更多角色矩阵、移动端视口和视觉截图基线。

#### Decision
STOP

#### Next Round
等待用户确认是否进入 `main` 合并与正式 tag 收口

### Round Release Closure

#### Goal
将已经通过 R13 的代码与线上状态正式收口为 `v1.0.0`，确保文档、Git 与生产环境基线一致。

#### Scope
- 更新发布文档与账本状态
- 将正式交付分支合并到 `main`
- 从 `main` 重新部署生产并执行 release verify / production acceptance
- 准备正式 `v1.0.0` tag

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `Round R11`
- `Round R12`
- `Round R13`
- `git status`
- `git branch --show-current`
- `git remote -v`
- `git tag --list`
- `scripts/deploy/gce-redeploy.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`

#### Files Changed
- `.gitignore`
- `docs/EXECUTION_LEDGER.md`
- `docs/RELEASE_NOTES_v1.0.0.md`
- `docs/PRODUCTION_HANDOFF_v1.0.0.md`

#### Commands Run
```bash
git status --short
git branch --show-current
git remote -v
git tag --list --sort=-creatordate | head -n 20
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
pnpm --filter @feishu-timeline/web build
git checkout feat/color-pm-r09-r10
git add .
git commit -m "feat: finalize release candidate for v1.0.0"
git push origin feat/color-pm-r09-r10
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/color-pm-r09-r10 -m "Merge branch 'feat/color-pm-r09-r10' for v1.0.0 release"
git push origin main
RUN_PRISMA_MIGRATE_DEPLOY=yes bash scripts/deploy/gce-redeploy.sh
```

#### Acceptance Result
- [x] `docs/RELEASE_NOTES_v1.0.0.md` 已生成
- [x] `docs/PRODUCTION_HANDOFF_v1.0.0.md` 已生成
- [x] 顶部当前阶段 / 当前轮次已切换为 `Release Closure`
- [x] 正式交付分支 `feat/color-pm-r09-r10` 已更新并推送到远端
- [x] `main` 已通过 merge commit 合并正式交付分支
- [x] 生产环境已从 `main` 重新部署，并确认不再停留于 `master@8521552`
- [x] `gce-release-verify.sh` 通过：域名、HTTPS、HSTS、首页、`/login`、`/dashboard`、`/projects`、`/api/health`、认证边界与证书状态全部通过
- [x] `gce-production-acceptance.sh` 通过：远端 `systemd`、`nginx`、`postgresql`、`redis`、生产环境变量与认证入口全部通过
- [x] 生产运行基线已确认切换到 `main` 合并提交 `9ec8d62`

#### Risks / Debt
- 当前正式发布已经完成 `main` 合并与生产对齐，但最终正式版本仍以 `v1.0.0` tag 和 tag 对应的 `main` HEAD 为准。
- 告警平台与更细粒度性能观测仍属于发布后可延期优化项，不影响本次 `v1.0.0` 正式交付。

#### Decision
STOP

#### Next Round
发布后观察期

### Round R14

#### Goal
在不改变已冻结业务规则和流程状态机的前提下，将系统 UI 升级为中文项目进度驾驶舱，并新增能实时展示轻卡定制颜色开发项目进度的时间线看板。

#### Scope
- 全站导航、页面标题、按钮、状态、空态、错误提示和核心业务文案中文化
- 首页 `/dashboard` 改造为“项目进度驾驶舱”
- 新增 `/projects/timeline-board` 项目时间线看板
- 项目详情流程页增加单项目完整节点时间线
- 优化第 17 步整车色差一致性评审台账月份卡片与本月任务展示
- 新增只读聚合 API，减少前端多接口拼装
- 更新 R14 文档与本账本

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `apps/web/src/app/dashboard`
- `apps/web/src/app/projects`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/lib/*`

#### Files Changed
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.controller.spec.ts`
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/projects/projects.controller.spec.ts`
- `apps/web/src/lib/status-labels.ts`
- `apps/web/src/lib/dashboard-client.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/src/lib/workflows-client.ts`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/monthly-review-workspace.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/app/projects/timeline-board/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/components/project-timeline-board.test.tsx`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
GIT_REF=feat/flow-map-ui-refinement-r21c RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
DEPLOY_TARGET=production bash scripts/deploy/health-check.sh
bash scripts/deploy/ops-check.sh
pnpm --filter @feishu-timeline/web exec node <production authenticated flow-map screenshot check>
```

#### Acceptance Result
- [x] 用户可见核心界面已中文化，导航、标题、按钮、状态、空态、错误提示和核心业务文案不再保留明显英文业务文案。
- [x] 首页已改造为“项目进度驾驶舱”，包含项目总数、进行中项目、逾期任务、本月待评审、月度色差评审待完成、待退出颜色、最近更新时间和手动刷新。
- [x] `/projects/timeline-board` 已新增项目时间线看板，项目卡片展示 18 个流程节点、当前节点、责任人、截止时间、逾期天数、进度百分比、下一步和查看详情入口。
- [x] 项目详情流程页已增加单项目时间线，并覆盖第 12 步评审、第 17 步月度进度、第 18 步颜色退出摘要。
- [x] 第 17 步月度评审台账已显示 12 个月份卡片、完成进度和本月任务标识，并支持跳转对应月份详情。
- [x] 首页和项目时间线看板每 30 秒刷新，项目详情流程页每 15 秒刷新，均提供“立即刷新”。
- [x] 新增/扩展只读聚合 API：`GET /api/dashboard/overview`、`GET /api/dashboard/project-timelines`、`GET /api/projects/:projectId/timeline`、`GET /api/dashboard/monthly-review-board`。
- [x] `docs/UI_TIMELINE_BOARD_R14.md` 已生成。
- [x] `docs/EXECUTION_LEDGER.md` 已更新。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Risks / Debt
- 当前实时刷新采用轮询和手动刷新，未引入 WebSocket；满足 MVP 驾驶舱实时性，但不提供秒级协同。
- 时间线看板当前以横向滚动承载 18 个节点，普通笔记本可读；后续可针对移动端增加压缩视图和筛选器。
- 聚合接口目前未做服务端分页和缓存；数据量显著增长后需补排序、分页和缓存策略。

#### Decision
STOP

#### Next Round
建议先部署到 VPS 做业务方验收和真实数据观察，再评估移动端压缩视图、看板筛选和聚合接口缓存。

### Round R14_PPT_UI_IMPLEMENTATION

#### Goal
按 PPT 设计稿将线上系统升级为中文项目进度驾驶舱、项目时间线看板、材料提交平台、整车色差一致性评审台账和数据中心，并部署到 `https://timeline.all-too-well.com`。

#### Scope
- 复制并归档 PPT 设计稿到 `docs/design`
- 新增 `docs/PPT_UI_IMPLEMENTATION_R14.md`，建立 PPT slide-to-code 映射
- 补齐 `/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics` 和 `/projects/:id/materials`
- 优化 `/projects` 项目列表筛选和 `/projects/:id/overview` 详情刷新
- 扩展材料中心、月度评审总账、数据中心聚合展示
- 新增 `GET /api/analytics/overview`
- 保持业务状态机、评审门禁、固定收费和颜色退出规则不变

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `/Users/lixiaochen/Desktop/U I-1.md`
- `/Users/lixiaochen/Downloads/轻卡颜色开发项目管理系统_UI界面设计稿.pptx`
- `/Users/lixiaochen/Downloads/轻卡定制颜色开发项目管理系统_UI界面方案.pptx`
- 当前 dashboard、projects、workflow、reviews、color-exit、attachments、API 与前端组件结构

#### Files Changed
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/analytics/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/app/analytics/page.tsx`
- `apps/web/src/app/materials/page.tsx`
- `apps/web/src/app/monthly-reviews/page.tsx`
- `apps/web/src/app/projects/timeline/page.tsx`
- `apps/web/src/app/projects/timeline-board/page.tsx`
- `apps/web/src/app/projects/[projectId]/materials/page.tsx`
- `apps/web/src/components/analytics-center.tsx`
- `apps/web/src/components/materials-center.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-overview-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/attachments-workspace.tsx`
- `apps/web/src/lib/analytics-client.ts`
- `apps/web/src/lib/status-labels.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ppt-ui-r14.test.tsx`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `scripts/deploy/gce-common.sh`
- `scripts/deploy/gce-sync-and-build.sh`
- `scripts/deploy/gce-release-verify.sh`
- `scripts/deploy/gce-production-acceptance.sh`
- `docs/PPT_UI_IMPLEMENTATION_R14.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/design/*`

#### Commands Run
```bash
git switch -c feat/ppt-ui-r14
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
git add apps/api/src/app.module.ts apps/api/src/modules/dashboard apps/api/src/modules/projects apps/api/src/modules/analytics apps/web/scripts/e2e-mainline.mjs apps/web/src/app apps/web/src/components apps/web/src/lib apps/web/tests/playwright docs/EXECUTION_LEDGER.md docs/PPT_UI_IMPLEMENTATION_R14.md docs/UI_TIMELINE_BOARD_R14.md docs/design
git commit -m "feat: implement PPT UI blueprint for Chinese project timeline dashboard"
git push -u origin feat/ppt-ui-r14
GIT_REF=feat/ppt-ui-r14 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --tunnel-through-iap --command 'whoami'
bash -n scripts/deploy/gce-common.sh scripts/deploy/gce-sync-and-build.sh scripts/deploy/gce-release-verify.sh scripts/deploy/gce-production-acceptance.sh
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/ppt-ui-r14 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh
curl https://timeline.all-too-well.com/dashboard
curl https://timeline.all-too-well.com/projects
curl https://timeline.all-too-well.com/projects/timeline
curl https://timeline.all-too-well.com/materials
curl https://timeline.all-too-well.com/monthly-reviews
curl https://timeline.all-too-well.com/analytics
curl https://timeline.all-too-well.com/api/health
```

#### Acceptance Result
- [x] PPT 设计稿已复制到 `docs/design`，并生成首屏 Quick Look 参考图。
- [x] `docs/PPT_UI_IMPLEMENTATION_R14.md` 已建立 PPT 页面到代码/API/测试映射。
- [x] 全站核心导航、标题、按钮、状态、空态和业务提示已统一中文化，并将“超期”统一为“逾期”。
- [x] `/dashboard` 为中文项目进度驾驶舱，保留 30 秒轮询和手动刷新。
- [x] `/projects/timeline` 为项目时间线看板，展示 18 个节点、当前节点、责任人、逾期、进度、下一步，并支持关键词、状态、部门、负责人和逾期筛选。
- [x] `/projects` 项目列表支持颜色、当前工序、责任部门、负责人、逾期状态和日期筛选。
- [x] `/projects/:id/overview` 每 15 秒自动刷新，编辑表单时暂停覆盖未保存输入。
- [x] `/projects/:id/workflow` 与 `/projects/:id/tasks` 提供单项目完整节点时间线、工序清单和节点详情。
- [x] `/materials` 与 `/projects/:id/materials` 提供材料提交入口、上传、预览和归属管理。
- [x] `/monthly-reviews` 提供第 17 步全局 12 个月评审台账，项目评审页继续展示单项目月份卡片和详情。
- [x] `/analytics` 提供项目概览、流程效率、部门负载、返工、月度评审、颜色退出和费用摘要。
- [x] 新增只读聚合 API `GET /api/analytics/overview`，未修改冻结业务状态机与流程规则。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。
- [x] 已创建并推送 `feat/ppt-ui-r14`，实现提交为 `4f315aa`。
- [x] 直连 SSH 被远端关闭后，已为 GCE 部署脚本补充可选 `GCE_TUNNEL_THROUGH_IAP=yes` 开关，默认直连行为不变。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 `pnpm build`、Prisma validate、release verification 和 production acceptance 全部通过。
- [x] 线上 `/dashboard`、`/projects`、`/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics`、`/api/health` 均返回 200；受保护聚合 API 在未登录状态返回 401，符合生产鉴权预期。
- [x] `ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 23%，可用内存 3057MB，证书剩余 62 天。

#### Risks / Debt
- 本地环境未安装 LibreOffice，PPT 仅完成文本结构抽取和首屏 Quick Look 渲染，未逐页生成图片证据。
- 当前本机到 GCE 的直连 SSH 会被远端关闭，本次部署和巡检使用 `GCE_TUNNEL_THROUGH_IAP=yes`；该开关已写入脚本，后续运维可继续复用。
- 时间线看板已满足普通笔记本阅读，移动端仍以横向滚动为主，后续可增加折叠式节点视图。
- 聚合 API 当前为 MVP 只读查询，数据量提升后建议增加服务端分页、缓存和排序。

#### Decision
STOP

#### Next Round
生产观察期：收集真实项目数据下的时间线密度、月度评审总账和数据中心指标反馈。

### Round R16_UI_BUSINESS_E2E_TEST_AND_ITERATE

#### Goal
基于 `https://timeline.all-too-well.com` 的线上页面口径和本地可写测试环境，使用 Playwright 操作真实网页验证中文 UI、项目看板、18 步工序、材料提交、第 12 步退回、第 17 步月度评审、第 18 步颜色退出、数据中心与业务规则。

#### Scope
- 补充关键页面 `data-testid`，提升 Playwright 选择器稳定性。
- 新增 R16 Playwright fixtures 和 3 组专项测试：中文 UI、新建项目、18 步业务流。
- 修复用户可见“占位”类临时文案，改为正式中文业务描述。
- 修正第 7/8/9 步显示顺序与名称，保持冻结状态机不变。
- 后端项目列表节点筛选项改用流程常量排序和命名，避免生产旧节点定义影响展示。
- 更新 R16 UAT、Playwright 报告、问题修复文档和本账本。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_REFINEMENT_R13.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `/Users/lixiaochen/Desktop/UI-2.md`
- 当前 dashboard、projects、workflow、reviews、color-exit、materials、monthly-reviews、analytics、API 与前端组件结构

#### Files Changed
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/web/src/app/admin/[section]/page.tsx`
- `apps/web/src/app/projects/[projectId]/[section]/page.tsx`
- `apps/web/src/app/reviews/page.tsx`
- `apps/web/src/components/analytics-center.tsx`
- `apps/web/src/components/attachments-workspace.tsx`
- `apps/web/src/components/cabin-review-workspace.tsx`
- `apps/web/src/components/color-exit-workspace.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/materials-center.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/page-placeholder.tsx`
- `apps/web/src/components/project-editor.tsx`
- `apps/web/src/components/project-overview-client.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-ui-chinese.spec.ts`
- `apps/web/tests/playwright/r16-create-project.spec.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `docs/UAT_WEB_TEST_R16.md`
- `docs/PLAYWRIGHT_TEST_REPORT_R16.md`
- `docs/UI_ISSUES_AND_FIXES_R16.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm --filter @feishu-timeline/web exec playwright install --with-deps chromium
pnpm playwright:test -- --grep R16
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
docker exec feishu-timeline-postgres psql -U postgres -d feishu_timeline -c "select code, name, \"createdAt\" from projects where name like 'UAT-自动化-%' or code like 'R16-UAT-%' order by \"createdAt\" desc limit 20;"
git add -- apps/api/prisma/seed.ts apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/workflows/workflow-node.constants.ts 'apps/web/src/app/admin/[section]/page.tsx' 'apps/web/src/app/projects/[projectId]/[section]/page.tsx' apps/web/src/app/reviews/page.tsx apps/web/src/components/analytics-center.tsx apps/web/src/components/attachments-workspace.tsx apps/web/src/components/cabin-review-workspace.tsx apps/web/src/components/color-exit-workspace.tsx apps/web/src/components/dashboard-workspace.tsx apps/web/src/components/materials-center.tsx apps/web/src/components/monthly-reviews-board.tsx apps/web/src/components/page-placeholder.tsx apps/web/src/components/project-editor.tsx apps/web/src/components/project-overview-client.tsx apps/web/src/components/project-workflow-workspace.tsx apps/web/src/components/projects-list-client.tsx apps/web/src/lib/navigation.ts apps/web/src/lib/projects-client.ts apps/web/tests/playwright/r16-fixtures.ts apps/web/tests/playwright/r16-ui-chinese.spec.ts apps/web/tests/playwright/r16-create-project.spec.ts apps/web/tests/playwright/r16-business-flow.spec.ts docs/UAT_WEB_TEST_R16.md docs/PLAYWRIGHT_TEST_REPORT_R16.md docs/UI_ISSUES_AND_FIXES_R16.md docs/EXECUTION_LEDGER.md
git commit -m "test: add R16 browser UAT coverage"
git push -u origin feat/r16-ui-business-e2e
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/r16-ui-business-e2e RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh
node - <<'NODE'
const paths = ['/dashboard','/projects','/projects/timeline','/materials','/monthly-reviews','/analytics','/api/health'];
for (const path of paths) {
  const response = await fetch(`https://timeline.all-too-well.com${path}`, { redirect: 'follow' });
  console.log(`${path} ${response.status}`);
}
NODE
```

#### Acceptance Result
- [x] `/dashboard`、`/projects`、`/projects/timeline`、`/materials`、`/monthly-reviews`、`/analytics`、`/api/health` 线上只读 smoke 均返回 200。
- [x] 本轮未在生产写入 UAT 项目；写入型测试均在本地测试库执行。
- [x] 已补充关键页面与组件的稳定 `data-testid`。
- [x] 中文 UI 检查通过，未发现明显英文业务文案、长期加载、空白页或严重控制台错误。
- [x] Playwright 真实网页创建了 `UAT-自动化-深海蓝-*`、`UAT-自动化-星河银-*`、`UAT-自动化-极光白-*` 本地测试项目。
- [x] 第 4 步完成后并行创建第 5/6 步通过。
- [x] 第 9 步独立进行且不阻塞主线通过。
- [x] 第 12 步不通过退回第 11 步并生成第 2 轮通过。
- [x] 第 13 步固定金额 `10000` 元通过。
- [x] 第 16 步完成后第 17 步 12 个月度评审卡片可见通过。
- [x] 第 18 步颜色退出阈值、系统建议、人工结论和材料上传通过。
- [x] 材料提交平台和数据中心页面通过。
- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/web build`、`pnpm test:e2e`、`pnpm playwright:test -- --grep R16`、`pnpm playwright:test` 全部通过。
- [x] `docs/UAT_WEB_TEST_R16.md`、`docs/PLAYWRIGHT_TEST_REPORT_R16.md`、`docs/UI_ISSUES_AND_FIXES_R16.md` 已生成。
- [x] 已创建并推送 `feat/r16-ui-business-e2e`，实现提交为 `c98ec4f`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 `pnpm build`、Prisma validate、release verification 和 production acceptance 全部通过。
- [x] `ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 23%，可用内存 3050MB，证书剩余 62 天。

#### Risks / Debt
- 生产环境未开启 mock 登录，自动化写入型 UAT 仍只建议在本地或 staging 执行。
- 月度评审卡片与跳转已通过，后续可继续增强单月评审填报向导。
- 时间线看板在移动端仍以横向滚动为主，可后续补折叠式节点视图。
- 数据中心当前为 MVP 聚合视图，真实项目数据量上来后建议补分页、缓存和钻取。

#### Decision
STOP

#### Next Round
如需继续推进，建议进入生产试运行数据观察与移动端时间线阅读体验优化。

### Round R17_TIMELINE_NODE_INTERACTION

#### Goal
将“项目时间线看板”升级为主操作入口：用户点击 `/projects/timeline` 和 `/projects/:id/workflow` 的工序节点后，在当前页面打开工序详情抽屉，查看负责人、责任部门、材料、附件、SLA、评审/审批专项、流转记录与可执行动作。

#### Scope
- 新增时间线节点 hover 提示和 click 交互。
- 新增 `TaskDetailDrawer` 及工序概况、责任信息、时间与 SLA、材料附件、评审/审批、流转记录分区。
- 新增后端工序详情聚合 API，不改动冻结流程状态机和第 4/6/9/12/13/16/17/18 步核心规则。
- 完善项目时间线看板节点数据字段，确保节点携带 `taskId`、负责人、责任部门、截止时间、阻塞和节点类型信息。
- 新增 R17 Playwright 场景，覆盖第 1/6/12/13/17/18 步抽屉展示和 `taskId` URL 恢复。
- 新增 R17 设计与 API 文档。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/UI_TIMELINE_BOARD_R14.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/workflows/*`
- `apps/api/src/modules/dashboard/*`
- `apps/api/src/modules/projects/*`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/lib/*`
- `apps/web/tests/playwright/*`

#### Files Changed
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/workflows/workflows.controller.ts`
- `apps/api/src/modules/workflows/workflows.controller.spec.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/web/playwright.config.mjs`
- `apps/web/e2e/r17-timeline-node-interaction.spec.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ppt-ui-r14.test.tsx`
- `apps/web/src/components/project-detail-timeline.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/project-timeline-board.test.tsx`
- `apps/web/src/components/task-detail-drawer.tsx`
- `apps/web/src/components/timeline-node.tsx`
- `apps/web/src/lib/dashboard-client.ts`
- `apps/web/src/lib/workflows-client.ts`
- `docs/TIMELINE_NODE_INTERACTION_R17.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm test:e2e
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm playwright:test
git add .
git commit -m "feat: add interactive timeline task detail drawer"
git push -u origin feat/timeline-node-interaction-r17
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/timeline-node-interaction-r17 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh || true
curl -k -sS -L -o /tmp/r17-timeline.html -w 'timeline code=%{http_code} url=%{url_effective}\n' https://timeline.all-too-well.com/projects/timeline
curl -k -sS https://timeline.all-too-well.com/api/health
curl -k -sS https://timeline.all-too-well.com/api/auth/session
curl -k -sS https://timeline.all-too-well.com/api/auth/feishu/login-url
```

#### Acceptance Result
- [x] `/projects/timeline` 节点 hover 显示步骤号、工序名称、状态、负责人、责任部门、截止时间、逾期/剩余工作日和点击提示。
- [x] `/projects/timeline` 点击已触发节点打开右侧“工序详情抽屉”，页面不跳转，并写入 `projectId` 与 `taskId`。
- [x] `/projects/:id/workflow` 单项目时间线节点可直接打开相同详情抽屉。
- [x] 刷新带 `taskId` 的 URL 后，抽屉可自动恢复打开。
- [x] 抽屉展示工序概况、责任信息、时间与 SLA、材料与附件、评审 / 审批、流转记录。
- [x] 加载中、加载失败、无权限、无附件、无流转记录均为中文状态。
- [x] 第 12 步展示通过、不通过 / 退回、原因、整改要求、责任人、通过时间和历史轮次。
- [x] 第 13 步展示固定金额 `10000 元`、收费状态、收费凭证和财务确认人。
- [x] 第 17 步展示 `12 个月`周期、已完成 `n / 12`、本月状态、逾期月份和月度评审台账入口。
- [x] 第 18 步展示年产量、退出阈值、系统建议、人工结论、退出原因和生效日期。
- [x] `GET /api/workflows/tasks/:taskId/detail` 返回真实聚合数据，不使用静态假详情冒充执行信息。
- [x] `GET /api/dashboard/project-timelines` 节点补充 `stepCode`、`stepName`、`status`、`ownerName`、`departmentName`、`isBlocking`、`nodeType`。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Online Verification
- [x] 已推送 `feat/timeline-node-interaction-r17`，实现提交为 `92a9e1c`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 checkout `92a9e1c`，`pnpm install`、Prisma validate、Web/API build、systemd restart、release verification 和 production acceptance 全部通过。
- [x] `scripts/deploy/health-check.sh DEPLOY_TARGET=production` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，`/api/health` 返回 `200` 且 `status=ok`，关键页面与静态资源返回 200。
- [x] `scripts/deploy/ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 21%，可用内存 3086MB，证书剩余 50 天。
- [x] 线上只读 smoke：`/projects/timeline` 返回 200，`/api/health` 返回 `{"status":"ok"}`。
- [x] 生产登录状态验证：`/api/auth/session` 返回 `authenticated=false`、`mockEnabled=false`、`feishuEnabled=true`，飞书登录 URL 可生成。
- [ ] 线上真实点击节点需要有效飞书用户会话；本轮未使用生产账号执行写入或点击型 UAT。节点点击、专项展示、刷新恢复已由本地 Playwright 全流程覆盖。

#### Risks / Debt
- “保存”和“转交负责人”按钮当前展示为不可用占位，后续需要专用表单保存和负责人转交 API。
- 必交材料清单依赖 `workflow_node_definitions.requiredAttachments`，当前种子数据未配置时展示“暂无必交材料配置”。
- 抽屉支持附件查看 / 下载 / 上传入口，后续可在抽屉内嵌上传控件。
- `flowLogs` 当前取最近 30 条聚合记录，真实数据量上来后可分页。

#### Decision
STOP

#### Next Round
建议继续补充抽屉内表单保存、负责人转交、材料内嵌上传和流转记录分页。

### Round R18_SYSTEM_GUIDE_INTRO_PAGE

#### Goal
新增 `/guide`“系统导览”介绍页，帮助首次进入系统的用户理解轻卡定制颜色开发 18 步流程、网站操作步骤、角色分工、关键业务规则、材料归档和快速入口。

#### Scope
- 新增系统导览页面和组件，页面内容全部中文化。
- 将“系统导览”加入用户端主导航最前面，并加入顶部主导航。
- 页面展示 Hero、流程总览、18 步展开清单、关键业务规则、8 步操作、角色指南、材料说明、快速入口和常见问题。
- 第 12、17、18 步作为关键节点突出展示。
- `/guide` 作为公共说明页可未登录阅读；进入业务功能后仍沿用既有登录与后端权限校验。
- 不改动后端流程规则，不改动第 4、6、9、12、13、16、17、18 步核心逻辑。
- 新增 R18 Playwright 场景和 R18 文档。

#### Inputs Read
- `AGENTS.md`
- `/Users/lixiaochen/Desktop/轻卡颜色开发系统_系统导览界面概念稿.pptx`
- `docs/EXECUTION_LEDGER.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/TIMELINE_NODE_INTERACTION_R17.md`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tests/playwright/r16-fixtures.ts`

#### Files Changed
- `apps/web/src/app/guide/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/route-smoke.test.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/e2e/r18-system-guide.spec.ts`
- `docs/SYSTEM_GUIDE_R18.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/system-guide-r18
pnpm install
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web test
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web playwright:test:raw -- e2e/r18-system-guide.spec.ts
pnpm lint
pnpm typecheck
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm test:e2e
pnpm playwright:test
git add .
git commit -m "feat: add system guide intro page for color development workflow"
git push -u origin feat/system-guide-r18
GCE_TUNNEL_THROUGH_IAP=yes GIT_REF=feat/system-guide-r18 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
GCE_TUNNEL_THROUGH_IAP=yes bash scripts/deploy/ops-check.sh || true
pnpm --filter @feishu-timeline/web exec node --input-type=module # 线上 /guide 可见内容与移动端截图检查
curl -k -sS -L -o /tmp/r18-guide.html -w 'guide code=%{http_code} url=%{url_effective}\n' https://timeline.all-too-well.com/guide
curl -k -sS https://timeline.all-too-well.com/api/health
```

#### Acceptance Result
- [x] `/guide` 页面已新增，页面名称为“系统导览”。
- [x] 主导航和用户端侧边导航最前面已增加“系统导览”。
- [x] Hero 展示“轻卡定制颜色开发项目管理系统”标题、副标题和三个入口按钮。
- [x] 18 个工序按 4 个阶段完整展示，并支持展开 / 收起详细清单。
- [x] 第 12、17、18 步作为关键节点突出展示。
- [x] 关键业务规则覆盖自动流转、并行工序、非阻塞工序、评审退回、固定收费、月度评审与颜色退出。
- [x] 网站操作步骤覆盖 8 步。
- [x] 角色指南覆盖营销公司、涂装工艺部、采购部、质量管理部、生产部 / 涂装厂、财务部。
- [x] 快速入口可跳转到工作台、项目看板、新建项目、我的待办、材料中心、月度评审和数据中心。
- [x] 常见问题覆盖第 4、9、12、13、17、18 步的易误解点。
- [x] R18 Playwright 场景通过。
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm --filter @feishu-timeline/web build`、`pnpm --filter @feishu-timeline/api build`、`pnpm --filter @feishu-timeline/api prisma:validate`、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。

#### Online Verification
- [x] 已推送 `feat/system-guide-r18`，功能实现提交为 `0807096`。
- [x] 已通过 IAP 隧道部署到 `https://timeline.all-too-well.com`，远端 checkout `0807096`，`pnpm install`、Web/API build、Prisma validate、systemd restart、release verification 和 production acceptance 全部通过。
- [x] `scripts/deploy/health-check.sh DEPLOY_TARGET=production` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，`/api/health` 返回 `200` 且 `status=ok`，关键页面与静态资源返回 200。
- [x] `scripts/deploy/ops-check.sh` 通过：API/Web/Nginx/PostgreSQL/Redis 均 active，80/443/3000/3001/5432/6379 端口监听，磁盘 21%，可用内存 3082MB，证书剩余 50 天。
- [x] 线上 `/guide` 返回 200，页面可未登录访问并展示“系统导览”。
- [x] 线上 Playwright 可见内容检查通过：导航出现“系统导览”，18 步流程完整，网站操作步骤完整，角色指南与常见问题可见，快速入口跳转到 `/projects/timeline`。
- [x] 线上中文化检查通过，未发现明显英文业务文案。
- [x] 线上 1440px 与 390px 截图检查通过，页面低饱和、清晰、移动端可阅读。
- [x] 线上 `/api/health` 返回 `{"status":"ok"}`。

#### Risks / Debt
- 导览页材料说明为文档化清单，后续可与后端节点必交材料配置联动。
- 可后续增加首次登录导览完成状态，避免老用户反复看到新手引导。
- 可后续补充部门培训截图和可下载操作手册。

#### Decision
STOP

#### Next Round
建议继续增强首次登录导览完成状态、导览页截图化培训材料，以及材料清单与后端必交材料配置联动。

### Round R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU

#### Goal
按公司上线前安全准入口径，为正式部署到公司私有云和上架飞书工作台建立 R19 安全检查范围、检查清单、威胁模型和自动化安全脚本基线。当前阶段只做范围确认和脚本准备，不执行全量扫描、不对生产做主动测试。

#### Scope
- 新增 R19 安全范围文档、检查清单和威胁模型。
- 新增 `scripts/security` 基础脚本，覆盖 SAST、SCA、密钥扫描、ZAP baseline、安全响应头、主机检查、构建完整性生成与校验。
- 新增 `docs/rounds/R19.md` 作为下一轮入口。
- 增加 root `package.json` 安全脚本入口。
- 收紧 `.gitignore`，避免 `.env.production`、应用目录环境文件和原始安全扫描报告误入库。
- 不执行全量扫描，不扫描飞书开放平台域名，不扫描公司未授权 IP，不输出任何真实密钥。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/deploy-gce-security.md`
- `scripts/deploy/gce-security-hardening.sh`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/common/app-config.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/feishu/feishu-auth.adapter.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/auth/permissions.guard.ts`
- `apps/api/src/modules/auth/project-access.service.ts`

#### Files Changed
- `.gitignore`
- `package.json`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R19.md`
- `docs/security/SECURITY_SCOPE_R19.md`
- `docs/security/SECURITY_CHECKLIST_R19.md`
- `docs/security/THREAT_MODEL_R19.md`
- `scripts/security/run-sast.sh`
- `scripts/security/run-sca.sh`
- `scripts/security/run-secrets-scan.sh`
- `scripts/security/run-zap-baseline.sh`
- `scripts/security/check-security-headers.sh`
- `scripts/security/host-security-check.sh`
- `scripts/security/generate-build-integrity.sh`
- `scripts/security/check-build-integrity.sh`

#### Commands Run
```bash
git switch -c feat/security-audit-r19
mkdir -p docs/security scripts/security reports/security/{sast,sca,zap,headers,host,integrity}
chmod +x scripts/security/*.sh
bash -n scripts/security/run-sast.sh
bash -n scripts/security/run-sca.sh
bash -n scripts/security/run-secrets-scan.sh
bash -n scripts/security/run-zap-baseline.sh
bash -n scripts/security/check-security-headers.sh
bash -n scripts/security/host-security-check.sh
bash -n scripts/security/generate-build-integrity.sh
bash -n scripts/security/check-build-integrity.sh
```

#### Acceptance Result
- [x] `SECURITY_SCOPE_R19.md` 已覆盖系统名称、业务模块、接口、数据、环境和禁止范围。
- [x] `SECURITY_CHECKLIST_R19.md` 已覆盖主机、SAST、SCA、密钥、DAST、认证、权限、输入输出、文件上传、网页防篡改、业务逻辑和飞书工作台。
- [x] `THREAT_MODEL_R19.md` 已覆盖资产、攻击者、关键威胁、风险分级和安全目标。
- [x] `scripts/security` 基础脚本已建立，默认优先本地目标，远端 DAST / headers 检查需要显式授权。
- [x] 脚本语法检查通过。
- [x] 当前阶段未执行全量扫描，未对飞书平台、公司未授权 IP 或生产环境做主动测试。

#### Risks / Debt
- 飞书 OAuth `state` 当前需要在全量阶段优先复测并补齐一次性服务端校验。
- 附件上传当前需要在全量阶段复测扩展名白名单、文件魔数校验和危险内容响应头。
- 私有云主机 IP、测试账号、飞书后台权限和可用范围需要由用户或公司信息安全负责人确认后再写入最终准入报告。
- `SAST_REPORT_R19.md` 等扫描报告文档尚未生成；需要范围确认后执行对应脚本。

#### Decision
STOP

#### Next Round
等待用户确认 `docs/security/SECURITY_SCOPE_R19.md` 和 `docs/security/SECURITY_CHECKLIST_R19.md` 后，进入 R19 全量扫描、漏洞修复和复测闭环。

### Round R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU_EXECUTION

#### Goal
在 R19 范围确认后执行公司私有云部署与飞书工作台上架前安全检查、自动化扫描、权限/附件/业务逻辑专项测试、漏洞整改和复测闭环，并形成可提交信息安全部门的报告材料。

#### Scope
- 执行基础质量门禁、SAST、SCA、密钥扫描、ZAP baseline、安全响应头、主机检查和网页防篡改检查。
- 修复已确认的 High / Medium 应用安全问题。
- 新增 Feishu OAuth state、权限越权、文件上传、输入输出和业务逻辑安全测试。
- 不对飞书开放平台域名、公司未授权 IP 或生产环境执行主动扫描。
- 私有云主机和飞书后台配置因未提供授权证据，仅做代码/本地和待确认项记录。

#### Inputs Read
- `/Users/lixiaochen/Desktop/anquan.md`
- `AGENTS.md`
- `docs/security/SECURITY_SCOPE_R19.md`
- `docs/security/SECURITY_CHECKLIST_R19.md`
- `docs/security/THREAT_MODEL_R19.md`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/session-store.service.ts`
- `apps/api/src/modules/feishu/feishu-auth.adapter.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/src/modules/auth/project-access.service.ts`
- `apps/api/src/modules/workflows/workflow-node.constants.ts`
- `apps/api/src/modules/fees/fees.rules.ts`
- `apps/api/src/modules/reviews/reviews.rules.ts`
- `apps/api/src/modules/color-exits/color-exits.rules.ts`
- `apps/web/next.config.ts`
- `scripts/security/*.sh`

#### Files Changed
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.service.spec.ts`
- `apps/api/src/modules/auth/session-store.service.ts`
- `apps/api/src/modules/attachments/attachments.rules.ts`
- `apps/api/src/modules/attachments/attachments.rules.spec.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/attachments/attachments.service.spec.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`
- `apps/api/test/security/r19-permission-security.spec.ts`
- `apps/api/test/security/r19-api-input-security.spec.ts`
- `apps/api/test/security/r19-business-logic-security.spec.ts`
- `apps/api/test/security/r19-file-upload-security.spec.ts`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/web/next.config.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/shared/package.json`
- `pnpm-lock.yaml`
- `scripts/security/run-sast.sh`
- `scripts/security/run-sca.sh`
- `scripts/security/run-secrets-scan.sh`
- `scripts/security/run-zap-baseline.sh`
- `scripts/security/check-security-headers.sh`
- `scripts/security/host-security-check.sh`
- `scripts/security/generate-build-integrity.sh`
- `docs/security/*.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm --filter @feishu-timeline/web exec playwright install chromium
pnpm playwright:test
bash scripts/security/run-sast.sh
bash scripts/security/run-sca.sh
bash scripts/security/run-secrets-scan.sh
TARGET_URL=http://host.docker.internal:3000 bash scripts/security/run-zap-baseline.sh
BASE_URL=http://localhost:3000 bash scripts/security/check-security-headers.sh
bash scripts/security/host-security-check.sh
bash scripts/security/generate-build-integrity.sh
bash scripts/security/check-build-integrity.sh
```

#### Acceptance Result
- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、API/Web build、`pnpm test:e2e`、`pnpm playwright:test` 全部通过。
- [x] `pnpm test` 通过：Web 20 files / 61 tests，API 48 files / 129 tests。
- [x] SAST 通过：Semgrep 0 findings；dangerous grep 均分诊为 Info / positive controls / test runners。
- [x] SCA 通过：`pnpm audit`、OSV、Trivy fs 均无 High/Critical；Docker image scan 因本地未构建镜像而跳过。
- [x] 密钥扫描通过：gitleaks current tree 和 git history 均 no leaks found。
- [x] ZAP baseline 在本地 production build 上无 Critical/High；CSP inline 类 Medium 已记录为后续 hardening。
- [x] Feishu OAuth state 已改为服务端保存、TTL、一次性消费并补测试。
- [x] 附件上传已补扩展名、MIME、魔数、路径穿越和响应头校验并补测试。
- [x] 权限、输入输出、文件上传、业务逻辑 R19 专项测试已新增并通过。
- [x] 本地 build integrity manifest 生成与复核通过。

#### Findings Summary
- Critical：0
- High：3，全部修复并复测
- Medium：3，其中 2 个修复，1 个 CSP inline hardening 延期
- Low：1，接受
- Info：6，接受或等待外部证据

#### Risks / Debt
- 公司私有云 IP / 主机访问 / 主机安全平台证据未提供，无法给私有云主机安全 PASS。
- 飞书后台权限、redirect URL、可用范围、通讯录范围和发布审核证据未提供，无法给飞书上架 PASS。
- Docker 镜像未在本地构建，Trivy image scan 待私有云镜像产物生成后执行。
- CSP 仍允许 inline script/style，建议后续引入 nonce/hash 或框架级 CSP hardening。
- 未提供 staging URL，未执行认证后 staging DAST。

#### Decision
STOP

#### Next Round
由用户或公司 IT / 飞书管理员补充私有云主机证据、Feishu 后台配置证据、staging URL 和镜像产物后，执行 R19 复审；证据齐全且无新 Critical/High 后再将上线建议从 `FAIL` 调整为 `PASS_WITH_RISK_ACCEPTANCE` 或 `PASS`。

### Round R20_REAL_WORLD_UAT_AUTOMATION

#### Goal
用 Playwright 操作真实网页，模拟营销、涂装工艺、采购、质量、生产、财务、项目经理、普通查看者和未登录用户，完整验证定制颜色开发系统的真实业务流程、权限边界、材料平台、数据中心和 UI 可用性，并对发现问题完成修复与复测。

#### Scope
- 新增 R20 测试计划、测试用例、运行报告、问题修复记录和最终验收文档。
- 新增 13 条 R20 Playwright 浏览器级 UAT 用例，覆盖核心页面、项目创建、第 1-18 步关键规则、材料、权限、数据中心和 UI。
- 新增 `pnpm playwright:test:r20`，支持只跑 R20 专项用例。
- 增加普通查看者 `viewer` 角色，用于真实只读权限验证。
- 补稳定 `data-testid`，降低业务页面浏览器测试脆弱性。
- 修复移动端时间线横向溢出风险。
- 修复 R16 / regression 月度评审断言在多 UAT 项目并存时的误判。
- 本轮完整写入测试仅在 local 执行，未对生产执行写入测试。

#### Inputs Read
- `/Users/lixiaochen/Desktop/ceshi.md`
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `apps/web/tests/playwright/r16-fixtures.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/app/globals.css`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/prisma/seed.ts`

#### Files Changed
- `.gitignore`
- `package.json`
- `apps/api/prisma/seed.ts`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/auth.constants.spec.ts`
- `apps/web/package.json`
- `apps/web/playwright.config.mjs`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/project-workflow-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/system-guide-page.tsx`
- `apps/web/src/lib/auth-client.ts`
- `apps/web/tests/playwright/r16-business-flow.spec.ts`
- `apps/web/tests/playwright/regression.spec.ts`
- `apps/web/tests/playwright/r20-fixtures.ts`
- `apps/web/tests/playwright/r20-guide-dashboard.spec.ts`
- `apps/web/tests/playwright/r20-create-project.spec.ts`
- `apps/web/tests/playwright/r20-process-mainline.spec.ts`
- `apps/web/tests/playwright/r20-parallel-after-step6.spec.ts`
- `apps/web/tests/playwright/r20-nonblocking-step9.spec.ts`
- `apps/web/tests/playwright/r20-step12-rework.spec.ts`
- `apps/web/tests/playwright/r20-fee-fixed-10000.spec.ts`
- `apps/web/tests/playwright/r20-batch-to-monthly-review.spec.ts`
- `apps/web/tests/playwright/r20-color-exit.spec.ts`
- `apps/web/tests/playwright/r20-materials.spec.ts`
- `apps/web/tests/playwright/r20-permissions.spec.ts`
- `apps/web/tests/playwright/r20-analytics-consistency.spec.ts`
- `apps/web/tests/playwright/r20-ui-quality.spec.ts`
- `docs/testing/R20_REAL_WORLD_UAT_PLAN.md`
- `docs/testing/R20_TEST_CASES.md`
- `docs/testing/R20_TEST_RUN_REPORT.md`
- `docs/testing/R20_ISSUES_AND_FIXES.md`
- `docs/testing/R20_FINAL_ACCEPTANCE.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/real-world-uat-r20
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep @r20 --list
rm -rf test-results/r20
pnpm playwright:test:r20
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-009|R20-007|R20-005|R20-011|R20-013"
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-005"
pnpm --filter @feishu-timeline/web exec playwright test --config playwright.config.mjs --grep "R20-011"
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/web build
pnpm test:e2e
pnpm playwright:test
pnpm playwright:test:r20
```

#### Acceptance Result
- [x] R20 专项测试清单识别 13 条用例。
- [x] `pnpm install` 通过。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 20 files / 61 tests，API 48 files / 130 tests。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/web build` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：28 passed。
- [x] `pnpm playwright:test:r20` 通过：13 passed。
- [x] 第 4 步完成后仅自动并行创建第 5 步和第 6 步。
- [x] 第 6 步完成后仅自动并行创建第 7 步、第 9 步和第 10 步。
- [x] 第 9 步未完成时主线仍可推进到第 12 步。
- [x] 第 12 步不通过必须填写原因，并退回第 11 步新轮次；第二轮通过后生成第 13、14 步。
- [x] 第 13 步固定 10000 元，且不阻塞第 14、15、16 步。
- [x] 第 16 步完成后当前项目生成 12 个月度评审实例。
- [x] 第 18 步按年产量给出建议，最终结论由人工确认。
- [x] 材料提交平台上传、归档、下载、元数据和权限校验通过。
- [x] 多角色权限、未登录访问和跨部门受限项目 IDOR smoke 通过。
- [x] 数据中心统计一致性通过。
- [x] UI 中文化、状态颜色、抽屉交互、1440px / 1920px / 移动端基本可读性通过。

#### Evidence
- `test-results/r20/screenshots/`：33 个截图文件。
- `test-results/r20/api-snapshots/`：8 个 API / 页面快照。
- `test-results/r20/exported-test-records/`：13 个结构化用例记录。
- `test-results/r20/traces/`：34 个 trace 附件 / 截图附件。
- `docs/testing/R20_TEST_RUN_REPORT.md`
- `docs/testing/R20_FINAL_ACCEPTANCE.md`

#### Issues Fixed
- 第 18 步颜色退出测试补齐必填退出日期和生效日期。
- 第 13 步收费测试在财务校验后切回项目经理推进主线。
- R20 mock 登录用户名改为角色维度稳定值，避免切换角色后项目可见性不稳定。
- 移动端时间线容器补响应式约束，修复横向溢出风险。
- R16 / regression 月度评审断言改为当前项目作用域，避免多个 UAT 项目并存误判。
- R20 权限 IDOR smoke 改为使用 seed 演示项目验证跨部门受限访问。

#### Risks / Debt
- 本轮完整写入 UAT 仅在 local 执行，未覆盖 staging / 生产网络、域名、证书、Nginx 和真实飞书入口。
- 本轮使用本地 mock-login 角色，不代表真实飞书企业自建应用授权链路。
- `test-results/` 证据目录为本地运行产物，不入库；交付给业务或测试人员时需从执行机器导出。
- R20 测试项目保留为证据数据，后续可按 `UAT-R20-` 前缀归档或清理。

#### Decision
CONTINUE

#### Next Round
建议进入 staging 部署验证和业务人工验收；不建议跳过 staging 直接在生产环境执行写入型 UAT。

---

### Round R21_FLOW_MAP_REALTIME_PROGRESS

#### Goal
将用户提供的轻卡颜色开发流程图升级为单项目“项目实时流程地图”，在不改变已冻结业务状态机和流程规则的前提下，让项目经理一眼识别 18 个节点的当前进度、并行支线、退回路径、风险节点、责任人、材料进度和下一步动作。

#### Scope
- 新增单项目实时流程地图页面 `/projects/:projectId/flow-map`。
- 新增后端聚合接口 `GET /api/projects/:projectId/flow-map`，避免前端拼装大量散接口。
- 在项目列表、项目时间线看板、项目上下文导航和工作台风险项目中增加流程地图入口。
- 保留第 4 / 6 步并行、第 9 / 13 步非阻塞、第 12 步退回、第 17 步 12 个月评审、第 18 步退出治理等冻结规则。
- 增加 30 秒地图轮询、15 秒抽屉轮询、手动刷新、风险筛选和节点点击抽屉。
- 补充组件测试与 Playwright 浏览器回归。
- 新增 R21 文档并更新执行账本。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `/Users/lixiaochen/Desktop/R21_FLOW_MAP_REALTIME_PROGRESS_Codex执行提示词.md`
- `/Users/lixiaochen/Desktop/ditu.md`
- `/Users/lixiaochen/Desktop/20260519-102141.png`
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/task-detail-drawer.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/tests/playwright/regression.spec.ts`

#### Files Changed
- `apps/api/src/modules/projects/projects.controller.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/projects/[projectId]/flow-map/page.tsx`
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/components/flow-map-workspace.test.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/monthly-reviews-board.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/projects-client.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `docs/FLOW_MAP_REALTIME_PROGRESS_R21.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/flow-map-realtime-r21
pnpm --filter @feishu-timeline/web test -- flow-map-workspace.test.tsx
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/r21-flow-map-realtime-progress.spec.ts --config playwright.config.mjs
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/regression.spec.ts:134 --config playwright.config.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] 用户可见流程地图页面为中文 UI，无明显英文业务占位文案。
- [x] 项目详情新增“流程地图”页面，保留用户流程图拓扑。
- [x] 每个项目节点可显示步骤号、节点名称、状态颜色、负责人、截止时间、逾期天数、材料进度。
- [x] 第 12 步展示评审通过 / 退回路径和轮次信息。
- [x] 第 13 步展示固定 10000 元与非阻塞属性。
- [x] 第 17 步展示 12 个月整车色差一致性评审进度。
- [x] 第 18 步展示年产量、退出阈值、系统建议和人工结论。
- [x] 节点点击可打开工序详情抽屉，URL `taskId` 可恢复。
- [x] 风险筛选、主线筛选、我的任务筛选和未完成筛选可用。
- [x] 流程地图每 30 秒自动刷新，工序抽屉每 15 秒自动刷新，手动刷新可用。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 21 files / 65 tests，API 48 files / 130 tests。
- [x] `pnpm --filter @feishu-timeline/web build` 通过，包含 `/projects/[projectId]/flow-map`。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/api prisma:validate` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：29 passed。

#### Evidence
- `docs/FLOW_MAP_REALTIME_PROGRESS_R21.md`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `apps/web/src/components/flow-map-workspace.test.tsx`
- `test-results/r20/traces/`：Playwright 全量回归产物。

#### Issues Fixed
- R21 新增用例首次断言“最近更新”失败：将流程地图顶部最近更新时间拆为独立中文文案，并按 `YYYY-MM-DD HH:mm:ss` 输出。
- 全量 Playwright 发现月度评审页存在重复同名标题导致严格定位冲突：保留顶栏页面名，页面内卡片标题改为“月度评审进度总览”。

#### Risks / Debt
- 流程地图当前采用固定拓扑坐标，后续可补缩放、拖拽和平移。
- 实时刷新采用轮询，满足本轮要求；多人协同提醒可延期接 SSE / WebSocket。
- 全局多项目流程地图仍以现有时间线看板为主，本轮重点完成单项目实时流程地图。

#### Decision
STOP

#### Next Round
建议 R22 聚焦生产环境真实项目演示数据、流程地图截图证据归档，以及根据业务评审反馈优化节点密度、缩放和平移体验。

---

### Round R21B_FLOW_MAP_PRODUCTION_VISIBILITY_FIX

#### Goal
修复 R21 项目实时流程地图“已部署但线上用户看不到入口”的问题，确保用户无需知道项目 ID 也能从导航进入流程地图，并且线上未登录或接口失败时不再长期停留在 loading 状态。

#### Scope
- 复现生产域名 `/dashboard`、`/projects`、`/projects/timeline`、`/projects/flow-map` 的可见性问题。
- 检查 VPS 当前 commit、`.next` 构建和生产服务状态。
- 新增 `/projects/flow-map` 全局流程地图入口。
- 顶部导航和侧边导航新增“流程地图”。
- 修复项目列表、时间线看板、单项目流程地图在未登录 / 接口失败时的中文失败态。
- 更新 R21 Playwright，覆盖 `/projects/flow-map` 全局入口。
- 新增 R21B 文档并更新本账本。

#### Inputs Read
- `/Users/lixiaochen/Desktop/map1.mk`
- `docs/EXECUTION_LEDGER.md`
- `apps/web/src/components/auth-provider.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- 生产域名：`https://timeline.all-too-well.com/dashboard`
- 生产域名：`https://timeline.all-too-well.com/projects`
- 生产域名：`https://timeline.all-too-well.com/projects/timeline`
- 生产域名：`https://timeline.all-too-well.com/projects/flow-map`

#### Files Changed
- `apps/web/src/app/projects/flow-map/page.tsx`
- `apps/web/src/components/projects-flow-map-portal.tsx`
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/components/project-timeline-board.tsx`
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/lib/navigation.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `docs/FLOW_MAP_PRODUCTION_VISIBILITY_R21B.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/web exec node <production visibility check>
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web test -- flow-map-workspace.test.tsx route-smoke.test.tsx
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/r21-flow-map-realtime-progress.spec.ts --config playwright.config.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] VPS R21 复现确认：远端运行 commit `d035709`，`.next` 中存在 `/projects/[projectId]/flow-map` 和 `FlowMapWorkspace`。
- [x] 修复前确认 `/projects/flow-map` 会被动态项目路由误识别为 `projectId=flow-map`。
- [x] 新增 `/projects/flow-map` 全局入口页面。
- [x] 顶部导航和侧边导航可见“流程地图”。
- [x] 项目列表行操作保留“流程地图”入口。
- [x] 项目时间线卡片入口文案调整为“查看流程地图”。
- [x] 单项目流程地图接口失败时显示中文失败态和“重新加载 / 登录系统”按钮。
- [x] 项目时间线看板未登录或接口失败时显示中文失败态。
- [x] 项目列表未登录、接口失败、无项目时分别显示中文状态与操作按钮。
- [x] R21 Playwright 覆盖 `/projects/flow-map` 全局入口、项目选择器和 18 节点流程地图。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 21 files / 65 tests，API 48 files / 130 tests。
- [x] `pnpm --filter @feishu-timeline/web build` 通过，包含 `/projects/flow-map`。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/api prisma:validate` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：29 passed。

#### Evidence
- `docs/FLOW_MAP_PRODUCTION_VISIBILITY_R21B.md`
- `test-results/r21b/prod-dashboard.png`
- `test-results/r21b/prod-projects.png`
- `test-results/r21b/prod-timeline.png`
- `test-results/r21b/prod-flow-map.png`
- `test-results/r21b/prod-before-summary.json`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`

#### Issues Fixed
- 仅有 `/projects/:projectId/flow-map`，无全局入口，导致用户不知道项目 ID 时找不到流程地图。
- `/projects/flow-map` 修复前会落入动态项目路由，展示错误的项目工作区上下文。
- `FlowMapWorkspace` 与 `ProjectTimelineBoard` 在接口失败且无 payload 时会继续显示 loading。
- 项目列表接口失败和空态缺少明确操作按钮。

#### Risks / Debt
- 生产域名 Playwright 当前为未登录视角，无法直接点击真实项目节点抽屉；需要后续配置可用的生产验收账号或测试租户。
- `/projects/flow-map` 登录后默认选择最近更新项目；后续可增加“最近项目”快捷卡片和收藏项目。

#### Decision
STOP

#### Next Round
建议配置生产验收账号后补一条登录态生产 Playwright，覆盖“选择真实项目 -> 打开流程地图 -> 点击节点抽屉”的完整线上链路。

---

### Round R21C_FLOW_MAP_PRODUCTION_ACCESS_AND_DATA_FIX

#### Goal
修复生产域名 `/projects/flow-map` 已可见但登录后显示“项目实时流程地图加载失败 / 无权访问该功能”的问题，确保飞书账号具备最小只读权限，并为线上演示补齐可查看的流程地图项目数据。

#### Scope
- 复现并检查生产库用户、角色和项目数量。
- 修复飞书新用户 / 无角色老用户登录时没有任何角色导致 `project.read` 403 的问题。
- 保持只读默认权限，不授予流程流转、附件管理或项目写权限。
- 补充 API 单元测试覆盖飞书默认角色分配。
- 生产运行受控 seed，补齐流程模板、角色权限、演示用户和演示项目。
- 将现有飞书用户作为只读观察者加入演示项目，保证真实登录账号可查看流程地图。

#### Inputs Read
- 用户截图：生产 `/projects/flow-map` 显示“无权访问该功能”
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/auth/permissions.guard.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/prisma/seed.ts`
- 生产数据库只读检查：用户 4 个、项目 0 个、飞书用户角色数均为 0

#### Files Changed
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.service.spec.ts`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm --filter @feishu-timeline/api lint
pnpm --filter @feishu-timeline/api typecheck
pnpm --filter @feishu-timeline/api test -- users.service.spec.ts auth.constants.spec.ts
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
GIT_REF=feat/flow-map-realtime-r21 RUN_PRISMA_MIGRATE_DEPLOY=no RUN_RELEASE_VERIFY=yes RUN_PRODUCTION_ACCEPTANCE=yes bash scripts/deploy/gce-redeploy.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'cd /opt/feishu_timeline_app/apps/api && . .env.production && pnpm exec tsx prisma/seed.ts'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command '<Prisma observer grant script>'
pnpm --filter @feishu-timeline/web exec node <production authenticated flow-map Playwright check>
```

#### Acceptance Result
- [x] 确认生产库无项目，且飞书用户没有角色，是流程地图 403 的直接原因。
- [x] 飞书用户无角色时自动补“普通查看者”角色。
- [x] “普通查看者”仅包含 `project.read` 与 `dashboard.read`，不包含写操作或流程流转权限。
- [x] 已有角色用户不被覆盖。
- [x] API lint / typecheck / 相关单测 / build / prisma validate 通过。
- [x] 生产已部署 commit `bcad035`，release verify / production acceptance 通过。
- [x] 生产 seed 后项目数为 2，包含进行中和已完成演示项目。
- [x] 4 个现有飞书用户均补为 `viewer` 角色，并作为观察者加入演示项目。
- [x] 临时生产登录态 Playwright 打开 `/projects/flow-map`，不再出现“加载失败 / 无权访问”，页面显示演示项目和 18 个流程地图节点。

#### Evidence
- 生产接口临时会话验证：`/api/auth/session` 返回 `roles=["viewer"]`、`permissions=["project.read","dashboard.read"]`。
- 生产接口临时会话验证：`/api/projects` 返回 `total=2`。
- 生产接口临时会话验证：`/api/projects/:projectId/flow-map` 返回 `nodes=18`。
- `test-results/r21c/prod-flow-map-authenticated.png`

#### Risks / Debt
- 生产演示数据属于 MVP/UAT 展示数据，正式接入真实业务前应明确演示数据保留策略。
- 默认飞书角色为只读查看者；真实项目仍需由管理员加入项目成员或设置同部门范围后才能访问。

#### Decision
STOP

#### Next Round
建议补一个生产管理员配置入口，用于给飞书用户分配角色和项目观察者权限，避免以后依赖运维脚本处理真实账号授权。

---

### Round R21C_FLOW_MAP_UI_REFINEMENT

#### Goal
按 `/Users/lixiaochen/Desktop/map2.md` 提示词重构项目实时流程地图 UI 排版，让 `/projects/flow-map` 和 `/projects/:projectId/flow-map` 进入后直接显示清晰、完整、可读的实时流程图。

#### Scope
- 不改变业务状态机、流程流转、权限规则或后端接口语义。
- 移除左侧常驻控制台，改为顶部工具栏和“图例 / 筛选”弹层。
- 按固定业务拓扑坐标重排 18 个节点，默认自适应屏幕宽度。
- 将第 12 步菱形节点压缩并去除文字旋转，避免遮挡第 14 步。
- 将所有连线调整为正交折线，去除长斜线和大面积交叉。
- 新增 R21C Playwright 截图与布局断言。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/FLOW_MAP_REALTIME_PROGRESS_R21.md`
- `docs/FLOW_MAP_PRODUCTION_VISIBILITY_R21B.md`
- `/Users/lixiaochen/Desktop/map2.md`
- 用户截图：生产流程地图出现侧栏挤压、节点遮挡和斜线混乱
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/tests/playwright/helpers.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`

#### Files Changed
- `apps/web/src/components/flow-map-workspace.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/r21c-flow-map-ui-refinement.spec.ts`
- `apps/web/tests/playwright/r21-flow-map-realtime-progress.spec.ts`
- `docs/FLOW_MAP_UI_REFINEMENT_R21C.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
git switch -c feat/flow-map-ui-refinement-r21c
pnpm --filter @feishu-timeline/web lint
pnpm --filter @feishu-timeline/web typecheck
pnpm --filter @feishu-timeline/web test -- flow-map-workspace.test.tsx
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/r21-flow-map-realtime-progress.spec.ts --config playwright.config.mjs
pnpm --filter @feishu-timeline/web exec playwright test e2e/r21c-flow-map-ui-refinement.spec.ts --config playwright.config.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

#### Acceptance Result
- [x] `/projects/flow-map` 全局入口可选择项目并显示 18 个流程节点。
- [x] `/projects/:projectId/flow-map` 显示顶部工具栏、状态栏和完整地图。
- [x] 左侧常驻控制台已移除，筛选与图例迁移到顶部弹层。
- [x] 画布默认自适应屏幕宽度，避免普通笔记本首屏被侧栏挤压。
- [x] 第 12 步“样车驾驶室评审”文字不旋转，且不遮挡第 14 步。
- [x] 第 17 步月度评审进度和第 18 步颜色退出节点继续可见。
- [x] 节点详情抽屉点击、URL `taskId` 恢复和移动端基础布局通过 Playwright 验证。
- [x] 所有连线通过正交折线断言，无长斜线。
- [x] `pnpm lint` 通过。
- [x] `pnpm typecheck` 通过。
- [x] `pnpm test` 通过：Web 21 files / 65 tests，API 49 files / 132 tests。
- [x] `pnpm --filter @feishu-timeline/web build` 通过，包含 `/projects/flow-map` 与 `/projects/[projectId]/flow-map`。
- [x] `pnpm --filter @feishu-timeline/api build` 通过。
- [x] `pnpm --filter @feishu-timeline/api prisma:validate` 通过。
- [x] `pnpm test:e2e` 通过。
- [x] `pnpm playwright:test` 通过：30 passed。
- [x] GitHub 分支 `feat/flow-map-ui-refinement-r21c` 已推送。
- [x] 生产已部署提交 `cee427f`，release verify / production acceptance 通过。
- [x] 生产健康检查通过，`https://timeline.all-too-well.com/api/health` 返回 `status=ok`。
- [x] 生产运维检查通过：API、Web、Nginx、PostgreSQL、Redis 均 active。
- [x] 生产登录态 Playwright 验证通过：18 节点可见、顶部工具栏可见、左侧常驻控制台不再渲染、节点抽屉可加载详情。

#### Evidence
- `docs/FLOW_MAP_UI_REFINEMENT_R21C.md`
- `apps/web/e2e/r21c-flow-map-ui-refinement.spec.ts`
- `test-results/r21c/filter-popover.png`
- `test-results/r21c/flow-map-1440.png`
- `test-results/r21c/flow-map-1920.png`
- `test-results/r21c/task-drawer.png`
- `test-results/r21c/flow-map-mobile.png`
- `test-results/r21c/prod-flow-map-1440.png`
- `test-results/r21c/prod-flow-map-1920.png`
- `test-results/r21c/prod-task-drawer-loaded.png`

#### Issues Fixed
- 全量 Playwright 首次发现旧 R21 用例仍查找左侧常驻控制台文案；已改为打开“图例 / 筛选”弹层后断言当前显示节点数量。
- 移动端适应屏幕模式最小缩放过高，导致主线默认横向裁切；已将适配缩放下限调整为窄屏可完整看到流程地图缩略图。

#### Risks / Debt
- 画布仍为固定业务拓扑坐标，后续可增加拖拽平移、节点搜索和定位能力。
- 本轮重点修复流程地图 UI 混乱问题，未新增后端业务能力。
- 生产登录态截图已手工归档，后续可沉淀为固定 CI / CD 验收脚本。

#### Decision
STOP

#### Next Round
建议 R22 聚焦生产管理员配置入口、真实账号授权可视化，以及流程地图节点搜索 / 定位增强。

---

### Round R19B_VENDOR_SAST_RECONCILIATION_AND_REMEDIATION

#### Goal
对 2026-07-10 厂商 SAST-TS 报告完成逐项归因，修复当前仓库内已确认的全部安全漏洞和 fail-open 门禁，并形成可复现的本地安全审核结论。

#### Scope
- 对账厂商 PDF 的 156 项 Medium/未确认结果。
- 修复完整/生产依赖图漏洞。
- 收紧六个 multipart 上传入口。
- 修复 Mock 登录、OAuth state、锁定用户、会话存储和限流问题。
- 为 Next.js 增加每请求 nonce CSP，并保护登录回调。
- 重建 SAST、SCA、Secrets、制品、镜像、Header 和 ZAP fail-closed 门禁。
- 加固 API/Web 生产镜像和 staging 部署前校验。
- 执行全量质量、安全和浏览器回归，发布审核报告。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R19.md`
- `docs/rounds/R19B.md`
- `/Users/lixiaochen/Downloads/轻卡新颜色开发项目管理系统_前端_SAST-TS.pdf`
- 当前 Git 索引、非忽略未跟踪源码、lockfile、Dockerfile、CI 和部署脚本

#### Main Files Changed
- `apps/api/src/common/file-upload-options.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/session-store.service.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/login/callback/login-callback-client.tsx`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `.github/workflows/ci.yml`
- `deploy/compose.staging.yml`
- `scripts/deploy/common.sh`
- `scripts/deploy/staging-up.sh`
- `scripts/security/*`
- `docs/security/VENDOR_SAST_TRIAGE_R19B.md`
- `docs/security/SECURITY_AUDIT_REPORT_R19B.md`
- `docs/rounds/R19B.md`
- `docs/EXECUTION_LEDGER.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
pnpm security:sast
pnpm security:sca
pnpm security:secrets
bash scripts/security/check-production-build-artifacts.sh
bash scripts/security/tests/security-gates.test.sh
docker build --pull -t feishu-timeline-api:r19b-final -f apps/api/Dockerfile .
docker build --pull -t feishu-timeline-web:r19b-final -f apps/web/Dockerfile .
bash scripts/security/scan-production-images.sh feishu-timeline-api:r19b-final feishu-timeline-web:r19b-final
BASE_URL=http://127.0.0.1:3300 bash scripts/security/check-security-headers.sh
TARGET_URL=http://host.docker.internal:3300 ZAP_MINUTES=2 bash scripts/security/run-zap-baseline.sh
pnpm security:integrity:generate
pnpm security:integrity:check
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config
git diff --check
```

#### Acceptance Result
- [x] 156 个厂商结果全部归因：134 个依赖目录、22 个生成目录、0 个自研源码。
- [x] Semgrep：347 个候选文件、83 条规则、0 finding、0 scanner error。
- [x] 完整和生产依赖审计：所有严重度为 0。
- [x] Gitleaks：当前工作树与完整 Git 历史为 0。
- [x] API/Web 最终镜像 Trivy：所有严重度为 0。
- [x] 六个 multipart 路由均在业务处理前限制大小、数量与复杂度。
- [x] 生产 Mock 登录、OAuth state、锁定用户、Redis 故障和限流 fail-open 已修复。
- [x] 生产 CSP、回调 URL 清理、no-referrer/no-store 已验证。
- [x] Web 生产构建、API build、Prisma validate 和 105 文件完整性复核通过。
- [x] Header 9/9 PASS；ZAP Critical/High/Medium 为 0。
- [x] 单测 Web 67/API 151、E2E、Playwright 30/30 和安全门禁负向测试通过。
- [x] 安全审核报告已生成并区分本地 PASS 与外部 BLOCKED。

#### Evidence
- `docs/security/SECURITY_AUDIT_REPORT_R19B.md`
- `docs/security/VENDOR_SAST_TRIAGE_R19B.md`
- `docs/security/SAST_REPORT_R19.md`
- `docs/security/SCA_REPORT_R19.md`
- `docs/security/SECRETS_SCAN_R19.md`
- `docs/security/SECURITY_HEADERS_R19.md`
- `docs/security/DAST_ZAP_REPORT_R19.md`
- `docs/security/WEB_TAMPER_PROTECTION_R19.md`
- `reports/security/image-sca/summary.md`

#### Risks / Debt
- 当前工作树尚未形成干净、不可变的最终 commit；合并前必须在干净 commit 上复跑 CI。
- SAST 主规则集未覆盖全部普通 JS/MJS、Shell、Workflow 和 Dockerfile。
- PostgreSQL、Redis、Nginx 基础设施镜像尚未固定 digest 并纳入 Trivy 门禁。
- 上传仍采用内存缓冲，需补并发限制、Nginx `limit_conn` 和容器内存上限。
- 私有云、真实 HTTPS/HSTS、飞书管理后台、认证态 staging DAST、最终发布镜像和部署权限证据仍缺失。

#### Decision
`LOCAL_SECURITY_REMEDIATION_PASS / EXTERNAL_PRODUCTION_ACCEPTANCE_BLOCKED`

#### Next Round
`STOP`。先完成干净 commit CI、私有云/飞书证据、认证态 staging DAST 和实际 registry digest 验证，再决定生产放行。

---

### Round R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION — Gate 0

#### Goal
在不修改产品代码的前提下，将 12 页 Apple 风产品 UI 设计稿转化为可执行的页面规范、路由/组件/API 映射和当前系统差异清单，并在设计闸门停止等待确认。

#### Scope
- 将 PPT、R22 主执行提示词和冻结流程图归档到仓库。
- 将 12 页 PPT 逐页导出为 1920×1080 PNG，并生成总览图。
- 逐页解析页面目标、布局、字体/留白、主动作、路由、API 和当前差异。
- 审计现有导航、样式、工作台、项目、流程图、任务、材料、复盘和后台页面。
- 明确保留、重构、合并、隐藏的路由与组件。
- 更新本执行账本并在 Gate 0 停止。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/WORKFLOW_RULE_FREEZE.md`
- `docs/UI_REFINEMENT_R13.md`
- `docs/security/SECURITY_ACCEPTANCE_R19.md`
- `docs/rounds/R19.md`
- `docs/rounds/R19B.md`
- `/Users/lixiaochen/Downloads/R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION_Codex_MASTER_PROMPT.md`
- `/Users/lixiaochen/Downloads/轻卡定制色开发系统_Apple风产品UI设计稿.pptx`
- `/Users/lixiaochen/Downloads/定制颜色开发流程图.pdf`
- 当前 `apps/web`、`apps/api`、`packages/shared` 与 Prisma 路由、组件、接口和数据模型
- 既有 R20/R21C 浏览器截图证据

#### Main Files Changed
- `docs/design/轻卡定制色开发系统_Apple风产品UI设计稿.pptx`
- `docs/design/R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION_Codex_MASTER_PROMPT.md`
- `docs/design/定制颜色开发流程图.pdf`
- `docs/design/r22-ppt-render/slide-01.png` ～ `slide-12.png`
- `docs/design/r22-ppt-render/contact-sheet.png`
- `docs/design/PPT_UI_ANALYSIS_R22.md`
- `docs/design/PPT_SLIDE_ROUTE_MATRIX_R22.md`
- `docs/EXECUTION_LEDGER.md`

本轮没有修改 `apps/web`、`apps/api`、`packages/shared`、Prisma schema 或 migration。

#### Commands Run
```bash
git switch -c feat/apple-style-product-ui-r22
python render_slides.py docs/design/轻卡定制色开发系统_Apple风产品UI设计稿.pptx
python create_montage.py --input_dir docs/design/r22-ppt-render --output_file docs/design/r22-ppt-render/contact-sheet.png
python slides_test.py docs/design/轻卡定制色开发系统_Apple风产品UI设计稿.pptx
shasum -a 256 <源 PPT/提示词及仓库副本>
rg --files apps/web apps/api packages/shared
rg <路由、导航、流程、任务、附件、评审、日志、Prisma 关键字>
```

#### Acceptance Result
- [x] PPT 12 页全部导出，文件名为 `slide-01.png` ～ `slide-12.png`，尺寸均为 1920×1080。
- [x] 已逐张全尺寸检查，并通过演示文稿越界检查；未发现裁切或溢出。
- [x] 仓库 PPT 与源文件 SHA-256 一致：`9b58a59fc56d8cec4756a40dacc701cb610e3d3775ce2157764b9e3094d36b27`。
- [x] 仓库主提示词与源文件 SHA-256 一致：`666150219899ebf9c274b8000aaedc2e227451a6221821098b4f5375baac3bba`。
- [x] `PPT_UI_ANALYSIS_R22.md` 已覆盖 12 页的目标、布局、字体/留白、主动作、路由、API 与现状差异。
- [x] `PPT_SLIDE_ROUTE_MATRIX_R22.md` 已完成目标 IA、路由/组件/API 映射和保留/重构/合并/隐藏清单。
- [x] 已确认当前最大结构差异：三套导航并存、正文小字号与密集表格、项目根路由不是真正工作区、缺少可追溯进展记录与生命周期复盘。
- [x] 已保留 R19 安全边界：本轮未改 OAuth、上传验证、权限、依赖、部署或数据库模型。
- [x] 已在 Gate 0 停止，没有提前实现页面或部署。

#### Evidence
- `docs/design/r22-ppt-render/contact-sheet.png`
- `docs/design/PPT_UI_ANALYSIS_R22.md`
- `docs/design/PPT_SLIDE_ROUTE_MATRIX_R22.md`
- `docs/design/R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION_Codex_MASTER_PROMPT.md`

#### Risks / Debt
- 当前分支继承了切分支前未提交的 R19B 安全整改工作树；R22 后续必须精确区分改动并保留全部安全修复，不能用破坏性 Git 操作清理。
- R19/R19B 的外部生产安全证据仍未闭环，R22 的视觉门禁不能替代生产安全放行。
- R21C 曾向生产补演示项目和查看权限；R22 发布前必须清理、隔离或明确转换为测试租户，生产不得保留演示文案和假数据。
- 当前模型没有独立、可重复且不可覆盖的进展记录，也没有生命周期复盘模型；后续若确认实现，必须同步 Prisma schema、migration、API、审计和权限测试。
- 当前附件安全链路可复用，但任务—材料要求、版本和状态关联不足；不得以放宽校验换取上传体验。
- Gate 0 是设计文档轮，未运行 `pnpm lint/typecheck/test/build`；代码实现轮必须按 `AGENTS.md` 执行完整检查。

#### Decision
`GATE_0_COMPLETE / STOP_FOR_DESIGN_CONFIRMATION`

#### Next Round
仅在用户确认设计闸门和矩阵中的产品选择后进入 Gate 1～3：建立全局设计系统、收敛导航，实现工作台、项目工作区与进展提交面板，并生成 1440/1024/390 截图与 PPT 并排评分。确认前不得开始编码。

---

### Round R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION — Gate 1–3

#### Goal
建立 Apple-like 全局设计系统和单一应用外壳，完成员工工作台、项目工作区、进展提交三个优先页面，使用真实 API 并以 1440/1024/390 截图、PPT 并排图和浏览器交互作为视觉闸门证据。

#### Scope
- Gate 1：token、字体、卡片、按钮、状态、KPI、TaskCard 和仅开发环境可见的组件预览页。
- Gate 2：五项一级导航、辅助入口、项目内上下文导航和移动底部导航。
- Gate 3：`/dashboard`、`/projects/:projectId`、`/progress?taskId=...&step=...`。
- 必要后端：个人工作台聚合 API、不可覆盖的进展/阻塞模型和 API、任务附件安全绑定。
- 不包含 Gate 4 其余页面重构、预发布和生产部署。

#### Main Files Changed
- `apps/web/src/app/r22.css`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/r22-ui.tsx`
- `apps/web/src/components/dashboard-workspace.tsx`
- `apps/web/src/components/project-workspace-r22.tsx`
- `apps/web/src/components/progress-workspace-r22.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/tasks/tasks.service.ts`
- `apps/api/src/modules/tasks/dto/create-task-progress.dto.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260713103000_add_task_progress_updates/migration.sql`
- `apps/web/tests/playwright/r22-visual-gate.spec.ts`
- `docs/design/DESIGN_TOKENS_R22.md`
- `docs/design/SCREENSHOT_COMPARISON_R22.md`
- `docs/design/VISUAL_ACCEPTANCE_R22.md`
- `docs/PRODUCT_UI_IMPLEMENTATION_R22.md`

#### Commands Run
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm --filter @feishu-timeline/web exec playwright test tests/playwright/r22-visual-gate.spec.ts --config playwright.config.mjs --reporter=line
pnpm playwright:test
git diff --check
```

#### Acceptance Result
- [x] 五个一级导航已收敛，旧侧栏和顶部导航不再并列。
- [x] 工作台实时显示问候、今日数量、下一任务、当前大卡、四项真实 KPI 和最近审计动态。
- [x] 项目工作区使用真实 18 节点，1440px 为约 70/30 流程/工序两栏，点击节点和 URL `taskId` 可恢复。
- [x] 进展提交分为做了什么、是否阻塞、上传材料三步，已通过真实 API 写入历史与审计。
- [x] 附件仍使用对象存储元数据链路，R19 扩展名/MIME/文件内容/路径/权限边界未放宽。
- [x] 1440×900、1024×900、390×844 三种视口无水平溢出，已生成 11 张主/步骤截图。
- [x] PPT｜Web 并排图已生成；工作台/项目工作区/进展提交评分 97/95/97。
- [x] `pnpm lint`、`pnpm typecheck`、Web 67 单测、API 153 单测、双端 build 和 Prisma validate 通过。
- [x] R22 专项 Playwright 1/1 通过；全量 Playwright 31/31 通过。
- [x] 未开始 Gate 4，未部署预发布或生产。

#### Evidence
- `docs/design/DESIGN_TOKENS_R22.md`
- `docs/PRODUCT_UI_IMPLEMENTATION_R22.md`
- `docs/design/SCREENSHOT_COMPARISON_R22.md`
- `docs/design/VISUAL_ACCEPTANCE_R22.md`
- `test-results/r22/local/`
- `test-results/r22/diffs/`

#### Issues Fixed During Validation
- 1024px 项目标题和“项目资料”按钮曾出现不自然换行；已收紧字号并保持按钮单行。
- 390px 工作台刷新动作曾单独占行，进展截图曾保留表单聚焦滚动；已调整移动布局和截图归顶。
- 完整 Playwright 首轮有 7 条旧导航/旧标题断言失效；已更新为 R22 实际语义并全量通过。
- 工作台初稿 KPI 未与 PPT 语义一一对齐；已改为真实待评审、缺材料和开放协助阻塞聚合，没有以其他数据换标签。

#### Risks / Debt
- 项目工作区的进度路径为响应式规则网格，与 PPT 固定坐标连线存在有意的产品化差异。
- 进展提交为单步向导而非 PPT 三列同时展开，以保持 390px 可用性和 60 秒完成目标。
- 本地数据库保留真实测试 seed 和浏览器回归记录；不得将演示数据策略带入生产。
- R19B 安全整改仍是未提交的同一工作树背景；发布前必须在干净 commit 上重跑 CI 和外部安全闸门。

#### Decision
`GATE_1_2_3_COMPLETE / STOP_FOR_VISUAL_CONFIRMATION`

#### Next Round
等待用户明确回复“视觉闸门已确认”。确认后才可进入 Gate 4：项目管理、我的任务、材料上传、生命周期复盘和后台管理全量重构。仍不允许部署生产。

---

### Round R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION — Gate 4–7

#### Goal
在视觉闸门确认后完成其余正式页面、真实数据联调、四档响应式、逐页视觉证据、全量质量与安全门禁，并部署预发布后停止等待发布确认。

#### Scope
- Gate 4：项目管理、我的任务、材料上传、生命周期复盘、后台管理。
- Gate 5：项目停滞、五类任务、必交材料、版本替换、复盘持久化、后台概览的真实 API 和权限。
- Gate 6：八页 1920/1440/1024/390 截图、PPT｜Web 并排图和六维评分。
- Gate 7：锁定安装、lint、typecheck、单测、双端 build、Prisma、主链路 E2E、全量 Playwright、安全扫描与预发布。
- 明确不包含 Gate 8 生产部署。

#### Main Files Changed
- `apps/web/src/components/projects-list-client.tsx`
- `apps/web/src/components/tasks-workspace.tsx`
- `apps/web/src/components/materials-upload-r22.tsx`
- `apps/web/src/components/project-retrospective-r22.tsx`
- `apps/web/src/components/admin-dashboard-r22.tsx`
- `apps/web/src/app/r22.css`
- `apps/web/e2e/r22-apple-style-product-ui.spec.ts`
- `apps/api/src/modules/projects/projects.service.ts`
- `apps/api/src/modules/tasks/tasks.service.ts`
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/modules/attachments/attachments.service.ts`
- `apps/api/src/modules/retrospectives/`
- `apps/api/src/modules/admin/`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260713150000_add_project_retrospectives/migration.sql`
- `docs/design/SCREENSHOT_COMPARISON_R22.md`
- `docs/design/VISUAL_ACCEPTANCE_R22.md`
- `docs/PRODUCT_UI_IMPLEMENTATION_R22.md`

#### Commands Run
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
pnpm playwright:test
pnpm security:sast
pnpm security:sca
pnpm security:secrets
R22_EVIDENCE_ENV=local pnpm --filter web exec playwright test e2e/r22-apple-style-product-ui.spec.ts --grep "16 八个正式页面" --config playwright.config.mjs --workers=1
git diff --check
```

#### Acceptance Result — Local
- [x] 项目管理四 KPI、五类快速筛选和真实停滞事实完成。
- [x] 我的任务五类视图和节点类型化主动作完成。
- [x] 材料上传使用真实 R19B 安全链路，支持材料类型、版本号和替换归档。
- [x] 完成工序的必交材料校验位于后端，并返回具体缺项。
- [x] 生命周期复盘使用真实流程、进展、阻塞、附件、评审和退出数据；草稿可持久化，完成后锁定并写审计。
- [x] 后台概览使用真实组织、角色、模板、节点参数和审计数据；普通用户前后端均被拒绝。
- [x] 八页四档截图通过业务就绪、无 skeleton 和无横向溢出断言；无 page/console error。
- [x] 八页 PPT｜Web 并排图已生成；视觉评分 94–97，全部高于 90。
- [x] `pnpm lint`、`pnpm typecheck`、Web 23 files / 71 tests、API 51 files / 153 tests、Web/API build、Prisma validate 均通过。
- [x] 主链路 E2E 通过；全量 Playwright 二次干净运行 36/36 通过。
- [x] Semgrep 0 finding/0 scanner error；SCA 和密钥扫描通过。
- [ ] 预发布生产构建部署、预发布截图和预发布全量 Playwright：待本节下一次更新。

#### Evidence
- `test-results/r22/local/`
- `test-results/r22/diffs/local/`
- `test-results/r22/local/quality-metrics.json`
- `docs/design/SCREENSHOT_COMPARISON_R22.md`
- `docs/design/VISUAL_ACCEPTANCE_R22.md`
- `docs/security/SAST_REPORT_R19.md`
- `docs/security/SCA_REPORT_R19.md`
- `docs/security/SECRETS_SCAN_R19.md`

#### Issues Fixed During Validation
- 材料页截图最初在任务详情加载完成前采集；截图门禁现等待“本工序材料清单”且 skeleton 为 0。
- 必交材料的前端完成态最初按附件数量推断；已改为按材料类型/材料名匹配，后端仍为最终裁决。
- 既有 E2E 主链路仍断言旧顶栏壳；已改为验证 R22 应用壳和真实工作区加载壳，不放宽业务流转断言。
- R20 新建项目用例直接定位已收起的关键词字段；已增加“高级筛选”交互，业务搜索断言保持不变。
- Semgrep 首轮因开发预览 JSX 裸 `&` 出现 parser error；修正文案后重跑为 0 finding/0 error。

#### Risks / Debt
- 本地测试库积累了回归项目，截图数字只证明真实聚合而非生产数据状态。
- 项目工作区采用响应式规则网格，而非 PPT 固定坐标拓扑；完整流程语义和后端状态机未改变。
- 预发布必须使用生产构建重新采集证据；本地开发模式性能数据不能替代预发布数据。
- R19B 外部真实 HTTPS、飞书后台和私有云证据仍属于生产发布边界，不能由本地/预发布视觉验收替代。

#### Decision
`GATE_4_5_6_LOCAL_PASS / GATE_7_STAGING_PENDING`

#### Next Round
提交当前可审计 commit，部署预发布生产构建，重新运行 R22/全量 Playwright、安全响应头检查并生成预发布截图。预发布通过后更新本节并停止在发布闸门；未经用户确认不得部署生产。

#### Staging Attempt
- 应用与安全改动已提交并推送至 `origin/feat/apple-style-product-ui-r22`：`b1c7947d61c1282f076d2caf80dd9ba894ff4f55`。
- `deploy/env/staging.env` 权限已收紧为 `600`，Mock API/UI 登录已关闭。
- 旧本地 staging PostgreSQL 密码已无损轮换，Redis 密码与认证 URL 已配置；没有删除数据卷。
- `RUN_SEED=yes pnpm deploy:staging` 在镜像构建前被安全校验拒绝：飞书 App ID/Secret 仍为 `staging-*` 模板值。
- 本轮未绕过安全门禁、未启用 Mock、未生成伪造预发布截图，也未部署生产；部分启动的 PostgreSQL 容器已清理，数据卷保留。

#### Blocking Evidence
```text
[ERROR] Feishu credentials still use template values.
```

#### Updated Decision
`GATE_4_5_6_LOCAL_PASS / GATE_7_STAGING_BLOCKED_BY_REAL_FEISHU_CREDENTIALS`

需要在本机 `deploy/env/staging.env` 中配置真实的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`NEXT_PUBLIC_FEISHU_APP_ID`，并确认飞书后台允许 `http://localhost:8080/login/callback`（或将 staging 回调和地址一起改为已登记的 HTTPS 地址）。凭据只写本地 600 权限文件，不要提交仓库。配置完成后从同一 commit 重跑预发布；生产仍禁止部署。

#### Staging Resume — 真实飞书与最终镜像阻塞
- 真实飞书凭据已写入本机 `600` 权限且被 Git 忽略的 `deploy/env/staging.env`；报告、命令输出和 Git 中均不保存 Secret。
- 提交 `829747706cf4c40d58d2889194ebed7687e02cb7` 已成功构建并部署 staging；两项 R22 migration、seed、镜像扫描、静态资源检查和四服务健康检查通过。
- 经用户确认，在飞书安全设置新增 `http://localhost:8080/login/callback`；真实 OAuth 平台回调成功，后端在携带一次性 state cookie 时返回 `201` 并签发 `ft_session`。缺少 state cookie 的负向请求返回 `401`，证明 R19 OAuth state 防护仍有效。
- 新飞书账号默认仅有 `viewer`；staging 使用 Prisma 事务追加 `admin`，并写入 `STAGING_ROLE_BOOTSTRAP` 审计日志。另分配一项真实 staging 任务并写入 `STAGING_TASK_ASSIGNMENT` 审计日志；生产数据库未修改。
- 使用真实 `authSource=feishu` 会话采集八页 × 1440/1024/390 共 24 张截图；全部核心组件可见、无横向溢出、无 page error 或 5xx。
- staging 后台页发现 `/logs` 预取 404；已改为有效的 `/admin/audit-logs`，补齐导航元数据并提交、推送 `1e574907cad35801f77fc0a739601ec45b80552f`。
- 修复后再次通过 lint、typecheck、Web 71、API 153、双端 build、Prisma validate、主链路 E2E 和 Playwright 36/36。
- staging 安全响应头检查通过；ZAP baseline 为 `PASS_WITH_TRIAGED_LOW_INFO`，Critical/High/Medium 均为 0，Low 2、Info 8。
- 对 `1e57490` 的最终 staging 重部署在拉取 `node:24-alpine` 元数据时连续两次收到 Docker Hub `503 Service Unavailable`。失败发生在镜像构建前，现有 staging 未被替换，仍健康运行 `8297477`。

#### Updated Decision
`GATE_1_2_3_4_5_6_PASS / GATE_7_STAGING_BLOCKED_BY_DOCKER_HUB_503 / PRODUCTION_NOT_AUTHORIZED`

#### Next Round
待 Docker Hub 恢复后，从干净工作树原样重跑 `RUN_SEED=no pnpm deploy:staging`。仅当 Web/API 镜像 revision 与届时干净的分支 HEAD 一致、且该 HEAD 包含应用修复提交 `1e57490` 后，重采后台及全量 staging 截图、复跑真实会话交互、安全响应头和 ZAP，并停止在发布闸门等待人工确认。不得部署生产。

#### Staging Resume — 2026-07-14
- 新增可配置 `NODE_IMAGE` build arg，并使用固定 digest 的 Google 镜像代理完成供应链可复核构建；提交 `eb49f521883cf4e5e867cec1e512c7abce5fc415` 已推送。
- `RUN_SEED=no pnpm deploy:staging` 成功：16 个 migration 无待执行项，镜像扫描、健康检查和静态资源检查通过；Web/API/PostgreSQL/Redis/Nginx 全部 healthy，运行镜像 revision 与 `eb49f52` 一致。
- 旧 App Secret 已按用户确认重置。新 Secret 仅存在 Git 忽略、权限 `600` 的本机 staging env；重复旧凭据项已清理，官方飞书 tenant token 接口验证成功，任何报告与 Git 均未记录 Secret。
- staging `mockEnabled=false`、`feishuEnabled=true`；OAuth 缺少一次性 state cookie 的负向测试返回 `401`。
- `pnpm security:sast`、`security:sca`、`security:secrets` 和 staging security headers 全部 PASS。
- ZAP baseline 为 `PASS_WITH_TRIAGED_LOW_INFO`：Critical 0、High 0、Medium 0、Low 2、Info 8，无阻塞发现。
- 真实 OAuth 跳转已到飞书授权端，但飞书明确拒绝当前账号“李晓晨”访问该应用；当前账号尚未位于“测试企业和人员”或正式可用范围，因此不能把旧 revision 的截图冒充本次部署证据。

#### Updated Decision
`GATE_1_2_3_4_5_6_PASS / GATE_7_STAGING_DEPLOYED / BLOCKED_BY_FEISHU_APP_ACCESS_SCOPE / PRODUCTION_NOT_AUTHORIZED`

#### Next Round
经用户明确确认后，仅把当前账号加入飞书应用测试/可用范围，完成真实 OAuth、八页 × 1920/1440/1024/390 截图、console/5xx/横向溢出检查并提交发布闸门。未经发布闸门确认不得部署生产。

#### Final Staging Acceptance — 2026-07-14
- 经用户确认创建飞书测试企业并关联当前应用；“李晓晨”已在测试人员范围内，真实 OAuth 成功完成回调。数据库中对应用户具有真实飞书标识，角色为 `admin`、`viewer`；`mockEnabled=false`。
- 最终审计提交已重新部署；16 个 migration 无待执行项，五项服务全部 healthy，API/Web 镜像 revision 与干净分支 HEAD 一致。具体 revision 记录于 `deploy/.state/current.env`。
- 真实会话 Playwright 证据目录：`test-results/r22/staging-release-gate/`。
- 八页 × 1920/1440/1024/390 共 32 张原始尺寸完整页面截图 32/32 PASS；skeleton 0、console error 0、page error 0、server 5xx 0、横向溢出 0。
- 八张 PPT｜Web 预发布并排图完成；既有 94–97 分评分基线在当前生产构建与真实数据下保持有效。
- 进展提交三步已使用真实飞书会话逐步验证，条件式阻塞字段、上传材料步骤与最终提交按钮均可见；测试未执行最终提交，网络写请求为 0。
- staging 安全响应头复核 PASS；SAST、SCA、密钥扫描通过；ZAP Critical/High/Medium 0。

#### Final Decision
`GATE_1_2_3_4_5_6_7_PASS / STOP_FOR_RELEASE_CONFIRMATION / PRODUCTION_NOT_AUTHORIZED`

#### Next Round
等待用户明确回复“发布闸门已确认”。只有确认后才可部署生产，并必须在生产域名重新执行 R22 Playwright、全页截图、真实交互、VPS HEAD/GitHub commit/镜像 revision 一致性与安全检查。

#### Release Candidate Guard — 2026-07-14
- 用户已明确确认发布闸门，同时要求正式页面不得展示 `DEMO-ACTIVE`、`DEMO-COMPLETE` 等英文种子业务编号。
- 新增统一业务编号展示层：真实业务编号保持原样；包含 `DEMO` 分段的项目/流程编号转换为中文业务文案，种子颜色编号不展示。
- 项目卡片、任务卡片、项目工作区、复盘、材料、流程实例、月度评审和旧入口页已统一接入；旧的硬编码 `DEMO-001` 路由已删除。
- R22 浏览器截图门禁新增可见文本断言，八个正式页面的四档视口均拒绝 `DEMO-*`、`WF-DEMO-*`、`CLR-DEMO-*`。
- 发布候选检查通过：Web 24 files / 73 tests、API 51 files / 153 tests、lint、typecheck、双端 build、Prisma validate、主链路 E2E、Playwright 36/36、SAST、SCA、密钥扫描均通过。
- 生产部署仍不得执行 seed；下一步先以 `RUN_SEED=no` 更新 staging 并重采真实飞书会话截图，再合并 `main` 和部署生产。

#### Updated Decision
`RELEASE_AUTHORIZED / RELEASE_CANDIDATE_TESTS_PASS / STAGING_REFRESH_PENDING / PRODUCTION_PENDING`

#### Release Candidate Staging + Production Read-only Audit — 2026-07-14
- `ab04baa3cfd917696072e715da08e25d967b37bf` 已使用固定摘要的镜像代理和 `RUN_SEED=no` 成功重部署 staging；16 个 migration 无待执行项，API/Web/PostgreSQL/Redis/Nginx 全部 healthy。
- 真实飞书会话八页 × 1920/1440/1024/390 共 32 张截图 32/32 PASS；seed 英文业务编号命中 0、skeleton 0、console/page/5xx/横向溢出均为 0。
- 三步进展交互通过且网络写请求为 0；安全响应头 PASS；ZAP 为 `PASS_WITH_TRIAGED_LOW_INFO`，Critical/High/Medium 0。
- 生产只读审计显示当前运行提交为 `cee427f8a6ebde5c8a4bcaabb86bedbc48a265ea`、工作树干净、API/Web active；未执行任何生产写操作。
- 审计发现 API/Web `.env.production` 权限为 `664`；已立即在生产主机安全收紧为 `600` 并复验。部署脚本现同样强制设置为 `600`，生产验收脚本新增双文件权限硬门禁；shell 语法和安全门禁回归测试通过。
- 审计还发现生产库存在两个 2026-05-21 创建的 seed 项目：`DEMO-ACTIVE-001` 与 `DEMO-COMPLETE-001`，以及关联 workflow/color seed 编号。新版 UI 不再暴露英文编号，但删除生产记录属于破坏性数据操作，必须单独取得用户明确确认。

#### Updated Decision
`RELEASE_AUTHORIZED / STAGING_FINAL_PASS / PRODUCTION_BLOCKED_BY_SEED_DATA_DECISION`

#### Authorized Production Seed Cleanup — 2026-07-14
- 用户明确授权先备份生产 PostgreSQL，再删除两个 seed 项目及其关联数据。
- 备份文件：`/var/backups/feishu-timeline-db/20260714T051948Z/feishu-timeline.dump`；大小 206468 bytes、权限 `600`、SHA-256 校验通过，`pg_restore --list` 可读取 409 行目录。
- 删除语句以精确项目编号为候选，并在同一 SQL 语句内断言候选数必须恰好为 2；实际删除返回 `DEMO-ACTIVE-001`、`DEMO-COMPLETE-001`。
- 级联删除后复核：项目编号、流程实例编号、颜色编号、任务编号以及项目名称中的 `DEMO`/“演示”命中均为 0。

#### Updated Decision
`RELEASE_AUTHORIZED / BACKUP_VERIFIED / SEED_DATA_REMOVED / READY_TO_MERGE_MAIN`

---

### Round R22_APPLE_STYLE_PRODUCT_UI_IMPLEMENTATION — Production Release

#### Goal
在发布闸门确认后完成生产数据保护、seed 清理、`main` 合并、生产部署、真实飞书登录、生产截图及安全验收。

#### Production Changes
- 生产 PostgreSQL 已先完成自定义格式备份：`/var/backups/feishu-timeline-db/20260714T051948Z/feishu-timeline.dump`；权限 `600`、SHA-256 校验通过，`pg_restore --list` 可读取 409 行目录。
- 仅以精确编号删除 `DEMO-ACTIVE-001`、`DEMO-COMPLETE-001` 两个 seed 项目；同一 SQL 内断言候选数恰好为 2。项目、流程、颜色、任务及项目名称中的 seed 标识复核均为 0。
- 功能分支已快进合并到 `main` 并部署生产；两项 R22 migration 已应用，API、Web、Nginx、PostgreSQL、Redis 全部 active。
- 生产 API/Web `.env.production` 权限均为 `600`。新 App Secret 仅从本机 Git 忽略的 `600` 环境文件安全同步到生产，未打印、未写入 Git；同步前生产环境文件已备份。
- 真实飞书 OAuth 使用当前账号“李晓晨”完成，`authSource=feishu`，Mock 登录保持关闭。

#### Production Screenshot Acceptance
- 生产库清理后项目数为 0、任务数为 0；经用户确认，采用“生产真实空态 + 最终预发布真实数据态”的组合证据，不为截图向生产重新写入演示项目。
- 生产域名生成 1440×900、1024×900、390×844 三档截图 21 张。普通账号可访问的六页共 18/18 PASS：无 skeleton、无登录跳转、无 page error、无 API error、无横向溢出。
- 禁止文本 `DEMO-ACTIVE`、`DEMO-COMPLETE`、`演示采购专员`、旧 `8600 元` 在生产可见文本中的命中数为 0。
- 当前飞书账号原始角色仅为 `viewer`；`/admin` 三档视口首先验证为后端 `403`，证明普通用户权限边界有效。
- 经用户再次明确确认，仅临时追加 `admin` 角色采集后台管理三档截图，3/3 PASS；随后立即删除该次新建的角色关联。最终角色复核为 `viewer`，临时标记不存在。
- 临时授权和撤销分别写入 `PRODUCTION_TEMP_ADMIN_GRANT_R22`、`PRODUCTION_TEMP_ADMIN_REVOKE_R22` 两条生产审计日志；未修改 `isSystemAdmin`，未创建生产项目或任务。
- 数据依赖页面沿用最终预发布真实飞书会话 32/32 截图、三步进展交互和 PPT｜Web 对比证据；用户已确认接受该组合证据边界。

#### Production Health and Security
- 生产健康检查全部通过：根路径、登录、工作台、项目管理、API health 和 Next 静态资源均为 200，五项服务均 active。
- 9 条生产安全响应头检查全部 PASS。
- 生产 ZAP 被动基线为 `PASS_WITH_TRIAGED_LOW_INFO`：Critical 0、High 0、Medium 0、Low 2、Info 8，阻塞发现 0。
- 截图时应用提交为 `2e9470bd2f54cff4887a37885a4ba64c0050c9ae`，本地 `main`、`origin/main` 与生产 VPS HEAD 一致。

#### Evidence
- `apps/web/test-results/r22/production-2e9470b/browser-evidence.json`（Git 忽略，本机证据）
- `apps/web/test-results/r22/production-2e9470b/admin-authorized/admin-browser-evidence.json`（Git 忽略，本机证据）
- `apps/web/test-results/r22/production-2e9470b/security-headers/`（Git 忽略，本机证据）
- `apps/web/test-results/r22/production-2e9470b/zap/`（Git 忽略，本机证据）
- `test-results/r22/staging-release-candidate-ab04baa/`（Git 忽略，本机数据态证据）

#### Final Decision
`GATE_1_2_3_4_5_6_7_8_PASS / PRODUCTION_RELEASED / TEMP_ADMIN_REVOKED / R22_COMPLETE`

---

### Round R23_REAL_WORLD_STABILITY_UAT_BUG_REMEDIATION

#### Goal
在 R22 生产完成后的准确版本上，执行真实业务稳定性、并发一致性、异常恢复、角色路径和耐久测试；自动修复 P0/P1，并在门禁未满足时停止。

#### Scope
- 冻结并推送 `release/r22-stability-security-rc`。
- 独立 staging 环境、真实飞书 OAuth 与 mock 关闭验证。
- 七类 `R23-UAT-*` 测试项目和九类角色矩阵。
- 18 步主链路、评审、收费、附件、月度任务、退出、复盘和审计。
- 并发、重复、陈旧页面、上传中断、401/403/500、必交材料、换版和定时任务去重。
- 温和 staging 负载脚本与 5/10/20 VU 耐久矩阵。

#### Inputs Read
- `AGENTS.md`
- `docs/EXECUTION_LEDGER.md`
- `docs/rounds/R00.md` ～ `R10.md`
- 用户提供的 R23/R24/R25 执行说明
- R20/R22 现有测试、部署和安全基线

#### Main Files Changed
- `apps/api/src/modules/workflows/workflows.service.ts`
- `apps/api/src/common/file-upload-options.ts`
- `apps/api/src/common/file-upload-options.spec.ts`
- `apps/api/src/modules/queue/notification-queue.service.ts`
- `apps/api/src/modules/queue/notification-queue.service.spec.ts`
- `apps/web/tests/playwright/r23-fixtures.ts`
- `apps/web/tests/playwright/r23-stability.spec.ts`
- `apps/web/playwright.config.mjs`
- `apps/web/scripts/playwright-runner.mjs`
- `scripts/testing/r23-load.mjs`
- `docs/testing/R23_*.md`
- `docs/rounds/R23.md`

#### Commands Run
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
pnpm playwright:test:r20
pnpm playwright:test:r23
PLAYWRIGHT_RESULT_ROUND=r23 pnpm playwright:test
pnpm test:load:r23 -- --vus 2 --duration 10s --think-ms 500 --sample-ms 2000 --profile script-smoke
pnpm deploy:health
pnpm test:load:r23 -- --base-url http://127.0.0.1:8080 --vus 20 --duration 5m --think-ms 1000 --sample-ms 30000 --profile 20vu-5m-final-candidate
```

#### Acceptance Result
- [x] 候选分支已创建并推送。
- [x] staging 使用独立 PostgreSQL、Redis、对象存储卷和 Session secret；mock 关闭。
- [x] 真实飞书 OAuth 登录、回调和项目页可用。
- [x] R23 专项 14/14 通过；当前版本核心业务重跑 13/13 通过。
- [x] 完整 Playwright 50/50、Web 73/73、API 157/157、主链路 E2E、双端 build、Prisma validate 通过。
- [x] P0 0；发现的 3 个 P1 均已建立回归测试、修复并通过全量回归。
- [x] 无重复流程节点、陈旧更新复活、同名覆盖、半条附件、重复月度实例或重复提醒入队。
- [x] 最终被测应用 commit `69d3332f30d6a7354c9b252d911cfe0a2652f76e` 已准确部署；API/Web 镜像 tag 为 `69d3332f30d6`，16 个 migration 无待执行项，五项服务和 HTTP 检查 healthy。
- [x] 20 VU × 5m 只读档：5600 请求、0 错误、0 非预期状态、0 个 5xx，p95 46.17 ms；DB 慢查询/死锁、容器重启、未处理异常均为 0。负载停止并空闲回收后 API+Web 合计内存较基线增长 4.87%。
- [ ] 九类真实飞书角色矩阵：仅有一个真实成员可用。
- [ ] staging 七类真实项目写入：等待用户动作确认和角色安排。
- [ ] 认证后 5 VU × 2h、10 VU × 30m 正式耐久矩阵。

#### Bugs Fixed
- `R23-P1-001`：工作流改为带旧状态/活跃条件的原子更新，陈旧并发动作返回 409。
- `R23-P1-002`：恢复 multipart UTF-8 原始文件名；允许合法的 1 文件 + 4 字段换版边界，文件和字段数量限制未放宽。
- `R23-P1-003`：定时提醒以 Redis Lua 原子 `SET NX EX + LPUSH` 在入队边界去重，内存回退同样维护 TTL 去重。

#### Evidence
- `test-results/r23/api-snapshots/`
- `test-results/r23/traces/`
- `test-results/r23/videos/`
- `test-results/r23/performance/`
- `test-results/r23/logs/`
- `docs/testing/R23_TEST_RUN_REPORT.md`
- `docs/testing/R23_BUG_TRACKER.md`
- `docs/testing/R23_PERFORMANCE_REPORT.md`
- `docs/testing/R23_FINAL_ACCEPTANCE.md`

#### Risks / Debt
- local mock 角色只能证明应用权限逻辑，不能替代真实飞书成员和组织可用范围。
- 20 VU × 5m 只读档只能证明公开读路径与未认证边界，不能替代 2 小时认证业务耐久和内存门禁。
- 未经明确确认，不修改 staging 用户角色，不提交真实 UAT 业务数据，不读取认证凭证。

#### Decision
`R23_APPLICATION_P1_CLOSED / LOCAL_FULL_REGRESSION_PASS / BLOCKED_BY_REAL_ROLE_MATRIX_AND_AUTHENTICATED_ENDURANCE / STOP`

#### Next Round
继续 R23B，不进入 R24。待九个不同的真实飞书测试成员分别完成 OAuth、用户明确授权七项目 staging 写入，并准备安全的认证负载会话后，完成真实写路径、5 VU × 2h、10 VU × 30m 认证耐久和最终全量回归。不得以同一管理员切换角色代替矩阵；全部门禁通过前不得部署生产、合并 `main` 或打 tag。

---

### Round R23B_REAL_ROLE_WRITE_PATH_AUTH_ENDURANCE_CLOSURE

#### Goal
只闭合 R23 的四项外部证据：九个真实业务角色用户、七条真实 UAT 写路径、认证 5 VU × 2h、认证 10 VU × 30m；不重做已通过的 R23 主体测试。

#### Stage 0 Baseline
- applicationCommit：`69d3332f30d6a7354c9b252d911cfe0a2652f76e`
- evidenceCommit（R23B 输入）：`1684b67a7dc6bbd340c757033cc7e25c4bcda692`
- stagingCommit：`69d3332f30d6a7354c9b252d911cfe0a2652f76e`
- 分支：`release/r22-stability-security-rc`；已确认 `1684b67` 相对应用提交只修改 5 个 R23 报告文件。
- staging API/Web 镜像 tag 为 `69d3332f30d6`；PostgreSQL、Redis、对象存储使用 `feishu-timeline-staging_*` 独立卷。
- 五项服务 healthy；API health 为 `ok`；16 个 migration、0 pending。
- 登录页真实飞书入口可用，mock 登录控件 disabled；当前浏览器无认证会话。
- `.gitignore` 的 `test-results/` 规则已覆盖 `test-results/r23/.auth/*`。

#### Identity And Data Readiness
- staging 用户记录 9 条：真实飞书用户 1 条、`mock_*` 演示用户 7 条、本地系统管理员 1 条。
- 唯一真实飞书用户当前系统角色为 `admin + viewer`；演示/本地用户不得计入真实角色验收。
- 九个业务身份映射到现有八种系统角色：marketing/project_manager → `project_manager`，coating_process/production → `process_engineer`，procurement → `purchaser`，quality → `quality_engineer`，其余为 `finance/admin/viewer`。业务身份仍必须由九个不同真实 OAuth 用户分别验证。
- 当前 `R23-UAT-*` 项目数为 0；本轮未创建、修改或删除任何项目。

#### Commands And Checks
```bash
git fetch origin
git switch release/r22-stability-security-rc
git status --short
git rev-parse HEAD
git diff --name-only 69d3332..1684b67
docker compose --env-file deploy/env/staging.env -f deploy/compose.staging.yml ps
curl -fsS http://127.0.0.1:8080/api/health
git check-ignore -v test-results/r23/.auth/marketing.json
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
```

另以只读 SQL 核对 migration、真实/演示用户数量、角色映射和 `R23-UAT-*` 项目数；未查询或输出飞书 ID、Cookie、token、OAuth code、密码或 storageState。

#### Acceptance Result
- [x] application/evidence/staging commit 分离记录且一致性已核验。
- [x] 独立 staging、migration、服务健康、真实 OAuth 入口和 mock 关闭已核验。
- [x] 九业务身份到现有系统角色的映射已澄清，无需修改冻结角色模型。
- [x] 提交前工程检查通过：Web 73/73、API 157/157，lint、typecheck、双端 build、Prisma validate 均通过。
- [ ] 九个不同真实飞书 OAuth 用户：当前仅 1 个。
- [ ] 七条 UAT 项目写入授权与真实写路径：未授权，0 条创建。
- [ ] 五个角色会话的 5 VU × 2h 认证耐久。
- [ ] 九角色会话加独立项目经理会话的 10 VU × 30m 认证耐久。

#### Decision
`R23B_STAGE_0_PASS / BLOCKED_BY_REAL_USERS_WRITE_AUTHORIZATION_AND_AUTH_SESSIONS / STOP`

不得进入 R24、部署生产、合并 `main` 或创建 tag。待用户完成九个真实飞书测试用户的应用可用范围与角色映射，并明确授权七项目 staging 写入后，从阶段 1 继续，不重新执行 R23。

---

### Round R23B_AUTHENTICATED_FULL_ACCESS_REMEDIATION

#### Goal
根据 2026-07-14 19:17 CST 人工测试截图与用户确认，撤销当前使用者角色限制，使所有有效已认证用户拥有完整应用权限，同时保留未登录、停用/锁定账号、业务状态、评审、幂等和审计边界。

#### Inputs And Policy Decision
- 生产截图中真实飞书用户在 `/projects/new` 被“当前角色无权访问该功能”阻断。
- 用户明确要求目前将系统所有权限对任何使用者开放。
- 执行口径解释为“任何有效已认证使用者”，不开放匿名业务访问；未登录 API 继续返回 401。
- 旧九角色隔离矩阵由本轮业务决策取代；数据库角色数据保留，不执行迁移或批量改角色。

#### Main Files Changed
- `apps/api/src/modules/auth/auth.constants.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.service.spec.ts`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/tests/playwright/r20-permissions.spec.ts`
- `apps/web/tests/playwright/r20-materials.spec.ts`
- `apps/web/e2e/r22-apple-style-product-ui.spec.ts`
- `apps/web/scripts/e2e-mainline.mjs`
- `docs/rounds/R23.md`
- `docs/rounds/R23B.md`
- `docs/testing/R23_*.md`

#### Application Commit
- `dc0e0f8ec4b7061e23fc3f323c046534c15eef99` — `feat(auth): grant full access to authenticated users`
- staging/production 均未部署本轮候选；线上截图中的旧权限行为仍会存在，直到另行完成发布授权和门禁。

#### Commands And Checks
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
pnpm playwright:test:r20
DATABASE_URL=postgresql://.../feishu_timeline_r23b_open_20260714?schema=public PLAYWRIGHT_RESULT_ROUND=r23b-open-access-fresh pnpm playwright:test
```

#### Acceptance Result
- [x] 后端统一认证用户出口生成 `admin` 全权限有效身份，所有现有角色/权限/项目范围守卫仍由后端执行但不再区分已认证角色。
- [x] 前端个人菜单显示“全部权限”，查看者可进入后台管理；新建项目不再出现角色无权提示。
- [x] 未登录业务 API 仍返回 401；停用/锁定用户过滤逻辑未放宽。
- [x] API 定向权限测试 `11/11`、R20 Playwright `13/13`、主链路 E2E 通过。
- [x] Web `73/73`、API `158/158`，lint、typecheck、双端 build、Prisma validate 通过。
- [ ] 最新候选完整 Playwright：隔离库 `43 PASS / 3 FAIL / 4 NOT RUN`。
- [ ] staging 七项目真实写路径：未获授权。
- [ ] 认证 `5 VU × 2h`、`10 VU × 30m`：缺少安全会话注入。

#### Blocker Report
- R22 Apple 风首条用例和 R22 视觉闸门都假设 seed 项目经理已有活跃任务；全新官方 seed 不提供该数据。
- R23-014 手动提醒扫描与启动中的后台调度存在竞争，断言前记录已被消费，首次扫描得到 0。
- 另一次在累计超过一万条 workflow/audit 测试数据的旧本地库运行发生 API 长时阻塞；已通过创建新数据库证明不是权限路径失败，未删除任何审计日志。
- 按执行协议连续失败后停止，不继续修复测试夹具，不部署候选。

#### Decision
`AUTHENTICATED_FULL_ACCESS_IMPLEMENTED / TARGETED_GATES_PASS / FULL_REGRESSION_BLOCKED_BY_TEST_FIXTURES / NO_DEPLOY / STOP`

下一步应先让 R22 用例自建活跃任务并隔离 R23-014 自动调度，再在全新数据库执行一次完整回归。通过后仍需取得七项目 staging 写入授权和一个安全认证会话，方可继续 R23B；不得自动进入 R24、部署生产、合并 `main` 或创建 tag。

---

### Round R23B_REAL_ACCOUNT_WRITE_PATH_CLOSURE

#### Goal
在用户仅有一个真实飞书账号且已确认所有有效已认证用户完整权限的条件下，完成七条独立 staging 真实写路径，修复发现的应用缺陷，在最终应用 commit 上重跑全量门禁并准确部署；认证耐久无法安全执行时保留 blocker，不伪造 PASS。

#### Scope And Inputs
- 用户明确授权使用其真实账号完成全部测试工作，并已确认 staging 七项目写入。
- 仅操作 `http://localhost:8080` 独立 staging；未连接或部署生产，未合并 main，未创建 tag，未进入 R24。
- 单一真实飞书会话只用于页面实操；未读取、导出、打印或持久化 Cookie、token、OAuth code、localStorage 或 storageState。
- 九角色隔离矩阵由产品全权限策略取代；不把一个账号伪称为九个角色。

#### Application Changes
- `dc0e0f8ec4b7061e23fc3f323c046534c15eef99`：所有有效已认证用户完整权限，匿名边界不放宽。
- `af6baaf9021f2fc5e9c3d0beb9f61b32afc8b4b3`：试制领域记录门禁、月度 `reviewPeriod` 与 12/12 门禁、测试夹具和中文任务附件名。
- `cdb51963502e35004bf2667aec7c8b7a49a51e25`：月度完成状态、重复按钮与下游激活文案准确化；这是最终 applicationCommit。
- Prisma migration `20260715135000_allow_monthly_review_records` 已部署；staging 累计 17 个 migration、0 pending。

#### Real UAT Projects
| 场景 | 权威项目 ID | 结果 |
|---|---|---|
| A 正常主线 | `cmrlhxjk00001n401qc1jk10q` | PASS：进入第 18 步 |
| B 评审退回 | `cmrllcv5q00crn401xwyb3d6f` | PASS：退回、新轮次、第二轮与历史完整 |
| C 非阻塞支线 | `cmrli33m7000zn401788108zo` | PASS：第 9 步未完成不阻塞主线 |
| D 逾期停滞 | `cmrli3gey001gn4013bniok62` | PASS：逾期/停滞/风险/催办/统计一致 |
| E 材料版本 | `cmrli3jjq001xn401c6pjov7b` | PASS：中文名、V1→V2、同名不覆盖、匿名 401、中断无半记录 |
| F 月度跟踪 | `cmrli3mo0002en401r82nwyh0` | PASS：12 条、1/12、第 17 步保持活跃、受控逾期 |
| G 并发编辑 | `cmrli3pqi002vn401zld6zcfy` | PASS：双标签同节点同时写一成一拒、中文冲突、自动化 409/幂等 |

原项目 `cmrli1i8a000in401wpos12xy` 被 B 场景权威 replacement 替代。七条权威项目与该已替代记录均通过项目编辑页面加上“已归档 / 测试项目”名称/说明标记；数据库无独立 archive 字段，故不改变流程状态、不物理删除，审计记录保留。脱敏清单为 `test-results/r23/r23-run-manifest.json`（Git ignored）。

#### Defects And Severity
- P0：0。
- P1：累计 6，全部修复，未关闭 0；本阶段新增试制通用动作绕过和月度首月错误关闭/无法逐月完成。
- P2：累计 2，全部修复，未关闭 0；任务材料中文原名显示、月度成功提示与重复按钮。
- P3：0。
- `R23B-BLOCK-003` 测试夹具问题已解除；最终 52/52。

#### Commands And Checks
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
pnpm playwright:test
git push origin release/r22-stability-security-rc
pnpm deploy:staging
pnpm deploy:migrate
pnpm deploy:health
```

#### Acceptance Result
- [x] applicationCommit `cdb51963502e35004bf2667aec7c8b7a49a51e25` 已推送并精确部署为 stagingCommit。
- [x] API image `sha256:82c8973e6e481a49f552f7ad8d2b458f3a1c768552ce8bed1866bc0b629fde7c`、Web image `sha256:38e3f4bbb77262e6375a3e9e28268c02a3aa610875c096199466b020389ba73d`，revision 均匹配完整 SHA。
- [x] 五服务 healthy、HTTP/static PASS、17 migration、0 pending，部署后 API/Web 日志无 error/exception/fatal/panic。
- [x] Web `74/74`、API `163/163`、主链路 E2E、Playwright `52/52`，lint/typecheck/build/Prisma validate 全部 PASS。
- [x] 七条真实写路径通过，项目逻辑归档完成。
- [ ] 认证 `5 VU × 2h`：NOT RUN / BLOCKED。
- [ ] 认证 `10 VU × 30m`：NOT RUN / BLOCKED。

#### Performance And Risk
- 历史 20 VU × 5m 未认证只读基线：5600 请求、error rate 0%、5xx 0、p50/p95/p99 `7.04/46.17/74.91 ms`、空闲回收后内存增长 4.87%、DB deadlock 0、重启 0。
- 该数据来自较早候选且不是认证耐久；不能替代最终应用 commit 的 2 小时/30 分钟认证测试。
- 唯一 R23 blocker `R23-BLOCK-002`：缺少不暴露真实会话机密的安全认证负载注入方式。

#### Decision And Next
`REAL_WRITE_PATHS_PASS / FINAL_REGRESSION_PASS / FINAL_STAGING_DEPLOY_PASS / AUTHENTICATED_ENDURANCE_BLOCKED / R23_NOT_PASSED / STOP`

如后续提供受控性能测试身份或由用户在本地进程外安全注入会话，只继续执行 `5 VU × 2h` 与 `10 VU × 30m` 并更新 R23 证据；此前不得进入 R24、部署生产、合并 main 或创建 tag。

---

### Round R23C_AUTHENTICATED_ENDURANCE_CONTINUATION

#### Goal And Scope
- 仅关闭认证 `5 VU × 2h` 与 `10 VU × 30m`，不重跑七条 UAT、不进入 R24、不部署生产。
- 使用 headed 真实飞书 OAuth；认证材料仅存在于 `/tmp/r23-auth.*`，权限 0700/0600，不输出认证值。

#### Results
- 5 VU × 2h PASS：32,539/32,539 checks，read p50/p95/p99 `23.436/736.946/2116.852 ms`，write `27.012/133.294/373.641 ms`，error/auth/5xx/deadlock/restart 均 0，回收后内存增长 -59.6311%。
- 首次 10 VU × 30m FAIL：14,767 请求中 7 次项目日志读取超时，read p50/p95/p99 `37.581/1104.928/4243.791 ms`，0 auth/5xx。
- `R23C-P1-007`：日志接口忽略分页，23,179条审计记录导致约11.1 MB响应；候选 `a4a9efd50404a512102dd74d1ab18d9bceb971a9` 改为有界跨来源分页和当页详情读取，UI支持加载更多。
- 修复前定向复现保存了非敏感 request ID；API 163/163、Web 74/74、lint/typecheck/build/Prisma validate PASS。

#### Deployment Blocker
- attempt 1：拉取 `node:24-alpine` metadata 时 `DeadlineExceeded`。
- attempt 2：`pnpm install --frozen-lockfile` 下载 403/405 后被 `registry.npmjs.org ECONNRESET` 中止。
- 两次都发生在候选镜像产出和服务切换前。active staging 仍为 `cdb51963502e35004bf2667aec7c8b7a49a51e25`；五服务 healthy、restart 0、17 migrations。
- 按连续两次失败停止协议，不作第三次部署尝试。

#### Security Cleanup And Decision
- Nginx 记录 `POST /api/auth/logout` 返回 201；服务端先删除 Session 再返回。临时认证目录已不存在。
- `authSessionUsed: true`；`authMaterialDestroyed: true`。
- 状态：`R23C_BLOCKED / P1_OPEN_1_PENDING_STAGING_RETEST / R23_NOT_PASSED / STOP`。
- 恢复点：外部 registry 稳定后，重新真实 OAuth，精确部署 `a4a9efd`，只重跑修复后 10 VU、完整回归并完成最终报告；不得进入 R24。

---

### Round R23D_STAGING_ARTIFACT_DEPLOY_AND_ENDURANCE_CLOSURE

#### Goal And Scope
- 精确部署最终 application commit，关闭审计分页 P1，在同 commit 上完成 10 VU × 30m、5 VU × 2h 和完整回归。
- 不部署生产、不 seed staging、不进入 R24、不合并 main、不创建 tag。

#### Inputs And Changes
- staging before：`cdb51963502e35004bf2667aec7c8b7a49a51e25`；final application/staging：`d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`。
- API/Web images：`sha256:82ebedf96fcaf3edd2096eea2910cd0376b42734026a587f356052bde866d3bd` / `sha256:95d7aff3f653da9b1a63877ccebaa36b199fcba073fc38945662abd05142286b`。
- 追加审计时间/用户/动作过滤与独立详情 API；列表继续仅返回摘要，pageSize 最大 100。
- 使用本地 lock 匹配依赖、缓存 base image、`--network=none` overlay 构建；无公共 registry pull。
- 因无缓存 k6 image，增加本地 Node 认证耐久执行器和完整性/资源监控，不引入网络依赖。

#### Commands And Evidence
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm test:e2e
pnpm playwright:test
```

- Audit special：PASS，23,189/23,189 unique，232 pages，max 48,714 bytes，p95 25.464 ms。
- Preflight：PASS，1,050 requests，0 error/5xx/auth。
- 10 VU × 30m：PASS，17,997 requests，HTTP p50/p95/p99 `32.074/96.776/139.994 ms`，idle memory -1.3618%。
- 5 VU × 2h：PASS，29,658 requests，HTTP p50/p95/p99 `33.474/80.758/125.575 ms`，idle memory -0.4664%。
- 两档 DB connections peak 18、slow/deadlock 0、Redis queue 0、restart 0、完整性异常 0。
- lint/typecheck/Web 74/74/build/Prisma PASS；API 162 assertions PASS，4 个 transport tests 被 socket bind EPERM 阻断。
- E2E 在 tsx IPC listen EPERM 时停止；Playwright 在 Docker socket permission denied 时停止；Gitleaks 与 server logout 同样被沙箱阻断。
- `git add` 创建 `.git/index.lock` 被 EPERM 拒绝，当前 R23D 文档/执行器尚无 evidence commit。
- `/tmp/r23d-auth.*` 已删除；server session deletion 不宣称成功。

#### Defects And Severity
- P0 0；P1 累计 7、已关闭 7、未关闭 0；P2 2/2；P3 0。
- `R23C-P1-007` 已由专项与两档 final-commit endurance 关闭。
- `R23C-BLOCK-004` RESOLVED；新增 `R23D-BLOCK-005` 为执行环境证据 blocker，不是产品缺陷。

#### Acceptance And Next
`EXACT_STAGING_PASS / AUDIT_SPECIAL_PASS / 10VU_PASS / 5VU_PASS / FINAL_REGRESSION_ENV_BLOCKED / AUTH_LOCAL_MATERIAL_DESTROYED / SERVER_LOGOUT_UNVERIFIED / R23_NOT_PASSED / STOP`

恢复后不得重跑耐久，只补跑 final API socket suite、E2E、Playwright、Gitleaks、logout verification，并提交/推送当前证据。全部通过后方可标记 R23 PASSED。R24 前必须实施方案 A 最小权限；当前不实施，以免改变本轮最终应用 commit 并使耐久证据失效。

---

### Round R23E_UNRESTRICTED_FINAL_REGRESSION_AND_EVIDENCE_CLOSURE

#### Goal And Scope
- 在具备 Git 写入、localhost、Docker Socket、IPC 和 Playwright 权限的本机环境，仅补齐 R23D 被沙箱阻断的最终回归、真实 logout、Session store 删除、Gitleaks 与 evidence commit。
- 不修改应用代码，不重跑审计专项和两档耐久，不部署生产、不进入 R24、不合并 main、不创建 tag。

#### Exact Baseline And Freeze
- branch：`release/r22-stability-security-rc`。
- applicationCommit/stagingCommit：`d6d4962f88dbb5b297d54c9f27326f3bf5616ec7`。
- staging API/Web OCI revision 均为完整 application commit；五服务 healthy，restart 0。
- preflight：`GIT_WRITE_OK`、`DOCKER_OK`、`LOCALHOST_LISTEN_OK`。
- 清理上一轮未提交的测试执行器/构建缓存后，R23E diff 仅含 `docs/`；质量命令生成的 `apps/web/tsconfig.tsbuildinfo` 已恢复。无 `apps/`、`packages/`、Prisma、deploy 或运行时配置变更。

#### Commands And Results
```bash
pnpm --filter @feishu-timeline/api test
pnpm test:e2e
PLAYWRIGHT_RESULT_ROUND=r23e pnpm playwright:test
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
GITLEAKS_EXECUTION_MODE=native bash scripts/security/run-secrets-scan.sh
```

- API：51 files、166/166 PASS、0 skipped、4.52s；R23D 被阻断的 4 个 socket transport tests 已真实执行。
- Web：24 files、74/74 PASS、0 skipped、2.22s。
- 主链路 E2E PASS、16.82s；项目、附件、第 4/6 步并行、第 9 步非阻塞、第 12 步退回新轮次、第 17 步月度计划与 Web 页面通过。
- Playwright 首次因缺少锁定 Chromium binary 在产品执行前停止；安装 user-cache Chrome for Testing 148.0.7778.96 后，原套件 52/52 PASS、0 skipped、5.1m。正式页面质量矩阵 page error/console error 0。
- lint/typecheck/Web build/API build/Prisma validate 全部 PASS。
- Gitleaks 8.30.1 current candidate tree 与 full Git history 均 PASS，0 findings；报告 `--redact`，保存于 Git ignored 的 `test-results/r23e/secrets/`。

#### Real OAuth Logout And Cleanup
- 真实飞书 OAuth 在本机 staging 建立 Session；Redis session records 从 baseline 1 增至 authenticated window 2。
- 浏览器客户端阻止直接渲染 JSON session endpoint 后，不输出 key/token，在 staging Redis 内选择本轮最新 Session，通过正式 `POST /api/auth/logout` 执行注销。
- logout HTTP 201；同一旧 Session 再查 `authenticated=false`；对应 Redis record `EXISTS=0`；总 session records 回到 1。
- Cookie、token、OAuth code、storageState、Session key 均未输出/提交；`/tmp/r23-auth.*` 与 `/tmp/r23e-auth.*` 目录数为 0。

#### Defects, Evidence Validity And Decision
- 新产品缺陷 0。Playwright 浏览器 binary 缺口是环境修复，不计产品 defect。
- P0/P1/P2/P3 open：`0/0/0/0`；累计 P1 7/7、P2 2/2 fixed；`R23D-BLOCK-005` RESOLVED。
- application/staging commit 未变且 R23E 只有 docs evidence changes，因此 R23D audit special、10 VU × 30m 与 5 VU × 2h 继续有效，不重跑。
- evidenceCommit：`075c25314dc30c53aa560fc0cf98fa6bf93aa49e`。
- 决策：`R23E_PASS / R23_PASSED / STOP_BEFORE_R24`。

R23 当前验收策略仍为所有有效已认证用户完整权限、匿名/停用/锁定拒绝和业务状态门禁保留，不宣称九角色隔离。方案 A 最小权限是进入 R24 前必须实施并产生新应用候选的新工作；本轮不实施，以保持 R23 endurance evidence 的同 commit 完整性。

---

### Round R23F_PRE_R24_MINIMUM_PERMISSION_BOUNDARY

#### Goal And Scope
- 在 R23 已通过后实施方案 A，撤销认证即管理员的临时策略。
- 按真实角色、项目范围、任务负责人和指定评审记录收敛权限；不部署 production、不进入 R24、不合并 main、不创建 tag。
- 唯一真实飞书账号用于 OAuth 与管理员正向路径；负向隔离使用独立自动化身份，不伪造九账号证据。

#### Application And Data Changes
- `d14538bc78a972c37bb4acf7f0bf6a41ac4ddf0b`：方案 A 主权限实现。
- `f0de3dd85fee0d69a2f33ac0f32f600b2826207c`：账号菜单展示真实角色名称；最终 application/staging commit。
- migration `20260716160000_apply_plan_a_role_permissions`：幂等新增 `auditor` 权限并为 `project_manager` 补齐 `review.execute`，不依赖 seed。
- 普通工序限负责人/项目经理；第 12/17 步限指定评审人/项目经理；第 13 步限财务/管理员；第 18 步限项目经理/管理员；审计限管理员/审计人员。
- 通用 workflow 接口不能使用任务负责人关系绕过指定评审记录授权。

#### Commands And Results
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @feishu-timeline/web build
pnpm --filter @feishu-timeline/api build
pnpm --filter @feishu-timeline/api prisma:validate
pnpm playwright:test
pnpm security:secrets
corepack pnpm@11.13.1 --pm-on-fail=ignore audit --prod --audit-level low --json
corepack pnpm@11.13.1 --pm-on-fail=ignore audit --audit-level low --json
pnpm deploy:staging
```

- Web 25 files、78/78；API 52 files、173/173；定向权限 API 35/35、Web 7/7。
- lint、typecheck、Web/API build、Prisma validate 全部 PASS。
- 最终 commit Playwright 52/52 PASS、0 skipped、4.9m。
- Gitleaks current/history 0 finding；pnpm 11 生产/全依赖所有严重度 0；Trivy filesystem 与最终两镜像 0 finding。
- pnpm 9 audit 因上游端点 410 TOOL_ERROR；Semgrep 镜像拉取中断 TOOL_ERROR，均未误报为 PASS。

#### Exact Staging And OAuth
- API image `sha256:ea7a4b6d99f882b023987146dc0358ceeaa4204544a916d327d2f518ebe1f6d0`。
- Web image `sha256:bf592a5eabe6a656b489835a173514a8368ddeb106d3114c5701d108ddc68d5a`。
- OCI revision 与完整 `f0de3dd85fee0d69a2f33ac0f32f600b2826207c` 一致；dirty=false。
- 18 migrations、0 pending；PostgreSQL/Redis/API/Web/Nginx healthy，restart 0，HTTP/static PASS。
- staging 角色查询：auditor=`audit.read,dashboard.read,project.read`；project_manager 包含 `review.execute`。
- 真实飞书 OAuth 成功；唯一账号的既有 `admin + viewer` 身份可访问项目、新建入口和项目日志。未读取/导出 Cookie、token 或 storageState，未新增业务测试数据。

#### Decision
`PLAN_A_IMPLEMENTED / ALL_FUNCTIONAL_GATES_PASS / EXACT_STAGING_PASS / REAL_OAUTH_ADMIN_PATH_PASS / R23F_PASSED / STOP_BEFORE_R24`

证据：`docs/rounds/R23F.md`、`docs/testing/PRE_R24_PLAN_A_PERMISSION_REPORT.md`。R24 未开始。

---

### Round R24_FULL_SECURITY_REAUDIT_HARDENING_REMEDIATION

#### Goal And Scope
- 基于 R23F 当前代码重新执行完整安全复审，不把 R19 PASS 直接作为当前证据。
- 主动扫描仅限授权 staging `http://localhost:8080`；生产仅 passive headers/health/TLS 与私有云只读核查。
- 不导出真实 Cookie/token/code/storageState，不扫描飞书平台，不做 DoS/爆破/真实数据删除。
- 不部署生产、不合并 main、不打 tag；完成 R24 判定后停止。

#### Exact Baseline And Candidate
- R23F evidence baseline：`c41553be92f7b6efddcea7104b15d9c991a7b9cc`。
- R23F application/staging baseline：`f0de3dd85fee0d69a2f33ac0f32f600b2826207c`。
- branch：`security/r24-full-reaudit`。
- final application/staging commit：`d86c04e8c016a0241172fb7c608f55d8dfcca5c9`。

#### Remediation
- `1bd6a4e`：五镜像供应链、unsafe method Origin、上传文件名/双扩展、OAuth配置与IDOR定向测试加固。
- `299bf4a`：关闭 Nginx 版本泄露。
- `fa0a4cd`：配置发布强制重建 proxy，消除运行版本漂移。
- `d86c04e`：空 OAuth callback body 从 500 收敛为受控 401。
- 初始 PostgreSQL/Redis/Nginx 镜像累计 11 Critical、119 High occurrence；最终五个精确镜像所有严重度均为 0。

#### Commands And Results
```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
pnpm --filter api build
pnpm --filter api prisma:validate
pnpm test:e2e
pnpm playwright:test
pnpm security:sast
pnpm security:secrets
pnpm 11 audit --all / --prod
OSV Scanner 2.4.0
Trivy filesystem / five images / CycloneDX SBOM
ZAP baseline / OpenAPI safe mode
security headers / CORS / Origin
RUN_SEED=no pnpm deploy:staging
production passive checks
GCE SSH read-only host audit
Feishu developer-console read-only audit
```

- Web 78/78、API 186/186；主链路 E2E PASS；Playwright 52/52 PASS（5.6m）。
- lint/typecheck/Web/API build/Prisma validate 全部 PASS。
- Semgrep 381 个候选文件 0 finding；Gitleaks current/history 0 finding。
- pnpm 11、OSV、Trivy filesystem 与最终五镜像全部 0 finding；六份 CycloneDX SBOM 完成。
- 最终 ZAP baseline：Critical/High/Medium 0，Low 1，Info 8；OpenAPI 165 URLs，WARN/FAIL 0。
- staging 五服务 healthy、18 migrations、0 pending；真实飞书会话最终 `/projects`、`/admin` 正向路径 PASS。

#### Host And Feishu Evidence
- 私有云 SSH password/root 禁止，API/Web 非 root，env 0600，PostgreSQL/Redis loopback，TLS/HSTS/CSP、备份校验、恢复演练与远程 tracked tree clean 均通过。
- `R24-HOST-001` Medium：GCP 默认规则仍允许 `0.0.0.0/0:22`，未接受。
- 飞书后台证据已读取：正式应用启用、生产回调存在、IP 白名单存在、版本 1.1.2 已发布、可用范围为部分成员、唯一测试人员为李晓晨。
- `R24-FEISHU-001` Medium：正式应用仍保留 localhost callback。
- `R24-FEISHU-002` Medium：当前代码未调用 Contact API，但后台启用了多项通讯录只读权限。
- `R24-FEISHU-003` gate blocker：移动主页和 H5 可信域名为空。
- `R24-EVID-001` gate blocker：未把唯一真实会话导出给 ZAP，因此 authenticated passive / approved low-risk active 未完成。

#### Final Severity And Decision
- 当前 consolidated open：Critical 0、High 0、Medium 3、Low 1、Info 11。
- Critical/High 已全部修复；OAuth/IDOR/上传/业务逻辑与 CSP 通过。
- 三项 Medium 无书面风险接受，authenticated DAST 未完成，飞书后台配置不通过。

`R24_FAIL / NO_JOINT_RELEASE_GATE / NO_PRODUCTION_DEPLOY / STOP`

证据：`docs/rounds/R24.md` 与 `docs/security/R24_*.md`。

---

### Round R24B_SECURITY_GATE_CLOSURE

#### Goal And Scope
- 仅关闭 R24 的三项 Medium 配置风险、真实认证态 DAST 和关联回归，不重新执行已通过的大规模 SAST/SCA。
- 主动扫描只针对授权 staging 的隔离别名；禁止生产/飞书域名主动扫描、DoS、爆破和认证材料入库。
- 不合并 main、不创建 tag、不进入 R25；完成判定后停止。

#### Exact Artifacts And Changes
- branch：`security/r24-full-reaudit`。
- application/staging commit：`f00703ac7834837f9ad573bc11d779a5caa7c02f`。
- `83e5c752fd3cc66faa56c5e9db56933490c1b7c6`：修复同一真实人员在正式/测试飞书应用中 app-scoped 身份标识不同导致的身份合并冲突，新增 6 条回归测试。
- `f00703ac7834837f9ad573bc11d779a5caa7c02f`：修复 `/favicon.ico` 未经过 CSP middleware matcher 的问题并增加 matcher 测试。
- evidence commit：本节所在的 `security: close R24 authenticated DAST and configuration gates` 提交。

#### Configuration Closure
- `R24-HOST-001` Fixed：启用 IAP API，增加 `iap-ssh` tag，创建只允许 `35.235.240.0/20` TCP 22 的 `allow-iap-ssh`；两次禁用前和一次禁用后 IAP SSH 均通过；`default-allow-ssh` 已禁用但保留回滚；非 IAP SSH 未到达 VM。
- `R24-FEISHU-001` Fixed：正式应用只保留生产 HTTPS callback，localhost 已删除；真实生产 OAuth、受保护页面、logout 和旧会话拒绝通过。
- `R24-FEISHU-002` Fixed：未使用的 Contact/API 权限全部删除并发布，Contact 数据范围 N/A。
- `R24-FEISHU-003` Fixed：正式应用可用范围为四名已审核成员，桌面/移动主页和 H5 可信域名已配置。
- `R24-CRED-001` Fixed：正式凭据经一次性隐藏交接轮换，生产安全更新并重启，后续真实 OAuth/session/logout 通过；证据不保留值。

#### Authenticated ZAP
- 真实飞书 OAuth 由用户在 headed Chrome 完成；仓库外临时目录权限 700、文件 600，内容未输出。
- 扫描目标仅 `https://r24b-staging.local`；生产、飞书登录/开放平台、第三方 CDN/监控域名明确排除。
- 六个受保护接口认证态 HTTP 200；同一项目接口无会话 HTTP 401；ZAP auth statistics 有两项非零值。
- Spider 55 URLs；AJAX 995 in-scope results、5 个越界请求被阻断；GET-only OpenAPI 66 operations；21 个可用批准规则 LOW strength，100ms delay。
- 首轮发现 CSP plugin `10038` 仅命中 favicon；修复/部署后定向复测为 0，最终完整认证扫描 Critical/High/Medium/Low/Info=`0/0/0/3/4`。
- `authMaterialUsed=true`、`authMaterialDestroyed=true`、`serverSessionInvalidated=true`；临时目录和 R24B 容器不存在，报告文件 mode 600。

#### Final Regression
```text
pnpm install --frozen-lockfile                     PASS
pnpm lint                                          PASS
pnpm typecheck                                     PASS
pnpm test                                          Web 79/79; API 187/187
pnpm --filter @feishu-timeline/web build           PASS
pnpm --filter @feishu-timeline/api build           PASS
pnpm --filter @feishu-timeline/api prisma:validate PASS
pnpm test:e2e                                      PASS
pnpm playwright:test                               52/52 PASS (5.2m)
pnpm security:secrets                              current/history PASS, 0 findings
```

- Playwright 包含 R23 全部稳定性用例和项目、流程、评审、上传、审计、复盘主链路。
- 唯一真实账户只用于真实 OAuth/管理员正向路径；负向角色与 IDOR 由确定性自动化身份覆盖，不宣称九个真实账户。

#### Decision
`R24B_PASS / R24_PASS / R25_JOINT_RELEASE_GATE_ALLOWED_BUT_NOT_STARTED / NO_MAIN_MERGE / NO_TAG / STOP`

R24 已正式通过。等待用户确认后才允许进入独立的 R25 联合发布门禁轮次。

---

### Round R25_COMBINED_STABILITY_SECURITY_RELEASE_GATE

#### Goal And Scope
- 在冻结 runtime `f00703ac7834837f9ad573bc11d779a5caa7c02f` 上统一稳定性、安全、构建溯源、备份恢复、回滚和真实 staging UAT 证据。
- 只操作独立 staging；不部署 production、不写 production 数据库、不主动扫描 production/飞书域名、不合并 `main`、不创建稳定 tag。
- 认证材料仅位于仓库外 `/tmp/r25-auth.*`，不得输出 Cookie、OAuth code、token、App Secret、storageState 或数据库密码。

#### Completed Baseline And Evidence
- 创建并推送 `release/r25-final-gate`；生产只读核查仍运行 `7dd2243270c03399cd6da6cec41bf12eab68dd0b`，tracked tree clean。
- 从 detached exact `f00703a` 构建并部署不可变 API/Web/PostgreSQL 镜像；OCI revision 一致，`RUN_SEED=no`，18 migrations、0 pending，五服务 healthy/restart 0。
- API/Web Trivy 全严重度 0；SBOM、Dockerfile/lockfile SHA256 和镜像 digest 已记录于 `docs/release/R25_BUILD_PROVENANCE.md`。
- R23 证据复核确认其正式 PASSED，但 R24 修改涉及认证、上传、代理、权限、镜像和审计，旧耐久不能直接复用。
- 真实飞书 OAuth 成功并创建受控项目 `R25-UAT-并发稳定性-*`；未输出认证值。
- 10 VU × 30 m `R25-10VU30M-20260717T054139Z` PASS：17,484/17,484 checks，error/auth/5xx 0，read/write p95 `72.986/62.546 ms`，deadlock/restart/duplicate 0，idle memory `-2.061%`。

#### 5 VU Failure Attempts
- Attempt 1 `R25-5VU2H-20260717T061657Z`：34,907/34,907 checks，error/auth/5xx/functional failure 0，read/write p95 `84.591/49.942 ms`，deadlock/restart/duplicate/unhandled 0；但 5 分钟 idle 后 API+Web memory growth `+60.2254%`，超过 `<20%`，因此 FAIL。
- 只读诊断显示无 Redis fallback、OOM、swap、unbounded queue、detached V8 context 或 descriptor growth；API live JS heap 约 64 MiB，主要高水位来自 V8 young-generation 物理保留。该解释不覆盖显式 RSS 门禁。
- Attempt 2 `R25-5VU2H-RETRY2-20260717T082834Z`：warmed steady-state monitor memory `+0.7989%`、deadlock/restart/5xx/unhandled 0，但 Mac/任务中断和 sleep 使 k6 只完成约 1 h 20 m，无 summary；恢复后 session 已过期并出现 401。该执行 INVALID，不能作为 2 h PASS。
- 根据 `AGENTS.md` 连续两次仍失败即停止；未启动第三次。孤立 k6 container 已 stop/remove。

#### Cleanup And Sequential Stop
- 旧 session 的受保护请求已返回 401；logout 因 session 过期返回非成功，但 cleanup `finally` 已销毁仓库外目录。
- `/tmp/r25-auth.*=0`、R25/k6 containers=0；Gitleaks 8.30.1 current/history PASS，0 findings。
- full quality regression、剩余 R24 security smoke、staging backup/restore、rollback/forward recovery、最终 interactive UAT 均因 stage 6 blocker 而 NOT RUN，不误报 PASS。
- candidate tag `v1.1.0-rc.1` 未创建；production 未变更。

#### Decision And Resume Point
`R25_BLOCKED / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

恢复必须先获得超过 2 h 10 m 的持续唤醒执行窗口和 fresh real OAuth session，清除 stale load containers，然后重跑完整 `5 VU × 2 h`。若 runtime 未变且该门禁通过，可继续阶段 7–12；若修改 runtime/config，必须重建部署并重跑所有受影响门禁。

证据：`docs/rounds/R25.md`、`docs/release/R25_COMBINED_GATE_REPORT.md`、`docs/release/R25_BLOCKER_REPORT.md`、`docs/security/R25_SECRETS_REPORT.md`。

---

### Round R25_RESUMED_ENDURANCE_AND_UAT_BLOCKER

#### Resume Inputs And Runtime
- 用户提供超过 2 h 10 m 的持续唤醒窗口并重新完成真实飞书 OAuth。
- 修复累计历史导致进展页提交超过 API 20 个附件 ID 的问题：只提交最新 20 个 ID、保留全部历史；补齐负载容器 cleanup 和 OCI labels。
- 最终 runtime/staging commit：`6d24378168fd144e539b0e99f975b918b06e37a5`；staging tag `r25-6d2437818502`；`RUN_SEED=no`；18 migrations、0 pending；五服务 healthy/restart 0。
- 生产仍运行 `7dd2243270c03399cd6da6cec41bf12eab68dd0b`，tracked changes 0；未修改 production。

#### Formal Load Closure
- 10 VU × 30 m `R25-10VU30M-6D24378-20260718T083625Z` PASS：17,424/17,424 checks；HTTP/auth/5xx/functional 0；read/write p95 `106.338/58.429 ms`；idle memory `-8.255%`；restart/deadlock/queue/duplicate 0。
- 5 VU × 2 h `R25-5VU2H-RETRY-6D24378-20260718T112109Z` PASS：34,832/34,832 checks、34,830 iterations；read/write p95 `119.742/44.276 ms`；2 h load + 5 m idle；idle memory `-0.602%`；DB connections max 18；slow/deadlock/queue/restart/5xx/unhandled/duplicate 0。
- 早期 cold-baseline RSS high-water 保留为非阻塞观察；正式 warmed run 满足显式门禁。

#### Real Staging UAT
- 员工路径 PASS：1.102 s 找到任务；58.770 s 完成进展与合法 PDF 绑定；第 1 工序按标准接口完成并生成第 2 工序。
- 项目经理路径 PASS：1.405 s 识别风险；2 次点击进入停滞工序；卡片和节点证据包含责任人、阻塞原因、逾期和预计解决时间。
- 管理员路径第一次 FAIL：真实认证态 `/admin/audit-logs` 未提供可用的审计查询/list/detail UI。
- 独立认证态只读复核第二次 FAIL：`/api/admin/overview=200`，`/api/admin/audit-logs?page=1&pageSize=20=404`；`/admin/audit-logs=200` 但服务端标记为 placeholder，无有界列表标记。
- 仓库确认 `apps/web/src/app/admin/[section]/page.tsx` 仍渲染 `PagePlaceholder`，`AdminController` 仅有 overview；项目级日志不能满足 R25 全局管理员审计门禁。

#### Classification, Cleanup And Stop
- 新 blocker：`R25-ADMIN-001`，P1；P0/P1/P2/P3=`0/1/0/0`。
- R25 明确禁止新增业务功能；不得在联合发布门禁内临时实现全局审计后台。根据 `AGENTS.md` 同一门禁连续两次失败后停止。
- 临时负载认证会话已服务端 logout 成功并销毁；Gitleaks 8.30.1 current/history 0 finding，`/tmp/r25-auth.*=0`、R25/k6 containers=0；未输出或提交 Cookie、OAuth code、token、App Secret、storageState 或数据库密码。
- exact-final full quality、剩余 R25 security、最终五镜像/SBOM、backup/restore、rollback/forward、管理层 UAT、candidate commit/tag 均 NOT RUN/NOT CREATED，不误报 PASS。
- production 未部署；未合并 main；未创建 candidate/stable tag。

#### Decision And Safe Resume
`R25_BLOCKED / R25-ADMIN-001_P1 / PRODUCTION_NOT_AUTHORIZED / NO_CANDIDATE_TAG / STOP`

仅在单独授权的 runtime-fix 轮次补齐有界全局审计列表、独立详情、稳定筛选/排序和 admin/non-admin 权限覆盖后恢复。新 runtime 必须重新构建部署，并重跑 10 VU × 30 m、5 VU × 2 h 及所有受影响的后续门禁。

证据：`docs/release/R25_BLOCKER_REPORT.md`、`docs/release/R25_STAGING_UAT.md`、`docs/release/R25_COMBINED_GATE_REPORT.md`、`docs/rounds/R25.md`。

---

### Round R26_PRODUCT_UI_RECOVERY — Gate 0

#### Goal And Scope

- 暂停 R25B、生产发布、`main` 合并和稳定 tag。
- 保留后端业务、数据库、安全修复和稳定性结果；当前用户端产品验收改为 `FAIL`。
- 本轮只执行设计解析、当前生产 UI 取证、路由/组件审计和 V2 规格，不修改产品代码。
- 历史 `docs/rounds/R26.md` 保留；本恢复轮次使用 `docs/rounds/R26_PRODUCT_UI_RECOVERY.md`，不覆盖登录入口历史。

#### Design Source Priority

1. Apple 风产品 UI 决定全局信息架构、字体、留白、颜色和正式页面。
2. 项目实时流程地图决定项目工作区、固定 SVG 拓扑、节点状态、工序抽屉和刷新。
3. 系统导览只决定 `/v2/guide` 页面内部，不得覆盖全局导航或项目工作区。

- 三份演示稿均为 12 页，已逐页解析并生成蒙太奇。
- 补充固定拓扑原图已纳入证据，确认第 4、6、12 步分支和第 12 步 Y/N 语义；未形成第四套设计源。
- 用户指定的 Apple `(1)` 文件名未找到；当前 Downloads 文件与仓库设计稿 SHA-256 完全一致。
- 项目流程地图只找到 PowerPoint 修复版；若后续出现内容不同的原文件，必须重开相应 Gate 0 差异矩阵。

#### Current Production Evidence

- 使用已有 Safari 正式会话只读截取 48 个正式路由，另保存进展页内部改写到 `step=1` 后的空白故障截图。
- 内置浏览器中的测试企业账号被飞书授权页判定为无应用权限；未尝试绕过。
- 未读取或导出 Cookie、token、OAuth code、App Secret 或 storageState；未写生产数据。
- 生产可见结果确认：主项目工作区持续骨架屏、进展页可整页空白、多个项目模块长期加载、占位路由仍存在、流程视图重复、业务字号过小、内部英文标注未清除。

#### Gate 0 Artifacts

- `docs/product/R26_CURRENT_UI_AUDIT.md`
- `docs/product/R26_DESIGN_SOURCE_PRIORITY.md`
- `docs/product/R26_V2_INFORMATION_ARCHITECTURE.md`
- `docs/product/R26_FLOW_MAP_SPEC.md`
- `docs/product/R26_UI_ACCEPTANCE_CRITERIA.md`
- `docs/product/evidence/r26/current-production/`
- `docs/product/evidence/r26/design-sources/`
- `docs/rounds/R26_PRODUCT_UI_RECOVERY.md`

#### Decision

`R26_PRODUCT_UI_RECOVERY_GATE0_COMPLETE / CURRENT_UI_FAIL / NO_CODE_CHANGE / NO_MAIN_MERGE / NO_DEPLOY / NO_TAG / STOP_BEFORE_GATE1`

lint、build、API 200、路由存在和服务 active 均不作为 UI 完成证据。等待用户确认后才允许进入隔离的 Gate 1 静态 V2 原型。

---

### Round R26_PRODUCT_UI_RECOVERY_GATE1_STATIC_V2_PROTOTYPE

#### Goal And Scope

- 用户已确认 Gate 0，只实现四个隔离、静态、可交互的 V2 前端原型场景。
- 只使用 typed fixtures 和 `sessionStorage`；不接真实 API、不修改后端/数据库、不部署、不合并 `main`、不创建 tag。
- 设计职责继续遵循 P1 Apple 全局产品 UI > P2 项目实时流程地图 > P3 系统导览；P3 本 Gate 不实现。

#### Branch And Isolation

- Gate 0 固定提交：`1e9d5ab57d09c70dc5b77deb8f4c01705d89bfb4`。
- Gate 1 分支：`codex/r26-product-ui-recovery-gate1`。
- `/v2/*` 路由与 `NEXT_PUBLIC_R26_V2_PROTOTYPE=true` Feature Flag 双重隔离。
- Flag 关闭时 V2 返回 404；V2 根运行时不加载 V1 Providers/AppShell/API 初始化。
- V2 CSS 作用域为 `[data-ui-version="r26-v2"]`；V1 页面、导航和生产入口保持原状。

#### Implemented Routes And Interactions

- `/v2/dashboard`：当前任务、六阶段摘要、辅助事实、最近动态和唯一“提交这项进展”主动作。
- `/v2/projects`：四 KPI、五筛选、三项目卡、风险原因和受控“原型范围外”反馈。
- `/v2/projects/demo-r26`：项目根路由默认固定流程地图 + 工序详情。
- `/v2/progress?projectId=demo-r26&taskId=t006`：三步进展、条件阻塞字段、本地文件名和成功反馈。
- `R26PrototypeStore` 提交后只在当前会话联动工作台、步骤 06、步骤 07/09/10 和最近动态；可重置。

#### Fixed Flow Map

- 固定 `viewBox="0 0 1440 1740"`，18 节点坐标/尺寸/形状和全部 path 直接来自冻结规范。
- 第 12 步菱形和第 2 轮退回历史、第 17 步 `3 / 12` 环形进度、第 18 步系统建议/人工决定均可见。
- 主线、并行、非阻塞、退回四类连线可区分；自动化确认无节点重叠、无长斜线。
- 节点点击更新详情和 URL；刷新恢复；关闭详情不重置地图比例。

#### Evidence

- `test-results/r26-gate1/screenshots/`：四页 1440×900、1024×900、390×844，另有第 12 步、阻塞态和成功态。
- `test-results/r26-gate1/videos/`：员工、项目经理、流程地图与移动全屏 sheet 四段当前复验录像。
- `test-results/r26-gate1/comparisons/`：四组 PPT｜Web 并排对比。
- `docs/product/R26_GATE1_STATIC_PROTOTYPE_REPORT.md`
- `docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- `docs/product/R26_GATE1_HUMAN_REVIEW.md`

证据目录由 `.gitignore` 排除；未提交视频、浏览器认证材料、环境文件或临时缓存。

#### Validation

```text
pnpm install --frozen-lockfile                                                    PASS
pnpm --filter @feishu-timeline/web lint                                          PASS
pnpm --filter @feishu-timeline/web typecheck                                     PASS
pnpm --filter @feishu-timeline/web test                                          PASS（28 files / 84 tests）
pnpm --filter @feishu-timeline/web build                                         PASS
NEXT_PUBLIC_R26_V2_PROTOTYPE=true ... r26-gate1-static-v2.spec.ts                PASS（7/7）
pnpm lint                                                                         PASS
pnpm typecheck                                                                    PASS
git diff --check                                                                  PASS
```

- Playwright 覆盖 Feature Flag、V1 隔离、四页访问、`/api/` 请求 0、18 节点、特殊节点、URL 恢复、三步提交、状态联动、三视口无页面横向溢出、console error 0、page error 0。
- lint、build、API 200 或路由存在未被作为 UI 产品通过证据。

#### Decision

`R26_GATE1_IMPLEMENTED / STATIC_V2_ONLY / AWAITING_PRODUCT_OWNER_VISUAL_CONFIRMATION / NO_API_INTEGRATION / NO_DEPLOY / STOP`

人工复核项全部未勾选。Gate 2 未开始；staging/production 未部署；`main` 未合并；tag 未创建。

---

### Round R26_PRODUCT_UI_RECOVERY_GATE1_REMEDIATION

#### Goal And Scope

- 修复 2026-07-23 人工检查发现的第 12 步文字越界、节点行距、箭头粗细、1024 地图可读性、390 工作台裁切和移动流程退化。
- 同时关闭本轮验收发现的筛选口径、提交状态不一致、重复动态和内部 ID 文案问题。
- 继续保持静态 V2、无真实 API、无后端/数据库修改、无部署、无 `main` 合并、无 tag。

#### Exact Changes

- `flow-map.tsx`：判断节点文字居中、固定箭头、移动 18 节点总览、已创建节点标记。
- `r26-v2.css`：线宽 `2.5`、1440 固定画布、1024 370px 抽屉、390 全屏 sheet/工作台主动作/固定提交动作。
- `prototype-store.tsx`、`workspace-page.tsx`：幂等提交、第 06/07/09/10 步和材料 3/3 一致联动、详情结论优先。
- `projects-page.tsx`：冻结五项筛选。
- `progress-page.tsx`、`dashboard-page.tsx`：删除内部 ID、统一主动作和完成文案。
- `next.config.ts`：关闭开发环境调试角标。
- `r26-gate1-static-v2.spec.ts`：新增上述问题的精确回归断言和四段视口录像。

#### Visual And Interactive Evidence

- 1440、1024、390 全部核心页面截图已重生成。
- 新增第 12 步 1024 截图、390 节点总览和第 12 步全屏 sheet 截图。
- 新录像：
  - `employee-progress-flow-1440.webm`
  - `manager-risk-flow-1024.webm`
  - `flow-map-node-and-url-restore-1440.webm`
  - `mobile-flow-and-fullscreen-sheet-390.webm`
- 浏览器真实操作确认风险筛选 1 个项目、第 12 步详情滚动/刷新恢复/关闭、33 秒静态进展提交和跨页联动。
- `docs/product/R26_GATE1_REMEDIATION_REPORT.md`
- `docs/product/R26_GATE1_SCREENSHOT_INDEX.md`
- `docs/product/R26_GATE1_HUMAN_REVIEW.md`

#### Validation

```text
R26 Playwright                                          PASS（7/7）
pnpm install                                            PASS
pnpm lint                                               PASS
pnpm typecheck                                          PASS
pnpm test                                               PASS（Web 84 / API 223）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true pnpm --filter web build PASS
pnpm --filter api build                                 PASS
pnpm --filter api prisma:validate                       PASS
git diff --check                                        PASS
```

- Playwright `/api/` 请求 0、console error 0、page error 0。
- 第 12 步文字边界、连线宽度、箭头尺寸、390 主按钮首屏、390 节点总览、1024 固定画布/抽屉、提交幂等和材料一致性均有自动化门禁。
- 首次 Playwright 默认启动因本机缺少 headless Chromium 缓存而未进入测试；随后使用已安装 Google Chrome 完整重跑 7/7 通过。

#### Decision

`R26_GATE1_PRODUCT_OWNER_ACCEPTED / STATIC_V2_ONLY / MAIN_MERGE_AND_PRODUCTION_DEPLOY_AUTHORIZED / GATE2_NOT_STARTED`

2026-07-23，产品负责人明确回复“先就这样，部署提交合并代码”，接受当前结果并授权提交、合并 `main` 和生产部署。部署前必须创建并验证 PostgreSQL 与配置回滚点；Gate 2 真实数据联调未启动。

---

### Round R26_PRODUCT_UI_RECOVERY_GATE1_PRODUCTION_RELEASE

#### Authorization And Scope

- 产品负责人接受 Gate 1 当前结果，并授权提交、合并 `main` 和生产部署。
- 部署范围仍为隔离静态 V2；不接真实 API、不启动 Gate 2、不创建 stable tag。
- V1 后端业务、数据库、安全修复和正式入口保持。

#### Merge, Rollback Points And Deploy

- Gate 1 修复提交：`b5f737ec163021608e9643ea83c62b92ecacbfe2`。
- 生产预取修复提交：`619f879`。
- 分支：`main`；V2 生产开关：`true`。
- PostgreSQL 备份：`/var/backups/feishu-timeline-db/20260723T080006Z/feishu-timeline.dump`。
- 备份 checksum、catalog 和隔离恢复演练全部 PASS；恢复核对 41 表、12 用户、1 项目、22 审计日志。
- 配置快照：`/var/backups/feishu-timeline-release/20260723T080121Z`；权限与 checksum PASS。
- Prisma 18 migrations、0 pending；五项服务 active；正式入口验收 PASS。

#### Production UI Evidence

- 四个 V2 正式路由均为 200；匿名 `/api/projects` 为 401。
- 第一轮浏览器复验发现未开放入口自动预取产生 404；修复并重部署后 404 清零。
- 1440 完成风险筛选、节点 12 刷新恢复/关闭、节点 17/18 和静态三步提交。
- 1024 固定图与抽屉可用、无横向溢出。
- 390 当前任务首屏、18 节点移动总览、390×844 全屏 sheet 和表单下一步可用。
- 最终 console error、page error、4xx 资源、`/api/` 请求均为 0。
- 禁止文案 `DEMO-ACTIVE`、`DEMO-COMPLETE`、`demo-r26 · t006` 均未出现。

#### Evidence

- `docs/release/R26_V2_PRODUCT_UI_PRODUCTION_RELEASE.md`
- `test-results/r26-production/screenshots/`（18 张，Git ignored）
- `test-results/r26-production/videos/`（3 段，Git ignored）

#### Decision

`R26_GATE1_STATIC_V2_DEPLOYED / PRODUCT_OWNER_ACCEPTED_AS_IS / GATE2_NOT_STARTED / NO_STABLE_TAG`

---

### Round R26_PRODUCT_UI_RECOVERY_SCROLL_AND_NAV_FIX

#### Production Feedback

- 100% 初始缩放时，地图区域吞掉页面纵向滚轮；75% 后恢复 100% 才正常。
- 主导航要求“项目管理”改为“项目列表”，“复盘分析”改为“系统管理”。

#### Root Cause And Change

- `.r26-map-scroll` 的 `overflow:auto` 与
  `overscroll-behavior:contain` 将纵向滚动锁在没有纵向滚动范围的内层容器。
- 改为横向滚动容器，纵向 overscroll 使用 `auto`，允许页面立即接管滚轮。
- 新增 100% 初始状态地图悬停滚轮回归门禁。
- 项目工作区面包屑/返回文案同步为“项目列表”；“系统管理”禁用入口指向
  `/v2/admin`，不再保留错误的复盘路由目标。

#### Local Validation

```text
web lint                               PASS
web typecheck                          PASS
web test                               PASS（84）
web production build                   PASS
R26 Playwright                         PASS（7/7）
git diff --check                       PASS
```

#### Decision

生产部署后专项浏览器复验：

- 正式页面初始缩放为 100%，未执行任何缩放操作；
- 鼠标位于地图内执行 600px 纵向滚轮，页面 `scrollY: 0 → 600`；
- 主导航为“工作台 / 项目列表 / 我的任务 / 进展提交 / 系统管理”；
- `/v2/admin` 保持禁用且不触发预取；
- 4xx 资源、console error、page error 均为 0；
- 证据：`test-results/r26-production/screenshots/workspace-initial-scroll-fixed-1440.png`。

`R26_SCROLL_FIX_DEPLOYED / NAV_COPY_UPDATED / PRODUCTION_VERIFIED / GATE2_NOT_STARTED`

---

### Round R26_PRODUCT_UI_RECOVERY_GATE2_READ_ONLY_REAL_DATA_INTEGRATION

#### Goal And Scope

- 将四个隔离 V2 页面连接到独立 staging 的 PostgreSQL 真实只读数据。
- 在项目工作区新增只读“项目成员与分工”和“自动分配预览”。
- 业务网络请求严格限制为 GET；不修改 V1、状态机、数据库业务数据或 production。

#### Exact Changes

- `apps/api/src/modules/r26-read-model/`：五个 GET-only 聚合接口、18 节点分配规则、
  权限门禁与契约测试。
- `apps/web/src/features/v2/r26-readonly-client.ts`：固定 GET、无 body、限 `/v2/*`
  路径的客户端。
- `apps/web/src/features/v2/real-*.tsx`：真实工作台、项目列表、固定流程地图、详情、
  项目成员与分工、自动分配预览和只读进展上下文。
- `deploy/compose.staging.yml` 与 staging env 示例：显式
  `NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real`，未修改 production 配置。
- `docs/product/evidence/R26_GATE2/`：1440、1024、390 共 12 张有效截图；浏览器
  产生的空白全页截图已剔除。
- `docs/product/R26_GATE2_READ_ONLY_REAL_DATA_REPORT.md`：完整证据和人工复核清单。

#### Read-only And Real-data Evidence

- API Controller 只有五个 `@Get`；前端客户端测试断言 `method=GET` 且无 body。
- Playwright 运行时完成真实页面点击、滚动、抽屉关闭、刷新恢复和移动全屏 sheet。
- nginx 日志最终快照：`/api/v2/* GET 53`；POST/PUT/PATCH/DELETE 均为 0。
- 页面 `data-source=database`，Gate 1 fixture 渲染命中数 0。
- 18 个流程节点、7 个项目成员和 18 行自动分配预览来自 staging 数据库。
- 长期 skeleton、console error、page error 均为 0。

#### Validation

```text
pnpm install --frozen-lockfile                                      PASS
pnpm lint                                                           PASS
pnpm typecheck                                                      PASS
pnpm test                                                           PASS（Web 87 / API 225）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
pnpm --filter @feishu-timeline/web build                            PASS
pnpm --filter @feishu-timeline/api build                            PASS
pnpm --filter @feishu-timeline/api prisma:validate                  PASS
```

- Docker Hub metadata 拉取超时后，使用本机通过检查的构建产物生成 staging 临时镜像；
  只重建 staging API/Web，未运行 migration 或 seed。
- staging API、Web、nginx healthy；production 未部署。

#### Decision

```text
R26_GATE2_IMPLEMENTED
READ_ONLY_REAL_DATA_CONNECTED
ZERO_BUSINESS_WRITE_REQUESTS
AWAITING_PRODUCT_OWNER_REAL_DATA_CONFIRMATION
STOP_BEFORE_GATE3
```

## 2026-08-07 — R26 颜色数据库完整模拟与第 05 步受控编号闭环

### 目标与范围

- 核实颜色数据库起始记录为 0 是否为真实业务结果，而不是页面读取错误。
- 在本机隔离测试数据中完成第 05 步“新颜色取号”，验证唯一编号、确认材料、操作人、时间、审计及颜色数据库回读。
- 验证搜索、清除、空态、1440/1024/390 布局和控制台错误。
- 不修改 production，不合并 main，不创建 tag。

### 环境身份

```text
environment       local-isolated-simulation
exact URL         http://localhost:8080/admin/color-database
web upstream      http://localhost:3100
api upstream      http://localhost:3201/api
database          PostgreSQL feishu_timeline @ localhost:15432
source HEAD       2081c3920bb5c41578ef9c189477d05f392896ad
runtimeCommit     unknown
release           development
production        unchanged
```

运行元数据无法证明不可变 commit，因此本轮状态不是 `STAGING_DEPLOYED` 或
`PRODUCTION_DEPLOYED`，只能是本机隔离模拟和浏览器验证。

### 起始数据判断

- 数据库有 2 条旧颜色和自由编号，但没有 `numberingTaskId`、`numberedById`、
  `numberedAt`、`numberingAttachmentId` 及已完成第 05 步来源。
- 严格受控颜色数量为 0；颜色数据库显示 0 正确。
- 旧记录 `星云蓝 / CLR-DEMO-A-001` 与 `极昼银 / CLR-DEMO-C-001` 均未被错误纳入。

### 模拟结果

```text
颜色总行数                    5
严格受控颜色                  3
颜色数据库可见记录            3
确认材料                      3
第 05 步完成审计              3
重复编号新建行                0
重复编号任务最终状态          READY / active
```

成功记录：

1. `R26-UAT-1786081484809-5E2149`，任务
   `cmsiisthv001dqr01hpik44h6`，确认材料
   `cmsiistz8001jqr01875asfn6`。
2. `R26-UAT-1786081988039-FBB59C`，任务
   `cmsij3m2g003xqr01u378sxah`，确认材料
   `cmsij3m9s0043qr015v00j0lb`。
3. `R26-UAT-1786104170349-6B17A8`，任务
   `cmsiwb1zq008eqr010klfe939`，确认材料
   `cmsiwb27f008kqr0184cxtxe0`。

重复编号场景保持第 05 步为 `READY`，未创建颜色记录，数据库中该编号仍为唯一一条。

### 浏览器验收

- 精确 URL 搜索单一编号只返回目标记录。
- 无匹配查询显示空态，清除后恢复完整记录。
- 1440px 两张截图已保存。
- 1440px 截图拍摄时为两条记录；最终第三条由通过的 Playwright、API 回读与数据库查询证明，未伪称存在第三条截图。
- 1024px 与 390px 实测无横向溢出且完整导航可见；本轮未成功保存这两档截图，
  因此只登记布局测量，不登记截图通过。
- `console error=0`、`page error=0`。

### 技术检查与门禁

```text
API focused tests                         21/21 PASS
API build                                 PASS
Prisma validate                           PASS
Web typecheck                             PASS
Web build                                 PASS (33 pages)
目标路由 Placeholder                      0
仓库 Placeholder 原始扫描匹配             22
Playwright 完整门禁                        1/1 PASS (5.2s)
```

Playwright 第一次因测试读取了错误的扁平附件字段失败；第二次因重复编号中文提示正则过窄失败。
两次业务写入/拒绝及数据库结果均符合预期，并按“两次失败停止”规则记录 Blocker。
用户随后明确要求继续；修正断言后只执行一次有界复核，最终 `1/1 PASS (5.2s)`，
同时验证正常编号、同幂等键重放、重复编号拒绝、颜色数据库精确查询及最终三条受控记录。

### 证据

- `docs/product/R26_COLOR_DATABASE_SIMULATION_BLOCKER_REPORT.md`
- `docs/product/R26_COLOR_DATABASE_SIMULATION_REPORT.md`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-api-simulation.json`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/02-controlled-numbering-database-evidence.json`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/03-color-database-two-controlled-1440.png`
- `docs/product/evidence/R26_COLOR_DATABASE_SIMULATION_20260807/04-color-database-search-match-1440.png`

### Decision

```text
COLOR_DATABASE_BASELINE_ZERO_CONFIRMED
STEP05_CONTROLLED_NUMBERING_BUSINESS_PATH_VERIFIED_LOCALLY
THREE_CONTROLLED_COLOR_RECORDS_VISIBLE_IN_LOCAL_READ_MODEL
DUPLICATE_COLOR_CODE_REJECTED
IDEMPOTENCY_VERIFIED
MATERIAL_AND_AUDIT_PROVENANCE_VERIFIED
PLAYWRIGHT_GATE_PASSED
LOCAL_BROWSER_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_RESPONSIVE_NAV_FIX_20260807

#### Goal And Scope

- 修复共享 V2 外壳在 `768–920px` 宽度区间主导航完全消失的问题。
- 覆盖工作台、项目列表、项目工作区、新建项目、我的任务与系统管理路由。
- 仅重建并验证本机 Docker staging；不提交、不部署 production、不修改 main/tag。

#### Root Cause And Changes

- 旧 CSS 在 `max-width:920px` 隐藏顶部导航，而移动导航只在
  `max-width:767px` 显示，造成中间断点空窗。
- 新增 `768–920px` 紧凑顶部导航；`<=767px` 明确切换移动导航。
- 新增 `v2-shell-responsive.contract.test.ts` 固化断点契约。

#### Validation

```text
pnpm --filter web lint       PASS
pnpm --filter web typecheck  PASS
pnpm --filter web test       PASS（48 files / 188 tests）
pnpm --filter web build      PASS
```

- 本机真实浏览器验证八个共享外壳路由；900px 下四项顶部入口完整显示且当前项正确。
- 1440、1024、920、900、768、767、390 七个宽度均无导航缺失或页面级横向溢出。
- 767px 下真实点击“我的任务”进入 `/tasks`；console/page error 为 0。
- 证据：`docs/product/R26_RESPONSIVE_NAV_FIX_20260807.md`。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
LOCAL_STAGING_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_PROJECT_SEARCH_AND_HEADER_ACTION_FIX_20260807

#### Goal And Scope

- 修复 `/projects` 顶部搜索图标只跳到页面顶部、没有真实搜索交互的问题。
- 排查并回归顶部通知、帮助和账号菜单，避免保留无实际动作的图标。
- 限定为本机 Docker staging 验证；不提交、不推送、不部署 staging/production。

#### Exact Changes

- 正式 V2 项目列表增加真实搜索表单、URL 关键字持久化、刷新恢复和清除。
- 真实列表通过 GET `keyword` 查询，不在前端伪造生产结果。
- 修复请求取消竞态，过期请求不再覆盖最新筛选结果。
- 顶部搜索入口聚焦搜索框；通知改为真实通知中心；帮助进入 `/guide`；账号菜单保持真实退出入口。

#### Validation

```text
pnpm --filter web lint       PASS
pnpm --filter web typecheck  PASS
pnpm --filter web test       PASS（47 files / 185 tests）
pnpm --filter web build      PASS
git diff --check             PASS（目标文件）
```

#### Browser Evidence

```text
URL=http://localhost:8080/projects?focus=search
查询关键字=成员分工-20260724-1006
筛选结果=1
刷新恢复=PASS
清除恢复=17
通知中心=PASS
帮助页面=/guide PASS
账号菜单=PASS
console error=0
```

- Screenshot：`docs/product/evidence/R26_PROJECT_SEARCH_FIX_20260807/projects-search-filtered.png`。
- Web image digest：`sha256:df48a14bf346174e3a9a576a361037bd1a239743efadea8e7dd9c7845f91bdb9`。
- API runtime metadata 仍为 `unknown/development`，本轮不使用 `DEPLOYED`。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

### R26 公司部门负责人文字输入（2026-08-06）

#### 目标与范围

- 将 `/admin/organization` 新增/编辑部门面板中的“部门负责人”由固定选项改为姓名文字输入。
- 保留真实用户外键、部门成员关系、权限、乐观锁、幂等、事务和审计边界。
- 本轮不提交、不推送、不部署 production，不修改数据库业务数据。

#### 实现

- Web 表单提交 `leadUserName`，不再提交前端选择的 `leadUserId`。
- API 按启用系统用户姓名精确匹配：唯一匹配后写入真实用户 ID；无匹配或同名多匹配时拒绝写入并返回明确原因。
- 留空负责人仍表示“待设置”；已有负责人按姓名回填。
- 新增 Web/API 契约回归，防止负责人字段退回为下拉框或由前端提交用户 ID。

#### 验证

```text
pnpm install --frozen-lockfile                         PASS
pnpm lint                                              PASS
pnpm typecheck                                         PASS
pnpm test                                              PASS（Web 180 / API 329）
pnpm --filter web build                                PASS
pnpm --filter api build                                PASS
pnpm --filter api prisma:validate                      PASS
git diff --check                                       PASS
```

- 精确本机 URL：`http://localhost:8080/admin/organization`。
- 真实浏览器打开“涂装工艺部”编辑面板：负责人文本框 `1` 个、同名下拉框 `0` 个；键入“演示工艺工程师”成功。
- 点击“取消”退出，未保存、未改变业务数据。
- 本机镜像 tag：`local-department-lead-name-input-20260806`。
- production、main 和 tag 均未改变。

#### 当前状态

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_NOT_CHANGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_STEP05_CONTROLLED_COLOR_NUMBERING

#### Goal And Scope

- 将颜色编号固定为第 05 步“新颜色取号”的受控完成结果。
- 由后端在同一完成事务中校验编号唯一性、确认材料和任务状态，并写入编号任务、操作人、时间和材料来源。
- 颜色数据库及其他业务读模型只读取来源完整且可验证的正式编号。
- 本轮不应用数据库迁移，不改变 staging、production、main 或 tag。

#### Exact Changes

- Prisma `Color` 新增 `numberingTaskId`、`numberedById`、`numberedAt`、
  `numberingAttachmentId` 及唯一键、索引和外键迁移。
- 第 05 步完成预览和完成命令新增颜色编号；缺少编号、缺少确认材料或编号重复时由服务端明确拒绝。
- 编号及来源与工作流推进、活动和审计记录在同一 Serializable 事务内提交。
- V2 完成面板新增颜色编号输入、验证反馈和成功来源展示。
- 颜色数据库严格过滤未验证的历史自由编号；其他业务读模型统一使用受控编号判断。

#### Validation

```text
pnpm install --frozen-lockfile                       PASS
pnpm lint                                            PASS
pnpm typecheck                                       PASS
pnpm test                                            PASS（Web 178 / API 327）
pnpm --filter web build                              PASS
pnpm --filter api build                              PASS
pnpm --filter api prisma:validate                    PASS
git diff --check                                     PASS
```

#### Evidence And Decision

- 实施报告：`docs/product/R26_STEP05_CONTROLLED_COLOR_NUMBERING_20260805.md`。
- 数据库迁移尚未应用，因此尚未执行浏览器写入与重新读取验收。

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
DATABASE_MIGRATION_NOT_APPLIED
BROWSER_E2E_NOT_RUN
NOT_DEPLOYED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### 2026-08-05 R26_ADMIN_ORGANIZATION_BUSINESS_DIVISIONS

#### Goal And Scope

- 将公司部门的“所属事业部”候选池固定为产品指定的六个事业部。
- 同时约束前端候选项、服务端预校验、正式事务、migration 和 seed。
- 仅更新本机 `http://localhost:8080/admin/organization`；未提交、未推送、未部署 production。

#### Exact Changes

- 新增六项不可变业务清单：技术中心、商用车营销事业部、乘用车营销事业部、制造中心、
  国际事业部、采购中心。
- 新增 Prisma 数据 migration，写入六个顶层参考组织；公司部门列表排除这些参考行。
- API `directory.businessDivisions` 按产品顺序返回启用且编码/名称精确匹配的六项。
- 新增/编辑部门只渲染该返回值；历史归属不合法时显示必选提示，不默认选中第一项。
- API 预校验与事务提交均拒绝缺失、停用或六项以外的所属事业部。

#### Local Evidence

```text
URL                 http://localhost:8080/admin/organization
user                李晓晨
API image           feishu-timeline-api:local-business-divisions-20260805
Web image           feishu-timeline-web:local-business-divisions-20260805
API/Web health      healthy / healthy
runtimeCommit       unknown（本机脏工作树构建，不作为 DEPLOYED 证据）
business divisions  6 / 6
database parentId   six rows are ROOT
production          unchanged
```

- 真实点击“公司部门 → 编辑部门”后，下拉框只出现六个产品指定事业部。
- 旧“项目管理部”的原归属“总部”不在清单时，面板显示“请选择所属事业部”。
- 交互细节记录：`docs/product/R26_BUSINESS_DIVISIONS_20260805.md`。

#### Validation

```text
pnpm install                         PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 45 files / 177 tests；API 69 files / 318 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
Placeholder total / target route     22 / 0
Prisma migrations                    24 applied / 0 pending
```

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_NOT_CHANGED
MAIN_NOT_CHANGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_PRODUCTION_RELEASE_20260730

#### Goal And Scope

- 将已合并到 `main` 的 R26 最新代码部署到
  `https://timeline.all-too-well.com`。
- 验证运行版本、飞书登录、生产核心页面、管理页面和三档响应式。
- 保留 OAuth state、Cookie、权限和数据库安全边界；不通过放宽校验修复登录。

#### Deployment Identity

```text
environment             production
hostname                timeline.all-too-well.com
runtime commit          bea6dc6f5f6a6d76bdc724d4e2c0e7792ed9fd19
build time              2026-07-30T01:40:32Z
release                 r26-admin-bea6dc6f5f6a
web build ID            Qsu1hxr1F9k3dDvIqDFvd
api dist SHA-256        3606f40d6149526a10136daf18d98b7b8b5f675485f74ba17ab7621e633e0be7
database                feishu_timeline
migrations              23 applied / 0 pending
nginx upstreams         127.0.0.1:3000 / 127.0.0.1:3001
```

生产 PostgreSQL 备份：
`/var/backups/feishu-timeline-db/20260730T013223Z/feishu-timeline.dump`，
SHA-256
`9d7f52e8abcc15c82a569f0b2fe7e8f51122ade0b53173363a546d91d7f7d392`。

#### OAuth Recovery

- 首次回调在生产页面复现为“飞书登录状态无效，请重新发起登录”。
- 服务端在 token exchange 之前拒绝无效 state，未改动安全校验。
- 从同一生产浏览器标签重新发起授权后，成功建立李晓晨的飞书会话并进入
  `/projects`。
- 失败和成功证据均未保存 code、state、Cookie、token 或 Secret。

#### Production Browser Evidence

- 已验证工作台、项目列表、项目工作区、系统管理首页、进入管理、项目台账、工序
  台账、组织与人员、分工配置、角色权限、审计日志和颜色数据库。
- 已真实点击“打开项目”“进入管理”“角色权限”和“编辑”；权限编辑器打开成功，
  未提交生产写入。
- 1440、1024、390 三档页面级横向溢出为 0。
- 新建生产验收标签的 console/page error 为 0。
- 证据：`docs/product/evidence/R26_PRODUCTION_RELEASE_20260730/`。
- 路由矩阵：`docs/acceptance/ROUTE_ACCEPTANCE_MATRIX.md`。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_DEPLOYED
PRODUCTION_USER_LOGIN_VERIFIED
PRODUCTION_CORE_READ_PATHS_VERIFIED
MAIN_MERGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```

---

### Round R26_MAIN_MERGE_AND_PRODUCTION_DEPLOYMENT_ATTEMPT_20260730

#### Goal And Scope

- 将 `codex/r26-remove-three-pages` 的全部已验证更新快进合并到 `main` 并推送 GitHub。
- 在部署 `timeline.all-too-well.com` 前备份生产 PostgreSQL，然后从已推送的不可变
  `main` commit 构建、迁移、部署并执行正式域名浏览器验收。

#### Git Result

```text
source branch       codex/r26-remove-three-pages
source commit       fe0600842d57f649757171ca48cee5b9fef7381c
merge method        fast-forward only
origin/main         fe0600842d57f649757171ca48cee5b9fef7381c
tag                 unchanged
```

#### Local Validation Reused For Immutable Commit

```text
pnpm install                         PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 45 files / 172 tests；API 68 files / 312 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

- Placeholder 原始扫描命中 22 条；正式历史占位路由仍包括 `/reviews`、`/settings`、
  `/colors` 和 `projects/[projectId]/[section]`，因此不得宣称这些路由完成。

#### Production Pre-deployment Evidence

```text
environment          production
URL                  https://timeline.all-too-well.com
hostname             timeline.all-too-well.com
API runtimeCommit    c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
Web runtimeCommit    c0a0dc83b6a133403e6c4ed81bcd3f7a65a282f0
buildTime            2026-07-25T13:51:54Z
release              r26-admin-c0a0dc83b6a1
```

#### Blocker Report

```text
gate                 production SSH/SCP connectivity before database backup
attempt 1            gcloud compute scp closed by 35.212.246.199:22
attempt 2            gcloud compute ssh closed by 35.212.246.199:22
database backup      NOT_CREATED
database migration   NOT_EXECUTED
production deploy    NOT_EXECUTED
production browser   NOT_EXECUTED
production changed   NO
```

- 两次失败均发生在远端 SSH 握手/连接阶段，`pg_dump` 未开始，未接触或修改生产数据。
- 按 `AGENTS.md` 两次失败停止规则，本轮不得第三次盲目尝试，也不得绕过备份部署。
- 下一方案：检查 GCE SSH/OS Login/防火墙/实例状态，或明确验证 IAP 隧道后，在新一轮先
  重新完成数据库备份，再部署当前 `origin/main`。

#### Decision

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
MAIN_MERGED
PRODUCTION_NOT_DEPLOYED
BLOCKER_REPORT
AWAITING_PRODUCTION_CONNECTIVITY_RECOVERY
```

---

### Round R26_FLOW_MAP_TEXT_SAFE_AREA_FIX

#### Goal And Scope

- 修复固定流程地图第 18 步文字与圆角边框距离过小的问题，并逐一检查全部 18 个节点。
- 将第 18 步详情面板主动作从“办理颜色退出”收敛为“颜色退出”。
- 不改变冻结的 `1440 × 1740` 画布、节点坐标、节点尺寸、流程连线或后端状态机。

#### Exact Changes

- 普通、月度和终止节点的标题、负责人、截止时间基线统一增加上下安全区。
- “已创建”角标只在尚未开始或待处理的普通/支线节点显示；完成态以及第 12、17、18 步
  不再重复显示该角标，避免角标与状态、标题或圆角边框冲突。
- 第 18 步终止节点使用独立文字内边距；详情面板主动作更新为“颜色退出”。
- 新增节点角标显示规则单元测试，并同步更新既有真实数据一致性契约测试。

#### Browser Evidence

```text
staging URL                  http://localhost:8080
project                      cmrz2ldw60001o0019ks1qv0h
flow nodes                   18 / 18
text overlaps                0
step 12 diamond max ratio    0.9（< 1，文字全部位于菱形内部）
step 18 minimum inset        11.5px
new button label count       1
old button label count       0
console warnings/errors      0 / 0
```

- 使用已登录真实会话打开项目工作区，点击第 18 步并检查流程地图内部滚动、选中态、详情抽屉和
  主动作。
- 第 15～18 步在同一可视区域内无文字重叠；第 18 步选中描边与文字之间保留清晰空隙。

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 43 files / 164 tests；API 67 files / 307 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

#### Decision

```text
R26_FLOW_MAP_TEXT_SAFE_AREAS_FIXED
ALL_18_FLOW_NODES_CHECKED
COLOR_EXIT_ACTION_LABEL_CORRECTED
LOCAL_STAGING_VERIFIED
PRODUCTION_NOT_DEPLOYED
```

---

### Round R26_ACCOUNT_MENU_OVERLAY_FIX

#### Goal And Scope

- 修复项目工作区滚动后，右上角账号菜单被固定工序详情抽屉遮挡的问题。
- 账号菜单展开时必须位于工序详情、完成确认等工作流弹层之上；关闭后恢复正常顶部栏层级。
- 不修改登录/退出接口、流程状态机、数据库、V1 或 production。

#### Exact Changes

- 保留顶部栏默认 `z-index: 80`，仅在 `.r26-account-menu[open]` 时将顶部栏提升至
  `z-index: 1200`，高于工作流抽屉遮罩的 `z-index: 1000`。
- 新增弹层层级契约测试，防止后续抽屉样式再次覆盖账号菜单。

#### Browser Evidence

```text
staging URL                      http://localhost:8080
project                          cmrz2ldw60001o0019ks1qv0h
selected node                    第 18 步 · 颜色退出
page scrollY                     1342px
account/workflow overlap height  143px
open account header z-index      1200
workflow drawer layer            <= 1000
top element in overlap           r26-account-popover__identity
logout action visible/clickable  PASS
console warnings/errors          0 / 0
```

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 44 files / 165 tests；API 67 files / 307 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

#### Decision

```text
R26_ACCOUNT_MENU_OVERLAY_FIXED
LOGOUT_ACTION_REMAINS_ACCESSIBLE_ABOVE_WORKFLOW_DRAWERS
LOCAL_STAGING_VERIFIED
PRODUCTION_NOT_DEPLOYED
```

---

### Round R26_REMOVE_THREE_REDUNDANT_PAGES

#### Goal And Scope

- 按产品负责人决定移除独立进展提交、流程模板管理、基础字典管理三个页面及其专属代码。
- 保留流程状态机、模板/字典内部业务约束、历史进展、材料和审计记录。
- 不修改 Prisma schema、migration、数据库业务数据或 production。

#### Exact Changes

- 删除 `/progress`、`/v2/progress`、`/legacy/progress` 页面及专属组件、客户端和测试。
- 主导航收敛为“工作台 / 项目列表 / 我的任务 / 系统管理”；原进展 CTA 统一进入项目工序。
- 删除 `/admin/workflow-templates`、`/admin/dictionaries` 的导航、页面分支、客户端与后台管理 API。
- 保留项目、工序、组织、分工、权限和审计后台；后台概览改为显示启用角色。
- 更新路由契约、组件契约、E2E 路径和验收矩阵。

#### Safety Boundaries

- 数据库结构和业务数据写入：0。
- production 请求与部署：0。
- 历史进展、材料、项目记录和审计日志未删除。
- 工作流推进继续只由后端状态机裁决。

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 42 files / 162 tests；API 67 files / 307 tests）
pnpm --filter web build              PASS（构建路由清单不含三个已移除页面）
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
browser staging regression           PASS（7 个移除地址 404；8 个保留页面正常；console/page error 0）
```

#### Staging Evidence

- 移除地址：`/progress`、`/v2/progress`、`/legacy/progress`、
  `/admin/workflow-templates`、`/v2/admin/workflow-templates`、
  `/admin/dictionaries`、`/v2/admin/dictionaries` 均返回 404。
- 保留页面：工作台、项目列表、我的任务、系统管理、组织与人员、项目分工配置、
  审计日志、项目工作区均由真实浏览器正常加载。
- 正式主导航仅保留“工作台 / 项目列表 / 我的任务 / 系统管理”。
- 项目列表“新建项目”和工作台“打开当前工序”继续可用；项目工作区仍显示 18 步流程地图。
- 浏览器 console/page error 为 0；production 请求为 0。
- staging 未运行 seed；迁移检查结果为 23 applied / 0 pending，业务数据写入为 0。

#### Decision

```text
R26_THREE_REDUNDANT_PAGES_REMOVED
RETAINED_ROUTES_AND_CORE_WORKSPACE_VERIFIED
STABILITY_CHECKS_PASSED
PRODUCTION_NOT_DEPLOYED
```

---

### Round R26_ADMIN_ASSIGNMENT_EDITABLE_GRID

#### Goal And Scope

- 将 `/admin/assignments` 从只读责任矩阵升级为多字段、可预览、可审计的受控编辑表。
- 继续复用 Gate 3A 服务端分配规则，不在前端建立第二套负责人推导逻辑。
- 只部署独立 staging 供产品负责人验收；不部署 production，不合并 `main`，不创建
  tag。
- 对产品负责人提供的飞书 Wiki 多维表格只做结构确认，不修改表格、协作者或权限。

#### Exact Changes

- 支持主责部门、默认负责人、协同人员、评审人员、生效范围和变更原因六类字段；
- 单元格和行级“编辑分工”均进入统一受控编辑面板；
- 新增分工 preview/command 接口，保存必须经过权限、项目成员、部门、节点类型、
  `expectedVersion` 和 `Idempotency-Key` 校验；
- 在单个 Prisma 事务内更新项目节点分工、递增分工版本并写入
  `ADMIN_PROJECT_NODE_ASSIGNMENT_CHANGED` 审计；
- 前端不提交下一节点、项目状态或任务状态；
- 已配置的主责部门优先于静态节点规则，后续服务端分配继续复用 Gate 3A 优先级；
- 本地登录页只在服务端明确返回 `mockEnabled=true` 时展示隔离测试入口；
- 修复登录能力标志与 loading 边界异步提交导致的瞬时错误提示；
- 飞书接入边界记录在
  `docs/product/R26_FEISHU_BITABLE_INTEGRATION_BOUNDARY.md`。

#### Local Real-Data Evidence

```text
18 fixed workflow nodes                     PASS
fixture rows                                0
preview writePerformed                      false
project assignment version                  1 -> 2 -> 3
refresh persistence                         PASS
stale concurrent editor                     409 / blocked
anonymous admin request                     401
ordinary employee admin request             403
assignment audit record                     PASS
console/page error                          0
production request                          0
```

- 本机开发库通过 Prisma 正式 migration
  `20260725183000_r26_admin_control_center` 补齐管理命令和保存视图表；未手改数据库表。
- 首次保存配置到第 1 步，刷新后主责部门和负责人保持。
- 两个页面同时读取版本 2；先保存页面递增到版本 3，旧页面预览被明确拒绝，没有覆盖
  新值。
- 证据目录：`docs/product/evidence/R26_ADMIN_ASSIGNMENT_GRID/`。

#### Validation

```text
pnpm install                         PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 44 files / 172 tests；API 67 files / 301 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

#### Decision

```text
R26_ADMIN_ASSIGNMENT_EDITABLE_GRID_IMPLEMENTED
NATIVE_PREVIEW_FIRST_ASSIGNMENT_EDITOR_READY
FEISHU_BITABLE_NOT_CONNECTED_OR_MODIFIED
AWAITING_PRODUCT_OWNER_STAGING_CONFIRMATION
STOP_BEFORE_PRODUCTION
```

---

### Round R26_ADMIN_DEPLOYMENT_TRUTH_AUDIT

#### Goal And Scope

- 只读确认 `a2296dd` 实际部署环境，以及公开生产
  `https://timeline.all-too-well.com/admin/dictionaries` 仍显示后台骨架页的原因。
- 不修改应用代码、不部署 production、不修改 production 数据、不合并 `main`、
  不创建 tag。
- 将本轮发现的交付真相与产品验收纪律固化到根目录 `AGENTS.md`。

#### Evidence

```text
candidate commit
  a2296dd17c6e07f4214484360021afffb2dc09c7
candidate remote branch
  origin/codex/r26-admin-table-control-center

local staging URL
  http://localhost:8080
local staging Web/API/PostgreSQL image
  a2296dd17c6e
local staging /admin/dictionaries
  真实 PROJECT_STATUS 5 行 + 4 项系统参数

production URL
  https://timeline.all-too-well.com
production server HEAD
  94d6fd01d8840416fb7154d302970d0a94a0c995
production branch
  master
production origin/main
  94d6fd01d8840416fb7154d302970d0a94a0c995
production a2296dd object
  missing
production admin control Web/API source
  missing / missing
production /admin/[section] component
  PagePlaceholder
production placeholder build matches
  3
production nginx
  / -> 127.0.0.1:3000
  /api/ -> 127.0.0.1:3001
```

- production 的源码和实际 `.next` 构建均包含“已创建骨架”“后续按权限展示”等文案。
- production Web/API systemd 进程均从 `/opt/feishu_timeline_app` 启动，Nginx upstream
  正确；根因不是错误 upstream 或浏览器缓存，而是 production 运行了不含后台控制
  中心的旧 commit。
- `a2296dd` 的 `/admin/[section]` 已改为 `AdminControlCenter`，但只部署在本机 staging。

#### Decision

```text
CODE_IMPLEMENTED=YES
LOCAL_STAGING_DEPLOYED=YES
LOCAL_STAGING_USER_PATH=PASS
PRODUCTION_DEPLOYED=NO
PRODUCTION_USER_PATH=FAIL
ROOT_CAUSE=WRONG_RUNTIME_COMMIT_NOT_CONTAINING_ADMIN_CONTROL_CENTER
CURRENT_STATUS=DEPLOYED_TO_DIFFERENT_STAGING
PRODUCT_ACCEPTANCE=FAIL
STOP_BEFORE_PRODUCTION_FIX
```

---

### Round R26_ADMIN_TABLE_CONTROL_CENTER

#### Goal And Scope

- 将仅有视觉入口和占位页的系统管理后台改造成真实数据、表格驱动的控制中心。
- 复用现有项目、任务、Gate 3A 分配、流程模板、权限和审计服务。
- 只部署独立 staging；不修改 V1、production、`main` 或 tag。

#### Exact Changes

- Prisma：新增管理员保存视图与管理命令幂等记录及 migration。
- API：新增项目/工序/组织/分工/RBAC/模板/字典读模型；新增基础信息、日期、分工、
  用户状态、字典与模板版本明确命令。
- 批量与导入：最多 100 条原子批量预检/写入；正式 CSV 模板、dry-run、确认导入；
  CSV 导出公式注入防护。
- Web：九个后台入口、服务端分页筛选排序、精简/完整列、保存视图、详情面板、
  影响预览、批量选择、导入导出和 390 只读卡片。
- 状态机：项目状态、任务状态、当前节点、实际完成时间及第 12/13/17/18 步结论
  均无直接编辑接口。
- 报告：`docs/product/R26_ADMIN_TABLE_CONTROL_CENTER_REPORT.md`。
- 人工验收：`docs/product/R26_ADMIN_TABLE_CONTROL_CENTER_HUMAN_REVIEW.md`。
- 证据：`docs/product/evidence/R26_ADMIN_TABLE_CONTROL_CENTER/`。

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 44 files / 170 tests；API 66 files / 298 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

#### Staging Evidence And Remediation

- migration `20260725183000_r26_admin_control_center` 已应用，22 项 migration、
  0 项待执行，未运行 seed。
- 真实飞书管理员会话完成九个后台入口与 1440/1024/390 三档浏览器检查。
- 修复 `/admin/*` 被旧页面壳二次包裹、项目进度只统计活动任务、流程分支类型误判、
  保存视图查询参数未恢复、表单字段相互覆盖、预览技术字段直出等问题。
- 计划日期执行一次受控变更并恢复原值；`admin_command_requests` 与 `audit_logs`
  各有 2 条 `ADMIN_TASK_SCHEDULE_CHANGED`。
- 不可执行的分工预览会展示精确阻断原因，确认按钮同步禁用。
- 移动端只保留查询与只读卡片，隐藏保存视图、完整列、导入和批量写操作。
- 审计页纳入统一后台导航并修复页边距，常见动作、对象和结果改为中文。
- 主导航逐页唯一高亮：工作台、项目列表、我的任务、进展提交、系统管理。
- console/page error 为 0；所有验收请求仅指向本机 staging，production 请求为 0。

证据归档：`docs/product/evidence/R26_ADMIN_TABLE_CONTROL_CENTER/`。

#### Decision

```text
R26_ADMIN_TABLE_CONTROL_CENTER_IMPLEMENTED
REAL_ADMIN_TABLES_CONNECTED_ON_STAGING
CONTROLLED_WRITES_AND_AUDIT_VERIFIED
RESPONSIVE_READ_ONLY_MOBILE_VERIFIED
AWAITING_PRODUCT_OWNER_ADMIN_CONFIRMATION
STOP_BEFORE_PRODUCTION
```

---

### Round R26P11_UNIFIED_NAVIGATION_MATRIX

#### Goal And Scope

- 逐域修复正式页面顶层导航名称和激活态。
- 两套页面壳统一使用“项目列表”“系统管理”。
- 项目、任务、进展/材料和系统管理的所有子页面均高亮所属顶层入口。
- 不改变页面业务、流程状态或数据库数据。

#### Root Cause And Fix

- V2 核心页与旧业务子页分别维护导航名称和路由匹配，旧页面仍显示
  “项目管理 / 复盘分析”。
- V2 只对 `/v2/projects` 做前缀匹配，生产短路径项目详情和审计日志无法稳定
  高亮父级入口。
- 新增唯一的 `isTopNavigationItemActive` 路由裁决，统一 `/v2` 与生产短路径。
- 顶层名称统一为：工作台、项目列表、我的任务、进展提交、系统管理。
- 旧页面壳和 V2 页面壳均使用同一裁决；桌面端、移动端同步。
- 旧页面壳的顶层和上下文当前项使用品牌蓝色。
- 将 V2“进展提交”的当前路由归属与可点击状态分离：无活动任务时，
  工作台不会误亮“进展提交”，但直接打开进展或材料页仍会正确高亮。

#### Route Matrix

- 工作台：`/dashboard`、`/v2/dashboard`
- 项目列表：`/projects` 及全部项目子路由
- 我的任务：`/tasks` 及全部任务子路由
- 进展提交：`/progress`、`/materials` 及材料子路由
- 系统管理：`/admin` 及全部管理子路由

#### Validation

```text
targeted route/navigation tests PASS (30)
Web typecheck                   PASS
Web lint                        PASS
full repository lint           PASS
full repository typecheck      PASS
full repository tests          PASS (Web 166 / API 294)
Web production build           PASS
API production build           PASS
Prisma schema validation       PASS
production deployment          PASS (`94d6fd0`)
production route audit         PASS (14 routes)
```

#### Production Route Audit

- V2 页面：工作台、项目列表、新建项目、项目工作区、我的任务、进展提交、
  材料、系统管理、审计日志。
- 旧业务页面壳：首台生产计划、用户管理、角色权限、基础字典、流程节点。
- 每页顶层导航均严格显示：
  `工作台 / 项目列表 / 我的任务 / 进展提交 / 系统管理`。
- 每页仅有一个 `aria-current="page"`，且当前项使用品牌蓝色。
- 系统管理子页的上下文当前项同步使用品牌蓝色。
- 生产浏览器未出现 `Application error`。

---

### Round R26P10_NAV_ACTIVE_STATE

#### Goal And Scope

- 修复工作台同时高亮“工作台”和不可用“进展提交”的导航状态错误。
- 保持无当前任务时“进展提交”不可用，不改变任务或流程数据。

#### Root Cause And Fix

- 无当前任务时，“进展提交”为保持安全兜底将链接指向工作台。
- 旧激活态只比较当前路径和链接路径，因此把禁用链接误判为当前页面。
- 桌面端和移动端导航现在均要求 `item.enabled` 后才允许显示激活态。
- 新增无当前任务时只高亮工作台的服务端渲染回归测试。

#### Validation

```text
targeted V2 shell tests       PASS (2)
Web typecheck                 PASS
git diff --check              PASS
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 143 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
production deployment         PASS (85ca071)
production visual check       PASS
```

#### Production Evidence

- 正式 `/dashboard` 桌面导航唯一激活项为“工作台”。
- “进展提交”保持 `aria-disabled="true"`，且没有 `is-active` 或
  `aria-current`。
- 移动端导航唯一激活项同样为“工作台”。
- 客户端错误入口计数为 `0`；Web、API、nginx 均正常。
- 未执行数据库迁移或业务写请求。

---

### Round R26P9_VISUAL_SPACING_CLEANUP

#### Goal And Scope

- 恢复 V2 审计日志页面与其他正式页面一致的左右留白。
- 删除项目列表顶部问答式标题与解释文案，同时保留“新建项目”主动作。
- 增加流程地图第 12 步菱形节点与第 18 步终止节点的文字安全区。
- 不改变冻结的 1440 × 1740 流程拓扑、节点坐标、节点尺寸或业务状态。

#### Exact Changes

- 审计日志工作区接入原生 `r26-page` 居中内容框和响应式页边距。
- 静态与真实数据项目列表均移除问答式 PageIntro；新建入口改为独立右对齐动作区。
- 第 12 步文字向菱形中央安全区收拢。
- 第 18 步增加左侧、顶部和底部文字留白。
- 新增审计页框架、项目文案移除、节点安全区的静态回归断言。
- 详细报告：`docs/release/R26P9_VISUAL_SPACING_CLEANUP.md`。

#### Validation

```text
targeted Web tests            PASS (11)
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 142 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
git diff --check              PASS
production deployment         PASS (09d6548)
production visual checks      PASS
```

#### Production Evidence

- 正式域名审计页在 1280px 浏览器视口下，左右内容内边距均为 `32px`。
- 项目列表不再渲染指定问答式标题和说明，“新建项目”入口仍可见。
- 第 12 步文字与 SVG 外接边界的最小测量间距为 `36.5px`。
- 第 18 步精简为步骤、名称、负责人三层核心信息，左侧和底部测量间距分别为
  `28px`、`15.5px`。
- 正式页面 Next.js 客户端错误入口计数为 `0`；Web、API、nginx 均正常。
- 未执行数据库迁移或业务写请求。

---

### Round R26P8_FIRST_UNIT_PLAN_ENTRY

#### Goal And Scope

- 修复第 10 步要求“已确认的首台生产计划”却没有入口的问题。
- 修复 `/projects/:projectId/pilot-production` 生产环境客户端崩溃。
- 不创建、不确认任何真实计划，不推进当前工序。

#### Root Cause

```text
production console:
Error: useAuth must be used within AuthProvider.
```

- 正式 V2 路由识别将 `/projects` 的所有子路径都视为 V2 重写页面。
- 首台生产计划是未被 V2 rewrite 接管的业务子页面，因此 `RootRuntime` 错误跳过
  `AuthProvider`，页面在客户端渲染阶段崩溃。
- 第 10 步完成前检查只返回后端阻断原因，未提供业务记录修复入口。

#### Exact Changes

- 正式 V2 路由识别改为与 `next.config.ts` 完全一致的精确路径集合。
- `/projects/:projectId/pilot-production` 恢复 `AuthProvider` 和业务应用壳。
- 第 10 步工序详情和完成阻断面板新增“新建并确认首台生产计划”。
- 阻断面板明确说明“新建 → 在列表确认 → 返回工作区重新检查”。
- 首台生产计划页面新增“返回项目工作区”。
- 新增路由边界和业务修复入口测试。
- 详细报告：`docs/release/R26P8_FIRST_UNIT_PLAN_ENTRY.md`。

#### Validation

```text
targeted Web tests            PASS (15)
Web typecheck                 PASS
Web lint                      PASS
git diff --check              PASS
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 139 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
production deployment         PASS (ae2386c)
production services           web/api/nginx active
production authenticated UI   PASS
pilot-production crash        FIXED
first plan form visible        PASS
new first plan button visible  PASS
return workspace link visible  PASS
step 10 direct entry visible   PASS
production console errors      0
production business writes    0
```

#### Decision

```text
R26P8_IMPLEMENTED
FIRST_UNIT_PLAN_PAGE_RECOVERED
STEP10_REMEDIATION_ENTRY_VISIBLE
PRODUCTION_DEPLOYED
NO_PRODUCTION_PLAN_WRITE_DURING_VERIFICATION
```

---

### Round R26P7_COMPLETION_NEXT_TASK_NAVIGATION

#### Goal And Scope

- 修复完成工序成功后仍停留在旧节点、让用户误以为需要再次完成的问题。
- 保持后端状态机、幂等、乐观锁和服务端主线裁决不变。
- 生产诊断只读，不触发当前第三步，不修改数据库业务数据。

#### Read-only Production Evidence

```text
projectId                     cmrzz7z3k0001br11ep76ub1f
step 1 PROJECT_INITIATION     1 task / COMPLETED
step 2 DEVELOPMENT_REPORT     1 task / COMPLETED
step 3 PAINT_DEVELOPMENT      1 task / READY / active
workflow currentNodeCode      PAINT_DEVELOPMENT
step 2 completion POST        exactly 1
duplicate step 2 task         0
```

- 第二步曾两次请求“完成前检查”，中间进入进展提交页并新增进展；只有第二次检查后发出
  一次正式完成命令。
- 后端没有重复推进；根因是成功后流程数据已刷新，但选中节点和 URL 仍指向已完成的
  第二步。

#### Exact Changes

- 完成成功后立即使用服务端返回的 `isPrimary` 任务切换选中节点和 `taskId` URL。
- 成功抽屉继续保留，明确显示“工序已完成 · 已进入下一步”。
- 主动作改为“进入下一步：工序名称”；关闭抽屉后直接看到新工序。
- 新增主线任务选择单元测试和成功后导航接线契约测试。
- 详细报告：
  `docs/release/R26P7_COMPLETION_NEXT_TASK_NAVIGATION.md`。

#### Validation

```text
targeted Web tests            PASS
Web typecheck                 PASS
Web lint                      PASS
pnpm install                  PASS
pnpm lint                     PASS
pnpm typecheck                PASS
pnpm test                     PASS (Web 137 / API 294)
pnpm --filter web build       PASS
pnpm --filter api build       PASS
API prisma validate           PASS
git diff --check              PASS
production deployment         PASS (e2ccf6a)
production services           web/api/nginx active
public and local health        PASS
production read-only smoke    PASS
production selected task      step 3 PAINT_DEVELOPMENT
production URL taskId          cms02bvbv000nbr7rpxe1z5q2
production console errors      0
production write requests      0 during verification
```

#### Decision

```text
R26P7_IMPLEMENTED
NO_DUPLICATE_STEP2_TASK
COMPLETION_ADVANCES_SELECTION_TO_SERVER_PRIMARY_TASK
PRODUCTION_DEPLOYED
CURRENT_STEP3_NOT_MUTATED_DURING_VERIFICATION
```

---

### Round R26P6_COMPLETION_CONFIRMATION_GUIDANCE

#### Goal And Scope

- 修复“确认完成并推进”视觉上为蓝色主按钮，但点击没有任何反馈的问题。
- 明确区分前端输入校验、服务端完成门禁和正在提交三种状态。
- 不修改后端状态机、权限、材料、阻塞、幂等、乐观锁或业务数据。

#### Root Cause And Fix

- 生产日志确认完成前预览成功，但用户点击时没有发出 `/complete` 请求，流程未推进。
- Safari 无障碍树确认按钮因“完成说明”为空且推进影响未勾选而被原生禁用；两个输入位于
  抽屉下方，按钮又缺少禁用视觉，因此表现为蓝色按钮点击无反应。
- 服务端允许完成时，按钮保持可点击；缺少说明时聚焦并滚动到说明框，缺少确认时聚焦
  复选框，同时展示明确错误。
- 底部常驻显示下一项必填提示；只有正在提交或服务端门禁不通过时才真正禁用。
- 为 V2 按钮增加清晰的禁用样式，并新增确认状态回归测试。

#### Validation And Production Evidence

```text
focused completion tests               PASS（13）
pnpm install                           PASS
pnpm lint                              PASS
pnpm typecheck                         PASS
pnpm test                              PASS（Web 135；API 294）
pnpm --filter web build                PASS
pnpm --filter api build                PASS
pnpm --filter api prisma:validate      PASS
git diff --check                       PASS
production release verification       PASS
production acceptance                 PASS
```

- 生产 Safari 只验证缺项反馈：空输入点击后出现“请填写完成说明。”并聚焦说明框。
- 验证过程不填写完整条件、不调用 `/complete`，项目保持第 1 步，未发生流程写入。
- 未运行 seed，未新增 migration，未修改生产业务数据。
- 详细记录：`docs/release/R26P6_COMPLETION_CONFIRMATION_GUIDANCE.md`。

#### Decision

```text
R26P6_COMPLETION_CONFIRMATION_GUIDANCE_DEPLOYED
SILENT_DISABLED_ACTION_REMOVED
MISSING_INPUT_FOCUSED_AND_EXPLAINED
NO_WORKFLOW_TRANSITION_DURING_VERIFICATION
```

---

### Round R26P5_IDEMPOTENT_LOGOUT

#### Goal And Scope

- 修复会话已经过期或失效时，V2 点击“退出登录”返回失败并停留在半退出页面的问题。
- 保持登出为幂等清理动作：有会话时销毁服务端会话，无有效会话时仍清除残留 Cookie。
- 不修改飞书 OAuth、角色权限、项目、流程、数据库结构或业务数据。

#### Root Cause And Fix

- 生产复现确认：未认证状态调用 `POST /api/auth/logout` 返回 `401`。
- 原因是登出 Controller 被全局 Session Guard 提前拦截，现有支持空会话的登出 Service
  没有机会运行。
- 仅将 `POST /api/auth/logout` 标记为公开路由；它仍然是 POST，只执行会话存储删除和
  Cookie 清理，不读取或写入业务数据。
- 增加 Controller 回归测试，锁定公开路由元数据、空会话成功响应和既有 Service 调用。

#### Validation And Production Evidence

```text
focused auth tests                     PASS（16）
pnpm install                           PASS
pnpm lint                              PASS
pnpm typecheck                         PASS
pnpm test                              PASS（Web 133；API 294）
pnpm --filter web build                PASS
pnpm --filter api build                PASS
pnpm --filter api prisma:validate      PASS
git diff --check                       PASS
production release verification       PASS
production acceptance                 PASS
```

- 修复前生产匿名/过期会话登出为 `401 Unauthorized`。
- 修复后同一请求返回 `200 {"success":true}`，随后 Session API 保持
  `authenticated=false`、`user=null`。
- 未运行 seed，未新增 migration，未修改项目、流程或其他生产业务数据。
- 详细记录：`docs/release/R26P5_IDEMPOTENT_LOGOUT.md`。

#### Decision

```text
R26P5_IDEMPOTENT_LOGOUT_DEPLOYED
EXPIRED_SESSION_LOGOUT_RETURNS_SUCCESS
RESIDUAL_SESSION_COOKIE_CLEARED
NO_BUSINESS_DATA_CHANGE
```

---

### Round R26P4_ACCOUNT_LOGOUT

#### Goal And Scope

- 修复 V2 右上角头像只能显示临时提示、无法退出登录的问题。
- 复用现有服务端登出能力，安全销毁会话并清除浏览器 Cookie。
- 明确展示当前姓名、组织部门状态、系统角色和“退出登录”动作。
- 退出后停留在清楚的成功页面，避免自动重新触发飞书 OAuth 而造成“没有退出”的误解。
- 不修改项目、流程、数据库业务数据、权限规则或飞书 OAuth 服务商配置。

#### Exact Changes

- V2 头像改为可访问的账号菜单，显示真实用户信息与退出动作。
- “退出登录”调用既有 `AuthProvider.logout()` 和 `/api/auth/logout`，不建立第二套认证逻辑。
- 成功后进入 `/login?loggedOut=1`；该显式退出状态不自动发起飞书授权。
- 普通 `/login` 入口继续保持原有自动进入飞书登录的行为。
- 增加账号菜单、登出动作与退出落地状态回归测试。

#### Validation And Production Evidence

```text
application code commit              507e9c227f789e0541f0b07188b2d22644eff18f
pnpm install --frozen-lockfile        PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 133；API 293）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
production release verification      PASS
production acceptance                PASS
```

- Safari 正式账号实测：点击头像“李”后显示李晓晨、组织部门状态、系统管理员角色和
  “退出登录”。
- 点击退出后，`/api/auth/session` 返回 `authenticated=false`、`user=null`。
- `/login?loggedOut=1` 显示“已退出登录”和“重新登录”，不会自动跳转飞书授权。
- 实测浏览器最终保持退出状态；未重新授权，未产生项目或流程写请求。
- 详细记录：`docs/release/R26P4_ACCOUNT_LOGOUT.md`。

#### Decision

```text
R26P4_ACCOUNT_LOGOUT_DEPLOYED
SERVER_SESSION_AND_COOKIE_CLEARED
SIGNED_OUT_LANDING_CONFIRMED
PRODUCTION_USER_LOGGED_OUT
```

---

### Round R26P3_PROJECT_CREATE_ENTRY

#### Goal And Scope

- 修复生产 V2 清空项目后无法开始人工测试的产品阻断。
- 恢复工作台和项目列表的真实“新建项目”入口。
- 新增正式 V2 新建项目路由，继续复用现有后端创建、权限、流程初始化和审计能力。
- 验证过程中不创建项目、不 seed、不修改生产业务数据。

#### Exact Changes

- 管理员和项目经理在 `/dashboard` 空状态中可直接进入“新建项目”。
- `/projects` 页头和空状态均提供真实创建入口。
- `/projects/new` 使用真实 `ProjectEditor`，创建成功后进入 V2 项目工作区。
- 非管理员、非项目经理不展示创建入口，服务端权限边界保持不变。
- 增加 V2 创建路由、权限可见性和生产别名回归测试。

#### Validation And Production Evidence

```text
source/runtime commit                 17a96d30459051dafaca33b47f37476c33f4152a
pnpm install --frozen-lockfile        PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 131；API 293）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
production release verification      PASS
production acceptance                PASS
```

- Safari 正式账号实测：工作台入口、项目列表双入口和新建表单均可达。
- 新建表单显示李晓晨为默认负责人，“创建项目”按钮可用；未点击提交。
- 验证后生产 `projects=0`、`workflow_instances=0`、`workflow_tasks=0`。
- 详细记录：`docs/release/R26P3_PROJECT_CREATE_ENTRY.md`。

#### Decision

```text
R26P3_PROJECT_CREATE_ENTRY_DEPLOYED
PRODUCTION_CREATE_FORM_REACHABLE
NO_PROJECT_CREATED_DURING_VERIFICATION
READY_FOR_MANUAL_FROM_SCRATCH_UAT
```

---

### Round R26P2_PAGE_SPACING_AND_CLEAN_RESET

#### Goal And Scope

- 修复“我的任务”和“系统管理”在 V2 正式入口中没有页面 gutter 的问题；
- 删除 production 全部项目与关联运行记录，为人工从零测试准备空环境；
- 保留组织、账号、角色权限、流程模板、系统参数和不可篡改审计日志。

#### Implementation

- 为 `.r22-tasks-page` 和 `.r22-admin-page` 增加 V2 1504px 居中内容框；
- 桌面/平板/手机 gutter 分别为 32/24/20px；
- 新增 CSS 契约测试覆盖三个断点；
- runtime commit：
  `51ab39bbb18dbe2c0dd9d51adab03911c69223b0`；
- `main` merge：
  `6a60eb50c9b6e8aa5b7edb106db507c35085efb4`。

#### Backup And Reset

- backup：
  `/var/backups/feishu-timeline-db/20260725T050659Z/feishu-timeline.dump`；
- SHA256：
  `2702c4bb0ba795f003daeceb6ae82be338670bc334f843b71b9e48edc86701ec`；
- 44/44 tables、12/12 users、1/1 projects、22/22 audit logs 恢复演练通过；
- project、workflow、task、progress、blocker、attachment、notification、recurring、
  color、review、fee、production plan 和实时对象文件均为 0；
- users=12、departments=7、process templates=1、audit logs=25；
- 三个清空动作均写入系统审计，历史审计未删除或覆盖。

#### Validation

```text
Web unit tests              129 / 129 PASS
API unit tests              293 / 293 PASS
lint / typecheck            PASS
Web / API build             PASS
Prisma validate             PASS
release verify              PASS
production acceptance       PASS
production browser /tasks   0 items, empty state PASS
production browser /projects 0 projects, empty state PASS
```

#### Decision

```text
R26P2_PAGE_SPACING_FIXED
PRODUCTION_PROJECT_DOMAIN_RESET
AUDIT_LOGS_PRESERVED
READY_FOR_MANUAL_TEST_FROM_SCRATCH
```

---

### Round R26P1_FORMAL_TENANT_PRODUCTION_REPROMOTION

#### Goal And Scope

- 保留 R26 V2、Gate 3D、数据库和安全修复；
- 纠正并锁定飞书中国大陆 OAuth 配置；
- 仅在正式团队真实 OAuth、生产回调、session、登出和有限业务冒烟通过后合并
  `main`；
- 不使用测试租户、staging App ID、Lark provider 或 production 业务写入绕过门禁。

#### Exact Release

```text
fix commit        77fdba8546853f5138cceb7f83876614c270c4df
runtime commit    5035f1b0ccbb09cd1990dc75dba6f65dd6a14248
main merge        6e3fad3
production URL    https://timeline.all-too-well.com
provider          feishu-cn
formal tenant     安徽江淮汽车集团股份有限公司
formal user       李晓晨
```

#### Backup And Deployment

- PostgreSQL dump：
  `/var/backups/feishu-timeline-db/20260725T041532Z/feishu-timeline.dump`。
- SHA256：
  `ca23976e4193b8963ec3cf0077d2fc1e5110be17ef63577a3c6c11c91501386c`。
- 44/44 tables、12/12 users、1/1 projects、22/22 audit logs 恢复演练通过。
- production 运行 exact runtime，remote worktree clean；21 migrations、0 pending。
- API/Web/Nginx/PostgreSQL/Redis active；API/Web restart 0。
- 部署后 service error 和 Lark host 命中均为 0。

#### Product Evidence

- 正式飞书授权页、production callback 和 session 创建通过；
- 退出登录后旧 session 失效，第二次真实登录通过；
- 项目列表、工作台、18 节点项目工作区、生命周期复盘和管理员审计使用真实生产数据；
- 未执行任何完成工序、进展、附件、成员、评审、收费、月度评审或退出写操作；
- production 用户/项目/审计计数保持 `12 / 1 / 22`。

完整证据：
`docs/release/R26P1_PRODUCTION_REPROMOTION.md`。

#### Decision

```text
R26P1_PRODUCTION_REPROMOTED
FEISHU_CN_FORMAL_TENANT_OAUTH_PASS
R26_V2_READ_ONLY_PRODUCTION_SMOKE_PASS
PRODUCTION_BUSINESS_WRITES=0
MAIN_INTEGRATED
DEPLOYED_AND_OBSERVING
STABLE_TAG_NOT_CREATED
```

---

### Round R26P_V2_PRODUCTION_PROMOTION

#### Scope

- 产品负责人批准 Gate 3D 后，按串行门禁推送最终源码、建立 release 分支、提升正式
  V2 路由、执行安全快检和全量回归、创建不可变构建、备份生产数据库并尝试发布。
- 只有真实飞书 OAuth、受保护页面和有限业务 smoke 全部通过，才允许合并 `main`
  和创建 RC tag。

#### Exact Commits

```text
source branch          codex/r26-gate3c2-c3-d-full-lifecycle
source commit          85a6267494b5ef4fc259ee836d52e7fc44f732a1
release branch         release/r26-v2-production
runtime commit         ef6ba4379a4fd9a64eeeabd91160b86d89d59a01
production before      893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
production attempted   ef6ba4379a4fd9a64eeeabd91160b86d89d59a01
production after       893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
origin/main            893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
evidence commit        5088ded4c8e81af610efd4747e859765e894ab9c
```

#### Passed Gates

- 第一方 Critical/High/Medium、production dependency Critical/High、image
  Critical/High 和 gitleaks finding 均为 0。
- install、lint、typecheck、unit、Web/API build、Prisma validate、API E2E、
  Playwright 62/62、diff check 全部通过。
- 不可变 staging 构建与 runtime commit 绑定；未运行 seed。
- 生产 PostgreSQL 备份
  `/var/backups/feishu-timeline-db/20260724T232837Z/feishu-timeline.dump`
  非空、SHA256、`pg_restore -l` 和隔离 schema 恢复演练通过。
- 生产 exact runtime、三个 additive migration、五项服务、TLS、DNS、API health、
  正式 V2 路由和 V1 fallback 技术检查通过。

#### Failed Gate And Rollback

- Gate 8 飞书授权页明确返回当前账号无应用使用权限；公司飞书会话只到达“扫描成功”，
  未形成 callback 和受保护 session。
- 未对生产真实项目执行任何写入；进展、材料和管理员审计 smoke 未执行。
- 立即使用正式脚本恢复发布前 commit，不执行数据库 reset、强制 db push、seed 或
  破坏性 down migration。
- 回滚后 production HEAD/branch/worktree、五项服务、Nginx、public API health 和
  failed unit 独立复核通过。

#### Evidence

- `docs/release/R26P_RELEASE_MANIFEST.md`
- `docs/release/R26P_PRE_RELEASE_ACCEPTANCE.md`
- `docs/release/R26P_PRODUCTION_DEPLOYMENT.md`
- `docs/release/R26P_PRODUCTION_SMOKE.md`
- `docs/release/R26P_ROLLBACK_RECORD.md`
- `docs/release/R26P_OBSERVATION_LOG.md`
- `docs/security/R26P_PRE_RELEASE_SECURITY_DELTA.md`

#### Decision

```text
R26P=FAIL
STATE=ROLLED_BACK
MAIN_MERGE=NOT_CREATED
CANDIDATE_TAG=NOT_CREATED
PRODUCTION_WRITES=0
NEXT_ACTION=FIX_FEISHU_APP_AVAILABILITY_AND_REPEAT_GATE8
```

---

### Round R26P1_FEISHU_CN_OAUTH_PROVIDER_CORRECTION

#### Goal And Scope

- 从失败 runtime `ef6ba4379a4fd9a64eeeabd91160b86d89d59a01` 建立独立修复分支。
- 先以真实 start、仓库、构建配置和生产只读配置证明 OAuth 跳转来源，再修复发布边界。
- 浏览器只进入同源 `/api/auth/feishu/start`，由 API 生成 state 与授权 URL 并返回
  302。
- 不修改 18 步状态机、Prisma schema、数据库业务数据、V1 或当前稳定 production。

#### Root Cause

```text
LARK_PROVIDER_SELECTED=false
LARK_REQUEST_COUNT=0
staging App ID hash=1e8666fb3953
production App ID hash=5da19c9cf49e
App ID match=false
primary blocker=production app tenant / availability scope
```

- 失败候选和当前生产实际均使用 `open.feishu.cn` / `accounts.feishu.cn`；授权页上的
  “切换至 Lark 登录”不是 Lark provider 被选中的证据。
- Gate 3B 通过的是 staging 测试应用；production 使用不同正式应用，失败发生在飞书
  签发 code 之前，符合账号不属于应用租户或未在正式应用可用范围内的表现。
- 详细证据见 `docs/release/R26P1_OAUTH_ROOT_CAUSE.md`。

#### Exact Changes

- 新增唯一、类型安全的 `feishu-cn` 服务端 provider，授权固定为
  `accounts.feishu.cn`，token / user info / API 固定为 `open.feishu.cn`。
- 新增 `GET /api/auth/feishu/start`；Web 登录按钮不再读取或解析第三方授权 URL。
- production 启动校验正式域名、HTTPS callback、provider、端点和非占位服务端凭据。
- staging 显式声明 `DEPLOYMENT_ENV=staging`，避免 production 构建模式误套正式域名。
- 删除 Web 构建参数中的 `NEXT_PUBLIC_FEISHU_APP_ID`；App Secret 仍只存在 API 环境。
- 生产验收、发布复核和安全加固脚本只输出 OAuth 状态码、主机与路径，不输出 App ID、
  state、Cookie 或完整 Location。
- 增加 provider、start、token/user info 与 Lark 零请求回归测试。
- 忽略临时 `.next-*` 目录，并移除误跟踪的 `tsconfig.tsbuildinfo` 构建缓存。

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 37 files / 127 tests；API 65 files / 293 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
pnpm test:e2e                        PASS
pnpm playwright:test                 PASS（62 / 62）
Gitleaks current tree                PASS
Gitleaks full Git history            PASS
Web production bundle Lark files     0
API production artifact Lark files   0
Web production bundle Feishu files   0
git diff --check                     PASS
```

#### Current Gate

```text
production=893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
origin/main=893b50f5b7ef1f54f840243d3b18dbe1e0f8dcd1
production changed=false
production seed/reset=false
READY_FOR_IMMUTABLE_STAGING_REAL_FEISHU_OAUTH
STOP_BEFORE_PRODUCTION
```

---

### Round R26_GATE3C1_ORDINARY_TASK_COMPLETION

#### Goal And Scope

- 只在独立 staging 开放第 1～11 步普通工序完成、冻结拓扑自动推进和开放阻塞解除。
- 第 4 步完成只创建第 5、6 步；第 6 步完成只创建第 7、9、10 步；
  第 9 步不阻塞主线；第 11 步只生成第 12 步。
- 第 12/13/17/18 步专项动作、production、V1、`main`、tag 和 Gate 3C2 全部关闭。

#### Exact Changes

- Prisma：工作流实例增加 `commandVersion`；阻塞增加解决说明、实际解除时间、操作者
  和 requestId；新增 migration
  `20260724222000_add_r26_gate3c1_completion`。
- API：增加 completion preview、complete、blocker resolve 三个薄 V2 command 接口。
- 状态机：复用 `WorkflowsService` 和冻结节点定义，客户端不能提交下一节点或负责人。
- 分配：后续任务只使用 Gate 3A 服务端优先级，无匹配成员保持 `UNASSIGNED`。
- 安全：项目访问、权限、活动任务、`taskVersion`、必填表单、材料、开放阻塞、
  串行化事务、幂等、409 和审计全部在后端裁决。
- Web：增加“完成工序”、完成前检查、准确阻断、推进影响、阻塞解除、成功反馈和
  跨页面局部刷新；第 12 步及以后不渲染 Gate 3C1 动作。
- 响应式：修复后置 `94vw` 覆盖移动全屏抽屉，390px 使用真正全屏 sheet、
  独立滚动内容和固定底部主动作。

#### Staging Evidence

```text
URL                         http://localhost:8080
user                        李晓晨
serial project              R26-G3C1-UAT-普通推进-20260724-2301
blocker project             R26-G3C1-UAT-非阻塞-20260724-2301
concurrent project          R26-G3C1-UAT-并发幂等-20260724-2301
serial completion commands  7
serial current node         CAB_REVIEW
step 9                      READY / active / non-primary
concurrent command rows     1
concurrent step 2 rows      1
loser response              409
production requests         0
special step writes         0
```

- 真实飞书用户通过浏览器完成第 1→2→3→4、4→5/6、6→7/9/10、
  10→11、11→12。
- 第 9 步保持未完成时主线到达第 12 步；第 12 步专项写入口保持关闭。
- 第 5 步缺少“颜色编号确认单”时拒绝完成。
- 开放“等待供应商确认交付时间”阻塞时拒绝完成；保存解决说明和实际解除时间后
  同一面板变为可完成。
- 两标签并发一个成功、一个 409；数据库只有一次完成命令、一个第 2 步任务。
- 1440、真实 1024×900、真实 390×844 截图和组合回放归档到
  `docs/product/evidence/R26_GATE3C1/`。

#### Validation

```text
pnpm install                          PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 35 files / 121 tests；API 62 files / 282 tests）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
```

#### Evidence

- 报告：`docs/product/R26_GATE3C1_ORDINARY_COMPLETION_REPORT.md`
- 人工复核：`docs/product/R26_GATE3C1_HUMAN_REVIEW.md`
- 截图/回放：`docs/product/evidence/R26_GATE3C1/`
- API/数据库/审计：
  `docs/product/evidence/R26_GATE3C1/API_AND_DATABASE_PROOF.md`

#### Decision

```text
R26_GATE3C1_IMPLEMENTED
ORDINARY_TASK_COMPLETION_ENABLED_ON_STAGING
PARALLEL_AND_NONBLOCKING_TRANSITIONS_VERIFIED
STEP12_AND_LATER_SPECIAL_ACTIONS_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3C1_CONFIRMATION
STOP_BEFORE_GATE3C2
```

---

### Round R26_PRODUCT_UI_RECOVERY_GATE3C2_C3_GATE3D

#### Goal And Scope

- 从 Gate 3C1 准确提交继续开放第 12～18 步专项动作；
- 在独立 staging 完成从真实项目历史到退出治理的完整主链路 UAT；
- 不修改 V1，不部署 production，不合并 `main`，不创建 tag。

#### Exact Changes

- V2 新增第 12～18 步专项动作路由，复用既有评审、收费、排产、生产、月度评审和
  颜色退出领域服务；
- 项目工作区将普通完成、专项动作和进展提交明确分层；
- 第 17 步返回真实 `completed / total` 文案；
- 第 18 步区分系统建议和人工决定，项目状态全部中文化；
- 完成项目卡显示收尾语义并移除旧活动任务深链接；
- V2 layout 接入现有认证上下文，避免专项工作区独立渲染时缺少会话。

#### Staging UAT

```text
project                      R26-G3C1-UAT-普通推进-20260724-2301
project status               COMPLETED
current node                 PROJECT_CLOSED
flow progress                18 / 18
step 12                      REJECTED -> rework -> APPROVED
step 13                      10000 CNY / PAID / COMPLETED
step 14                      APPROVED
step 15                      CONFIRMED / COMPLETED
step 16                      COMPLETED
step 17                      12 / 12 APPROVED
step 18                      system EXIT / human EXIT / COMPLETED
audit records                94
production requests          0
seed                         not run
```

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 36 files / 124 tests；API 62 files / 283 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

#### Evidence

- `docs/product/evidence/R26_GATE3D/`
- `docs/product/R26_GATE3C2_REVIEW_FEE_PRODUCTION_REPORT.md`
- `docs/product/R26_GATE3C3_MONTHLY_EXIT_REPORT.md`
- `docs/product/R26_GATE3D_FULL_LIFECYCLE_UAT_REPORT.md`
- `docs/product/R26_GATE3D_HUMAN_REVIEW.md`

#### Decision

```text
R26_GATE3C2_IMPLEMENTED
R26_GATE3C3_IMPLEMENTED
R26_GATE3D_STAGING_UAT_COMPLETED
FULL_MAINLINE_FROM_PROJECT_CREATION_TO_EXIT_VERIFIED
AWAITING_PRODUCT_OWNER_FULL_LIFECYCLE_CONFIRMATION
PRODUCTION_UNCHANGED
```

---

### Round R26_PRODUCT_UI_RECOVERY_GATE3A_PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT

#### Goal And Scope

- 只在独立 staging 开放 `/v2/projects/:projectId` 的项目成员、项目职责、部门负责人、
  默认执行人、分配影响预览、分配应用和任务转交。
- 进展、材料、工序完成、评审和流程推进写操作继续关闭。
- 不修改 V1，不部署 production，不合并 `main`，不创建 tag，不自动进入 Gate 3B。

#### Exact Changes

- Prisma：新增 `ProjectAssignmentSource`、`ProjectNodeAssignment`、
  `R26CommandRequest` 和 `Project.memberAssignmentVersion` 及 migration。
- API：新增 Gate 3A 预览/成员/分配/任务转交接口；权限、项目作用域、幂等、事务、
  乐观锁、409、原因和审计全部在服务端执行。
- 分配器：按任务人工覆盖、工序专属、项目部门负责人、默认执行人、唯一候选人、待分配
  六级优先级返回负责人和来源。
- Web：新增成员添加/编辑/移除、影响预览、应用范围、任务转交、项目记录，以及
  1440/1024/390 响应式抽屉和全屏 sheet。
- 部署：staging 构建显式传入 R26 开关；production 配置未修改。
- 证据：`docs/product/evidence/R26_GATE3A/`。
- 报告：`docs/product/R26_GATE3A_PROJECT_MEMBER_ASSIGNMENT_REPORT.md`。
- 人工复核：`docs/product/R26_GATE3A_HUMAN_REVIEW.md`。

#### Staging Evidence

```text
URL                       http://localhost:8080
UAT project               R26-G3A-UAT-20260724-1006
image tag                 r26-gate3a-d4a0bdd
deployed app commit       d4a0bdd
project assignment version 8
final distinct members    4
final node assignments    11
Gate 3A commands          7
audit result              7 × SUCCESS
production requests       0
```

- 采购、质量、工艺成员的建议工序、影响预览、保存、地图负责人和审计记录已用真实
  staging 会话核对。
- 成员移除预览发现并修复未来节点跨部门转交问题；最终只转交活动任务，未来配置无法
  重新解析时保持 `UNASSIGNED`。
- 当前真实任务为 `READY`；未篡改状态机来伪造 `IN_PROGRESS`。进行中任务确认/原因
  门禁由自动化测试覆盖。
- 匿名预览实测 401；普通成员 403、跨项目 IDOR、幂等和并发 409 由服务层/契约测试
  覆盖。

#### Validation

```text
pnpm install                          PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS（Web 31 files / 96 tests；API 60 files / 244 tests）
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
git diff --check                      PASS
```

#### Decision

```text
R26_GATE3A_IMPLEMENTED
PROJECT_MEMBER_WRITES_ENABLED
ASSIGNMENT_WRITES_ENABLED
PROGRESS_AND_WORKFLOW_WRITES_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3A_CONFIRMATION
STOP_BEFORE_GATE3B
```

#### Gate 3A Project Records Typography Remediation

- 产品负责人报告“项目记录”卡片摘要逐字换行、操作人和内部动作代码重叠。
- 根因：外层三列记录网格与卡片内部三列同时生效，摘要可用宽度被双重压缩。
- 改为单列记录流；桌面记录行按时间、摘要、操作人分栏，移动端纵向堆叠。
- 摘要恢复 16px / 1.65 行高，并为长文本设置安全换行。
- 内部 `record.action` 仅保留为 `data-record-action`，不再作为用户可见英文文案。
- staging 更新为 `r26-gate3a-records-9bca772`（commit `9bca772`）；19 项 migration
  已应用、0 项待执行，未运行 seed。
- `pnpm install`、lint、typecheck、Web 97、API 244、两端 build、Prisma validate、
  `git diff --check` 全部通过。
- staging 重部署使原飞书会话失效；授权页等待“获取用户标识”确认。该权限未在没有
  产品负责人确认时改变，新三视口截图待授权后补充。
- production、V1、`main`、tag 和 Gate 3B 均未改变。

#### Gate 3A Final Product Approval

- 产品负责人明确启动 Gate 3B，确认 Gate 3A 成员管理和分配能力通过。
- 已重新完成李晓晨真实飞书 OAuth。
- staging 运行 `9bca77260a46386408c3e5384c25b15040d5bbb7`。
- 项目记录 1440/1024/390 排版均可读；重叠 0、页面横向溢出 0、console error 0。
- 内部审计动作代码未显示；Gate 3A 分支已推送。
- 证据：`docs/product/evidence/R26_GATE3A/13-project-records-fixed-1440.png` 至
  `15-project-records-fixed-390.png`。

```text
R26_GATE3A_PASSED
PROJECT_MEMBER_AND_ASSIGNMENT_MANAGEMENT_ACCEPTED
READY_FOR_GATE3B_PROGRESS_AND_MATERIALS
```

---

### Round R26_PRODUCT_UI_RECOVERY_GATE3B_PROGRESS_SUBMISSION_AND_MATERIAL_UPLOAD

#### Goal And Scope

- 在独立 staging 开放进展草稿、不可变正式进展、阻塞申报、工序材料上传和版本历史。
- 写入后同步 V2 工作台、项目列表、工作区、工序详情、进展历史与项目记录。
- Gate 3B 不完成任务、不生成下一工序、不推进工作流，不开放专项评审/收费/退出写入。
- 不修改 V1，不访问 production，不合并 `main`，不创建 tag，不进入 Gate 3C。

#### Exact Changes

- Prisma：新增 `R26ProgressDraft`，为进展记录增加状态/请求/版本字段，为阻塞增加
  协助人员、部门和影响字段，新增 migration
  `20260724133000_add_r26_gate3b_progress_materials`。
- API：新增 progress context/history、草稿 PUT/DELETE、正式进展 POST、材料 V1/V2
  POST 和历史内容 GET；统一幂等、版本、权限、DTO、事务、审计和 409。
- 附件：复用现有安全拦截器和存储；旧版本只读保留，下载响应启用安全响应头。
- Web：启用真实三步进展、阻塞条件字段、草稿恢复、上传/取消/替换/历史和局部刷新。
- 联动：工作台、项目卡、固定流程地图、工序详情和项目记录使用最新服务端 ViewModel。
- 证据：`docs/product/evidence/R26_GATE3B/`。
- 报告：`docs/product/R26_GATE3B_PROGRESS_MATERIAL_REPORT.md`。
- 人工复核：`docs/product/R26_GATE3B_HUMAN_REVIEW.md`。

#### Staging Evidence

```text
URL                         http://localhost:8080
user                        李晓晨
UAT project                 R26-G3B-UAT-进展提交-20260724-2136
deployed app commit         4f92e8d
image tag                   r26-gate3b-4f92e8d
migrations                  20 applied / 0 pending
formal progress             1
active/archived materials   1 / 1
active drafts               0
console/page errors         0
production requests         0
workflow command requests   0
```

- 真实飞书会话完成阻塞进展、人员/部门协助、PDF V1、替换 V2、正式提交及跨页联动。
- 草稿保存、刷新恢复和删除完成；删除草稿不影响正式历史。
- 数据库确认项目和工作流当前节点均未改变，任务仍为 `READY`，活动任务仍为 1。
- 1440、1024、390 截图和真实浏览器交互帧回放已归档。

#### Validation

```text
pnpm install --frozen-lockfile       PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test                            PASS（Web 33 files / 109 tests；API 61 files / 263 tests）
pnpm --filter web build              PASS
pnpm --filter api build              PASS
pnpm --filter api prisma:validate    PASS
git diff --check                     PASS
```

代码级自动化覆盖草稿、阻塞、材料安全、版本、权限、IDOR、XSS、幂等、并发 409 和
工作流不变量，覆盖项超过 Gate 3B 要求的 24 项。

#### Decision

```text
R26_GATE3B_IMPLEMENTED
PROGRESS_DRAFT_AND_SUBMISSION_ENABLED_ON_STAGING
TASK_MATERIAL_UPLOAD_AND_VERSIONING_ENABLED_ON_STAGING
WORKFLOW_TRANSITION_STILL_DISABLED
AWAITING_PRODUCT_OWNER_GATE3B_CONFIRMATION
STOP_BEFORE_GATE3C
```

---

### Round R26_PRODUCT_UI_RECOVERY_GATE2_DATA_CONSISTENCY_FIX

#### Goal And Scope

- 修复产品负责人复核中发现的 Gate 2 真实数据口径不一致。
- 继续限定在独立 staging 和 GET-only V2 读模型；不修改 V1、Prisma schema、
  migration、状态机、数据库业务数据或 production。

#### Exact Changes

- 当前步骤统一为流程元数据序号：项目卡和工作区均显示 `12 / 18`。
- 工作台、项目卡、工作区和任务详情统一显示当前真实负责人和服务端主责部门；
  李晓晨未同步组织部门时显示“组织部门待同步”。
- 第 12 步读取真实 `taskRound`；第 17 步读取月度计划实际完成数；未生成节点不再把
  建议人展示为现任负责人。
- 按业务责任表重建 18 节点主责、协同和评审部门规则；候选人仅从当前项目有效成员
  中选择，无法唯一确定时保持未分配并返回原因。
- 项目卡新增责任部门；地图可访问名称改为当前项目颜色名。
- 新增 API 分配/责任部门测试与 Web 真实口径契约测试。

#### Staging Evidence

```text
工作台 / 项目卡 / 工作区：
  当前工序=样车驾驶室评审
  负责人=李晓晨
  责任部门=质量管理部
  流程进度=12 / 18

第 12 步=第 1 轮 / 已逾期
第 15 步=生产部 / 负责人待分配 / 尚未生成
第 17 步=0 / 12
节点数量=18
console error=0

/api/v2/* GET=16
POST=0 / PUT=0 / PATCH=0 / DELETE=0
```

- 证据：
  `docs/product/evidence/R26_GATE2/16-data-consistency-step15-1440.png`。
- staging API/Web/nginx healthy；未运行 migration 或 seed。
- `R26-DATA-001` 已登记，历史演示成员和 UAT 项目本轮未修改或删除。

#### Validation

```text
pnpm install --frozen-lockfile                                      PASS
pnpm lint                                                           PASS
pnpm typecheck                                                      PASS
pnpm test                                                           PASS（Web 90 / API 231）
NEXT_PUBLIC_R26_V2_PROTOTYPE=true
NEXT_PUBLIC_R26_V2_DATA_MODE=read-only-real
pnpm --filter @feishu-timeline/web build                            PASS
pnpm --filter @feishu-timeline/api build                            PASS
pnpm --filter @feishu-timeline/api prisma:validate                  PASS
git diff --check                                                    PASS
```

#### Decision

```text
R26_GATE2_IMPLEMENTED
READ_ONLY_REAL_DATA_CONNECTED
ZERO_BUSINESS_WRITE_REQUESTS
AWAITING_PRODUCT_OWNER_REAL_DATA_CONFIRMATION
STOP_BEFORE_GATE3
```

---

### Round R26 Gate 3D Product Owner Acceptance And R27 Entry Preparation（2026-08-09）

#### Product Owner Decision

产品负责人已在任务中明确回复：

```text
PRODUCT_OWNER_ACCEPTED
R26_GATE3D_PASSED
FULL_LIFECYCLE_PRODUCT_EXPERIENCE_ACCEPTED
AUTHORIZE_R27_FINAL_SOURCE_SECURITY_CLEARANCE
```

已同步更新：

- `docs/product/R26_GATE3D_HUMAN_REVIEW.md`
- `docs/rounds/R27.md`

#### R27 Preflight

```text
branch=main
local_HEAD=81fbc6064b79947b0345fabe681f5fd8100258b6
origin/main=81fbc6064b79947b0345fabe681f5fd8100258b6
recorded_production_runtime=535041bb25f21d548d863d07b35e3e952b0aeb2c
untracked_user_attachments=4
```

产品负责人依据 Gate 3D 截图、数据库、审计与完整生命周期操作证据，接受 Gate 3C2、
Gate 3C3 和 1440/1024/390 三档响应式验收结果。人工验收表的具体项目已同步勾选。

本次只授权提交三份治理文档；正式源码安全清场授权已经记录，但以下独立基线令牌仍缺：

```text
R27_SOURCE_BASELINE_APPROVED=<full-40-char-commit>
```

治理提交完成后，必须先比较记录的 production runtime
`535041bb25f21d548d863d07b35e3e952b0aeb2c` 到新治理提交的 name-status 和提交历史。
只有在运行时代码差异得到解释并由产品负责人批准后，才能从批准提交创建独立 worktree 和
`security/r27-final-source-clearance` 分支。四个用户附件保持未跟踪，不删除、不移动、不暂存。

#### Decision

```text
R26_GATE3C2_PASSED
R26_GATE3C3_PASSED
R26_GATE3D_PASSED
FULL_LIFECYCLE_PRODUCT_EXPERIENCE_ACCEPTED
AUTHORIZE_R27_FINAL_SOURCE_SECURITY_CLEARANCE
R26_GOVERNANCE_COMMITTED
R27_AWAITING_SOURCE_BASELINE_APPROVAL
PRODUCTION_UNCHANGED
TAG_UNCHANGED
STOP_BEFORE_SECURITY_SCAN_AND_SOURCE_CHANGE
```

---

### Round R27 Gate 3—5 Initial Security Scan And Semgrep Blocker（2026-08-10）

#### Authorization And Immutable Input

产品负责人明确提供：

```text
R27_GATE2_TRIAGE_AND_FIX_LIST_APPROVED
R27_SOURCE_SCAN_COMMIT=27a0338ac0c59217d121fa6defe0feeec45ca252
OPEN_NEEDS_SECURITY_REVIEW=13
```

本轮从不可变 source commit 和已验证源码包启动 Gate 3—5 只读初扫：

```text
worktree=/Users/lixiaochen/Downloads/feishu_timeline_app-r27-security
branch=security/r27-final-source-clearance
scan_start_HEAD=4a1b4abfbb1d18278ca8438c0b1d1085243e2daf
source_commit=27a0338ac0c59217d121fa6defe0feeec45ca252
source_archive=company-source-scan-27a0338ac0c5.tar.gz
source_archive_sha256=83aff4f1474819ba370088418f018ddf1de29238d9745bf4139580f09864d940
source_archive_files=627
```

没有使用原仓库四个未跟踪用户设计草图，没有启动应用容器，没有执行 migration，没有访问或
部署 staging/production，没有修改 main 或 tag。

#### Gate 3 Formal SAST Blocker

仓库固定扫描器：

```text
Semgrep=1.169.0
image=docker.io/semgrep/semgrep:1.169.0@sha256:2b33f46ba66cf8cc2ad59ccfa7d22951fd00c632c38f1339e84ec8e6e641a942
Docker=29.5.2
enumerated_targets=503
```

第一次通过 `scripts/security/run-sast.sh` 拉取固定 digest 时，Docker Hub manifest GET 返回
`Service Unavailable`，Docker rc `125`，`semgrep.status=TOOL_ERROR`。第二次只执行同 digest
`docker pull`，manifest HEAD 再次返回 `Service Unavailable`。

失败发生在 scanner 启动前：

```text
formal_semgrep_findings=NOT_PRODUCED
formal_semgrep_parse_errors=NOT_PRODUCED
formal_semgrep_result=TOOL_ERROR
attempts=2
```

依 `AGENTS.md` 12.13 停止，没有第三次正式 Semgrep 门禁执行。此前曾短暂启动非批准
Semgrep `1.172.0` 隔离环境下载；发现版本不匹配后立即中止，未完成安装、未执行扫描、未用于
任何结论，临时目录已删除。正式固定 digest 的失败次数仍严格为两次。
正式 blocker 的失败环境、命令、根因、两次尝试和恢复条件见
`docs/security/R27_GATE3_SAST_BLOCKER_REPORT.md`。

人工补证得到 TypeScript-family 516 文件、106,159 行、AST parse error `0`；Bash 49 文件，
`bash -n` parse error `0`。这些不是正式 Semgrep 结果。

正式 target manifest 还漏扫 49 个 `.sh`、12 个非 config `.mjs` 和 4 个 `.js`；Semgrep
registry ruleset 未固定，恢复后必须修复扫描覆盖和可重复性。

#### Confirmed First-Party Findings

人工 source-to-sink 审计确认：

| ID | Severity | 结论 |
|---|---|---|
| `G3-SAST-001` | HIGH | public logout 没有把 cookie token 传给 service，客户端清 cookie 后 Redis session 仍可保留默认 8 小时 |
| `G3-SAST-002` | HIGH | 三个生产运维脚本以 `eval` 解析 CLI，另有两个远端 Bash 源码插值 sink |
| `G3-SAST-003` | MEDIUM | 附件无 quarantine/恶意文件 scanner verdict 即可绑定和下载 |
| `G3-SAST-004` | MEDIUM | production notification log 记录 user/project/task/dedupe 标识 |
| `G3-SAST-005` | MEDIUM | 两个部署引导脚本把未固定的 NodeSource 内容 pipe 给 root shell |

新增两个 Low/`NEEDS_SECURITY_REVIEW` 候选：notification `linkPath` 缺站内路径约束，以及缺失
Origin 的 mutation 被允许。本地对象存储 canonical containment 暂为当前 HTTP 数据流
`FALSE_POSITIVE`，保留 defense-in-depth 建议。

本轮没有开始修复；后续每项必须先增加失败复现测试。

#### Gate 4 SCA, SBOM, License And Images

依赖初扫：

```text
production_dependencies=227
production_Critical=0
production_High=2
production_Medium=0
development_dependencies=248
development_Critical=0
development_High=2
lock_components=472
lock_unique_High=3
```

3 个唯一 High 为 `js-yaml@4.3.0`、`nanoid@3.3.16` 和
`brace-expansion@5.0.8`。前两项进入 production dependency graph；第三项是 dev graph，
但现有 Dockerfile 把完整 workspace node_modules 复制到 runtime，因此三项都进入 API/Web
production image。

镜像初扫：

```text
API image:        Critical=0 High=3 BLOCKED
Web image:        Critical=0 High=3 BLOCKED
PostgreSQL image: Critical=0 High=0 PASS
Redis image:      Critical=0 High=0 PASS
Nginx image:      Critical=0 High=0 PASS
```

没有启动这些镜像。临时 CycloneDX 1.6 SBOM 经 OSV 重新解析仍为相同 3 个 High，随后删除；
最终 SBOM 和 THIRD_PARTY_NOTICES 必须从修复后的冻结 lock/runtime image 重生。14 个
Sharp/libvips LGPL 表达式仍需分发/法务复核。完整证据见
`docs/security/R27_GATE4_SCA_INITIAL_REPORT.md`。

历史 13 项已有逐项关闭建议（11 `NOT_IN_PRODUCTION`、2 `FALSE_POSITIVE`），但为遵守 Gate 3
两次失败停止，本轮没有改写已批准 JSON，仍保留 approved Gate 2 状态。

#### Gate 5 Secrets

Gitleaks `8.30.1` 对 approved source、当前 HEAD、全部有效 refs/reflogs 历史、报告、源码包、
tracked env/example、二进制及 431 张媒体/OCR 图像的结果：

```text
confirmed_secret_findings=0
current_source_findings=0
full_history_findings=0
untriaged_secret_candidates=0
tracked_media_findings=0
secret_rotation_required=NO
```

去除仓库窄 allowlist 后唯一候选是文档中公开的 64 位 API dist SHA-256 完整性元数据，已逐项
确认为 false positive。非 Secret 后续包括 production/staging DB/Redis 配置 fail-closed 和
空的 `.git/refs/.DS_Store` 元数据清理；没有修改共享 `.git`。详见
`docs/security/R27_GATE5_SECRETS_REPORT.md`。

#### Checks And Change Boundary

本轮执行的是只读安全初扫和治理证据固化，不是修复后的质量回归：

```text
source_package_integrity                 PASS
TypeScript AST parse                     PASS (manual, 516 files / 0 errors)
bash -n                                  PASS (manual, 49 files / 0 errors)
formal Semgrep                           TOOL_ERROR / BLOCKED
production dependency Critical/High=0    FAIL (High=2)
production image Critical/High=0         FAIL (API=3, Web=3)
confirmed secrets=0                      PASS
lint/typecheck/unit/build/Prisma/E2E     NOT_RERUN (no source fix started)
authenticated staging DAST               NOT_STARTED
stability test                           NOT_STARTED
```

只新增/更新 R27 安全治理文档；没有业务源码、lockfile、Dockerfile、migration 或扫描配置修复。

#### Mandatory Delivery Truth

1. 代码是否实现：Gate 1/2 既有工具与证据已存在；本轮确认漏洞尚未修复。
2. 本地测试是否通过：Secrets PASS；人工 parse PASS；正式 SAST TOOL_ERROR；SCA/image FAIL；
   修复后全量质量门禁未执行。
3. staging 精确 URL：未执行；没有访问 staging。
4. staging runtime commit：`UNKNOWN_NOT_RECORDED`，本轮未改变。
5. staging 用户路径是否通过：未执行。
6. production 是否改变：否。
7. production runtime commit：记录值
   `535041bb25f21d548d863d07b35e3e952b0aeb2c`，本轮未在线复核、未改变。
8. production 用户路径是否通过：未执行；没有访问 production。
9. main 是否改变：否；local main 与 origin/main 均为
   `41b4b166c587692e6f0fb9536dca2e1aab646c70`。
10. tag 是否改变：否；仍为既有 `v1.0.0`、`v1.1.0-rc.1`、`v1.1.0-rc.2`、
    `v1.1.0-rc.3`。
11. 产品负责人是否确认：R26 Gate 3D、R27 baseline、Gate 0、Gate 2 已确认；本轮安全清场未通过。
12. 未完成路由：本轮未新增路由；R27 安全修复和动态复测未完成。
13. Placeholder 数量：Gate 0 正式源码残留 `0`；本轮未改变。
14. 当前准确状态：见下方 Decision。

#### Decision

```text
R27_GATE3_FIRST_PARTY_SAST_BLOCKED
FORMAL_SEMGREP_TOOL_ERROR_AFTER_2_ATTEMPTS
KNOWN_FIRST_PARTY_CRITICAL=0
KNOWN_FIRST_PARTY_HIGH_GROUPS=2
KNOWN_FIRST_PARTY_MEDIUM_GROUPS=3
NEW_NEEDS_SECURITY_REVIEW=2
TOTAL_OPEN_NEEDS_SECURITY_REVIEW=15
R27_GATE4_SCA_FAIL
PRODUCTION_DEPENDENCY_HIGH=2
PRODUCTION_IMAGE_UNIQUE_HIGH=3
R27_GATE5_SECRETS_PASS
CONFIRMED_SECRET_FINDINGS=0
SECURITY_CLEARANCE=NOT_ESTABLISHED
FIXES_NOT_STARTED
STAGING_DAST_NOT_STARTED
PRODUCTION_UNCHANGED
MAIN_UNCHANGED
TAG_UNCHANGED
BLOCKER_REPORT
STOP
```


---

### R27B Codex Governance Refactor Milestone（2026-08-13）

- Baseline：`41b4b166c587692e6f0fb9536dca2e1aab646c70`。
- Isolation：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27-governance`，分支
  `governance/r27-agent-architecture`。
- Scope：仅安装产品负责人批准的治理文件并追加本里程碑；未修改业务源码。
- Verification：未运行源码测试、build、安全扫描或部署；等待产品负责人 review 治理 diff。
- Gate：未改变 R27/R27A Gate 结论，R27A security clearance 仍未建立。

---

### R27B Governance Repair v2.1 Milestone（2026-08-13）

```text
R27B_OWNER_REVIEW_V1=FAIL
R27B_REPAIR_V2_1_APPLIED=YES
GOV_WORKTREE_DIRTY=YES
COMMIT_CREATED=NO
STAGE_EXECUTED=NO
PUSH_EXECUTED=NO
MAIN_UNCHANGED=YES
PRODUCTION_UNCHANGED=YES
TAG_UNCHANGED=YES
SOURCE_REPO_UNCHANGED=YES
FORMAL_R27_WORKTREE_UNCHANGED=YES
SOURCE_TESTS=NOT_RUN_BY_DESIGN
SECURITY_SCAN=NOT_RUN_BY_DESIGN
DEPLOYMENT=NOT_AUTHORIZED
AWAITING_OWNER_REVIEW_V2
```

---

### R27D Reviews Finding Ledger Closure（2026-08-15）

- 目标：将 `R27D-G4-001`、`R27D-G4-002` 绑定到 Reviews 修复提交
  `2ad18e31a52d2e89617601a0dc29eab07aca0b87` 并记录为 `closed`。
- 范围：仅 `docs/security/FINDINGS.yaml`、`docs/security/FINDINGS.schema.yaml` 与本执行记录；
  未修改业务源码、Migration、依赖、Samples 或运行环境。
- 输入：G1/G2/G3 result artifact SHA-256
  `51f7a67a689f6adb69577877d69d4f774207453eec1f2c9018eda7447f3e859b`；独立 G4 closure
  SHA-256 `b934e4a4336dc3ebc81b126722a863cb46d72b9c138a97b24bb1a39843525d33`；
  PostgreSQL JSON/log SHA-256 分别为
  `9c01532c104625548872b94e42baeabb8b1f2eb52fa046aec7f2f37139f6ff53` 与
  `a43237ba4d405e6a07e70a8d42338d0ba27b53003c06385957fdf369f41f6473`。
- 改动：写入两条 Finding 的 source、scope、fix commit/tree、G1/G2/G3/G4 binding、
  PostgreSQL closure binding 与完整生命周期；ID schema 支持 `R27D-*` round suffix。
- 检查：JSON 解析、Ledger 结构/状态/SHA/transition 定向校验、`git diff --check`、docs-only
  范围核对与 Placeholder 扫描。
- 验收：两条 Finding 均为 `closed`，fix commit/tree 一致，四类 Gate binding 与 PostgreSQL
  evidence SHA 已记录；未重跑源码测试、Migration、数据库或安全审查。
- 风险：普通 `CREATE INDEX` 的生产锁时长尚无数据；正式部署前仍必须批准在线索引或维护窗口
  策略。该 blocker 不影响本地 Finding/代码提交闭合，但继续阻止 production deployment。
- Placeholder：全量命令有 10 个 raw match，均为测试中的负向断言或 `getByPlaceholder` API；
  排除测试后的 `apps/web/src` 正式源码命中为 `0`。
- 下一步：本 docs-only 提交完成并验证后，Reviews 批次才具备进入独立 Samples 任务的顺序条件；
  本任务不自动修改 Samples。
- 环境：未访问 staging/production；main、tag、production 均未改变；产品负责人尚未对部署或
  产品路径给出 `PRODUCT_OWNER_ACCEPTED`。


### R27RC2 目标式规则整合与现场恢复（2026-09-07）

- 输入：所有者本轮请求及 Downloads 中 R27_RESTART_PROMPT.md / AGENTS.candidate.md；候选稿用于增量整合，未直接覆盖根规则。
- 现场：feishu_timeline_app-r27rc2-repair / security/r27rc2-candidate-repair；基线 38ccd95ae95835806e92b530b17fd50f88166efd。六个既有产品补丁在治理阶段逐文件 SHA-256 不变；原 patch SHA-256 为 fed2bc365cd6c2feab9cebb5b825fff0e1e14a8ace79d1e35653a022960d7831，备份与逐文件摘要在 /private/tmp/rc2-resume-20260907/。
- 改动：AGENTS.md、治理 architecture、verification gates、三个任务模板、security 上下文；替换模型白名单、机械文件/命令字段门槛、强制另开会话和无条件全局停止。业务/安全不变量、实际平台/组织限制、Git 与环境独立授权保留；补充真实脚本与观察入口。目标树无 STANDARD_EXECUTION_PROFILE 或目录 override，不创建重复入口。
- 验证：git diff --check PASS；独立只读审查 /root/independent_review 最初发现作者自审豁免残留，删除后复核 PASS。七文档最终 diff SHA-256 52eab939e2288ae9bdc332c5887ee9a8bc0bbdbce2cda25308f1838882a5ca18。原产品六文件未改变。
- 上下文：当前任务的直接用户指令已明确授权目标式执行，主任务已实际读取更新后的规则；不声称会话启动时的 AGENTS 自动重载。继续工作不依赖修改全局配置或额外工具权限；新会话仍须从目标目录加载。
- 实际进展：已找到原 RC2 BLOCKER_REPORT；其中 E2E 缺幂等键是实证，后续项目锁日志缺失，不冒充已有复现。新隔离 PostgreSQL 已应用现有 36 migrations；初次容器目录权限问题已修正。
- 下一步：继续原修复及创建项目的直接流程锁调用链，补真实数据库回归与最终独立审查。manifest/schema 契约与目标平台未决，未关闭 Finding。
- 环境与授权：本轮仅本地，允许显式 stage/分开 checkpoint，禁止 push/main merge/tag/远端/staging/production；产品状态 AWAITING_PRODUCT_OWNER_CONFIRMATION。


### R27RC2 本地修复与独立审查 checkpoint（2026-09-07）

- 目标/输入：续接实际修复树的六文件 dirty patch，完成项目创建、直接流程锁和附件上传链路的真实本地修复；不重启历史盘点。
- 治理 checkpoint：69c1012a39c0a9977fc442e0b035b203af587997；产品 checkpoint：080453967581ef03872e1b2d130fe9d75d86fc85，tree b5c65c522384643528482053b91ab2c13387e05f。本条和回执为后续独立 evidence commit，不改变应用源码身份。
- 范围/文件：21 个产品修复及直接测试/迁移说明文件，详见产品 commit；没有依赖、schema、migration 或 CI 修改。六文件原 patch 已保存，治理阶段字节不变；产品阶段只续改其中两份测试，另四份仍字节不变。
- 执行/验收：根 lint/typecheck、Web 287 测试、最终 API 1284 测试、Web/API build、Prisma validate、部署安全脚本回归 PASS。真实 PostgreSQL 36 migrations 与项目/附件并发测试实际执行；HTTP 主链路及 Chrome 创建/刷新/列表/时间线 PASS。最终独立只读 G4_DIFF PASS。原始 Placeholder 命中 10（全部白名单测试），正式页面 0。
- 环境：仅本轮专用 localhost / 临时 PostgreSQL 与 Redis，模拟登录；三个临时容器和本轮 Web/API 已关闭。未访问或部署 staging/production，未 push、main merge 或 tag；main 未改变。
- 风险/下一决策：当前修复达到 CODE_IMPLEMENTED / LOCAL_VERIFIED；整个发布候选尚受 manifest 合同、Admin/Suppliers 现存同类锁路径、正式 source/image 证据、目标 platform 及迁移/恢复授权约束。未关闭新 Finding、未接受风险，不自动进入远端验收。产品状态 AWAITING_PRODUCT_OWNER_CONFIRMATION。
- 回执与日志索引：[R27RC2_LOCAL_REPAIR_20260907.md](handoff/R27RC2_LOCAL_REPAIR_20260907.md)。原补丁、失败和成功日志、截图/网络及摘要在 /private/tmp/rc2-resume-20260907/。


### R27RC2 Admin/Suppliers 与 manifest 本地候选收口（2026-09-07）

- 授权与起点：所有者明确授权锁修复、manifest 合同、验证、独立审查和本地提交；从干净 d4ebd25152cb8c2991918ad2dc5fbe2c1c169dde 续接，未触碰原 main 工作树。
- 产品：c37f8103e5be35cb951ab3f022ffee80add6038e；tree 25eb8f1352a8602d2a0c72438ab2b23fa74152c5。10 文件：Admin/Supplier 八处事务锁及直接测试，现有 manifest helper/测试/部署合同文档。既有补丁、legacy restore fail-closed、Web、依赖、schema/migration/CI 保留。
- 验证：23 定向真实 PostgreSQL、151 受影响、API 全量 1320、HTTP 29 请求、manifest 18、原 health/shell 安全回归及 API lint/typecheck/build/Prisma PASS；独立只读 G4_DIFF PASS。原失败日志保留。Web 未变结果按绑定复用；正式页面 Placeholder 0。
- Finding：唯一 Ledger 新增 R27-RC2-ADVISORY-001 与 R27-RC2-CURRENT-002，均 fixed_diff_verified；原七条历史原文保留，schema 未改，无风险接受或全量关闭。
- 本机证据：test-results/r27rc2/local-candidate-closure-20260907-034253；上轮35项证据已持久保存并核验于 local-repair-20260907，未提交原始日志。API 和本轮两个临时容器已清理。
- 状态：CODE_IMPLEMENTED / LOCAL_VERIFIED，仅本轮本地阻断清除。正式 source/image、目标 platform/不可变镜像、外部恢复控制器、Reviews 生产索引方案、具体环境/真实飞书及负责人验收仍未完成。无远端查询/push/main merge/tag/部署，staging/production 未访问，AWAITING_PRODUCT_OWNER_CONFIRMATION。
- 完整身份、逐锁覆盖、证据与外部输入：[本轮收口回执](handoff/R27RC2_LOCAL_CANDIDATE_CLOSURE_20260907.md)。本条与回执/Finding 为产品之后独立 evidence commit，不回写提交自身身份。


### R27RC2 离线制品准备与数据演练（2026-09-07）

- 起点：干净 c7054a7d2511d71ffbef7e05268758cc2ee74110；已核对相对 c37f8103 只有证据文档。用户授权本地准备/修复/审查/提交，禁止新增联网、安装、远端、上传或部署。
- 工具修复 checkpoint：314b6523259a6f646915debccc85a2226ba40c79，tree f2953a484f0fcd145590088a6e42707b45863940。两文件修正 Gitleaks native 来源、完整 HEAD 基线与实际扫描快照摘要；独立只读审查及现有安全回归 PASS。应用、依赖、schema/migration、CI 与 Finding 原文不变。
- 实作：干净新提交上 Gitleaks 当前输入/完整本地历史 PASS（267 commits）；旧库 Trivy 生产/全依赖预检零条目，明确不代替当前正式 SCA；Compose 仅解析 PASS。真实 Prisma 26→27→36 升级、六附件五扫描状态/配额、关键内容/约束/权限、升级前后两个空库恢复及对象hash验证 PASS；只是合成演练，篡改仅证明摘要不同，未验证外部恢复消费者拒绝。
- 原始错误与审查澄清保留；本机96项证据在 test-results/r27rc2/release-artifact-preparation-20260907，摘要索引已核验。两份合成 custom dump 与对象保留，本轮专用断网 PostgreSQL 已清理。
- 未完成：未知批准目标 platform，固定 Node 基底本地缺失，未构建/运行新镜像；正式 Semgrep/pnpm audit/镜像扫描和远端 CI 未执行。没有真实 runtime/registry digest；控制器、Reviews 生产索引、具体预发环境与真实飞书/负责人验收仍待输入。
- 下一步：先提出限定 origin/提交的远端只读配置与自动部署副作用核查，再决定 codex/r27rc2-artifact-validation 验证分支的非强制 push；当前 CI 无完整报告保存与六镜像覆盖，不把绿色作业当发布候选就绪。详见 [本轮回执](handoff/R27RC2_RELEASE_ARTIFACT_PREPARATION_20260907.md)。
- 边界：无远端动作、上传、main/tag 变化、部署或真实用户验收。此记录是后续独立 evidence commit，应用产品 checkpoint 仍为 c37f8103e5be35cb951ab3f022ffee80add6038e。


### R27RC2 CI 证据输出本地候选（2026-09-08）

- 输入/授权：所有者转交《补齐管理可见性并完成 CI 证据输出》；从干净 7922fca317c473c9fd26ca582984bfb9f5e20ae1 续接。只读定向远端查询及本地实现/审查/提交；前轮四份未提交只读证据保留。
- source candidate：5a388095726d1b53fe79e379e1f3665d4a310a5d；tree 608f69ba5aacbb5e67359eabe2a62752424c05ba；锁文件 SHA-256 9186715db8a3fb724b2d856067bb69f320204beb4027b8672a0f2b263503d962 未变。相对原 314b6523 仅新增四个 CI/报告/测试文件差异及既有证据文档；本条和主回执在独立 evidence commit。
- 改动：ci.yml、run-sca.sh、新 ci-evidence.mjs 及其测试；12份脱敏 JSON 白名单、官方固定 upload-artifact SHA、7天拟留存、实际 source/runner/build/tool 元数据、显式非生产 linux/amd64。原触发器、权限、checkout、dispatch-only Playwright 保持；未改业务、依赖/schema/migrations、基础镜像或 Finding。
- 验证：node 合成20/20、安全脚本受影响回归、语法/YAML/条件/固定 Action 输入/定向 lint/diff 检查 PASS；独立 G4_DIFF 首轮 Semgrep 严重度 P2 修复后 PASS，最终四文件摘要与提交一致。未运行真实扫描/CI/镜像构建、数据库或重跑1320业务测试；Placeholder raw10测试白名单/正式0。
- 只读观察：2026-09-08 04:47:44 UTC main 仍为 41b4b166c587692e6f0fb9536dca2e1aab646c70，拟用 codex/r27rc2-artifact-validation ref 当时不存在；管理页缺现有登录，未重复匿名受限查询。Node/Postgres固定 manifest 各查询一次均 digest verification failed，平台可用性未证实，保留引用。
- 风险/下一决定：需现有管理身份或脱敏 hooks/Apps/Actions/适用规则证据，以及公开候选/必要历史、报告可见性批准后，才提出合并受限执行请求。动态规则摘要、逐镜像 DB/新鲜度、六镜像/真实环境及原独立部署条件未解决。
- 状态：CODE_IMPLEMENTED / LOCAL_VERIFIED（CI补丁）/ G4_DIFF_PASS；MANAGEMENT_VISIBILITY_PENDING / CI_NOT_EXECUTED / NOT_DEPLOYED；无push、远端上传、main/tag变化、staging/production访问，AWAITING_PRODUCT_OWNER_CONFIRMATION。
- 单一主回执：[R27RC2_CI_EVIDENCE_READINESS_20260908.md](handoff/R27RC2_CI_EVIDENCE_READINESS_20260908.md)；本地必要日志/摘要索引在 test-results/r27rc2/ci-evidence-readiness-20260908/evidence-index.json，未提交原始证据。


### R27RC2 第一次真实远端 CI（2026-09-08）

- 授权/输入：所有者明确批准精确候选及必要历史公开、唯一 validation ref 一次正常 push、既有 CI 网络/日志/cache/12 JSON artifact 和本地结果取回；禁止重跑、其他远端写入及部署。Vercel NONE_OBSERVED_IN_AUTHORIZED_VISIBLE_SCOPE 直接复用。
- Final preflight：原 source 5a388095726d1b53fe79e379e1f3665d4a310a5d / tree 608f69ba5aacbb5e67359eabe2a62752424c05ba、四文件与锁文件绑定未变；Node原固定index和linux/amd64子manifest均经官方registry正常TLS/字节摘要验证，无源码修复。Postgres仍DEPLOYMENT_PREREQUISITE_PENDING。
- 实际写入：只向 refs/heads/codex/r27rc2-artifact-validation 正常推送原 source 一次，pre-push守卫拒绝已存在ref；没有推evidence HEAD。推前ref不存在，推后等于候选，main/default仍41b4b166c587692e6f0fb9536dca2e1aab646c70。
- 实际CI：[run 34191540314](https://github.com/pijhbkbk/feishu_timeline_app/actions/runs/34191540314)，push/attempt1，05:40:41–05:44:21 UTC，failure；verify failure，security-source failure，playwright-smoke skipped。只观察到这一workflow/三个预期checks，deployment记录0。
- 正式结果：Secrets当前树/历史均PASS零发现；Web构建成功但生产产物eval-source-map检查FAIL，API/Docker/镜像扫描随之skipped；Semgrep4 findings+8 tool errors；全/生产SCA均qs6.15.3的同两条中危公告。未弱化检查、改依赖、rerun或第二次push。
- 取回验证：两个artifact合计12 JSON已下载；ZIP摘要、白名单、SHA/tree/lock/run/job/step outcome与GitHub一致，身份校验0错误；actual github-hosted ubuntu24 image20260831.293.1、x64、Docker28.0.4 linux/amd64、Node24.20.0。必要可见失败日志已保存；完整归档/raw下载被浏览器客户端阻止，8个Semgrep错误明细及部分ruleId不可得，未伪造补齐。
- 下一步/结束：只针对本次三个真实失败方向处理；镜像证据需后续另行获准CI。本轮结束，不进入staging/production，不新建产品提交；release FIRST_REMOTE_CI_FAILED / RELEASE_NOT_READY / NOT_DEPLOYED，产品AWAITING_PRODUCT_OWNER_CONFIRMATION。main/tag不变，无路由变更，未重跑Placeholder（此前正式0仅历史观察）。
- 唯一主回执：[R27RC2_FIRST_REMOTE_CI_EXECUTION_20260908.md](handoff/R27RC2_FIRST_REMOTE_CI_EXECUTION_20260908.md)；29项本地证据及摘要索引在test-results/r27rc2/first-remote-ci-20260908/，原始证据不暂存/提交/上传。

## 2026-09-08 — R27RC2 first remote CI failure repair

- Scope: owner-authorized local three-direction failure repair, targeted downloads/build/scans, independent read-only review and local commits; no second push/CI, settings or deployment.
- Source: `84a153884bea9d59ec56ef4e6ce3ada4b2144854`; tree `1647b6b00922bda0a39211f95070c65985ee20db`; lock SHA256 `5e7450da9c82bfe96390a9be4198ebc784e5e858e17c5fc5ed71ce33713e3f2c`. Prior source checkpoint `c216bd8938db81239f07738cf343917ae8dd8ca2`; subsequent commit only supplies explicit expected identity to the new runtime test.
- Implemented: exact Next development-entry tracing exclusions with complete fail-closed artifact scanning; equivalent Bash parser compatibility in eight existing scripts; four independently justified precise SAST annotations and loopback redirect rejection; qs6.16.0 only for its two actual compatible parent versions; regression tests. AGENTS/CI/evaluator/upload boundaries unchanged.
- Verified: frozen install, lint/typecheck, Web287 + API1280 tests passed /30 DB tests skipped, Web/API builds and Prisma validate, security/deploy/CI-evidence gates, SAST664 targets0 findings/errors plus final one-file affected scan, all/prod SCA0 findings, exact-identity native standalone, final API/Web linux/amd64 image builds, API actual qs6.16.0 and Web offline image runtime. Independent main+incremental source reviews have no blocking source comments.
- New blocker: final Trivy image scans each report20 OpenSSL package findings (High2/Medium6/Low12), same10 CVEs across both images; libcrypto3/libssl3 3.5.7-r0, scanner fixed3.5.8-r0. Tool errors0. No risk acceptance/base-image update performed. `R27-RC2-CI-IMAGE-001` remains confirmed in unique Finding Ledger; six original repair/triage records also added without changing nine historical records.
- Evidence: first run34191540314 attempt1 and all29 original indexed hashes preserved. This batch index `test-results/r27rc2/first-ci-failure-repair-20260908/evidence-index.json`; full source/commands/platform/build/rule/DB/result binding recorded. Main receipt `docs/handoff/R27RC2_FIRST_REMOTE_CI_FAILURE_REPAIR_20260908.md` contains failure matrix and held exact FF/CI request.
- State: `RELEASE_NOT_READY / IMAGE_SCAN_BLOCKED / REMOTE_REVALIDATION_PENDING`. Main/tag/staging/production unchanged/unexecuted; product confirmation pending. Next: minimal authorized base-artifact repair before new candidate CI; original once-only push grant is exhausted. PostgreSQL deployment prerequisite remains pending and was not used to block source/build checks.


## R27RC2 image OpenSSL remediation — 2026-09-08

- Scope: authorized local API/Web image remediation only, no remote writes or deployment. Source `8c265959f2dcca272d59ca9cbe8f9ae7b821019d`, tree `033a780976332652ca2b21801863ceab086772bd`; later evidence HEAD in local index. Only two Dockerfiles and one direct runtime test changed.
- Fix: retain fixed Node24.19/Alpine3.24 base; shared stage pins libcrypto3/libssl3 3.5.8-r0. All runtime/base stages inherit it; ops linkage noted, not accepted as tested.
- Validation: exact Linux/amd64 API/Web builds and health, crypto/TLS positive-negative, Prisma/Sharp native runtime, Web1126 shipped files,30 separately executed PostgreSQL tests pass. Same Trivy DB SHA confirms old20each/new0each; original coverage/thresholds unchanged. Prior1567PASS/30skip evidence remains original.
- Independent G4_DIFF approves partial system remediation only. Node embedded3.5.7 remains, at least75803 patch absent in current official24 source; no official complete applicability closure. Unique finding R27-RC2-CI-IMAGE-001 stays in_progress; RELEASE_NOT_READY.
- Evidence: `docs/handoff/R27RC2_IMAGE_OPENSSL_REMEDIATION_20260908.md`, local `test-results/r27rc2/image-openssl-remediation-20260908/evidence-index.json`. Previous161 local evidence files preserved. No push/CI/settings/deployment. Future FF request condition not met; original first-push permission not reused.
- New direct test SAST initially found missing GCM tag length; fixed explicit16 and short-tag negative assertion. Final pinned offline scan0 findings/0 errors;8c final images and affected checks rebuilt/rerun, intermediate6dd failure/review preserved.


## R27RC2 Node 内嵌 OpenSSL 适用性（2026-09-09）

- 用户明确转交附件，限本地官方输入/现有镜像/外置测试/独立只读审查；无远端写入或部署。
- source/test candidate `e0b20a69522edd4dc76ee3b3219badda7166acbd` / tree `fa64715929aed610ae2714482db0b881ba2f367d`；只新增一份外置测试，实际两镜像 runtime 仍 `8c265959f2dcca272d59ca9cbe8f9ae7b821019d`。
- 十项 CVE 在精确 API/Web/current config 内均不适用，不能声称内嵌3.5.7已打补丁；系统40实例修复及原263文件证据保持。
- 两镜像各24组/80个认证负向通过，原Semgrep定向0 findings/0 errors，语法与独立G4通过；唯一Finding `R27-RC2-CI-IMAGE-001`推进fixed_diff_verified，未closed/未风险接受。
- 主回执：`docs/handoff/R27RC2_NODE_EMBEDDED_OPENSSL_APPLICABILITY_20260909.md`；本地结果索引：`test-results/r27rc2/node-embedded-openssl-applicability-20260909/evidence-index.json`。
- 准备新的唯一验证ref FF/CI请求但不执行；当前RELEASE_NOT_READY / REMOTE_REVALIDATION_PENDING。staging/production/main/tag未改变，产品确认未获得。


## R27RC2 部署准备续接（2026-09-10）

- 用户目标：持续修复至可安全部署；已授权的本地调查、实现、验证和可回滚检查点持续执行。实际起点为 repair 工作树 a116c374c1603b1cd2d19f5a5d79a0a0f290eb56，未从八月旧树重做。
- 源码检查点 defd47d80ca2cf9568a02c50c0acbfa89eff57e5 / tree 1ef3bfcd47746ed048c114dce31accb2476af72b：恢复材料 verify-and-snapshot、17项直接测试、真实隔离恢复演练及使用说明。四文件；没有业务、schema/migration、依赖、CI或部署禁用入口改变。
- 目标与受影响验证：17/17、真实断网PG恢复/篡改拒绝/完整行和对象/外键PASS；独立G4_DIFF PASS；固定Semgrep覆盖三个新增mjs、0finding/0error；manifest和部署安全回归PASS。必需安装/lint/typecheck/test/两端build/Prisma均exit0；Web287、API1280 PASS/30 SKIPPED，跳过不冒充实库执行。
- 制品：从e0b20a69522edd4dc76ee3b3219badda7166acbd构建本地linux/amd64 API-ops，inspect Id sha256:b0c6b3621c8e8d0271f2402225e33397a6246569360d244d6087c31281e718fa；Trivy新鲜库0漏洞。新镜像在断网空PG真实应用36迁移、checksum、重复deploy及有效Reviews索引PASS。不是registry发布/目标平台验收。
- 只读远端：validation 5a388095726d1b53fe79e379e1f3665d4a310a5d、main 41b4b166c587692e6f0fb9536dca2e1aab646c70。未push/触发CI/main merge/tag/部署；精确公开推送与目标环境问题仍待所有者回复。
- 原始失败与最终证据保存在test-results/r27rc2/deployment-readiness-20260910/，不提交上传。源码与证据提交分开。Placeholder正式0/raw10测试白名单；真实环境路由均未验收，临时容器已清理。
- 风险/下一步：远端CI、明确预发URL/平台/隔离资源、完整制品digest、受信控制器安装/实际恢复、Reviews窗口、真实Feishu/角色/附件与负责人验收未完成。GPT-6 Pro已作通用技术咨询，不代替所有者/组织批准。
- 单一回执：[R27RC2_DEPLOYMENT_READINESS_20260910.md](handoff/R27RC2_DEPLOYMENT_READINESS_20260910.md)。当前 LOCAL_VERIFIED / NOT_DEPLOYED / RELEASE_NOT_READY / AWAITING_PRODUCT_OWNER_CONFIRMATION。


## 2026-09-10 — 生产上线任务启动与新依赖告警

- 最新所有者指令：先修复所有中高危漏洞，再部署既有 GCE 与 `https://timeline.all-too-well.com`；工程阻断委托 GPT-6 Pro 决策。不得将模型意见当作平台权限或实际验收证据。
- 当前修复工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`，分支 `security/r27rc2-candidate-repair`，起点 `7783480457c41d64d7c73ba519bf396197c501ee`。旧主工作树与未跟踪媒体保持不动。
- 已通过 IAP 只读核对现有目标：linux/amd64 Ubuntu 22.04.5、4 GB RAM、约16 GB可用磁盘、Docker29.6/Compose5.1；既有宿主 Nginx、API/Web systemd、PostgreSQL14.24、Redis。还有其他应用，只修改 timeline 专属资源。
- 精确公网 `/api/health` 与 `/build-info`、server HEAD 均仍为 `535041bb25f21d548d863d07b35e3e952b0aeb2c`，release `r26-admin-535041bb25f2`，buildTime `2026-08-09T06:49:11Z`。本次未切流、未迁移生产数据库。
- 生产数据库 `feishu_timeline` 约16 MB、26个已完成迁移、1个项目、0评审/0附件；无活动 ClamAV。实际恢复/迁移及杀毒链路尚待执行。
- 新鲜SCA命中9项包告警，对应8个唯一上游公告（2critical/4high/1medium/1low；中危同时命中Vitest和mocker）。已登记唯一 `FINDINGS.yaml`，状态 `in_progress`；旧扫描不再支持最终候选发布。升级前报告 `test-results/r27rc2/production-release-20260910/sca-baseline.json`，SHA256 `32672eacf8f46cb11dad83e8597b6d717dcde4284a70d9926e5991639bb10140`。
- 修复范围：Next15.5修复线、sharp0.35.4、Multer2.3.0、Vitest4.1.11，保留既有qs修复；增加HTTP上传边界/异常字段/接收中断回归，精确处理Multer新错误码。未改变模型或历史migration。
- 独立只读审查确认该升级方向及最小回归；最终安装/锁文件/测试/镜像验证仍待完成。一次目标测试因安装尚未完成、vitest入口未链接而未执行，不计为测试PASS。
- GCE Artifact Registry查询返回服务未启用，尚未创建仓库或启用服务。正在按所有者委托等待Pro的工程决定；可继续本地修复。
- 当前准确状态：`CODE_IMPLEMENTED_PARTIAL / LOCAL_VERIFICATION_IN_PROGRESS / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。main/tag未改变。


### GPT-6 Pro 委托决定与依赖修复进展

- Pro在用户指定账号对话中明确批准：必要修复、既有验证分支非强制FF迭代、CI、私有制品、最小生产适配、恢复演练、维护和切流；不改main/tag，不绕过真实权限或事实验证。
- 补充决定取消其先前默认的24小时公告/固定凌晨要求。最终演练完成后，可在本任务告知并于本域名展示维护提示，冻结本应用写入与通知、排空请求后短维护。旧会话服务端失效，通知最后恢复；新版本接收业务写入后禁止用旧备份覆盖新数据。
- 批准启用现有GCE项目Artifact Registry并创建区域内专用私有仓库，不公开、不新增长期密钥；批准保留核验并修补后的宿主Nginx/PostgreSQL14/Redis，容器运行API/Web/ops/ClamAV，清单及校验最小适配实际角色。不是验证豁免。
- 正式Web构建需保留现有V2/real及V1 fallback配置；旧staging默认V1不适用于本次生产。
- npm客户端两次在Next下载无进展，第二次请求超时选项未结束挂起的body读取；暂停相同下载方案。独立官方tarball下载成功（31,014,520字节），并与官方注册表SHA512 `OMWNulIIqKM2ykvC2qMjIt0IoavB4UB2SCs4iXJ6z6847FvyH8jBmBWcvrF5iuhTu8Przh20Fo/aoszIdqx4PA==`一致；通过pnpm store add导入内容缓存后offline安装成功。锁文件无file/本机tarball来源，独立审查已确认。
- 实际锁版本Next/Nexteslint15.5.25、sharp0.35.4、Multer2.3.0、Vitest/mocker4.1.11；全量/生产SCA均0报告漏洞。上传+qs目标25PASS。原始9包告警已清除，但最终镜像/完整验证尚未完成，Finding暂不关闭。
- Vitest4类型检查发现原有private-method `as never`及无签名mock类型不再兼容；仅明确既有测试方法签名，不删除/跳过/弱化断言。首次修正遗漏2个同型调用，确认具体位置后补齐；保留失败日志，重跑受影响验证。


### 2026-09-10 production adaptation / ongoing

- Candidate cd38cf3ad7f1340e5bc1b6e19c5d5e51a07c16ad pushed normally to codex/r27rc2-artifact-validation. CI 34479395531 verify/security-source SUCCESS; Playwright not executed on push. Production still 535041bb25f21d548d863d07b35e3e952b0aeb2c, not changed.
- Pro decision approves dedicated authenticated Redis, private project network, AOF/noeviction and least-privilege ACL, scoped notification queue+dedupe migration preserving order/expiry; old authentication state revoked, shared Redis untouched. Rejects using host networking merely for connectivity.
- Exploratory gce-loopback profile reproduced current startup rejection (1 failed / 62 passed), then target tests passed63. This authored exploratory patch was withdrawn in favor of Pro-approved bridge isolation; original production connection policy preserved. Evidence retained under /private/tmp/rc2-production-20260910/evidence/gce-profile-*.log; these results do not describe final-source tests.
- cd38 image build was cancelled after Next package response body stalled; no produced artifact approved. New bounded official-registry prefetch validates frozen-lock SHA512, rejects oversize/timeout, seeds pnpm store without changing dependency source; frozen install remains required.
- Pending Pro decision: bridge-bound dedicated PG socket proxy and role-specific database access rules, plus measured ClamAV capacity fallback. Independent review flagged shared-host lateral access and notification in-flight drain proof; neither is waived.

### 2026-09-10 production security continuation — final artifacts and host maintenance preparation

- Runtime source remains pushed immutable `8172cba77db286c75a54d35db3f49a22b37de1b8`, tree `928fd27f18e72b2639a8f17deeaddb355f55bbde`; release `r27-security-8172cba77db2`, build time `2026-09-10T13:10:13Z`. Remote CI run `34480892035` succeeded. No main/tag change.
- API, API ops and Web amd64 builds completed. Exact-image Trivy 0.72.0 scans recognized Alpine 3.24.1 and reported zero known package vulnerabilities at every severity. Reports and IDs: `/private/tmp/rc2-final-image-scan-8172cba/summary.json`. This is artifact-specific evidence, not host clearance.
- PostgreSQL 14.24 isolated real DB suite: 4 files / 45 tests PASS; migrations applied, repeated deploy and status PASS. Evidence: `/private/tmp/rc2-production-20260910/evidence/pg14/`.
- Final image native probes passed: API Prisma/musl transaction, AES-GCM, TLS trust/hostname rejection; Web Sharp 0.35.4, AVIF/heif security revision and malformed input rejection. Initial Web HTTP check returned 500 because required EXPECTED_* identity configuration was omitted in the test environment; preserved failure, supplied the exact four expected identity fields, same-image HTTP/static-resource verification PASS. No application code or assertion weakening. Evidence: `/private/tmp/rc2-final-runtime-8172cba/`.
- GPT-6 Pro explicitly approved bridge-only production topology, root-controlled PostgreSQL TCP proxy with distinct backend source 127.0.0.2 and exact SCRAM HBA allow/reject boundaries. No host-network workaround or application loopback validation bypass. Implementation pending.
- GPT-6 Pro approved one private e2-standard-2 scanner VM, <=30GB disk, same region, <=USD100/month including network. Official Oregon browser price verified USD0.06701142/hour; estimate with disk/NAT/IP and USD20 variable reserve = USD76.59/month. Dedicated subnet/router/NAT/firewalls and scanner VM created. No public IP/service account requested. Effective firewall and startup metadata preflight passed (only project SSH key metadata); actual instance postcheck pending. Firewall initial CLI validation failed on unsupported --deny; corrected to documented --action DENY --rules all; resumed only failed and subsequent steps.
- Confirmed actual original host is running kernel 6.8.0-1053-gcp with fixed 1066 installed, initramfs/modules/GRUB entry present. Pro approved a single normal guest OS reboot after whole-host consistent backups and recovery preparation, including necessary short interruption of the other application, preserving all services/data; no reset/force shutdown. Reboot NOT yet executed.
- CVE-2026-53362 remains vulnerable on linux-gcp-6.8 1066; Pro requires actual trigger-surface elimination or supported patched/unaffected platform before cutover, not risk acceptance. Process seccomp must cover IPv6/SCTP, io_uring, compatibility ABI and inherited FD boundaries; shared host exposure must also be addressed. Independent review identified the exact Docker v29.6.0 seccomp v0.2.3 base, implementation pending.
- Current production remains old runtime `535041bb25f21d548d863d07b35e3e952b0aeb2c` at `https://timeline.all-too-well.com`. No production DB migration, traffic switch, session revocation or app stop has occurred. State: CODE_IMPLEMENTED / LOCAL_VERIFIED for scoped fixes; production release NOT_DEPLOYED; product AWAITING_PRODUCT_OWNER_CONFIRMATION. Remaining: host vulnerability disposition and reboot/recovery, scanner/tunnel/runtime isolation, external controller/config, consistent backups and low-privilege restore rehearsal, notifications/inflight reconciliation, exact-domain browser acceptance.

### 2026-09-10 14:00 UTC — delegated maintenance update and scanner blocker

- GPT-6 Pro owner delegate decision 6 supersedes the earlier 1066-only plan: verify official Jammy 5.15 GCP LTS (`linux-gcp-lts-22.04=5.15.0.1115.112`, kernel `5.15.0-1115.125`, runtime `5.15.0-1115-gcp`) plus official Jammy Docker 29.8.0/containerd security updates on one isolated temporary VM; then one prepared production maintenance/reboot, restoring all original services before application cutover. Preserve 1053/1066 rescue kernels and existing Docker containerd image store. Keep following future LTS fixes, not a permanent 1115 pin. Direct kernel notice USN-8730-1; USN-8661-1 describes 1114. No blanket IPv6 shutdown prerequisite remains for CVE-2026-53362 on the unaffected 5.15 branch; other applicable host findings still require evidence.
- Temporary validation VM `timeline-validation-r27`, us-west1-b, private-only/no service account, synthetic data only; e2-medium/30GB, cumulative budget USD10, enforced DELETE termination 2026-09-10T21:49:06Z with boot-disk auto-delete. Only its dedicated resources may be cleaned; scanner/NAT/shared resources remain. Exact budget record: `/private/tmp/rc2-production-20260910/evidence/validation-resource-budget.json`. Baseline installed official Docker29.6/containerd2.2.5, PostgreSQL14.24, Redis6.0.16, Nginx1.18.0 security revision matching original host. Four immutable private application/support images pulled.
- Scanner full official signature update/database tests succeeded. Raw scanner binds host loopback only; encrypted application tunnel not yet installed. Nonroot scanner starts using 944MiB of its 3GiB limit. Seccomp v2 keeps IPv6 denied but returns EAFNOSUPPORT for AF_INET6 socket, resolving verified musl AI_ADDRCONFIG startup incompatibility; sha256 dc25b0ab943c0d7b99378b4600fe31002ba209c4445b3e141a2e20c8860bf973. Existing stronger-default restrictions remain. v1 actual native/compatibility-ABI denial probes passed; v2 affected probes pending.
- BLOCKER (new root cause): ClamAV1.4.6 INSTREAM accepts a ZIP containing an actual 21MiB member despite MaxFileSize20M/AlertExceedsMax. Clean/EICAR/exact20MiB passed; archive limit failed. Independent upstream source review confirmed silent truncation in Stored/Deflate/Bzip2/Implode paths; Office uploads use ZIP too. Preserved original failing assertion/log (`evidence/scanner-stream-regression.log`). No risk acceptance or weakened test. Minimal derived-engine patch proposed to GPT-6 Pro; independent source review proceeding while unaffected temporary-host validation continues.
- Production remains old runtime 535041bb25f21d548d863d07b35e3e952b0aeb2c/kernel1053; no package installation, restart, database cutover, auth revocation, traffic change, main change or tag change. Application source remains 8172cba77db286c75a54d35db3f49a22b37de1b8; deployment not yet verified.

### 2026-09-10 20:48 UTC — scanner repair and isolated maintenance verification

- Delegate decision 7 approves a minimal maintained ClamAV 1.4.6 ZIP-limit patch, retaining 20MiB file / 100MiB aggregate bounds and fail-closed behavior. Official tarball SHA256 06dbc7adf96e2f6a27c548a841ce83c95360d1e121b106a6f7cf56f282a3c61b verified by Talos signing fingerprint 5BADCA2665EF59DCF8A23D8B707F0DB480836771. New scripts/security/clamav/{zip-limit-alert.patch,source.json} records exact source/patch identities. Four decompression truncation paths now record a limit alert; final runtime regressions and image release remain pending.
- API scan result preserves REJECTED while classifying Heuristics.Limits.Exceeded.* as SCAN_LIMIT_EXCEEDED rather than malware. Red regression 3 failures preserved; affected attachment tests 110 PASS / 2 database SKIPPED. Independent read-only final diff review PASS; Rust official evidence.add_indicator fixed valid-name path returns Ok(()), closing the reviewer’s hypothetical swallowed-error concern. Source remains dirty/uncommitted; existing 8172cba images do not contain this new classification.
- Isolated native ClamAV compile succeeded, OOM false. Upstream CTest initially 6/11 PASS; Rust failure traced to read-only test temporary directory and rerun against dedicated writable identical source copy PASS. Four Valgrind suites remain failed with file-descriptor diagnostics; no suppression/skip or blanket PASS. Candidate install staging is not release approval. Evidence: /private/tmp/rc2-production-20260910/evidence/clamav-*.log.
- Platform auto-review denied exporting the other production application's private source/config. Action not executed. Delegate decision 8 instead approved public Node 24.18.0/sql.js1.12.0 synthetic compatibility testing plus actual original-service recovery checks; no private application source/image/data copied. Synthetic write, normal shutdown, isolated backup restore and postboot write PASS. Actual original application's in-memory persistence/drain prerequisite still unproven, so production stop remains pending.
- Platform separately stopped an independent custom test-harness subtask. No harness produced. A distinct bounded read-only diff review succeeded. Later CUA submission of a redacted infrastructure/timing/security status summary to GPT-6 Pro was rejected for insufficient specific disclosure authorization. Explicit user disclosure question is pending; that payload has not been resent or sent indirectly. General delegation does not override platform refusal.
- Temporary validation VM successfully upgraded official Docker29.6 to29.8/containerd2.3.5 and normally rebooted into 5.15.0-1115-gcp. Same storage driver/image IDs/network identity retained; PostgreSQL14 and host Redis persistent sentinels, API/Web exact8172cba identity/auth rejection, dedicated Redis ACL/one-use/Lua/AOF normal restart, synthetic sql.js3-row restore and fourth postboot write PASS. Earlier expiring Redis sentinels expired naturally during elapsed six hours; fresh sentinels separately prove normal-restart AOF, not a false host-reboot persistence claim.
- Postboot actual API scanner call failed ECONNREFUSED: persisted firewall script inserted scan ACCEPT after final REJECT when INPUT jump already existed. Preserved failed rule order, replaced with deterministic allows-before-reject atomic transaction; sequential first/repeated install and real ConfiguredMalwareScanner clean result PASS, Web negative DB/scanner access PASS, all six services active. Independent static review PASS; script SHA256 0a9482c34bc16d137415f0ed27f513d1affa7eebf80dd78feccc101cb8871a72. Evidence validation-{postboot,network-diagnostic,firewall-order-fixed}.log. Production firewall unchanged.
- Seccomp v2 actual native denial probes PASS: AF_INET6 EAFNOSUPPORT, restricted families/syscalls denied, compatibility ABI killed, no_new_privs/seccomp active. Temporary deletion deadline remains 2026-09-10T21:49:06Z; no extension decision was submitted. Evidence preservation/remaining boot selector checks precede cleanup.
- Production at https://timeline.all-too-well.com remains runtime535041bb25f21d548d863d07b35e3e952b0aeb2c, original kernel1053. No production package install, stop/reboot, migration, session revocation, traffic switch, main or tag change. Status: FIX_IMPLEMENTED_PARTIAL / ISOLATED_VERIFICATION_IN_PROGRESS / PRODUCTION_NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION.

### 2026-09-10 21:18 UTC — R27 RC2 boundary verification checkpoint
- Local runtime commits: `21bda57` (scanner ZIP-limit patch and API rejection classification), `7d339e05b56a3b5c28bd1693c9e9b0485023bf8b` (explicit GCE hybrid v2 identity verifier; current tree `a13165ae70a37203f988eaa6c52c368933673c12`). New hybrid verifier passes 57/57 tests including database identity binding; API affected regression 110 PASS / 2 DB-only skipped, lint/typecheck/build PASS. Existing v1 release contract preserved apart from exported primitives.
- Platform automatic review rejected pushing these commits to `pijhbkbk/feishu_timeline_app:codex/r27rc2-artifact-validation` because disclosure to that exact destination was not explicitly authorized. Push was not executed; exact repository/branch authorization requested and pending. Remote validation remains `8172cba77db286c75a54d35db3f49a22b37de1b8`; main/tag unchanged. No alternate publication attempted.
- Temporary validation found a real persistent boot regression: cloud GRUB drop-in overrode saved default and booted 6.8. Added late saved-default configuration, verified generated config, and performed another ordinary reboot. Final runtime 5.15.0-1115-gcp, API/Web identity, Redis/PG persistence, synthetic Node/sql.js persistence, firewall order and real API → SSH → clamd scan PASS. Evidence `/private/tmp/rc2-production-20260910/evidence/validation-default-boot-final.log`; earlier failure retained. Actual original production has not received these changes.
- SCTP/NFSD inventory on original and validation hosts: modules compiled as modules, not loaded; no corresponding active protocol/server/mount. Autoload remains allowed, so conditional host findings are NOT closed. Official mitigation and persistent disabling are under evaluation.
- Public-source ClamAV control U (unmodified 1.4.6) and P (ZIP patch) both fail the original four Valgrind suites; no assertions/suppressions removed. Public Pro review advised semantic ownership comparison rather than treating matching counts as PASS. Exact musl debug symbols revealed real duplicate listener close (`server-th.c:655` then `clamd.c:862`), under independent read-only ownership review. A separate 9-byte record is finite inherited allocation in exiting verification child; parent has zero corresponding definite loss. Neither finding invalidates the retained original FAIL result.
- Isolated patched scanner image built as `timeline-clamav-candidate:r27`, short ID `78b90ba544ed`, with source and patch metadata/license. It has not been published or substituted for the active scanner. Candidate startup and original benign INSTREAM regression are in progress on a separate loopback port. Original ZIP-expanded-file-limit failure remains preserved.
- Public-only GPT-6 Pro consultations: Valgrind comparison, cloud GRUB ordering, and NGINX upstream package route. Previously rejected private infrastructure summary remains unsent pending explicit authorization. No prohibited custom engine harness regenerated.
- Production remains `535041bb25f21d548d863d07b35e3e952b0aeb2c` at `https://timeline.all-too-well.com`; no maintenance/cutover/migration/new image deployment. Status: local fixes under validation; NOT_DEPLOYED for current candidate; AWAITING_PRODUCT_OWNER_CONFIRMATION. Temporary validation VM retains enforced deletion deadline 2026-09-10T21:49:06Z and original budget bound.

### 2026-09-10 21:44 UTC — R27 RC2 host rehearsal closed; scanner lifecycle fixes continue
- Local code checkpoint: `d536a3258c3829a79cb37012f2d2f81fa376379c`, tree `6689542524ee196f55811226cad1c9cfa4b9ea4b`. This adds reviewed GCE host reference controls, 10 passing kernel selection regressions, listener FD ownership/PING cleanup patches, and combined scanner source binding. It does not provide a self-authorizing root deployment controller. Nothing was pushed; exact GitHub destination approval remains pending.
- Kernel helper final SHA256 `a8c999dc3ea339e4cb3f5bf465ce756351e6434b9c3cc2032e7b97f68124817f`. Real official package reinstall verifies image `half-configured` and modules `installed` at the hook, then normal reboot selects 5.15.0-1115-gcp. Incomplete old candidates no longer block a complete newer kernel; deletion of the last complete LTS remains rejected. Test and independent diff review PASS.
- NGINX route changed following public GPT-6 Pro assessment and official advisories: authenticated upstream package `1.31.5-1~jammy`, package SHA256 `0b4884faf35a35cc85f54d7576b698f8f30981b25959f437235a9885ff40a1d5`. The first repository validation correctly failed because only an older signing fingerprint was allowed. The current signer `8540A6F18833A80E9C1653A42FD21310B49F6B46` was verified in the official NGINX key bundle; signature verification remained enabled. Original Ubuntu package combination was saved, migrated, restored, and migrated back in the synthetic VM. HTTP/TLS, host separation, 401/403/404 controls and real API/Web identities passed each phase. A version-check formatting failure caused by the Ubuntu suffix was preserved and corrected using exact package plus parsed runtime identity. Original production configuration compatibility remains NOT_RUN.
- Final synthetic host reboot PASS: supported kernel, Docker 29.8, NGINX actual process binary SHA256 `55e4447b18b63a0a48d51504a051d634ef1158c75ae05c10869b16ca303813e2`, SCTP/NFSD module denial, application/PG/Redis/synthetic SQL.js persistence, firewall order, pinned scanner channel. Evidence: `/private/tmp/rc2-production-20260910/evidence/validation-final-maintenance-verified.log`, `validation-real-kernel-postinst.log`, `validation-nginx-restoration-resumed.log`. This is private synthetic validation, not staging or production product acceptance.
- Original `clamd_valgrind` now PASS (135.50 seconds) after listener ownership and successful PING cleanup; no assertions or suppressions changed. Original/intermediate failures remain available. Combined patch SHA256 `c165ae7da7f2ffeb774205c37d4a59d53c7b92252a32a48186d24a66d9d40d2a` applies cleanly to the exact four original source files and yields all recorded hashes. Code and metadata independently reviewed.
- Combined candidate image `sha256:7ab976a39c1fab0adbbcdba8f4e20c4ec15784c0e05e3a33117f5ab559a463d5` passes original five INSTREAM checks. Actual 8172cba API scanner client → pinned encrypted SSH → this candidate returns CLEAN / REJECTED for oversized archive / CLEAN recovery. Evidence `scanner-candidate-r2-stream-regression.log` and `validation-api-candidate-scan.log`. Final attachment persistence, new API classification artifact, all required archive paths, final SCA and freshness enforcement remain pending. This image was not published or installed as the active scanner service.
- Exact debug-symbol original freshclam/sigtool suites remain FAIL. Independent review identifies a separate C/Rust ownership issue: `cdiff_apply` wraps caller-owned FD as an owning Rust File then drops it; sigtool/freshclam subsequently close it again. Minimal wrapper-only borrowed ownership patch is under review, with public-only Pro consultation. Do not misclassify these failures as generic Valgrind noise. The libclamav FD2 record was traced to test stderr redirection; finite freshclam child resources retain separate analysis.
- Full Ledger schema validation exposed 24 errors in existing R27 IDs/direct lifecycle records. Platform automatic review rejected historical ID/lifecycle normalization due audit integrity concerns. That rewrite did NOT execute; original records remain unchanged and exact authorization was requested. No schema was weakened. Current Ledger schema status remains FAIL, despite successful runtime component tests. Standard `git diff --check` reports expected single-space unified-patch context lines; non-patch changes pass, and exact patch application/hashes were independently verified. Do not report an unqualified diff-check PASS.
- Temporary validation VM `timeline-validation-r27` / ID `4557429735412403076`, its auto-delete disk and all three dedicated firewall rules were deleted before the enforced 21:49:06Z deadline. Scanner temporary public key and extra candidate forwarding permission were removed; remaining scanner tunnel authorized keys = 0. Evidence `validation-cloud-cleanup.log` and `scanner-validation-key-cleanup.log`. Scanner VM remains for authorized remediation; original production VM/services remain unchanged.
- Production remains `535041bb25f21d548d863d07b35e3e952b0aeb2c` at `https://timeline.all-too-well.com`. Current code is NOT_DEPLOYED; main/tag unchanged; no human PRODUCT_OWNER_ACCEPTED. Major remaining prerequisites include pushed immutable candidate, exact host risk disposition, external trusted controller, original co-hosted app persistence proof, consistent production backups/recovery, final scanner verification and exact-domain browser acceptance.


### 2026-09-10T22:13:13Z — Scanner ownership and continuous signature policy checkpoint

- Local source commit `98388256c4b08584f74f5d5570872df0b961333a` records CDIFF borrowed descriptor and validation-child pipe cleanup. Combined patch SHA256 `fe9cd766461ca42012cedee06071715edbc47082739855bb6fe6494424db205a`. Exact clean application and six resulting source SHA256 checks PASS. Full 10,739-file signed archive comparison identifies only the reviewed source changes.
- Local API/runtime-policy commit `241d8b41742c750501f0f853ee5e7d682fe9d617`, tree `e73513c94490d1cf8aee6b19ff4cc496c5739584`: reject missing/invalid/future/expired loaded daily timestamps before INSTREAM; post-scan VERSION must preserve engine, signature and timestamp. Scanner timezone and configured 1..48-hour age bound are verified against runtime configuration. All exchanges and graceful closure share one monotonic deadline. Original 12 stale/identity failures and independent-review total-deadline failure retained.
- API targeted/affected regression: 147 PASS. Full API: 127 files PASS, 3 files skipped; 1310 cases PASS, 30 existing database cases skipped (not counted as PASS). Lint/typecheck/build PASS. GCE identity policy: 45 PASS; deployment shell security regression PASS. Independent read-only review closed fixed-fixture and total-budget P2s; final source SHA256 `6d46e1e5da212d1cc819c63d3cd6e28698811fd87eb7a3851b3d9b018fa88391` and spec `394c570f3a04578084d1f842338bebcd2adb97f308909a59d0b6fce76ef5bd3a`.
- Original scanner Rust test PASS (95.60s); sigtool Valgrind PASS (36.26s, subsequent pipe-combined run 36.13s). File-copy validation test now PASS after pipe cleanup. Full freshclam Valgrind remains FAIL (5 failed/5 passed/1 original skip), retained diagnostic proves the sample remaining error is a 9-byte child-inherited allocation while parent definite leaks/errors are zero. It is not characterized as a parent leak or medium/high issue; public Pro disposition is pending. No suppression or assertion changed. Original normal functional suite is still running; final scanner image/publication remain pending.
- Source Trivy: 196 Cargo packages, raw 1 medium and 1 low. CVE-2026-46671 path non-applicability independently reviewed through exact ClamAV bridge, fork section parser and store parser; dependency itself remains unpatched, final image binding pending. Raw report SHA256 `da8c8e2e9b76aae9b66a7a199fcdadb1bb460e6e8a01c8d88a6d0621a4ce3200`. Public Pro concurs with conditional path assessment; no private denied payload was sent.
- New candidate findings appended without rewriting existing IDs/history. Existing full ledger schema remains FAIL with 24 historical format/lifecycle errors; previously rejected normalization remains unexecuted. GitHub push and denied private-summary disclosure still require pending explicit authorization; no alternate upload or bypass attempted.
- Production `https://timeline.all-too-well.com` remains unchanged at `535041bb25f21d548d863d07b35e3e952b0aeb2c`. New commits are local only. Temporary GCE validation VM/disk/firewall/key remain deleted. Active production scanner integration, host maintenance/controller, final immutable publication and exact-domain browser acceptance remain outstanding; main/tag unchanged; no PRODUCT_OWNER_ACCEPTED.


### 2026-09-10T22:34:27Z — Final scanner artifact and attachment persistence evidence

- Runtime code stays `241d8b41742c750501f0f853ee5e7d682fe9d617`, tree `e73513c94490d1cf8aee6b19ff4cc496c5739584`; no application code changed in this checkpoint. Final scanner r3 OCI manifest `sha256:17130f6532928a5b4b1272fc5129e5f2639850c0d8086879c516649d32fc8ae6`, config `sha256:bc673c38fd059c4f39015f26e410c7b5589d286297cd14f4a63e16e98598cd3f`. Trivy reports config identity; Docker containerd reports manifest identity. Independent verification checked the complete index/manifest/config/8-layer compressed and uncompressed hash chain; not a tag-only match. Exact OS scan: 41 Alpine packages, zero reported vulnerabilities. Cargo source scan remains one medium and one low raw hit.
- Original normal ClamAV functional suites all five PASS (127.07s). Original five bounded INSTREAM cases and actual compiled API client to r3 PASS. Source/archive comparison now identifies exactly six reviewed modified source files among 10,739, no extra regular files. OneNote CVE path non-applicability is independently bound to exact r3; candidate->false_positive recorded now with scope, raw hit retained and no historical rewrite.
- Real application AttachmentsService, ProjectAccessService, storage quota, filesystem object storage, audit service and isolated PostgreSQL14 migrations verified five assertions groups: denied out-of-project write/no row, CLEAN persisted/downloaded exact bytes, valid OOXML 21MiB-member REJECTED/SCAN_LIMIT_EXCEEDED/no binary/download403, unavailable scanner SCAN_ERROR/no binary/download403, and all three pending->final audit transitions. Final rows reread from DB. No HTTP/auth-middleware/browser claim. First ordinary ZIP input correctly failed Office format validation (400 before scanner); failure retained. Only input format was corrected to standard OOXML at the same bounded size; no assertion weakened. Evidence: `evidence/attachment-persistence-v2/result.json`, `commands.json`, first failure in `attachment-persistence/persistence.log`. Both temporary databases and synthetic secrets removed; local IAP forward closed.
- Public Pro review classifies a proven bounded fork-child inherited allocation as Informational/Low, conditionally nonblocking for that specific diagnostic; retain original freshclam_valgrind FAIL (5 failed/5 passed/1 skip). Independent review corrects earlier timing inference: retained PID17 test05 did run after pipe fix and has one 9-byte record/parent15 zero definite/error, but that retained run lacks contemporaneous exact binary hash and does not explain every other failed test. No suite-wide waiver, suppression or assertion change.
- Read-only GitHub API confirmed authenticated account owns the target repository and has push/admin permission. The repository is PUBLIC. After presenting that new evidence, platform automatic review again rejected the same push: deployment/delegate authority does not explicitly authorize disclosure of these repair sources to the public repository. The action did not execute; explicit public-source disclosure approval requested, pending. No alternate upload, CI bypass, main or tag mutation.
- Current production `https://timeline.all-too-well.com` remains `535041bb25f21d548d863d07b35e3e952b0aeb2c`; no production stop, package change, migration, traffic switch or new build. Staging public URL/acceptance not performed. Final scanner updater/controller, host remaining findings, co-hosted app durability, backups/restore and exact-domain acceptance remain pending. Existing 24 historical ledger schema errors remain unresolved; rejected historical normalization remains unexecuted. Product state `AWAITING_PRODUCT_OWNER_CONFIRMATION`; current repair `LOCAL_VERIFIED` for stated scope / `NOT_DEPLOYED`.


### 2026-09-10T22:53:36Z — Single-connection scan identity and exact production preflight

- Runtime code checkpoint `0e03b47b70d932b57541f8c5a8892d9071149f4c`, tree `75fd844b4e4486746385a47756377aa82fb5f3b1`. Evidence-only predecessor `e7b91bc` records prior scanner/DB proofs. New security fix binds VERSION -> INSTREAM -> VERSION to one numbered IDSESSION TCP connection, rejects disconnect/incorrect or extra responses, retains one monotonic deadline and checks signature age again after final close. Pre-fix regressions demonstrate three connections and incorrect acceptance across peer restart; independent-review close-age regression also preserved. No reconnect or weakened scanner verdict.
- Final focused transport: 45 PASS, including fragmented replies, all response IDs, END reset/garbage and real write-backpressure error/timeout with socket cleanup. Final API: 1323 PASS / 30 existing DB cases skipped. Lint/typecheck/build PASS. Separate read-only G4_DIFF PASS closed the age-during-close P2; only trailing whitespace removed afterward. Source/compiled hashes and all result hashes: `/private/tmp/rc2-production-20260910/evidence/single-session-checkpoint.json`.
- Exact new compiled client + unchanged r3 scanner + fresh local PostgreSQL14/migrations re-ran the five persistence groups PASS: permission denial, CLEAN download, bounded OOXML REJECTED with correct limit classification, unavailable SCAN_ERROR, binary purge/download denial and persistent audits. Output `attachment-persistence-v3/result.json`. Temporary DB, synthetic credentials and local IAP forward cleaned. This is service/DB integration, not HTTP/browser/production acceptance.
- Public Pro scanner update decision selects complete verified candidate/active database sets, no auto SelfCheck/NotifyClamd activation, and controlled cold process activation on changes. Only still-valid unchanged verified active state may survive a download failure; validation/loading/identity failures remain closed. Reviewed design is `scripts/deploy/gce-host/SCANNER_UPDATES.md`; actual updater/controller/timer and SelfCheck0 remain NOT_IMPLEMENTED/NOT_INSTALLED. Current freshness client alone does not prove updater health.
- Original-host NGINX compatibility preflight uses the same official signed-repository package SHA256 `0b4884faf35a35cc85f54d7576b698f8f30981b25959f437235a9885ff40a1d5` (see exact evidence for authoritative full hash) and binary `55e4447b18b63a0a48d51504a051d634ef1158c75ae05c10869b16ca303813e2`. Original effective config hash remains c516d4928268229e2a0a7a043720c22e779f4a1ca3fe49f3f2747129ca2f8ec8. A same-host restricted candidate config omits only the verified-unused old module-loader include. First test failed because unpacking did not create /var/cache/nginx; created that absent vendor cache parent, second config test PASS. Original PID/config/package/runtime unchanged; maintenance files/cache paths were added, so do not claim the host filesystem was untouched. HTTP/2 deprecation/protocol-option warnings remain; no new running-server proof.
- Host Redis inspection confirms actual mappings of unpatched system Lua5.1/BitOp/CJSON; Ubuntu Pro is not attached and current configured APT offers no newer shared Lua candidates. Public official review distinguishes USN-7824-3 Redis .1 from USN-8169-1 shared-library ESM updates, including separate cmsgpack handling. Pro recommends evaluating current official Jammy upstream Redis6.2.24 as minimal migration if ESM is unavailable, with signed repository, exact linkage/patch proof, all consumers and backup/restore compatibility. This is a CANDIDATE_PLAN, not an installed or verified fix; shared host library consumers remain unresolved.
- Fresh public read-only checks of `https://timeline.all-too-well.com/api/health` and `/build-info` both return 200 with runtime `535041bb25f21d548d863d07b35e3e952b0aeb2c`, build `2026-08-09T06:49:11Z`, release `r26-admin-535041bb25f2`. New repair is NOT_DEPLOYED. No production app/database migration, reboot, service cutover, main or tag mutation; no human PRODUCT_OWNER_ACCEPTED.

BLOCKER_REPORT: Public-source push remains rejected by platform automatic review even after ownership/admin permission proof: exact disclosure of this repair source to the PUBLIC GitHub repository must be authorized by the user. No third retry, alternate upload or CI workaround. Current runtime commit is 0e03b47b70d932b57541f8c5a8892d9071149f4c; target branch is codex/r27rc2-artifact-validation, target production URL is https://timeline.all-too-well.com. Required next decision is explicit public-source/evidence publication permission. Separate outstanding items: rejected historical-ledger normalization (24 schema errors, unchanged), shared-host risk remediation/other-app durability, independent root controller, consistent backups/restore, updater implementation and exact-domain browser acceptance. Production product state stays AWAITING_PRODUCT_OWNER_CONFIRMATION.

- Evidence supplement (2026-09-10T22:58:30Z): `attachment-persistence-v3/cleanup-and-assertion-index.json`, SHA256 `b92511d13674635e59c7ee458eec1a7533a0b69db565f9d1282c6b730d9041ae`, binds the exact integration runner and assertions. Failed-attachment download403 assertions are at test-script lines 51 and 59 before the corresponding PASS records. A fresh read-only check confirms all three task PostgreSQL containers absent, all three synthetic env files absent and local forwarding port 43311 closed. This supplies the documentation review's missing cleanup/assertion index; it does not rerun or broaden the original test result. Current ledger schema has the same 24 errors as HEAD with no new errors; no historical normalization executed. Placeholder scan has 10 test-only matches and zero production-source matches, not target-domain browser acceptance.


### 2026-09-11T00:17:12Z — Explicit public publication authorized; candidate CI/artifacts verified

- The user explicitly authorized public publication of current repair source and accompanying engineering records to `pijhbkbk/feishu_timeline_app`, branch `codex/r27rc2-artifact-validation`, and triggering CI. The previously blocked push then succeeded normally: 8172cba -> 3068d81ab91c2fdf940f2ceba74552083a33865c. This is new explicit authorization, not a workaround of the earlier review. Eight added commits passed native Gitleaks8.30.1 with redaction. No main/tag change.
- Remote fixed commit `3068d81ab91c2fdf940f2ceba74552083a33865c`, tree `19dcba645485f76aee29562b55125f35a2e4bdda`; production candidate release `r27-security-3068d81ab91c`, buildTime `2026-09-10T23:01:28Z`. CI [34540178062](https://github.com/pijhbkbk/feishu_timeline_app/actions/runs/34540178062) completed SUCCESS for verify/security-source. Playwright smoke was skipped by the push workflow, not counted as PASS.
- Exact amd64 API, API-ops and Web images were built and privately published. Each exact-image Trivy0.72.0 report identifies Alpine3.24.1 with zero reported vulnerabilities; native API/Web crypto/Prisma/Sharp tests and Web HTTP/build-identity/static asset checks PASS in isolated containers. Image digests and report hashes are bound by `/private/tmp/rc2-production-20260910/evidence/publication-3068d81/checkpoint.json`, SHA256 `9b15d7ce49ad131a22f24dd972ad399d43cfe725c20df608a18b0e583357c962`. No production traffic or database was used.
- Scanner r3 was published privately at the same already independently verified OCI manifest `sha256:17130f6532928a5b4b1272fc5129e5f2639850c0d8086879c516649d32fc8ae6`; source patch hash unchanged. Publication does not install the updater, activate r3 on the production tunnel, or close the retained diagnostic/test gaps.
- Original host remains on old runtime 535041bb25f21d548d863d07b35e3e952b0aeb2c as last verified. This checkpoint performs no original-host package/service change, reboot, migration, authentication revocation or traffic switch. Exact-domain new-build browser acceptance remains NOT_EXECUTED.
- Expanded existing host report triage finds 19 additional source-package groups / 62 unique CVEs outside kernel/nginx/Redis/Lua groups. All 19 groups are newly registered NOW as candidate in the unique FINDINGS ledger with null reachability/exposure; the original35 records/history remain identical. Raw Ubuntu medium severity and other CVSS values are retained, not lowered. Full schema still has the same24 historical errors; new records add no errors. Initial append approval timed out unexecuted; the tool-authorized single retry succeeded. No historical normalization.
- Public Pro guidance: close actual risks only with effective fixes, component removal, exact-build non-applicability or complete durable elimination of necessary trigger conditions. Empty FixedVersion, deferred/ignored, no current mapping, loopback and idle old kernels are not blanket waivers. Older rescue kernels need activation boundaries; newer OS/Ubuntu Pro alone do not prove all medium fixes. This is an engineering standard, not product acceptance or a change to platform permissions.
- Read-only original-host library inventory confirms Expat/GLib consumers in system services and old Redis mappings of Lua/BitOp/CJSON. Expat feature metadata reports XML_Char width1 for exact installed library, not a16-bit build; XML_DTD feature value0 is NOT interpreted as disabled. /usr/bin/xmlwf absent is only a scoped path observation. No private other-application source, command line, environment or full configuration exported.
- Redis upstream official Jammy candidate `6:6.2.24-1rl1~jammy1` downloaded through APT signed-by flow; key fingerprint54318FA4052D1E61A6B6F7BB5F4349D6BF53AA0C, package metadata/hash chain independently checked. New binary SHA288f4774b44ac04713fe97cf17aacaa7eb335c05096928260b79eec7d8db9822. The original Ubuntu6.0.16 baseline binary hash exactly matches the earlier original-host binary. V4 synthetic AOF-only/RDB restore and restart, authentication/ACL negatives, queue LPUSH/RPOP, absolute TTL within100ms, normal Lua/BitOp/CJSON/CMSGPACK, transactions and fresh-client reconnect PASS; independent read-only review PASS. First attempt lacked three baseline runtime dependencies and failed before tests; diagnosis/failure preserved and only isolated dependencies supplied. These tests do not prove production config, all clients, application auto-reconnect or actual production recovery. Synthetic baseline hashes stayed unchanged during the test; all synthetic backup files were removed by cleanup, not retained as production backups.
- Redis6.2.24 has official release evidence for16 of17 reviewed historical CVEs, and also fixes46817. CVE-2025-46686/GHSA-2r7g-8hpc-rpq9 has no upstream patched version and is disputed; it remains unresolved, not closed by upgrade. The public exception was escalated immediately to Pro, response pending. Host Redis remains unchanged.
- Accurate state: candidate source/push/CI/artifact publication verified; application NOT_DEPLOYED; shared host risk disposition, independently trusted controller, scanner updater, original co-hosted-app durability, consistent backups/restore and target-domain browser acceptance still pending. Human product state AWAITING_PRODUCT_OWNER_CONFIRMATION.


### 2026-09-11T00:33:36.538323+00:00 — Redis request boundaries following public Pro consultation

- Pro's public GHSA-2r7g-8hpc-rpq9 review found no official patched version for CVE-2025-46686 in Redis6.2.24/newer Redis/Valkey. Fixed authenticated service clients and bounded product requests may support a narrowly evidenced product-path assessment; private networking, ACL and resource caps alone are mitigation, not a component fix. A compromised credential-bearing service requires an independent boundary if included in the promised availability model. No threat-model exclusion, risk acceptance or host finding closure has been recorded here.
- Independent read-only review of the two current Redis consumers found fixed commands/Lua and fixed argument counts, existing bounded notification JSON/queues/scans, but missing session-read UUID validation and shared in-flight admission. New source rejects malformed session tokens before storage access, caps all auth keys at256 UTF-8 bytes and new auth JSON at4096 bytes, and sends all business Redis operations through admission. Each RedisService instance admits at most32 concurrent operations and refuses new operations when physical reply queue length is already64. This is an admission threshold, not a hard64-command maximum: current fixed transactions can bring63 entries to67; handshake traffic is separate. Entire transactions are admitted before dispatch; EXEC errors fail closed.
- ioredis command/connect deadlines are5s, socket inactivity timeout10s, offline queuing remains disabled, and automatic replay of unfulfilled commands is disabled. Logical command timeout does not remove a physical pending reply or prove the write rolled back. Background connection recovery may continue; no claim of globally bounded lifetime retry count or fixed10-second physical queue drain.
- Original regression reproduced7 failures/23 passes before the repair; repaired target30PASS, affected99PASS. Added real disposable Redis6.2.24 verification plus EXEC error regression yielded103PASS: one-use state consumed once, counter/queue normal behavior,5s timeout retaining physical queue accounting, eventual uncertain write observed once without caller retry, and normal reconnect. Exact7 source hashes and evidence hashes: `/private/tmp/rc2-production-20260910/evidence/redis-admission-checkpoint.json`, SHA256 `6ddf0bf701ee39124cdb82c9cb5ce7f6994485e1564c47455fcd2f309c39c80d`. These are application-path checks, not an exploit test or the original-host exposure proof.
- Isolated startup encountered two internal-network empty host-port mappings while Redis was healthy; no tests ran in those attempts. Stopped that strategy and retained blocker/runtime/log evidence. Changed only the disposable test network to a separate bridge with verified127.0.0.1 random port and one-use password; identical assertions then passed. Owned container/network and synthetic config were removed. No production Redis commands or data were used.
- Full API regression1332PASS/33SKIPPED across128 passed/4 skipped files. The3 optional Redis tests were separately executed successfully above;30 existing DB-only skips remain explicit. Lint, final typecheck and API build PASS. First typecheck/pretest attempts hit generated-file EPERM; a default-sandbox full test hit listen EPERM and was stopped with retained logs, then rerun with the required local permissions. No failure was suppressed or assertion removed. Existing expired-session regression now uses a valid UUID fixture while retaining expiry/deletion assertions. Final independent review of the additional tests is pending at this record time.
- Application images built from3068 remain available but do not contain this new patch. Current source is not yet committed/pushed at this record time; no deployment claim. Production remains last verified535041bb25f21d548d863d07b35e3e952b0aeb2c at https://timeline.all-too-well.com. No production service restart/migration/reboot/traffic switch, main change, tag change or product-owner acceptance.

- Subsequent bounded independent review: G4_DIFF PASS for the final7 files and recorded evidence. The103 passing isolated-run tests include3 real Redis integration tests and100 supporting unit tests. Late-write completion and reconnect are separate scenarios, not a combined uncertain-write-during-disconnect proof. Code committed as88cb53607ad77aa5d1d559e01731988f68e26c3b, tree72cf2389e43a01ab322467cf76e3e24fbd16b5b0, then publicly pushed normally to the explicitly authorized validation branch. The accompanying earlier evidence checkpoint isedef5a6934d9134495da155e5d8a9795d367c7f8. Native Gitleaks checked the two added commits without findings. CI34547061691 and rebuilt exact candidate artifacts are in progress; main/tag unchanged.
- Host vendor evidence review completed62/62 official OSV ID/hash matches, indexSHA e45907fdb813bfc9886a84969d12dbd8f829ca15d4e3311838d90062da9c9a76. Jammy has62 affected source matches without fixed events; Noble60, with two old bind9-libs source entries absent. Different bind9 source has maintained fixed revisions for3039/5946, but installing it does not patch existing9.11 libraries consumed by DHCP. OSV alone does not distinguish needed/deferred/ignored. The7 prior download gaps are resolved. No whole-OS-upgrade or blanket package-clearance claim.
- Same-host metadata shows177 system conffile baselines match and six sampled trees lack non-root owners/group-or-other write bits; no ACL/ancestor/include/input-source closure was collected. Expat width1 supports only the exact library's16-bit-specific72522 exclusion; xmlwf/VMS-only component candidates still need exact scope closure. Unknown root Python ownership and deleted running Python executables remain unresolved. These read-only observations do not change any finding state or production service.


### 2026-09-11T01:08:33.818807+00:00 — Final application artifacts88cb536; external host restart detected

- Published runtime source88cb53607ad77aa5d1d559e01731988f68e26c3b, tree72cf2389e43a01ab322467cf76e3e24fbd16b5b0, buildTime2026-09-11T00:34:42Z, release r27-security-88cb53607ad7. CI [34547061691](https://github.com/pijhbkbk/feishu_timeline_app/actions/runs/34547061691) verify/security-source SUCCESS; Playwright SKIPPED. Private amd64 API/API-ops/Web artifacts published with exact identities matching their Trivy0.72.0 reports (Alpine3.24.1, zero reported package vulnerabilities). Native API/Web crypto/Prisma/Sharp and Web HTTP/build identity/static-resource checks PASS. Checkpoint `/private/tmp/rc2-production-20260910/evidence/publication-88cb536/checkpoint.json`, SHA256 `5578f52fa4157641f791f19b0fba89180f31382126b8f5e328a195841475fd66`, binds the12 evidence files. No production deployment or product acceptance is implied.
- IMPORTANT current-host evidence supersedes old process/kernel snapshots. At2026-09-11T00:36:59Z original server had kernel6.8.0-1066-gcp, uptime3724.61s, bootID1ae7ba3e-e51c-46cd-b111-87b7d16eb566. GCE platform records hostError at23:34:31.040161Z followed by automaticRestart at23:34:54.349321Z on September10. This was not a maintenance reboot executed by this task. Old deleted-Python/unknown-PID snapshots describe the former boot; current sampled consumers have known system units and ordinary Python executable paths. These changes do not close host findings or prove all data recovered.
- Server HEAD and fresh no-cache public `/api/health` and `/build-info` all remain535041bb25f21d548d863d07b35e3e952b0aeb2c; both public reads200, release r26-admin-535041bb25f2, buildTime2026-08-09T06:49:11Z. Docker, API, Web, Nginx, PostgreSQL14 and Redis units are active. The new application is NOT_DEPLOYED; no task-initiated production package installation, DB migration, auth revocation or traffic switch occurred. Main/tag unchanged. Product state AWAITING_PRODUCT_OWNER_CONFIRMATION.
- A pure scanner-update policy and fake-host unit tests are now being implemented under scripts/deploy/gce-host. This is not the actual root adapter, timer, Unix socket proxy or installed update service. An initial policy write approval timed out unexecuted; exactly one tool-authorized retry succeeded. Independent review identified partial-start cleanup order, loss of anti-rollback baseline and same-byte metadata inconsistencies; failures were reproduced and corrected, with final review pending. No production scanner activation or freshness-health claim.

- Final pure scanner policy review PASS; independent reviewer reran25/25 tests. Exact policy SHAe0279a43b11c497253d595b6ef4e7e0b63a4acee8056d8d6f40ffd5b79ed9cce; tests SHAb6a3795c267e3f2f257fba8ea600426c4017dcb8238b1b1fc5802cc20a000889. The final time-boundary review reproduced3 failures, then fixed post-verification/approval/cleanup freshness checks. Full sequence/anti-rollback/identity/partial-start cleanup tests use FakeHost only. Actual root adapter, timer/services, filesystem/signature verifier and Unix ingress installation remain NOT_IMPLEMENTED/NOT_INSTALLED. No production controller gate is closed by these results.


### 2026-09-11T02:35:18.754127+00:00 — Scanner durable state and continuous regression

- Explicit owner authorization for public repair source and accompanying engineering records was used for normal pushes to `pijhbkbk/feishu_timeline_app`, branch `codex/r27rc2-artifact-validation`. Commit7bc5e8f3eb67a4ef86905da5893ccec5dd26ff0a CI34549736376 completed SUCCESS, verify/security-source successful; Playwright SKIPPED. Main/tag unchanged.
- Added scanner_state.py and its real temporary-filesystem tests. Durable approval and version floor share an atomic bounded JSON record; revocation preserves the floor, missing state/lock fails closed, positive revisions cannot lose the floor, and initial unapproved revocation is a no-op. Separate fixed lock, strict duplicate/unknown-field parsing, private regular single-link files, no-follow opens, short-write handling, file fsync/rename/directory fsync and uncertain-commit failure are covered. Production still needs an externally authorized adapter, ancestor trust checks, fixed UID0, boot/process/database binding, real official signature verification and controlled ingress/service integration.
- Initial serialization error produced5 errors in11 tests; preserved and repaired. A later lost-floor boundary produced2 failures in15 tests; preserved and repaired. Final15/15 pass on local temporary files and real Linux temporary files as non-root UID1001; Linux temporary directories removed. Independent read-only state diff review PASS. Final source SHAe676c73967e3d66bd99ef4045899d7ff670eb73020cd6df1603cc66aa6973b87; test SHA270ac373b3d41852c90bc7060c9a11c49b51b2d5af2fedb7c6751109155dc8c0. Evidence checkpoint `/private/tmp/rc2-production-20260910/evidence/scanner-state-checkpoint.json`, SHA 95500bb748f2cc909157313bbe16d6e343bf3f013d949ee11c2aad5baf0dd130.
- All50 gce-host regression tests PASS. CI's existing Test step retains pnpm test and additionally runs these Python tests with a120-second bound. No production application source, dependency, schema, credential, service or database changed in this component checkpoint. This does not constitute root-controller integration or power-loss recovery proof. The state revision does not detect restoration of a complete previously valid disk snapshot; recovery needs independently retained highest-version evidence.
- Placeholder scan returned10 test-only matches:7 getByPlaceholder locators and3 negative assertions rejecting skeleton text. These existing test uses are explicitly whitelisted; formal-page matching placeholder text0. No new browser or product acceptance.
- Scanner read-only refresh still shows the old enabled timeline-clamd.service and SelfCheck600, with no new updater installed. This finding is retained; tests do not imply deployment. The separately requested authorization to analyze the co-hosted private application's startup/persistence code remains unanswered; no such private code was read or sent to Pro. Earlier automatic refusal continues to govern that dependent action.
- Runtime application artifacts88cb53607ad77aa5d1d559e01731988f68e26c3b remain available and previously tested. Production last verified535041bb25f21d548d863d07b35e3e952b0aeb2c at https://timeline.all-too-well.com; new repair NOT_DEPLOYED. Staging URL/commit/path and production browser acceptance NOT_EXECUTED. Remaining host findings, scanner integration, consistent backups/recovery and exact-domain acceptance remain open. Product state AWAITING_PRODUCT_OWNER_CONFIRMATION.

- Final workflow/documentation independent review PASS; reviewer separately reran50/50 tests and verified Linux evidence reports UID1001. Existing CI evidence collector regression20/20 PASS. These are component checks; this new checkpoint has not yet run remote CI at record time.


### 2026-09-11 — Continuous release resumed from 94ff09f1

- Owner explicitly continued the existing fix/publication/deployment/short-maintenance delegation. The attached R27 execution file is direction, not execution evidence or platform authorization. No other-application private source/config/image export is attempted; only synthetic compatibility and original-container recovery remain in scope.
- Actual repair tree started clean at94ff09f1ddaee6296e4e7775b41a05e88d7124c2. CI34555256934/push/attempt1 completed FAILURE: verify SUCCESS, security-source SAST BLOCKED by one insecure-file-permissions finding at test_scanner_state.py:25. Both actual redacted artifacts were downloaded, metadata identities checked and archive SHA256 values matched GitHub. Original finding and failed run retained under /private/tmp/r27-continue-94ff/ci.
- Independent review verified the numeric permission rule flags a redundant chmod0700 on an already-private TemporaryDirectory. New test source12e75baab067b2d7188d524968259e0b8c427697 removes that redundant operation and directly asserts private0700 mode/current UID; negative permissions/ownership/link/state tests remain. Reviewed file SHA256bdba1d6b60c7500796c83e63759a635f824a7dc1716ceb53387b5865887e2604; independent50/50 PASS, CI evidence20/20 PASS; unchanged pinned Semgrep1.169.0 and three rule packs scan the fixed file with0 findings/0 errors.
- Required install/lint/typecheck/test/Web build/API build/Prisma validate all exit0; Web287 PASS, API1332 PASS/33 existing optional skips (not counted as executed integration tests). Clean single-file source commit pushed by normal FF to codex/r27rc2-artifact-validation; new matching CI34571803229 is in progress at this checkpoint. No old-SHA rerun or force push. New immutable amd64 API/ops/Web builds are in progress; no publication/scan result claimed yet.
- Fresh production Web/API and server HEAD remain535041bb25f21d548d863d07b35e3e952b0aeb2c at https://timeline.all-too-well.com. Kernel6.8.0-1066-gcp, Docker29.6/containerd2.2.5, Nginx1.18.0-6ubuntu14.20, Redis5:6.0.16-1ubuntu1.1, PG14.24 are actual running versions. Approved5.15/Docker29.8/containerd2.3.5/Nginx1.31.5 combination has retained synthetic rehearsal evidence but is NOT installed on original host. Latest restricted host checkpoint /private/tmp/rc2-production-20260910/evidence/host-risk-followup-94ff09f-checkpoint.json binds five new read-only records; no host package/service write occurred.
- r3 scanner patch/artifact evidence remains hash-valid. Actual scanner adapter and actual recovery controller are being implemented in separate temporary workspaces, not installed or accepted. Existing pure policy/state tests and non-root restore rehearsal do not prove those effects. Another application's running/healthy state and recent persistent-file mtime do not prove sql.js memory durability; existing save/normal-stop entry information was requested for the eventual maintenance window, without requesting private source. This pauses only dependent host shutdown.
- A real browser reached official Feishu QR sign-in from the production domain. Owner scan is necessary; no authenticated path or new-build acceptance claimed. A candidate staging subdomain was checked and has authoritative NXDOMAIN; no staging URL was invented or DNS changed. Independent exact-HTTPS entry remains to be established.
- main remains41b4b166c587692e6f0fb9536dca2e1aab646c70 and existing tags unchanged. Production no migration/cutover/new runtime, staging NOT_DEPLOYED, product AWAITING_PRODUCT_OWNER_CONFIRMATION. Historical finding records/schema errors are not rewritten or normalized. Continue source CI/artifacts, remaining exact host applicability, scanner/recovery integration and isolated acceptance; do not ask again for abstract deployment approval.


### 2026-09-12 — 本地离线目标规则最小更新

- 本次用户明确要求最小目标规则更新（DOCS_ONLY）；任务书与粘贴建议用于理解目标，不把其中 M1–M4 实施指令自动视为本轮代码修改授权。
- 当前目标为正式本地原生认证、本地目录/岗位/权限和离线运行；替换强制真实飞书与继续 GCE 的冲突要求，暂停云端推进，不停止或删除既有服务。业务、安全、数据不变量及历史风险/验收事实保留。
- 新认证、授权、会话和迁移须有新验证与最终独立安全差异审查；未受影响的修复按输入及环境适用性依据复用。本轮没有重新授予任何历史安全 PASS 或关闭 finding。
- 分层检查：两个工作树各只有根 AGENTS.md；包含隐藏/忽略目录的文件名扫描未发现 apps、packages、Prisma、scripts、deploy、docs 等目录的 AGENTS.override.md 或下层 AGENTS.md（排除依赖、Git 元数据和生成产物）。实际 CODEX_HOME 为 /Users/lixiaochen/.codex，全局 AGENTS.md 为空，未发现全局 override、自定义 project_doc_fallback_filenames 或项目 .codex/config.toml；未修改全局配置/权限。两个根规则均小于默认 32 KiB 发现上限。
- 分层依据：[OpenAI 官方 AGENTS.md 文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。核对同目录 override 优先、下层覆盖及备用文件；没有启动新 Codex 会话冒充重新加载证明。
- 已执行：git worktree list --porcelain、git status --porcelain=v1 -uall、git rev-parse HEAD、git diff --check、rg --files --hidden --no-ignore 的规则文件发现，以及必需 Placeholder 扫描。文档差异/Markdown 结构检查 PASS；Git refs/index、业务/数据不变量原段落、全局指令/配置摘要与修改前相同，业务源码/schema/迁移/依赖无差异。
- 验证范围仅文档；未运行 pnpm install/lint/typecheck/test/build/prisma:validate 或 G3/G4/G5，不安装依赖，不执行数据库、浏览器登录、部署或远端 CI。未提交、未推送；原有未提交台账完整保留。

- 起点及最终源码 HEAD：12e75baab067b2d7188d524968259e0b8c427697；工作树 /Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair，分支 security/r27rc2-candidate-repair；原有 12 行未提交台账完整保留。
- 改动文件：AGENTS.md、README.md、docs/gates/VERIFICATION_GATES.md、docs/EXECUTION_LEDGER.md。同步入口主目录的 AGENTS.md、README.md、docs/EXECUTION_LEDGER.md；未迁移整个治理版本、未更改 Finding schema/ledger/历史报告，也未将主目录旧源码覆盖到本树。
- Placeholder 扫描原始 10 行，全为既有测试（7 条 getByPlaceholder、3 条拒绝骨架文案的负向断言），本次明确列入白名单：/private/tmp/local-offline-rules-20260912/repair-placeholder-test-whitelist.txt。正式源码匹配 0；这不是浏览器验收。主目录仍有 4 处占位路由，见其台账，不能混为同一产品版本。
- 变更前文档与检查明细：/private/tmp/local-offline-rules-20260912。风险/下一决策：认证代码、账号/旧身份迁移及离线包尚未在本轮实现，旧 OAuth、构建和扫描 PASS 不能替代新边界验证。后续以真实最新修复源码实施本地身份主链路，再验证受影响安全与断网运行；本次不自动启动 M1–M4 或恢复云端推进。

| 交付项 | 本轮事实 |
|---|---|
| 1 代码是否实现 | 应用代码未修改；仅目标规则更新 |
| 2 本地测试 | 文档检查 PASS；应用测试与离线验收未执行 |
| 3 staging URL | 未执行、未指定新验收地址 |
| 4 staging runtime commit | 未读取/未部署 |
| 5 staging 用户路径 | 未执行 |
| 6 production 是否改变 | 本次未改变，未访问远端 |
| 7 production runtime commit | 未读取，不沿用历史值冒充当前值 |
| 8 production 用户路径 | 未执行 |
| 9 main 是否改变 | ref/历史未改变；入口 main 工作区有未提交文档 |
| 10 tag 是否改变 | 未改变 |
| 11 产品负责人确认 | 未取得本地版 PRODUCT_OWNER_ACCEPTED |
| 12 未完成路由 | 本地注册/登录/岗位与账号生命周期尚未在本轮实现，精确新路由待实现确定 |
| 13 Placeholder 数量 | 本树正式源码 0、测试白名单 10 行；入口主目录旧占位路由 4 处 |
| 14 当前准确状态 | DOCS_ONLY / RULES_UPDATED / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION |

### 2026-09-12 — GCE 原生账号目标实施 checkpoint（未部署）

- 最新明确目标取代上一个 DOCS_ONLY/本地离线阶段：在 `https://timeline.all-too-well.com` 使用本系统账号，移除第三方登录前提。完整离线包暂不作为本期验收门禁。最小同步 AGENTS/README/gates 的冲突目标；未修改全局平台权限，模型不代理用户或平台授权。
- 从最新修复源码 `12e75baab067b2d7188d524968259e0b8c427697` 创建隔离工作树 `/private/tmp/timeline-native-auth-20260912`，分支 `codex/native-account-auth`。主目录 main 和原修复工作树的源码、既有未提交记录及用户媒体完整保留；不向公开 GitHub 自动推送新实现。
- 实现原生注册/密码登录、岗位意向、本人改密、一次性恢复、主机管理员初始化/准确内部 ID 绑定；新增 LocalCredential/AuthInitialization 与 User 认证版本字段，采用 additive migration。旧 OAuth 入口停用、适配器不注册外部身份能力；新通知只进入已有 IN_APP 持久化路径，不伪造飞书已发送记录。账号管理与正式 V2 导航接入中。
- 安全边界：注册不授角色/项目；Argon2id 固定 64 MiB/3/1、有界并发；密码/恢复码不进入 AdminCommandRequest 的持久化输入摘要或结果；所有旧 OAuth 和生产 mock 会话拒绝；改密/恢复/停用/配置变化通过 authVersion 撤销；保护最后一个实际有密码的启用管理员。运行说明：`docs/NATIVE_ACCOUNT_OPERATIONS.md`。
- 独立只读审查提出“个人拒绝仍消耗全站额度”和“恢复签发时操作者版本未持行锁”两个有效意见，已修正并增加真实行锁/限速回归；角色权限修改也接入新管理员版本检查。此 checkpoint 最终差异仍待复核，不将初审意见处理等同 G4 PASS。
- 依赖锁定 argon2 0.44.0，仅增加对应依赖树；已从可信注册表按锁安装。初次离线缺包及 Prisma 缓存权限错误经明确环境修正解决。初次普通沙箱测试禁止监听本机端口，重新在允许本机监听的环境执行，未删/跳过目标断言；两个新测试夹具问题和显式控制字符 lint 问题已修正。
- 已有验证：完整迁移链 37 项在独立本机 PostgreSQL 成功；首轮 native PG/密码测试 16 PASS；修正后的原生 PG/限速/密码批次 16 PASS，包含 FOR SHARE 与并发撤销屏障。真实本机 HTTP 32 请求 PASS，覆盖 Origin/DTO/登录/轮换/改密/退出/岗位权限/旧入口。基线 schema 合成迁移与迁移前后 pg_dump/restore PASS，新增密码表未自动接管旧用户。后续 UI 文案与类型夹具修正需相应复测。
- 全量一次重跑：Web 287 PASS；API 1332 PASS、43 条独立环境专用用例 skip（不计通过）；新 PostgreSQL 测试另行显式运行。Web/API 本机 build 曾 PASS，尚非最终固定提交制品。检查日志位于 `/private/tmp/timeline-native-*.log`，合成迁移证据位于本机临时目录；无生产备份/凭据写入仓库。
- 生产只读事实（2026-09-12T11:04:35Z）：HTTPS `/api/health` 与 `/build-info` 均 200，Web/API runtime `535041bb25f21d548d863d07b35e3e952b0aeb2c`，buildTime `2026-08-09T06:49:11Z`，release `r26-admin-535041bb25f2`。本次未部署/迁移/seed，未改 production/main/tag；宿主 HEAD/当前运行拓扑没有取得新证据。
- 访问 blocker：GCE IAP SSH 两次在 banner 前超时，第二次有限 ConnectTimeout/ConnectionAttempts/BatchMode，exit 255。有效网络规则允许 IAP 来源到 tcp22，未返回上层 DENY；只读资料提示 Fail2ban 1h 封禁可能影响 IAP，但尚未证实。暂停重复 SSH，不开放公网22、不重启整机、不影响其他应用。已询问是否存在可用管理会话，同时继续本地工作。
- 模型咨询：浏览器扩展方式多次工具连接失败，改用受支持的 Chrome 原生界面后可用；页面明确显示 6 Pro。自动审批拒绝私有技术摘要的外发，未发送该摘要；改为不包含本项目数据的通用 IAP 排障问题，已提交给 6 Pro，等待建议。意见不构成真实授权或部署证据。
- 当前状态：`IMPLEMENTATION_IN_PROGRESS / LOCAL_CHECKS_IN_PROGRESS / REVIEW_PENDING / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging 未部署、浏览器正式用户路径未验收；不能使用旧 OAuth、旧生产健康或本机测试结果冒充本期网站交付。


### 2026-09-12 — 原生账号固定候选与本机验证（生产管理连接阻塞）

- 最小规则提交 `de8005a`；主体实现 `5daaf7f2e722e47f3384a57fd09fd4ed3f7f7f4f`；最终修复/运行候选 `1767dbb5eeb30cc57835081de761e1eccb8fac8b`，tree `199cb837b6dd7682eda61928e108be397498236b`。最终 diff 两轮独立只读 focused PASS，未将其扩大为全仓安全清关。
- 实际 CLI 发现未连接 Redis 清理时新建连接而不退出：回归修复前4 FAIL、修复后14 PASS。修复保留有界 graceful quit，并始终断开；首次管理员初始化在已有管理员时必须指定旧内部 ID。真实已构建 CLI 验证重复初始化/不安全密码文件拒绝、旧身份绑定保留属性；最终制品两进程初始化竞态仅一个成功，均正常退出。
- 最终新 PostgreSQL/认证/Redis批次26 PASS；最终API实际认证32请求 PASS；新增项目范围14请求 PASS（未授权所有者拒绝、本项目允许、跨项目读写与列表隔离、拒绝后数据和审计不变、管理员目录只读）。完整37项迁移及基线身份/业务外键的迁移前后备份恢复已有PASS，最终schema/migration未变按摘要复用。
- 最终lint/API类型/Prisma validate、干净提交Web/API构建和三个Linux镜像构建PASS；断网只读非root镜像Argon2实际验证PASS。Web最近288 PASS；实现阶段API完整1332 PASS及43个独立环境skip明确保留，后续变更按目标回归覆盖。同一lockfile依赖audit各级0，非全仓/镜像清关。正式源码Placeholder0、测试白名单10行。
- 本机最终Web/API于11:59 UTC均报告完整`1767dbb…`与相同tree/release/buildTime；仅loopback合成环境。浏览器在前一Web源码相同候选上完成普通账号登录/岗位/刷新与重启持久性/退出、管理员密码登录进入工作台；账号菜单后浏览器控制工具无法继续，完整账号管理浏览器、三档布局、最终候选浏览器复验保留待办。详见更新后的路由矩阵，不声称整组页面完成。
- 生产11:55 UTC经系统TLS信任库读取health/build-info均200，仍运行`535041bb25f21d548d863d07b35e3e952b0aeb2c`。本轮无生产命令/备份/迁移/seed/切换，无main/tag变更，无公开源码推送。已准备本机私有候选bundle，尚未传输；server HEAD和当前宿主拓扑未验证。
- IAP SSH两次banner前超时；云端有效防火墙允许，但已有日志/监控未能补足guest证据。GPT‑6 Pro通用咨询已完成，未提供可绕过主机证据的新办法。私有技术摘要被自动审批拒绝且未发送；仅发送无私有项目内容的通用问题。未把模型当作授权者，未改全局权限/云访问配置，未盲目重启或影响同机其他应用。
- 下一项外部依赖：可用的既有主机管理通路或管理方的SSH监听、服务、限流/封禁日志证据。恢复后核对实际旧环境、备份恢复、私有发布控制器与扫描/配额、准确旧管理员绑定，再受控部署精确域名验证。此前停用的特权脚本不得直接绕过。等待外部输入期间已完成可独立完成的候选与本机验证工作。
- 证据提交独立于运行提交。记录、hash、镜像身份、日志索引及真实限制见 `docs/acceptance/NATIVE_ACCOUNTS_20260912/README.md` 和 `verification.json`。
- 当前准确状态：`CODE_IMPLEMENTED / TARGETED_LOCAL_VERIFICATION_PASS / LOCAL_BROWSER_PARTIAL / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging未部署/URL未建立/runtime未读取/用户路径未执行；production新用户路径未执行；产品负责人未确认。main/tag未改变。全部本轮生产路由未完成，正式源码占位0。

### 2026-09-12 — 最终原生账号候选浏览器证据补齐（生产未部署）

- 应用源码/运行提交仍为 `1767dbb5eeb30cc57835081de761e1eccb8fac8b`，本轮只增补证据。干净构建工作树未改变，未重跑不受影响的应用测试；之前目标验证及复用边界保留。
- 本机 Chrome 原生界面与独立 Incognito 窗口已恢复可用；合成管理员完成真实密码登录并进入工作台、账号目录和个人账号页。登录/注册/恢复表单、账号目录、个人账号页检查 1440/1024/390 CSS 宽度，保存 17 张页面 PNG，逐一检查像素尺寸和 SHA256；手机个人账号底部操作可正常滚动到达。
- 账号搜索命中合成用户并显示“采购专员意向/尚未分配正式角色”，无匹配时显示明确空状态。禁用缓存刷新账号目录，23 个同源 GET 全部 200；会话为 local 身份且 Feishu/mock 关闭，工作台数据来自隔离数据库。
- 浏览器保存脱敏 HAR，检查无会话 Cookie、授权/CSRF 头、cookies 数组、非 GET 和请求体。个人账号控制台 All levels 保留一条用户名字段自动填充/可访问性建议，无应用异常；不把默认过滤提示或未展开的目录 possible improvement 写成零问题。
- 12:30 UTC 再读本机 Web/API 元数据均为准确候选 SHA/tree/release；首次普通沙箱读取被本机网络权限拒绝，经工具审批允许只读 loopback 后成功，未修改全局权限。证据入口：`docs/acceptance/NATIVE_ACCOUNTS_20260912/browser/manifest.json`；README、verification.json 和路由矩阵同步更新。
- 浏览器注册/新密码/恢复提交、正式授权配置和完整业务写入仍未验收；真实 HTTP/PG 结果不能代替这些交互。生产管理连接仍无新恢复条件；当前任务没有附加终端，主机未发现已建立的 TCP22 连接，未第三次盲试 IAP、修改防火墙或重启 VM。
- staging URL/runtime/用户路径未执行；生产未改变，最近只读 runtime `535041bb25f21d548d863d07b35e3e952b0aeb2c`（11:55 UTC），新用户路径未执行；main/tag未改变；产品负责人未确认；生产本轮路由全部待验收，正式源码Placeholder仍0。
- 状态仍为 `CODE_IMPLEMENTED / TARGETED_LOCAL_VERIFICATION_PASS / LOCAL_BROWSER_PARTIAL / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。恢复发布需要已有可用管理入口或 SSH 服务/监听/封禁日志的新证据；模型意见不代表用户、平台或产品批准。

### 2026-09-12 — 生产管理连接 BLOCKER_REPORT（第三个连续目标回合）

- 前一目标回合通过 `3e1b0512d046c7f4db6de56b3255b7a13100ea13` 完成最终浏览器证据，分类为实质进展；本回合复核同一管理访问阻塞，没有可用新输入或已确认存活的远端执行句柄。
- 失败环境：现有 GCE 主机，目标 `https://timeline.all-too-well.com`；待发布运行提交 `1767dbb5eeb30cc57835081de761e1eccb8fac8b`。12:34 UTC公开Web/API仍为 `535041bb25f21d548d863d07b35e3e952b0aeb2c`，server HEAD未获得。复现为此前两次IAP SSH在协议banner前超时，第二次有限连接时间/单次尝试退出255；本回合未第三次盲试。
- 根因尚未确认。云端有效规则允许IAP tcp22；已有日志/监控和通用GPT‑6 Pro咨询未补足guest监听、服务或封禁证据。当前任务无附加终端；只读本机进程清单未发现SSH/gcloud/sftp/autossh管理进程。普通沙箱的进程读取权限不足，经工具审批后限定读取进程名成功，未改全局权限。
- 已完成可独立的候选、目标验证、差异审查、迁移/合成恢复、Linux构建与本机浏览器证据。剩余主机拓扑/生产备份迁移/准确旧管理员绑定/部署切换/精确HTTPS验收需要真实管理通路；浏览器新凭据和授权操作的尚未执行项继续保留，不扩大PASS。
- 下一方案：取得已有可用管理会话或SSH监听/服务/故障窗口封禁日志后，按新证据做具体修复，再继续既定受控发布。需要外部输入，不要求重复开发/发布授权；不要在聊天发送密码或密钥。
- 目标状态 `BLOCKED`；实现状态 `CODE_IMPLEMENTED / TARGETED_LOCAL_VERIFICATION_PASS / LOCAL_BROWSER_PARTIAL / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging地址/版本/路径未执行，生产未改变且新路径未验收，main/tag未改变，产品负责人未确认，所有本轮生产路由待验收，正式源码Placeholder0。当前复核见 `docs/acceptance/NATIVE_ACCOUNTS_20260912/blocked-audit.json`。

### 2026-09-12 13:34 UTC — Safari管理入口恢复审计

- 用户登录Safari后完成只读订阅查询，控制台可访问。随后恢复网站目标时，启动Cloud Shell的操作被自动审批拒绝：审核认为新管理会话超出了最近“只读查询订阅”的范围。操作未执行；已明确解释审核原因并提出具体确认请求，尚未收到回复，没有借CLI/其他入口绕过该拒绝。
- 前一恢复回合分类为无进展：仅确认控制台仍停留在账单页面，未取得授权或活跃管理句柄。本回合只读核对仍显示Activate Cloud Shell；三个连续恢复回合保持同一待确认障碍，目标再次标记 `BLOCKED`。自动续行不视为确认，GPT‑6 Pro不代替用户或工具审批。
- 应用运行候选仍为 `1767dbb5eeb30cc57835081de761e1eccb8fac8b`，已有本地验证/浏览器证据未改变；本回合未部署/迁移、未改main/tag、未进行产品验收。恢复条件及原SSH障碍分别记在 `docs/acceptance/NATIVE_ACCOUNTS_20260912/blocked-audit.json`；不提交账户付款信息或凭据。

### 2026-09-12 13:58 UTC — Cloud Shell临时连接验证

- 后续用户已明确授权启动Cloud Shell，之前启动审批障碍解除。云接口只读确认目标项目计费启用、计费账号有效、主VM（e2-medium）和扫描VM（e2-standard-2）均RUNNING；不提交账户标识、付款信息或凭据。
- Safari终端反复失联，独立页面空白。本机现有公钥未注册于Cloud Shell；临时注册操作最初被自动审批拒绝，用户随后明确批准“临时连接检查工具版本、结束删除公钥”。第一次API返回500，读回未见该公钥；按官方两字段格式重试后SSH单次有界连接成功，SDK版本583.0.0。不能据此确定第一次500的根因。
- 检查结束已移除临时公钥并读回确认不存在；没有转送OAuth/API凭据，没有取得目标VM管理入口，没有执行目标服务器命令、备份、迁移或部署。Cloud Shell连接通过不等同生产管理/发布通过。
- 已提出将当前Cloud Shell用于后续服务器排障、备份迁移发布和HTTPS复验的具体范围确认（含必要的当前会话API授权与结束清理），等待回复。当前应用运行候选仍1767dbb5eeb30cc57835081de761e1eccb8fac8b，既有目标验证保持；staging/production新路径未执行，main/tag未改变，产品负责人未验收，正式源码Placeholder0。


### 2026-09-12 14:52 UTC — 管理访问恢复、固定镜像发布及真实备份恢复

- 用户已明确授权Cloud Shell用于服务器检查、必要API授权、备份、原生迁移、发布复验及结束清理；此前访问/审批障碍已解除，不再作为当前阻塞。Cloud Shell IAP已使用既有VM公钥和固定known-host身份连接两个VM，未替换其管理密钥；临时Cloud Shell公钥仍在本次交付使用中，结束必须清理，未新转送OAuth凭据。
- 实际旧站点host HEAD和Web/API仍为535041bb25f21d548d863d07b35e3e952b0aeb2c；宿主PG14.24、原API/Web原生systemd运行。源库12用户、1项目、49审计、0附件，约16MB；原角色无全局/继承特权，无prepared事务或逻辑订阅。未改业务数据。
- 新运行候选f2da3629e13b2653aae8879c98992877d5ef4170，tree435fd8f66beef2760ce02388b0948cea35cee55e；新增精确RFC1918容器代理地址信任，防止容器化后所有用户共用登录限速地址。59项目标回归、lint、API类型、独立差异复核PASS；干净源三个amd64镜像build PASS。私有仓库首次上传自动审批拒绝后，通过项目/仓库/IAM只读证据证明当前账号Owner且无public绑定，随后获准上传成功。精确digest见deployment-preparation.json。
- 新独立备份控制器f231659f989ad445fb22807314a44daf0a9f786a；22项边界/中断测试PASS，真实隔离PG并发验证恢复等待未提交角色创建后NOLOGIN（3.32s）。最终四文件独立focused PASS。安装固定root-owned hash53a047f4…、专用受限OS身份和boot/ExecStopPost恢复入口；未调用旧停用exit78脚本。
- 真实snapshot20260912T144907Z-9b8c486b用时17.426s，manifestSHA691880a2…；恢复到独立feishu_timeline_restore_c38c57da用时5.786s，46表数据、完整schema/序列、migration记录和对象集合完全一致。源API自动恢复，临时restore数据库role NOLOGIN+连接清理已证明；备份和凭据仅保留host root私有目录，未进入源码/报告。
- 下一步：扫描器过期官方库的受控更新、精确运行网络/配额/密码Redis和release controller、私有可解析source、候选库迁移与旧管理员精确绑定、最终新备份/切换和HTTPS浏览器验证。旧scanner地址被同机无关Docker网段覆盖，拟只加精确/32路由，不改其Docker网络；当前尚未执行。
- 状态：CODE_IMPLEMENTED / TARGETED_LOCAL_VERIFICATION_PASS / REAL_BACKUP_RESTORE_PASS / DEPLOYMENT_PREPARATION_IN_PROGRESS / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION。staging URL/runtime/用户路径未完成；production运行版本未改变且新用户路径未验收；main/tag未改变；当前正式源码Placeholder0基于未变Web源码复用。

### Native accounts: scanner installation and private source checkpoint

- Runtime candidate f2da3629e13b2653aae8879c98992877d5ef4170 was actually pushed to the user-owned VM private receiver, refs/heads/codex/native-account-release; no public source push or main/tag change.
- Reviewed scanner controller/initializer installed as root-owned external bytes. Real initialization PASS (20.609s): both exact old endpoints closed, original unit saved/masked, three historical official databases verified and retained only as floor 28119, approved=null.
- First new cold activation failed closed after official download/verification. Read-only Docker evidence identified seccomp JSON expansion vs pathname comparison. Scoped correction independently reviewed, 81 targeted tests PASS, single host module atomically replaced. Second refresh is in progress; actual readiness remains unverified.
- GCP and Docker range inspection found proposed172.30.44/29 and172.30.45/29 do not overlap. Existing172.27/16 Docker route overlaps scanner IP; scoped route repair remains pending.
- Actual migration, native account initialization, app cutover, exact-domain user acceptance and temporary Cloud Shell key cleanup remain pending. Website still old runtime; do not report DEPLOYED.
- Details and artifact identities: docs/acceptance/NATIVE_ACCOUNTS_20260912/deployment-preparation.json.

### Native accounts: scanner cold activation, private images and migration-probe review

- Corrected scanner adapter now passed actual cold activation with signed daily28121 (signedAt1789194281), clean and EICAR checks, exact VERSION timestamp, old3311 closure and loopback-only admission. Both reviewed timers enabled. Scanner state/process identity recorded in deployment-preparation.json. Held-connection interruption and unchanged refresh verification are still pending.
- Private runtime Git push succeeded. All three pinned candidate images were actually pulled on the application VM using its existing read-only service account, with digest/commit/tree/amd64 checks. Temporary Docker auth directory /run/timeline-native-pulls/docker-auth-28eokqaa was removed and absence reported; no additional Cloud Shell OAuth was forwarded.
- Fixed restored-copy migration probe implemented and independently reviewed. Only previously verified restored DB feishu_timeline_restore_c38c57da may migrate; original DB not targeted. Journal precedes container creation, recovery closes role before Docker cleanup, old46-table projections and original26 migrations are compared before accepting exact37 migrations. 31 native controller tests PASS. Real isolated PostgreSQL projection checks also PASS on synthetic DB native_projection_43ad8e9a, including original field change detection, additive-column stability, migration append and oversized sentinel rejection.
- Migration probe not yet installed/executed at this checkpoint. Native account CLI, final fresh backup/migration/cutover and exact-domain browser verification remain pending. Production Web/API remain original runtime535041bb25f21d548d863d07b35e3e952b0aeb2c; no product-owner acceptance, main change or tag change.

### Native accounts: real migrated-copy preservation and scanner interruption proof

- Installed migration probe initially rejected Docker's lowercase generic missing-object response before creating its journal or changing any database. Read-only evidence: probe directory empty, restore NOLOGIN/limit1, zero restore clients, original and restored migration counts26. Precisely changed to container inspect with exact missing-container response; other errors remain rejected. 33 tests and independent controller/installer reviews PASS, source commit dc58f32.
- Corrected real probe PASS in23.449s: restored copy26→37 migrations,46 original table projections unchanged,52 resulting tables;12 users/1 project/49 audits/0 attachments retained, native credentials0, role closed, productionChanged=false. No native admin initialization or production migration yet.
- Scanner first held-connection test had an evidence-format assertion failure after actual SIGKILL/closure. Normal refresh restored entry with VERIFIED_UNCHANGED and same process. Corrected test uses actual lock marker and systemd ExecMainCode2/Status9/Result signal; reviewed r2 passed held connection closure, new connection refusal, unchanged approval/floor. Following normal refresh VERIFIED_UNCHANGED at1789228418; final PING readback in progress.
- Private source ref now read back as full candidate f2da3629e13b2653aae8879c98992877d5ef4170. The exact HTTPS website remains old runtime. Next work is isolated runtime networking, authenticated Redis/tunnel, native admin migration, final fresh backup/cutover and browser verification. No main/tag change or product acceptance.

### 2026-09-13 — Native runtime network and private proxy preparation

- Real scanner fault recovery is complete: exact same approved process, PONG and both timers active after VERIFIED_UNCHANGED. Native migration copy preservation remains PASS; original database still26 migrations and original website still active.
- Native network foundation source b294b8f plus precise built-in null-IPAM fix6f711b0. Initial host setup TypeError occurred in read-only preflight; independent fix review and43 native tests PASS. Isolated namespace11 actual connection cases PASS, including denied metadata/unrelated workload/cross-bridge/host SSH, allowed exact proxies and unchanged unrelated traffic/table. Corrected actual host setup now active/success; two private bridges and scanner/32route configured without app start or DB change.
- Five proxy/tunnel units and network boot ordering reviewed in source c3884de. Socket default ordering cycle fixed before installation. Application-only ed25519 key generated on app host; private bytes never transferred; source/port-restricted public entry atomically installed in existing scanner-only account. Proxy installer wrote files then systemd249 verify rejected unsupported %d credential specifier, so no proxy startup or daemon reload followed. Official v249 CREDENTIALS_DIRECTORY alternative identified; focused patch pending.
- Redis old development pin resolves7.4.9 and later7.4.10/11 security fixes apply. Official7.4.11 image pulled on app host with fixed digestff02b58f... andamd64/linux identity. New config/controller drafted for AOF always/rejecttruncation/noeviction, limited named ACL supporting auth and notification transport,64MiB data/256MiB container. Not installed or started; final independent review and real persistence/ACL/pressure tests pending.
- Current status remains DEPLOYMENT_PREPARATION_IN_PROGRESS / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION. No native admin initialization, production traffic switch, main change, tag change or product acceptance. Temporary Cloud Shell key remains active for authorized work and requires cleanup at completion; application scanner key is a separate permanent runtime dependency.

### Native GCE preparation: private runtime boundaries verified (2026-09-13)
- Actual Docker29.6 internal network probe passed PostgreSQL handshake, scanner clean/EICAR, forbidden API/Web destinations and preserved unrelated workload health. Internal-only Docker ignored published ports; a loopback systemd socket proxy was verified instead, with expected trusted API peer172.30.44.1. Both probe containers and proxy were removed.
- Dedicated Redis7.4.11 passed actual authentication/ACL, queue Lua/deduplication, bounded noeviction pressure and two abrupt process restarts. A key first survived a restart, then its acknowledged deletion survived the next; rate state remained. Synthetic keys were removed. This is not host power-loss evidence.
- Permanent application scanner tunnel passed held-stream interruption, listener closure and automatic reconnection with a new process/PONG. Its key is an application dependency, separate from the temporary management key.
- Added reviewed candidate application supervision and exact-role HBA scoping. New application credentials are still not handed to API; installation, real HBA deny checks and administrator initialization remain pending. A post-initialization full fingerprint will guard against candidate background changes before cutover.
- Website remains original runtime535041bb25f21d548d863d07b35e3e952b0aeb2c. Main/tag/production DB unchanged. Detailed non-sensitive receipts: docs/acceptance/NATIVE_ACCOUNTS_20260912/deployment-preparation.json. Temporary management access remains active for authorized delivery and requires cleanup at completion.

### Native GCE: existing administrator bound and candidate startup verified
- Exact candidate role HBA scope passed real candidate-password access, wrong-password rejection and original/postgres DB denial; original HBA rules retained. Native CLI bound the unique existing owner ID to username lixiaochen, preserving 12 users and business/history references; new credential/bootstrap added with audit50. Password stays private on the host.
- Initial preparation configuration lacked required EXPECTED metadata and exited before DB mutation. Exact copy preservation proved, configuration corrected and independently reviewed, then bounded resume succeeded. Full52-table/schema/sequence fingerprint saved after initialization.
- Actual supervised API/Web private startup PASS at f2da3629e13b2653aae8879c98992877d5ef4170; exact build metadata matched and full prepared DB fingerprint stayed identical. Cleanup stopped both containers and closed candidate DB role. API force-stop exit137/OOMfalse retained as evidence, not rewritten to success.
- Reviewed cutover/controller/ingress/recovery source55a11b38e9ceaaa1a997550c6f904378312c941a was pushed to the private VM operations ref and read back.83 native testsPASS; fixed installer and actual systemd249 dependency verificationPASS. Only recovery enabled; public native ingress remains unstarted. Fixed precommit SIGKILL rehearsal is now in progress.
- Mac lock screen blocks actual browser interaction; user asked to unlock while independent server work continues. Exact-domain browser acceptance remains pending. No production traffic switch, main/tag change or owner acceptance.

### Native GCE: real native restore and interrupted promotion recovery PASS
- First rehearsal exited before backup/stop due new private checkout mode0775; exact directory narrowed0700 and clean f2da/tree revalidated. Second stopped before source change because native pg_restore canonicalized one nested AND group in a text-bounds CHECK. All52-table rows/contents and sequences remained exact. Source/restored whole-schema hashes and full sole diff recorded in schema-restore-equivalence files;343 real NULL/Unicode/boundary predicate combinations had zero differences.
- Fixed backup comparison f027f4d82204e431e228653e674eb27513e2e806 allows only the reviewed directional schema hash pair for fixed c38 source/52 tables; every data/sequence/other schema change remains rejected.85tests and separate source/installer reviewsPASS. Private remote ops ref verified; module5bfda36d... installed. Raw fingerprints/backups and failed isolated restore retained.
- Next real native snapshot20260912T173618Z-2482ea2b and independent restorePASS, including native password hashes, no Redis session restoration. Fixed precommit check reached its genuine checkpoint, then only its main process received SIGKILL. Invocation82a2c6b274a14d24ae10b292e9bb9cdc: Resultsignal/ExecMainCode2/Status9, ExecStopPost0 and PRECOMMIT_OLD_RUNTIME_RESTORED. Old services and role restored, native services/role closed; full before/after data checked. ReconcilePASS preserved exact pendingSHA0dbedc3a... as immutable evidence. This is process-interruption evidence, not host reboot evidence.
- Formal supervised promotion has now been requested. Do not report completion until its receipt/runtime checks and exact-domain acceptance finish. Browser remains blocked by Mac lock screen; user unlock requested. Main/tag unchanged, product owner not yet accepted.

### Native GCE: formal runtime switched and exact-domain authentication/restarts PASS
- Supervised promotion succeeded: COMMITTED2026-09-12T17:38:51+00:00, runtimef2da3629e13b2653aae8879c98992877d5ef4170, nativeDBfeishu_timeline_restore_c38c57da. API/Web and original Nginx loopback upstream identity passed. Both old units disabled/stopped and old roleNOLOGIN; original DB retained. Operations remain separate from runtime commit.
- Actual HTTPS16-request authentication verification PASS: existing native owner ID/admin status, secure session Cookie, project/accounts access, unauthenticated401, missing/attackerOrigin403, oldOAuth410 without redirect, mock403 and logout401. All issued test sessions logged out; secrets stayed in memory. Safe method/path/status evidence saved in production-http.json.
- Independent reviewed production restart test PASS: API PID276703→279213 and valid same-owner session200; after logout, combined Redis260863→280252 and API279213→280253 restart completed, old cookie still401. Temporary502 during restarts resolved to correct runtime200. This proves process restarts, not whole-host power-loss recovery. All test sessions logged out; production-session-restart.json.
- Owner login information delivered exclusively to a new localDownloads private0600 file; password not printed or committed. Mac remains locked, so no new exact-domain browser screenshots/Network/console/user interactions or product-owner acceptance. Formal page acceptance remains pending; main/tag unchanged. Final runtime readback and management-access cleanup are in progress.

### Native GCE final server verification and temporary access cleanup
- Final runtime proof PASS: both running pinned images, target release checkout HEADf2da,37 migrations, exact Nginx loopback upstreams, native services enabled/active, old services disabled/inactive and old roleNOLOGIN. Full original source DB fingerprint still identical to fresh snapshot20260912T173840Z-b8d3a4d9; native independent restore point20260912T173618Z-2482ea2b retained. ScannerPONG and unrelated cp-wi-sync-auto health preserved. See production-runtime.json.
- Owner Mac normal-TLS GETs returned correct Web/API versions and actual native login HTML plus current login JS chunk, all200. This is HTTP/static-artifact evidence only; Mac remains locked and no actual browser rendering/network/console/interaction is claimed.
- Both temporary management SSH masters closed, current Cloud Shell public key removed and API readback confirmed absent. No additional OAuth authorization was granted by this task; permanent app-to-scanner key retained as required runtime dependency. Cleanup evidence saved without secrets.
- Current state: CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_RUNTIME_SWITCHED / EXACT_DOMAIN_HTTP_AND_RESTART_PASS / DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION. Production changed to f2da; staging URL/version/path unexecuted; main and tags unchanged. Pending formal user routes: login/callback/account/dashboard/projects/admin accounts aliases/admin organization. Runtime sourcePlaceholder0;10 explicit test-only matches. Remaining external input: user unlocks Mac for browser acceptance, then product-owner confirmation. No current server fault or repeat permission requirement.


### 2026-09-14 — 原生账号登录格式修复及固定程序更新

- 目标仍为精确 `https://timeline.all-too-well.com`；本轮规则未扩大，不重建治理体系或修改全局权限。原工作树未知媒体/既有改动保持，实施工作树 `/private/tmp/timeline-native-auth-20260912`，分支 `codex/native-account-auth`。
- 实际Chrome发现username pattern的Unicode Sets语法错误，修复提交 `6c70a897ec7643f4681616d801481765aaa8f7bc`；仅该表单及回归变更，API/schema/依赖未变。定向8项、Web290项/58文件、Web lint/typecheck/build、最终镜像断网只读HTML与模式验证通过，生产占位源码0/测试白名单10。API177个编译文件只改变构建身份，未受影响验证明确复用；不把本机离线安装交互提示或旧OAuth测试计PASS。
- 固定程序升级/回退控制器运维提交 `3ebcc84097f7a2c78d382f39afce79eff22ce58a`，独立99测试及安全审查PASS；安装、演练、更新调用脚本最终独立审查PASS。只推送本人服务器已有私有Git及镜像仓库，目标所有权/私有IAM补证后API上传审批通过。main/tag未改变。
- 真实SIGKILL演练自动恢复f2da原生版，原登录会话随后me200且同内部ID；全部52表/schema/序列不变。正式6c70更新同样不改数据/37项迁移，不重跑初始化或数据库恢复。程序切换时间 `2026-09-14T01:56:49.490849+00:00`，Web/API/镜像/干净server HEAD均6c70，Nginx仍127.0.0.1:3000/3001；DB为 `feishu_timeline_restore_c38c57da`。旧库保护、扫描器及无关应用读取通过。
- 更新观察器在实际成功后因systemd GC清空成功单元InvocationID而失败，未生成虚假PASS或重复更新。固定invocation日志及实际运行数据补齐只读证明；这份追加证据脚本的额外复审因两个审查上下文容量错误不可用，未计独立PASS。原控制器安全审查结论不受影响。
- 最终正常TLS网站27请求PASS：版本一致、原生管理员/项目/目录、Cookie、Origin、旧OAuth410/mock403、退出401、新表单及静态脚本。跨正式升级旧会话可读检查未执行（观察器失败后退出）；不得混为跨中断恢复会话PASS。
- 本机非系统Python缺CA及首次SSH外层35秒超时分别诊断后恢复：系统CA正常验证；Cloud Shell到VM SSH横幅1.48秒、API可用，外层90秒后预检确认先前指令未达/无状态文件。没有降低TLS、主机密钥或网络安全。
- 所有临时验证会话退出；本轮Cloud Shell公钥/管理连接和两端专属Docker认证清理确认。用户现有云登录及固定应用扫描连接保留。Cloud Billing当前账号开启、项目计费启用。
- 精确域名Chrome曾渲染原生登录但随后控制连接故障；修正版多路由截图/Network/console/交互仍待完成。已询问用户手动登录结果，尚未答复/接受。staging URL/commit/path未执行，production实际改变但浏览器路径未验收，main/tag未改变，产品未确认。
- 证据入口 `docs/acceptance/NATIVE_ACCOUNTS_20260912/README.md` 及 `production-runtime-6c70.json`、`production-http-6c70.json`、`production-release-recovery-6c70.json`、`release-6c70-preparation.json`、`temporary-access-cleanup-20260914.json`；路由矩阵同步更新。
- 状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_RUNTIME_SWITCHED / EXACT_DOMAIN_HTTP_PASS / DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。


### 2026-09-14 10:56 — 用户确认原生账号进入正式工作台

- 用户回复“可以进入工作台”并附Safari截图；接受范围仅原生账号登录→工作台，记为 `USER_CONFIRMED_NATIVE_LOGIN_DASHBOARD`，不替代全部管理/业务验收。
- 同一浏览器会话随后读取原有项目（1项、10/18）、个人账号、原生账号目录及用户名搜索、组织人员页面；版本页正文确认运行6c70。没有改密码、创建用户/项目、配置权限或退出用户会话。
- 新观察：无当前待办时工作台使用“当前还没有项目”文案，与原有项目存在不一致；源码canCreateProject分支并未检查项目总数。记录开放UI问题，本次未修改代码或部署。用户提供的图片在对话可见，但指定Desktop源文件未找到，不声称本地PNG副本/摘要已保存。
- 本次代码无变更，本地测试未重跑（既有结果保留）；staging URL/runtime/path均未执行；production本次未改变，运行 `6c70a897ec7643f4681616d801481765aaa8f7bc`；用户确认登录路径，其他读取为实际浏览器观察；main/tag未变。
- 未完成：工作台空状态提示、注册/恢复/改密/授权写入浏览器验收、完整Network/console和响应式矩阵、callback/别名；正式Placeholder维持上次源码扫描0，本次未改源码。精确状态 `PRODUCTION_BROWSER_PARTIAL / USER_CONFIRMED_NATIVE_LOGIN_DASHBOARD`；整个产品尚未获接受。
- 证据：`docs/acceptance/NATIVE_ACCOUNTS_20260912/owner-browser-confirmation-20260914.json`；README/路由矩阵同步更新。临时云访问仍保持已清理。


## 原生登录体验版本：独立 Ops 接续准备（2026-09-18）

- 所有者新工作包由根任务实施；本子任务仅在独立 `/private/tmp/timeline-login-release-ops-20260918` 准备 c5 后续固定发布控制器。源码提交 `b4bb33453d66e94adfa8eec013a11e223b26e35e`，未连接生产、推送或发布。
- 安装范围仅一个新目标模块与原子替换发布控制器；保留原 v1 状态、c5 回退、所有旧原件/备份/收据、PG/Redis/对象保护。固定9项Python依赖和4个unit保持原字节，双方API均要求真实优雅退出。
- 11个运维测试模块129项本地PASS；12种本地写入/原子激活中断恢复、旧proof拒用及权限/状态负向通过。这些是本地合成测试，不是生产演练。
- `TARGET=None`：6fd因根任务真实HTTP隐式类型转换失败已撤回，最终新candidate与RepoDigest待提供；当前包不可生成/发布，独立静态审查待完成。
- 详情及日志摘要见 `docs/acceptance/NATIVE_LOGIN_RELEASE_20260918/OPERATIONS_CONTINUATION.md` 与 `operations-continuation-preliminary.json`。main/tag/生产由本子任务保持不变。


## 原生登录体验版本：固定541 Ops包准备（2026-09-18）

- 最终 runtime `541b3dfff682aa29b49a96b251f0a084903c981a`、tree `bc65d7145a498066556f2abc8d8619a6643dc325`，经根任务实际私有RepoDigest回读绑定，Ops源码提交 `0f4980733d6c1265f0677904a5aa4e3ac94776bc`。此前6fd候选撤回记录保留。
- 本轮20项API/Web差异精确SHA已固定，无schema/依赖变化；根任务新现场preflight与14个controller/unit原始摘要逐项一致。绑定后129项本地运维测试PASS，7脚本语法/字面量/2个payload SHA核对PASS。
- 固定包 `/private/tmp/timeline-native-login-release-bundle-0f49807`，manifest SHA256 `578a38e3840efffdf4722ab32bdca0d9578577cdfc520d0387a97c0164cb5f3f`。根任务已审接续逻辑，本轮最终身份与包待其最终审查；本子任务未执行SSH、push或生产步骤。
- 详情见 `docs/acceptance/NATIVE_LOGIN_RELEASE_20260918/operations-final-binding-541b3dfff682.json`。当前仅 FIXED_PACKAGE_PREPARED / FINAL_PACKAGE_REVIEW_PENDING，不能声称新网站交付。


## R28 后台与团队流程：固定迁移发布准备（2026-09-28）

- 继续所有者自主上线目标，在独立 Ops 工作树基于 f77d958 准备固定 22aac→29ed14c、37→41 发布。应用候选及私有镜像已固定，尚未安装/执行本轮生产升级。
- 新增迁移日志、启动/恢复门禁、精确历史及交接验证、实际B0隔离恢复、固定安装器/驱动；原程序发布分支、旧控制器与收据保留。
- 164项Ops回归、固定镜像升级/备份恢复、真实快照生成器及迁移中/开放写入后两类实际SIGKILL隔离验证通过；独立只读审查发现的恢复入口与快照主键问题已修复，最终只读复核无新的确定阻断。
- 证据、适配边界、日志/工具摘要和剩余生产步骤见 `docs/acceptance/R28_OPS_20260928/README.md`。精确生产域名/PG14/systemd验证待执行，main/tag不变，产品负责人未确认。
