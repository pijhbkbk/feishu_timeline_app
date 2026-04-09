# 环境变量盘点

更新时间：2026-04-09

## 1. 已确认的旧机 env 结构

旧腾讯云当前至少存在以下 env 文件：

### 主用 env

- `/opt/feishu_timeline_app/apps/api/.env.production`
- `/opt/feishu_timeline_app/apps/web/.env.production`

### 附带 env

- `/opt/feishu_timeline_app/.env`
- `/opt/feishu_timeline_app/apps/api/.env`
- `/opt/feishu_timeline_app/apps/web/.env`

本轮迁移策略：

1. 主用 env 继续按旧机真实路径恢复
2. 附带 env 作为兼容和核对材料可选恢复
3. 不在本轮强行重构成单一 env 文件

## 2. 为什么本轮不直接改成统一 `/etc/.../production.env`

上一轮曾把 systemd `EnvironmentFile` 统一到 `/etc/feishu_timeline_app/production.env` 作为推荐方向。

但在补充了旧机真实信息后，本轮优先级变为：

1. 先兼容旧机真实运行方式
2. 先保证 Web/API 都能按旧路径起起来
3. 先避免因为 env 路径调整引入新的不可见变量

因此本轮 systemd 模板保持：

- API：`/opt/feishu_timeline_app/apps/api/.env.production`
- Web：`/opt/feishu_timeline_app/apps/web/.env.production`

后续再逐步收敛 env 结构。

## 3. 为什么现有 package.json `start` 脚本不适合直接上生产

### API

`apps/api/package.json`

```bash
dotenv -e .env.example -- node dist/main.js
```

### Web

`apps/web/package.json`

```bash
dotenv -e .env.example -- next start --hostname 127.0.0.1 --port 3000
```

问题：

1. 两者都显式依赖 `.env.example`
2. 生产环境不应让示例值参与启动
3. systemd 应直接调用已确认过的真实启动命令

因此本轮实际生产运行模板采用：

- API：`node /opt/feishu_timeline_app/apps/api/dist/main.js`
- Web：`bash -lc 'cd /opt/feishu_timeline_app/apps/web && exec pnpm exec next start --hostname 127.0.0.1 --port 3000'`

注意：

1. Web 运行不只是依赖 `PATH`，还依赖 `HOME` 和 `corepack` 缓存目录可用
2. 本轮模板显式要求：
   - `HOME=/home/feishu`
   - `COREPACK_HOME=/home/feishu/.cache/node/corepack`
   - `PATH=/usr/local/bin:/usr/bin:/bin`
3. 上线前必须人工验证：

```bash
sudo -u feishu -H env \
  HOME=/home/feishu \
  COREPACK_HOME=/home/feishu/.cache/node/corepack \
  PATH=/usr/local/bin:/usr/bin:/bin \
  node -v

sudo -u feishu -H env \
  HOME=/home/feishu \
  COREPACK_HOME=/home/feishu/.cache/node/corepack \
  PATH=/usr/local/bin:/usr/bin:/bin \
  pnpm -v
```

如果 `pnpm -v` 失败，说明不能直接启 Web 服务。

同时，迁移验收脚本会把以下 API 关键变量当作基础必填项检查：

- `DATABASE_URL`
- `REDIS_URL`
- `FRONTEND_URL`
- `OBJECT_STORAGE_LOCAL_ROOT`

## 4. 本轮构建阶段的 env 策略

为了避免 `build`、`start` 脚本把 `.env.example` 带入生产，恢复脚本采用显式命令：

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @feishu-timeline/shared build`
3. API：
   - `pnpm exec prisma generate --schema prisma/schema.prisma`
   - `pnpm exec tsc -p tsconfig.build.json`
   - `pnpm exec prisma validate --schema prisma/schema.prisma`
4. Web：
   - `pnpm exec next build`

运行这些命令前，脚本会分别 `source`：

- `apps/api/.env.production`
- `apps/web/.env.production`

## 5. API 关键变量

| 变量名 | 作用 | 本轮备注 |
| --- | --- | --- |
| `NODE_ENV` | 生产模式开关 | 建议 `production` |
| `HOST` | API 监听地址 | 生产保持 `127.0.0.1` |
| `PORT` | API 监听端口 | 旧机现实是 `3001` |
| `FRONTEND_URL` | CORS / Cookie 相关 | 应切到 `https://timeline.all-too-well.com` |
| `DATABASE_URL` | PostgreSQL 连接 | 必需 |
| `REDIS_URL` | Redis 连接 | 建议必配，避免退化 |
| `AUTH_MOCK_ENABLED` | Mock 登录 | 生产建议 `false` |
| `SESSION_COOKIE_NAME` | Session Cookie 名 | 建议与旧机一致 |
| `SESSION_TTL_SECONDS` | Session TTL | 建议与旧机一致 |
| `OBJECT_STORAGE_PROVIDER` | 存储 provider | 当前代码实际只接本地实现 |
| `OBJECT_STORAGE_LOCAL_ROOT` | 本地对象存储根目录 | 当前真实目录需与 `/opt/feishu_timeline_app/var/object-storage` 核对 |
| `FEISHU_APP_ID` | 飞书登录配置 | 必需时填写真实值 |
| `FEISHU_APP_SECRET` | 飞书登录密钥 | 敏感信息 |
| `FEISHU_REDIRECT_URI` | 飞书回调地址 | 应改为 `https://timeline.all-too-well.com/login/callback` |

## 6. Web 关键变量

| 变量名 | 作用 | 本轮备注 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | 前端标题/展示 | 可保留 |
| `NEXT_PUBLIC_API_BASE_URL` | 前端 API 基址 | 推荐 `/api` |
| `NEXT_PUBLIC_FEISHU_APP_ID` | 前端公开飞书 ID | 当前源码未直接使用 |
| `NEXT_PUBLIC_ENABLE_MOCK_LOGIN` | 前端 mock 开关 | 生产建议关闭 |

## 7. object-storage 的特殊说明

已确认事实：

1. 旧 API `WorkingDirectory=/opt/feishu_timeline_app/apps/api`
2. 真实附件目录是 `/opt/feishu_timeline_app/var/object-storage`

这和代码中可能受 `process.cwd()` 影响的路径解析之间存在待核对不一致。

因此本轮结论是：

1. 恢复脚本必须显式恢复 `/opt/feishu_timeline_app/var/object-storage`
2. 解析公式已确认就是：

```text
resolve(process.cwd(), OBJECT_STORAGE_LOCAL_ROOT || 'var/object-storage')
```

3. 这意味着旧机真实路径要成立，只可能是以下两类情况之一：
   - `OBJECT_STORAGE_LOCAL_ROOT` 本身就是绝对路径 `/opt/feishu_timeline_app/var/object-storage`
   - 或者它是相对于 `/opt/feishu_timeline_app/apps/api` 能解析到该目录的相对路径，例如 `../../var/object-storage`
4. 恢复脚本和验收脚本都会按这个公式计算，并要求结果等于 `/opt/feishu_timeline_app/var/object-storage`
5. 不在本轮擅自把附件目录重定向到新绝对路径

本地验证补充：

- 按当前仓库 `apps/api/.env.example` 计算，解析结果是 `apps/api/var/object-storage`
- 这说明示例 env 不能直接代表旧机生产路径
- 旧机生产 env 必须显式覆盖这个值，否则附件会落到错误目录

## 8. 多站点辅助变量

根级 [`.env.production.example`](/Users/lixiaochen/Downloads/feishu_timeline_app/.env.production.example) 保留了一组部署元数据：

- `ROOT_DOMAIN`
- `APP_HOST`
- `PUBLIC_APP_URL`

这些变量不是当前代码直接读取的主逻辑变量，主要用于：

1. 帮助区分 `all-too-well.com` 与 `timeline.all-too-well.com`
2. 强化“本项目只属于 timeline 子域名”的部署约束
3. 让未来 blog/docs 继续沿用相同命名约定

## 9. 后续收敛建议

迁移稳定后，再考虑做以下收敛：

1. 统一 env 管理入口
2. 清理历史遗留的附带 `.env`
3. 补齐 env 字段清单和值来源说明
4. 把环境变量管理和证书管理纳入统一运维规范
