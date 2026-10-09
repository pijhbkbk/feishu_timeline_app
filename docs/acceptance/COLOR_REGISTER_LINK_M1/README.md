# 颜色清单与项目关联：隔离交付回执

2026-10-09。本轮沿用现有系统、单部门准入和暖白·灰绿页面。代码、固定构建、本地 Chrome 五条操作路径、来源核对、备份恢复与重启验证通过；产品状态为 **AWAITING_PRODUCT_OWNER_CONFIRMATION**。没有发布正式站点。

## 实际入口

- [打开颜色清单](http://127.0.0.1:3360/admin/color-database)；[登录](http://127.0.0.1:3360/login)。仅本机，hostname 为 `127.0.0.1`。
- [隔离验收账号](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/preview-account.txt)：两个获准普通成员，无岗位角色；与真实业务账号分离，密码未提交。
- [已制板的合成项目](http://127.0.0.1:3360/projects/cmv0j2z7h00669k740g05m4nn/standard-boards)；[该颜色的 V1/V2](http://127.0.0.1:3360/admin/color-database?colorId=cmv0j2z7n00699k742pfwi3n6)。
- [核对后关联的既有合成项目](http://127.0.0.1:3360/projects/cmv0ietkv00019kbso8u82lyf/standard-boards)。原项目 ID、名称、创建时间和作者不变。
- 原 3350 预览保留。3360 的清单现有 94 条：89 条来源颜色，另 5 条明确标注“合成”的测试颜色；不是原表新增或重复导入。失败试验和审计保留。

## 数据核对结果

原文件 `制造中心商用车颜色清单明细.xlsx` 的 SHA256 为 `34ab4145cc004c7b712bf5431b9f169d2e6f0e3d8b8922a389e722d264c836e7`。原文件、解析清单、原始单元格核对和数据库备份只保存在本机私有目录，没有提交、推送或送入公开 CI。

| 核对项 | 结果 |
| --- | --- |
| 工作表与来源 | 11 表、1166 行（含593空行）、19297单元格、315公式及缓存完整保留；表名、行号、日期/数字格式、合并信息与原 OOXML 一致 |
| 颜色及基地 | 新港本部23、安徽阜阳14、山东青州16、四川遂宁21、同大涂装15，共89个独立颜色与基地身份 |
| 新汉玉白 | 保留原名；新港、青州、遂宁3条记录共用明确色相，各有独立资料和标准版本 |
| 尊贵蓝 | 山东尊贵蓝（SD）与新港尊贵蓝的颜色、基地和色相分别关联；其他同名记录不自动合并 |
| 标准 | 89个历史标准、155行测量；39个 Lab 缺值保留。制作单位、漆种、色板编号、原控制限、测量条件、日期及空值不改造 |
| 产量 | 122个明确来源行形成1464个月度事实；370缺值与236显式零分开。53个归属不明行保留待核对，未按角度或标准版本重复统计 |
| 历史保全 | 导入不建开发项目或节点，不补历史作者、正式编号或入清单月份。基线20个合成项目及14类原业务/身份表逐字段不变 |
| 重复导入 | 最终固定版本再次导入同一文件：同一批次、89颜色、1166来源行，`idempotentReplay=true`；来源文件真实扫描 CLEAN |

[42项来源核对明细](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/reconciliation-summary.txt)、[私有核对证据](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/reconciliation.json)。来源核对页保留所有行；“待核对”还包括空行/标题/公式口径等需说明的来源行，不能把其界面总数误写为53。53专指产量归属不明的来源候选。

备注供人阅读，程序只使用显式颜色、基地、统一色相关系；不解析备注决定归属。色板编号允许跨基地/颜色重复，不作为全局身份键。默认表格有独立生产基地、备注列，支持筛选、复制当前页、粘贴备注预览、明确保存及刷新读回。

## 业务路径与边界

新建项目登记已获批报告及实际批准日期，通过真实上传/扫描和 API 建立；可以新建候选颜色或选定准确既有颜色与基地。候选无正式编号、无入清单月份，创建日期不替代入清单日期，不能在清单更正接口绕过07晋升。

制板页面一次“保存并加入颜色清单”，在同一数据库事务保存节点记录、标准版本、标准板和清单状态，并读回项目与清单两端。失败回滚，重复/并发提交不重复颜色。入清单与量产批准分开，发放与完成节点仍由原状态机办理。

标准更正追加版本，旧版不覆盖；标准板发放与评审绑定具体标准版本。真实 PG 证明已发放 V1 的评审在更正 V2 后仍引用 V1，作者/审计不变；串色及未下发版本被拒绝。系统完成的批量生产按颜色、基地、生产日期月份和口径聚合，与原表口径分开、不直接相加。

既有项目只有在精确核对身份后一次显式关联；存在身份不清的板、评审、生产或已编号/已版本化颜色时保守拒绝，不重建项目、不推测归属、不改作者。基线20个项目没有自动批量关联。历史数据没有伪造完整流程。颜色关闭规则与完整周评/统计重做不在本轮，不启用未经确认的自动关闭。

单部门获准成员拥有相同应用业务管理资格；准入、账号停用、原生会话、CSRF/Origin、审批/已签作者保护、附件配额/隔离/真实扫描、审计和备份继续保留。系统管理员权限独立，没有恢复多角色审批或自动授予管理员。

## 精确运行身份

| 项目 | 实际值 |
| --- | --- |
| 工作树 / 分支 | `/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree` / `codex/color-register-integration` |
| 起点 | `c4077e74b81be3be5294b0ff827532d42ce7b4b9` |
| runtime code commit | `3ace9626dbf88ccca68c16d11faa55ab9f1765dc` |
| source tree | `7fe312487498d3ff67cdfb6a4837e07348e1324f` |
| evidence commit | 本回执与最终浏览器测试小修正保存于后续独立提交；该提交不是运行版本 |
| environment / URL | 隔离本机 / `http://127.0.0.1:3360`，不是远端 staging |
| 数据库 | 本机 PostgreSQL 55438，`color_register_v2`；集成库 `color_register_test`；恢复库 `color_register_restore` |
| migrations | 42→43；新增 `20261009020000_color_register_identity`，schema 与 migration 对应 |
| Web | 127.0.0.1:3362，Next 生产构建；BUILD_ID `CcuGMQQH7gSjRoOIvMRD4` |
| API | 127.0.0.1:3361，编译制品与显式 local profile |
| release / build time | `color-register-3ace9626dbf8` / `2026-10-09T05:28:39Z` |
| Web / API 摘要 | `d228d067533cb4dddb71adc43c38fe58bd93537d5be3c06b1923cb15fc52b05f` / `c9337670c55ba50817c2ef7ea3ace9a14ecbe93c00f33e91e76c79b1faf14aed` |
| Web/API image tag/digest | 不适用，文件制品；详情见 artifact-manifest.json |
| 代理 / Nginx | 3360 `/api`→3361，其余→3362；专属 Node 代理，Nginx未改变 |
| 最近启动时间 | `2026-10-09T05:33:40.781870+00:00` |
| Redis / 扫描 / 对象 | 既有专属本机 Redis56398的DB3、真实ClamAV53318、私有LOCAL持久对象目录 |
| target source / remote | 从上述40位commit的git archive构建，无dirty文件；远端不适用、未访问/推送 |

实际浏览器每项均核对 `expectedCommit == API /api/health runtimeCommit == Web /build-info runtimeCommit`；启动目录同一制品，重启后相等。最终制品摘要复核 PASS。构建 manifest 的 `runtimeServiceStarted=false` 表示“构建时尚未启动”，后续运行事实见 verification-summary.json 和私有 browser/restart 回执。

没有新增产品切换开关。构建值：NEXT_PUBLIC_API_BASE_URL=/api、UI_VERSION=v2、UI_DATA_MODE=real、ENABLE_MOCK_LOGIN=false、V1_FALLBACK_ENABLED=false；沿用M1默认及读取时机，第三方/Mock登录在实际session为false。远端值本轮未读/未改；NEXT_PUBLIC项修改需要重建。回退仅停止3360专属进程并保留数据库/对象，选兼容不可变制品，不回滚迁移或删除审计。loopback代理沿用M1限制，只在本机Web响应移除HTTP不适用的CSP upgrade-insecure-requests，不改变API及正式HTTPS策略。

## 验证与证据

| 检查 | 实际结果 |
| --- | --- |
| install / lint / typecheck | 冻结锁文件安装、lint、typecheck PASS，无依赖变更；Node24.14.0/pnpm9.15.4 |
| 常规回归 | Web422 PASS；API1496 PASS、148 SKIPPED，跳过不计PASS；shared无测试 |
| 真实 PostgreSQL | 清单/导入/备注/版本/产量/旧项目关联15 PASS；07事务/回滚/并发/绕过防护9 PASS；评审固定版本3 PASS，共27 |
| 原表解析 | 19个合成输入测试 PASS，真实原表42项只读核对 PASS |
| 构建 / Prisma | shared、API、Web固定提交构建和不可变身份校验 PASS；Prisma validate PASS、43迁移up to date |
| Chrome真实浏览器 | 最终5 PASS，18.1s，绑定完整runtime；登录原生普通账号，无正向业务API mock。1440/1024/390及真实保存、刷新、复制粘贴、幂等、版本历史、旧项目关联通过 |
| 错误/空/权限 | 真实空查询；未准入read/write403且数据不变；503明确为错误态界面注入，不冒称实际后端宕机；pageerror0，正常路径console0 |
| 备份恢复 | 源库只读一致性快照，恢复至全新库，59表全部行指纹一致；45个对象二进制恢复逐文件SHA一致；源库/对象不覆盖 |
| 重启 | 原生重登、真实清单/版本/关联/标准板读回及刷新 PASS |
| 独立审查 | G4_DIFF REVIEWED，绑定runtime与累积diff；手机/桌面关键截图复核无新增明确阻断。不代替人类产品确认 |
| Placeholder | 正式运行源码0；10处均为测试 API/负向断言白名单，见 placeholder-whitelist.txt |

完整日志、浏览器静态资源/Network/console、原失败与截图保存在 [私有证据目录](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime)；源表真实数据不复制到本提交。主要文件为 `browser-3ace962-final.log`、5份 `register-*-browser.json`、`browser-results/**/sanitized-browser-events.json`、`postgres-register-finalcandidate.log`、`postgres-07.log`、`postgres-review-version.log`、`reimport-final-cli.log`、`backup-restore.log`、`object-backup-restore.json`、`restart-evidence.json`、`g4-review.md` 与 `acceptance-check.md`。

- [山东专用蓝与独立列](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-2cd1e-licit-notes-and-source-rows/source-shandong-blue-1440.png)
- [手机制板保存](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-83998-n-history-and-existing-link/board-standard-mobile-save-390.png)
- [手机历史标准](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/browser-results/color-register-local-Color-83998-n-history-and-existing-link/register-mobile-history-390.png)
- [新建项目手机页](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/final-route-captures/new-project-390.png)、[实际确认手机页](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/final-route-captures/confirmation-fact-390.png)；三路由补充9图均无整页溢出或console/pageerror。
- [重启后持久记录](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-runtime/restart-persisted.png)

验证复用：最终应用相较d4561仅布局class/CSS，后端域逻辑、schema、依赖未变，复用全量1496和PG15+9，新增PG3实跑；最终Web422、lint/typecheck和固定双构建重跑。常规API148个跳过来自其他条件集成套件，27个本轮PG另行显式执行，不把其他跳过算通过。浏览器文件最后仅等待URL/可访问定位/补截图调整，未修改应用制品。

已修失败保留：导入契约v1/v2错配的首次隔离库保留，新库重新从一致基线迁移；DTO未声明颜色字段→真实ValidationPipe红绿回归；隐藏标签和旧制板网格造成390溢出→实测修正；编辑中历史分页保护→红绿验证；测试异步URL/getByLabel定位问题→用实际URL/文本框可访问名称，断言未删除；备份脚本旧库名预检在写入前停止→改正后新库恢复PASS。来源核对器openpyxl内部styleId差异已回到原OOXML验证，未更改原文件或业务值。临时浏览器注入style被CSP拒绝，未放宽CSP；修复通过正常源码构建验收。补图脚本起初误预计3个任务上下文，因两种建项实际产生4个而在浏览器启动前停止；核对记录后更正，最终3路由/9图PASS。

没有验证Safari/移动设备触摸/完整无障碍，也没有声称全站18节点全链或生产路径通过。历史项目存在不确定身份时待人工核对。53条产量归属等待业务依据，不填造数值，不阻塞已明确记录使用。

## 强制14项结论

| 项 | 结果 |
| --- | --- |
| 1 代码是否实现 | CODE_IMPLEMENTED，固定runtime见上 |
| 2 本地测试是否通过 | 上述工程/Chrome/27项PG/来源核对/恢复/重启PASS；148跳过不计PASS |
| 3 staging精确URL | 远端staging未执行；本机验收URL为http://127.0.0.1:3360 |
| 4 staging runtime commit | 未部署/不适用；本机runtime为 `3ace9626dbf88ccca68c16d11faa55ab9f1765dc` |
| 5 staging用户路径 | 远端未执行；本机Chrome五条通过 |
| 6 production是否改变 | 未改变 https://timeline.all-too-well.com |
| 7 production runtime commit | 本轮未读取/未核验 |
| 8 production用户路径 | 未执行 |
| 9 main是否改变 | 未改变，41b4b166c587692e6f0fb9536dca2e1aab646c70 |
| 10 tag是否改变 | 未改变 |
| 11 产品负责人是否确认 | 未确认，AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 12 未完成路由 | 本轮本机主路径通过；评审全链等受影响页面未逐页浏览器复测，见矩阵；远端/Safari未验证；完整周评/统计/关闭规则不在本轮 |
| 13 Placeholder数量 | 运行源码0，测试白名单10 |
| 14 当前准确状态 | CODE_IMPLEMENTED / BUILD_COMPLETE / LOCAL_VERIFIED / NOT_DEPLOYED_TO_PRODUCTION / AWAITING_PRODUCT_OWNER_CONFIRMATION |
