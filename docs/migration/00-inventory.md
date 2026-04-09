# 迁移盘点

更新时间：2026-04-09

本文件只依据仓库内可见证据盘点当前系统的运行与部署形态。凡是仓库中没有证据的生产事实，统一标记为“需要人工补充”。本文档明确区分：

- 根域名：`all-too-well.com`
- 当前项目目标子域名：`timeline.all-too-well.com`
- 本项目只是未来 GCP 多站点服务器上的一个站点，不应占用整机或独占主域名

## 1. 当前仓库结论

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| 仓库结构 | `pnpm` workspace 单仓，目录固定为 `apps/web`、`apps/api`、`packages/shared` | `package.json`、`pnpm-workspace.yaml` |
| 前端 | Next.js + TypeScript，应用位于 `apps/web` | `apps/web/package.json` |
| 后端 | NestJS + Prisma，应用位于 `apps/api` | `apps/api/package.json`、`apps/api/src/main.ts` |
| 共享包 | `packages/shared` 先构建，再供前后端引用 | 根 `package.json` 的 `build` 脚本、`packages/shared/package.json` |
| 包管理 | `pnpm@9.15.4`，仓库要求 `pnpm >= 9` | 根 `package.json`、本机 `pnpm -v` |
| Node 版本 | 仓库要求 `node >= 24.0.0`，当前工作区实测 `v24.14.0` | 根 `package.json`、本机 `node -v` |
| 数据库 | PostgreSQL，通过 `DATABASE_URL` 连接 | `apps/api/prisma/schema.prisma`、`apps/api/src/common/app-config.ts` |
| 缓存/队列 | Redis，通过 `REDIS_URL` 连接；不可用时会退化到内存 | `apps/api/src/infra/redis/redis.service.ts`、`apps/api/src/modules/auth/session-store.service.ts`、`apps/api/src/modules/queue/notification-queue.service.ts` |
| 附件二进制 | 当前代码只注入本地文件系统对象存储实现 | `apps/api/src/infra/storage/storage.module.ts`、`apps/api/src/infra/storage/object-storage.service.ts` |
| 健康检查 | 存在 `GET /api/health`，但只返回应用状态，不探测 DB/Redis/存储 | `apps/api/src/main.ts`、`apps/api/src/modules/health/health.controller.ts` |
| 生产进程绑定 | Web `127.0.0.1:3000`；API 在生产默认 `127.0.0.1:3001` | `apps/web/package.json`、`apps/api/src/main.ts` |
| 部署编排 | 仓库未发现 Nginx/systemd/PM2 配置；仅有 `docker-compose.yml` 供本地拉起 PostgreSQL/Redis | `docker-compose.yml`、仓库全文检索结果 |
| 域名写死情况 | 未在业务源码与构建配置中发现 `all-too-well.com` 或 `timeline.all-too-well.com` 常量 | 仓库全文检索结果、`apps/web/next.config.ts`、`apps/api/src/common/app-config.ts` |
| 根路径假设 | 当前应用默认运行在站点根路径，并通过同源 `/api` 访问后端；未见 `basePath`/`assetPrefix` 配置 | `apps/web/src/lib/auth-client.ts`、`apps/web/next.config.ts` |

## 2. 当前项目是如何跑起来的

### 2.1 本地开发链路

仓库 README 给出的本地启动流程如下：

1. `pnpm install`
2. `pnpm infra:up`
3. `pnpm prisma:migrate`
4. `pnpm prisma:seed`
5. `pnpm dev`

对应证据：

- 根 `package.json`
- `README.md`
- `docker-compose.yml`

其中：

- `pnpm dev` 会并行启动 Web 与 API。
- `pnpm infra:up` 实际执行 `docker compose up -d postgres redis`，只启动 PostgreSQL 和 Redis。
- `docker-compose.yml` 没有应用容器定义，因此不能据此认定生产在用 Docker 跑 Web/API。

### 2.2 构建链路

根 `package.json` 的 `build` 顺序为：

1. `pnpm --filter @feishu-timeline/shared build`
2. `pnpm --filter @feishu-timeline/web build`
3. `pnpm --filter @feishu-timeline/api build`

因此生产发布至少要保证：

- `packages/shared/dist`
- `apps/web/.next`
- `apps/api/dist`

都能在新机上重新构建成功。

### 2.3 生产运行链路

仓库可见的“生产运行命令”是：

- Web：`pnpm --filter @feishu-timeline/web start`
- API：`pnpm --filter @feishu-timeline/api start`

对应脚本定义：

- `apps/web/package.json`：`next start --hostname 127.0.0.1 --port 3000`
- `apps/api/package.json`：`node dist/main.js`

后端运行时行为：

- 全局前缀固定为 `/api`
- `NODE_ENV=production` 时，若没有显式传入 `HOST`，API 默认只监听 `127.0.0.1`
- `FRONTEND_URL` 未配置时，API 不开启 CORS，并假定走同域反向代理

对应证据：

- `apps/api/src/main.ts`
- `apps/web/src/lib/auth-client.ts`
- `apps/web/next.config.ts`

### 2.4 前端如何访问后端

前端 API 基址规则如下：

- 若设置 `NEXT_PUBLIC_API_BASE_URL`，前端请求该地址
- 若未设置，前端退回到同源 `/api`

仓库里没有 Next.js `rewrites` 或内置代理配置，所以如果生产选择 `/api` 同源模式，就必须由 Nginx 或其他反向代理把 `/api/*` 转发到 Nest API。

对应证据：

- `apps/web/src/lib/auth-client.ts`
- `apps/web/next.config.ts`

## 3. 端口、监听与路径

| 组件 | 命令 | 监听地址 | 端口 | 备注 |
| --- | --- | --- | --- | --- |
| Web 开发 | `pnpm --filter @feishu-timeline/web dev` | 未显式绑 host | `3000` | 使用 `next dev --port 3000` |
| Web 生产 | `pnpm --filter @feishu-timeline/web start` | `127.0.0.1` | `3000` | 适合挂在反向代理后面 |
| API 开发 | `pnpm --filter @feishu-timeline/api dev` | `0.0.0.0` | `3001` | 默认开发态对外监听 |
| API 生产 | `pnpm --filter @feishu-timeline/api start` | `127.0.0.1` | `3001` | `PORT` 可覆盖，`HOST` 可覆盖 |
| 健康检查 | `GET /api/health` | 跟随 API | 跟随 API | 仅应用级健康 |
| PostgreSQL | `docker compose` 本地服务 | `127.0.0.1` | `5432` | 仅见于本地 compose |
| Redis | `docker compose` 本地服务 | `127.0.0.1` | `6379` | 仅见于本地 compose |

## 4. 数据持久化与目录

### 4.1 数据库

- 类型：PostgreSQL
- 连接方式：`DATABASE_URL`
- 迁移目录：`apps/api/prisma/migrations`
- 数据模型源：`apps/api/prisma/schema.prisma`

### 4.2 Redis

- 用途：会话存储、通知队列
- 行为：Redis 不可用时，session 与 queue 会退化到进程内存
- 影响：迁移验证时即使 Redis 异常，页面可能“还能打开”，但行为已退化

### 4.3 附件/对象存储

- 当前代码实际注入的实现只有 `LocalFilesystemObjectStorageService`
- 默认根目录为 `var/object-storage`
- 路径通过 `resolve(process.cwd(), objectStorageLocalRoot)` 计算
- 二进制不走 Web 静态目录，而是经 API 下载接口读取后返回

这意味着：

- 迁移时必须确认旧生产附件是否真的保存在本机磁盘
- 如果是本机磁盘，必须按实际 API 工作目录导出附件目录
- 如果旧机做过仓库外改造接入 S3/MinIO/OSS，仓库本身无法证明，必须人工补充

对应证据：

- `apps/api/src/infra/storage/storage.module.ts`
- `apps/api/src/infra/storage/object-storage.service.ts`
- `apps/api/src/modules/attachments/attachments.controller.ts`

### 4.4 静态资源

- `apps/web/public/` 当前为空
- `apps/web/.next/` 是构建产物，不是业务持久化目录
- `apps/api/dist/`、`packages/shared/dist/` 也是构建产物
- `.gitignore` 忽略了 `var/`，说明仓库预期本地对象存储和运行期文件不入库

## 5. 环境变量与 `.env.*` 依赖

### 5.1 API

API `ConfigModule` 会按如下顺序查找环境文件：

1. `.env.local`
2. `.env`
3. `.env.example`

同时，`apps/api/package.json` 的 `dev`、`start`、`prisma:*` 脚本又显式包了一层 `dotenv -e .env.example`。

结论：

- 仓库没有显式加载 `.env.production`
- 直接照搬当前 start 脚本存在误载示例值的风险
- 生产更适合由 systemd/PM2/shell wrapper 在进程外注入真实环境变量

### 5.2 Web

Web `dev/start` 脚本显式使用 `dotenv -e .env.example`，`build` 是原生 `next build`。

结论：

- 仓库也没有提供明确的 Web 生产环境装载脚本
- 如果生产采用同源代理，推荐让 `NEXT_PUBLIC_API_BASE_URL=/api`

### 5.3 根目录 `.env.example`

根目录 `.env.example` 只包含 `POSTGRES_DB`、`WEB_PORT` 一类辅助字段，但仓库代码未直接消费这些变量。现有证据显示，它更像“人工参考模板”，不是应用真实读取入口。

## 6. 当前仓库是否假设自己占用主域名

结论：没有证据表明仓库假设自己必须占用 `all-too-well.com` 主域名，但它确实假设自己运行在“某个站点的根路径”，而不是某个路径前缀下。

具体判断：

1. 未发现 `all-too-well.com` 或 `timeline.all-too-well.com` 写死在业务源码、Next 配置、Nest 配置中。
2. 当前可见绝对 URL 主要是本地示例值：
   - `FRONTEND_URL=http://localhost:3000`
   - `FEISHU_REDIRECT_URI=http://localhost:3000/login/callback`
   - `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`
3. 前端默认把 API 当作同源 `/api`。
4. Next 配置里没有 `basePath`、`assetPrefix`。
5. 页面路由大量使用 `/login`、`/projects` 这类站点根路径。

这说明：

- 部署到 `timeline.all-too-well.com` 站点根路径是符合当前代码结构的。
- 如果未来想把它挂成 `all-too-well.com/timeline` 这种路径前缀模式，当前仓库没有现成支持。

## 7. 切换到 `timeline.all-too-well.com` 需要调整哪些位置

基于仓库实际内容，至少要确认或调整以下项目：

1. `FEISHU_REDIRECT_URI`
   - 应改到 `https://timeline.all-too-well.com/login/callback`
   - 证据：`apps/api/.env.example`、`apps/api/src/common/app-config.ts`、`apps/api/src/modules/feishu/feishu-auth.adapter.ts`

2. `FRONTEND_URL`
   - 若保留显式配置，建议为 `https://timeline.all-too-well.com`
   - 证据：`apps/api/.env.example`、`apps/api/src/main.ts`

3. `NEXT_PUBLIC_API_BASE_URL`
   - 多站点部署下建议设为 `/api`
   - 让 `timeline.all-too-well.com` 这个 vhost 自己把 `/api/*` 反代到本项目 API
   - 证据：`apps/web/src/lib/auth-client.ts`

4. Nginx `server_name`
   - 当前项目应只挂在 `timeline.all-too-well.com`
   - 不应继续把根域名 vhost 直接反代到该项目
   - 仓库内无 Nginx 配置，需要人工补充

5. Cloudflare DNS
   - 需要为 `timeline.all-too-well.com` 单独创建或更新记录
   - 根域名 `all-too-well.com` 则保留给未来总入口

6. 根路径部署边界
   - 当前项目适合放在子域名根路径
   - 不建议在本轮把它改造成根域名下的路径前缀站点

## 8. 迁移时必须从旧腾讯云导出的内容

以下内容按“仓库可证实需要”与“仓库无法证实但迁移必须确认”拆分。

### 8.1 必须导出

1. PostgreSQL 全量备份
   - 原因：业务主数据、审计日志、附件元数据都在 PostgreSQL
   - 证据：`apps/api/prisma/schema.prisma`

2. 附件二进制
   - 原因：附件二进制不在 PostgreSQL；当前代码默认读本地对象存储目录
   - 证据：`apps/api/src/infra/storage/object-storage.service.ts`
   - 备注：实际旧机路径需要人工确认，不能只按仓库猜测

3. 生产环境变量清单
   - 包括数据库、Redis、飞书登录、Cookie、对象存储、前端 API 基址等
   - 证据：`apps/api/src/common/app-config.ts`、`apps/web/src/lib/auth-client.ts`

4. 当前线上进程守护与反向代理配置
   - 包括 Nginx、systemd、PM2、Supervisor、crontab 等，只要旧机在用都要导出
   - 备注：仓库内无对应配置，需要人工从旧机提取

5. 当前线上发布版本标识
   - 至少记录 Git commit、tag 或打包目录校验值
   - 目的：确保新机恢复的是同一版本，而不是“仓库当前分支的近似版本”

6. 旧腾讯云上 `all-too-well.com` 当前站点行为
   - 包括是否直接指向本项目、是否还有静态首页、是否有其他站点复用同机
   - 备注：切换到子域名后，根域名策略将改变，必须先盘点旧行为

### 8.2 建议导出

1. Redis 持久化文件
   - 仓库主数据不依赖 Redis 持久化，但会影响切换瞬间的登录态和通知队列

2. 旧机运维侧配置
   - 防火墙规则、监听端口、Cloudflare 回源白名单、证书来源、日志轮转规则

3. Cloudflare 当前配置快照
   - 根域名记录
   - `timeline` 子域名记录
   - SSL/TLS 模式
   - Page Rules / Transform Rules / Cache Rules
   - WAF / Access / Zero Trust 规则

## 9. 迁移到新 GCP 时的关键风险点

1. 当前 start 脚本显式绑定 `.env.example`
   - 风险：新机若直接运行脚本，可能误载示例值

2. 附件目录依赖 `process.cwd()`
   - 风险：切换到 systemd/Nginx/手工脚本后，工作目录一变，实际附件路径就会变

3. 生产反向代理配置缺失
   - 风险：仓库未提供 Nginx/systemd/PM2 文件，旧机实际拓扑只能人工补齐

4. `/api` 同源转发是前端默认路径
   - 风险：若 `timeline.all-too-well.com` 的 Nginx 未正确代理 `/api/*`，前端会全部请求失败

5. 登录态依赖 `secure` Cookie 与 HTTPS/同域配置
   - 风险：Cloudflare SSL 模式、源站协议、飞书回调 URL 不一致会导致登录回调成功但会话不落地

6. 健康检查过浅
   - 风险：`/api/health` 为 `ok` 不能证明 PostgreSQL、Redis、附件目录都可用

7. 仓库默认是“站点根路径部署”，不是“路径前缀部署”
   - 风险：如果误把项目挂成 `all-too-well.com/timeline`，可能需要额外改造路由和静态资源前缀

8. 根域名与子域名职责拆分不清
   - 风险：如果 Nginx 或 Cloudflare 仍让 `all-too-well.com` 直接回到该项目，会破坏“多站点共存”的目标

## 10. 需要人工补充

以下信息仓库无法证明，需要你从旧腾讯云、Cloudflare 或新 GCP VM 提供：

- 旧腾讯云当前实际进程守护方式：systemd / PM2 / Supervisor / Docker / 其他
- 旧腾讯云当前实际 Nginx 配置文件与站点启用方式
- 旧机实际附件目录路径，或实际对象存储桶/Endpoint
- 旧机实际 PostgreSQL、Redis 部署位置：同机 / 独立主机 / 云服务
- Cloudflare 当前根域名与 `timeline` 子域名的 DNS 记录、代理开关、SSL 模式
- 旧机是否持有 Origin Certificate / Let’s Encrypt 证书，以及新机计划如何续用
- 旧环境里 `all-too-well.com` 当前到底是否只跑这个项目，还是已有多站点共存
