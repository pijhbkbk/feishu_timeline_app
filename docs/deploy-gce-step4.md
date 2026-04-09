# GCE Step 4 Deploy

更新时间：2026-04-09

本文件对应“将当前项目部署到 Google Compute Engine VM，并打通 Nginx + Web + API 基础链路”的第四步。

固定远程入口：

```bash
gcloud compute ssh instance-20260408-091840 \
  --project=axial-acrobat-492709-r7 \
  --zone=us-west1-b
```

## 本轮目标

1. 在 GCE 安装基础依赖
2. 在 `/opt/feishu_timeline_app` 准备代码目录
3. 安装依赖并构建 Web/API
4. 落地 systemd 和 Nginx 80 端口反代
5. 在本机完成 `127.0.0.1:3000`、`127.0.0.1:3001/api/health` 和带 `Host` 头的 Nginx 验证

## 新增脚本

- [`gce-bootstrap.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-bootstrap.sh)
- [`gce-sync-and-build.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-sync-and-build.sh)
- [`gce-verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-verify.sh)

## 使用顺序

1. 本地执行：

```bash
bash scripts/deploy/gce-bootstrap.sh
```

2. 本地执行：

```bash
bash scripts/deploy/gce-sync-and-build.sh
```

3. 本地执行：

```bash
bash scripts/deploy/gce-verify.sh
```

当前这台 GCE VM 的实际 SSH 登录用户已确认为 `lixiaochen`。脚本不会写死 `ubuntu`，而是远端动态读取 `whoami` 后再渲染 systemd 的 `User=`、`HOME` 和 `COREPACK_HOME`。

## 运行时约定

- 代码目录：`/opt/feishu_timeline_app`
- Web 端口：`127.0.0.1:3000`
- API 端口：`127.0.0.1:3001`
- 健康检查：`/api/health`
- Nginx 站点文件：`/etc/nginx/sites-available/feishu-timeline`
- systemd 服务：
  - `feishu-timeline-api`
  - `feishu-timeline-web`

## 环境变量处理

脚本会优先检查：

- `apps/api/.env.production`
- `apps/web/.env.production`

如果文件已存在：

- 只打印键名，不回显值

如果文件不存在：

- 从 `.env.example` 复制生成
- 自动补以下非敏感部署项：
  - API：`NODE_ENV=production`
  - API：`HOST=127.0.0.1`
  - API：`PORT=3001`
  - API：`FRONTEND_URL=http://timeline.all-too-well.com`
  - API：`OBJECT_STORAGE_LOCAL_ROOT=/opt/feishu_timeline_app/var/object-storage`
  - Web：`NEXT_PUBLIC_API_BASE_URL=/api`

以下值若仍为示例值，必须在正式切流前人工替换：

- `DATABASE_URL`
- `REDIS_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_REDIRECT_URI`

## 已知边界

1. 本轮只先打通 HTTP 80 端口，不自动申请 Certbot 证书
2. `pnpm` 通过 `corepack` 管理，脚本会预热 `pnpm@9.15.4`
3. API `health` 很浅，不能代替数据库、Redis、附件、飞书登录的完整验收
4. `prisma migrate deploy` 默认不执行；如需执行，可设置：

```bash
RUN_PRISMA_MIGRATE_DEPLOY=yes bash scripts/deploy/gce-sync-and-build.sh
```

5. `next start` 在 systemd 下存在数秒冷启动窗口；`gce-sync-and-build.sh` 已加入本机端口和 Nginx 反代两层 HTTP 就绪等待，避免把临时性的 `502 Bad Gateway` 误判成部署失败。
