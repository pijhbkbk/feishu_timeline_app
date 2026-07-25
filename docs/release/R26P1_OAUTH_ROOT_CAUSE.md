# R26P1 OAuth 根因分析

## 结论

```text
LARK_PROVIDER_SELECTED=false
LARK_REQUEST_COUNT=0
PRIMARY_BLOCKER=PRODUCTION_APP_TENANT_OR_AVAILABILITY_SCOPE
```

R26P 的授权失败不是由 `larksuite.com` provider 引起。仓库、构建配置、staging 和
production 实际 OAuth start 均使用飞书中国大陆域名。

生产授权页上的“切换至 Lark 登录”是 `accounts.feishu.cn` 登录页提供的跨境账号入口，
不是当前登录链路正在使用 Lark 的证据。

## 可复现证据

### 仓库与产物来源

全仓库第一方源码和部署配置检查：

```text
accounts.larksuite.com       0
open.larksuite.com           0
Domain.Lark                  0
LARK_* runtime config        0
```

失败 runtime 的 API 配置为：

```text
authorization host          open.feishu.cn
authorization path          /open-apis/authen/v1/index
token host                  open.feishu.cn
user info host              open.feishu.cn
```

`open.feishu.cn/open-apis/authen/v1/index` 的实时 HTTP 响应为 302，Location host 是
`accounts.feishu.cn`。上次 production 浏览器地址栏也始终位于
`accounts.feishu.cn`，没有访问 `larksuite.com`。

### App ID 不一致

为避免泄露完整 App ID，仅比较 SHA256 前 12 位：

```text
staging App ID hash         1e8666fb3953
production App ID hash      5da19c9cf49e
match                       false
```

Gate 3B 真实 OAuth 通过的是 staging 应用；R26P 失败的是另一个 production 正式
应用。飞书授权页明确显示当前登录账号属于测试企业，且没有 production 应用使用权限。

飞书官方说明，企业自建应用只能在同一企业内发布和使用：
<https://open.feishu.cn/document/platform-overveiw/overview>。

据此，当前最符合全部证据的根因是：

1. staging 测试企业账号和 staging App ID 属于同一测试租户，因此能够登录；
2. production App ID 属于正式公司租户；
3. production smoke 使用了测试企业账号，或正式应用尚未把实际公司账号纳入可用范围；
4. 飞书在签发 code 前按应用租户/可用范围拒绝，因此 callback、token 和 user info
   均没有机会执行。

## 本轮代码加固

虽然 provider 不是本次根因，R26P1 仍消除未来配置漂移：

- 唯一 provider 固定为 `feishu-cn`；
- 浏览器只访问同源 `/api/auth/feishu/start`；
- API 生成 state 和完整授权 URL，并 302 到 `accounts.feishu.cn`；
- token 和 user info 固定为 `open.feishu.cn`；
- production 启动时校验 provider、域名、HTTPS callback、正式域名和服务端凭据；
- 删除未使用的 `NEXT_PUBLIC_FEISHU_APP_ID`，App ID 不再进入 Web 构建参数；
- Lark 域名只允许出现在负向测试中，不进入 API/Web production artifact。

## 必须人工复核的飞书后台配置

重新发布 production 前必须确认：

1. production App ID 属于公司飞书正式租户；
2. 用于 production smoke 的账号也属于该公司租户；
3. 该账号在应用可用范围内；
4. 应用版本已经发布；
5. callback 精确为
   `https://timeline.all-too-well.com/login/callback`；
6. 桌面端和移动端主页指向正式 V2 入口；
7. 获取用户身份权限已经发布生效。

不得用 staging App ID/Secret 替换 production 正式应用，也不得让用户改用 Lark 账号
绕过租户门禁。

## 修复候选自动化证据

```text
API unit tests                 293 / 293 PASS
Web unit tests                 127 / 127 PASS
Playwright                     62 / 62 PASS
E2E mainline                   PASS
lint / typecheck               PASS
Web / API production build     PASS
Prisma validate                PASS
Gitleaks current tree          PASS
Gitleaks full history          PASS
Web bundle Lark host files     0
API artifact Lark host files   0
Web bundle Feishu host files   0
```

Playwright 首次重跑曾因测试夹具仍模拟旧的 JSON 登录地址而失败；夹具改为验证真实
同源 start 后通过。另一次重跑期间并行执行 Prisma generate 触发本地 watch API
重启，造成连接重置；停止并行修改后从干净服务状态完整重跑 62 项全部通过。两者均未
发生在 staging 或 production。

以上证据只证明修复候选具备进入 staging 的技术条件，不代表 production 正式应用
租户/可用范围已经通过。
