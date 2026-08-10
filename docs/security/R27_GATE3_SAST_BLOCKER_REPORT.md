# R27 Gate 3 第一方 SAST 阻断与人工审计报告

## 结论

记录时间：`2026-08-10`（Asia/Shanghai）

```text
R27_GATE3_FIRST_PARTY_SAST=BLOCKED
FORMAL_SEMGREP_STATUS=TOOL_ERROR
FORMAL_SEMGREP_FINDINGS=NOT_PRODUCED
FORMAL_SEMGREP_PARSE_ERRORS=NOT_PRODUCED
SEMGREP_ATTEMPTS=2
CONFIRMED_FIRST_PARTY_CRITICAL=0
CONFIRMED_FIRST_PARTY_HIGH_GROUPS=2
CONFIRMED_FIRST_PARTY_MEDIUM_GROUPS=3
NEW_NEEDS_SECURITY_REVIEW=2
TOTAL_OPEN_NEEDS_SECURITY_REVIEW=15
SOURCE_FIXES_STARTED=NO
PRODUCTION_CHANGED=NO
STOP
```

固定 Semgrep 门禁在镜像解析阶段连续两次收到 Docker Hub `Service Unavailable`，没有进入
Semgrep 解析或规则执行阶段。根据 `AGENTS.md` 第 12.13 节，同一门禁连续失败两次后停止，
不得进行第三次盲目尝试，也不得把工具错误解释为零发现或 PASS。

与此同时，对不可变第一方源码包完成的 TypeScript AST、Bash 语法和人工 source-to-sink
审计已经确认 5 组真实问题。当前不能确认第一方源码 Critical/High/Medium 为 0，不能进入修复、
复扫或公司正式复扫闸门。

## 1. 失败环境与不可变输入

| 项目 | 值 |
|---|---|
| worktree | `/Users/lixiaochen/Downloads/feishu_timeline_app-r27-security` |
| branch | `security/r27-final-source-clearance` |
| evidence HEAD（扫描开始时） | `4a1b4abfbb1d18278ca8438c0b1d1085243e2daf` |
| approved source commit | `27a0338ac0c59217d121fa6defe0feeec45ca252` |
| source archive | `company-source-scan-27a0338ac0c5.tar.gz` |
| source archive SHA-256 | `83aff4f1474819ba370088418f018ddf1de29238d9745bf4139580f09864d940` |
| archive files | `627` |
| archive `node_modules` / `.next` | `0 / 0` |
| exact URL | `N/A`；本门禁是离线源码 SAST，没有访问 staging 或 production |
| Docker | `29.5.2` |
| Node | `v24.14.0` |
| pnpm | `9.15.4` |
| TypeScript AST parser | `5.9.3` |
| Bash | `3.2.57` |

本次所有源码结论均绑定批准的 source commit 和源码包 SHA-256，不把较新的治理 evidence
commit 当作运行时代码输入。没有启动应用容器，没有执行 migration，没有访问 production。

## 2. 正式 Semgrep 阻断

仓库固定的扫描器身份：

```text
Semgrep 1.169.0
docker.io/semgrep/semgrep:1.169.0@sha256:2b33f46ba66cf8cc2ad59ccfa7d22951fd00c632c38f1339e84ec8e6e641a942
```

在源码包的临时解包目录初始化仅用于 target 枚举的临时 Git 元数据后，执行：

```bash
bash scripts/security/list-sast-targets.sh
```

当时枚举出 `503` 个目标。随后执行仓库正式入口：

```bash
SECURITY_REPORT_DIR=/tmp/r27-gate3-sast.CBDJi4/formal-reports \
SAST_DOC_REPORT=/tmp/r27-gate3-sast.CBDJi4/SAST_REPORT_R27.md \
bash scripts/security/run-sast.sh
```

### 第一次失败

```text
Unable to find image 'semgrep/semgrep:1.169.0@sha256:2b33f46...' locally
docker: Error response from daemon: failed to copy:
Get "https://registry-1.docker.io/v2/semgrep/semgrep/manifests/sha256:2b33f46...":
Service Unavailable
```

结果：Docker rc `125`，`semgrep.status=TOOL_ERROR`。失败发生在镜像解析阶段，
`semgrep.json` 不是可接受结果，findings 和 parse errors 均为 `NOT_PRODUCED`。

### 第二次失败

只对同一个固定 digest 执行一次直接拉取确认：

```bash
docker pull \
  docker.io/semgrep/semgrep:1.169.0@sha256:2b33f46ba66cf8cc2ad59ccfa7d22951fd00c632c38f1339e84ec8e6e641a942
```

结果仍为：

```text
Head "https://registry-1.docker.io/v2/semgrep/semgrep/manifests/sha256:2b33f46...":
Service Unavailable
```

没有第三次正式 Semgrep 门禁执行。此前曾短暂启动非批准 Semgrep `1.172.0` 的隔离环境
下载；发现版本不匹配后立即中止，未完成安装、未执行扫描、未用于任何结论，临时目录已精确
删除。正式固定 digest 的失败次数仍严格为两次。

### 根因与下一方案

- 直接根因：Docker Hub registry 在解析固定 Semgrep manifest digest 时连续返回服务不可用。
- 这不是项目源码 parse error，也不是 Semgrep finding；扫描器尚未启动。
- 恢复条件：Docker Hub 外部状态恢复后，由新的明确继续指令重新运行同一个固定 digest；或由
  安全负责人批准一个可验证、内容相同的精确镜像镜像源。
- 若改用镜像源，必须先证明镜像内容/digest 与批准的 Semgrep `1.169.0` 一致；不得静默升级
  引擎或规则。
- 是否需要用户决定：需要外部状态变化后的明确恢复，或批准替代的精确分发路径。

## 3. 正式目标清单覆盖缺口

当前 `scripts/security/list-sast-targets.sh` 只纳入 TS/TSX、少量 config JS/MJS 和 tsconfig。
对源码包逐项比对发现 `65` 个第一方可执行脚本未进入 503-target 正式清单：

| 类型 | 源码包总数 | 正式 target | 漏扫 |
|---|---:|---:|---:|
| `.sh` | 49 | 0 | 49 |
| `.mjs` | 15 | 3 | 12 |
| `.js` | 4 | 0 | 4 |

漏扫范围包括全部部署、迁移、安全和负载 Shell 脚本，也包括本轮确认命令注入的三个脚本。
即使 Docker Hub 恢复，当前 503-target 集合也不能代表完整的第一方 SAST。

此外，`run-sast.sh` 固定了 Semgrep 引擎镜像 digest，但 `p/owasp-top-ten`、
`p/javascript`、`p/typescript` 仍是运行时解析的可变 registry ruleset。最终复扫必须把批准的
规则文件或规则集版本及 SHA-256 固定到仓库，并增加 Shell 脚本门禁。

人工解析补证：

```text
TS/TSX/JS/MJS/MTS files=516
TS-family lines=106159
TypeScript AST parse errors=0
Bash files=49
bash -n parse errors=0
```

这些人工 parse 结果不能替代未产生的正式 Semgrep 报告。

## 4. 已确认修复清单

### G3-SAST-001 — logout 未失效服务端会话

```text
severity=HIGH
disposition=FIX_REQUIRED
CWE=CWE-613
productionReachable=true
securitySensitiveUse=true
```

数据流：

1. `apps/api/src/modules/auth/auth.controller.ts:110` 将 logout 标为 `@Public()`。
2. `apps/api/src/modules/auth/session-auth.guard.ts:22-29` 对 public route 提前返回，没有读取
   cookie，也没有设置 `request.sessionToken`。
3. `apps/api/src/modules/auth/auth.controller.ts:117` 因此把 `undefined` 传给 logout service。
4. `apps/api/src/modules/auth/auth.service.ts:194-199` 只在 token 存在时删除 Redis key，随后
   无条件清除浏览器 cookie。
5. 结果是客户端 cookie 被清除，但旧 cookie 对应的 Redis session 最长仍可保留默认 8 小时。

现有 `auth.controller.spec.ts` 明确断言传入 `undefined`，固化了错误行为；service 单测只证明
手工传入 token 时能删除；现有负载/Playwright logout helper 没有重放旧 cookie。

修复前必须先增加 HTTP 集成复现：登录取得 cookie A → logout → 重放 A → 当前失败；修复后
必须返回未认证。logout 仍应允许无 cookie/过期 cookie 的幂等清理。由于会修改 Session/Auth，
后续至少重跑认证态 `10 VU × 30 分钟`、并发/幂等和完整生命周期主链路。

### G3-SAST-002 — 三个生产运维脚本存在 CLI/远端脚本命令注入

```text
severity=HIGH
disposition=FIX_REQUIRED
CWE=CWE-78
productionReachable=true (production deployment/backup/operations surface)
securitySensitiveUse=true
```

直接 sink：

- `scripts/deploy/ops-check.sh:14-21`
- `scripts/deploy/backup-postgres.sh:11-16`
- `scripts/deploy/check-http-errors.sh:11-15`

三者都把匹配 `INSTANCE=*|PROJECT=*|ZONE=*` 的 CLI 字符串直接传给 `eval "$arg"`。
`$()`、反引号、分号或换行会在调用 gcloud 前以部署操作员/CI 权限执行。

还有两个远端源码插值 sink：

- `backup-postgres.sh:29-35` 把 CLI 派生值插入未加引号 heredoc 中；
- `check-http-errors.sh:81-89` 以原始字符串替换把 `LINES`、`JOURNAL_SINCE` 写入远端
  Bash 源码的双引号赋值。

修复必须移除 `eval`，按变量名显式赋值，对 GCP 标识、整数、`yes|no`、批准备份目录和时间
范围分别做严格 allowlist，并通过位置参数或安全编码数据传给远端脚本。增加 `$()`、反引号、
分号、引号、CR/LF、空格和路径边界的负向 Shell 测试。

### G3-SAST-003 — 附件可下载前没有恶意文件扫描或隔离状态

```text
severity=MEDIUM
disposition=FIX_REQUIRED
CWE=CWE-434
productionReachable=true
userInputReachable=true (requires attachment.manage)
securitySensitiveUse=true
```

现有上传链路校验大小、文件名、扩展名、MIME 和浅层 magic/signature；Office 容器检查主要是
ZIP header 和内部标记。`attachments.service.ts` 在没有 scanner verdict 的情况下立即写对象存储，
授权用户随后即可下载。响应 `nosniff`、sandbox CSP 和 attachment disposition 不能防止下载后由
Office/PDF/图像解析器处理恶意内容。

修复必须引入 `PENDING_SCAN → CLEAN | REJECTED | ERROR`、不可下载 quarantine、私有云批准
扫描器及 fail-closed 行为。只有 `CLEAN` 可绑定、预览和下载；审计应记录 SHA-256、扫描器版本、
签名库、verdict 和时间。使用隔离 EICAR fixture 覆盖拒绝、扫描器不可用和下载负向路径。

### G3-SAST-004 — 通知日志暴露业务身份和项目元数据

```text
severity=MEDIUM
disposition=FIX_REQUIRED
CWE=CWE-532
productionReachable=true
securitySensitiveUse=true
```

`apps/api/src/modules/feishu-messages/feishu-messages.service.ts:14-17` 把 `userId`、完整 title 和
`dedupeKey` 写入应用日志。上游 title 可含项目名称；dedupe key 可含用户 ID、任务 ID、日期或
轮次。未发现 cookie、session/OAuth token 或密码直接写入该日志，本 finding 限于业务身份和
项目机密元数据。

修复后日志只允许事件类型、成功/失败和不可逆限域 correlation/hash ID；增加 logger spy 负向
断言，确保 title、userId、taskId、dedupeKey、正文和 token-like 字符串不进入日志。

### G3-SAST-005 — 部署引导以 root 执行未固定远端脚本

```text
severity=MEDIUM
disposition=FIX_REQUIRED
CWE=CWE-494
productionReachable=true (host bootstrap/migration surface)
securitySensitiveUse=true
```

位置：

- `scripts/migration/bootstrap_gcp.sh:64`
- `scripts/deploy/gce-bootstrap.sh:34`

两处从固定 HTTPS host 下载 NodeSource setup 脚本后直接 pipe 给 root shell，没有固定内容
digest、签名或离线审核。应改为正式 keyring + 固定 apt repository/显式版本包，或在仓库中
保存经批准 artifact 并先验证 SHA-256/签名；禁止 `curl | bash`，并测试 hash 不匹配时执行前
fail-closed。

## 5. 新增待安全复核候选

### G3-CAND-001 — notification `linkPath` 缺少站内相对路径校验

```text
severity=LOW (current)
disposition=NEEDS_SECURITY_REVIEW
productionReachable=true
userInputReachable=admin + system.manage only
```

内部通知接口接受任意字符串 `linkPath`，队列和数据库原样保存，Web 最终传给 Next `<Link>`。
尚未证明 XSS 或 Medium 影响。授权 staging 需验证外部 URL、protocol-relative、`javascript:`、
反斜杠、控制字符和编码 scheme；若浏览器确认脚本执行或非 admin 可控，应升格。推荐直接约束为
规范化站内绝对路径白名单，Web 端再做第二道拒绝。

### G3-CAND-002 — 缺失 Origin 的 mutation 被允许

```text
severity=LOW (current)
disposition=NEEDS_SECURITY_REVIEW
```

跨站非同源 Origin 会被拒绝，session cookie 为 `SameSite=Lax`；但 `same-origin.middleware.ts`
有意允许缺失 Origin 的 mutation。Gate 7 应验证 HTML form、fetch/XHR、`Origin: null`、缺失
Origin 的服务调用认证方式，以及是否存在有副作用的 GET。

另有本地对象存储 adapter 未做 canonical containment，但当前 storageKey 由服务端 UUID/枚举/
数据库 ID 构造，没有发现 HTTP 输入可控路径，暂记 `FALSE_POSITIVE` 并建议防御性 `resolve()`
containment。

## 6. 重点危险模式人工结论

| 检查项 | 结果 | 研判 |
|---|---:|---|
| JavaScript global `eval()` | 0 | 无确认 JS eval；Shell `eval` 见 G3-SAST-002 |
| Redis member `.eval()` | 2 | 静态 Lua 常量，输入仅为 KEYS/ARGV |
| `new Function()` | 0 | 无 |
| 字符串 timer | 0 | 14 个 timer 首参均为 callable |
| production `child_process` | 0 | 6 个 import 均在测试/负载脚本，未用 `shell:true` |
| Prisma unsafe raw query | 0 | 唯一 `$queryRaw` 使用 `Prisma.sql` 参数绑定 |
| `dangerouslySetInnerHTML` / DOM HTML assignment | 0 | 无 |
| 用户输入 dynamic import/require | 0 | 无 |
| production dynamic RegExp / confirmed ReDoS | 0 | 无 |
| 第一方 MD5/SHA-1 | 0 | 第一方 hash 调用为 SHA-256 |
| prototype pollution sink | 0 | 无 request → computed write/deep merge sink |
| admin mass assignment | 0 | 全局 whitelist/forbid + 显式字段赋值 |
| 用户 URL → server fetch | 0 | production fetch 仅固定 Feishu CN OAuth endpoint |
| 用户输入 open redirect | 0 | OAuth redirect 目标为固定 Feishu CN endpoint |

这些结论来自人工 AST/source-to-sink 审计，不得冒充正式 Semgrep 结果。

## 7. 当前缺陷总账与停止点

Gate 3 当前已确认：

```text
Critical=0 known confirmed findings
High=2 first-party finding groups
Medium=3 first-party finding groups
Needs Security Review=2 new candidates
Formal Semgrep assurance=NOT ESTABLISHED
```

Gate 4 还确认生产依赖/镜像存在独立 High，详见
`docs/security/R27_GATE4_SCA_INITIAL_REPORT.md`；Gate 5 已确认 secrets 为 0，详见
`docs/security/R27_GATE5_SECRETS_REPORT.md`。

在恢复后，必须按以下顺序闭环：

1. 先为 5 组确认问题增加失败复现测试；
2. 修复业务/运维源码；
3. 修复 target manifest，并固定 Semgrep ruleset；
4. 对所有确认问题执行目标测试和全量质量门禁；
5. 重新运行正式 SAST 并逐项审阅 machine-readable findings 与 parse errors；
6. 在授权 staging 做 logout 旧 cookie、linkPath、CSRF/Origin 和恶意文件隔离动态复测；
7. 根据 Auth/Session、附件扫描架构和依赖/镜像变更执行风险对应的稳定性测试；
8. 只有当前 Critical/High/Medium、未研判和密钥均为 0 后，才可提交公司正式复扫。

当前停点：

```text
BLOCKER_REPORT
R27_GATE3_FIRST_PARTY_SAST_BLOCKED
FORMAL_SEMGREP_TOOL_ERROR_AFTER_2_ATTEMPTS
FIXES_NOT_STARTED
NO_STAGING_DAST
NO_PRODUCTION_DEPLOYMENT
STOP
```
