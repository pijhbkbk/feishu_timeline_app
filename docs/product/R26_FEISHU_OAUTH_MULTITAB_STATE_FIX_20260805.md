# R26 飞书 OAuth 多标签 state 竞态修复

日期：2026-08-05

## 失败复现

- 环境：本机 Docker staging。
- 精确 URL：`http://localhost:8080/login/callback`。
- 用户路径：同时存在多个未登录的受保护页面标签；各标签自动进入登录流程；完成其中一个飞书
  授权后回调。
- 失败结果：页面显示“飞书登录状态与当前浏览器不匹配，请重新发起登录”。
- 原始证据：`/Users/lixiaochen/Desktop/截屏2026-08-05 上午8.42.59.png`。

## 根因

登录入口为每次请求生成独立、服务端保存且仅可消费一次的 OAuth state，但浏览器端原来只有一个
固定名称的 HttpOnly state Cookie。两个标签几乎同时请求 `/api/auth/feishu/start` 时，后发请求
覆盖先发 Cookie；飞书返回先发 state 后，服务端看到浏览器 Cookie 不匹配并正确返回 401。

这不是飞书 code 交换失败，也不是通过放宽 state 校验可以修复的问题。

## 修复

- Cookie 名称改为 `ft_feishu_oauth_state_<state-digest>`，摘要使用 SHA-256 并截取固定长度。
- 回调根据请求体中的 state 选择对应 Cookie，只清理本次回调的 Cookie。
- 保留 HttpOnly、SameSite、Secure 策略、限定 Path、10 分钟 TTL、服务端一次性消费与防重放。
- 前端、数据库、用户权限和业务状态机均未改变。

## 验证结果

- Service 与 Controller 定向测试：2 files / 18 tests PASS。
- API lint：PASS。
- API typecheck：PASS。
- 全仓 lint、typecheck、test、Web/API build、Prisma validate 与 `git diff --check`：PASS。
- 全量计数：Web 45 files / 176 tests；API 68 files / 315 tests。
- 连续发起两个真实本地 start 请求：两个不同 state Cookie 同时保留。
- 真实浏览器：从 `/login` 新发起授权，选择已关联测试企业，回调后进入
  `http://localhost:8080/projects`。
- 登录用户：李晓晨；真实项目卡与新建项目入口可见。
- console/page error：0。
- 成功截图：`docs/product/evidence/R26_LOGIN_STATE_FIX_20260805/login-success-local.png`。

## 环境身份与边界

- environment：本机 Docker staging。
- hostname：`localhost:8080`。
- database：本机 Docker PostgreSQL。
- API image：`feishu-timeline-api:local-oauth-concurrent-state-20260805`。
- Web image：`feishu-timeline-web:local-department-delete-20260803`。
- API runtime metadata：`runtimeCommit=unknown`、`release=development`。
- production：未改变，未验证。
- main / tag：未改变。

当前状态：`CODE_IMPLEMENTED / LOCAL_REAL_OAUTH_VERIFIED / PRODUCTION_UNCHANGED /
AWAITING_PRODUCT_OWNER_CONFIRMATION`。
