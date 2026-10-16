# R27RC2 API/Web OpenSSL 本地修复主回执

**结果：系统包修复、本地构建运行和原镜像扫描通过；Node 内嵌 OpenSSL 尚未闭环，整体仍为 `RELEASE_NOT_READY`。没有推送或触发新 CI。**

## 身份与范围

继续原工作树 `/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`、分支 `security/r27rc2-candidate-repair`。起始 HEAD `8d237fe240c345b14a6461d125352f7a91b4081f` 是前批 evidence commit；前批 source `84a153884bea9d59ec56ef4e6ce3ada4b2144854`、tree `1647b6b00922bda0a39211f95070c65985ee20db`，起始工作树干净。

新 source candidate：`8c265959f2dcca272d59ca9cbe8f9ae7b821019d`；tree：`033a780976332652ca2b21801863ceab086772bd`；lockfile SHA-256：`5e7450da9c82bfe96390a9be4198ebc784e5e858e17c5fc5ed71ce33713e3f2c`。后续 evidence HEAD 记在本地索引 `test-results/r27rc2/image-openssl-remediation-20260908/evidence-index.json`，不拿文档提交触发重构建。`5d7c52a3f01f9cc7b696560cbdf54ea700f4d578` 仅是修复 checkpoint；中间6dd提交修正新增测试的 Sharp 实际父依赖解析；正式补扫随后发现测试缺少 GCM tag 长度，最终8c提交明确16字节并增加短标签拒绝断言。两最终镜像已按8c重新构建、运行与复扫，所有中间结果保留。

本轮产品输入仅修改 `apps/api/Dockerfile`、`apps/web/Dockerfile`，另增加 `scripts/security/tests/image-crypto-runtime.mjs`。AGENTS、CI、应用源码、lockfile、扫描器、上传白名单均未改。原两批 161 个本地证据文件受 SHA-256 保护；原失败报告和 checkpoint 构建证据保留。

## 十项 CVE：全部包/镜像实例

原报告对象为 Alpine 3.24.1 的系统 `libcrypto3`、`libssl3`，两包均为 3.5.7-r0。每镜像 20 实例（HIGH 2 / MEDIUM 6 / LOW 12），每镜像独立 10 CVEs，两镜像合计 40 实例、去重仍为 10 CVEs。下表每镜像的两实例对应两个不同系统包，不能丢掉重复实例。

| CVE | 原 Trivy 严重度 | API 实例 | Web 实例 | 两包实际修订 |
|---|---|---|---|---|
| CVE-2026-14456 | HIGH | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-14457 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-18798 | MEDIUM | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-54874 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-63072 | MEDIUM | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-63073 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-63074 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-63075 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-63076 | MEDIUM | 2 → 0 | 2 → 0 | 3.5.8-r0 |
| CVE-2026-75803 | LOW | 2 → 0 | 2 → 0 | 3.5.8-r0 |

完整原始 vulnerability 对象、Target/Class/Type、PURL、Layer digest、InstalledVersion/FixedVersion、DataSource、VendorSeverity 和镜像身份见 `before-instances.json`、四份 `comparison-image-sca/image-*.json` 及逐实例 `instance-remediation-comparison.json`。Target 为各镜像的 `alpine 3.24.1`、Class=`os-pkgs`、Type=`alpine`；具体文件 `/usr/lib/libssl.so.3`、`/usr/lib/libcrypto.so.3` 来自固定 NODE_IMAGE 的系统层。原 `SeveritySource` 字段缺失，保留为空；`DataSource=Alpine Secdb` 不替代该字段。CVE-2026-14456 的上游 Low 与原扫描 HIGH 不同，本轮保留原 HIGH 和原门禁。

[Alpine v3.24 官方 secdb](https://secdb.alpinelinux.org/v3.24/main.json) 的 openssl secfixes 将十项全部绑定 3.5.8-r0；[OpenSSL 官方公告](https://openssl-library.org/news/vulnerabilities/index.html) 给出对应 3.5 分支修复范围。官方原文与摘要保存在 `official-review/` 并逐文件索引，不只依据裸版本比较。

## 实际修复与兼容边界

保留原固定基底 `node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`；原 linux/amd64 manifest `sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43` 的绑定沿用前批核实，实际新构建继续解析该固定输入。

在两个 Dockerfile 增加统一 `openssl-base` 阶段，唯一安装变更为 `apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0`。base/build/runtime 均继承该阶段；API ops 也继承，但 **ops 最终制品本轮未验收**。没有启动时升级、全系统升级、edge、忽略 CVE 或隐藏包元数据。实际仓库仍为 `https://dl-cdn.alpinelinux.org/alpine/v3.24/main` 与 `/community`；系统包前后清单确认仅这两包变化，18 个 OS 包总数不变；API 136、Web 23 个语言包条目也逐项相同。

同分支官方新基底已实际拉取核实：`node:24-alpine3.24@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`，amd64 `sha256:4caaaf42195bcd6f6f3559a413b20cb8f8ad089e231ee874cf7701643966689f`。它为 Node 24.20.0，但系统包和内嵌 OpenSSL 仍为 3.5.7，故没有把无效的换摘要当修复，也未引入无关 Node 升级。

固定基底与精确包版本提供明确输入约束；Alpine 包仓库仍可变，历史精确包未来是否可下载不保证。没有声称未来 CI 与本地镜像字节完全相同。

## 两个最终镜像与运行验证

构建从新 source 的干净 git archive 执行，未携带本地环境文件或未跟踪附件。buildTime `2026-09-08T07:32:48Z`，release `r27rc2-openssl-local`；两镜像 OCI labels 均匹配新 source/tree。

| 角色 | 本地镜像 tag | 本地 image ID |
|---|---|---|
| API | `feishu-timeline-api:rc2-openssl-8c265959f2dc` | `sha256:ba942cc3dbd790f94eb5a82921fd6e063033f5d94b3f741e45bd67f5c21d5efd` |
| Web | `feishu-timeline-web:rc2-openssl-8c265959f2dc` | `sha256:807e8b15a0380876c3e396b7dd98424b8055709e00bee021595b3e5bc26460f2` |

以上是本地 Docker image ID，**不是已发布 registry digest**。实际平台均 `linux/amd64`（Node `linux/x64`），Docker Desktop engine 为 linux/arm64，使用其 amd64 执行支持。实际 Node 均 `v24.19.0`；系统 OpenSSL 两包均 `3.5.8-r0`；Node 内嵌 `process.versions.openssl=3.5.7`、`node_shared_openssl=false`。

- 两镜像最终 USER=`node`、实际 uid=1000，入口 `docker-entrypoint.sh` 与原 CMD 保留。API `node dist/main.js`、3001、`/api/health`；Web `node server.js`、工作目录 `/app/apps/web`、3000、`/build-info`。实际 Docker health 均 healthy；运行附加 cap-drop ALL 和 no-new-privileges，无公开端口。
- 两镜像实际执行 GCM 正常解密/篡改拒绝，TLS 正确 CA/localhost 通过，错误 hostname 与不可信 CA 均拒绝；没有关闭 TLS 校验。这是功能回归，不是 CVE 修补证明。
- API 最终镜像的 Prisma musl 原生引擎真实执行查询及事务；ldd 指向修补后的 `/usr/lib/libssl.so.3`、`/usr/lib/libcrypto.so.3`。Node 本身不动态链接这两库。保留 ldd 单独装载 N-API 模块时的宿主符号警告；真正 Node 宿主加载及调用通过，没有将该警告误写成实际加载失败。
- Web 最终镜像真实 Sharp 0.35.0 / libvips 8.18.3 变换通过；其动态链接清单未发现另一套 libssl/libcrypto。所有后续 COPY 范围与最终原生文件清单已审查，未覆盖修补后的系统库。真实 `/build-info` 四字段匹配，`/login` 和全部 9 个脚本资源 200。
- 对从最终 Web 镜像取出的真实产物运行原生产检查，并对包含隐藏 `.pnpm` 的全部 1,126 个已交付 JS/MJS/CJS/map 文件检查：0 开发标记。未以宿主构建替代容器证据。
- 本轮专属 internal Docker network、合成 PostgreSQL 16.14（官方固定本地 arm64 测试输入）与 Redis；API 测试端仍 linux/amd64。真实迁移只应用于专属合成数据库。原 30 项 PostgreSQL skipped 用例本次单独执行：附件额度 2、项目事务 5、管理/供应商锁 23，**30 PASS / 0 skipped**。旧批的 30 skipped 记录保持原样。
- API 健康返回新 source/tree/release/buildTime；未认证 projects 请求返回 401。API 测试使用 production 模式和现有 staging 配置校验语义，但实际环境仅本地隔离容器，`FRONTEND_URL=http://localhost:3000`，不代表 staging 部署。没有真实飞书凭据、登录或产品验收。

第一次隔离数据库 harness 曾把初始化用 Unix socket 临时服务器判为就绪，随后读版本遇到其计划关闭。失败完整留在 `intermediate-6dd082695725/runtime-attempt1/`；改为正式 TCP 服务就绪条件后才继续，最终所有运行检查 exit 0。所有专属容器、network、中间两次检查的四个由事件精确归属的匿名合成数据卷、最终检查随容器删除的专属卷及临时 TLS 材料均已清理；镜像和证据保留，未清理无关资源。

## 原扫描与验证复用

使用原固定 Trivy `0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f` 和原 `scan-production-images.sh`，`--scanners vuln --exit-code 1`，OS+语言覆盖不变，无 ignore/ignore-unfixed/降级阈值。原 evaluator 对任何已报告严重度都阻断，本轮未另加或降低门槛。

本次同一命令依次扫描旧 API、旧 Web、新 API、新 Web：旧两份各20，新的两份各0；原系统40实例全部消除，新发现0。四份报告存在；无 TOOL_ERROR / REPORT_MISSING；两份最终镜像各自 PASS。整个四镜像脚本 exit 1 **如实保留**，原因是前两份旧基线预期仍阻断。完整 JSON、stderr、evaluator 日志及状态已保存。

DB Version2，UpdatedAt `2026-09-08T01:14:11.072075664Z`，DownloadedAt `2026-09-08T06:42:47.023294501Z`，NextUpdate `2026-09-09T01:14:11.072075403Z`；前后 SHA-256 均 `fc8340c6b58c86e8cc14f4791cb4bc1d6ee578548185c9fbb54ecd0fcd94e04a`。并非换旧库求绿。扫描器的 Alpine 3.24 EOL 表警告保留，不影响已产生的 OS/语言结果，也不作为忽略漏洞依据。

前批 1,567 PASS 的源码质量与 Web/Semgrep/qs 验证按未变的应用、锁文件和规则复用，不冒充本轮重新全跑；镜像输入变更后本轮已重建并补跑原生/数据库/生产运行路径。新增唯一测试另用原固定 Semgrep 和保存的三份规则离线补扫：中间6dd命中 `gcm-no-tag-length` 1项/0 errors，初次人工审查未发现该项；实际修正后8c为0 findings/0 errors。未添加忽略或修改规则。最终结果见 `new-test-sast-result.json`，中间失败见 `intermediate-6dd082695725/new-test-sast.json`。Dockerfile 的独立审查覆盖安装、权限和多阶段 COPY。正式 GitHub 仍只有先前失败运行，未远端复验。

## 独立审查与保留阻断

独立只读上下文 `openssl_official_review` 审查精确新 source、官方依据、40实例、两镜像、原门禁与运行证据；`g4-final-review.json` 结论为 `G4_DIFF_PASS_FOR_PARTIAL_SYSTEM_OPENSSL_REMEDIATION`，无新增代码审查意见；整体为 `BLOCKED_NODE_EMBEDDED_OPENSSL`。唯一 Finding `R27-RC2-CI-IMAGE-001` 记录部分处置并保持未关闭，没有另建 Ledger/schema 或自行接受风险。

[Node 官方发布索引](https://nodejs.org/dist/index.json) 当前最新24为24.20.0；[Node24.20.0 的 OpenSSL 源码版本](https://raw.githubusercontent.com/nodejs/node/v24.20.0/deps/openssl/openssl/VERSION.dat) 仍3.5.7。独立源码对照确认24.19/24.20相应 ChaCha20 文件相同，至少未包含 [CVE-2026-75803 的官方修补](https://github.com/openssl/openssl/commit/bdeb0cd994d915342787f117ee75044f0dc36f34)。这证明“系统包更新不等于 Node 内嵌修补”，**不宣称十项均可从本应用利用**；完整 Node 适用性/官方不受影响证明仍缺失。Trivy 本次 OS/语言包零发现也不能补上该证据。

最小剩余项：取得可核实的 Node24 官方修补构建或明确适用性结论后，再完成相应运行时验证。已只读核实的 Alpine 官方共享 OpenSSL Node 为24.18.1-r0，虽然同为 musl/Node24，却涉及版本回退、多个共享依赖和 CA 行为差异；它只能作为需要明确运行时替换决策与专项验证的替代路线，本轮没有自动采用，也没有自编译、切 Node 主版本或盲目循环换标签。

**本地整体阻断尚未解除，附件中“解除后准备新一次受限 FF/CI 执行请求”的条件未成立，因此不交付可直接执行的 push 请求，也不复用已消耗的首次 push 授权。** 后续获准执行仍必须先重读现有 validation ref，只能正常 fast-forward 更新 `refs/heads/codex/r27rc2-artifact-validation` 并用新 push/new run 验证；不能重跑旧 SHA。

## 本轮停止状态

| 项目 | 准确状态 |
|---|---|
| 代码实现 | 系统包部分修复 CODE_IMPLEMENTED；Node 内嵌问题未闭环 |
| 本地验证 | 两最终构建/运行/原扫描通过；新增30数据库回归通过；整体仍有上述安全阻断 |
| staging URL / runtime commit / 用户路径 | 未访问、未部署、未验收；无本轮 staging URL/runtime |
| production 改变 / runtime commit / 用户路径 | 未改变、未读取、未验收 |
| main / tag | 未修改；无远端写入 |
| 产品负责人 | AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 未完成路由 | 本轮无路由实现或验收范围；不宣布既有路由验收通过 |
| Placeholder | 正式页面0；10处既有测试白名单文本，扫描已保存 |
| 外部副作用 | 仅获准镜像/依赖/官方资料读取与本地构建扫描；无push、registry upload、CI新事件、GitHub/Vercel设置操作或deployment |
| release readiness | RELEASE_NOT_READY / PARTIAL_IMAGE_REMEDIATION_VERIFIED / REMOTE_REVALIDATION_PENDING |

PostgreSQL/其他运行制品的正式 deployment prerequisites 仍 pending；本次合成数据库测试不能替代正式镜像集合、staging、飞书登录/UAT或产品负责人验收。本轮至此停止。
