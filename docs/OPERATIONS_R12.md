# R12 运维基线

## 1. 服务清单

- `feishu-timeline-api`
- `feishu-timeline-web`
- `nginx`
- `postgresql`
- `redis-server`

## 2. 关键检查项

### 2.1 服务状态

- `systemctl is-active feishu-timeline-api`
- `systemctl is-active feishu-timeline-web`
- `systemctl is-active nginx`
- `systemctl is-active postgresql`
- `systemctl is-active redis-server`

### 2.2 关键 URL

- `https://timeline.all-too-well.com/`
- `https://timeline.all-too-well.com/login`
- `https://timeline.all-too-well.com/dashboard`
- `https://timeline.all-too-well.com/projects`
- `https://timeline.all-too-well.com/api/health`
- 动态解析的 `/_next/static/*` 静态资源

### 2.3 常用巡检命令

```bash
bash scripts/deploy/health-check.sh DEPLOY_TARGET=production
bash scripts/deploy/ops-check.sh
bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'
bash scripts/deploy/check-ssl-expiry.sh
```

## 3. 常见故障定位入口

### 3.1 systemd

```bash
systemctl status feishu-timeline-api --no-pager -l
systemctl status feishu-timeline-web --no-pager -l
systemctl status nginx --no-pager -l
systemctl status postgresql --no-pager -l
systemctl status redis-server --no-pager -l
```

### 3.2 journalctl

```bash
journalctl -u feishu-timeline-api -n 200 --no-pager
journalctl -u feishu-timeline-web -n 200 --no-pager
journalctl -u nginx -n 200 --no-pager
```

### 3.3 Nginx 日志

- 应用站点 access log：`/var/log/nginx/feishu-timeline.access.log`
- 应用站点 error log：`/var/log/nginx/feishu-timeline.error.log`
- 根域名 access log：`/var/log/nginx/all-too-well.com.access.log`
- 根域名 error log：`/var/log/nginx/all-too-well.com.error.log`

### 3.4 数据库与 Redis

```bash
set -a
. /opt/feishu_timeline_app/apps/api/.env.production
set +a
BASE_DB_URL="${DATABASE_URL%%\?*}"
psql "$BASE_DB_URL" -Atqc 'select 1'
redis-cli -u "$REDIS_URL" --raw ping
```

## 4. 2026-04-23 生产巡检结果

### 4.1 服务与资源

- 五个核心服务均为 `active`
- 根分区磁盘占用：`20%`
- `MemAvailable`：约 `3070 MB`
- 监听端口：`80`、`443`、`127.0.0.1:3000`、`127.0.0.1:3001`、`127.0.0.1:5432`、`127.0.0.1:6379`
- PostgreSQL、Redis 连通性检查通过

### 4.2 健康检查

- `bash scripts/deploy/health-check.sh DEPLOY_TARGET=production` 通过
- `root` 最终跳转到 `/dashboard`
- `/login`、`/dashboard`、`/projects`、`/api/health` 全部返回预期状态
- 动态解析的静态资源可访问

### 4.3 连续请求稳定性

连续请求 10 次，未出现异常状态码：

- `/`：状态码稳定为 `307`，平均 `0.900s`，最大 `1.084s`
- `/dashboard`：状态码稳定为 `200`，平均 `1.059s`，最大 `2.090s`
- `/projects`：状态码稳定为 `200`，平均 `1.001s`，最大 `1.197s`
- `/api/health`：状态码稳定为 `200`，平均 `0.970s`，最大 `1.605s`

### 4.4 日志与慢请求观察

- `bash scripts/deploy/check-http-errors.sh LINES=300 JOURNAL_SINCE='24 hours ago'` 未发现最近 300 行 Nginx 5xx
- Nginx 应用 error log 未见新增错误
- API journal 最近 24 小时未筛出明显 `ERROR` / `Exception`
- PostgreSQL 当前无运行超过 5 秒的活跃查询
- `pg_stat_statements` 当前未启用，因此 SQL 热点只能做“无长查询”级别的基线判断，不能做语句级排行

## 5. 运行建议

- 每次发布后至少执行一次 `health-check.sh` 和 `ops-check.sh`
- 每日执行一次 `check-http-errors.sh` 与 `check-ssl-expiry.sh`
- 数据库性能排查如需提升到 SQL 级别，下一轮优先考虑在维护窗口启用 `pg_stat_statements`
