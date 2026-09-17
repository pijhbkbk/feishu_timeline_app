# 原生账号与可携带恢复：当前续接

更新时间：2026-09-17 09:10 UTC。所有者已要求按 `NATIVE_AUTH_ACCEPTANCE_AND_PORTABLE_RECOVERY.md` 继续。正式网站业务、离线运行、合成异机恢复分别报告；旧原生登录→工作台已有用户确认，整个产品仍未接受。准备过程与原失败保留在执行账本及现有验收目录，不把旧结果改写为 PASS。

## 当前身份与边界

- 原项目 main：`41b4b166c587692e6f0fb9536dca2e1aab646c70`；既有 AGENTS/README/Ledger 差异和用户媒体原样保留。未 reset/stash/clean/prune，main/tag 未变。
- 工作分支：隔离 clone `/private/tmp/timeline-native-portable-20260917` 的 `codex/native-portable-recovery`，已持久保存回原项目同名分支；后续证据 commit 不代表 runtime 变化。
- 冻结 runtime：`c5aed415cd17e6e8a21b422a4c5c92b4b924e091`；tree `830e562f5ec56e99d7fc0b04432fc056dd772254`；release `native-portable-20260917-c5aed415cd17`；buildTime `2026-09-17T08:04:51Z`。
- API `sha256:40544930b329416679f24ebc6dd2354e24beaec9d8490b9edbdbda5e0f71d192`；Web `sha256:774419239cea09f8d341fd29ed34361b47012c720bafbe7a3a5ef0d60ffa187b`；Ops `sha256:bc47eab26f3de164a4cca805453b467fa88922944ca6bdae240a2a8bceda614f`，六镜像均 linux/amd64。
- 用户已授权项目隔离测试、独立审查、本人现有私有 Git/registry 与服务器受控发布。没有新云资源、DNS 修改、生产数据复制到 B、全机信任/权限修改或公开披露。模型审查不代替实际用户验收。
- 单一有方向 schema 例外已获用户明确批准并经正常工具审批实施：`3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0` → `175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6`。五项回归和独立静态复核通过；其他结构/行/序列/对象/身份校验不变。旧自动审批拒绝与失败库保留。

## A：正式网站与业务

- 正式 `https://timeline.all-too-well.com/dashboard` 曾实际复现“无待办”错误推出“无项目”；同一账号仪表盘项目数及列表 total 均 1，项目进度 10/18。修复 d6004cd 不扩大查询权限、不改历史作者，定向 Web 27/API 13 回归通过。
- 未变化应用/依赖按 13131ee 的 Web 297、API 1353 项通过复用；另 60 项/6 文件 SKIPPED 不计 PASS。最终三镜像已构建；相关 lint/typecheck/build/Prisma 证据见现有 A2 README。生产 Placeholder 0，10 处测试白名单。
- 最终 A3：`https://localhost:3450`，实例 `timeline-portable-bba6c545a4fd`。从最终包空库安装/业务目录/管理员初始化，六模式 253 个真实 HTTP 请求通过。注册、岗位/角色、停用、密码/恢复/会话、跨项目拒绝、RETURN/重提/扫描/APPROVE/采购与后续节点、审计和读取均有对应证据；真实恶意附件拒绝。随后增加恢复边界专用合成账号，准备非空队列后所有 A3 服务停止。
- 最终 c5 源码及 API/Web 已上传现有私有库并实际 readback；专属上传认证已删除，用户原有云身份保留。服务器候选 checkout/镜像已预备，不等于运行版本切换。
- 生产目前仍 `6c70a897ec7643f4681616d801481765aaa8f7bc`。09:01:40Z 正常 TLS `/api/health` 为 200/6c70。数据库 `feishu_timeline_restore_c38c57da`，Nginx 既有 127.0.0.1:3000/3001；未重跑 bootstrap/migration/seed 或数据库恢复。
- Ops d16 控制器已于 08:54Z 安装，故不能再说生产文件完全未变。08:58:34—08:59:52Z 首次 rehearsal 在备份创建前因 `KeyError: MainPID` 失败，系统自动恢复原生 6c70；无 checkpoint、无本次保护备份，绝不称演练/备份 PASS。实际 socket 不含 MainPID，服务有此字段。最小修复仅容许两个固定 socket 缺该字段，服务及 ControlPID/inactive 门禁仍严格；先 RED 后 GREEN，121 项测试及静态差异审查通过。针对已安装 d16 的精确原子修补仍在准备/审查；禁止重跑旧通用安装或未核对的新包。先修补并仅一次重新演练，root 收到实际 PASS 后才决定程序更新。
- 生产浏览器标签保留专用旧会话用于版本切换后复验；当前是旧页面、console warn/error 空，不证明新页面通过。必须补新构建、API 请求、三档截图/交互及退出验证。

## B/C：软件和独立恢复

- 冻结软件七文件/manifest、clean git archive、六镜像和 72 OCI blob 闭合已独立核对。私有持久目录：原项目 `var/native-portable-delivery-20260917/final-c5aed415cd17`；software 与 corresponding-source 共 15 文件已逐一复制后校验。扫描器补充源码内 13131ee 为历史采集来源，不是应用身份。
- 同目录 official-signatures 仅三个官方 CVD；daily 28125 签署于 2026-09-16 06:24:23Z，48 小时策略到 2026-09-18 06:24:23Z。到期需合法导入新签名；不伪造新鲜时间。备份和秘密将分别保存，不能混入软件包。
- 独立 B：Lima 2.2.0 / Ubuntu 24.04 arm64 / 4 CPU、6 GiB、40 GiB / Docker 29.5.2 / Node 24.14.0；首次最终镜像导入前 0 镜像、0 容器。没有源码 checkout、旧数据卷、用户云凭据；主机及 Docker 公网/旧服务器/元数据出口实际拒绝，控制通道与 localhost:9444 保留。
- 初次 QEMU PostgreSQL 启动失败，未到业务库恢复；经独立核对改用 Mac 已安装 Rosetta，仅 B VM 设置启用，无下载/许可/全局修改。特殊只读系统共享 `/mnt/lima-rosetta` 承载翻译器，不能宣称“零宿主共享”；没有用户/项目/源码/备份共享。实际 PostgreSQL 进程使用 Rosetta，重启后断网规则重新验证。
- 最终 A3 加密备份含 52 表、2 对象、1 持久队列任务和去重（2 Redis keys），不含会话。B1 08:39:59Z 成功全量恢复；旧会话和当时尚未过期恢复码均拒绝，身份/角色/状态保留，恢复码字段清空，新恢复码可正常用。该早期边界结果只代表 B1，不将后续自然过期当新证明。
- 第一次业务历史对比因测试脚本先下载产生合法新审计失败；独立核对仅新增下载审计。外部脚本只将完整历史断言前移到下载之前，不删断言/审计，不修改冻结软件。新目标 e65e7d978beb 随后遇到代理 128 MiB OOM；数据库历史仍与源完全一致。
- 经独立审查的外部 B profile 仅将代理上限改 512 MiB、替换为验证自有 CA 的真实 TLS 8443 健康检查（Host localhost:9444、固定 c5、超时与响应体上限）；无关闭 TLS、网络/权限扩大。实际 Memory 536870912/OOM false/health exit0 已取得。冻结软件默认配置未改，这项平台补充和失败须随交付说明。
- 当前 `https://localhost:9444`、实例 `timeline-portable-e65e7d978beb`：历史全量比对、权限、旧附件摘要、越权拒绝、新项目写读 21 请求 PASS；新 PNG 实际 Clam 扫描 CLEAN/下载同 SHA/CSV 200；队列只产生一次通知、待处理 0、去重期限未延长。应用正常停止后重启并再次登录/读取新对象通过；一次过早 start 被 operation.lock 拒绝，记录保留且未删锁。VM 冷重启、第二份备份与空目标恢复仍在执行，C 尚不可整体记 PASS。
- 本机浏览器 `https://localhost:9444/login` 被未信任测试证书阻止，工具也禁止越过错误页。用户答复暂时无法处理并提供 Safari 警告截图，故本机浏览器为 NOT_ACCEPTED；没有绕过警告或修改 Mac 信任。技术恢复可继续，人工视觉验收单列。

## 下一步与状态

1. auth_acceptance_review 独占生产控制器修补/演练；root 只读及正式浏览器。不得与子代理同时变更服务器。
2. portable_recovery 独占 B 写操作；完成冷重启、B 第二备份/空目标恢复，给出实际命令和分开的软件补充/合成备份/秘密清单。失败实例、旧卷和备份保留。
3. 生产真实演练 PASS 后执行固定 c5 程序更新，取得运行身份/数据库/入口证明；正式域名浏览器与 HTTP 验证分开，不能以 localhost 代替。
4. 持久保存最终材料、更新同一交接/账本/路由矩阵，清理自己创建的会话及临时访问，保留用户原有凭据。

当前：`CODE_IMPLEMENTED / FINAL_BUILD_AND_A3_HTTP_PASS / INDEPENDENT_RESTORE_IN_PROGRESS / PRODUCTION_UPDATE_NOT_EXECUTED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging 仅上述两个本机 HTTPS 地址；完整离线浏览器和产品接受均待办。所有者已确认的原生登录→工作台路径继续有效。
