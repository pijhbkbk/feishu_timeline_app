# Staging 部署文档

## 目标

R09 的 staging 方案以 Docker Compose 为中心，提供：

- 前后端容器化
- PostgreSQL / Redis / Nginx 编排
- 独立的 migrate / seed 脚本
- 健康检查脚本
- 一键部署与回滚脚本
- 基础 CI 验证

## 文件入口

- Compose: [deploy/compose.staging.yml](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/compose.staging.yml)
- Compose 环境模板: [deploy/env/staging.env.example](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/env/staging.env.example)
- API Dockerfile: [apps/api/Dockerfile](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/Dockerfile)
- Web Dockerfile: [apps/web/Dockerfile](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/web/Dockerfile)
- Nginx staging 配置: [deploy/nginx/compose.staging.conf](/Users/lixiaochen/Downloads/feishu_timeline_app/deploy/nginx/compose.staging.conf)

## 前置条件

1. Docker 29+ 与 Docker Compose v2 可用。
2. 根目录已执行过 `pnpm install`。
3. 若本机已有开发态服务占用 `3000 / 3001 / 5432 / 6379`，不影响 staging。
   staging 默认使用：
   - `8080`：Nginx 入口
   - `3100`：Web 直连
   - `3101`：API 直连
   - `15432`：PostgreSQL
   - `16379`：Redis

## 一键部署

首次部署：

```bash
bash scripts/deploy/staging-up.sh
```

需要补种子数据时：

```bash
RUN_SEED=yes bash scripts/deploy/staging-up.sh
```

脚本行为：

1. 若 `deploy/env/staging.env` 不存在，则由示例文件自动生成。
2. 若当前 tag 的镜像已存在，则直接复用本地镜像；否则构建 `feishu-timeline-api:<tag>` 与 `feishu-timeline-web:<tag>`。
3. 启动 `postgres` / `redis`。
4. 执行 `prisma migrate deploy`。
5. 启动 `api` / `web` / `nginx`。
6. 执行健康检查。
7. 将当前 release 元数据写入 `deploy/.state/current.env`。

强制重建镜像时：

```bash
FORCE_REBUILD=yes bash scripts/deploy/staging-up.sh
```

说明：

- 运行态容器直接使用 `node_modules/.bin`，不依赖在线下载 `pnpm`。
- 同一 tag 的重复部署默认优先复用本地镜像，降低 Docker Hub 抖动对预发布环境的影响。
- 正式 staging / VPS 发版建议在干净工作树上执行；若同一 commit 需要多次构建不同候选版本，请显式设置新的 `IMAGE_TAG`，避免 `current.env` 和 `previous.env` 指向同一 tag。

## 分离 migrate / seed

只执行迁移：

```bash
bash scripts/deploy/migrate.sh
```

只执行种子：

```bash
bash scripts/deploy/seed.sh
```

## 健康检查

```bash
bash scripts/deploy/health-check.sh
```

检查内容：

- Compose 服务状态
- `postgres` / `redis` / `api` / `web` / `nginx` 健康状态
- `http://127.0.0.1:8080/`
- `http://127.0.0.1:8080/login`
- `http://127.0.0.1:8080/api/health`
- `http://127.0.0.1:3101/api/health`

## 日志查看

```bash
bash scripts/deploy/staging-log-tail.sh
bash scripts/deploy/staging-log-tail.sh api
bash scripts/deploy/staging-log-tail.sh nginx web
```

## 回滚

检查回滚前提：

```bash
bash scripts/deploy/rollback-check.sh
```

执行回滚：

```bash
bash scripts/deploy/staging-rollback.sh
```

回滚机制说明：

- `staging-up.sh` 成功后会把旧版本 release 状态移动到 `deploy/.state/previous.env`
- `staging-rollback.sh` 使用 `previous.env` 中记录的镜像 tag 重启 `api` / `web` / `nginx`
- 回滚完成后会交换 `current.env` 与 `previous.env`

## 直接手工命令

```bash
docker build -t feishu-timeline-api:local -f apps/api/Dockerfile .
docker build -t feishu-timeline-web:local -f apps/web/Dockerfile .
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml config
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml up -d postgres redis
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml run --rm api-migrate
docker compose --env-file deploy/env/staging.env.example -f deploy/compose.staging.yml up -d api web nginx
```

## 推荐 VPS 部署方式

当前仓库已经存在 `deploy/systemd` 和 `scripts/deploy/gce-*` 的主机部署资产，但 R09 新增的 staging 方式建议优先采用：

1. VPS 上安装 Docker / Compose
2. 使用 `deploy/compose.staging.yml` 启动完整栈
3. 通过 Nginx 容器统一暴露 `/` 与 `/api`
4. 通过 `staging-up.sh` / `health-check.sh` / `staging-rollback.sh` 管理发版

这样可以在 R10 之前先把“可部署、可回滚、可巡检”的底座固定下来，再决定是否继续复用宿主机 Nginx/systemd 或转向生产 Compose 编排。
