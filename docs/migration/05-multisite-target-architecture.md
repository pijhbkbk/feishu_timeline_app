# 多站点目标架构

更新时间：2026-04-09

本文件描述“本轮可落地方案”和“后续优化方向”的边界。

本轮落地重点不是改目录范式，而是先把站点职责拆清楚：

- `timeline.all-too-well.com` 由当前项目承接
- `all-too-well.com` 保留给未来总入口
- Nginx 和 systemd 以多站点共存方式组织
- 当前项目仍优先兼容旧机 `/opt/feishu_timeline_app` 路径

## 1. 域名职责

| 域名 | 本轮职责 | 是否由本仓库承接 | 备注 |
| --- | --- | --- | --- |
| `timeline.all-too-well.com` | 当前飞书项目正式入口 | 是 | 本轮正式迁移目标 |
| `all-too-well.com` | 总入口占位站点 | 否 | 不再挂本项目 |
| `blog.all-too-well.com` | 未来博客站点 | 否 | 后续独立部署 |
| `docs.all-too-well.com` | 未来文档站点 | 否 | 后续独立部署 |

## 2. 本轮目标流量拓扑

```text
Cloudflare
  ├─ timeline.all-too-well.com -> GCP VM timeline vhost
  ├─ all-too-well.com          -> GCP VM root placeholder vhost
  ├─ blog.all-too-well.com     -> future vhost
  └─ docs.all-too-well.com     -> future vhost

GCP VM / Nginx
  ├─ server_name timeline.all-too-well.com
  │    ├─ /      -> 127.0.0.1:3000
  │    └─ /api/  -> 127.0.0.1:3001
  ├─ server_name all-too-well.com
  │    └─ static placeholder only
  ├─ server_name blog.all-too-well.com
  └─ server_name docs.all-too-well.com
```

## 3. 为什么本轮继续使用 `/opt/feishu_timeline_app`

已确认旧机真实运行路径是：

```text
/opt/feishu_timeline_app
```

对应现实约束：

1. API 旧 unit 直接执行：
   `node /opt/feishu_timeline_app/apps/api/dist/main.js`
2. Web 旧 unit 直接执行：
   `pnpm exec next start --hostname 127.0.0.1 --port 3000`
3. 真实附件目录在：
   `/opt/feishu_timeline_app/var/object-storage`

因此本轮不强制改成 `/srv/apps/...`，而是先保证：

1. 新机恢复路径与旧机兼容
2. 站点职责和 vhost 已拆分
3. 根域名不再直接承接本项目

## 4. 本轮目录布局

```text
/opt/feishu_timeline_app
  /apps
    /api
    /web
  /packages
    /shared
  /var
    /object-storage
    /backups
    /config-review

/etc/nginx/sites-available
  /timeline.all-too-well.com.conf
  /all-too-well.com.placeholder.conf

/etc/systemd/system
  /feishu-timeline-api.service
  /feishu-timeline-web.service

/var/www/all-too-well-placeholder
  /index.html
```

说明：

1. 多站点共存本轮主要靠 Nginx `server_name` 和 systemd 服务边界实现
2. timeline 项目只是宿主机上的一个站点，不是整机唯一应用
3. 根域名占位页和 timeline 项目已分离

## 5. 本轮 systemd 目标形态

本轮模板刻意贴近旧机真实形态：

### API

- `User=feishu`
- `WorkingDirectory=/opt/feishu_timeline_app/apps/api`
- `EnvironmentFile=/opt/feishu_timeline_app/apps/api/.env.production`
- `ExecStart=/usr/bin/env node /opt/feishu_timeline_app/apps/api/dist/main.js`
- `Restart=always`
- `RestartSec=5`

### Web

- `User=feishu`
- `Environment=HOME=/home/feishu`
- `WorkingDirectory=/opt/feishu_timeline_app/apps/web`
- `EnvironmentFile=/opt/feishu_timeline_app/apps/web/.env.production`
- `ExecStart=/usr/bin/env bash -lc 'cd /opt/feishu_timeline_app/apps/web && exec pnpm exec next start --hostname 127.0.0.1 --port 3000'`
- `Restart=always`
- `RestartSec=5`

关键边界：

1. 不直接复用仓库 `start` 脚本
2. 但保留旧机已经验证过的 `bash -lc + pnpm exec next start` 形态
3. 旧 API unit 里的 `docker.service` 依赖不直接照搬

## 6. object-storage 说明

当前已确认的旧机事实：

- 旧 API `WorkingDirectory` 是 `/opt/feishu_timeline_app/apps/api`
- 真实附件目录是 `/opt/feishu_timeline_app/var/object-storage`

这意味着本轮必须把以下点单独标红：

1. 迁移时必须显式备份和恢复 `/opt/feishu_timeline_app/var/object-storage`
2. 不能只靠代码里 `process.cwd()` 的静态推断来改路径
3. 需要继续核对旧机 env 与实际代码行为，确认附件路径为何能落在该目录

所以本轮策略是：

1. 新机先恢复到与旧机相同的真实附件目录
2. systemd 模板只检查该目录存在
3. 不在本轮强行重构为新的绝对数据根

## 7. Nginx 站点边界

本轮新增的模板：

- [`timeline.all-too-well.com.conf`](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/nginx/timeline.all-too-well.com.conf)
- [`all-too-well.com.placeholder.conf`](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/nginx/all-too-well.com.placeholder.conf)

边界要求：

1. `timeline.all-too-well.com`
   - `/` -> `127.0.0.1:3000`
   - `/api/` -> `127.0.0.1:3001`
2. `all-too-well.com`
   - 只返回占位页面
   - 不再代理 timeline 项目
3. 不把任何一个模板写成默认站点

## 8. 后续优化方向

以下内容是迁移稳定后的优化方向，不是本轮前置条件：

1. 把代码/数据目录进一步收敛到 `/srv/apps/...`、`/srv/data/...`
2. 将 env 结构逐步收敛成更清晰的统一入口
3. 为根域名实现真正的总入口/导航页
4. 为 `blog`、`docs` 等子域名补齐独立部署模板
