# 迁移计划

更新时间：2026-04-09

本轮迁移采用“兼容旧机行为优先”的策略：

- 旧机现状已确认是 `systemd + nginx`
- 旧机应用目录是 `/opt/feishu_timeline_app`
- 新机本轮先沿用 `/opt/feishu_timeline_app`
- `timeline.all-too-well.com` 承载本项目
- `all-too-well.com` 只保留为未来总入口/占位站点
- 不把本项目重新绑定回根域名

本轮脚本与模板：

- [`backup_old_server.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/backup_old_server.sh)
- [`bootstrap_gcp.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/bootstrap_gcp.sh)
- [`restore_to_gcp.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/restore_to_gcp.sh)
- [`post_restore_verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/post_restore_verify.sh)

## 1. 盘点旧部署

目标：把旧腾讯云的真实运行状态固定下来，避免迁移时擅自“优化”出新变量。

已确认事实：

1. Nginx 当前对外承接 `all-too-well.com`
   - `/` -> `127.0.0.1:3000`
   - `/api/` -> `127.0.0.1:3001`
2. 生产守护方式是 `systemd`
   - `feishu-timeline-api.service`
   - `feishu-timeline-web.service`
3. API 当前 unit：
   - `User=feishu`
   - `WorkingDirectory=/opt/feishu_timeline_app/apps/api`
   - `EnvironmentFile=/opt/feishu_timeline_app/apps/api/.env.production`
   - `ExecStart=/usr/bin/env node /opt/feishu_timeline_app/apps/api/dist/main.js`
4. Web 当前 unit：
   - `User=feishu`
   - `Environment=HOME=/home/feishu`
   - `WorkingDirectory=/opt/feishu_timeline_app/apps/web`
   - `EnvironmentFile=/opt/feishu_timeline_app/apps/web/.env.production`
   - `ExecStart=/usr/bin/env bash -lc 'cd /opt/feishu_timeline_app/apps/web && exec pnpm exec next start --hostname 127.0.0.1 --port 3000'`

待继续核对项：

1. 旧 API unit 中的 `After=docker.service` / `Requires=docker.service`
   - 本轮视为旧环境残留或外部依赖线索
   - 新模板不直接照搬
2. object-storage 路径解析
   - 已确认真实附件目录是 `/opt/feishu_timeline_app/var/object-storage`
   - 但旧 API `WorkingDirectory` 是 `/opt/feishu_timeline_app/apps/api`
   - 这与代码里 `process.cwd()` 相关实现存在待核对不一致

## 2. 导出旧腾讯云数据

目标：先拿到“可恢复”的备份，再谈新机恢复。

执行顺序：

1. 先人工审查：
   - [`backup_old_server.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/backup_old_server.sh)
2. 在旧机执行脚本
3. 产物重点包含：
   - Nginx 配置
   - systemd unit 文件
   - 主用 env
     - `/opt/feishu_timeline_app/apps/api/.env.production`
     - `/opt/feishu_timeline_app/apps/web/.env.production`
   - 附带 env
     - `/opt/feishu_timeline_app/.env`
     - `/opt/feishu_timeline_app/apps/api/.env`
     - `/opt/feishu_timeline_app/apps/web/.env`
   - PostgreSQL 备份
   - `/opt/feishu_timeline_app/var/object-storage`
4. 脚本会输出最终备份包路径

注意：

1. 该脚本只导出，不删除旧机内容
2. 数据库导出方式可通过环境变量切换
3. Certbot 证书文件不在本轮自动迁移范围内，TLS 在新机单独处理

## 3. 初始化新 GCP 运行环境

目标：把新 GCP Ubuntu VM 准备成一个可承载多个站点的宿主机，但当前项目仍先用旧机兼容路径落地。

执行顺序：

1. 审查并执行：
   - [`bootstrap_gcp.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/bootstrap_gcp.sh)
2. 脚本会准备：
   - `nginx`
   - `git`
   - `curl`
   - `build-essential`
   - `postgresql-client`
   - `rsync`
   - Node 24.x
   - pnpm 9.15.4
   - `feishu` 用户
   - `/opt/feishu_timeline_app`
   - `/opt/feishu_timeline_app/var/object-storage`
   - `all-too-well.com` 根域名占位页目录

说明：

1. 本轮“多站点共存”主要体现在 `server_name`、站点职责、systemd 服务命名和目录边界上
2. `/srv/apps/...` 之类目录重构只作为后续优化方向，不是本轮强制方案

## 4. 将当前项目恢复到新机

目标：在新机恢复出与旧机行为尽量一致的可运行状态，然后让它承接 `timeline.all-too-well.com`。

执行顺序：

1. 审查并执行：
   - [`restore_to_gcp.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/restore_to_gcp.sh)
2. 代码目录恢复到：
   - `/opt/feishu_timeline_app`
3. 运行时 env 优先恢复到：
   - `/opt/feishu_timeline_app/apps/api/.env.production`
   - `/opt/feishu_timeline_app/apps/web/.env.production`
4. 可选恢复旧机附带 env 文件
5. 可选恢复：
   - PostgreSQL
   - `/opt/feishu_timeline_app/var/object-storage`
6. 构建阶段不直接复用仓库当前 `start` 脚本
   - 原因是 `apps/api/package.json` 和 `apps/web/package.json` 的 `start` 都显式依赖 `.env.example`
7. 脚本实际采用的构建方式是：
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @feishu-timeline/shared build`
   - API：`pnpm exec prisma generate` + `pnpm exec tsc -p tsconfig.build.json`
   - Web：`pnpm exec next build`
8. 恢复脚本在构建前会只清理构建产物：
   - `apps/api/dist`
   - `apps/web/.next`
   - 不会删除 env、代码或 `var/object-storage`
9. 恢复脚本会在真正构建前做两项上线前校验：
   - 以 `feishu` 用户身份验证 `node` / `pnpm` 在 `HOME=/home/feishu` 下可执行
   - 用 API 的 `.env.production` + `WorkingDirectory=/opt/feishu_timeline_app/apps/api` 计算 object-storage 实际解析路径，并要求它等于 `/opt/feishu_timeline_app/var/object-storage`
10. 只有在人工确认后，才打开：
   - `RESTORE_PRIMARY_ENV=yes`
   - `RESTORE_EXTRA_ENV=yes`
   - `RESTORE_OBJECT_STORAGE=yes`
   - `RESTORE_DATABASE=yes REQUIRE_CONFIRM_RESTORE=yes`
   - `APPLY_SYSTEM_CONFIG=yes`
   - `ENABLE_TIMELINE_SITE=yes`
   - `ENABLE_ROOT_PLACEHOLDER_SITE=yes`
   - `ENABLE_SERVICES=yes`
   - `START_SERVICES=yes`
   - `RELOAD_NGINX=yes`

## 5. 验证 `timeline.all-too-well.com`

目标：切流前证明新机已经可独立承接 timeline 子域名。

执行顺序：

1. 审查并执行：
   - [`post_restore_verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/post_restore_verify.sh)
2. 脚本会检查：
   - `systemd` 服务状态
   - `nginx -t`
   - `ss -tlnp`
   - `feishu` 用户下的 `node -v` / `pnpm -v`
   - `curl http://127.0.0.1:3000/`
   - `curl http://127.0.0.1:3001/api/health`
   - `Host: timeline.all-too-well.com` 条件下的本机 Nginx 代理
   - `apps/api/.env.production` 解析出来的 object-storage 路径是否真正等于 `/opt/feishu_timeline_app/var/object-storage`
   - `/opt/feishu_timeline_app/var/object-storage` 是否存在且可写
3. 仍需人工做浏览器级验证：
   - 登录
   - 项目列表/详情
   - 附件上传与下载
   - 审计日志
   - Redis 未退化到内存模式

明确限制：

1. `/api/health` 只是基础检查，不等于完整验收
2. object-storage 路径解析仍需结合代码和旧机 env 再核对一次
3. 若 `pnpm -v` 在 `feishu` 用户下失败，应先修复 HOME / corepack 缓存，再启 Web 服务

## 6. 只切 `timeline.all-too-well.com`

目标：先完成 timeline 子域名切流，不把根域名一起绑进同一窗口。

执行顺序：

1. 旧机继续保持在线
2. Cloudflare 只更新 `timeline.all-too-well.com`
3. `all-too-well.com` 暂时指向根域名占位站点，不回到 timeline 项目
4. 切流后立即做公网验证
5. 进入观察窗口并保留快速回切条件

## 7. 最后处理 `all-too-well.com`

目标：把根域名和当前项目彻底解耦。

本轮策略：

1. 使用占位 vhost：
   - [`all-too-well.com.placeholder.conf`](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/nginx/all-too-well.com.placeholder.conf)
2. 不再让根域名反代到 timeline Web/API
3. 等 timeline 子域名稳定后，再单独实现总入口/导航页

## 8. 回滚原则

如果验证或观察阶段发现高风险问题：

1. 不删除新机现场
2. Cloudflare 只把 `timeline.all-too-well.com` 切回旧腾讯云
3. 根域名策略继续单独处理
4. 记录日志、报错、数据库状态和附件状态差异
