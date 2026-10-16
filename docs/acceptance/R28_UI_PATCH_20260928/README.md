# R28 后续程序补丁（41→41）

目标为 https://timeline.all-too-well.com，固定程序提交 e917da56b9fca54a40635364e168fdb26a080fb1；源程序29ed14c81e297c56699ba571cfc6946a00ccb942，原始37→41迁移锚点与收据保持原样。此提交仅为独立发布控制源码，不能当作目标网站已更新的证据。

补丁 Web/API 固定制品、构建时间、树和七个Web变更文件摘要见 `native_release_target_r28_patch.py`。该差异只包含项目卡片/详情布局、固定业务角色标签及回归测试；API、依赖、Prisma模型和迁移未变化。只有显式清单中的Web文件允许进入补丁。

程序状态由独立追加事件和原子head决定：BASE → PREPARED → PROTECTED → WRITE_ENABLE_INTENT → VERIFIED_CLOSED → OPEN_INTENT → COMMITTED。每个事件绑定原迁移锚点、程序计划、前一事件及当前41结构备份。每次启动校验旧切换凭证、原迁移锚点完整性、全部41条名称/checksum/成功状态及实际PG14 schema；旧37程序始终被拒绝，未知/缺失/旧head/半份事件/非最终状态保持关闭。开放入口比启动程序多一层阶段门禁。

安装器只接受7f509fccc05258b3f61bef69b93be52137c554ec时已安装的固定字节；先安装新target/helper，再持久BASE，然后替换backup/app/cutover门禁，最后替换dispatcher。所有旧控制器与历史凭证保留，其他服务/系统权限未扩展。BASE事件存在而head不存在时不得自动重置。旧cutover的restore/source fallback在本安装代际不再存在；历史提交凭证丢失会关闭当前业务写入。

发布只执行当前54表的受控备份与程序替换，不执行迁移、seed、reconcile、数据/对象/队列恢复或自动程序回退。全数据指纹相等检查仅在写入许可之前；候选API启动后允许正常租约/提醒/审计写入，此后只检查schema、制品和备份完整性，不能恢复快照覆盖新数据。

验证记录保存在本机ignored `var/admin-worktree/var/r28-verification/m4-patch-*`：

- 最终40项组合测试通过：阶段/身份/损坏日志、安装文件写入和原子替换中断、fresh Python进程加载各代门禁、BASE event无head、历史切换收据丢失、相关备份/保全/socket边界；增补54表限定验证后15项程序边界通过（不重复计数）。
- API/Web固定平台镜像构建和私有推送；原生登录、人员1440/1024/390、刷新、提醒、退出会话撤销及角色/详情布局/关闭点击通过。源码343项Web、9项浏览器、lint/typecheck/build通过。API/schema/dependency未变，复用29ed对应验证。
- 独立PG14.24采用已测定66f3恢复结构hash，专门数据库/非超级用户/Redis；SIGKILL保护后和写入许可后启动前两场景通过。该适配只在隔离测试脚本中，正式门禁仍固定生产d506结构，测试不冒充systemd或公开入口恢复。
- 新API实际启动、真实新增合成审计后及OPEN_INTENT阶段SIGKILL均已通过：候选API在主进程被杀后确实存活，恢复停止API并关闭角色/清空会话，新增事实、迁移锚点、程序记录均保留。四项隔离中断验证均PASS，没有执行迁移或数据库恢复；Mac适配未测试systemd/公开入口，不能冒充生产演练。最终独立静态审查核验7个源码摘要、17个旧控制器和4个单元摘要匹配，未见确定阻断；正式发布证据待附加。初始测试夹具的权限/子进程模拟错误日志保留，未计PASS。

部署前必须从干净提交生成五份固定脚本，私有远端ref可解析后执行checkout/pull/install/update/proof，并在精确域名重新核验页面。产品状态仍为AWAITING_PRODUCT_OWNER_CONFIRMATION；不修改main/tag。
