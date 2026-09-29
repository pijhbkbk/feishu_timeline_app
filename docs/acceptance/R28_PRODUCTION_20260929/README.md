# R28 正式程序更新与验收状态

2026-09-29 08:57:22（Asia/Shanghai），https://timeline.all-too-well.com 已切换运行 `e917da56b9fca54a40635364e168fdb26a080fb1`。这是服务器实际运行核验，不等于所有产品页面验收完成。登录后的页面复查当前等待恢复已过期的管理员浏览器会话，产品状态仍为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## 本轮交付内容与验证

- 人员入口、七业务角色、团队共享队列/领取/转派、固定18节点、并行和返工、独立12个月份、工作单与材料版本、站内提醒等主实现先于29ed发布。本补丁修正正式浏览器发现的手机项目卡片超宽、详情内部网格裁切及主责角色沿用历史部门三处问题。
- 应用源码提交和source tree、API/Web标签/摘要/buildTime、私有远端引用、服务器HEAD、数据库和Nginx入口、发布时间见 [release-result.json](release-result.json)。程序/运维/本证据提交分别记录，不把文档提交冒充运行版本。
- 本地补丁Web343项、9项浏览器回归、lint/typecheck/Web构建通过；固定API/Web镜像原生登录、人员三宽度、提醒、退出及项目详情正常关闭点击通过。API业务/schema/依赖未变，复用29ed对应API1422通过与相关真实PG结果；116跳过不计PASS。
- 发布控制器运维提交 `9eb94093df6c15df3600f9ddeb22ea92c7db67af`。组合40项测试及新增54表限定通过；四类真实PG14 SIGKILL覆盖保护后、许可后启动前、候选API新增审计后和OPEN_INTENT。新增事实保留，角色关闭且会话归零，没有迁移/数据库恢复。该Mac隔离测试不宣称systemd/公开入口演练。最终独立只读审查无确定阻断。
- 正式服务器依次执行固定checkout/pull/install/update/proof，全部通过。41→41更新新建备份 `20260929T005653Z-891b4bb4`，发布调用 `c9fcdf71513749a0803da0f2df52223b`；原OPEN_41锚点SHA保持 `3081ae83f6127e81e9acc4a7518122ff0749ac5b8f4a281e4c63f6aece1e8123`，新程序日志COMMITTED。未执行migration、seed、数据或对象恢复。
- 正常TLS公开元数据证明 `expectedCommit == API runtimeCommit == Web runtimeCommit == target checkout HEAD`。独立浏览器验证登录1440/1024/390、未登录受保护页转登录、旧OAuth410/mock403、foreign Origin403、已停用合成账号密码登录401。无页面错误和5xx，详见 [public-browser.json](public-browser.json)。未创建新的验收账号。
- 昨日真实注册/登录/退出/停用与撤销、权限负向的29ed证据保留。发布后只读数据库确认该合成账号仍INACTIVE、0角色、authVersion1，唯一人员审计和唯一命令都保留。没有更改原有用户角色、密码或业务项目。

## 当前准确状态（14项）

| 项目 | 结论 |
|---|---|
| 1. 代码 | CODE_IMPLEMENTED，应用e917；运维9eb |
| 2. 本地验证 | LOCAL_VERIFIED；分项与复用边界见上文，SKIPPED不计PASS |
| 3. staging URL | 未执行，无staging URL |
| 4. staging runtime | 未执行 |
| 5. staging路径 | 未执行 |
| 6. production改变 | 是，正式程序由29ed切换e917；没有恢复数据库 |
| 7. production runtime | e917da56b9fca54a40635364e168fdb26a080fb1 |
| 8. production路径 | 公开登录与鉴权边界PASS；新版本登录后页面待复查 |
| 9. main | 未改变，41b4b166c587692e6f0fb9536dca2e1aab646c70 |
| 10. tag | 未改变 |
| 11. 产品负责人 | 未取得本轮PRODUCT_OWNER_ACCEPTED |
| 12. 待验收路由 | /dashboard、/admin/people、/projects、/projects/new、项目详情及资料/记录、普通工作单、/notifications；不是声称这些源码未实现 |
| 13. Placeholder | 正式源码0；10项测试白名单（7个getByPlaceholder、3项禁止占位断言） |
| 14. 当前状态 | CODE_IMPLEMENTED / LOCAL_VERIFIED / PRODUCTION_RUNTIME_SWITCHED / EXACT_DOMAIN_PUBLIC_PATH_PASS / DEPLOYMENT_UNVERIFIED / AWAITING_PRODUCT_OWNER_CONFIRMATION |

## 证据与继续入口

原始日志与截图保留本机ignored目录，未提交凭据、会话、数据库备份或原始生产日志。摘要见 [evidence-manifest.json](evidence-manifest.json)，公开版本见 [public-metadata.json](public-metadata.json)，多路由见 [路由矩阵](../ROUTE_ACCEPTANCE_MATRIX.md)。登录页截图位于 `var/r28-patch-release/production-browser/login-{1440,1024,390}.png`。

Chrome正式域名原管理员会话在跨日后失效；真实刷新已到登录页。已请所有者直接在网站登录，不索取密码、不改凭据或扩大权限。登录后继续三档项目卡片/详情/关闭点击、人员、工作单、提醒等真实读取与交互，保存新构建资源/请求/console/截图；然后提交产品负责人实际确认。不能用本机截图或公开health替代这一步。
