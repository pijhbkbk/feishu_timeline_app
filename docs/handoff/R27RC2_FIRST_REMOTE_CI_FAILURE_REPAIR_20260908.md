# R27RC2 首次远端 CI 失败修复主回执

本轮范围：`R27RC2_FIRST_REMOTE_CI_FAILURE_REPAIR_BATCH`。工作树 `/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`，分支 `security/r27rc2-candidate-repair`。只进行获准的本地修复、下载、隔离测试/构建/扫描、独立审查与提交。未作第二次 push、CI 事件、部署或设置修改。

最终 source candidate：`84a153884bea9d59ec56ef4e6ce3ada4b2144854`；tree：`1647b6b00922bda0a39211f95070c65985ee20db`；锁文件 SHA-256：`5e7450da9c82bfe96390a9be4198ebc784e5e858e17c5fc5ed71ce33713e3f2c`。`c216bd8938db81239f07738cf343917ae8dd8ca2` 是本轮修复 checkpoint，随后只修正新增 standalone 测试的明确预期身份输入；不能用它替代最终候选。

Evidence HEAD：见本地结果索引的 `evidenceHead`（本报告及Ledger的文档提交；提交后写入索引，避免自引用哈希）。源候选不含本轮本地报告、原始日志、test-results 或环境文件。结果索引：`test-results/r27rc2/first-ci-failure-repair-20260908/evidence-index.json`。

## 失败基线与证据保护

首次 GitHub [run 34191540314](https://github.com/pijhbkbk/feishu_timeline_app/actions/runs/34191540314)，attempt 1、event push、source `5a388095726d1b53fe79e379e1f3665d4a310a5d`、tree `608f69ba5aacbb5e67359eabe2a62752424c05ba`。实际 verify/security-source failure；playwright-smoke skipped。框架 Web build 成功，后置产物检查失败；API/Docker/image scan 等后续 verify steps 当时未执行。两个 artifact、12 JSON 已取得，不把 JSON 存在当作未运行检查通过。

复用了上轮主回执、29 个索引文件、12 JSON 与必要 step 摘录；29 个原始 SHA-256 全部重新校验未变。原主回执及已有 ledger 补丁保留。没有重复下载受阻的完整日志 ZIP，没有重查 GitHub/Vercel 管理页。原 Semgrep 投影未含具体错误详情，本轮用相同固定版本及源码等价输入复现了四命中/八错误；没有冒称取到了 attempt 1 的旧动态规则快照。

## 三组修复与验证

| 方向 | 真实原因与修改 | 最终证据与状态 |
|---|---|---|
| Web | 完整 find 扫描命中 standalone 中 Next 15.5.21 的 `dist/build/webpack/config/blocks/base.js` 与 `plugins/eval-source-map-dev-tool-plugin.js`；原 rg 跳过隐藏 `.pnpm`，因此本地误通过。Next trace 从开发入口引入了这两个不用于 production 的工具。仅从 `next-server` trace 排除 `next-dev-server.js` 和 `setup-dev-bundler.js`；检查器完整扫描包括隐藏依赖/server/maps，枚举或读取错误仍 exit 2。 | 最终锁文件真实 production build、完整产物检查、正常/违规/工具错误回归通过；带最终 SHA/tree 的 standalone 在无父 node_modules 回退目录通过 `/build-info` 四字段、login/projects 和全部页面 script 资源验证。 |
| SAST findings | 原两条 `generic.secrets.security.detected-username-and-password-in-uri.detected-username-and-password-in-uri`，位于 security-hardening.test.sh 原978/1014行，为不发起连接的合成静态验证输入；另两条 `typescript.react.security.react-insecure-request.react-insecure-request`，位于 r24b-zap-orchestrator.mjs 原222/233行，为无凭据的固定127.0.0.1回环探测。四条原规则 severity 都是 ERROR，不等于四个独立高危漏洞。精确规则注释记录原因；OpenAPI探测同时改 manual redirect，阻止回环探测跟随外跳。 | 独立审查确认处置理由；使用保存的原规则离线正负对照：注释位置0、移除注释的四处仍全部检出。未排除目录、删规则或降低严重度。对应唯一 Ledger 的 FIXTURE/LOOPBACK 条目；代码中的 R27RC2 别名映射到 schema-compatible R27-RC2 ID。 |
| SAST errors | 八个 Bash 文件原本全部 `bash -n` 通过。固定 Semgrep Bash parser 不兼容四种合法写法：case同一行分支、带下划线的quoted heredoc delimiter、参数模式里的裸`\|`字符、默认文本裸尖括号。仅换行/分隔符拼写/等价引用，保留单引号 heredoc 和逐字正文；不执行实际部署脚本。 | 八文件原/新 Bash语法均通过，heredoc正文逐字相同及参数表达式有限等价对照通过，部署脚本隔离安全回归通过。原三规则源正式664目标扫描0 findings/0 errors；后续唯一测试修改用保存三规则源单文件补扫0/0，其余663文件内容未变。 |
| qs | 两条不同公告 GHSA-x5fp-wj9c-mxmx、GHSA-4mjr-xmp4-gh2g 均影响6.15.3、修复6.16.0。实际生产链仅 Express5.2.1(`^6.14.0`)与body-parser2.3.0(`^6.15.2`)直接引入qs，8条生产路径；all/prod重复不另算公告。pnpm定向transitive更新未改变锁文件，故仅对这两个确切父版本设置6.16.0 override，由pnpm生成锁文件；没有升级其他包。 | 原实际父模块上的有限漏洞回归5失败/1通过；修复后6项全部通过，包括括号逗号数组限额、isBuffer roundtrip、正常Buffer/嵌套数据、Express正常表单/深度400/参数413。冻结安装通过，all与production审计均0 findings/0 tool errors，无旧qs解析。未确认应用实际启用comma:true或stringify sink，未借此忽略供应链命中。 |

八个解析文件：`gce-domain-verify.sh`、`gce-log-tail.sh`、`gce-network-and-https.sh`、`gce-postcutover-hardening.sh`、`gce-production-acceptance.sh`、`gce-security-hardening.sh`、`gce-verify.sh`、`health-check.sh`，均在 `scripts/deploy/`。原错误类别为1个 Syntax error、7个 PartialParsing；原详情、spans、文件与修复对照保存在 baseline-sast/semgrep.json 及 semgrep-analysis/analysis.md。不是从计数推断。

Web 修复过程中曾采用过宽的 dev 目录排除，独立运行发现缺少共享 hot-reloader-types；已撤销，只留下上述两个精确入口，保留 hot-reloader-types/node-stack-frames/dev-bundler-service。初期 native build 的占位身份以及测试未传 EXPECTED_* 所导致的500分别保留失败日志；最终应用身份断言完全保留，输入补齐后四字段逐项匹配。没有通过删断言取得通过。

## 本轮实际执行与复用边界

- 最终锁文件冻结安装；pnpm lint/typecheck/test、API build、Prisma validate 通过。Web287 + API1280 = 1567测试通过，数据库相关30项跳过；不复用旧1320数值冒充本轮执行。没有连接真实数据库。
- 最终收窄的 Next 配置在真实重建及定向lint中验证；运行身份由现有生成器在隔离副本产生，不改受跟踪 development identity。最终 `/build-info` 返回匹配最终source/tree及本次release/buildTime。
- 原安全门禁回归通过；新回环回归2项、真实standalone1项、原CI-evidence回归20项通过。原workflow、Semgrep固定镜像/规则源/指标禁用/错误评价器、CI collector及12文件上传白名单均未更改。
- 本机 Node24.14.0/pnpm9.15.4、darwin/arm64；Docker29.5.2引擎linux/aarch64，Semgrep1.169.0容器linux/arm64。原CI是GitHub-hosted Ubuntu24/linux x64，Node24.20.0/pnpm9.15.4；不能把本地平台称作GitHub重新验证。镜像构建显式目标linux/amd64。
- 当前下载规则时间和摘要在规则快照及索引中；正式扫描报告记录664目标、255条实际运行规则。未取得attempt1旧规则快照，不能保证与旧规则字节相同。Bash约100% parsed lines仅是工具统计，不宣称heredoc内嵌语言获得独立语义审查。
- Secrets首次CI current/history为0findings，本轮只复用原SHA绑定结果，不称新候选完整历史Secrets重扫已通过。没有重跑DB/E2E/浏览器业务UAT。
- 按既定命令对apps/web扫描共10处：7处getByPlaceholder测试API、3处禁止占位文案的负向断言；正式页面0；未对新路由或产品验收作通过声明。

独立审查由 `/root/failure_repair_review` 完成，主补丁SHA-256 `259fc5e2b2955d46a2d912b66ac9128a87d8326b39951ae48001fe259742c086`，后续单测试补丁 `332a30006dec43444f917d7a8372429c35f4406bee87742a5a133f5532498f96`；无成立的阻断性源码意见。18个文件与后续单文件哈希、8个Shell的独立等价核对、实际最终扫描与runtime证据分别保存；独立AI审查不代替产品负责人或组织批准。

## 镜像与剩余阻断

最终两个镜像真实构建成功，标签/OCI source/tree均与最终候选一致。API镜像内Node24.19.0/linux x64，两个实际父依赖的qs均6.16.0；Web镜像完全禁用外部网络，经容器内回环验证/build-info四字段、login及页面所有script资源通过。其第一次辅助探测使用了错误相对入口，已按镜像实际WORKDIR=/app/apps/web、CMD=node server.js修正，未改变制品。

| 镜像 | 本地不可变镜像ID | 平台 | 结果 |
|---|---|---|---|
| api | `sha256:054180a93d8a2f6519ed1ba92b8a106031e65fee62b2ed423d9c50d336b82932` | linux/amd64 | BUILD_PASS / IMAGE_SCAN_BLOCKED |
| web | `sha256:3ce75ceb467542a9817f8e3f526553c2fd0568c71c83af355c82073b0e0530a6` | linux/amd64 | BUILD_PASS / IMAGE_SCAN_BLOCKED |

镜像扫描**失败，属于FINDINGS，不是TOOL_ERROR/REPORT_MISSING**。两个镜像各20条包级记录：High2、Medium6、Low12；同样的10个CVE分别命中libcrypto3与libssl3，不重复称为40个独立漏洞。实际版本3.5.7-r0，扫描器给出的修复版本3.5.8-r0。High为CVE-2026-14456，其余9个CVE及全部包/版本/严重度见image-scan-result.json。没有qs/其他Node包漏洞命中。

固定Trivy0.72.0，DBv2 UpdatedAt=2026-09-08T01:14:11.072075664Z，DownloadedAt=2026-09-08T06:42:47.023294501Z。保留Alpine3.24不在该工具EOL表中的告警及全部原始报告，未降低门槛、忽略公告、更新扫描器或自动接受风险。新阻断登记在唯一Ledger `R27-RC2-CI-IMAGE-001`，状态confirmed。首次远端CI原先尚未执行镜像扫描；这是本轮首次实际获得的镜像失败证据。

本轮不自行把已限定的三组失败修复扩大为基础镜像更新。下一项最小工程工作应是：明确授权后核实官方不可变Node24-Alpine候选包含修复的OpenSSL包，更新必要共享引用、重建/扫描API/Web、独立审查并形成另一个新source candidate；不能继续用84a1538证明更新后的制品。

继续使用已验证 Node `node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`，linux/amd64 child `sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43`；本轮没有更换基础镜像引用。PostgreSQL固定运行制品仍 `DEPLOYMENT_PREREQUISITE_PENDING`，不是本次source/build修复的阻断原因，也未被宣称解决。

当前 `RELEASE_NOT_READY / IMAGE_SCAN_BLOCKED / REMOTE_REVALIDATION_PENDING`；源码修复及本地已验证部分不替代新远端run。剩余：新精确候选的正式远端CI及两个artifact绑定；新增Node基础镜像OpenSSL扫描阻断（未风险接受、未修复）；完整运行制品/目标平台、恢复与环境准入、staging与真实飞书/角色/UAT、产品负责人确认仍未执行。

状态：代码修复已实现；本地结果以上述实际范围为准；staging URL/runtime/user-path未执行；production未改变且runtime/user-path未读取；main/tag未改变；产品状态 `AWAITING_PRODUCT_OWNER_CONFIRMATION`；本轮未实现或验收新路由，Placeholder正式页面0/测试命中10；无staging/production发布声明。

## 待所有者集中批准的下一次受限执行请求（未执行，当前暂缓）

**当前不建议批准84a1538再次CI来重复已知镜像失败。** 下文仍给出本轮实际候选的精确FF请求供审查；基础镜像修复完成后必须用新的具体候选/历史替换并重新批准，不能把此稿视作预授权。

公开仓库 `pijhbkbk/feishu_timeline_app`；唯一既有ref `refs/heads/codex/r27rc2-artifact-validation`。请求将精确 `84a153884bea9d59ec56ef4e6ce3ada4b2144854` / tree `1647b6b00922bda0a39211f95070c65985ee20db` 及Git发送所需可达对象公开发布。相对预期远端起点 `5a388095726d1b53fe79e379e1f3665d4a310a5d`，必要新增历史包括本来已有的文档checkpoint `0b54f81ee63193763004fdc00270f8414dc11a25`、本轮修复 `c216bd8938db81239f07738cf343917ae8dd8ca2`、测试补充 `84a153884bea9d59ec56ef4e6ce3ada4b2144854`；不发布其后的本轮evidence HEAD、本地原始证据/附件/环境文件。

执行前重新读取默认分支/main/唯一ref；唯一ref必须仍为上述5a388起点，且新候选包含其历史。若已变化，停止写入报告，不覆盖、不force、不重建分支。核对精确候选/锁/18文件与CI触发差异，复用已完成管理核查；Vercel限定仍为 `VERCEL_ASSOCIATED_PROJECT=NONE_OBSERVED_IN_AUTHORIZED_VISIBLE_SCOPE`。此次源码未改workflow或部署触发配置，不另起管理调查。

批准后仅一次正常、非强制fast-forward push，由既有push自然触发verify/security-source，预期playwright-smoke skipped。不得rerun旧run、dispatch/manual approve、取消重启试探、第二次人为事件、PR/tag/release/merge/main或设置修改。出现非预期workflow/job/deployment/head SHA，保存现状并停止，不制造新事件。

此请求包括公开Git对象、GitHub-hosted checkout、已固定Actions、原Node/pnpm/锁定包和安装生命周期下载、既有Semgrep规则/Trivy漏洞库获取、同项目registry audit、API/Web linux/amd64本地runner构建、现有日志状态与pnpm cache，以及现有两个脱敏artifact `ci-evidence-verify-*` / `ci-evidence-security-source-*` 中既定12份JSON上传。artifact7days；普通日志90days，cache另算。不得扩大白名单、上传SARIF、推镜像/包、进入staging/production/SSH/真实数据库。

完成后以repository、完整head SHA、event push、run ID/attempt绑定唯一新run，取回正式job/step/runner状态、必要日志和两个artifact/12JSON，校验archive SHA256及commit/tree/lock/run/job/platform/checks/findings/tool-errors/report-missing并建立本地索引。无论结果通过或失败，取回后停止，不用删除断言或自动rerun取得绿色。原一次push授权已耗尽，本请求尚未获执行批准。

## 官方依据

[Next output tracing配置](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)；实际15.5.21调用链/trace证据在web-analysis.md。[Semgrep语言支持](https://docs.semgrep.dev/supported-languages)将Bash列为实验性；本次具体四类兼容缺陷来自固定版本有限对照，未冒称官方已发布逐项修复公告。[qs公告一](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx)、[qs公告二](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g)和[6.16.0维护者变更](https://github.com/ljharb/qs/blob/v6.16.0/CHANGELOG.md)支持此次最小更新；首公告维护者Low与GitHub Reviewed Moderate定级不同，未借差异降低原CI门槛。
