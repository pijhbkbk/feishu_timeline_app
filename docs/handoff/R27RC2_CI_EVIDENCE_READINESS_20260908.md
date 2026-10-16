# R27RC2 CI 证据就绪回执

日期：2026-09-08（Asia/Shanghai）。依据：所有者明确转交的《R27RC2：补齐管理可见性并完成 CI 证据输出》。**本地补丁、定向验证、独立复核和候选提交已完成；管理设置仍待现有身份，远端执行未获授权、未执行。**

## 1. 现场与精确候选

| 项目 | 本轮结果 |
|---|---|
| 工作树 | `/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair` |
| 本地分支 | `security/r27rc2-candidate-repair` |
| 起点 evidence HEAD | `7922fca317c473c9fd26ca582984bfb9f5e20ae1`；开始时索引与工作树干净 |
| 原 source commit / tree | `314b6523259a6f646915debccc85a2226ba40c79` / `f2953a484f0fcd145590088a6e42707b45863940` |
| **新 CI source candidate** | **`5a388095726d1b53fe79e379e1f3665d4a310a5d`** |
| **新 candidate tree** | **`608f69ba5aacbb5e67359eabe2a62752424c05ba`** |
| pnpm-lock.yaml SHA-256 | `9186715db8a3fb724b2d856067bb69f320204beb4027b8672a0f2b263503d962`，未变 |
| 未来拟用 ref | `refs/heads/codex/r27rc2-artifact-validation`，本轮未创建 |
| 远端仓库 | `https://github.com/pijhbkbk/feishu_timeline_app.git`；按上轮已确认的公开个人仓库处理，未改变可见性 |

新 source commit 只包含四文件：`.github/workflows/ci.yml`、`scripts/security/run-sca.sh`、新增 `scripts/security/ci-evidence.mjs` 与对应 `scripts/security/tests/ci-evidence.test.mjs`。相对原 314b6523，另有此前 evidence commit 的两份文档；应用代码、依赖/锁文件、Prisma schema/migrations、基础镜像引用和 Finding Ledger 均未改变。本回执与执行记录在后续独立 evidence commit 保存，不回写 source candidate 身份。只显式暂存本轮文件；本地提交禁用 hooks，避免扩大执行范围。

前轮四份未提交只读回执/查询/工作流副本保留在 `test-results/r27rc2/release-artifact-preparation-20260907/`，未删除、覆盖、暂存或提交。本轮索引保存其当前摘要；未重新盘点全部历史证据。

## 2. 定向只读观察与管理缺口

2026-09-08 04:47:44 UTC 精确查询：远端默认分支和 main 仍为 `41b4b166c587692e6f0fb9536dca2e1aab646c70`；拟用 ref 当时不存在。没有 fetch、push 或远端 ref 修改。未来执行须再次核实，不能据此覆盖竞态，也不得强制覆盖后来出现的分支。

本轮内置浏览器打开该仓库 `/settings/hooks`，页面为 404 并显示 Sign in，未取得已认证管理设置。已邀请所有者自行完成现有账号登录或给出最小脱敏摘录；截至本回执未收到完成通知。未提取凭据、未尝试扩大 scope、未重复匿名探测受限设置。以下继承事实标记为上轮观察，不能当作本轮实时管理读取：rulesets/ref rules 为空、environments 为 0、ci 工作流 active；hooks、Actions policies、runner、main 旧保护、保存期等匿名请求为 401，安装清单不完整。

| 最少所需证据 | 当前分类与影响 |
|---|---|
| Repository Webhooks：活动状态、create/push/workflow_run 等订阅事件、接收系统类别；相关服务的分支过滤（仅实际关联时） | **发布/执行前必须补齐**：未知首次分支发布或 CI 完成是否触发范围外动作；不访问回调、不测试投递 |
| 获准访问此仓库的 Installed GitHub Apps / 外部 CI：用途、必要权限、事件及实际分支约束 | **发布/执行前必须补齐**：清单本身不能证明服务端过滤；无法读取的规则需所有者提供脱敏证据 |
| Actions General：是否启用、允许的 Actions、token 默认权限、日志与 artifact 保存限制 | **配置/证据待办**：可能导致固定 Action 不允许运行或 7 天留存不被接受；不据此推定外部部署。候选显式权限仍为 contents:read |
| 候选验证分支适用规则与实际标准 runner 可用性 | **执行前核实相关规则**：静态选择 ubuntu-latest，初始化校验实际 github-hosted Linux x64 + Docker linux/amd64。无关自托管 runner 的存在不自动阻断 |
| main 旧保护、无关 runner / 环境清单 | 本次无 main 写入/部署；不要求为这些无关项重复完整审计。默认分支或关联配置有变化时仅重评受影响链路 |

所需入口只限本仓库 Webhooks、其关联 GitHub Apps/外部 CI、Actions 设置、适用规则。由所有者操作登录、密码和二次验证；脱敏摘录须注明仓库、来源页面与观察时间，届时标为所有者证据而非代理实时 API 读取。

## 3. 已实现的报告输出

保留 verify、security-source、原触发器及 dispatch-only 的 playwright-smoke；普通候选 push 不扩展 Playwright 或部署。保留现有 Action 固定 SHA、checkout `persist-credentials:false` 与 `contents:read`，未增加 packages/security-events/OIDC 权限。

新增结束路径采集及官方 upload-artifact 固定引用：`actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`。2026-09-08 04:47:49 UTC 从官方仓库解析 v7，04:49:30 UTC 读取该 SHA 的 `action.yml`；确认 Node24 与所用输入兼容。Action 定义及查询记录已保存。静态兼容性不等于真实 runner 已运行。

两个 artifact 拟命名为 `ci-evidence-verify-${run_id}-${run_attempt}`、`ci-evidence-security-source-${run_id}-${run_attempt}`，请求保存 **7 天**，禁止覆盖、不包含隐藏文件，文件缺失时报错。实际保存期仍受仓库限制约束。**目前仅写入工作流配置，没有上传。**

精确上传白名单如下（没有通配符）：

| artifact | 文件路径 |
|---|---|
| verify | `reports/ci-public/verify/metadata.json` |
| verify | `reports/ci-public/verify/checks.json` |
| verify | `reports/ci-public/verify/production-build.json` |
| verify | `reports/ci-public/verify/image-api.json` |
| verify | `reports/ci-public/verify/image-web.json` |
| security-source | `reports/ci-public/security-source/metadata.json` |
| security-source | `reports/ci-public/security-source/checks.json` |
| security-source | `reports/ci-public/security-source/gitleaks-current.json` |
| security-source | `reports/ci-public/security-source/gitleaks-history.json` |
| security-source | `reports/ci-public/security-source/semgrep.json` |
| security-source | `reports/ci-public/security-source/sca-all.json` |
| security-source | `reports/ci-public/security-source/sca-production.json` |

上传副本明确标记 `REDACTED_FIELD_PROJECTION`，按字段投影，不冒称原始报告：

- 身份：完整 commit/tree、锁文件摘要、run/attempt/job、构建 release/time、runner OS/架构/kernel/ImageOS/ImageVersion、Docker/build 平台、Node/pnpm/扫描器版本与观察时间。
- 检查：允许的 step outcome、PASS/FINDINGS/TOOL_ERROR/NOT_EXECUTED/REPORT_MISSING（构建另有 CHECK_FAILED）、报告存在性/时间/原始摘要、真实 finding 数与条目。缺失/跳过使用 null，不伪造零条目；工具错误与发现问题可通过状态及 findings 同时辨识。
- Gitleaks：每个 finding 的 ruleId、允许的已跟踪源码位置/行号、完整历史 commit；不包含 Secret、Match、作者或邮箱。
- Semgrep：每个 finding 的 ruleId、位置、severity、metadataSeverity、规范化的两个 security severity 信号及 effectiveSeverity，另有工具错误数量/可得版本；不含代码片段、说明、任意 metadata 或内部 URL。
- SCA/Trivy：逐条漏洞/公告标识、包名、版本/修复范围、严重度、audit 原始严重度计数和出现次数；Trivy 保留 targetIndex。完整依赖路径、目标 URL、镜像配置/环境、自由说明均不上传。

输入只读取固定路径，拒绝路径穿越、符号链接/硬链接、非普通文件、超过 20MiB 输入及旧输出目录；危险输入不产生 ready 信号。只有完整安全白名单写成后才设置 ready，因此失败时仍可留下安全的已有报告/缺失说明。原扫描退出码保留，采集不完整也非零；上传成功不会改写为扫描通过。取消/runner 被终止时只能尽力，不能保证一定留有 artifact。

公开仓库 artifact **不是私密存储**：下载通常要求 GitHub 登录且具有仓库读取权限，但公开仓库的可读取人群不能视为内部名单。上述路径、包版本、安全 finding、源码/历史定位和运行元数据的可见性仍需所有者明确决定。原始日志、环境文件、备份、附件、完整 Git 数据、原始敏感扫描内容不在新增 artifact 内；既有 CI 日志和 pnpm cache 是另行列明的副作用，新增投影不能保证历史脚本控制台永不打印敏感内容。

## 4. 运行身份、平台及如实保留的证据缺口

复用 `scripts/deploy/release-identity.mjs` 的已有 build identity 合同。初始化以实际 HEAD/tree、事件 SHA 和锁文件绑定输入，记录开始时已跟踪工作树是否干净；采集再次核对 HEAD/tree 和锁文件。该记录是运行证据，不是新的签名 attestation 或外部信任根。

API/Web 构建均显式 `--platform linux/amd64`；仅为本次非生产 CI，未决定生产平台。ubuntu-latest 仍是浮动 runner，记录实际版本不等于每次完全可复现。该流程未配置实库测试服务/参数：记录 `databaseTests.execution=NOT_VERIFIED_BY_THIS_ARTIFACT`、各步骤 outcome；业务测试是否跳过特定实库用例需看该次测试日志，不能把 Test 绿色写成 1,320 项实库并发用例全部重跑。

版本采集在未来扫描步骤后只对已有固定扫描器镜像执行 `--pull=never --network=none` 版本探测；Trivy 仅在现有缓存卷存在时只读挂载并读 `version --format json`。本轮没有实际执行这些容器探测。无法读到实际版本则记录 null/缺口。

仍明确保留：

- Semgrep 的有效动态规则内容摘要不可从现有扫描 JSON 取得；记录三项真实配置源 `p/owasp-top-ten`、`p/javascript`、`p/typescript`，有效摘要 null。Gitleaks 本地规则文件摘要可记录。
- Trivy 记录采集时可得的 DB UpdatedAt/NextUpdate/DownloadedAt；**不是逐镜像扫描时 DB 绑定**，没有已批准的最大库龄，不能宣称“最新”或通过新鲜度门禁。
- 固定扫描器镜像声明、可得版本不代替实际六角色镜像集合及 registry/runtime digest；公开 JSON 未形成精确被扫镜像 ID 的部署 manifest。API/Web 本地构建扫描也不代表其他四角色、Web 预发构建参数或真实目标平台已就绪。
- `releaseReadiness=NOT_ESTABLISHED`；`collectedChecksPassed` 只表示已采集的有限检查通过，不关闭上述发布缺口。

2026-09-08 04:55:16 UTC 仅查询公开 manifest（没有拉取镜像层），两项均 exit 1，错误为 `manifest verification failed for digest sha256:…`：

| 保留引用 | 结论 |
|---|---|
| `node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43` | 此读取方式未能验证 manifest，linux/amd64 可用性未证实；未来 API/Web build 可能因此阻塞 |
| `postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777` | 同上；本次 verify 不启动该数据库，也不因此假定后续演练可运行 |

未更换 digest、退回浮动 tag 或升级运行时；错误不足以判定镜像不存在。原始错误及引用在本轮索引内。

## 5. 本地验证与独立复核

| 检查 | 真实结果 |
|---|---|
| `node --test scripts/security/tests/ci-evidence.test.mjs` | 最终 **20/20 PASS**；成功、finding/敏感字段、失败、工具错误、缺失、过期、跳过、非法路径/链接、锁文件变更、ready/退出码、SCA JSON/stderr 和 workflow 边界 |
| `bash scripts/security/tests/security-gates.test.sh` | **PASS**，受影响安全脚本合成回归 |
| Node 语法、`bash -n`、`git diff --check` | **PASS** |
| 已有 js-yaml 解析、静态条件/step id/trigger/permission/白名单、固定 Action inputs 检查 | **PASS**；没有 actionlint/实际 GitHub 表达式引擎执行 |
| 已有 ESLint 的 no-undef/no-unused-vars 定向检查 | **0 errors / 0 warnings**；第一次检查脚本写错 pnpm 包目录，改用已有包解析后通过，未安装依赖 |
| 独立只读上下文 `/root/ci_diff_review` | **G4_DIFF PASS**。首轮发现 Semgrep 安全严重度信号遗漏 P2，修复后复核；其独立执行首轮17项及最终新增3项均通过。不是人类/组织批准 |
| 提交绑定 | 四文件最终 SHA-256 与测试/独立复核一致，提交后逐项核对 PASS；锁文件未变 |
| Placeholder | raw 10，均为已有测试负向断言或 getByPlaceholder；排除这些明确测试后正式源码 0 |

没有运行真实远端扫描、pnpm registry audit、镜像 build/pull/scan、数据库、迁移或浏览器产品验收。本轮使用 Node 24.14.0、pnpm 9.15.4、已有 js-yaml 5.2.2 / ESLint 10.8.0。未安装新工具。既有业务代码/依赖/迁移未变，因此此前业务验证仅按其原绑定复用，没有把旧 PASS 冒称本轮全量重跑；本地合成结果不代表真实 GitHub runner 成功。

## 6. 后续执行范围草案与所有者决定

**尚不提出可立即执行的合并授权请求。** 关键 hooks/Apps 触发链未读到，公开候选/历史和 artifact 可见性也未获明确批准；不能沿用原 314b6523 请求作为新候选授权。本节只是集中列明将来可审阅的具体范围，不表示本轮获准执行。

待条件满足时，拟限定为：只向上述公开仓库的 `refs/heads/codex/r27rc2-artifact-validation` 发布精确 source commit `5a388095726d1b53fe79e379e1f3665d4a310a5d`，不推本报告的后续 evidence HEAD、不 force、不改 main/tag；依 push 事件仅运行 verify 与 security-source，并读取该 commit 对应 run/jobs、日志及两个白名单 artifact。预期 playwright-smoke 为 skipped；不额外 dispatch/rerun。实际 run ID 尚不存在，后续结果取回必须用仓库 + 完整 head SHA + event + run/attempt 绑定，并核对文件内容、状态与摘要，不能只报告绿色。

该未来步骤涉及以下完整网络/存储范围，必须作为一次受限请求整体审阅：

1. 公开候选源代码及推送该 commit 所需的可达 Git 历史（不等于只公开四文件）；远端 create/push 事件可能通知现有 hooks/Apps，其范围仍待证据。
2. GitHub 托管 runner 获取源代码/必要完整历史、固定 Actions、Node/pnpm 和依赖包；安装生命周期脚本按既有流程执行；setup-node 的 pnpm 缓存读写和 GitHub CI 日志保存继续存在。
3. Secrets/SAST/SCA 及 API/Web 构建：固定扫描器/基础镜像下载、Semgrep 动态规则获取（现有扫描命令已指定 `--disable-version-check --metrics=off`）、Trivy 漏洞库获取、pnpm audit 向 registry 提交依赖审计清单。没有把这些网络传输称为纯只读核查或只用“扫描”概括。
4. Runner 本地生成两份 API/Web CI 镜像、扫描报告和 Trivy 缓存；无 registry 登录、push、远端镜像导出、SARIF/security-events 上传或部署。新增版本探测只读本地已有镜像/库，关闭网络与拉取。
5. GitHub 保存既有日志/cache，加上上述12份脱敏 JSON组成的两个 artifact，请求7天；其中仍包含安全问题、源码路径和包版本信息。结果下载到本地证据目录属于后续结果取回范围，当前未执行。
6. Workflow 完成事件也可能被外部服务订阅；只有实际关联服务的事件/分支过滤可接受，才可把触发链视为已核实。安装清单或空 deployments 不能代替这一证明。

所有者仍需明确：是否同意将这份精确候选及必要历史发布到当前公开仓库；是否同意报告字段、可见范围及7天方案；提供现有管理身份或相关脱敏过滤证据。若某项必要证据不适合公开，应先决定受限目的地；本轮没有擅建私有仓库或外部存储。基础镜像可用性失败及规则/库证据缺口也须在未来执行请求中保留，不能借一次 CI 成功视为已解决。

恢复控制器、Reviews 生产索引策略、真实预发/生产环境、Web 预发构建参数、飞书与产品负责人验收继续独立待办；未作为本地补丁前置，也未在本轮关闭。

## 7. 状态与本地证据入口

| 必答项 | 当前准确状态 |
|---|---|
| 代码是否实现 | 本轮 CI/report 补丁 CODE_IMPLEMENTED；应用未改 |
| 本地测试是否通过 | 定向/受影响验证 LOCAL_VERIFIED；真实 CI 未执行 |
| staging 精确 URL | 本轮未指定、未访问、未部署；不能用 localhost 代替 |
| staging runtime commit | 未读取/未验证 |
| staging 用户路径 | 未执行 |
| production 是否改变 | 本轮未改变、未访问、未部署 |
| production runtime commit | 未读取/未验证 |
| production 用户路径 | 未执行；未访问 `https://timeline.all-too-well.com` |
| main 是否改变 | 本轮未改变；远端只读观察值见第2节 |
| tag 是否改变 | 本轮未改变 |
| 产品负责人是否确认 | 未取得 PRODUCT_OWNER_ACCEPTED；AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 未完成路由 | 本轮无路由变更；未进行产品路由验收，不推断历史路由全部通过 |
| Placeholder 数量 | 10 raw / 0 正式源码，测试白名单见索引 |
| 当前准确状态 | CI_PATCH_LOCAL_VERIFIED / G4_DIFF_PASS / MANAGEMENT_VISIBILITY_PENDING / CI_NOT_EXECUTED / NOT_DEPLOYED |

必要产物统一保存在 `test-results/r27rc2/ci-evidence-readiness-20260908/`，未纳入 Git：以 `evidence-index.json` 为入口，记录 source SHA/tree/lock、四文件摘要、测试/静态检查、独立复核、refs、官方 Action定义、manifest错误和前轮四文件保护摘要。它只是本地证据索引，不是 runtime/OCI manifest，不包含真实运行扫描结果或秘密。主回执是本文件，执行 Ledger 只增加简短入口。

参考：[固定官方 Action 定义](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/action.yml)、[GitHub artifact 下载与访问要求](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)、[GitHub 标准托管 runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、[Trivy version JSON 参数](https://trivy.dev/docs/latest/references/configuration/cli/trivy_version/)。
