# R27RC2 第一次真实远端 CI 回执

日期：2026-09-08（Asia/Shanghai）。**已完成唯一验证分支的一次正常 push、由 push 自然触发的 attempt 1，以及两个正式 artifact 的取回与校验。CI 结论为 FAILURE；没有修复后重推、rerun、dispatch 或部署。**

## 1. 实际发布身份与唯一运行

| 项目 | 实际结果 |
|---|---|
| source SHA | `5a388095726d1b53fe79e379e1f3665d4a310a5d`，没有更换候选 |
| source tree | `608f69ba5aacbb5e67359eabe2a62752424c05ba` |
| 锁文件 SHA-256 | `9186715db8a3fb724b2d856067bb69f320204beb4027b8672a0f2b263503d962` |
| 目标公开仓库 | `pijhbkbk/feishu_timeline_app` |
| 唯一写入 ref | `refs/heads/codex/r27rc2-artifact-validation` |
| push | 2026-09-08 05:40:30–05:40:38 UTC；exit 0，new branch；正常非强制，未推 evidence HEAD |
| run | [34191540314 / ci #141](https://github.com/pijhbkbk/feishu_timeline_app/actions/runs/34191540314) |
| event / attempt | `push` / **1** |
| workflow | `.github/workflows/ci.yml`，唯一匹配 head SHA 的运行 |
| 开始 / 最终更新时间 | 05:40:41 / 05:44:21 UTC，历时3分40秒 |
| workflow conclusion | **failure** |

Final preflight 确认本地四文件与独立审查摘要一致，CI 未变，锁文件未变，工作树干净。实际本地 evidence HEAD 为 `0b54f81ee63193763004fdc00270f8414dc11a25`，相对候选只多两份证据文档；未将该 HEAD 推送。推送前远端 validation ref 不存在；推送使用临时 pre-push 守卫，只接受候选 SHA、指定 ref 和远端全零旧 SHA，因此若分支已出现则拒绝。未设置 force 或 follow-tags。

推送后只读核对 validation ref 正确；远端 main/default branch 保持 `41b4b166c587692e6f0fb9536dca2e1aab646c70`。没有 main、现有分支、tag、PR、release 或 merge 写入。本次仅保存回执和本地证据，不创建新的产品提交。

## 2. Node 基础镜像 final preflight

**原固定引用有效，无需改 Dockerfile：**

`node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`

2026-09-08 05:39:36 UTC 起，用系统现有 curl、正常 TLS 从 Docker 官方 registry 读取 index 与 linux/amd64 子 manifest，并独立计算返回字节 SHA-256：

- Index 字节摘要与固定 digest 完全一致。
- linux/amd64 子 manifest：`sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43`，读取与字节摘要校验通过。
- 没有拉取镜像层、运行容器、替换 digest 或使用浮动 tag 修复。本次真实 CI 后来因前置 Web 检查失败而未进入 Docker build，因此此处证明的是 manifest/平台读取前提，不是镜像已成功构建。

初次本机 Python 请求因本地 CA 链缺失失败，改用系统 curl 正常校验解决该客户端读取问题；这不证明上轮 Docker manifest 客户端失败的完整根因。沙箱内首次 Git DNS 失败后，按已授权网络范围读取成功；未关闭 TLS 或摘要校验。

PostgreSQL 继续为 `DEPLOYMENT_PREREQUISITE_PENDING`，未重查、未启动，不作为此次 CI 阻断。

## 3. 实际作业及正式扫描结果

| 作业 | job ID | 结论 |
|---|---|---|
| verify | `101950449813` | **failure**，2m23s |
| security-source | `101950449953` | **failure**，3m36s |
| playwright-smoke | `101950450988` | **skipped**，未分配 runner |

verify：checkout、依赖安装、lint、typecheck、Test、Build Web 成功。`Reject Development Build Artifacts` exit 1，可见日志原文：

> FAIL: development eval-source-map markers were found in production artifacts.

该日志未列具体产物路径；没有证据证明它是误报，未弱化检查或修改源码。Build API、Prisma Validate、Compose Config、API/Web Docker build、镜像扫描全部 **skipped**。

| 正式报告 | 状态 | findings / errors |
|---|---|---|
| Gitleaks 当前树 | PASS | 0 finding / 0 tool error |
| Gitleaks Git 历史 | PASS | 0 finding / 0 tool error |
| Semgrep | **TOOL_ERROR** | **4 findings，8 tool errors**；两类信号同时保留 |
| pnpm audit 全依赖 | **FINDINGS** | 2条中危公告，0 high/critical；0 tool error |
| pnpm audit 生产依赖 | **FINDINGS** | 同样2条中危公告，0 high/critical；0 tool error |
| Web 生产产物检查 | CHECK_FAILED | reportPresence=PRESENT；不是零 finding PASS |
| API / Web 镜像扫描 | NOT_EXECUTED | findingCount=null；不冒充零漏洞 |

Semgrep 1.169.0 的实际日志显示扫描661个候选文件；4条 finding 的规则严重度均为 `ERROR`（不是自行升级为 HIGH/CRITICAL）：

- `scripts/deploy/tests/security-hardening.test.sh:978`、`:1014`，两条 ruleId 在公开副本中为 `[REDACTED]`。
- `scripts/security/r24b-zap-orchestrator.mjs:222`、`:233`，ruleId 为 `typescript.react.security.react-insecure-request.react-insecure-request`。

公开副本保留了8个工具错误的数量，但不含自由文本明细；必要控制台日志也未显示其原因。**不能从现有证据确定这8个错误的根因，或将4条 finding 直接判成真阳性/误报。**

两条 SCA 公告都涉及 `qs 6.15.3`：`GHSA-x5fp-wj9c-mxmx` 与 `GHSA-4mjr-xmp4-gh2g`；报告给出的 patchedVersions 均为 `>=6.16.0`。每条记录8条依赖路径的数量，原始完整路径按白名单脱敏。全依赖/生产报告中的公告重叠，**不是4条不同漏洞**。本轮未修改依赖或执行修复。

两个 Collect 步骤均非零并保留 `collectedChecksPassed=false`；两个 Retain 步骤均 success。采集不完整/上游失败继续使检查失败，上传成功未改写扫描结论。12份文件均存在，无 `REPORT_MISSING` 状态；镜像报告明确为未执行。

## 4. 两个 artifact 已取回并核验

- **ci-evidence-verify-34191540314-1**：ID `10042419678`，5个 JSON；archive SHA-256 `b691ce7ebf623b8d1a0b51afcec679b82cd18dd477137e621cf1e58eafc44623`；created `2026-09-08T05:43:04Z`，expires `2026-09-15T05:43:03Z`。
- **ci-evidence-security-source-34191540314-1**：ID `10042446295`，7个 JSON；archive SHA-256 `055b28e31ed25ea9af23eb4dc749705b4f67cf52e7d8ba813e53ac10643f7e10`；created `2026-09-08T05:44:18Z`，expires `2026-09-15T05:44:17Z`。

下载通过现有已认证浏览器的该 run artifact 链接完成；没有复制凭据或访问令牌。两个 ZIP 字节摘要均与 GitHub REST 元数据及页面 digest 一致；archive 内无额外条目，恰为原白名单5+7份 JSON。每份 JSON 的本地摘要见 `verification-result.json`。

两份 metadata 的完整 commit/tree/lock、run ID/attempt/job 与实际 run/Jobs API 一致；所有记录的 step outcome 逐项与实际 job step conclusion 一致；hosted runner、平台匹配，验证错误为0。未将已有本地合成报告混作这次运行产物。

12文件为：verify 的 `metadata.json`、`checks.json`、`production-build.json`、`image-api.json`、`image-web.json`；security-source 的 `metadata.json`、`checks.json`、`gitleaks-current.json`、`gitleaks-history.json`、`semgrep.json`、`sca-all.json`、`sca-production.json`。原始 ZIP 和解析出的 JSON 都在本地结果目录。

Artifact 实际到期时间符合7天方案。普通日志保持已核实的90天仓库规则；pnpm cache 不属7天 artifact 保存期。本次日志显示两个 Post Setup Node.js 均 skipped，不能声称失败运行实际完成了 cache save；具体步骤状态已保存。

必要失败日志通过已认证作业页面的可见 DOM 取得，包含 Web 检查、SAST、SCA 和两个采集步骤，保存在 `necessary-log-excerpts.json`，附每段 job/step URL。**完整日志归档与 raw-log 下载路由被浏览器客户端阻止，未取得全量原始日志 ZIP。** 没有绕过客户端限制或无限重复；回执只声称已保存必要可见日志摘录。该限制和 Semgrep 错误明细缺失一并保留。

## 5. 实际 runner、平台与工具身份

两个实际 runner 分别为 `GitHub Actions 1000000252`（verify）和 `GitHub Actions 1000000253`（security-source），runner group `GitHub Actions`，label `ubuntu-latest`。两份 artifact 记录一致：

- OS `linux`、architecture `x64`、environment `github-hosted`。
- ImageOS `ubuntu24`；ImageVersion `20260831.293.1`；kernel `6.17.0-1022-azure`。
- Docker server `28.0.4`，daemon/platform `linux/amd64`，计划 build platform `linux/amd64`。
- 实际 setup-node `v24.20.0`；pnpm `9.15.4`；release `ci-34191540314-1`。
- Gitleaks observed `v8.30.1`；Semgrep observed `1.169.0`。Trivy 未执行，observedVersion 和库时间均 null。

数据库测试字段为 `NOT_VERIFIED_BY_THIS_ARTIFACT`，workflow 没有 provision 数据库；Test step success 不证明所有实库并发用例运行。动态 Semgrep 有效规则摘要、逐镜像漏洞库绑定和新鲜度仍未建立。Node20 Action 兼容性警告已由 GitHub annotations 返回：两个旧 Action runtime 被强制用 Node24；它是观察到的 warning，本轮没有归因为上述扫描或产物失败，也未改 Action。

## 6. 外部副作用与最终结束点

复用所有者已接受的 `VERCEL_ASSOCIATED_PROJECT=NONE_OBSERVED_IN_AUTHORIZED_VISIBLE_SCOPE`，未重新调查 Vercel/GitHub 管理设置。

最终按完整 head SHA 查询：只有这1个 `.github/workflows/ci.yml` push run、3个预期 GitHub Actions checks，deployment 记录为0；未观察到 Vercel check/deployment、其他 workflow/job 或 head SHA 不一致。该结论限于本次获准可见元数据，不外推整个互联网。没有出现需要制造第二个事件排查的情况。

实际产生的批准副作用：候选及必要 Git 历史公开、runner checkout/依赖安装/安全扫描网络访问、job日志和状态、两个脱敏 artifact。Docker build/Trivy 扫描因为前置失败没有执行。没有 registry push/package/SARIF/security-events 上传，没有 GitHub/Vercel 设置变化、SSH、数据库操作或云主机操作。

**当前 release readiness：FIRST_REMOTE_CI_FAILED / RELEASE_NOT_READY / NOT_DEPLOYED。** 下一步针对本次真实失败处理：

1. 复现并定位 Web 生产产物检查命中的实际文件与标记；保留失败断言，不先假定误报。
2. 查明 Semgrep 8个工具错误并逐条核实4个 finding；当前公开证据不足以完成根因与真伪分类。
3. 处理 qs 两条中危依赖公告并验证受影响依赖图。
4. 修复经本地验证/审查后，需要另行获准的后续 CI 才能补齐本次 skipped 的 API/build/image 证据；本轮不自动重跑或再次 push。

既有六角色制品、生产平台、PostgreSQL/Redis/Nginx、恢复控制器、Reviews 索引策略、staging/真实飞书/UAT/负责人确认仍未解决；不在本轮扩建调查或部署。

staging/production 未访问、未部署，精确URL、runtime commit、用户路径本轮均未验证；main/tag 未改变；产品状态仍为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。本轮无应用或路由修改，未重跑 Placeholder 扫描，上一轮正式源码0只是历史记录。候选保持原本 CODE_IMPLEMENTED / LOCAL_VERIFIED 的绑定，本次新增真实 CI_FAILURE，不能称为远端验收通过。

## 7. 唯一本地结果入口

`test-results/r27rc2/first-remote-ci-20260908/evidence-index.json` 索引原始2个 ZIP、12个 JSON、运行/作业/步骤/检查/部署元数据、Node index/amd64 manifest、推送前后身份、必要日志摘录和校验结果。原始下载还保留在所有者 Downloads；未上传本地未跟踪报告、备份、附件或环境文件。原有回执和证据均未覆盖。

本文件为本轮唯一主回执，执行 Ledger 仅追加入口。到此停止第一次远端 CI 任务，不进入 staging/production，也不自动修复并再触发。
