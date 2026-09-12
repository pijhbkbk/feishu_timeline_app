# 原生账号候选验证记录

状态：`CODE_IMPLEMENTED / TARGETED_LOCAL_VERIFICATION_PASS / LOCAL_BROWSER_PARTIAL / NOT_DEPLOYED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。

本阶段目标为 `https://timeline.all-too-well.com`。截至 2026-09-12 12:34 UTC，公开 Web/API 仍运行 `535041bb25f21d548d863d07b35e3e952b0aeb2c`；本次没有生产写入、迁移、服务切换或用户路径验收。目标因生产管理连接不可用标记 `BLOCKED`，候选实现和已有验证保留，未缩小网站交付目标。

## 候选身份

- 规则更新提交：`de8005a`；主体实现：`5daaf7f2e722e47f3384a57fd09fd4ed3f7f7f4f`。
- 最终运行提交：`1767dbb5eeb30cc57835081de761e1eccb8fac8b`。
- source tree：`199cb837b6dd7682eda61928e108be397498236b`。
- release：`native-auth-20260912-1767dbb5eeb3`；build time：`2026-09-12T11:49:49Z`。
- 实施工作树：`/private/tmp/timeline-native-auth-20260912`，分支 `codex/native-account-auth`。干净构建工作树：`/private/tmp/timeline-native-release-1767dbb`。证据提交与运行提交分开。
- 本机 URL：`http://127.0.0.1:3350`，仅 loopback；代理 Web `3352`、API `3351`。使用独立合成 PostgreSQL/Redis，API 为 development profile，mock 关闭；不等同生产 HTTPS/Cookie/代理验收。
- Web/API 本机运行标识一致，见 [local-runtime.json](local-runtime.json)。三个 Linux 镜像的 tag/digest/构建标签见 [images.json](images.json)，未上传。
- 私有 Git bundle 和源码 tar 保存在本机临时目录，摘要见 [verification.json](verification.json)。未推送公开仓库，main/tag 未改变；服务器接收、remote commit 和 server HEAD 尚未验证。

## 新验证与复用边界

| 检查 | 结果及范围 |
|---|---|
| 原生认证/真实 PostgreSQL/Redis 退出 | 最终 26 PASS；注册竞争、管理员初始化、恢复一次性消费、会话撤销、最后管理员、操作者/角色撤销并发、限速与退出 |
| 实际 HTTP 认证 | 最终制品 32 请求 PASS；Origin、DTO 注入、密码登录/改密、轮换、退出、岗位自授拒绝、旧 OAuth 410、无 HTTP 初始化/绑定入口 |
| 实际 HTTP 项目范围 | 14 请求 PASS；新账号即使是项目所有者仍须角色权限；测试角色配置后本项目可读，跨项目读取/写入拒绝，列表隔离，拒绝后数据/审计不变；管理员目录读取成功。角色来自显式合成夹具，不是管理员配置页面验收，见 [project-scope.json](project-scope.json) |
| 已构建 CLI | 首次初始化并发仅一成功、一拒绝且正常退出；重复初始化、不安全密码文件拒绝；准确旧 ID 绑定保留身份/部门/原权限并递增认证版本，见两个 cli JSON |
| Linux 密码依赖 | 最终镜像断网、只读、UID 1000 下真实 Argon2 hash/verify PASS，CLI 文件存在 |
| 迁移/备份恢复 | 完整 37 项迁移应用成功；旧 schema 合成业务关系、迁移前后 pg_dump/restore 验证通过，旧 User ID、业务外键和历史作者保留，不自动创建密码/管理员。最终迁移/schema 未改变，因此按同一迁移摘要复用；不是生产备份恢复证据 |
| 候选质量 | 最终 lint、API 类型、Prisma validate、Web/API 构建及 Web/API/ops Linux 构建 PASS。Web 最近 288 PASS；实现阶段完整 API 1332 PASS、43 个环境专用 skip。后续窄变更按上述目标/数据库/CLI 验证覆盖；skip 不计 PASS，不声称全量均在最终提交重跑 |
| 供应链/占位 | 同一 lockfile 的生产依赖 audit 报告各级 0；非全仓或镜像安全清关。正式源码 Placeholder 匹配 0，10 行测试白名单：7 个 getByPlaceholder 调用、3 个负向断言（包含 r20-fixtures.ts） |
| 独立审查 | 原生认证最终差异及随后 Redis/初始化窄修复均获独立只读 focused PASS；不等同组织批准或全仓无漏洞 |

CLI 真实退出测试发现未使用的 lazy Redis 客户端在关闭时启动连接并阻止进程退出。修复前目标回归 4 FAIL，修复后 14 PASS；最终 PostgreSQL 合并批次 26 PASS。最终提交同时要求：已有系统管理员时，首次初始化不得省略准确旧用户 ID。

项目范围用例首次因此前合成客户端已触发注册限速返回 429；改用独立 RFC 5737 合成客户端地址后验证范围行为。未清空限速记录、删除断言或调整阈值。实际反向代理的可信来源和客户地址转发仍须在生产拓扑上核验。

原始日志、工具版本、lockfile/migration 和制品摘要索引见 [verification.json](verification.json)。合成迁移结果：`/var/folders/k1/2d51vgv932n4tr8qdvt__fgh0000gn/T/timeline-native-migration-5CQxGJ/result.json`；备份摘要 `27e633b4a102e4817c06c6f719b699124b5e41a2dc8a2e76716a8457dc88eaf8`。这些备份仅含合成夹具，未复制到 Git。

## 浏览器证据范围

本机真实 Chrome 在 `5daaf7f…` 制品上观察到原生登录、注册/恢复表单、普通用户登录、岗位意向选择、刷新及服务重启后登录态/意向保留、待授权导航隐藏、退出后拒绝读取账号，以及合成管理员密码登录进入真实空工作台。DevTools Network 观察到 session 200；Console 的一条 unload policy 信息来源为 Chrome 扩展，未观察到应用错误。相关截图已在当前任务工具结果显示。

待授权用户直接访问 `/admin/accounts` 回到账号授权状态。前一候选阶段曾因浏览器控制工具无响应暂停；本次使用 Chrome 原生界面与独立 Incognito 窗口完成以下最终 `1767dbb…` 复验，12:30 UTC 再读 Web/API 元数据仍与固定候选一致：

- 合成管理员通过原生密码登录进入真实工作台，再打开账号管理、个人账号页。
- 登录、注册、恢复三种表单、管理员账号目录、个人账号页均检查 1440/1024/390 CSS 宽度，保存 17 张 PNG；手机个人账号页的底部操作可通过正常纵向滚动到达。
- 账号目录搜索返回准确的合成账号、岗位意向和未分配正式角色；无匹配搜索显示明确空状态。
- 关闭缓存刷新账号目录，23 个 GET 请求均返回 200 且仅访问本机；会话返回 `localEnabled=true`、`feishuEnabled=false`、`mockEnabled=false`，工作台返回 `authSource=local` 与数据库数据源。
- 保存 DevTools 脱敏 HAR，检查无 Cookie/Set-Cookie/Authorization/CSRF 头、cookies 数组、非 GET 或请求体；无密码提交进入该记录。个人账号 Console 在 All levels 下没有应用异常，保留一条密码表单缺少用户名字段的浏览器自动填充/可访问性建议。账号目录另有一条未展开的 possible improvement 提示，不声称浏览器零提示。

图片、完整摘要、精确 URL、视口与 SHA256 见 [浏览器清单](browser/manifest.json)，网络见 [账号目录 GET HAR](browser/admin-accounts-get.har)，控制台见 [个人账号日志](browser/account-console.log)。这些只证明本机合成数据下的已观察路径，不证明生产 HTTPS/Cookie 或完整业务写入。

注册/新密码/恢复的浏览器提交、管理员正式角色/部门/项目配置、完整流程/评审/附件写入浏览器验收以及生产所有新身份路径仍待完成。相关 HTTP/数据库验证已取得，但不代替浏览器交互或产品负责人确认。整体仍为 `LOCAL_BROWSER_PARTIAL`。

## 发布阻塞与恢复条件

13:34 UTC恢复后复核：用户已登录Safari谷歌云控制台，订阅只读查询完成；尝试启动Cloud Shell被自动审批拒绝，理由是创建云管理会话超出了最近“只读查询订阅”的范围。启动未执行，未换入口绕过拒绝。具体确认请求已提出，尚无回复；三个连续恢复回合后控制台仍显示Activate Cloud Shell，没有已启动终端，目标再次标记 `BLOCKED`。需要用户对该具体管理入口明确确认后继续。此状态及此前主机连接证据分别保存在 [blocked-audit.json](blocked-audit.json)，不把控制台登录或账单可用当作服务器SSH恢复证明。

第三个连续目标回合于 12:34 UTC 复核同一访问障碍：当前任务无附加终端，本机无 SSH/gcloud/sftp/autossh 管理进程，正常 TLS 读取公开 Web/API 仍是旧版本。上一回合是完成浏览器证据提交的实质进展；本回合未取得可执行主机修复的新输入。复核见 [blocked-audit.json](blocked-audit.json)。此前 SSH 失败的精确主机原因仍未知，不能据此认定 Fail2ban 或 sshd 故障。

GCE IAP SSH 两次在协议 banner 前超时，尚未进入用户密钥认证；未执行远端命令。有效 NIC 防火墙允许 IAP tcp22，未见明确云端拒绝。已有云日志在失败窗口无匹配，不能证明主机无故障或已采集 sshd/Fail2ban 日志；监控读取也超时。Fail2ban 是未证实的候选原因。未开放端口、修改 IAM/metadata、重置密钥、重启 VM 或影响同机其他应用。

已通过界面显示的 GPT‑6 Pro 取得通用 IAP 诊断意见，与“需要现有可用管理会话取得 guest 监听/服务/日志证据”的结论一致。自动审批拒绝向 ChatGPT 发送私有技术摘要，该摘要未发送；随后只发送无项目私有内容的通用问题。模型意见不能充当权限或产品负责人确认。

恢复发布需要已有可用主机管理入口或管理方的 SSH 监听、服务状态和故障窗口日志。连接恢复后依次核对实际拓扑/旧版本与迁移、应用专属备份及恢复、私有不可变提交接收、扫描器/配额与现有特权发布控制器、准确旧管理员绑定、受控切换、精确 HTTPS 域名原生登录与业务/审计复测。旧停用发布脚本不得直接绕过；主机检查未完成前不能标记 DEPLOYMENT_READY。

staging 未部署/未验收；生产新账号版未部署/未验收；main/tag 未改变；未取得 `PRODUCT_OWNER_ACCEPTED`。
