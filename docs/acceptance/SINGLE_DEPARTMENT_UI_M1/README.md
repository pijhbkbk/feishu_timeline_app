# SINGLE_DEPARTMENT_UI_M1 本地预览回执

更新：2026-10-09（Asia/Shanghai）。本轮在现有工程落实暖白·灰绿视觉与第一条真实业务路径，仅交付隔离本机预览。**Chrome 主链及本地工程验证通过；Safari 为部分原生验证，产品仍待负责人确认。** 正式网站、main、tag 未改变。

## 打开与操作

- 预览：[http://127.0.0.1:3350/login](http://127.0.0.1:3350/login)。仅本机可访问，hostname 必须是 `127.0.0.1`。
- 本地合成账号：[preview-account.txt](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-runtime/preview-account.txt)。该私密文件没有提交；不是用户真实账号。
- 最近完整验证的[确认记录](http://127.0.0.1:3350/projects/cmv087gvv00549kzwcqfkqsdn/tasks/cmv087jgd007u9kzwb1xn8haf?from=dashboard&tab=flow)；可从返回按钮回到同一颜色和节点。
- 从“新建”上传合成已批报告，填写实际批准日期及依据；录入涂料开发样板事实后，由工作台进入样板颜色确认，上传确认材料并等待扫描，填写实际日期、确认方、结论和意见后保存。所有步骤走真实 API，未直接改业务库制造前序通过。
- [参考页／实际页面对照](VISUAL_COMPARISON.md)；[完整路由矩阵](../ROUTE_ACCEPTANCE_MATRIX.md)。截图包含真实合成数据，不使用设计稿示例姓名或生产数据。

## 版本与环境身份

| 项目 | 实际值 |
| --- | --- |
| 工作树 / 分支 | `/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree` / `codex/single-department-ui-m1` |
| 起点 | `79a6b0f87d892f064505df4e6719896994e3f698` |
| runtime code commit | `a0769e7808ace84a05a36bed6c0edc2e81d097c6` |
| source tree | `5ac61815e1f9f7430ccd903da0f21b669f0fb184` |
| evidence commit | 本目录及台账在独立的后续证据提交中保存；不是运行代码版本。最终回执另列其 hash。 |
| environment / URL | 隔离本机合成数据 / `http://127.0.0.1:3350`；不是远端 staging 或 production |
| Web | 不可变 Next 生产构建，`next start`，127.0.0.1:3352；BUILD_ID `ofjD9sSSPc8TW2P9nHACi` |
| API | 编译后的 `dist/main.js`，127.0.0.1:3351；显式 local profile，`NODE_ENV=development`、`DEPLOYMENT_ENV=local` |
| release / buildTime | `m1-a0769e7808ac` / `2026-10-08T09:13:39Z` |
| Web 制品 SHA256 | `9115183b59c6477e380078d21db54d811c3f135a4b110c0a9106c3f0deee84ed` |
| API 制品 SHA256 | `aebcb5b158d221d81825cb9f76ca418b34eb85c75c794cd219b6d31f6207a1b0` |
| Web/API image tag、digest | 不适用：本轮以文件制品运行，不是应用容器。摘要算法与文件清单见 [artifact-manifest.json](artifact-manifest.json)。 |
| 同源代理 / Nginx | 3350 的 `/api` →3351，其余→3352；专属 Node 代理，无 Nginx 变更 |
| 最近预览启动时间 | `2026-10-08T09:36:31.548765Z`；10月9日确认仍在运行 |
| PostgreSQL | 专属 `timeline-m1-20261008-postgres`；127.0.0.1:55438；业务 `m1_http`、集成 `m1_backend`、恢复 `m1_restore`；独立命名卷 |
| Redis | 专属 `timeline-m1-20261008-redis`；127.0.0.1:56398；独立持久卷和 AOF |
| 对象存储 | 既有 LOCAL 适配器，专属持久 `var/m1-runtime/objects`；数据库只存元数据 |
| 扫描器 | 专属真实 ClamAV 1.4.6；127.0.0.1:53318；签名28147、2026-10-08T06:24:12Z；10月9日08:25北京时间年龄18.02h，低于48h限值 |
| 基础服务镜像 | 实际 tag/image ID 与端口见 [container-identities.json](container-identities.json)；没有拉取或改动其他应用容器 |
| target HEAD / remote | 本地构建源为上述40位提交，运行目录为该提交的 `git archive`；本轮未访问远端，无远端 target branch/commit；开发树后续证据提交不冒充运行 commit |

Web 使用生产模式以验证正式构建，其 `DEPLOYMENT_ENV=production` 是构建身份校验所需进程配置，不代表部署到正式网站。API 使用显式本机 HTTP 模式，不扩大 Cookie 例外或放开 Origin。mock、飞书入口均关闭，实际 session 回读确认。10月9日再验制品摘要一致，最终 Chrome 同时断言 API `/api/health` 与 Web `/build-info` 等于精确运行提交。

为适配本机 HTTP，专属代理仅在精确 Host、loopback、非 API 响应上移除 CSP `upgrade-insecure-requests`；保留 nonce/strict-dynamic、其他 CSP 和全部其余安全头。正式 Web 构建自身的 HTTPS 策略不变。源码边界7项和随机 nonce 正规化后的实际HTTP响应比较7项，共14项通过，见 [proxy-http-security.json](proxy-http-security.json)。实际配置、摘要和可复核副本见 [local-runtime-final.json](local-runtime-final.json)、[local-proxy.mjs](local-proxy.mjs)。

## 实现与最小业务适配

语义色固定为 `#F6F5F1 / #FFFFFF / #25332F / #596760 / #3F6B58 / #E8F0E9 / #F6EEE2 / #FAEEEB`，复用现有组件与图标包装，不新增通用组件库、字体CDN或外部图标服务。真实 Chrome 检测到本机 PingFang SC；未打包系统字体。

六导航保持工作台、颜色项目、颜色清单、周评、产量统计、人员库。工作台以真实状态的18节点地图为主体，保留并行与返工，支持画布滚动和缩放；390宽主线可见，未通过缩小字号塞入整图。报告、03制样和04确认写入实际日期与真实作者，确认方是业务事实；历史按任务/祖先约束读取，不取其他轮次最新记录充数。文件走应用上传、真实扫描、绑定、版本更正、预览/下载和审计。

`teamAccessApproved` 默认 false。注册及历史岗位不会自动授予准入或管理员权限。两个获准普通账号无角色也能接续同团队业务，未获准账号业务403、停用账号登录401。系统管理权限仍独立。资格与版本在后端事务中再次核验；状态机、幂等、审计、配额、附件隔离和扫描边界保留。

旧“岗位申请／领取／逐项目配置阻挡日常录入”要求被本轮明确替代；旧“报告必须新增领导线上审批”不适用于已获批报告登记。历史记录不改写。周评仍进入既有月度评审进度总览，产量统计仍进入既有数据中心；入口可达不等于本轮已实现完整周评或产量统计。人员库普通账号为真实只读目录，完整人员生命周期留后续。

主要变更位于 `apps/web/src/features/m1`、公共外壳/路由/样式、项目列表/新建，以及 API auth/users/projects/workflows/samples/attachments 等受影响业务边界；新增迁移 `20261008090000_single_department_m1`。本轮134个提交文件的精确清单以 `git show --stat a0769e7808ace84a05a36bed6c0edc2e81d097c6` 为准，不包含私密运行目录、数据库备份或用户附件。

## 验证结果和证据边界

| 验证 | 结果 / 证据 |
| --- | --- |
| 安装 | `pnpm install --frozen-lockfile` PASS；首次离线尝试缺少缓存包而失败，目录与日志保留；授权网络后冻结锁安装通过，锁文件未改 |
| lint / typecheck | PASS；`var/m1-lint-release.log`、`var/m1-typecheck-release.log` |
| Web 全量 | 380 PASS / 72文件；`var/m1-web-test-release-final.log` |
| API 全量 | 1450 PASS、124 SKIPPED / 13个跳过文件、0 FAIL；`var/m1-test-candidate-approved.log`；未配置的其他独立集成环境不计PASS |
| shared | 构建通过；没有测试用例，不虚列为一套测试PASS |
| Web/API build、Prisma validate | PASS；源码归档生产构建与编译身份检查见制品清单；`var/m1-immutable-build-network.log`及制品 `.m1-build/logs` |
| 真实 PostgreSQL | 8 PASS、0 FAIL、0 SKIP，覆盖准入、报告前置、版本、材料外键、并发、真实作者和撤权；见 [postgres-suite-receipt.json](postgres-suite-receipt.json)。原组合运行另有3个新单元夹具失败，后补齐并由API1450通过覆盖；原失败没有抹掉 |
| 迁移 | 合成旧库41→42，保留内部ID、密码hash、作者和外键；无批量准入、无虚构日期；[legacy-migration.json](legacy-migration.json)。最终42条迁移 up to date |
| Chrome 完整主链 | 10月8日2 PASS /46.4s；10月9日代理最终配置下2 PASS /1.7m、runner exit0。真实创建两个项目、实际前置事实、双人材料V1/V2、409保留草稿、保存返回、幂等重放无重复、刷新重登一致；[原回执](browser-receipt.json)、[最终回执](browser-receipt-resumed.json) |
| 负向 | 错误密码、停用、未准入403；文件类型拒绝；真实ClamAV EICAR文档上传422与拒绝审计；会话失效、取消/脏态/前进后退/直接链接。503仅为明确前端故障注入，不冒称真实服务器故障 |
| 浏览器错误与资源 | 主链pageerror为0；补充11路由/兼容入口 console error和pageerror为0，实际静态资源与字体记录见回执；不能据此声称旧全站已全面验收 |
| 视觉 | 1440×900、1280×800、1024×800、390×844；长文件名、扫描拒绝、多行错误、冲突保留输入。独立19张主链截图复核无明确P1/P2；原生Chrome登录页150%放大无横向溢出，已复原100%。工作台另有CSS150%检查，不冒称原生浏览器缩放 |
| 重启 | 独立三进程重启后原生登录和已保存事实/作者/日期/材料/状态一致；[restart-receipt.json](restart-receipt.json) |
| 数据库备份恢复 | 独立新恢复库，54表内容比对PASS；源库只读一致性快照，不改源库；[restore-evidence.json](restore-evidence.json)。不声称对象二进制另行复制恢复已验收 |
| 独立审查 | 后端准入/日期/跨轮RETURN与附件范围，前端历史事实/脏态/返回及StrictMode，视觉、代理边界均已只读复核；审查不替代执行测试或产品确认 |
| Placeholder | 运行源码0；原始扫描10处全部测试白名单，见 [placeholder-whitelist.txt](placeholder-whitelist.txt) |
| Safari | 原生登录、18节点、已保存事实和真实材料内容读取、关闭预览及返回URL通过。全链上传保存及会话过期后的最终重登刷新未完成；两次屏幕捕获错误后停止重试。WebDriver因未开启远程自动化UNAVAILABLE；未改系统设置、未用WebKit替代。详见 [原生回执](safari-native-receipt.json)、[安全脱敏网络](safari-native-network.json)、[原失败与追加结果](SAFARI_LOCAL_PREVIEW_BLOCKER.md) |

补充截图助手取得登录/新建/原03四档与未准入两档，共14张通过单图溢出检查；随后原04的脚本状态预期错误，整次FAIL，两个连续失败后停止。原失败及单项证据见 [补充助手报告](SUPPLEMENTAL_FINAL_CAPTURE_BLOCKER.md)，不算整套PASS。

首次代理调整后 Chrome 两个用例断言通过，但 worker 退出超时导致整次 exit1；该运行保持 FAIL。10月9日未修改应用代码或测试断言，重新执行后正常 exit0。旧日志 `var/m1-browser-local-csp.log` 与新日志 `var/m1-browser-local-csp-resumed.log` 均保留。另有截图助手定位错误、EICAR构造错误、误期待400而实际合同为422等失败记录保留；未以删断言或静态假数据求绿。

## 修复的根因与残余项

- 首页请求 `pageSize=100` 超过后端上限50导致真实400，收敛到50并增加合同回归。
- 历史确认可能错误读取其他任务的最新样板、旧报告无事实显示默认当天，改为按当前任务/祖先及对应记录绑定，历史不补造事实。
- 旧岗位/领取门禁与单部门业务冲突，改为明确准入而非自动管理员；普通人员目录不暴露系统管理死入口。
- 409、扫描超时和确认提交结果未知时保留本地内容；更正文件产生真实版本。上传等待与代理150秒边界匹配。
- 未保存退出、浏览器前进后退、跨页面公共外壳及StrictMode历史包装处理不完整，补充可取消离开和回归；受控来源返回保持项目/节点/列表参数。
- 390流程初始滚动沿用桌面位置导致主线不在视野，改为按viewport宽度区分并初始定位主线。
- Safari本机HTTP资源升级不适配采用限定代理修正，正式HTTPS策略不变；两个旧刷新为何仍旧加载未证实，不能把缓存推断说成确定根因。

P3保留：归档审计摘要中的原文件名被既有安全规范化为下划线；当前材料、版本和原上传记录可读。普通人员目录表头/交替行仍有旧浅蓝风格，M1未扩展完整人员管理重做。原公网“按钮无响应／正常材料不能上传”未在原失败URL复现或复测；本轮发现的问题不能宣布为其唯一根因，正式站点也未获得本轮修复。

## 路由与构建开关

正式路由直接引用M1页面，不再按旧 UI_VERSION rewrite 到另一产品页。`/v2/*`、旧overview/flow-map、report/samples入口归到同一真实项目/任务。兼容入口、LEGACY_ONLY、STILL_ACTIVE和未重做页面在路由矩阵分列，无第二套导航。

| 开关 | 默认 / 本地最终构建 | staging / production | 读取与回滚 |
| --- | --- | --- | --- |
| NEXT_PUBLIC_UI_VERSION | 未设置时helper非v2；本地v2 | 本轮未读取、未改变 | Web构建时；旧helper保留，正式M1路由不按其切换；修改需重建 |
| NEXT_PUBLIC_R26_V2_PROTOTYPE | 未设回退UI_VERSION；本地未设，回退v2 | 未执行/未改变 | Web构建时历史helper；M1不新设产品切换 |
| NEXT_PUBLIC_UI_DATA_MODE / NEXT_PUBLIC_R26_V2_DATA_MODE | 未设非real；本地real / 未设回退real | 未执行/未改变 | Web构建时；M1主链直接真实API |
| NEXT_PUBLIC_ENABLE_MOCK_LOGIN | 本地false，未启用mock | 未执行/未改变 | Web构建时；回滚不能启用mock冒充验收 |
| V1_FALLBACK_ENABLED | 仅true开启legacy；本地false | 未执行/未改变 | 服务端legacy布局；本輪无旧正式入口复活 |
| AUTH_MOCK_ENABLED / FEISHU_ENABLED | 本地false / false | 未执行/未改变 | API启动配置；保留原生会话合同 |

本轮回退方式是停止专属预览，保留数据库/对象/日志，再选择已记录的不可变兼容制品；不回滚迁移或删除新数据，不改变正式站点。修改 `NEXT_PUBLIC_*` 不能仅重启Web代替重建。

## 实际启停与复核命令

以下均在本机真实文件路径下执行。预览当前已启动；重复start会拒绝覆盖已有进程。stop仅停止本轮三组有PID及创建时间证明的进程，不停止数据库、Redis、扫描器或其他应用。

```sh
cd /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree
python3 var/m1-runtime/preview.py status
python3 var/m1-runtime/preview.py stop
python3 var/m1-runtime/preview.py start /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-releases/a0769e7808ace84a05a36bed6c0edc2e81d097c6
python3 var/m1-runtime/build_artifact.py --verify-manifest var/m1-releases/a0769e7808ace84a05a36bed6c0edc2e81d097c6/m1-artifact-manifest.json
```

本轮实际完整浏览器命令（关闭默认开发mock服务、trace/video不保存秘密）：

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3350 PLAYWRIGHT_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_DISABLE_VIDEO=1 PLAYWRIGHT_RESULT_ROUND=m1-local-csp-resumed M1_RUNTIME_ROOT=/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/m1-runtime M1_EXPECTED_COMMIT=a0769e7808ace84a05a36bed6c0edc2e81d097c6 pnpm --filter @feishu-timeline/web exec playwright test e2e/single-department-m1.spec.ts
```

## 强制14项结论

| 项 | 结果 |
| --- | --- |
| 1 代码是否实现 | CODE_IMPLEMENTED；上述不可变代码提交 |
| 2 本地测试是否通过 | 工程门禁及最终Chrome主链PASS；API124跳过不计PASS；Safari部分验证、剩余浏览器证据受工具阻断 |
| 3 staging精确URL | 远端staging未执行；本机预览http://127.0.0.1:3350不得冒称远端staging |
| 4 staging runtime commit | 不适用/未部署；本机runtime a0769e7808ace84a05a36bed6c0edc2e81d097c6 |
| 5 staging用户路径 | 远端未执行；本机Chrome主链通过，Safari仅所列部分 |
| 6 production是否改变 | 未改变https://timeline.all-too-well.com |
| 7 production runtime commit | 本轮未现场读取/未核验，不复用旧记录冒充新证据 |
| 8 production用户路径 | 未执行 |
| 9 main是否改变 | 未改变；41b4b166c587692e6f0fb9536dca2e1aab646c70 |
| 10 tag是否改变 | 未改变 |
| 11 产品负责人是否确认 | AWAITING_PRODUCT_OWNER_CONFIRMATION；没有PRODUCT_OWNER_ACCEPTED |
| 12 未完成路由 | M1 Chrome路由见矩阵技术通过；Safari完整写路径及最终重登刷新未验。完整周评/产量统计/人员生命周期为下一轮范围 |
| 13 Placeholder数量 | 运行源码0，原始10处测试白名单 |
| 14 当前准确状态 | CODE_IMPLEMENTED / BUILD_COMPLETE / LOCAL_CHROME_VERIFIED / SAFARI_PARTIALLY_VERIFIED / NOT_DEPLOYED_TO_PRODUCTION / AWAITING_PRODUCT_OWNER_CONFIRMATION |
