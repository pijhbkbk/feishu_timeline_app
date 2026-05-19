# Remediation Tracker R19

> Round: `R19_SECURITY_AUDIT_FOR_PRIVATE_CLOUD_AND_FEISHU`
> Date: 2026-05-19

所有发现项必须进入本表。报告中不得包含真实密钥、token、cookie、数据库密码、飞书 App Secret 或测试账号密码。

| ID | 来源 | 风险等级 | 描述 | 影响模块 | 复现步骤 | 修复建议 | 负责人 | 状态 | 修复 commit | 复测结果 | 复测时间 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R19-HIGH-001 | Feishu / Auth | High | 飞书 OAuth state 原先只生成并传给飞书，服务端未保存、未校验、未一次性消费。 | `apps/api/src/modules/auth/auth.service.ts` | 回调传入任意或重复 state 仍会进入 code exchange。 | 将 state 存入会话存储，回调时校验 UUID、原子消费，缺失/过期/重复直接 401。 | Codex | Fixed | Pending commit | `auth.service.spec.ts` 3 项通过；`pnpm test` 通过 | 2026-05-19 |
| R19-HIGH-002 | File Upload | High | 附件上传原先只校验 MIME 和大小，缺少扩展名白名单、魔数、路径穿越文件名校验。 | `apps/api/src/modules/attachments/*` | 使用 `.jpg` 扩展但 HTML 内容，或 `../../evil.pdf` 文件名上传。 | 增加扩展名/MIME/魔数组合校验，拒绝路径穿越和危险扩展名，附件响应增加 `nosniff`。 | Codex | Fixed | Pending commit | R19 file upload security tests 通过；`pnpm test:e2e` 通过 | 2026-05-19 |
| R19-HIGH-003 | SCA | High | Next/Nest/Prisma 等依赖扫描存在高危或中危供应链告警。 | `package.json`, `pnpm-lock.yaml` | `pnpm audit` / OSV / Trivy 初扫。 | 在既有 major 范围内升级依赖并加 `postcss` override。 | Codex | Fixed | Pending commit | `pnpm audit`, OSV, Trivy fs 均 PASS | 2026-05-19 |
| R19-MED-001 | SAST / Container | Medium | API/Web Dockerfile 未显式切换非 root 用户运行。 | `apps/api/Dockerfile`, `apps/web/Dockerfile` | Semgrep Dockerfile 检查。 | 增加 `USER node` 并修正运行目录权限。 | Codex | Fixed | Pending commit | Semgrep 0 findings | 2026-05-19 |
| R19-MED-002 | DAST / Headers | Medium | CSP 仍包含 `script-src 'unsafe-inline'` 和 `style-src 'unsafe-inline'`。 | `apps/web/next.config.ts` | ZAP baseline production-build scan。 | 后续引入 CSP nonce / hash 或框架级 CSP 支持；本轮已移除生产 `unsafe-eval`。 | Codex | Deferred | N/A | ZAP 无 Critical/High；Medium 已记录 | 2026-05-19 |
| R19-INFO-001 | SCA | Info | Docker image scan skipped，因本地未构建 `feishu-timeline-api:latest` / `feishu-timeline-web:latest`。 | Container images | `run-sca.sh` image scan。 | 私有云镜像构建后重跑 Trivy image scan。 | User / IT | Deferred | N/A | Pending image build | N/A |
| R19-BLOCKER-001 | Private Cloud | Info | 公司私有云 IP/主机访问或导出的主机安全证据未提供。 | Private cloud deployment | 无法验证 SSH、端口、systemd、Nginx、PostgreSQL、Redis、备份恢复。 | 由公司 IT 提供授权主机或主机安全平台报告。 | User / IT | Open | N/A | Pending evidence | N/A |
| R19-BLOCKER-002 | Feishu Admin | Info | 飞书后台权限、可用范围、通讯录范围、发布审核证据未提供。 | Feishu workbench | 无法验证最小权限、可用范围和发布配置。 | 由飞书应用管理员提供截图/导出配置。 | User / Feishu Admin | Open | N/A | Pending evidence | N/A |

## Severity Rules

- Critical：必须修复并复测。
- High：必须修复，除非用户和公司信息安全明确书面风险接受。
- Medium：上线前尽量修复，否则记录 owner 和计划。
- Low / Info：记录即可。
