# R26 未登录访问飞书重定向修复

## 结论

2026-07-31 已修复未登录或本地应用会话失效时访问 V2 业务路由仍先显示业务外壳和
“真实数据暂时不可用 / 重新读取”的问题。

现在访问 `https://timeline.all-too-well.com/projects` 时，页面先完成应用会话检查：

- 有有效应用会话：正常显示业务页面；
- 无有效应用会话：直接进入 `/login`，再由服务端生成 OAuth state 并跳转飞书中国区；
- 应用会话接口失败：显示独立的登录服务错误和重试，不再冒充业务数据错误。

## 根因与修复

根因是 `V2Shell` 在 `AuthProvider` 完成会话判断前就渲染了受保护导航和业务子页面。
业务 GET 随后返回 401，页面把它归入通用数据错误，所以用户看见“重新读取”，而不是
进入飞书登录链路。

修复内容：

- `V2Shell` 增加登录态前置门禁；
- 未登录时不渲染导航、头像或业务子页面；
- 会话确认未登录后使用 `window.location.replace('/login')`；
- 保留现有 `/api/auth/feishu/start` 服务端 OAuth state、安全回调和飞书中国区地址；
- 增加组件回归与 Playwright 未登录路由回归。

## 验证

### 本地技术门禁

```text
pnpm install --frozen-lockfile                         PASS
pnpm lint                                              PASS
pnpm typecheck                                         PASS
pnpm test                                              PASS
pnpm --filter web build                                PASS
pnpm --filter api build                                PASS
pnpm --filter api prisma:validate                      PASS
V2Shell auth unit tests                                5 / 5 PASS
Playwright unauthenticated V2 redirect                 1 / 1 PASS
git diff --check                                       PASS
```

### 生产运行身份

```text
environment              production
URL                      https://timeline.all-too-well.com
runtime commit           63b4998b3893b42ec7f2b80d4181d3ca37f67fa7
build time               2026-07-30T17:56:08Z
release                  r26-admin-63b4998b3893
Web build ID             kBY9vkvu9guvBkeIDcQbA
API artifact SHA256      ddf94da4c8b87890b1d44b073151b11874c2e852f6e135738f37c5aedc22ecc0
Web image/tag            不适用（systemd 源码构建）
API image/tag            不适用（systemd 源码构建）
Nginx Web upstream       http://127.0.0.1:3000
Nginx API upstream       http://127.0.0.1:3001
database                 PostgreSQL feishu_timeline / public / localhost
migrations               23 found / schema up to date
API/Web/Nginx             active / active / active
```

`API runtimeCommit == Web runtimeCommit == server HEAD == expected commit`。

### 精确生产 URL 浏览器复测

复现前：

- URL：`https://timeline.all-too-well.com/projects`
- 结果：显示“真实数据暂时不可用 / 请先登录后再操作 / 重新读取”；
- 证据：`evidence/R26_AUTH_REDIRECT_FIX_20260731/01-before-projects-unauthenticated.png`。

修复后：

- 从同一 URL 重新打开；
- 最终 hostname：`accounts.feishu.cn`；
- 最终 path：`/open-apis/authen/v1/index`；
- callback：`https://timeline.all-too-well.com/login/callback`；
- 正式应用：商用车定制色开发项目管理系统；
- 旧业务导航、通用数据错误和“重新读取”均未出现；
- 证据：`evidence/R26_AUTH_REDIRECT_FIX_20260731/02-after-projects-feishu-login.png`。

浏览器中已有飞书账号会话时，飞书会显示账号授权页；没有飞书账号会话时，由飞书显示
扫码登录页。应用只负责把未登录请求安全地交给飞书，不能也不应强制清除飞书自身会话。

## 状态

```text
CODE_IMPLEMENTED
LOCAL_VERIFIED
PRODUCTION_DEPLOYED
PRODUCTION_USER_PATH_VERIFIED
MAIN_MERGED
AWAITING_PRODUCT_OWNER_CONFIRMATION
```
