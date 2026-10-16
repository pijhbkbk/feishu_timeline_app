# R27RC2 本地修复回执（2026-09-07）

本回执从 `docs/EXECUTION_LEDGER.md` 引用，仅记录本地修复证据，不替代 Finding Ledger 或环境/产品验收。

## 现场与候选

- 工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`。
- 分支：`security/r27rc2-candidate-repair`；恢复基线 `38ccd95ae95835806e92b530b17fd50f88166efd`，tree `7659e277ff44a3dc36c5a0e87b861a303043c5ef`。
- 治理 checkpoint：`69c1012a39c0a9977fc442e0b035b203af587997`。
- 产品 checkpoint：`080453967581ef03872e1b2d130fe9d75d86fc85`；产品 tree：`b5c65c522384643528482053b91ab2c13387e05f`。
- 本文件随后作为独立 evidence commit 保存；未在运行环境部署此产品 commit。产品源码身份不因说明文档变化而改变。
- 未 push、merge main、创建 tag 或查询远端。原 main 工作树及其未知 dirty 文件未改动。

## 已保护的输入与实际修复

治理阶段六个原产品文件逐字节保持不变。原 patch SHA-256：`fed2bc365cd6c2feab9cebb5b825fff0e1e14a8ace79d1e35653a022960d7831`，原 patch 和逐文件摘要保存在 `/private/tmp/rc2-resume-20260907/`。

产品阶段保留原项目创建锁修复、恢复入口禁用及相应测试；续改原创建幂等测试中一个无效类型转换，续改原 E2E 的现行接口契约。其余四个原文件仍与恢复时字节一致。

- 治理：增量更新根规则及七个直接相关文档，去除模型白名单、机械微任务/字段门槛、强制换会话和无条件全局停工；保留业务、安全、数据、真实权限、独立审查及交付真相。未改全局配置、Finding schema、历史报告或扫描器。
- PostgreSQL：真实复现 Prisma 将 advisory lock 的 PostgreSQL `void` 结果反序列化时报 P2010。项目创建、直接流程分配锁、附件配额准入与对账锁改用参数化 `$executeRaw`，保持事务、锁键/排序、权限、CAS、审计和扫描规则。
- 回归：新增真实数据库创建/并发等待/幂等冲突/事务回滚测试，以及附件并发配额拒绝/对账测试；修正直接调用方的 mock，不用 mock 证明数据库锁。
- 恢复安全：保留 legacy restore 的特权模式 fail-closed stub（退出 78），同步现行迁移计划/清单为 `MIGRATION_BLOCKED`，没有伪造可用的替代恢复控制器。
- 主链路测试：保留权限负向、并行拓扑、驳回新轮次和 12 月度实例断言，改走已存在的完成预览/版本/幂等命令及专属评审/生产接口；额外断言通用终态入口仍拒绝且不改变任务。
- Chrome 测试：登录夹具补真实 Origin；项目创建断言按正式 R22 路由核对创建响应、刷新持久性、列表和时间线，保留业务检查并保存证据。没有修改认证/CSP或业务页面。

未新增依赖、未更改锁文件、schema、migration 或 CI。已有依赖齐全，所以按本次任务授权未运行安装。

## 验证与审查

日志根目录：`/private/tmp/rc2-resume-20260907/`；下表日志均在此目录。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 根 lint/typecheck，后续受影响包复查 | PASS | lint.log、typecheck-verified.log、api-lint-final.log、api-typecheck-final.log、web-typecheck-final.log |
| Web 单元测试 | 57 文件 / 287 测试 PASS | full-tests.log |
| API 最终单元及集成测试 | 128 文件 / 1284 测试 PASS | api-tests-final.log |
| 真实项目/附件 PostgreSQL | 5 个新增项目、3 个原项目、2 个新增配额数据库用例实际执行；包含观察另一数据库连接等待 advisory lock | projects-final.log、api-tests-final.log |
| 现有 36 migrations | 两个专用临时数据库应用 PASS | migrations.log、quota-migrations.log、database-status.log |
| Web/API 构建、Prisma validate | PASS | web-build.log、api-build-final.log、prisma-validate.log |
| 生产构建内容检查（本机构建） | PASS，不代表部署 | production-build-check/eval-source-map-check.txt |
| 恢复入口及部署参数安全回归 | PASS | deployment-regression.log |
| HTTP 主链路 `pnpm test:e2e` | PASS，含真实 DB、业务接口、对象存储文件 | mainline-e2e.log |
| Chrome 新建项目/刷新/列表/时间线 | PASS，1 用例 / 9.2 秒；19 个 API 请求，无失败响应、page error 或 console error | browser-create.log |
| Placeholder 扫描 | 原始命中 10，均为显式白名单测试负向断言或 getByPlaceholder 选择器；正式页面命中 0 | placeholders-final.log |
| diff 格式、测试脚本语法 | PASS | git diff --check、node --check apps/web/scripts/e2e-mainline.mjs |

Node v24.14.0，pnpm 9.15.4，Prisma 6.19.3；数据库为本轮新建的临时 PostgreSQL（rc2_resume / rc2_quota），Redis 为本轮专用临时实例。连接只到 loopback；使用模拟登录和测试用户，未使用飞书真实凭据。对象文件只写本轮临时目录。

本地 HTTP 地址 `http://127.0.0.1:3310` / API `http://127.0.0.1:3311/api`；浏览器使用开发 CSP 已允许的 `http://localhost:3000` / API `http://localhost:3001/api`。都不是 staging。Web 为实际开发构建；前述 production build PASS 不冒充当前 dev 静态资源身份。

验证复用依据：API 配额修复后重新执行 API lint/typecheck/全部测试/build；Web 业务源未变，复用 Web 单元测试/build，测试夹具变化后重新执行类型检查和 Chrome。仅文档变更不重新构建应用。

原失败日志保留，包括 project-real-red.log、quota-red.log、mainline-e2e-red.log、mainline-e2e-contract-red.log、browser-create-origin-red.log、browser-create-csp-red.log、browser-create-route-red.log、browser-create-filter-red.log。每次重试均有明确新根因或输入修正；没有跳过/删除业务断言。

独立只读上下文 `/root/independent_review`：治理审查发现残留作者自审豁免，删除后 PASS；最终产品 diff `G4_DIFF=PASS`。审查不是组织批准、安全全仓清场或产品负责人验收。

浏览器证据：`browser-create-network.json`（19 个 API 请求状态，不含 Cookie）、`browser-create-timeline.png`（最终 `http://localhost:3000/projects/timeline` 真实测试项目）。browser-create.log SHA-256：`635d61a675f1d39c09883f7c20b7925a53b91f74deffaaa4d0b7decfbccf28c8`。全部本轮日志/截图摘要在 evidence-manifest.json；原历史报告的摘要未作为新源码验证依据。

独立审查最终 tracked diff SHA-256：`54a4f2f36ca9ed193761e7f42e86f6788a2a90de2bd92c050baca597a9b7aedb`；两份新增集成测试在以下完整内容 manifest 中纳入并在产品提交中保存。

最终产品 21 文件内容 manifest SHA-256：`c06aa3f82f2e56719969c1f458205f43ad35983eef3f11898355f0b3c58eba35`。算法：按相对路径排序，每行 `SHA256(file bytes)  path` 加换行；包括两份新增集成测试。lockfile SHA-256：`9186715db8a3fb724b2d856067bb69f320204beb4027b8672a0f2b263503d962`。

## 后续阻断与证据缺口

原 RC2 失败来源：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-evidence/38ccd95ae95835806e92b530b17fd50f88166efd/reports/BLOCKER_REPORT.md`。

以下是当前证据和待导入建议，不建立第二套 Finding 状态源；`docs/security/FINDINGS.yaml` 的既有关闭状态未改写，也未用本地 PASS 关闭新 Finding。

- 原 RC2 报告 `R27RC2-CURRENT-001`：危险 legacy restore 入口已禁用并经本地测试/独立 diff 审查；这不提供可用恢复方案。真实迁移/恢复仍需要已批准的外部 root-owned、digest-bound 控制器以及数据库和回滚方案授权。
- 原 `R27RC2-CURRENT-002`：runtime 最小字段合同与 rich evidence manifest 合同冲突尚未正式处置；继续阻断“完整发布候选就绪”的结论，不能仅凭 build PASS 忽略。
- 同类 advisory-lock `void` 模式仍在 Admin 五处（admin-control-center.service.ts 的 saved-view、system-admin、command、project-mutation、department-hierarchy 锁）、Suppliers 三处（suppliers.service.ts）；属于本次主链路直接依赖之外的现存写路径。这是源码层面发现，本轮未实际执行这八处写接口；应作为当前候选缺陷待导入唯一 Finding Ledger 并独立修复验证，不当作已关闭或风险接受；本地重点修复通过不代表这些写路径可用。
- CI 明确包含 secrets、SAST、SCA 和生产镜像扫描；本轮未执行或复用为当前候选 PASS。必要的正式 source/image 证据及目标 CPU/platform、不可变镜像 tag/digest 尚缺，阻断发布候选/部署就绪。
- Reviews 生产索引/维护窗口策略仍需实际授权；远端迁移演练、真实飞书登录、角色边界、回滚、目标域名浏览器验收均未执行。
- 先处理上述当前候选缺陷及合同，再准备“具体 commit + 具体环境 + 迁移/回滚操作”的授权请求；本轮不申请抽象 Gate 放行，也不以权限为由停下已经授权的本地工作。

## 状态与环境真相

| 项目 | 准确状态 |
| --- | --- |
| 本轮代码 | CODE_IMPLEMENTED，产品 checkpoint 已保存 |
| 本轮本地验证 | LOCAL_VERIFIED（本次修复范围）；不代表完整候选发布就绪 |
| staging 精确 URL / runtime commit / 用户路径 | 未指定、未访问、未部署、未验证 |
| production | 未改变；https://timeline.all-too-well.com 未访问，runtime commit 未读取，用户路径未验证 |
| main | 未改变，原 main HEAD 41b4b166c587692e6f0fb9536dca2e1aab646c70 |
| tag / push | 未执行、未改变 |
| 产品负责人 | 未确认，AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 路由/产品验收 | 无远端路由验收；本轮未声称整组产品页面完成，未新增 UI 路由 |
| 发布候选 | 本地修复 checkpoint 可复现；尚不具备 staging/production 发布就绪结论 |

本轮创建的三个临时 PostgreSQL/Redis 容器已关闭并移除，临时 Web/API 进程已退出；只清理本轮测试资源。日志、截图、网络摘要和原补丁保留，未修改其他工作树的未知文件。
