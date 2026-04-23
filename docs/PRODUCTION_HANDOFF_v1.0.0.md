# PRODUCTION_HANDOFF_v1.0.0

## 交付概览

- 系统名称：轻卡定制颜色开发项目管理系统
- 正式版本：`v1.0.0`
- 生产地址：[https://timeline.all-too-well.com](https://timeline.all-too-well.com)
- 根域占位页：[https://all-too-well.com](https://all-too-well.com)
- 部署目标：`GCE instance-20260408-091840 (us-west1-b)`

## 生产运行拓扑

- `feishu-timeline-api`
  systemd 管理，监听 `127.0.0.1:3001`
- `feishu-timeline-web`
  systemd 管理，监听 `127.0.0.1:3000`
- `nginx`
  负责 80/443、反向代理与 HTTPS
- `postgresql`
  业务数据库
- `redis-server`
  队列与缓存

## 关键路径

- 首页：`/`
- 登录页：`/login`
- 工作台：`/dashboard`
- 项目页：`/projects`
- 健康检查：`/api/health`
- 认证链路：`/api/auth/session`、`/api/auth/feishu/login-url`

## 主要配置位置

- API 环境文件：`/opt/feishu_timeline_app/apps/api/.env.production`
- Web 环境文件：`/opt/feishu_timeline_app/apps/web/.env.production`
- Nginx 站点配置：`/etc/nginx/sites-available/feishu-timeline`
- systemd 服务：
  - `/etc/systemd/system/feishu-timeline-api.service`
  - `/etc/systemd/system/feishu-timeline-web.service`

## 建议运维命令

### 发布与重部署

- `bash scripts/deploy/gce-redeploy.sh`
- `bash scripts/deploy/gce-sync-and-build.sh`

### 验证

- `bash scripts/deploy/gce-release-verify.sh`
- `bash scripts/deploy/gce-production-acceptance.sh`
- `bash scripts/deploy/health-check.sh DEPLOY_TARGET=production`
- `bash scripts/deploy/ops-check.sh`

### 日志与状态

- `systemctl status feishu-timeline-api`
- `systemctl status feishu-timeline-web`
- `systemctl status nginx`
- `journalctl -u feishu-timeline-api -n 200 --no-pager`
- `journalctl -u feishu-timeline-web -n 200 --no-pager`
- `tail -n 200 /var/log/nginx/access.log`
- `tail -n 200 /var/log/nginx/error.log`

## 备份与恢复

- PostgreSQL 备份脚本：`bash scripts/deploy/backup-postgres.sh`
- 恢复演练说明：`docs/BACKUP_AND_RESTORE_R12.md`
- 备份/恢复风险和注意事项以 `docs/BACKUP_AND_RESTORE_R12.md` 为准

## 回滚入口

- 回滚检查清单：`scripts/deploy/gce-rollback-checklist.sh`
- staging 回滚脚本：`scripts/deploy/staging-rollback.sh`
- 生产回滚原则：
  - 先确认目标 Git commit
  - 再从目标 commit 重新执行 `gce-sync-and-build.sh`
  - 回滚后必须重跑 `gce-release-verify.sh` 与 `gce-production-acceptance.sh`

## 观察重点

- `/api/health` 必须持续返回 `200`
- `feishu-timeline-api`、`feishu-timeline-web`、`nginx` 必须保持 `active`
- 证书有效期、磁盘使用率、Nginx/API 5xx 日志需要持续巡检
- 发布后重点观察登录、项目列表、流程页、月度评审台账、颜色退出页
