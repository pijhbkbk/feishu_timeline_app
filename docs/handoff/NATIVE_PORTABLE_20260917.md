# 原生账号与可携带恢复：当前交接

更新时间：2026-09-18。当前网站修复已部署并完成原生浏览器读取路径验证；独立虚拟机的合成恢复、断网重启、再次备份及空目标恢复均有实际通过证据。完整产品仍为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。旧失败、用户原有登录确认及证书待处理事实保留。

## 当前版本和生产证据

- Production：`https://timeline.all-too-well.com`；runtime/server HEAD `c5aed415cd17e6e8a21b422a4c5c92b4b924e091`；tree `830e562f5ec56e99d7fc0b04432fc056dd772254`；release `native-portable-20260917-c5aed415cd17`；buildTime `2026-09-17T08:04:51Z`。实际更新结束 `2026-09-17T09:27:01.821805Z`。
- API `sha256:40544930b329416679f24ebc6dd2354e24beaec9d8490b9edbdbda5e0f71d192`；Web `sha256:774419239cea09f8d341fd29ed34361b47012c720bafbe7a3a5ef0d60ffa187b`；Ops `sha256:bc47eab26f3de164a4cca805453b467fa88922944ca6bdae240a2a8bceda614f`。固定 tag 为上述 release，摘要为实际运行身份；证据提交不改变镜像。
- 数据库 `feishu_timeline_restore_c38c57da`，PostgreSQL 14.24，52表、37条完成迁移及checksum匹配；Nginx Web `127.0.0.1:3000`、API `127.0.0.1:3001`。本次程序更新不恢复数据库、不重放迁移、不seed。
- 首次 d16 rehearsal 因两固定 socket 缺 MainPID 失败。bf2 精确修补经126项测试及独立静态审查，唯一重演通过，真实SIGKILL后恢复旧原生版；随后一次 update、proof通过。保护备份 `20260917T092220Z-2bbb186c` 与 `20260917T092643Z-3d9c4f8a` 留在原服务器受保护目录。旧API退出137属于冻结一致性备份，不能称优雅排空；未演练生产整机重启。
- 18项实际HTTPS检查通过：本地密码、同一内部身份、原项目1项/10 of 18、账号目录12项、Cookie、Origin负向、旧OAuth410/mock403、退出后401；全部脚本会话退出。09-18公开元数据再次正常TLS200/c5。
- 09-18浏览器实际原生登录→工作台：显示“当前没有待处理工序”，不再误报“当前还没有项目”；刷新保持，1440/1024/390无页面横向溢出。原项目仍1项、10/18，真实详情和历史可读；未推进原业务。
- 个人账号、组织人员、账号目录及显式别名可读；目录搜索命中/空结果/刷新通过；旧回调显示第三方入口停用并返回本地登录。测试会话已通过菜单退出，刷新仍为原生登录；用户Safari原会话未动。捕获console warn/error为0。
- 页面资源清单实际观察到同源API fetch与新静态资源；它不提供浏览器HTTP状态，不能称HAR。HTTP状态来自单独的正常TLS验证。浏览器直接打开JSON `/build-info` 被客户端阻止，保留原页面；未绕过，版本由独立公开元数据与服务器/镜像证据绑定。旧fullPage拼接异常保留，视觉判定使用viewport截图。

## 独立恢复和交付材料

- 软件与A3同固定c5。A3 `https://localhost:3450` 从最终包空库安装/目录/管理员初始化，6模式253真实HTTP通过；注册、岗位不自授权、正式角色、停用、密码/恢复/会话、跨项目拒绝、RETURN/重提/扫描/APPROVE/采购/后续节点及审计均有新证据。Web297、API1353及构建质量结果按应用/依赖未变化依据复用；60测试/6文件SKIPPED不计PASS。
- B `https://localhost:9444`：Lima2.2.0、Ubuntu24.04 arm64、4CPU/6GiB/40GiB、Docker29.5.2、Compose5.5.1、Node24.14.0；linux/amd64六镜像经已安装Apple Rosetta执行。仅系统共享 `/mnt/lima-rosetta`，没有用户/项目/源备份共享；镜像首次导入前0镜像/0容器。此配置是已测试前提，不是最低资源或任意平台/域名承诺。
- 主机与容器公网、原GCE、元数据出口实际拒绝；冷启动后规则保持，控制通道保留。先前QEMU失败、临时文件丢失、测试下载新增合法审计、proxy128MiB OOM及过早start锁拒绝均保留。外部审查profile仅proxy512MiB及验证CA/固定主机和c5的真实TLS健康检查，冻结软件不变。
- A→B加密备份实际恢复52表/2对象，完整数据/身份/授权/作者比对。B1在旧恢复码仍未到期时拒绝旧会话/旧码、允许原密码及新恢复码；后续过期不充当该证明。新业务21请求、PNG真实CLEAN/下载同SHA/CSV通过；应用重启和整个VM冷重启后再登录/读取通过。
- B第二备份恢复至空目标 `timeline-portable-f22b433b00ca`：52表/3对象、4合成项目，22HTTP通过；新增项目/附件跨恢复保留、原会话边界无效、队列只产生一次通知/待处理0/去重期限不延长。最终B2保持运行，旧实例停止保留；09-18 01:59:55Z status exit0、六服务running，API/Web/PG/proxy healthy。没有将生产私有数据复制到B。
- 精确方向schema例外经所有者明确批准：`3f933e582eab518c24e308cb9991e1f5fab16c310eee10f041e38746cb76b4c0`→`175721348d4d09345618dcec49699b70d2cc13ee7298e3c78bfd6ebdc9fd52c6`，5项回归及静态审查通过；其他摘要、行/序列/对象门禁不变。旧审批拒绝保留；namespace恶意SQL动态实验受平台阻止，不冒称动态PASS。
- 持久材料：原项目 `var/native-portable-delivery-20260917/final-c5aed415cd17`。软件/源码、合成加密备份、秘密分别放置；私有截图及原始证明留在ignored var。原软件15文件及补充94文件已有逐项复制校验；09-18再附76文件、约114MB，另稳定登录截图有独立摘要清单。秘密未再读取/混入Git。
- 阅读该目录 `交付说明.md`、`PORTABLE-RECOVERY-RUNBOOK.md`、`EXECUTED-COMMANDS.md`。只列实际成功执行的安装、初始化、启动、停止、状态、备份、恢复、签名导入、受控发布；日期不同的状态附录不改旧61项恢复证据。
- 原离线签名daily28125于2026-09-18 06:24:23Z（北京时间14:24）达到48小时策略期限。已另备官方验证daily28126至2026-09-19 06:24:16Z（北京时间14:24），仅准备未激活B或生产；复制不延长期限。过期阻止相关新附件放行，不阻止原生登录和非附件功能。生产已有独立签名维护路径，此次本地新集合不代表生产已刷新。

## 状态与后续边界

- `CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_DEPLOYED / PRODUCTION_BROWSER_READ_PATH_PASS / AWAITING_PRODUCT_OWNER_CONFIRMATION`。独立B合成迁移为限定profile的技术PASS，不能称真实生产异机迁移完成。
- 本机浏览器证书提示由用户暂缓处理，`https://localhost:9444/login` 仍NOT_ACCEPTED。工具不得越过安全提示或改全机信任。注册/恢复/改密/正式授权与业务写操作的人工UI验收仍待所有者；隔离HTTP结果不代替实际UI接受。没有再次索要已给出的工程权限。
- main仍 `41b4b166c587692e6f0fb9536dca2e1aab646c70`，tag及原有脏文件/媒体不变；工作成果持久保存在原项目 `codex/native-portable-recovery`，不公开推送。无新付费资源、DNS、其他应用或全局平台权限变更。
- 暂时Cloud Shell密钥早已删除，本轮没有新建；临时registry认证09-17实际目录0，observer09-18确认退出；保留原用户云/SSH凭据。无需再次部署或重跑已通过整套测试。

证据入口：[A2/A3与恢复](../acceptance/NATIVE_A2_20260917/README.md)、[生产运维](../acceptance/NATIVE_RELEASE_20260917/PRODUCTION_OPERATIONS_RESULT_20260918.md)、[正式浏览器清单](../acceptance/NATIVE_A2_20260917/production-browser-20260918.json)、[最新路由矩阵](../acceptance/ROUTE_ACCEPTANCE_MATRIX.md)。
