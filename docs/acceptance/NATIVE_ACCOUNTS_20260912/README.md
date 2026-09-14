# 当前交付状态（2026-09-14）

## 2026-09-14 10:56 用户确认与后续浏览器读取

用户明确回复“可以进入工作台”，并提供正式域名Safari工作台截图。**原生账号登录→进入工作台已由用户实际确认**，范围状态 `USER_CONFIRMED_NATIVE_LOGIN_DASHBOARD`；不扩大为所有管理写入或整个产品已验收。

随后在同一Safari登录会话中实际查看了项目列表（原有项目仍在，进度10/18）、我的账号、账号目录及管理员搜索、组织人员管理页面。浏览器版本页正文也实际返回 `6c70a897ec7643f4681616d801481765aaa8f7bc`。截图/AX输出保存在本任务工具记录；用户所标注Desktop文件当前未找到，因此不声称已复制或生成该图片摘要。完整观察见 [用户确认记录](owner-browser-confirmation-20260914.json)。

发现工作台在无当前待办时显示“当前还没有项目”，而项目列表确有原项目；源码按canCreateProject选择此文案，并未据项目总数判空。此UI提示不一致仍开放，没有因此修改权限或创建项目；不把它归为数据丢失。最终返回工作台的地址/标题可见，但页面正文捕获缺失，未额外宣称刷新持久性通过。当前没有取得完整Network/console、响应式矩阵或注册/恢复/改密/授权提交证据。

本次仅追加验收证据，程序、数据库、main/tag均未改变，没有重新开启Cloud Shell或临时密钥。其他用户路径仍待完整验收；整体状态 `PRODUCTION_BROWSER_PARTIAL / USER_CONFIRMED_NATIVE_LOGIN_DASHBOARD`，不能标记整个产品 `PRODUCTION_ACCEPTED`。


### 发布复验时的记录（早于上述用户确认）

精确网站 `https://timeline.all-too-well.com` 在 `2026-09-14T01:56:49.490849+00:00` 完成程序更新，当前 Web/API、镜像和干净服务器源码副本的运行提交均为 `6c70a897ec7643f4681616d801481765aaa8f7bc`，tree `042c502720078f6f546931bf34c5396cb910c9fd`，release `native-auth-20260914-6c70a897ec76`，buildTime `2026-09-14T01:01:20Z`。运维提交另记为 `3ebcc84097f7a2c78d382f39afce79eff22ce58a`，证据提交不作为程序版本。

本次修复实际 Chrome 登录页报告的 HTML pattern Unicode Sets 语法错误。修复前 `/v` 回归失败，修复后定向8项、完整Web290项/58文件、lint、typecheck、Web构建及最终断网只读镜像的实际HTML约束检查通过；API源码、迁移、依赖未变，177个API编译文件仅构建元数据改变，按依据复用原生认证/权限/迁移既有验证。Docker中冻结依赖安装及两镜像构建通过；本机离线安装命令停在交互提示，不能算通过。正式源码Placeholder0，测试白名单10行。详见 [修复与制品证据](release-6c70-preparation.json)。

服务器实机中断演练通过：在固定更新检查点准确SIGKILL后，监督器自动恢复上一原生版本，原有登录会话随后仍能读取同一内部用户；全部52张表内容、结构和序列不变。正式更新后上述全部数据仍相同，保留37项迁移和原库保护；没有重做管理员初始化、数据库迁移或业务数据恢复。原始原库/原生库备份恢复证据按不变范围保留，未宣称新增全主机断电试验。见 [中断恢复](production-release-recovery-6c70.json) 和 [最终运行证据](production-runtime-6c70.json)。

最终正常TLS的27次网站请求通过：新运行版本原管理员密码登录、项目和用户目录、Secure/HttpOnly/SameSite会话、Origin负向、旧飞书410/mock403、退出后401、新登录HTML及9个静态脚本可读取。所有验证会话均已退出；见 [正式HTTPS验证](production-http-6c70.json)。首次升级观察器在实际成功之后因systemd回收已结束单元的InvocationID而断言失败；保留失败事实，通过固定调用日志、PID1成功结束事件和实际运行端只读复核补齐证据，没有再次更新。不能声称已验证旧会话跨正式升级继续可读；这次只实际验证了跨中断恢复和修正版的新登录。

密码认证、安全边界、发布控制器及安装/演练/更新脚本的最终变更均完成独立审查。最后一份只读运行证据脚本的额外独立复核因两个审查上下文均遇模型容量错误未完成；其实际结果按读取内容记录，不冒充另一份审查或全仓安全清关。此前审批拒绝上传API镜像，在补充同一目标私有仓库、项目所有权及无公开IAM授权证据后获准，未改换公开目的地。

用户解锁后，Chrome曾真实显示原生登录/注册/恢复入口；随后浏览器控制出现连接及屏幕采集故障。一次浏览器输入未被证明准确的登录尝试返回401，而同一私人凭据的独立HTTPS登录均200；没有据此归因密码错误。当前修正版尚缺真实浏览器刷新、登录后路由、Network/console、截图与交互的完整证据，详见 [浏览器实际观察与阻碍](browser-resume-20260914.md)。用户的手动登录结果询问仍待回复；产品负责人未明确接受。

当前准确状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_RUNTIME_SWITCHED / EXACT_DOMAIN_HTTP_PASS / DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging没有URL/运行版本或用户路径验收；main及tag未改变。原生登录、旧callback停用页、个人账号、工作台/项目、账号目录及别名、组织授权的生产浏览器验收均未完成，不能将整组路由标记PASS。

当前项目计费已启用，关联账号My Billing Account处于开启状态；这是2026-09-14实际Cloud Billing API读数，不提供余额、具体套餐或续费日期结论，见 [计费状态](cloud-billing-20260914.json)。本轮临时Cloud Shell公钥已删除并读回确认，管理连接已关闭，本机与服务器本轮镜像认证已删除；没有新转发Cloud Shell OAuth，也未退出用户原有云登录或删除应用扫描密钥，见 [访问清理](temporary-access-cleanup-20260914.json)。管理员用户名仍为 `lixiaochen`；私人密码文件保存在本机Downloads，未写入证据或对话。

---

# 2026-09-13 切换历史记录

正式域名 `https://timeline.all-too-well.com` 已在 `2026-09-12T17:38:51+00:00` 完成原生账号运行时切换。前后端运行提交 `f2da3629e13b2653aae8879c98992877d5ef4170`，tree `435fd8f66beef2760ce02388b0948cea35cee55e`，release `native-auth-20260912-f2da3629e13b`，buildTime `2026-09-12T14:22:42Z`。

实际HTTPS接口与进程重启验证 PASS：既有管理员密码登录、内部用户ID保留、项目与账号读取、Secure/HttpOnly/SameSite Cookie、无认证及Origin负向、旧飞书410/mock403、退出后401；见 [production-http.json](production-http.json)。API重启后会话保持；退出后Redis和API联合重启仍401，见 [production-session-restart.json](production-session-restart.json)。从本机正常TLS读取的登录HTML及对应新脚本均200，见 [public-http-readback.json](public-http-readback.json)。旧数据库完整指纹不变并关闭旧应用角色，两个旧服务停用，镜像/迁移/入口/扫描器及同机无关应用最终证据见 [production-runtime.json](production-runtime.json)。新原生库是完成37项迁移的 `feishu_timeline_restore_c38c57da`。

真实原始备份恢复、原生账号库独立恢复和提交前SIGKILL自动恢复均通过；唯一PG约束格式等价例外使用固定完整schema摘要对，表内容及序列仍严格相等，详见 [schema-restore-equivalence.json](schema-restore-equivalence.json) 和 [完整差异](schema-restore-equivalence.diff)。运维85项测试及各安全差异独立复核通过。部署过程和固定镜像证据见 [deployment-preparation.json](deployment-preparation.json)。

Mac锁屏导致真实浏览器通道不可用，用户已被请求解锁。实际域名页面、浏览器Network/console/截图和交互仍待完成，产品负责人未确认。准确状态：`CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_RUNTIME_SWITCHED / EXACT_DOMAIN_HTTP_PASS / DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION`。staging未执行，main/tag未改变。不能把接口PASS当作浏览器或产品验收PASS。

初始管理员用户名 `lixiaochen`，凭据已独占写入本机Downloads的私人0600文件，密码未进入源码、证据或对话。临时Cloud Shell公钥已删除并读回确认，两条管理主连接已关闭；本轮未新授予Cloud Shell OAuth凭据，见 [temporary-access-cleanup.json](temporary-access-cleanup.json)。固定本轮、含已授权重启操作的HTTP检查原始代码归档于 reviewed-checks，摘要与实测版本一致；它们不是例行维护任务。

---

# 切换前验证与访问障碍的历史记录

下述条目保留各自记录时的候选版本和状态；当前状态以上述交付记录及新证据为准。

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

13:58 UTC新进展：用户明确批准启动Cloud Shell，并另行批准临时加入本机公钥用于工具版本检查、检查后删除。只读云接口确认目标项目计费启用、计费账号有效、两台VM与Cloud Shell均RUNNING。Safari终端连接反复中断，独立页面空白；临时SSH方式经一次公钥API 500及官方两字段格式修正后连接成功，`gcloud version`返回SDK 583.0.0。临时公钥已删除并经API读回确认不存在。没有向Cloud Shell传送OAuth凭据，没有连接目标VM或执行生产操作。将该连接用于服务器排障和既定发布的具体范围确认已提出，尚待回复。此前13:34的启动审批障碍属于历史，已被后续启动授权解除；详细阶段记录见 [blocked-audit.json](blocked-audit.json)。

13:34 UTC恢复后复核：用户已登录Safari谷歌云控制台，订阅只读查询完成；尝试启动Cloud Shell被自动审批拒绝，理由是创建云管理会话超出了最近“只读查询订阅”的范围。启动未执行，未换入口绕过拒绝。具体确认请求已提出，尚无回复；三个连续恢复回合后控制台仍显示Activate Cloud Shell，没有已启动终端，目标再次标记 `BLOCKED`。需要用户对该具体管理入口明确确认后继续。此状态及此前主机连接证据分别保存在 [blocked-audit.json](blocked-audit.json)，不把控制台登录或账单可用当作服务器SSH恢复证明。

第三个连续目标回合于 12:34 UTC 复核同一访问障碍：当前任务无附加终端，本机无 SSH/gcloud/sftp/autossh 管理进程，正常 TLS 读取公开 Web/API 仍是旧版本。上一回合是完成浏览器证据提交的实质进展；本回合未取得可执行主机修复的新输入。复核见 [blocked-audit.json](blocked-audit.json)。此前 SSH 失败的精确主机原因仍未知，不能据此认定 Fail2ban 或 sshd 故障。

GCE IAP SSH 两次在协议 banner 前超时，尚未进入用户密钥认证；未执行远端命令。有效 NIC 防火墙允许 IAP tcp22，未见明确云端拒绝。已有云日志在失败窗口无匹配，不能证明主机无故障或已采集 sshd/Fail2ban 日志；监控读取也超时。Fail2ban 是未证实的候选原因。未开放端口、修改 IAM/metadata、重置密钥、重启 VM 或影响同机其他应用。

已通过界面显示的 GPT‑6 Pro 取得通用 IAP 诊断意见，与“需要现有可用管理会话取得 guest 监听/服务/日志证据”的结论一致。自动审批拒绝向 ChatGPT 发送私有技术摘要，该摘要未发送；随后只发送无项目私有内容的通用问题。模型意见不能充当权限或产品负责人确认。

恢复发布需要已有可用主机管理入口或管理方的 SSH 监听、服务状态和故障窗口日志。连接恢复后依次核对实际拓扑/旧版本与迁移、应用专属备份及恢复、私有不可变提交接收、扫描器/配额与现有特权发布控制器、准确旧管理员绑定、受控切换、精确 HTTPS 域名原生登录与业务/审计复测。旧停用发布脚本不得直接绕过；主机检查未完成前不能标记 DEPLOYMENT_READY。

staging 未部署/未验收；生产新账号版未部署/未验收；main/tag 未改变；未取得 `PRODUCT_OWNER_ACCEPTED`。


### 2026-09-12 14:52 UTC：管理访问恢复，真实备份/恢复通过

用户已明确授权Cloud Shell用于完整交付及结束清理，两个VM的既有SSH通路均已恢复。当前运行候选升级为 `f2da3629e13b2653aae8879c98992877d5ef4170`（可信容器代理的客户端限速地址修正，59项目标检查、lint、类型和独立复核通过）；三个固定镜像已上传本人项目的既有私有仓库。

独立备份控制器提交 `f231659f989ad445fb22807314a44daf0a9f786a` 经22项测试、真实PG未提交角色创建/收口并发验证和独立复核后安装。实际备份及新库恢复均成功，46表的数据与完整结构/序列/迁移记录、0附件对象一致；原API已恢复，恢复角色已关闭登录。原业务数据与网站运行版本未切换，主分支/tag未改。扫描器与发布步骤仍在进行，未达到DEPLOYED或产品验收。当前证据见 [deployment-preparation.json](deployment-preparation.json)，早先访问/审批blocker只保留为历史。
