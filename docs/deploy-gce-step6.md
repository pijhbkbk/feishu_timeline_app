# GCE Step 6 Post-Cutover Hardening

更新时间：2026-04-09

本文件对应“第 6 步：DNS / HTTPS 完成后的正式切流收尾、飞书 OAuth 核对、安全收口、回滚与巡检”。

## 正式入口

- 正式业务入口：`https://timeline.all-too-well.com`
- 根域名：`https://all-too-well.com`
  - 只保留为占位页 / 未来总入口
  - 不应反代到 timeline 业务应用
- `https://www.all-too-well.com`
  - 应直接跳转到 `https://all-too-well.com`

## 第 6 步新增脚本

- [`gce-postcutover-hardening.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-postcutover-hardening.sh)
- [`gce-release-verify.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-release-verify.sh)
- [`gce-rollback-checklist.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-rollback-checklist.sh)

## 这一步解决什么

1. 为 `timeline.all-too-well.com` 签独立证书，避免 443 落到根域证书
2. 把 API 生产 env 中的正式入口统一到 `https://timeline.all-too-well.com`
3. 把飞书 OAuth 回调地址统一到 `https://timeline.all-too-well.com/login/callback`
4. 让根域和 `www` 只承担占位页 / 跳转，不误入业务站
5. 给公网验证、上线巡检、回滚提供固定脚本

## 必须核对的环境变量

API:

- `FRONTEND_URL=https://timeline.all-too-well.com`
- `FEISHU_REDIRECT_URI=https://timeline.all-too-well.com/login/callback`
- `FEISHU_AUTHORIZATION_ENDPOINT=https://open.feishu.cn/open-apis/authen/v1/index`
- `DATABASE_URL`
- `REDIS_URL`
- `OBJECT_STORAGE_LOCAL_ROOT`

Web:

- `NEXT_PUBLIC_API_BASE_URL=/api`
- `NEXT_PUBLIC_FEISHU_APP_ID`

说明：

- [`apps/api/src/modules/feishu/feishu-auth.adapter.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/feishu/feishu-auth.adapter.ts) 会把 `FEISHU_REDIRECT_URI` 同时用于授权 URL 和 token exchange。
- 同一个 adapter 还要求 `FEISHU_AUTHORIZATION_ENDPOINT` 非空，否则飞书登录会被视为“未配置”。
- [`apps/api/src/main.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/main.ts) 会使用 `FRONTEND_URL` 配置 CORS。
- [`apps/api/src/modules/auth/auth.service.ts`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/api/src/modules/auth/auth.service.ts) 在生产环境下会使用 `secure` Cookie。

所以如果 `FRONTEND_URL` 或 `FEISHU_REDIRECT_URI` 还停留在 `http://localhost:3000` 或 `http://timeline...`，飞书正式登录会不稳定甚至直接失败。

## 使用顺序

1. 执行切流后的加固：

```bash
bash scripts/deploy/gce-postcutover-hardening.sh
```

2. 执行正式入口验证：

```bash
bash scripts/deploy/gce-release-verify.sh
```

3. 查看回滚提示：

```bash
bash scripts/deploy/gce-rollback-checklist.sh
```

## 飞书正式上线检查清单

- 飞书开放平台白名单中的回调地址已改成：
  - `https://timeline.all-too-well.com/login/callback`
- API `FEISHU_REDIRECT_URI` 与飞书控制台完全一致
- API `FRONTEND_URL` 与正式入口一致，并且为 `https://timeline.all-too-well.com`
- 浏览器登录从 `timeline.all-too-well.com/login` 发起，而不是根域名
- 回调页面仍是 [`/login/callback`](/Users/lixiaochen/Downloads/feishu_timeline_app/apps/web/src/app/login/callback/login-callback-client.tsx)
- 登录成功后能建立 Cookie 会话并跳到 `/projects`

## Cloudflare 最终建议

推荐口径：

- `@`
  - 可以切到 `Proxied`
  - 但前提是根域占位页与 443 证书已经稳定
- `www`
  - 保持 `CNAME -> all-too-well.com`
  - 可随根域一起代理
- `timeline`
  - 在飞书登录、Cookie、回调稳定前，优先保持 `DNS only`
  - 待正式登录链路完整通过后，再评估是否切到 `Proxied`

原因：

- timeline 是正式业务入口，任何 Cloudflare 代理层的缓存、证书模式、头部改写或跳转策略错误，都会直接影响飞书 OAuth 和 Cookie 会话。
- 根域只是占位页，切代理的风险明显更低。

## 暂不建议自动改动的安全项

- SSH 22 端口收紧
  - 当前若不能确认固定出口 IP，不建议直接改
- HSTS
  - 如果还在调试 Cloudflare / 飞书回调，不建议立刻强推
- Cloudflare 代理模式
  - timeline 在登录链路完全验收前先不要激进切到 Proxied

## 已知风险

1. Redis 若仍然 `ECONNREFUSED`，应用虽然可退化，但不应视为正式稳定态
2. 飞书控制台回调白名单若未同步，登录一定失败
3. 如果重复执行第 4 步部署脚本，旧版本会把 `FRONTEND_URL` 写回 `http://timeline...`
   - 本轮已修复 [`gce-sync-and-build.sh`](/Users/lixiaochen/Downloads/feishu_timeline_app/scripts/deploy/gce-sync-and-build.sh)，并在已有 timeline HTTPS 配置时默认不覆盖 Nginx

## 常用巡检命令

```bash
bash scripts/deploy/gce-release-verify.sh
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'systemctl status feishu-timeline-api --no-pager -l'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'journalctl -u feishu-timeline-api -n 120 --no-pager'
gcloud compute ssh instance-20260408-091840 --project=axial-acrobat-492709-r7 --zone=us-west1-b --command 'sudo nginx -t && sudo nginx -T | sed -n \"1,220p\"'
```
