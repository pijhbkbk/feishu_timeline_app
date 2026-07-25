# R26P1 正式团队 OAuth 修复与生产重新发布

## 结论

```text
R26P1_PRODUCTION_REPROMOTED
FEISHU_CN_FORMAL_TENANT_OAUTH_PASS
R26_V2_READ_ONLY_PRODUCTION_SMOKE_PASS
PRODUCTION_BUSINESS_WRITES=0
MAIN_INTEGRATED
DEPLOYED_AND_OBSERVING
```

本轮修复了 R26P 在真实 OAuth 门禁处发现的正式应用租户/可用范围问题。生产继续使用
飞书中国大陆 OAuth，未切换到 Lark，也未使用 staging App ID 或测试企业绕过门禁。

## 发布身份

- production URL：`https://timeline.all-too-well.com`
- production runtime：`5035f1b0ccbb09cd1990dc75dba6f65dd6a14248`
- release branch：`release/r26-v2-production`
- release branch remote：`5035f1b0ccbb09cd1990dc75dba6f65dd6a14248`
- `main` 合并提交：`6e3fad3`
- OAuth provider：`feishu-cn`
- callback：`https://timeline.all-too-well.com/login/callback`
- 正式企业：安徽江淮汽车集团股份有限公司
- 验收账号：李晓晨

完整 App ID、App Secret、token、OAuth code、state、Cookie 和数据库凭据均未进入证据。

## 数据库备份与恢复演练

- 备份目录：
  `/var/backups/feishu-timeline-db/20260725T041532Z`
- dump：
  `/var/backups/feishu-timeline-db/20260725T041532Z/feishu-timeline.dump`
- SHA256：
  `ca23976e4193b8963ec3cf0077d2fc1e5110be17ef63577a3c6c11c91501386c`
- SHA 校验：PASS
- 隔离 schema 恢复演练：PASS
- public/restore tables：`44 / 44`
- users：`12 / 12`
- projects：`1 / 1`
- audit logs：`22 / 22`

恢复演练结束后已删除隔离 schema。部署未运行 seed、reset、`db push`，也未复制
staging 数据。

## 部署结果

使用仓库受控部署脚本发布 exact release commit，并执行 `prisma migrate deploy`、
release verify 和 production acceptance：

```text
git head                         5035f1b0ccbb09cd1990dc75dba6f65dd6a14248
remote worktree                  clean
migrations                      21 / 21, pending 0
feishu-timeline-api             active, restart 0
feishu-timeline-web             active, restart 0
nginx                           active
postgresql                      active
redis-server                    active
local/public API health         ok / ok
production env mode             600 / 600
AUTH_MOCK_ENABLED               false
OAUTH_PROVIDER                  feishu-cn
post-deploy API error matches   0
post-deploy Web error matches   0
post-deploy Lark host matches   0
users/projects/audit logs       12 / 1 / 22
```

部署后数据计数与备份前一致。

## 真实 OAuth 与产品冒烟

真实 Safari 会话完成：

1. production 登录入口跳转至 `accounts.feishu.cn`；
2. 授权页显示正式应用和正式企业；
3. 李晓晨授权后回跳 production callback；
4. 创建 production session 并进入 V2；
5. 退出登录后旧 session 失效；
6. 再次完整授权并成功建立新 session。

未访问 `larksuite.com`，Lark 授权页出现次数为 0。

登录后完成以下只读验证：

- 项目列表：真实项目、当前工序、负责人和部门可见；
- 工作台：真实当前任务、截止时间和材料状态可见；
- 项目工作区：18 节点固定流程图、节点详情、责任信息、材料完整度和 SLA 可见；
- 生命周期复盘：真实阶段摘要加载成功；
- 系统管理审计：管理员访问成功，22 条真实记录可见。

生产中没有点击完成工序、提交进展、上传材料、修改成员、评审、收费、月度评审或颜色
退出等写操作。

## 自动化与安全门禁

修复候选在 staging 已完成：

```text
API unit tests                 293 / 293 PASS
Web unit tests                 127 / 127 PASS
Playwright                     62 / 62 PASS
E2E mainline                   PASS
lint / typecheck               PASS
Web / API production build     PASS
Prisma validate                PASS
Gitleaks current/full history  PASS
Trivy exact images             0 vulnerabilities
```

## 发布决定

- 已推送 release branch；
- 已部署 exact runtime；
- 已在 production 完成正式团队真实 OAuth 和有限只读业务冒烟；
- 已合并并推送 `main`；
- 创建新的候选 RC，不创建或移动 stable tag；
- 自 2026-07-25 起重新进入 72 小时观察期。

