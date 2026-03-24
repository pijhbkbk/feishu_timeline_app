# 轻卡新颜色开发项目管理系统

面向 MVP 的模块化单体系统，覆盖轻卡新颜色开发项目的主链路、关键并行节点、评审、附件、日志、Dashboard 和站内通知。

## 技术栈

- 前端：Next.js 15 + TypeScript
- 后端：NestJS 11 + Prisma
- 数据库：PostgreSQL
- 缓存与队列：Redis
- 文件：对象存储适配层，本地开发默认走 filesystem
- 登录集成：飞书登录适配层 + Mock 登录

## 仓库结构

- `apps/web`：前端应用
- `apps/api`：后端应用
- `packages/shared`：共享常量与构建配置
- `docs`：开发说明、验收清单

## 本地启动

前置要求：

- Node.js 24+
- pnpm 9+
- Docker / Docker Compose

启动步骤：

1. `pnpm install`
2. `pnpm infra:up`
3. `pnpm prisma:migrate`
4. `pnpm prisma:seed`
5. `pnpm dev`

默认地址：

- 前端：[http://localhost:3000](http://localhost:3000)
- 后端健康检查：[http://localhost:3001/api/health](http://localhost:3001/api/health)

## 环境变量

根目录：

- [.env.example](/Users/lixiaochen/Downloads/feishu_timeline_plugin/.env.example)

后端：

- [apps/api/.env.example](/Users/lixiaochen/Downloads/feishu_timeline_plugin/apps/api/.env.example)

前端：

- [apps/web/.env.example](/Users/lixiaochen/Downloads/feishu_timeline_plugin/apps/web/.env.example)

关键变量说明：

- `DATABASE_URL`：PostgreSQL 连接串
- `REDIS_URL`：Redis 连接串
- `AUTH_MOCK_ENABLED`：本地 mock 登录开关
- `OBJECT_STORAGE_PROVIDER`：对象存储提供方，开发默认 `local`
- `OBJECT_STORAGE_LOCAL_ROOT`：本地文件存储根目录
- `NOTIFICATION_QUEUE_ENABLED`：通知队列开关
- `FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_REDIRECT_URI`：飞书登录配置

## 数据库与种子

迁移：

- `pnpm prisma:migrate`
- `pnpm prisma:validate`

种子：

- `pnpm prisma:seed`

当前 seed 会生成：

- 管理员与 6 类角色测试用户
- 基础部门与角色
- 基础供应商
- 1 个进行中演示项目
- 1 个已完成演示项目

推荐使用的 mock 用户名：

- `admin`
- `mock_project_manager`
- `mock_process_engineer`
- `mock_quality_engineer`
- `mock_purchaser`
- `mock_reviewer`
- `mock_finance`

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm prisma:migrate`
- `pnpm prisma:validate`
- `pnpm prisma:seed`

## 测试命令

全量检查：

- `pnpm prisma:validate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

说明：

- 当前仓库的“E2E”采用现有 Vitest + route smoke 方案，不额外引入大型浏览器依赖。
- 若需要真实数据库联调，请先启动 PostgreSQL 和 Redis。

## 主要页面

工作台：

- `/dashboard`
- `/tasks/my`
- `/tasks/pending`
- `/tasks/overdue`

项目中心：

- `/projects`
- `/projects/new`
- `/projects/:projectId/overview`
- `/projects/:projectId/workflow`
- `/projects/:projectId/tasks`
- `/projects/:projectId/samples`
- `/projects/:projectId/standard-boards`
- `/projects/:projectId/paint-procurement`
- `/projects/:projectId/performance-tests`
- `/projects/:projectId/pilot-production`
- `/projects/:projectId/reviews`
- `/projects/:projectId/fees`
- `/projects/:projectId/production-plans`
- `/projects/:projectId/mass-production`
- `/projects/:projectId/color-evaluation`
- `/projects/:projectId/color-exit`
- `/projects/:projectId/attachments`
- `/projects/:projectId/logs`

## 开发文档

- [开发文档](/Users/lixiaochen/Downloads/feishu_timeline_plugin/docs/DEVELOPMENT.md)
- [MVP 验收清单](/Users/lixiaochen/Downloads/feishu_timeline_plugin/docs/MVP_ACCEPTANCE.md)

## 已知说明

- 主业务流转由后端控制，前端不直接改状态。
- 审计日志必须保留，关键写操作都会写 `audit_logs`。
- 附件二进制不进 PostgreSQL，只存对象存储，数据库只存元数据。
- Redis 或飞书通知异常不应阻断主业务提交。
