# 运行时矩阵

更新时间：2026-04-09

## 1. 版本与运行要求

| 项目 | 要求/观察值 | 证据 |
| --- | --- | --- |
| Node.js | `>=24.0.0`；当前工作区实测 `v24.14.0` | 根 `package.json`、`node -v` |
| pnpm | `>=9.0.0`；当前工作区实测 `9.15.4` | 根 `package.json`、`pnpm -v` |
| 前端框架 | Next.js 15 | `apps/web/package.json` |
| 后端框架 | NestJS 11 | `apps/api/package.json` |
| ORM | Prisma 6 | `apps/api/package.json` |
| 数据库 | PostgreSQL | `apps/api/prisma/schema.prisma` |
| 缓存/队列 | Redis | `apps/api/src/infra/redis/redis.service.ts` |

## 2. 组件运行矩阵

| 组件 | 目录 | 构建命令 | 运行命令 | 监听 | 持久化 | 关键环境变量 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Monorepo 根 | `/` | `pnpm build` | 无 | 无 | 无 | `node`、`pnpm` | 根 `package.json`、`pnpm-workspace.yaml` |
| Shared | `packages/shared` | `pnpm --filter @feishu-timeline/shared build` | 无独立运行 | 无 | `dist/` 为构建产物 | 无额外运行时 env | `packages/shared/package.json` |
| Web | `apps/web` | `pnpm --filter @feishu-timeline/web build` | `pnpm --filter @feishu-timeline/web start` | `127.0.0.1:3000` | `apps/web/.next/` 为构建产物；`apps/web/public/` 当前为空 | `NEXT_PUBLIC_APP_NAME`、`NEXT_PUBLIC_API_BASE_URL` | `apps/web/package.json`、`apps/web/src/lib/auth-client.ts`、`apps/web/src/components/app-shell.tsx` |
| API | `apps/api` | `pnpm --filter @feishu-timeline/api build` | `pnpm --filter @feishu-timeline/api start` | 生产默认 `127.0.0.1:3001`；开发默认 `0.0.0.0:3001` | `apps/api/dist/` 为构建产物 | `PORT`、`HOST`、`DATABASE_URL`、`REDIS_URL`、`FRONTEND_URL`、`FEISHU_REDIRECT_URI` 等 | `apps/api/package.json`、`apps/api/src/main.ts`、`apps/api/src/common/app-config.ts` |
| PostgreSQL | 仓库外部依赖 | 无 | 仓库未定义生产命令 | 本地 compose 为 `127.0.0.1:5432` | 业务主数据、审计日志、附件元数据 | `DATABASE_URL` | `docker-compose.yml`、`apps/api/prisma/schema.prisma` |
| Redis | 仓库外部依赖 | 无 | 仓库未定义生产命令 | 本地 compose 为 `127.0.0.1:6379` | 会话与通知队列；不可用时退化到内存 | `REDIS_URL` | `docker-compose.yml`、`apps/api/src/infra/redis/redis.service.ts` |
| 附件本地存储 | API 运行目录下相对路径 | 无 | 跟随 API | 无网络监听 | 二进制附件 | `OBJECT_STORAGE_LOCAL_ROOT` | `apps/api/src/infra/storage/object-storage.service.ts` |
| 健康检查 | API 模块 | 无 | 跟随 API | `/api/health` | 无 | 无 | `apps/api/src/modules/health/health.controller.ts` |

## 3. 域名/站点角色矩阵

下表中的“目标角色”是本轮迁移建议，不代表仓库当前已提供对应站点代码。

| 域名 | 角色 | 是否属于本仓库 | 目标处理方式 | 备注 |
| --- | --- | --- | --- | --- |
| `all-too-well.com` | 未来总入口/主页/导航页 | 否，仓库内暂无对应实现 | 由独立站点或静态占位页承接 | 不应再默认直连本项目 |
| `timeline.all-too-well.com` | 当前飞书项目正式入口 | 是 | 由本仓库 Web + API 承接 | 本项目推荐部署在该子域名站点根 |
| `blog.all-too-well.com` | 未来博客站点 | 否 | 未来独立站点 | 应与 timeline 解耦 |
| `docs.all-too-well.com` | 未来文档站点 | 否 | 未来独立站点 | 应与 timeline 解耦 |

## 4. 端口映射建议

基于仓库事实与多站点目标，当前最合理的端口/反向代理映射是：

| 外部入口 | 内部目标 | 说明 |
| --- | --- | --- |
| `timeline.all-too-well.com:80/:443` | 该子域名专属 Nginx `server_name` | 只处理 timeline 项目请求 |
| `timeline.all-too-well.com/` | `127.0.0.1:3000` | Next.js Web |
| `timeline.all-too-well.com/api/` | `127.0.0.1:3001/api/` | Nest API，同源代理最符合当前前端行为 |
| `all-too-well.com:80/:443` | 单独的根域名 vhost | 应保留给未来总入口或占位页，不应直接指向 timeline 项目 |
| `127.0.0.1:5432` | PostgreSQL | 仅当 DB 与应用同机部署时成立 |
| `127.0.0.1:6379` | Redis | 仅当 Redis 与应用同机部署时成立 |

## 5. 构建与启动命令清单

### 5.1 仓库根

- 安装：`pnpm install`
- 全量构建：`pnpm build`
- 全量检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`

### 5.2 API

- Prisma 生成：`pnpm --filter @feishu-timeline/api prisma:generate`
- Prisma 校验：`pnpm --filter @feishu-timeline/api prisma:validate`
- 构建：`pnpm --filter @feishu-timeline/api build`
- 运行：`pnpm --filter @feishu-timeline/api start`

### 5.3 Web

- 构建：`pnpm --filter @feishu-timeline/web build`
- 运行：`pnpm --filter @feishu-timeline/web start`

## 6. 当前仓库对部署方式的证据

| 主题 | 结论 | 证据 |
| --- | --- | --- |
| Docker | 仅看到本地基础设施 compose；未看到 Web/API Dockerfile | `docker-compose.yml`、仓库文件清单 |
| PM2 | 未发现 `ecosystem.config.*` | 仓库文件清单 |
| systemd | 未发现 `.service` 文件 | 仓库文件清单 |
| Nginx | 未发现站点配置 | 仓库文件清单 |
| 反向代理必需性 | 高 | `apps/web/src/lib/auth-client.ts`、`apps/api/src/main.ts` |
| 子域名根路径部署适配度 | 高 | `apps/web/src/lib/auth-client.ts`、`apps/web/next.config.ts` |
| 路径前缀部署适配度 | 低 | `apps/web/src/lib/auth-client.ts`、`apps/web/next.config.ts` |

## 7. 运行时补充说明

1. API 健康检查只验证应用进程，不验证 PostgreSQL、Redis、附件目录。
2. Redis 不可用时，应用会退化到内存 session 和内存 queue，这不是生产可接受的长期形态。
3. `OBJECT_STORAGE_PROVIDER` 虽然存在于配置中，但当前代码实际只注册了本地文件系统实现。
4. 根目录 `.env.example` 不构成真实运行入口；应用实际读取的是 `apps/api` 与 `apps/web` 侧环境变量。
5. 当前仓库更适合部署为 `timeline.all-too-well.com` 这种独立子域名站点；如果要改成根域名路径前缀，需要额外改造。
