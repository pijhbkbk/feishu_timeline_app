# GCE Step 7 Production Acceptance

更新时间：2026-04-09

本文件对应“第 7 步：正式验收与稳定化”。

## 正式入口

- 正式业务入口：`https://timeline.all-too-well.com`
- 根域名：`https://all-too-well.com`
  - 只作为占位页 / 未来总入口
- `https://www.all-too-well.com`
  - 只跳转到 `https://all-too-well.com`

## 本轮新增脚本

- [`gce-production-acceptance.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-production-acceptance.sh)
- [`gce-log-tail.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-log-tail.sh)
- [`gce-redeploy.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-redeploy.sh)

## 这一步要回答什么

1. `timeline.all-too-well.com` 是否已经是唯一正式业务入口
2. 根域和 `www` 是否只做占位页 / 跳转
3. 飞书登录是否真的可用，而不是只停在“页面能打开”
4. Redis、Cookie、CORS、systemd、Nginx 是否达到可维护状态
5. 出问题时如何重发版、看日志、快速回滚

## 当前正式验收口径

正式验收至少要同时满足：

1. 公网 DNS、HTTP、HTTPS 行为正确
2. `timeline` 的 `/`、`/login`、`/dashboard`、`/projects`、`/api/health` 响应正常
3. `/api/auth/session` 返回：
   - `authenticated=false`
   - `mockEnabled=false`
   - `feishuEnabled=true`
4. `/api/auth/feishu/login-url` 返回：
   - `enabled=true`
   - `loginUrl` 非空
5. 远端：
   - `feishu-timeline-api`、`feishu-timeline-web`、`nginx`、`redis-server` 都是 `active`
   - `redis-cli ping` 返回 `PONG`
   - `nginx -t` 成功

## 飞书正式验收清单

入口必须统一为 `https://timeline.all-too-well.com/login`。

后端必须同时具备以下配置：

- `FRONTEND_URL=https://timeline.all-too-well.com`
- `FEISHU_REDIRECT_URI=https://timeline.all-too-well.com/login/callback`
- `FEISHU_AUTHORIZATION_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/index`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `AUTH_MOCK_ENABLED=false`

并且以下值不能还停留在示例占位值：

- `FEISHU_APP_ID=your_feishu_app_id`
- `FEISHU_APP_SECRET=your_feishu_app_secret`
- `NEXT_PUBLIC_FEISHU_APP_ID=your_feishu_app_id`

代码上的约束：

- [`apps/api/src/modules/feishu/feishu-auth.adapter.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/feishu/feishu-auth.adapter.ts) 会同时要求：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_REDIRECT_URI`
  - `FEISHU_AUTHORIZATION_ENDPOINT`
- [`apps/api/src/modules/auth/auth.service.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/auth/auth.service.ts) 只有在 adapter `isConfigured()` 为 `true` 时才会给前端返回可用的飞书登录地址。
- [`apps/web/src/app/login/callback/login-callback-client.tsx`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/web/src/app/login/callback/login-callback-client.tsx) 固定回调路径是 `/login/callback`。
- [`apps/web/src/components/auth-provider.tsx`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/web/src/components/auth-provider.tsx) 会先调用 `/api/auth/feishu/login-url`，再在回调后调用 `/api/auth/feishu/callback` 和 `/api/auth/session`。

飞书控制台必须人工核对：

1. 回调白名单必须包含：
   - `https://timeline.all-too-well.com/login/callback`
2. 登录发起入口必须仍然是：
   - `https://timeline.all-too-well.com/login`
3. 登录成功后应回到：
   - `https://timeline.all-too-well.com/login/callback?...`
   - 然后前端跳到 `/projects`

## Redis 正式要求

当前代码里 Redis 不是“页面能否打开”的硬依赖，但它承担正式生产的重要能力：

- 会话持久化
- 通知队列

当 Redis 不可用时：

- [`apps/api/src/modules/auth/session-store.service.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/auth/session-store.service.ts) 会退化到内存会话
- 通知队列也会退化到内存模式

结论：

- 生产不应把 Redis 视为可忽略增强项
- 正式验收时应把 `redis-server active + redis-cli ping=PONG` 当作放行条件之一

## Cookie / CORS 口径

- API 通过 [`apps/api/src/main.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/main.ts) 使用 `FRONTEND_URL` 配置 CORS
- API 通过 [`apps/api/src/modules/auth/auth.service.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/auth/auth.service.ts) 在生产下写 `secure` Cookie
- Cookie 当前是 host-only，没有显式 `Domain`

对本项目这是合理的，因为：

- 前端和 API 都走 `timeline.all-too-well.com`
- `/api` 由同源 Nginx 反代
- 不需要跨根域或跨子域共享登录态

## Cloudflare 建议

- `@`
  - 可以代理
- `www`
  - 保持 `CNAME -> all-too-well.com`
  - 可以跟随根域代理
- `timeline`
  - 飞书登录完整通过前，优先保持 `DNS only`
  - 待飞书回调、Cookie、登录态真正走通后，再评估是否切到 `Proxied`

如果未来要让 `timeline` 走 Cloudflare 代理，至少还要核对：

- SSL/TLS 模式保持 `Full (strict)`
- 不缓存 `/api/*`
- 不修改 `/login/callback` 回调链路
- 不引入会影响 OAuth 的额外跳转规则

## 常用命令

正式验收：

```bash
bash scripts/deploy/gce-production-acceptance.sh
```

重发版：

```bash
bash scripts/deploy/gce-redeploy.sh
```

查看日志：

```bash
bash scripts/deploy/gce-log-tail.sh
bash scripts/deploy/gce-log-tail.sh TARGET=api
bash scripts/deploy/gce-log-tail.sh TARGET=nginx
```

查看回滚说明：

```bash
bash scripts/deploy/gce-rollback-checklist.sh
```

## 本轮关键收口

1. `gce-sync-and-build.sh` 和 `gce-postcutover-hardening.sh` 现在都会显式写入：
   - `AUTH_MOCK_ENABLED=false`
   - `NEXT_PUBLIC_ENABLE_MOCK_LOGIN=false`
2. 正式验收脚本会明确把以下两项判为失败：
   - `mockEnabled=true`
   - `feishuEnabled=false`
3. Redis 已纳入正式验收，不再只看 `/api/health`
4. 重发版脚本会复用现有部署脚本，不再另起一套发布入口

## 达到正式可用前的最后阻塞口径

如果 `gce-production-acceptance.sh` 失败，优先看两项：

1. `FEISHU_AUTHORIZATION_ENDPOINT` 是否已在 API 生产 env 中填写为 `https://open.feishu.cn/open-apis/authen/v1/index`
2. 飞书开放平台回调白名单是否已指向 `https://timeline.all-too-well.com/login/callback`

如果这两项都对，但脚本仍失败，再看飞书相关 env 是否还停留在示例占位值。
