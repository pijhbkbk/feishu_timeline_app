# R12 告警基线

## 1. 当前最小告警能力

本轮未接入第三方监控平台；当前告警出口是：

- 脚本标准错误输出
- 非零退出码
- 远端 `systemd` / `journalctl` / Nginx 日志

这意味着当前告警是“脚本可执行、可接线”，但默认仍是人工触发或由 cron / timer 触发。

## 2. 告警项与阈值

| 告警项 | 触发条件 | 当前脚本 |
| --- | --- | --- |
| 服务 inactive | 任一核心服务不是 `active` | `scripts/deploy/ops-check.sh` |
| `/api/health` 异常 | 非 `200` 或 payload 无 `status=ok` | `scripts/deploy/health-check.sh DEPLOY_TARGET=production` |
| 关键页面异常 | `/login`、`/dashboard`、`/projects` 非 `200` | `scripts/deploy/health-check.sh DEPLOY_TARGET=production` |
| 静态资源异常 | 动态解析到的 `/_next/static/*` 访问失败 | `scripts/deploy/health-check.sh DEPLOY_TARGET=production` |
| 磁盘过高 | 根分区使用率 `>= 80%` | `scripts/deploy/ops-check.sh` |
| 内存过低 | `MemAvailable < 512MB` | `scripts/deploy/ops-check.sh` |
| 证书即将过期 | 剩余天数 `< 21` 天 | `scripts/deploy/check-ssl-expiry.sh` |
| Nginx 5xx | 最近检查窗口内出现 5xx | `scripts/deploy/check-http-errors.sh` |

## 3. 脚本入口

```bash
bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
bash scripts/deploy/ops-check.sh
bash scripts/deploy/check-ssl-expiry.sh
bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'
```

## 4. 推荐接线方式

### 4.1 cron

```bash
*/5 * * * * cd /opt/feishu_timeline_app && bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
*/15 * * * * cd /opt/feishu_timeline_app && bash scripts/deploy/ops-check.sh
15 8 * * * cd /opt/feishu_timeline_app && bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'
30 8 * * * cd /opt/feishu_timeline_app && bash scripts/deploy/check-ssl-expiry.sh
```

### 4.2 接入方式说明

- 最低成本方式：依赖 cron 邮件或将 stderr 重定向到固定告警文件
- 若后续接入企业微信 / 飞书 / Slack / 邮件网关，只需把脚本非零退出后的 stderr 包装为 webhook 推送
- 当前仓库还没有统一的 webhook sender；这是后续可选增强，不是本轮 blocker

## 5. 2026-04-23 实际结果

- `health-check.sh`：通过
- `ops-check.sh`：通过
- `check-ssl-expiry.sh`：三张证书均剩余 `76` 天
- `check-http-errors.sh`：最近 300 行应用 Nginx access log 中 `5xx=0`

## 6. 当前限制

- 还没有自动推送型告警，当前以“可巡检、可接线”为主
- API 与数据库没有 APM；无法直接给出端到端 trace
- `pg_stat_statements` 未启用，SQL 热点仍然依赖人工排查
