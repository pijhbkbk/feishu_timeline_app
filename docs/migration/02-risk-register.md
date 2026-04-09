# 迁移风险登记

更新时间：2026-04-09

| 风险 ID | 级别 | 风险描述 | 仓库证据 | 影响 | 缓解建议 |
| --- | --- | --- | --- | --- | --- |
| R-01 | 高 | 现有 API/Web 启动脚本显式加载 `.env.example`，不适合直接用于生产 | `apps/api/package.json`、`apps/web/package.json` | 新机可能误用示例值连接错误数据库、Redis 或飞书应用 | 生产改由 systemd/PM2/启动包装脚本注入真实环境变量；`.env.production.example` 只作模板，不直接上机执行 |
| R-02 | 高 | 附件目录通过 `process.cwd()` + `OBJECT_STORAGE_LOCAL_ROOT` 解析 | `apps/api/src/infra/storage/object-storage.service.ts` | 只要服务工作目录不同，附件读写路径就会变化，导致“文件丢失”假象 | 新机部署时固定 API `WorkingDirectory`；恢复前先确认旧机实际落盘路径 |
| R-03 | 高 | 仓库内没有 Nginx/systemd/PM2 正式部署配置 | 仓库文件清单、全文检索 | 无法从仓库直接推导线上守护方式、反向代理规则、日志路径 | 从旧腾讯云导出真实配置；本轮新增 `deploy/nginx`、`deploy/systemd` 仅作骨架 |
| R-04 | 高 | 前端默认请求同源 `/api`，但仓库没有 Next.js rewrites | `apps/web/src/lib/auth-client.ts`、`apps/web/next.config.ts` | 若 `timeline.all-too-well.com` 的反向代理没把 `/api/*` 指到 Nest，前端将全站报错 | 生产统一使用同源反向代理，并在切流前做浏览器级验证 |
| R-05 | 高 | 登录态依赖 `secure` Cookie 与 HTTPS/同域配置 | `apps/api/src/modules/auth/auth.service.ts`、`apps/api/src/main.ts` | Cloudflare SSL 模式、源站协议、回调 URL 不一致时，飞书登录会失败或会话不落地 | 切流前联调 `FEISHU_REDIRECT_URI`、Cloudflare SSL 模式、Nginx 回源协议与 Cookie 行为 |
| R-06 | 中 | `/api/health` 只返回应用级 `ok`，不检查 PostgreSQL/Redis/附件目录 | `apps/api/src/modules/health/health.controller.ts` | 切流前后容易出现“健康检查正常，但核心依赖失效” | 切流验证必须覆盖 DB 读写、Redis、登录、附件上传下载，不能只看健康检查 |
| R-07 | 高 | 当前代码只注册本地文件系统存储实现，但配置里暴露了多种 provider 名称 | `apps/api/src/infra/storage/storage.module.ts`、`apps/api/src/common/app-config.ts` | 旧生产若存在仓库外改造，单看代码会误判附件真实位置 | 旧机必须人工确认附件真实存储位置；若为外部对象存储，单独补迁移方案 |
| R-08 | 中 | Redis 失败会退化到内存 session 和内存 queue | `apps/api/src/modules/auth/session-store.service.ts`、`apps/api/src/modules/queue/notification-queue.service.ts` | 服务看似可用，但多实例、重启、切流后会话与通知都不可靠 | 把 Redis 连通性纳入上线阻断项；验证时检查登录保持与通知入队行为 |
| R-09 | 中 | 根目录 `.env.example` 中端口/数据库字段并未被应用代码直接消费 | 根 `.env.example`、全文检索 | 运维可能误以为改根 env 即可生效 | 以 `apps/api`、`apps/web` 及进程注入环境变量为准，根 env 仅作参考 |
| R-10 | 中 | 仓库要求 Node 24+，GCP 新 Ubuntu VM 默认未必满足 | 根 `package.json` | 版本不匹配会导致构建或运行异常 | 新机先安装并锁定 Node 24.x 与 pnpm 9.x，再做恢复 |
| R-11 | 中 | Redis/PostgreSQL 的生产部署位置在仓库内不可见 | 仓库无证据 | 容易把“本地 compose 结构”误当成“线上真实结构” | 必须人工确认旧腾讯云是否同机部署、独立主机或云托管服务 |
| R-12 | 中 | Cloudflare 仍在 DNS/CDN 层，但仓库不包含任何 Zone/SSL/WAF 规则 | 仓库无证据 | 切流时可能出现回源错误、缓存污染、HTTPS 失败或访问策略拦截 | 切流前先盘点 Cloudflare DNS、代理、SSL/TLS、缓存与安全规则 |
| R-13 | 高 | 当前仓库没有 `basePath`/`assetPrefix`，默认是站点根路径部署模型 | `apps/web/src/lib/auth-client.ts`、`apps/web/next.config.ts` | 如果误把项目改挂 `all-too-well.com/timeline`，可能导致路由和静态资源访问异常 | 本轮坚持部署到 `timeline.all-too-well.com` 站点根，不做路径前缀改造 |
| R-14 | 高 | 根域名与子域名职责若未拆开，会破坏多站点共存目标 | 仓库无 Nginx 多站点配置；前端默认为单站点同源 `/api` | 若 `all-too-well.com` 仍直接回到本项目，会让未来总入口无法独立演进 | Nginx 与 Cloudflare 必须把根域名和 `timeline` 子域名拆成独立站点入口 |
| R-15 | 中 | 飞书回调地址默认示例仍是 localhost，本轮切到子域名时必须同步更新 | `apps/api/.env.example`、`apps/api/src/common/app-config.ts` | 若飞书控制台与生产 env 不同步，`timeline.all-too-well.com` 登录会失败 | 切流前统一更新 `FEISHU_REDIRECT_URI` 与飞书开放平台配置 |
| R-16 | 低 | Cookie 未显式设置 `Domain`，默认为 host-only | `apps/api/src/modules/auth/auth.service.ts` | 不会跨子域共享登录态；但这反而有利于多站点隔离 | 保持 host-only，除非后续明确需要跨子域共享会话 |

## 风险处置优先级

优先先解决以下项目，再进入真正切流：

1. R-01 `.env.example` 误载风险
2. R-02 附件目录真实路径确认
3. R-03 旧机真实反向代理/守护配置导出
4. R-04 `timeline.all-too-well.com` 的 `/api` 同源代理打通
5. R-05 HTTPS + Cookie + 飞书回调联调
6. R-14 根域名与子域名职责拆分

## 当前状态

- 已完成：风险识别与文档化
- 未完成：任何生产变更、任何子域名切换、任何旧机下线动作
