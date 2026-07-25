# R26P 部署前验收

## 门禁结果

| Gate | 结果 | 说明 |
| --- | --- | --- |
| Gate 0 仓库和源码 | PASS | source、release 和 runtime 完整提交已确认并推送 |
| Gate 1 发布分支 | PASS | `release/r26-v2-production` 已推送 |
| Gate 2 正式 V2 路由 | PASS | 候选版本正式路由、V1 fallback 和生产配置已完成 |
| Gate 3 安全快检 | PASS | 第一方 Critical/High/Medium、依赖 Critical/High、镜像 Critical/High 和 secrets 均为 0 |
| Gate 4 全量回归 | PASS | lint、typecheck、unit、build、Prisma、E2E 和 Playwright 全部通过 |
| Gate 5 不可变构建 | PASS | 候选镜像与完整 runtime commit 绑定 |
| Gate 6 备份与恢复演练 | PASS | 生产 dump、SHA256、清单和隔离 schema 恢复演练通过 |
| Gate 7 生产部署 | PASS | exact runtime、五项服务、TLS、DNS、API 和正式路由通过 |
| Gate 8 生产 smoke | **FAIL** | 真实飞书 OAuth 授权页拒绝当前账号 |
| Gate 9 回滚 | PASS | exact rollback commit 恢复并独立验证 |
| Gate 10 main 同步 | SKIPPED | Gate 8 未通过 |
| Gate 11 RC tag | SKIPPED | Gate 8 未通过 |
| Gate 12 观察期 | NOT STARTED | 候选版本已回滚 |

## 全量检查

```text
pnpm install --frozen-lockfile        PASS
pnpm lint                             PASS
pnpm typecheck                        PASS
pnpm test                             PASS
pnpm --filter web build               PASS
pnpm --filter api build               PASS
pnpm --filter api prisma:validate     PASS
pnpm test:e2e                         PASS
pnpm playwright:test                  PASS (62/62)
git diff --check                      PASS
```

Playwright 覆盖正式路由、V1 fallback、Gate 1～3D 已实现路径和响应式场景。
测试期间 production 业务请求为 0。

## 安全快检摘要

```text
Semgrep first-party findings          0
Gitleaks current/history findings     0
pnpm audit Critical/High              0/0
Trivy FS vulnerabilities              0
Trivy image Critical/High             0/0
first-party Medium                    0
```

Trivy 仅记录一项 LOW Dockerfile healthcheck 配置提示；compose 已配置实际
healthcheck。公司历史 SAST 的 156 条混合范围告警仍须由 R27 重新打包、研判和复扫，
本结果不代表公司私有云安全准入。

## 阻断原因

生产飞书 OAuth 页面明确显示当前账号无应用使用权限。公司飞书会话的另一次尝试只到达
“扫描成功”，未完成应用授权回跳，不能作为通过证据。因此未进行受保护页面、进展、
材料和管理员审计的生产写入冒烟。
