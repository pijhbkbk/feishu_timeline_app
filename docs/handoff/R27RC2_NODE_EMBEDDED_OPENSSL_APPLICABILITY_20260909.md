# R27RC2 Node 内嵌 OpenSSL 适用性判定（2026-09-09）

本轮落在附件的 **A 类结果**：十项 CVE 在下述精确 API/Web 镜像、已交付依赖和已核实启动配置内，均判定为 **当前候选不受影响**。这不是“Node 的 OpenSSL 已修补”：对应上游缺陷代码仍在 Node 内嵌 3.5.7 中，若引入相应 native/API/provider/启动配置，须重新评估。此前系统 libcrypto3/libssl3 的 40 个实例已修补，仍沿用上一批实物证据。

唯一 Finding 为 `R27-RC2-CI-IMAGE-001`，本轮目标验证与独立差异审查成立后推进至 `fixed_diff_verified`；不标 `closed`、不接受风险、不改变原 HIGH/扫描门槛。整体仍为 `RELEASE_NOT_READY / REMOTE_REVALIDATION_PENDING`。后文只有待所有者批准的 FF/CI 请求，本轮没有执行远端写入。

## 精确身份及复用边界

- 工作树 `/Users/lixiaochen/Downloads/feishu_timeline_app-r27rc2-repair`；分支 `security/r27rc2-candidate-repair`。开始时 evidence HEAD 为 `71b1140d8e6809fd1d04417c1d40091b432c16dc`，没有回退旧 HEAD。
- 新 source/test candidate：`e0b20a69522edd4dc76ee3b3219badda7166acbd`，tree `fa64715929aed610ae2714482db0b881ba2f367d`。相对开始 HEAD 仅新增外置测试 `scripts/security/tests/node-embedded-openssl-applicability.mjs`；业务代码、Dockerfile、CI、锁文件与治理规则未改。
- 实际镜像 runtime source 仍是 `8c265959f2dcca272d59ca9cbe8f9ae7b821019d` / tree `033a780976332652ca2b21801863ceab086772bd`。测试从标准输入注入现有镜像，没有写入镜像、没有重构建。新 source/test candidate 不冒充旧镜像的 runtime commit。
- lockfile SHA-256：`5e7450da9c82bfe96390a9be4198ebc784e5e858e17c5fc5ed71ce33713e3f2c`。
- API 本地 image ID：`sha256:ba942cc3dbd790f94eb5a82921fd6e063033f5d94b3f741e45bd67f5c21d5efd`。
- Web 本地 image ID：`sha256:807e8b15a0380876c3e396b7dd98424b8055709e00bee021595b3e5bc26460f2`。二者均非已发布 registry digest。
- 两镜像实际 Node `v24.19.0`、OpenSSL `3.5.7`、`node_shared_openssl=false`、`node_use_quic=false`、`linux/x64`、uid 1000；镜像平台 `linux/amd64`，执行宿主为 Docker Desktop arm64。
- 两个 Node 二进制 SHA-256 均 `ce98bfa82b8d7ba6e426c051eb5d82ec8d1fbafaf2905996285abc0c5b82cbaa`。固定 base 仍为 `node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`，amd64 child `sha256:2a49bdf71e9fd965a58c1703fd9ddd205b34e5782b692a72dd1d248abb0beb43`。

[精确官方 Docker recipe](https://github.com/nodejs/docker-node/blob/fd1bf45c51970427bc899084b5381f6827722246/24/alpine3.24/Dockerfile) 的 x86_64 分支实际使用 Node 项目 unofficial-builds 的 `node-v24.19.0-linux-x64-musl.tar.xz`，不是普通 glibc 发布包。下载归档 SHA-256 `ebcb19941bf6a34ada2141727ffda66fb2a4bf315f5c02c8f1fc9e48a2045e06` 匹配 recipe 常量；其中 `bin/node` 与两镜像字节匹配。另下载并按官方 SHASUMS256 校验匹配版本源码，结合实际构建配置和二进制符号分析；没有声称本轮完成 Node 的可复现编译或获得厂商针对此批 CVE 的专门认证。

上一批索引的 263 个文件逐项 SHA-256 保持不变。复用两镜像构建/健康/Sharp/Prisma/TLS、原 Trivy 同库复扫、30 项真实隔离数据库回归；没有机械重跑。旧基线使四镜像比较命令整体 exit 1 的原解释保留。历史记录仍保留当时未决状态，本回执补足后续适用性结论。

本轮证据入口为 `test-results/r27rc2/node-embedded-openssl-applicability-20260909/evidence-index.json`；索引记录 source/test、实际 runtime、最终 evidence HEAD、逐文件 hash、独立审查和本回执 hash。原始下载和完整交付物读取快照另保留在 `/private/tmp/rc2-node-openssl-applicability-20260909`，不提交、不上传。

## 逐项判定：四层证据

下表“内嵌代码”均为缺陷实现仍存在，未确认回补；对应系统包修补状态与它分开。所有行的原生/配置前提均包含下一节的完整实际交付面核查。原 Trivy 评级与 [OpenSSL 官方公告](https://openssl-library.org/news/vulnerabilities-3.5/) 评级分列，原评级不被覆盖。

| CVE | 原 Trivy / 上游 | 上游必要条件、实际二进制与调用证据 | 当前 API/Web 判定及最小复查条件 |
|---|---|---|---|
| CVE-2026-14456 | HIGH / Low | OpenSSL 自身 QUIC listener 的 Initial/accept 队列资源路径；`quic_port.c` 实现和导出符号存在。实际 Node QUIC 未启用，无 ngtcp2/nghttp3 版本；SecureContext 无 OpenSSL QUIC 方法入口，交付 addon 不调用 listener。 | 当前候选不受影响；启用 OpenSSL QUIC listener/native 接口时复查。 |
| CVE-2026-18798 | MEDIUM / Moderate | OpenSSL QUIC `port_default_packet_handler`→`port_bind_channel` 失败所有权路径仍在；当前没有创建此 listener/channel 的入口。即便未来 Node QUIC 使用 ngtcp2，也不能直接等同 OpenSSL 自身 QUIC stack。 | 当前候选不受影响；增加相关 QUIC 实现或入口时复查。 |
| CVE-2026-63075 | LOW / Low | OpenSSL QUIC ACK metadata 保留路径 `quic_ackm.c` 存在；没有实际 OpenSSL QUIC connection/ACK 处理入口。 | 当前候选不受影响；同上。 |
| CVE-2026-63072 | MEDIUM / Moderate | `cms_kari.c` 的 `cms_kek_cipher` 查询大小→分配→CMS recipient unwrap 路径仍在，`CMS_decrypt` 导出。Node PFX→PKCS12_parse→PKCS7 safebag/PBE、PEM/DER 密钥解析、WebCrypto 固定 AES-KW NID 均不进入 CMS recipient key unwrap；addon 不导入/动态选择 CMS。 | 当前候选不受影响；新增 CMS 消息解密、CMS native/FFI、相应子进程入口时复查。 |
| CVE-2026-63073 | LOW / Low | `cmp_vfy.c` 的预期 sender 验证仍将不可信 DN 用作格式串；Node/实际 addon 没有 CMP response-validation API 或客户端。普通 X509/TLS 不建立 CMP context。 | 当前候选不受影响；增加 CMP 客户端/预期 sender 校验时复查。 |
| CVE-2026-63074 | LOW / Low | `cmp_vfy.c` rejected extraCerts cache 路径仍在，CMP context 符号存在；当前没有长期 CMP server/client context 或消息入口。 | 当前候选不受影响；增加 CMP 消息服务/缓存时复查。 |
| CVE-2026-63076 | MEDIUM / Moderate | `cmp_protect.c` PBM protectionAlg ASN.1 类型缺少校验路径仍在；无 CMP PBM verification 调用方、服务端或不可信 CMP 输入。 | 当前候选不受影响；引入 CMP PBM 客户端/服务端时复查。 |
| CVE-2026-14457 | LOW / Low | RPK 相关代码/`SSL_CTX_set1_*_cert_type` 导出；OpenSSL SSL_CTX 初始 cert-type 字段为空，Node SecureContext 不暴露 setter，实际 addon 无 setter。`extensions_clnt.c` 不发 RPK 扩展，`extensions_srvr.c` 忽略未启用的类型并保留 X509。 | 当前候选不受影响；启用 RFC7250 RPK，尤其私钥无证书配置时复查。普通证书 TLS 不是 RPK。 |
| CVE-2026-54874 | LOW / Low | `dtls_meth.c` 未来 epoch 接收缓冲路径与 DTLS_method 符号存在；Node SecureContext 只选 TLS 方法，两镜像都拒绝 DTLS 方法字符串；实际 addon 无 DTLS endpoint。 | 当前候选不受影响；增加 native/FFI DTLS 或 DTLS 网络服务时复查。UDP 本身不能证明 DTLS。 |
| CVE-2026-75803 | LOW / Low | ChaCha20-Poly1305/OCB provider 的 `EVP_Cipher(ctx,out,NULL,0)` terminal 缺陷仍在。Node Cipheriv/Transform/WebCrypto 实际调用 Update/Final，provider final 执行认证；两镜像每份 24 组正负向通过。TLS/native/同补丁 GCM-SIV 路径单独见下文。 | 当前候选不受影响；增加 EVP_Cipher terminal caller、FFI/provider、GCM-SIV 可达接口或修改绑定时复查。 |

没有用“Trivy 0”“没有 CLI”“一次 TLS 成功”“补丁 SHA 未出现”或一次搜索无命中代替上述判断；也没有要求证明任意攻击者自带 native 代码或所有未来配置安全。十项本轮范围内没有剩余适用性 proof gap；其他运行制品和真实部署环境仍未纳入。

## 实际依赖、加载器及输入边界

从每个精确 image ID 读取完整 `/app` tar，记录全部文件/符号链接，并在宿主仅提取 regular files 进行分析，避免跟随 pnpm 链接到目录之外。API/Web 分别枚举 154/80 个 package.json（包括嵌套元数据，不能与上一批 Trivy 的 136/23 个语言包条目混为同一统计）。没有泛化 FFI 包；不是据此单独作结论。

- API 仅一个 ELF addon：Prisma 6.19.3 的 `libquery_engine-linux-musl-openssl-3.0.x.so.node`。实际生成 client 选择 `runtime/library.js`、`engineType=library`、`activeProvider=postgresql`，schema 为 PostgreSQL。Node-API 引擎通过 `process.dlopen` 加载，不能写“没有 dlopen”。其动态导入包含普通 SSL_CTX/SSL_connect/读写、digest/key API，没有 CMS/CMP/DTLS/QUIC/RPK setter/EVP_Cipher terminal。确有 dlopen/dlsym：独立反汇编与 SQLite VFS 符号/字符串及相应源实现相互支持其为 SQLite extension loader，当前 PostgreSQL datasource 不进入该路径。切换 datasource、允许 SQLite extension 或设置 Prisma 引擎覆盖项均需复查。
- Node 主二进制静态嵌入并全局导出旧 OpenSSL，故 **不能仅凭 Prisma 的 ldd 指向已修补系统库，就保证每个函数都绑定系统实现**。本判定即使考虑符号抢占，也依靠普通 TLS 调用链不满足十项条件，不把动态链接库路径当补丁证明。
- Web 仅 Sharp 0.35.0 addon 和 libvips 8.18.3 两个 ELF 文件；其动态导入无 OpenSSL。libvips 的 dlopen/dlsym/GIO 模块机制真实存在；实际 `/target/lib/gio/modules`、`/usr/lib/gio/modules`、`/usr/local/lib/gio/modules`、`/target/lib/vips-modules-8.18` 不存在，系统 lib 目录和完整 `/app` 清单无对应 vips 模块目录。`GIO_EXTRA_MODULES`、`GIO_MODULE_DIR`、`VIPSHOME` 未设置。
- 两镜像没有 `OPENSSL_CONF`、`OPENSSL_MODULES`、`OPENSSL_ENGINES`、`NODE_OPTIONS`、`LD_PRELOAD`、`LD_LIBRARY_PATH` 或 Prisma engine override。仅记录“是否设置”，没有读取秘密。系统 `/usr/lib/ossl-modules/legacy.so` 仍在，不能声称无 provider 文件；它不是默认加载的自定义 Node provider，实际 Node 二进制内 MODULESDIR 为 `/home/node/node-v24.19.0/out/$(BUILDTYPE)/obj.target/deps/openssl/lib/openssl-modules`，两镜像中该字面路径均不存在，ENGINESDIR 为 `/dev/null`；额外检查的 `/usr/local/lib/ossl-modules` 也不存在。实际 `/etc/ssl/openssl.cnf` 与 Node `nodejs_conf` 默认 section/源码入口一起审查，没有本批功能或外部 provider 激活。Node 支持 OpenSSL 配置，未来覆盖并非天然安全。
- API 实际 `node dist/main.js`，NestFactory 未传 httpsOptions，启动普通 HTTP；处理业务 JSON/附件、散列/UUID、Feishu HTTPS 和 PostgreSQL TLS。Web standalone `node server.js`→`startServer(isDev:false)`，普通 HTTP/Next crypto/TLS与受限图片处理。业务入口没有把上传内容交给 CMS/CMP/QUIC/DTLS/RPK 解析器，也没有把业务输入交给 native library 路径或可选 module loader。
- 完整交付 JS 中确有 child_process：Prisma 平台/libssl 版本探测、binary/generator/postinstall 备用代码；Sharp/detect-libc 的 libc/平台诊断；Next 的 dev、CLI、包管理及遥测帮助路径。实际 production 入口、库调用上下文和命令参数已逐类核对；这些不是 CMS/CMP/OpenSSL listener 子进程。非当前入口的安装/生成/测试代码不冒称已经执行。已有程序执行能力本身不是这里十项漏洞的应用入口。

限定失效条件包括：镜像/Node/native 包变化，新增 FFI/addon/二进制或业务插件，改变 provider/engine/OpenSSL 启动配置，改变 Prisma datasource/engine、GIO/VIPS 模块加载，新增 QUIC/DTLS/CMS/CMP/RPK，或把不可信输入接入这些接口。未来部署配置需与此范围核对；本轮没有访问真实配置或真实服务。

## CVE-2026-75803 的完整路径与实测

[上游补丁 bdeb0cd](https://github.com/openssl/openssl/commit/bdeb0cd994d915342787f117ee75044f0dc36f34) 同时涉及 ChaCha20-Poly1305、AES-OCB 和 AES-GCM-SIV，三部分均已检查，源码副本/hash 见 `source-evidence/` 与索引。

1. Node `src/crypto/crypto_cipher.cc:741–799` 的非 CCM Final → `deps/ncrypto/ncrypto.cc:3451–3460` → `EVP_CipherFinal_ex`；JS Transform `_flush` 同一 Final。WebCrypto AES-OCB `crypto_aes.cc:141–175` 和 ChaCha20-Poly1305 `crypto_chacha20_poly1305.cc:279–323` 都是 Update/Final。WebCrypto 的 JS 单次调用并不等于 OpenSSL `EVP_Cipher` one-shot terminal。
2. OpenSSL `evp_enc.c` Encrypt/Decrypt Final 分发 `cfinal`；与 `evp_lib.c:381` 的 `EVP_Cipher` 优先 `ccipher` 分开。旧 ChaCha `cipher_chacha20_poly1305.c` 的 cipher 零长度早退仍在，但 final 直接 `hw->aead_cipher(...NULL,0)`；OCB `aes_ocb_block_final` 初始化尚未设置的 IV，并调用 `aes_generic_ocb_final` 验证标签。未借用 GCM 测试证明。
3. TLS 1.3 `tls13_meth.c:151` 拒绝小于 tag+1 的密文记录，225–239 使用 Update/Final；TLS ≤1.2 `tls1_meth.c:373–380` 的 provider 路径使用 Update，AAD 设置拒绝短于标签的记录，实际输入包含标签。legacy `EVP_Cipher` 分支单独检查 `crypto/evp/e_chacha20_poly1305.c:569–586` 长度检查、410 的 payload+16、429 的 TLS terminal 及 474–482 的 tag 比较；合法空 payload 仍不是 NULL/0 terminal。OCB 没有 TLS cipher suite，当前 native addon 也无独立 EVP_Cipher caller。
4. 同补丁 GCM-SIV 的空消息 Final 生成/比较标签修正没有忽略。该实现源码存在，但 Node Cipher::FromName 使用 `EVP_get_cipherbyname`；当前 Node legacy 注册/接口不提供该算法，WebCrypto 没有 GCM-SIV 分派，实际 addons 不调用。两镜像对 128/192/256 名称均返回 `ERR_CRYPTO_UNKNOWN_CIPHER`，明确记为 **不可用/初始化，不是认证 PASS**。新增测试只接受这个明确错误；其他初始化错误或算法变为可用会使测试失败并要求补评估。

每份镜像 24 组：4 算法 × 2 AAD 模式 × 2 显式流式序列＝16 组，每组先合法空消息成功，再检查 altered/invalid/missing tag 在 final 认证阶段拒绝，同时验证 Transform 的合法与错误标签路径；另 4 算法 × 2 AAD 模式＝8 组 WebCrypto 合法/altered/invalid tag。每份共 48 个直接 Final 负向、16 个 Transform 负向、16 个 WebCrypto 负向；合法路径先成立，结果中不输出密钥/nonce/tag 字节。另普通 SecureContext 成功，4 个 DTLS/QUIC 方法名称均 `ERR_TLS_INVALID_PROTOCOL_METHOD`。API 和 Web 分别执行，分别绑定 image ID、Node SHA、测试 SHA 和退出码。

最终新增测试 SHA-256 `db0206efb2700317ef6fe89886a07feacb223f035db7aa9171d7c8f8037328e1`；两镜像均 exit 0 / 24 PASS。`node --check` PASS；原固定 Semgrep 1.169.0、三份原规则、仅新增目标：0 findings / 0 errors / target 已覆盖。扫描器使用原本地 linux/arm64 工具，应用测试仍是 linux/amd64。未修改规则、阈值或 CI，没有加入忽略项。本测试是外置验证，不冒称已接入既有 CI 或已经远端执行。

中间问题均留证：首次 WebCrypto 用 raw 导入格式被拒，后按精确源码改 raw-secret；不计认证 PASS。首次宿主提取被 pnpm symlink 安全检查拒绝，改为 tar regular-file 分析。首次 Semgrep 错把已有 arm64 工具强制为 amd64，120 秒超时且无报告；改用实际缓存工具、`--pull=never`、无网络和单目标目录后完成，不把超时当绿色。独立审查要求的 GCM-SIV fail-closed 守卫已落实并重测。

## 独立审查、记录与下一步请求

独立只读上下文 `node_applicability_review` 完成精确源码、ELF/native动态加载、TLS/provider、双镜像测试、最终测试 diff 和本回执/唯一 Ledger 审查。结果与 SHA 见 `review/g4-final-review.json`。这满足已有独立上下文要求，不冒充人类批准。唯一 Ledger 的系统修复历史、原严重度及原始扫描均保留；本轮目标/差异验证不等于 full/release clearance。

以下为 **待所有者明确批准的一次性执行请求，当前未授权、未执行**：

> 在 public 仓库 `pijhbkbk/feishu_timeline_app`，将精确 source/test candidate `e0b20a69522edd4dc76ee3b3219badda7166acbd`（tree `fa64715929aed610ae2714482db0b881ba2f367d`）及 Git 发送该提交必需的可达历史，通过一次正常非强制 fast-forward push 写入唯一既有 `refs/heads/codex/r27rc2-artifact-validation`。申请接受这些 Git 对象公开可见；本轮后续 evidence commit、本地 test-results、下载、环境文件和附件不发送。执行前重新读取该 ref、默认分支/main 和 candidate 身份；历史记录的 ref 起点为 `5a388095726d1b53fe79e379e1f3665d4a310a5d`，它不是本轮联网复核。必须核实实际当前 ref 与待批准起点一致且为 candidate 祖先；若不存在、漂移、非 FF 或有冲突，停止，不创建替代 ref、不覆盖、不 force。
>
> 仅由此 push 自然触发一次既有 CI：verify、security-source；playwright-smoke 预期 skipped。允许既有 GitHub-hosted checkout、固定 Actions、锁定依赖下载/现有 lifecycle、Semgrep 规则、Trivy DB、registry audit、linux/amd64 API/Web build、原 cache 和普通日志。仅上传既定两个 artifact：`ci-evidence-verify-*` 的 metadata/checks/production-build/image-api/image-web 共 5 JSON，`ci-evidence-security-source-*` 的 metadata/checks/gitleaks-current/gitleaks-history/semgrep/sca-all/sca-production 共 7 JSON；均仅 `reports/ci-public/<job>/` 既有白名单，保留 7 天。日志沿用已核实 90 天，cache 不计入 artifact 保存期，不扩大上传。
>
> 绑定 repository、完整 head SHA、event=push、run ID、attempt，取回 workflow/job/step/runner/platform 和必要日志；下载两个 artifact、12 JSON，核对 commit/tree/lockfile、run/job/实际 runner、checks/counts/tool errors/report missing，并计算下载归档 SHA-256、建立本地结果索引。若发生非预期 workflow/job/deployment/head SHA，保存证据并停止；失败准确报告，不 rerun、dispatch、manual approve、再 push 或删除断言求绿。不得 registry/package/SARIF 发布、PR/main/tag/release/merge、设置修改、SSH、数据库迁移、staging/production。完成此新一次 CI 结果取回后停止。

复用已完成的 GitHub 管理核查及 `VERCEL_ASSOCIATED_PROJECT=NONE_OBSERVED_IN_AUTHORIZED_VISIBLE_SCOPE`，本轮不再调查或修改。上一次 push 授权已使用，不能把此请求当作已经获得的新授权；本轮也未重新读取远端或制造事件。

## 本轮准确状态

| 项目 | 状态 |
|---|---|
| 代码实现 | 运行时/业务未改；新增外置测试 CODE_IMPLEMENTED |
| 本地验证 | 两镜像各 24 组目标测试、定向静态与独立审查通过；原构建/系统扫描/30 实库回归复用 |
| staging 精确 URL / runtime commit / 用户路径 | 未执行、未访问、未部署、未验收；没有本轮 staging 版本或 URL |
| production 改变 / runtime commit / 用户路径 | 未改变、未读取、未验收 |
| main / tag | 未改变；没有远端写入 |
| 产品负责人 | AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 未完成路由 | 本轮不实现或验收路由；不能据此宣称任何真实路由通过 |
| Placeholder | 正式页面 0；10 处原测试白名单，扫描已保存 |
| 外部副作用 | 用户最新限制前仅已授权官方公开只读下载；之后全部本地、无网络；无 push、CI、报告上传、配置/部署操作 |
| Finding | fixed_diff_verified；未 closed、未 risk_accepted，后续远端验证与 full 状态分开 |
| Release | RELEASE_NOT_READY / REMOTE_REVALIDATION_PENDING |

剩余实际事项：明确批准新候选的受限 FF/CI 后取回真实结果；正式完整镜像集合和 production 平台、PostgreSQL/Redis/Nginx/ops 制品前提、恢复控制器、Reviews online-index/maintenance-window 策略，以及独立 staging、真实飞书登录、角色/UAT与产品负责人确认。它们未因本轮适用性判定获得 PASS；本轮不再追加泛化 Node/OpenSSL 研究任务。
