# Security Acceptance R19

> Round: `R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU`
> Date: 2026-05-19
> Current recommendation: FAIL

## 1. 检查范围

- 系统名称：轻卡定制颜色开发项目管理系统
- 范围基线：`docs/security/SECURITY_SCOPE_R19.md`
- 检查清单：`docs/security/SECURITY_CHECKLIST_R19.md`
- 威胁模型：`docs/security/THREAT_MODEL_R19.md`

本轮覆盖代码、依赖、接口、权限、附件、主机、飞书接入、网页防篡改和业务逻辑安全。飞书开放平台自身域名、公司未授权 IP、拒绝服务测试、账号爆破、破坏性数据删除和真实恶意样本上传均不在授权范围内。

## 2. 检查方法

- 基础质量门禁：lint、typecheck、unit/API tests、build、E2E、Playwright。
- SAST：ESLint、TypeScript、Semgrep、危险模式检索。
- SCA：pnpm audit、OSV、Trivy filesystem、Trivy image。
- Secrets：gitleaks、git history secret scan、环境文件清单、敏感 key 名称位置扫描、`.gitignore` 检查。
- DAST：OWASP ZAP baseline，仅针对本地 production build；生产和飞书域名未做主动扫描。
- 安全专项测试：Feishu OAuth state、权限越权、文件上传、输入输出、业务逻辑、主机检查、网页防篡改。

## 3. 测试环境

| Environment | URL / Target | Authorization | Active Test |
|---|---|---|---:|
| local | `http://localhost:3000`, `http://localhost:3001/api` | Authorized by R19 scope | Yes |
| local production build | `http://host.docker.internal:3000` | Authorized by R19 scope | ZAP baseline only |
| staging | 未提供 | Not authorized yet | No |
| production smoke | `https://timeline.all-too-well.com` | Passive / smoke only | No active scan |
| company private cloud | 待提供 | Not authorized yet | No |

## 4. 被测版本

- Branch: `feat/security-audit-r19`
- Base commit when tests ran: `4ce7e8a`
- Final R19 commit: see Git commit after this report is committed.

## 5. 被测服务器 IP / 域名

| Target | Value | Status |
|---|---|---|
| Local web | `http://localhost:3000` | Tested |
| Local API | `http://localhost:3001/api` | Tested through unit/E2E/Playwright |
| Local ZAP target | `http://host.docker.internal:3000` | Tested |
| Staging URL | 未提供 | Not tested |
| Production URL | `https://timeline.all-too-well.com` | Not actively scanned |
| 当前 VPS IP | 待确认 | Not recorded in repo |
| 公司私有云 IP | 待提供 | Not tested |

## 6. 测试账号说明

账号密码不得写入仓库。测试账号应通过公司密码管理器、飞书私聊或公司安全渠道交付。

自动化使用本地模拟登录和种子数据，覆盖 `project_manager`、`finance` 等角色边界；真实飞书测试账号和私有云测试账号仍需用户/公司信息安全提供。

## 7. 执行命令结果

| Command / Tool | Result |
|---|---|
| `pnpm install` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, Web 20 files / 61 tests, API 48 files / 129 tests |
| `pnpm --filter @feishu-timeline/api build` | PASS |
| `pnpm --filter @feishu-timeline/web build` | PASS |
| `pnpm test:e2e` | PASS |
| `pnpm playwright:test` | PASS after installing missing Chromium browser |
| `bash scripts/security/run-sast.sh` | PASS after triage |
| `bash scripts/security/run-sca.sh` | PASS_WITH_IMAGE_SCAN_GAP |
| `bash scripts/security/run-secrets-scan.sh` | PASS |
| `bash scripts/security/run-zap-baseline.sh` | PASS_WITH_MEDIUM_FINDINGS |
| `bash scripts/security/check-security-headers.sh` | PASS_WITH_MEDIUM_FINDINGS |
| `bash scripts/security/host-security-check.sh` | BLOCKED_PRIVATE_CLOUD_EVIDENCE_PENDING |
| `bash scripts/security/generate-build-integrity.sh` | PASS local |
| `bash scripts/security/check-build-integrity.sh` | PASS local |

## 8. 扫描工具

| Tool | Purpose | Status |
|---|---|---|
| ESLint / TypeScript | SAST baseline | PASS |
| Semgrep | OWASP / JS / TS SAST | PASS, 0 findings |
| pnpm audit | SCA | PASS |
| osv-scanner | SCA | PASS |
| Trivy fs | SCA | PASS |
| Trivy image | Image SCA | SKIPPED, images not built locally |
| gitleaks | Secret scan | PASS |
| OWASP ZAP | DAST baseline | PASS_WITH_MEDIUM_FINDINGS |
| curl | Headers | PASS_WITH_MEDIUM_FINDINGS |

## 9. 发现项汇总

| Severity | Count | Status |
|---|---:|---|
| Critical | 0 | N/A |
| High | 3 | Fixed and retested |
| Medium | 3 | 2 fixed, 1 deferred CSP hardening |
| Low | 1 | Accepted |
| Info | 6 | Accepted or evidence pending |

High fixed items:

- Feishu OAuth state missing server-side one-time validation.
- File upload missing extension/magic/path traversal validation.
- Dependency/SCA High findings from initial scan.

## 10. Critical / High Closure

All confirmed Critical / High code or dependency vulnerabilities are fixed and retested. There are no open Critical / High application vulnerabilities in this R19 local audit.

## 11. Security Domain Results

| Domain | Result | Report |
|---|---|---|
| SAST | PASS | `docs/security/SAST_REPORT_R19.md` |
| SCA | PASS_WITH_IMAGE_SCAN_GAP | `docs/security/SCA_REPORT_R19.md` |
| Secrets | PASS | `docs/security/SECRETS_SCAN_R19.md` |
| DAST | PASS_WITH_MEDIUM_FINDINGS | `docs/security/DAST_ZAP_REPORT_R19.md` |
| Security headers | PASS_WITH_MEDIUM_FINDINGS | `docs/security/SECURITY_HEADERS_R19.md` |
| Permissions / IDOR | PASS | `docs/security/PERMISSION_TEST_REPORT_R19.md` |
| File upload | PASS | `docs/security/FILE_UPLOAD_SECURITY_R19.md` |
| Input security | PASS_WITH_MEDIUM_FINDINGS | `docs/security/INPUT_SECURITY_R19.md` |
| Business logic | PASS | `docs/security/BUSINESS_LOGIC_SECURITY_R19.md` |
| Feishu OAuth code | PASS_CODE_LEVEL | `docs/security/FEISHU_WORKBENCH_SECURITY_R19.md` |
| Feishu admin config | BLOCKED_ADMIN_EVIDENCE | `docs/security/FEISHU_WORKBENCH_SECURITY_R19.md` |
| Private cloud host | BLOCKED_PRIVATE_CLOUD_EVIDENCE | `docs/security/PRIVATE_CLOUD_SECURITY_R19.md` |
| Web tamper protection | PASS_LOCAL_BLOCKED_REMOTE | `docs/security/WEB_TAMPER_PROTECTION_R19.md` |

## 12. 密钥扫描结果

No confirmed secret leak was found. Reports do not include secret values.

## 13. 权限越权结果

No IDOR or role bypass was found in automated local tests. Private-cloud authenticated UAT with company accounts is still pending.

## 14. 文件上传结果

The High upload validation gap was fixed. Dangerous extensions, path traversal names, MIME spoofing and magic-byte mismatch are rejected.

## 15. Feishu 接入结果

Code-level OAuth state validation is fixed and retested. Feishu workbench listing still cannot pass until the application administrator confirms redirect URL, permission scope, availability range, address-book scope, mobile/desktop URLs and release-review materials.

## 16. 主机 / 私有云结果

Local host output was collected. Company private-cloud host hardening cannot pass because target IP/access/evidence was not provided.

## 17. 网页防篡改结果

Local build integrity manifest generation and recheck passed. Remote deployment directory permissions, Nginx static directory read-only state and post-deploy hash comparison remain pending.

## 18. 剩余风险

- CSP still allows inline scripts/styles. This is Medium and deferred to a nonce/hash hardening round.
- Docker image scan must be rerun after private-cloud images are built.
- Staging URL was not provided, so authenticated staging DAST was not executed.
- Company private-cloud host/IP/access or host security platform evidence was not provided.
- Feishu administrator configuration evidence was not provided.

## 19. 上线建议

FAIL.

Reason: Application Critical/High findings are fixed, but this is not yet sufficient for company private-cloud deployment and Feishu workbench listing because private-cloud host evidence and Feishu admin configuration evidence are missing. Reclassify to `PASS_WITH_RISK_ACCEPTANCE` or `PASS` only after those evidence gaps are closed and, if required, Docker image scans pass.

## 20. 需要用户或公司信息安全确认

- 公司私有云服务器 IP、SSH/主机安全平台证据、开放端口、Nginx TLS/HSTS、PostgreSQL/Redis 监听范围、备份恢复证据。
- 飞书后台 App ID 所属应用的 redirect URL、权限列表、应用可用范围、通讯录范围、桌面/移动主页 URL、发布说明和测试账号交付方式。
- 是否接受 CSP inline Medium 风险并安排后续 nonce/hash hardening。
- 是否提供 staging 环境用于认证后 DAST。
