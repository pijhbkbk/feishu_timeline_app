# 轻卡新颜色开发项目管理系统安全审核报告 R19B

## 1. 审核结论

- 审核日期：2026-07-10
- 审核分支：`codex/r19b-security-remediation`
- 审核基线：`63f9be65f3ebeadc6237265a82b8f01a5e0c87ff`
- 厂商报告 SHA-256：`149d5fd2314b5bee6b98b93930498526c49930e0ab3ddb516f1c12f6ff02ffeb`
- 最终结论：`LOCAL_SECURITY_REMEDIATION_PASS / EXTERNAL_PRODUCTION_ACCEPTANCE_BLOCKED`

当前仓库范围内已确认的依赖、上传、认证、会话、浏览器策略、容器和安全门禁问题均已修复并通过本地复测。最终 SAST、依赖审计、Secrets、API/Web 镜像扫描均为 0 finding；生产 Web 构建无开发态 `eval-source-map` 标记；全量测试、E2E 和 30 条 Playwright 回归通过。

该结论不等同于生产安全验收通过。私有云主机与网络、真实 HTTPS/HSTS、飞书管理后台最小权限、认证态 staging DAST、最终发布镜像 digest/签名和部署目录权限仍缺少外部证据，因此发布门禁保持 `BLOCKED`。

## 2. 审核范围与方法

本轮按以下六项顺序执行，未跳轮：

| 顺序 | 工作 | 结果 |
|---:|---|---|
| 1 | 固化 R19B 基线，对厂商 PDF 的 156 项结果逐项归因 | PASS |
| 2 | 修复依赖、上传 DoS、认证与配置 fail-open 问题 | PASS |
| 3 | 对自研 TypeScript/TSX/配置源码重新执行 SAST | PASS，0 finding |
| 4 | 独立执行 SCA、生产构建、制品完整性和镜像扫描 | PASS，0 dependency/image vulnerability |
| 5 | 将 SAST、SCA、Secrets、Header、ZAP、镜像和制品检查改为 fail-closed，并接入 CI/部署前门禁 | PASS |
| 6 | 执行全量质量/安全回归并发布审核报告 | 本地 PASS；外部验收 BLOCKED |

审核覆盖当前 Git 索引及非忽略的未跟踪自研源码、依赖锁文件、API/Web 生产镜像、匿名本地 Web 响应和安全脚本。未主动扫描飞书域名、公司私有云或未授权的远端环境。

## 3. 厂商报告对账

厂商 PDF 共 6,609 页，列出 156 个 Medium 且全部标记为“未确认”。解析 `3.1` 至 `3.156` 的路径和规则后，结果如下：

| 类别 | `node_modules` | `.next` | 自研源码 | 合计 | 处置 |
|---|---:|---:|---:|---:|---|
| 弱哈希 | 80 | 0 | 0 | 80 | 协议、ETag、缓存键或依赖实现；依赖风险转 SCA |
| `setTimeout` / `setInterval` | 52 | 0 | 0 | 52 | 0 个字符串回调，字符串执行规则不成立 |
| `eval` | 0 | 22 | 0 | 22 | Next.js 开发构建产物；清理并用生产构建门禁验证 |
| YAML `load` | 2 | 0 | 0 | 2 | ESLint 开发依赖，无远程来源；依赖风险转 SCA |
| **合计** | **134** | **22** | **0** | **156** | **全部完成可审计归因** |

因此，正确口径是“156 项厂商结果全部闭环”，不是“156 个真实自研漏洞均已修复”。厂商报告没有 Git revision、源文件清单或扫描包哈希，且将依赖和生成目录混入 SAST，不能单独作为源码安全通过或失败的证据。详细证据见 `docs/security/VENDOR_SAST_TRIAGE_R19B.md`。

## 4. 初始风险基线

### 4.1 依赖漏洞

- 生产依赖：Critical 0 / High 1 / Moderate 2。
- 全依赖图：8 个 advisory、9 个受影响版本计数。
  - Critical：Vitest `CVE-2026-47429`、shell-quote `CVE-2026-9277`。
  - High：Vite `CVE-2026-53571`、Multer `CVE-2026-5079`。
  - Moderate：Vite `CVE-2026-53632`、Multer `CVE-2026-5038`、js-yaml `CVE-2026-53550`。
  - Low：esbuild `GHSA-g7r4-m6w7-qqqr` 命中两个旧版本。

### 4.2 已确认的代码与控制问题

| ID | 风险 | 初始问题 |
|---|---|---|
| UPLOAD-01 | High | 六个 multipart 路由缺少统一的传输层大小、数量和复杂度限制，可造成内存/解析压力 |
| AUTH-01 | High | Mock 登录配置存在生产误开启风险，示例环境文件参与运行时加载 |
| AUTH-02 | High | OAuth `state` 未与发起登录的浏览器绑定，回调查询参数在提交前仍保留在 URL |
| AUTH-03 | High | 飞书用户同步可能把已锁定/停用用户重新激活并创建会话 |
| AUTH-04 | High | 生产 Redis 故障时会话/限流可能退回进程内存，限流计数非原子且缺少全局容量控制 |
| WEB-01 | High | 缺少每请求 nonce CSP，生产脚本策略不能可靠阻断内联脚本注入 |
| PIPE-01 | High | 部分扫描、响应头、DAST 和镜像门禁可能在工具错误、无效 JSON 或缺失报告时放行 |
| DEPLOY-01 | High | staging 配置默认值、旧镜像复用、未扫描待部署镜像和环境文件权限存在发布风险 |
| IMAGE-01 | High | 原运行镜像包含不需要的包管理器及其依赖，扩大攻击面并带入可检测 CVE |

## 5. 修复结果

### 5.1 依赖与镜像

- 升级并锁定：Multer 2.2.0、js-yaml 4.3.0、Vitest 3.2.7、Vite 7.3.6、esbuild 0.28.1、shell-quote 1.8.4，以及对应 NestJS/Swagger 补丁版本。
- SCA 同时扫描完整 workspace 和生产依赖，任意严重度 advisory 或工具失败均阻断。
- API/Web 运行镜像改为 Node 24 Alpine、非 root 用户，移除运行时 npm/corepack；只有对象存储目录对应用用户可写。
- 最终镜像：
  - API：`sha256:b4de34c39be3cad6aaa97d5fcb7e02bacc34d29b782ae2d06baacb9924b2f6db`
  - Web：`sha256:1438539b9f32d907063f6b83b0da2efc3f857b758e9e082557ceb0132026e790`

### 5.2 上传安全

- 六个 multipart 路由统一限制：20 MiB、1 个文件、4 个字段、5 个 part、字段名 64 字节、字段值 1,024 字节、20 个 header pair、嵌套深度 0。
- 限制在 Controller 和业务持久化前执行；超大文件返回 413，嵌套 multipart 字段返回 400。
- 附件仍只保存对象存储元数据，不把二进制写入 PostgreSQL。

### 5.3 认证、OAuth 与会话

- Mock 登录默认关闭；生产环境一旦开启即在配置启动阶段失败，Service 另有第二层拒绝。
- 运行时不再把 `.env.example` 当作配置来源。
- OAuth `state` 增加 10 分钟 HttpOnly、SameSite=Lax、生产 Secure 的浏览器绑定 cookie；执行精确匹配、Redis 一次性消费和回调后清理。
- 非法 `code/state` 在换取身份前拒绝；前端在提交授权码前清除回调 URL 查询参数，并设置 `no-referrer`、`no-store`。
- `INACTIVE`/`LOCKED` 用户不再被飞书同步自动恢复为 `ACTIVE`，创建会话前再次拒绝。
- 生产 Redis 不可用时返回 503，不退回进程内存；开发内存存储限制为 512 条并清理过期项。
- Redis 限流计数使用原子 Lua；登录 URL 与回调同时设置客户端和全局速率限制。反向代理必须覆盖 `X-Real-IP`，否则使用 socket 地址。

### 5.4 Web 与浏览器安全

- Next.js middleware 为每个请求生成 CSP nonce，并传给框架脚本。
- 生产 `script-src` 不含 `unsafe-inline` 或 `unsafe-eval`，启用 `strict-dynamic`，禁止 `script-src-attr`。
- 保留业务当前需要的 `style-src-attr 'unsafe-inline'`，并将其列为后续可收紧项。
- 本地生产容器的 9 个页面均通过 CSP、nosniff、frame、referrer、permissions、cache 和 cookie 规则检查。

### 5.5 安全门禁与部署

- Semgrep、pnpm audit、Gitleaks、Trivy、ZAP、响应头和生产制品检查均校验工具退出码、报告存在性与 JSON schema；工具失败和无效报告不再解释为通过。
- CI 使用固定 scanner 镜像 digest，执行全历史 Secrets、SAST、完整/生产依赖 SCA、生产制品检查和 API/Web 镜像扫描。
- staging 部署默认拒绝脏工作树，强制重建、拉取基础镜像并扫描实际待部署镜像；环境文件必须仅 owner 可读写。
- staging 配置拒绝 Mock 登录、占位凭证、弱 PostgreSQL/Redis 密码和无认证 Redis URL。
- Web 构建完整性清单包含 105 个文件；生成和复核命令均 fail-closed，当前差异为 0。

## 6. 最终验证结果

| 验证项 | 最终结果 |
|---|---|
| Semgrep 1.169.0 | 347 个候选 TS/TSX/config 文件、83 条规则、0 finding、0 scanner error |
| `pnpm audit --audit-level low` | 486 dependencies；Critical/High/Moderate/Low/Info 全部为 0 |
| `pnpm audit --prod --audit-level low` | Critical/High/Moderate/Low/Info 全部为 0 |
| Gitleaks 8.30.1 | 当前工作树 0；完整 Git 历史 0 |
| Trivy 0.72.0 | API 0、Web 0，扫描所有严重度 |
| 生产 Web 制品 | 有效 `BUILD_ID`；开发态 eval/sourceURL 标记 0 |
| 构建完整性 | 105 个文件；复核差异 0 |
| 安全响应头 | 9/9 PASS |
| ZAP baseline | Critical 0 / High 0 / Medium 0 / Low 1 / Info 7 |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | Web 22 files / 67 tests；API 51 files / 151 tests，全部 PASS |
| `pnpm test:e2e` | PASS |
| `pnpm playwright:test` | 30/30 PASS |
| Web/API build、Prisma validate | PASS |
| 安全门禁负向测试 | PASS；已覆盖工具失败、缺失/无效报告和阻断 finding |

ZAP 的 1 个 Low 是根路径 307 跳转携带 Next.js RSC/HTML 响应体的 “Big Redirect”。人工复核未发现 token、cookie、凭证或业务敏感字段，且响应为 private/no-cache/no-store，因此接受为框架行为造成的低风险误报。7 个 Info 来自 CSP nonce 的 Base64 外观、现代 Web 应用、不可缓存内容以及扫描器请求缺少浏览器 `Sec-Fetch-*` 头，不构成可利用漏洞。

## 7. 残余风险与外部门禁

以下项目不是当前已确认但未修复的 Critical/High 漏洞，但必须在生产放行前处理或取得责任人书面接受：

1. SAST 当前覆盖自研 TypeScript/TSX 和 executable config；普通 `.mjs/.js`、Shell、Workflow、Dockerfile 通过 lint、语法、负向门禁和构建验证，但未全部进入同一 Semgrep 语言规则集。
2. CI 只扫描 API/Web 应用镜像；PostgreSQL、Redis、Nginx 基础设施镜像尚未固定 digest 并纳入同一 Trivy 门禁。
3. 上传采用内存缓冲。单请求已限制为 20 MiB，但尚无上传并发限制、Nginx `limit_conn` 或容器内存上限；被盗的有权限账号仍可能制造并发内存压力。
4. 客户端限流依赖可信 Nginx 覆盖 `X-Real-IP`；代理拓扑变化后必须重新验证。
5. 工作树尚未形成干净、不可变的最终 commit，当前扫描结果不能替代干净 commit 上的 CI 复跑和发布签名。
6. 私有云主机、防火墙、Nginx TLS/HSTS、PostgreSQL/Redis 权限、备份恢复、静态目录权限缺少本轮授权证据。
7. 飞书后台最小权限、可用范围、通讯录范围和发布配置缺少管理员导出证据。
8. 尚未执行授权的认证态 staging DAST，也未按实际 registry digest 验证已部署镜像。

## 8. 发布判定与下一步

本地代码整改判定为 `PASS`，但因外部部署风险证据尚未闭环，不得自动进入下一功能轮；生产发布仍判定为 `BLOCKED`。放行前必须：

1. 将本轮变更评审后提交到干净 commit，并在该 commit 上重跑全部 CI 安全与质量门禁。
2. 固定并扫描 PostgreSQL、Redis、Nginx 镜像 digest；为 API/Web 发布镜像生成 SBOM、签名并按 registry digest 重扫。
3. 在授权 staging 上执行真实 HTTPS/HSTS、认证态 DAST、权限/IDOR 和上传并发压力测试。
4. 取得飞书管理员配置导出和私有云主机/网络/数据库/备份/静态目录权限证据。
5. 由安全负责人、系统负责人和发布负责人共同签署生产例外或最终放行记录。

## 9. 证据索引

- 厂商对账：`docs/security/VENDOR_SAST_TRIAGE_R19B.md`
- SAST：`docs/security/SAST_REPORT_R19.md`
- SCA：`docs/security/SCA_REPORT_R19.md`
- Secrets：`docs/security/SECRETS_SCAN_R19.md`
- 响应头：`docs/security/SECURITY_HEADERS_R19.md`
- ZAP：`docs/security/DAST_ZAP_REPORT_R19.md`
- 制品完整性：`docs/security/WEB_TAMPER_PROTECTION_R19.md`
- 镜像扫描：`reports/security/image-sca/summary.md`
- R19B 轮次：`docs/rounds/R19B.md`
- 执行台账：`docs/EXECUTION_LEDGER.md`
