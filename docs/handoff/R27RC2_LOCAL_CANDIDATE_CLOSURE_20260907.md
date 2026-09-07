# R27RC2 本地候选收口回执（2026-09-07）

本轮已知 Admin/Suppliers 锁与 manifest 源码合同阻断已清除，状态为 `CODE_IMPLEMENTED / LOCAL_VERIFIED`。本回执引用唯一 `docs/security/FINDINGS.yaml`，不建立第二份 Finding 状态源；完整发布就绪尚未成立。

## 候选与成果保护

- 工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`，分支 `security/r27rc2-candidate-repair`。
- 本轮起点：`d4ebd25152cb8c2991918ad2dc5fbe2c1c169dde`，tree `bc1758844081f99333fed7be6a216775d0df0220`，开始时工作树干净。
- 产品 checkpoint：`c37f8103e5be35cb951ab3f022ffee80add6038e`，tree `25eb8f1352a8602d2a0c72438ab2b23fa74152c5`，仅 10 个产品及直接测试/合同文档文件。本回执、执行记录与 Finding 登记作为紧随其后的独立 evidence commit；最终 evidence hash 从 Git 取得，不回写形成提交循环。
- 上轮产品 `080453967581ef03872e1b2d130fe9d75d86fc85` 和治理 `69c1012a39c0a9977fc442e0b035b203af587997` 保留。项目/流程/附件锁回归、legacy restore fail-closed、Web/shared、依赖和 schema/migration/CI 未变；原 main 工作树及未知内容未触碰。
- 本轮未安装依赖、修改 lockfile/schema/migration、查询远端、push、merge main、改 tag 或部署。

## 锁修复与逐处覆盖

仅将以下八处参数化事务内 `$queryRaw` 锁调用改为 `$executeRaw`，不改变锁键、先后次序、等待、事务生命周期或业务判断。其他真正读取数据的 SQL 保留。共享根因归入唯一 Ledger 的 `R27-RC2-ADVISORY-001`，不机械拆成八个漏洞；P2010 是写路径失败证据，不是权限绕过证明。

| 位置/锁 | 真实服务覆盖及约束 |
| --- | --- |
| Admin saved-view | 保存、读取、版本 CAS、用户隔离；另一连接实际等待 owner 锁 |
| Admin command | 项目命令；同 key 重放仅一条业务/审计结果，变更 payload 拒绝 |
| Admin project-mutation | 项目基本信息；不同 key 的陈旧版本竞争仅一胜者 |
| Admin system-admin | 用户状态命令；竞争状态 CAS、原最后管理员保护单元测试保留 |
| Admin department-hierarchy | 创建部门；竞争重复名称只产生一个正确层级子部门及审计 |
| Supplier command | 新建供应商；同 actor/key 重放、不同 payload 拒绝 |
| Supplier mutation actor | 同 actor 并发限流，仅一次准入；权限拒绝不增加 bucket |
| Supplier catalog | 不同 actor 争抢目录最后一个名额，仅一次成功 |

新增 `admin-supplier-locks.postgres.integration.spec.ts` 共 23 例。逐处等待通过独立 Prisma 连接、不同 backend PID、`pg_locks` 未授予锁及 `pg_blocking_pids` 观察证明，不以固定睡眠或耗时推断。Admin/Supplier 注入审计写后异常，证明实际数据库回滚和其他连接重试/锁释放；Supplier 独立准入事务按原语义保留一次 bucket，不把它误当业务事务泄漏。保存视图现行设计无审计写入，未伪造其审计。

修复前用真实服务正常路径复现三例 P2010（saved-view、Admin 项目命令、Supplier 新建）；未把其余未选择的用例称为已失败。源码逐处及锁等待验证覆盖全部八处。本地 HTTP 另外执行五类实际写接口与 29 个请求，覆盖 guards、DTO、认证、财务角色 403、匿名 401、命令 header 合同、CAS、幂等、审计、持久化及权限拒绝无副作用。测试使用隔离 mock 用户和新建 fixture，Cookie 只留内存。

## Manifest 合同

原始线索为外部 RC2 报告中的 `R27RC2-CURRENT-002`：
`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-evidence/38ccd95ae95835806e92b530b17fd50f88166efd/reports/BLOCKER_REPORT.md`。
此前 canonical Ledger 不含此条；本轮以满足既有 schema 的 ID `R27-RC2-CURRENT-002` 登记并明确引用原名，没有修改 schema 或假造之前的 Ledger 状态。

既有 `release-identity.mjs` 现在共同定义生成和消费：

- Runtime v1 仍严格包含四字段 identity 及六镜像 imageId/repositoryDigest，旧启动和 health 链保持原合同。
- 独立 `candidate-evidence` v1 绑定同一 identity、规范化 runtime SHA-256、父提交、平台和七类结果文件。材料的外部固定摘要来自可信审查记录，校验器同时检查原始文件摘要；不从待验文件自举批准。
- 六项实际 image inspect 的 ID、digest、应用 OCI labels、Os/Architecture 必须与 runtime 和目标平台吻合。路径越界、symlink、特殊/超大文件、缺少字段、版本漂移、内容篡改或身份不匹配均拒绝。
- 未确定平台和未运行检查可在草稿中分别记为 null/NOT_RUN，完整校验拒绝此草稿。完整审计附件不成为应用启动依赖；生成或一致性校验不授予发布权限，不证明报告真实性。

实际 CLI 生成→摘要→消费成功路径和负向回归已执行。测试中的镜像、hash 和平台是明确标注的合成夹具；本轮没有签发实际 runtime/release candidate manifest、镜像身份或正式扫描 PASS。现行操作合同位于 `docs/STAGING_DEPLOYMENT.md` 的 RC2 小节。

## 验证、复用与证据

本轮持久本机证据目录（Git 忽略、未提交原始日志）：
`test-results/r27rc2/local-candidate-closure-20260907-034253/`。

| 实际执行 | 结果 | 日志 |
| --- | --- | --- |
| 修复前真实 PostgreSQL | 3 例预期 P2010；失败记录保留 | before-fix.log |
| 锁定向验证 | 23 PASS | locks-after-fix.log |
| Admin/Supplier/权限受影响测试 | 151 PASS | affected.log |
| 最终 API 全套 | 129 文件 / 1320 PASS，四组 PostgreSQL 环境变量均显式启用，无跳过 | api-full.log |
| API lint/typecheck | PASS，退出 0 | api-lint-final.log、api-typecheck-final.log |
| API build / Prisma validate | PASS，退出 0 | api-build.log、prisma-validate.log |
| 现有 36 migrations | 两个本轮临时库应用 PASS | migrations.log、quota-migrations.log |
| 原 manifest 冲突复现 | 原 runtime 接受最小格式，拒绝混入 rich 字段 | manifest-before.log |
| Manifest 测试 | 18 PASS | manifest.log |
| 原 health / 部署参数和 fail-closed 回归 | PASS | manifest-health.log、shell-security.log |
| 本机 HTTP | 29 请求及实际数据库断言 PASS | http.log；http.cjs 为精确执行脚本 |
| Placeholder 扫描 | 10 个原始命中，均为测试负向断言或 getByPlaceholder；正式页面 0 | placeholder.log |

Node 24.14.0、pnpm 9.15.4、Prisma 6.19.3、Vitest **3.2.7**、PostgreSQL 16.14。锁文件 SHA-256 为 `9186715db8a3fb724b2d856067bb69f320204beb4027b8672a0f2b263503d962`。原类型检查发现新增测试五处数组取值标注错误，已修正，失败原文保存在 api-typecheck.log；不是通过删断言解决。

本机 API `http://127.0.0.1:53138/api`，Origin `http://127.0.0.1:53139`，PG/Redis 仅使用本轮 loopback 端口与数据库。API 从与产品提交一致的已审代码编译；运行 metadata 仍是已签入的 development 值，不能作为不可变发布镜像/runtime commit 证明。本轮 API 进程和两个临时容器已清理，fixture 随临时数据库销毁，未清理其他资源。

上轮重要证据已从 `/private/tmp/rc2-resume-20260907/` 复制到 `test-results/r27rc2/local-repair-20260907/`，35 个文件逐项核对摘要，原始证据未改。Web/shared/依赖/配置未变，复用上轮 Web 287 测试、Web build、Chrome 项目创建及 HTTP 主链路的相应证明；这些本地证据不替代本轮 Admin/Supplier 写路回归、真实飞书或环境验收。纯证据文档不触发应用重建。

独立只读上下文 `/root/independent_review` 对最终 10 文件、PostgreSQL、manifest 和 HTTP 证据复核为 `G4_DIFF=PASS`，无实质修正项。它不是组织批准、G4_FULL 或产品负责人确认。

- 产品内容清单 SHA-256：`458b3914fce26cc6eeccc7fc63c50ae322d2479cc6b88980169973ae4d5c3bff`。算法：相对路径字典序，每行文件原始 SHA-256、两个空格、路径、LF；最后一行有 LF。
- 独立审查记录 SHA-256：`6235ba49e0171f802410d2136f046c6602ec5e9b612b76e4779c32356c0aca9b`。
- 执行结果 SHA-256：`6879cc42ce46304106d5d02862894201ea0c9c0dba5c4093e7f3e2aa901d2c50`。
- 本机证据索引 SHA-256：`6228965bd723cd4d4a75faa5274cada4385d7e899821f531a7056f622a63bfec`。此索引是日志归档清单，不冒充上述发布 manifest。

唯一 Finding Ledger 追加两条 `fixed_diff_verified`，保留七条历史记录原文；未改历史关闭事实、未接受风险、未提升为 fixed_full_verified/closed。

## 仍需外部输入的下一阶段

本地检查已清除本轮代码与合同问题。下一阶段应围绕产品 `c37f8103e5be35cb951ab3f022ffee80add6038e` 指定环境和操作；当前还缺：

1. 具体预发布 hostname/URL、服务器与目标 CPU/platform、测试数据库/数据范围。现有 CI、两份 Dockerfile 和 staging Compose 未显式固定平台，开发机架构不能代替目标要求。
2. 正式 source/image 检查的执行范围及可用工具/规则身份、候选绑定的报告；CI 已规定 secrets、SAST、SCA、镜像扫描。本轮无当前正式结果，不能复用旧历史 PASS 或合成夹具。
3. 目标平台不可变镜像、registry/digest 及所需产物证据。本轮未构建或上传这些镜像。
4. 经批准的外部 root-owned/digest-bound 发布和恢复控制器，测试数据库迁移/恢复/回滚操作范围。legacy restore 继续退出 78，没有恢复权限或替代恢复方案被默许。
5. Reviews 生产索引采用在线索引还是批准维护窗口的决定，以及之后真实飞书测试身份、角色/主链路、精确域名浏览器验收与产品负责人确认。

先补齐环境和范围，才能提出“这个候选 + 该环境 + 确切迁移/回滚及验收操作”的请求。本轮不申请抽象 Gate 放行，也不自动查询或访问目标环境。

## 状态与环境真相

| 项目 | 当前状态 |
| --- | --- |
| 本轮代码 / 本地验证 | CODE_IMPLEMENTED / LOCAL_VERIFIED，本地 checkpoint 已保存 |
| staging URL / runtime commit / 用户路径 | 未指定；未访问、未部署、未验证 |
| production / runtime commit / 用户路径 | 未改变；https://timeline.all-too-well.com 未访问，运行 commit 未读取，路径未验证 |
| main | 未改变，`41b4b166c587692e6f0fb9536dca2e1aab646c70` |
| tag / push / 远端查询 | 未执行、未改变 |
| 产品负责人 | AWAITING_PRODUCT_OWNER_CONFIRMATION；未声称 PRODUCT_OWNER_ACCEPTED |
| 路由 / Placeholder | 无新增 UI 路由或远端路由验收；正式页面占位命中 0，不声明整组页面已验收 |
| 完整发布候选 / G4_FULL | 正式安全、产物和环境证据未齐，未宣布发布就绪 |
