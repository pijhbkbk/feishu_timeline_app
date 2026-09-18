# 登录体验与工号、8字符密码策略交付记录 — 2026-09-18

正式网站：https://timeline.all-too-well.com/login 。修正已实际运行并完成本轮技术复验，产品负责人对这次视觉与密码策略的接受仍待确认。

- 登录、注册和恢复同用浅色居中卡片；1440px 桌面实测宽440px，390px手机两侧各16px，无横向溢出。注册/忘记密码为次要链接。项目工作区未套用认证宽度。
- 可见登录标识统一为“工号”，输入提示“请输入工号”；内部 username 字段、内部用户ID、旧登录标识与历史作者/权限关系保留。工号按字符串处理，`001234` 与 `1234` 不合并，JSON数字或其他非字符串被拒绝。工号不会自动认领旧账号或授予角色。
- 所有新密码入口最低8个Unicode码点，最长128码点且不超过512字节；无新复杂字符组合要求。原有弱口令检查、Argon2id哈希参数和登录限流保持，补充了短常见弱口令。旧密码登录路径不按新设密码规则重新拒绝。**这是所有者产品密码策略调整，不宣称符合NIST单因素15字符要求。**

## 实际验证

| 目标 | 证据与结果 |
|---|---|
| 原账号及长密码兼容 | 正式网站原 `lixiaochen` 与未改动32字符密码：实际HTTPS登录、浏览器进入工作台、刷新仍登录、读取原项目通过。未改用户密码。 |
| 新8字符非弱密码可设置 | 最终固定镜像真实HTTP注册/改密/恢复通过；真实CLI初始化与绑定通过；设置后实际登录通过。全部为隔离合成账号。 |
| 7字符拒绝 | 注册/改密/恢复实际HTTP400；CLI初始化/绑定拒绝。失败设置未消耗恢复码，随后同码合法8字符成功。 |
| 长密码持续有效 | 隔离长密码账号在全部策略操作后继续登录；正式原长密码继续有效。旧c5实际编译校验器可校验新版8字符哈希。 |
| 标识及权限 | 实际编译4个DTO共32断言，数字/布尔/null/数组/对象拒绝；前导零字符串保留。48次隔离HTTP还覆盖重复409、未授权403、会话撤销及限流429。 |
| 页面 | 正式login/register/recover共6张1440×1000与390×844真实viewport截图；原账号/工作台/项目/管理/旧入口另6张。截图原图和SHA256已保存。 |
| 必要本地检查 | 冻结安装、lint、typecheck、Web/API构建、Prisma验证通过；Web309、API1356通过。通用API命令61 SKIPPED不计PASS；真实PostgreSQL13项另行通过。Portable普通测试5通过2跳过；未重新生成旧离线包。 |
| 发布安全 | 固定Ops129回归、最终差异/证据/调用器独立静态审查通过。真实SIGKILL演练自动恢复旧c5；正常停写备份和正式更新通过，两次API均正常退出0。未运行迁移、seed或DB恢复。 |

浏览器实际资源清单观察到 auth/session、v2/dashboard、v2/projects、auth/accounts 与 admin/organization 请求，以及新Web静态文件。HTTP状态来自单独18项正常TLS验证，不冒充浏览器HAR。捕获到console warn/error为0；工具不提供独立pageerror事件流。旧callback卡片及返回链接已观察，最终点击后未再观察目标页，不把该点击计为返回导航PASS。

## 环境与不可变身份

- Runtime：`541b3dfff682aa29b49a96b251f0a084903c981a`
- Tree：`bc65d7145a498066556f2abc8d8619a6643dc325`
- Release：`native-login-20260918-541b3dfff682`
- Build time：`2026-09-18T03:23:33Z`
- Production deployment time：`2026-09-18T03:40:16.918106+00:00`（北京时间11:40）
- API：`us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/api@sha256:558a873483641df75dde47b5b39dcc21087c397ae19f364ef03c820b2a52430f`
- Web：`us-west1-docker.pkg.dev/axial-acrobat-492709-r7/feishu-timeline/web@sha256:7cc7ad6328a3e318e5a34af21e56d4840279ba698365ee51661cd3d23050f26f`
- Source image tags均为对应repository的`:native-login-20260918-541b3dfff682`；生产以以上digest固定。API/Web metadata、server HEAD、活动状态和镜像摘要实际一致。
- Ops runtime：`0f4980733d6c1265f0677904a5aa4e3ac94776bc`；本轮证据commit与运行commit分开。
- Production DB：`feishu_timeline_restore_c38c57da`；52表、37项migration不变；原项目1项、进度10/18，原用户12个。
- Nginx upstream：Web `127.0.0.1:3000`、API `127.0.0.1:3001`。
- 本机隔离URL：`http://127.0.0.1:3350/login`，Web/API同541提交，合成数据库`native_auth_test_http_v2`、Redis隔离db1；只向loopback暴露。验证后已正常停止本轮服务，保留测试数据库卷，不再在线。
- 私有源码ref：`refs/heads/codex/native-login-release-20260918`（541）；私有Ops ref：`refs/heads/codex/native-login-ops-20260918`（0f498）。未向公开仓库发布；main及tag未改。
- 保护备份：演练`20260918T033846Z-8de19b91`；发布`20260918T033959Z-3198b06e`。正常停写、52表/37migration和程序更新不变证据已保存；这是进程中断恢复演练，不称主机重启演练。

## 保留的失败与适用性

初候选6fd在真实HTTP中接受数字工号，已撤回且从未部署生产。根因是正式tsc元数据使全局隐式转换生效，原Vitest环境未复现。最终只对工号DTO保留原类型再校验，新增正式元数据测试和真实HTTP回归；不改全局转换。原失败记录、库和镜像保留。

离线依赖缓存缺包、Prisma缓存权限、测试PG初启竞态、测试输入缺字段与本机预览缺EXPECTED元数据均保留原始记录，诊断后按各自范围修正。未通过跳过断言或删测试冒充PASS。旧业务/附件/权限逻辑、数据库schema和依赖未改变，其c5验证只按未受影响范围复用；不把旧OAuth结果当作密码登录安全证明。

## 清理与范围

本轮HTTP/浏览器验证会话已退出；用户Safari会话未触碰。仅正常停止本轮4个合成测试容器及3350代理，保留卷与失败证据。两端专属registry认证已清理；本轮使用既有严格IAP/SSH路径，没有新增Cloud Shell公钥或OAuth授权，因此不撤销用户现有云登录/既有密钥。没有项目/权限/历史数据写入，只有正常登录审计追加。旧localhost:9444证书警告与旧离线包不属于本次登录UX修正，不改变其历史状态。

## 本轮14项状态

| 项目 | 准确结果 |
|---|---|
| 1 代码是否实现 | CODE_IMPLEMENTED，运行541；只改本轮认证体验/产品策略及必要边界回归。 |
| 2 本地测试 | LOCAL_VERIFIED，以上实际计数；SKIPPED分开。 |
| 3 staging精确URL | 本机隔离 http://127.0.0.1:3350/login（验证后已停止）；未新增远端staging。 |
| 4 staging runtime | 541b3dfff682aa29b49a96b251f0a084903c981a。 |
| 5 staging用户路径 | 两档表单、合成前导零账号实际登录、8/7策略HTTP/CLI通过；新密码浏览器提交未执行。 |
| 6 production是否改变 | 是，03:40:16Z受控程序更新，DB/项目数据不变。 |
| 7 production runtime | 541b3dfff682aa29b49a96b251f0a084903c981a。 |
| 8 production用户路径 | 原账号登录/刷新/读取原项目/退出，两档登录注册恢复布局、工号标签与搜索通过；生产新凭据设置未执行。 |
| 9 main是否改变 | 未改变，仍41b4b166c587692e6f0fb9536dca2e1aab646c70；用户原脏修改保持。 |
| 10 tag是否改变 | 未改变。 |
| 11 产品负责人确认 | 本次修正尚无PRODUCT_OWNER_ACCEPTED；原先进入工作台的确认不扩大到本次。 |
| 12 未完成路由 | 本轮工程目标无未实现路由；注册/恢复/改密及授权写入的人工浏览器验收、旧callback返回导航观察未执行，历史完整产品验收不宣称完成。 |
| 13 Placeholder | 正式源码0；既有测试白名单10行。 |
| 14 当前状态 | CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_DEPLOYED；本轮技术检查通过；AWAITING_PRODUCT_OWNER_CONFIRMATION。 |

私有完整证据：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/login-experience-delivery-20260918`。精简JSON、图片摘要与路由矩阵同时保存在源码证据提交；不提交密码、Cookie、环境文件、数据库备份或原始测试输出。
