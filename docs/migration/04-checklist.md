# 迁移检查清单

更新时间：2026-04-09

## 1. 迁移前检查项

- [ ] 已确认旧机当前生产方式是 `systemd + nginx`
- [ ] 已记录旧机服务名：
  `feishu-timeline-api.service`、`feishu-timeline-web.service`
- [ ] 已导出旧机 Nginx 配置
- [ ] 已导出旧机 systemd unit 文件
- [ ] 已备份主用 env：
  `/opt/feishu_timeline_app/apps/api/.env.production`、`/opt/feishu_timeline_app/apps/web/.env.production`
- [ ] 已确认是否需要同时带走附带 env：
  `/opt/feishu_timeline_app/.env`、`apps/api/.env`、`apps/web/.env`
- [ ] 已完成 PostgreSQL 全量备份
- [ ] 已完成 `/opt/feishu_timeline_app/var/object-storage` 备份
- [ ] 已确认旧机 `all-too-well.com` 当前仍直接承接本项目
- [ ] 已确认本轮目标是切到 `timeline.all-too-well.com`
- [ ] 已确认根域名 `all-too-well.com` 本轮只保留占位站点
- [ ] 已确认旧 API unit 里的 `docker.service` 依赖需要单独核对，不直接照搬
- [ ] 已确认 object-storage 路径解析仍存在待核对不一致
- [ ] 已确认回滚策略是“只回切 timeline 子域名”

## 2. 恢复后检查项

- [ ] 新机已完成 [`bootstrap_gcp.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/bootstrap_gcp.sh)
- [ ] `/opt/feishu_timeline_app` 已存在
- [ ] `/opt/feishu_timeline_app/apps/api/.env.production` 已恢复并人工审核
- [ ] `/opt/feishu_timeline_app/apps/web/.env.production` 已恢复并人工审核
- [ ] API env 里的 `DATABASE_URL`、`REDIS_URL`、`FRONTEND_URL`、`OBJECT_STORAGE_LOCAL_ROOT` 已确认非空
- [ ] 若需要兼容旧结构，附带 env 已恢复到原路径
- [ ] `/opt/feishu_timeline_app/var/object-storage` 已恢复
- [ ] `apps/api/.env.production` 推导出的 object-storage 解析路径已确认等于 `/opt/feishu_timeline_app/var/object-storage`
- [ ] 已抽样验证历史附件文件存在
- [ ] 新机代码版本已与目标 Git ref 一致
- [ ] `pnpm install --frozen-lockfile` 已完成
- [ ] `pnpm --filter @feishu-timeline/shared build` 已完成
- [ ] API 的 `pnpm exec prisma generate` 与 `pnpm exec tsc -p tsconfig.build.json` 已完成
- [ ] Web 的 `pnpm exec next build` 已完成
- [ ] 构建前已只清理 `apps/api/dist` 和 `apps/web/.next`
- [ ] `pnpm exec prisma validate --schema prisma/schema.prisma` 已完成
- [ ] 未把仓库 `start` 脚本直接当作生产 `ExecStart`
- [ ] `timeline.all-too-well.com` vhost 已安装但未误占根域名
- [ ] `all-too-well.com` 占位 vhost 已与 timeline 项目分离
- [ ] `feishu-timeline-api.service` 已审查，且未把 `docker.service` 依赖原样带入
- [ ] `feishu-timeline-web.service` 已审查，且保持 `bash -lc + pnpm exec next start` 兼容形态
- [ ] `sudo -u feishu -H env HOME=/home/feishu COREPACK_HOME=/home/feishu/.cache/node/corepack PATH=/usr/local/bin:/usr/bin:/bin node -v` 正常
- [ ] `sudo -u feishu -H env HOME=/home/feishu COREPACK_HOME=/home/feishu/.cache/node/corepack PATH=/usr/local/bin:/usr/bin:/bin pnpm -v` 正常

## 3. 子域名切流前检查项

- [ ] 已执行 [`post_restore_verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/migration/post_restore_verify.sh)
- [ ] `nginx -t` 通过
- [ ] `ss -tlnp` 显示 80、127.0.0.1:3000、127.0.0.1:3001 符合预期
- [ ] `feishu-timeline-api.service` 状态正常
- [ ] `feishu-timeline-web.service` 状态正常
- [ ] 本机 `curl http://127.0.0.1:3000/` 正常
- [ ] 本机 `curl http://127.0.0.1:3001/api/health` 正常
- [ ] `post_restore_verify.sh` 已确认 `feishu` 用户下 `pnpm` 可执行
- [ ] `post_restore_verify.sh` 已确认 API env 的关键变量非空
- [ ] `post_restore_verify.sh` 已确认 API env 解析的 object-storage 真实路径与目标目录一致
- [ ] 本机带 `Host: timeline.all-too-well.com` 的 Nginx 访问正常
- [ ] 已完成浏览器级登录验证
- [ ] 已验证项目列表、项目详情、待办、通知页面
- [ ] 已验证附件上传与下载
- [ ] 已验证审计日志可查询
- [ ] 已确认 `/api/health` 只是基础检查，不作为唯一放行标准
- [ ] 已确认 Cloudflare 上 `timeline.all-too-well.com` 的切换方案
- [ ] 已确认旧机仍在线且具备快速回切条件

## 4. 子域名切流后检查项

- [ ] Cloudflare 已把 `timeline.all-too-well.com` 指向新 GCP
- [ ] 公网访问 `https://timeline.all-too-well.com` 正常
- [ ] 公网访问 `https://timeline.all-too-well.com/api/health` 正常
- [ ] 登录后会话可保持
- [ ] 关键业务页无明显 4xx/5xx
- [ ] 历史附件可下载
- [ ] 新上传附件可读取
- [ ] PostgreSQL、Redis、磁盘使用率正常
- [ ] 应用日志无持续报错
- [ ] Cloudflare 回源状态正常
- [ ] 观察窗口内未触发回滚

## 5. 多站点共存检查项

- [ ] `timeline.all-too-well.com` 与 `all-too-well.com` 已拆成不同 `server_name`
- [ ] `timeline.all-too-well.com` 的 `/` 只到 `127.0.0.1:3000`
- [ ] `timeline.all-too-well.com` 的 `/api/` 只到 `127.0.0.1:3001`
- [ ] `all-too-well.com` 不再反代 timeline 项目
- [ ] 根域名占位站点和 timeline 项目使用不同的 Nginx 配置文件
- [ ] timeline Web/API 服务名未占用“默认站点”语义
- [ ] Cookie 仍保持 host-only，不污染其他子域名
- [ ] 未来 `blog`、`docs` 子域名仍有独立 vhost 与独立服务命名空间
- [ ] `/srv/apps/...` 目录重构仍留作后续优化，不与本轮切流绑在一起
