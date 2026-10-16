# R27RC2 发布制品准备回执（2026-09-07）

本轮已完成当前离线权限下可执行的扫描、合成旧数据升级/恢复演练和扫描报告修复。**尚未形成可部署镜像候选**：目标平台没有批准依据，固定 Node 基础镜像缺失，正式 SAST/SCA/镜像证据和预发布环境仍需外部输入。

## 身份与保护

- 工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`；分支 `security/r27rc2-candidate-repair`。
- 实际起点：`c7054a7d2511d71ffbef7e05268758cc2ee74110`，tree `b3883d0db2a4f915a0fbdde58bcf9dcf39cc34f8`，干净。相对产品 checkpoint `c37f8103e5be35cb951ab3f022ffee80add6038e` 仅有三份证据文档变化，已核对实际 diff。
- 本轮工具修复及后续候选源码输入：`314b6523259a6f646915debccc85a2226ba40c79`，tree `f2953a484f0fcd145590088a6e42707b45863940`。只改 `scripts/security/run-secrets-scan.sh` 和其现有回归测试；应用 checkpoint 仍为上述 c37f8103。
- 本回执及执行记录随后单独作为 evidence commit。应用、schema、36 个 migration、锁文件、CI、Dockerfile、治理规则及全部 Finding 原文未变。证据提交不重新定义运行制品身份。
- 两条新增 Finding 仍是 `fixed_diff_verified`，绑定 c37f8103，full verification pending、closure null；原七条历史记录未动。未接受风险或宣称 closed/G4_FULL。

## 实际检查与缺口

| 检查 | 实际结果与边界 |
| --- | --- |
| Gitleaks | 已执行仓库正式扫描入口；native 8.30.1，当前源码和完整本地历史均 PASS，最终扫描 267 commits。扫描对象为干净 314b6523，实际输入快照另有 SHA-256。此为本机执行结果，不声称远端 CI 已跑。 |
| Trivy 锁文件预检 | 本机已有固定 0.72.0 镜像，断网、只读漏洞库；生产图及包含开发依赖的图均无条目。漏洞库 UpdatedAt=2026-08-21T07:04:30Z、NextUpdate=08-22，已超过更新日期；这是旧库预检，不替代正式 pnpm audit 或镜像扫描。 |
| 现有安全门禁回归 | PASS，包含扫描失败/浅历史/真实 finding 不得通过，以及新增 runner、基线和输入快照摘要断言。 |
| Compose 示例解析 | `config --quiet` PASS；只证明配置语法，未启动 staging。 |
| SAST | 未执行。Semgrep 1.169.0 本机无 native/固定镜像，入口还需获取 `p/owasp-top-ten`、`p/javascript`、`p/typescript` 规则；未下载、未用 grep 替代。 |
| 正式 SCA | 未执行。现有入口分别运行全依赖与生产依赖 `pnpm audit --audit-level low` / `--prod`，需要 registry 通信；未获本轮联网权限。 |
| 当前候选镜像构建、启动、浏览器与扫描 | 未执行。固定 Node 基底本地 inspect 返回 No such image，且目标 CPU/platform 未知；未用旧镜像、开发服务器或开发机架构冒充。 |
| 既有应用验证 | 应用/shared/依赖/构建与 CI 配置未变，复用 c37f8103 上 API 1320、manifest 18、HTTP 29、构建及更早未变 Web 的对应结果；前轮证据索引的 27 个文件重新核验。不是本轮真实镜像运行证明。 |

报告脚本的实际缺陷是 native 执行仍标成 Docker 且只输出短 commit。本轮修正真实 runner、完整 HEAD 基线、工作树状态、**实际复制输入的逐文件摘要和整体摘要**，并指向实际报告目录。HEAD tree 不再冒充 dirty/untracked 输入的准确树身份；扫描范围、阈值及失败门禁未削弱。

最终当前树扫描快照 SHA-256：`93c659459f2c9edfa4d2bf09e9c2e2e621d3fa2ad2bc2b2709cc0b8b1e2dd173`。原错误摘要与初始扫描日志保留，新提交上已真实重跑。固定 Node 输入缺失值为 `node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`。

## 合成旧数据升级与恢复

使用本机已有 PostgreSQL 16.14 和 API-ops 内 Prisma 6.19.3 工具，在专用 `--network none` 容器中执行。ops 的 Node 为 24.19.0、linux/arm64，是**既有迁移工具**，不是本轮构建的应用镜像或已批准目标平台。所有数据库和对象均为本轮合成资料，无真实快照或凭据。

实际流程：当前原 migration 前缀 **26 → 27 → 36**，通过 Prisma migrate deploy 应用，未改历史 SQL。前 26 项末尾为 `20260806083000_add_project_marketing_unit_and_paint_supplier`；创建合成项目、用户/角色/权限、审计、保存视图、两版附件。第 27 项验证旧附件默认 LEGACY_UNSCANNED，再加入 CLEAN/PENDING_SCAN/REJECTED/SCAN_ERROR 四种合成附件。

升至 36 项后逐项验证六条附件的 quota 回填、软删除版本、状态原因码、大小、key、时间和所属关系；旧项目/附件/角色/审计整行不变，保存视图 configBytes 为 null 保持隔离；迁移名/checksum/finished 状态一致，再次 deploy 无待应用迁移。初始夹具错误假定 purchaser 由旧迁移创建，改用实际存在的 auditor 后继续，失败记录保留，未改产品迁移。

使用现有 R25 流程中的 `pg_dump --format=custom --no-owner --no-privileges`、catalog 检查和 `pg_restore --exit-on-error`，分别将升级前 27 项、升级后 36 项备份恢复到两个新空库。比较关键表完整内容和迁移记录；升级库/恢复库的唯一键、外键、CHECK 和显式只读 SQL 角色拒绝写入均有真实执行结果。六个对象另行复制恢复并比对文件 SHA-256、附件版本和数据库 checksum。

| 本机制品 | 字节数 | SHA-256 |
| --- | --- | --- |
| synthetic-before-upgrade-27.dump | 215279 | `3adf50e9fe4cd51bfa9ed2e15d3b59bd33fc85f7793847fb94a9bbbffd272489` |
| synthetic-after-upgrade-36.dump | 237300 | `33e43bdd82c21bebb1fa3b675cff5fb53c098e6cfcb94b26eac982a45362442c` |

以上只能证明这个历史迁移前缀与合成数据的升级/恢复。原始 owner/ACL 未包含在 dump，测试角色授权明确重建；生产角色、配置、数据库与对象的一致快照仍待方案。篡改用例仅证明修改字节使摘要不同，**未验证某个恢复入口会拒绝它**；独立审查后的澄清结果绑定原结果摘要，原运行记录未改写。不能以此证明外部控制器验收、生产锁时长或撤回镜像即可撤销数据库变化。

`restore_to_gcp.sh` 本轮实际执行仍退出 78；activation/rollback 等入口保持禁用。没有发现符合当前要求且已获批准的外部 root-owned、digest-bound 恢复控制器，不调用旧备份脚本去读取 staging、系统配置或真实数据。

## 下一步的具体方案与请求（尚未授权执行）

建议先做**受限远端只读核查**，再决定是否发布验证分支。候选源码固定为 `314b6523259a6f646915debccc85a2226ba40c79`；本地配置中的 origin 为 `https://github.com/pijhbkbk/feishu_timeline_app.git`，未查询其当前状态。拟用分支 `refs/heads/codex/r27rc2-artifact-validation`，当前是否存在未知，不声称可 fast-forward。

1. 首先请求只读核对远端分支、默认分支 workflow/workflow_run、required workflows/rulesets、Actions 权限、webhooks/GitHub Apps/托管服务的分支过滤与自动部署行为；不读取 secret 值。有效本地 pre-push hook 不存在，未执行 hook。未证明无自动部署副作用之前不 push。
2. 核查成立后，再授权上述完整提交到拟定非生产分支的非强制 push，以及读取这次 CI 结果。若目标已存在且不匹配则停；不 force-push、改 main/tag、手动 dispatch、上传镜像或部署。上传范围是该提交可达的仓库 Git 对象；本机 test-results、dump、对象目录、Cookie、环境文件不上传。此动作会让 runner 下载依赖、镜像、Semgrep 规则、Trivy 数据库并向 registry 发送依赖审计信息，必须明确包含这部分联网权限。
3. 本地 ci.yml 的 push 匹配 `codex/**`，只触发 verify/security-source；Playwright 只在 workflow_dispatch 运行。当前文件未调用部署、迁移或镜像上传，顶层 contents:read；这些事实无法约束远端额外 workflow 或外部 webhook。
4. 当前 CI 没有报告 artifact/SARIF 持久保存步骤，且只 build/scan API 默认 runtime 与 Web，不包括 apiOps、PostgreSQL、Redis、Nginx。一次绿色 CI 不能补齐六镜像和完整证据。应另行明确报告保留机制、固定规则/漏洞库、目标平台及六镜像工作范围；本轮未增加新 Action、依赖或未经批准的安装。

预发布建议沿用现有 Docker Compose 六服务与同源 `/api` 合同，在**独立预发布资源**中运行，并使用独立数据库、Redis、对象存储和测试飞书应用。当前没有可据以批准的预发 URL/OS/CPU；主机平台不能从本机 arm64 或脚本兼容列表推定。所需最小输入为：环境标识及精确 HTTPS URL、主机 OS/CPU、registry/存储位置、执行身份、隔离数据范围、飞书应用与回调配置的受控提供方式（不在聊天粘贴秘密值）。现有 Web 约定为 `/api`、mock=false、v2/real；须在最终构建前确认。

Reviews 最后一个迁移是普通 CREATE INDEX。鉴于真实数据规模、写入负载与维护窗口未知，优先准备经过 DBA/所有者批准的在线建索引方案及 Prisma 状态衔接；不能静默修改已应用 migration，也不能拿此次小库耗时作生产依据。应用镜像回退与数据库/对象恢复必须分别授权和演练。

如选择在本机继续，需另行明确目标平台，并授权获取上述固定 Node 基底、现有 lockfile 对应依赖、固定 Semgrep 工具/规则及当前漏洞库和 registry 审计访问。本轮未发起这些下载或安装。

## 证据与最终边界

持久本机目录：`test-results/r27rc2/release-artifact-preparation-20260907/`，96 项文件已核验；原始日志/合成备份均未提交或上传。`evidence-index.json` SHA-256 为 `601956d666d1c769bef76c92310d076b75c564ea360afe328ffec86c11b0d95f`，审查记录摘要 `cc779c29f4deda8da5aeb2d82c80df81137b7385d2f62b64fd49e555ec65b6f6`。该索引是已有本机归档机制，不是 runtime/OCI/release manifest。

无新镜像，因此没有虚构 image ID、导出镜像 hash、registry digest 或六镜像 runtime manifest；目标 platform 保持 null。独立 `/root/independent_review` 对两文件小修复与演练证据复核 PASS，两个意见已处理；未重演旧锁审查，未冒充 G4_FULL 或组织批准。

本轮临时 PostgreSQL 和工具容器已清理，已有镜像及 Trivy 缓存未改。**没有远端动作、main/tag 变化、部署、真实飞书/用户路径执行或产品负责人验收**；staging/production URL 未访问，runtime commit 未读取。产品状态仍为 AWAITING_PRODUCT_OWNER_CONFIRMATION，完整制品/预发布就绪未建立。
