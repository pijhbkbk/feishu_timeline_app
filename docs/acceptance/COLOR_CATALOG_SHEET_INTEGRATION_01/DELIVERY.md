# COLOR_CATALOG_SHEET_INTEGRATION_01 · 本地交付说明

> 本轮只实施并验证隔离本地应用；远端 staging、production、main 和 tag 均不改变。产品状态为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。浏览器结果与最终身份见下方证据章节。

## 项目、复用和数据来源

- 业务项目：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree`。正式页面仍为 `/admin/color-database`，由 `ColorRegisterWorkspace` 实现。
- 在线表格源项目：`/Users/lixiaochen/Documents/ChatGPT/在线表格`，Personal Sheets 1.1.0，源项目 HEAD `15ea9714645331a7a2229967a3ba5de4badf8004`。复用 `src/editor/runtime.ts` 中 Univer 创建/生命周期与命令事件接法、`display-fonts.ts` 的中文字体准备，以及 `src/formats/xlsx.ts`、`zip.ts` 的文件交换和归档预检思路。本轮锁定 Univer 1.0.4、ExcelJS 4.4.0、fflate 0.8.3；适配业务项目现有 Next/React，不复制源项目整套应用。
- 真实业务值来自现有 `GET /api/color-register`、`GET /api/color-register/:id`。工作簿只是这些记录的编辑视图，记录身份始终为 `Color.id`，行号、名称、基地名称和显示顺序均不参与身份匹配。同名不同基地记录保留各自 ID。
- 本轮未新增 Prisma schema 或 migration；复用已有 `Color.registerRevision`、颜色标准历史和命令幂等记录。没有新增独立颜色台账、SQLite 镜像、工作簿快照回写服务或通用区域写入接口。

## 首版字段维护清单

| 界面字段 | 实际归属/类型 | 首版维护方式 |
| --- | --- | --- |
| 颜色名称 | `Color.name`，文字 | 只读；不修改关联的共享 `HueStandard` |
| 生产基地 | `Color.productionBaseId → ProductionBase.name`，关联 | 只读；不以名称重建或改绑基地 |
| 备注 | `Color.registerNote`，可空文字 | 可编辑，经清单保存接口写入 |
| 色板编号 | 最新 `ColorVersion.boardCode`，可空文字 | 仅已入清单 `LISTED` 记录可维护；保留前导零，填写原因，追加标准版本 |
| 制作单位 | `Color.manufacturer`，可空文字/已有选项 | 仅 `LISTED`；使用现有制作单位选项，填写原因，追加标准版本；不自动创建主数据 |
| 漆种 | `Color.paintType`，可空文字/已有选项 | 仅 `LISTED`；使用现有漆种选项，填写原因，追加标准版本 |
| 正式编号 | `Color.code`，完整文字 | 只读；不重新编号 |
| 入清单月份 | `Color.registerMonth`，可空 `YYYY-MM` | 仅 `LISTED`；填写原因，经既有标准更正逻辑保存 |
| 清单状态/生产批准结果 | `Color.registerStatus` / 已通过颜色一致性评审等业务事实 | 只读；普通表格编辑不能推进流程 |
| 来源文件、工作表、行 | `ColorVersion.sourceReference`、原导入批次及 `ColorImportRow` | 只读；右侧详情保留追溯信息，标准更正沿用来源 |
| 关联项目 | 既有颜色与项目关系 `linkedProjects` | 只读查看合法关联项目；不按名称猜测或批量新建项目 |
| 记录 ID/版本 | `Color.id` / `Color.registerRevision` | 隐藏技术身份与冲突标记，不是可编辑业务列 |

统一新增保存入口为 `PATCH /api/color-register/sheet`：`{ operationId, reason?, items: [{ id, expectedRevision, changes }] }`，仅接收 `note`、`boardCode`、`manufacturer`、`paintType`、`registerMonth` 五个字段。后端检查团队批准状态、既有写权限、记录存在性、字段白名单、状态和版本。标准更正调用现有 `appendColorStandard`，保留技术数据及历史，不直接修改流程节点。颜色独立建档未新增，页面“新建颜色项目”进入原 `/projects/new` 流程；创建能力标注 `EXISTING_FLOW_ONLY`。

## 保存、撤销和批量策略

单元格和粘贴结果先进入明确的待保存内容，由“保存修改”提交。一次请求最多 50 条、256 KiB；多批串行，每一批在数据库事务中整体成功或回滚。已成功批次回填服务端值及新版本，失败批次和后续批次保留；提示成功条数和未确认条数，不将部分成功称为整批完成。

同一保存使用操作标识及请求摘要做幂等，网络结果不确定时保留原请求并提供“核实上次保存结果”。版本过期返回 409，展示本次输入与当前值，处理后重新提交。服务端确认不会覆盖请求期间新增的待保存输入。撤销未保存编辑只改变草稿；撤销已保存修改形成带当前版本的反向字段变化，仍须再次保存。外部更新后不复用此前的整表撤销历史。

行 ID 保存在画布外部模型中，筛选、排序按整条记录变化。原始表格结构删除、插行、局部排序、改名、公式、嵌入对象和快照覆盖均不构成合法业务写入。没有合法历史记录删除入口；创建和流程动作走既有业务页面。

## Excel 路径及边界

系统模板导出当前筛选范围内已读取、服务端确认的记录；不包含尚未保存的输入。中文业务列、隐藏 ID 和版本随文件导出，编号写为文字。文件保护仅辅助操作，不能代替后端权限及版本校验。

模板导回检查合法 ID、当前可读取记录、重复 ID、版本、只读字段和可编辑字段；缺列不修改，空白默认忽略，仅显式勾选字段的空白表示清空。无实质变化为 no-op。未知/非法/未授权 ID 不回退创建。应用导入先加入待保存内容，之后使用同一保存接口；标准字段仍须在界面填写原因。

普通 `.xlsx` 支持选择工作表、指定表头行、字段映射及预览，本轮没有任意 Excel 写入开关。无 ID 行留作待处理，不能独立创建颜色，也不会触发项目、节点或通知。公式单元格拒绝处理，不使用其缓存结果。

文件最多 5 MiB，解压总量最多 20 MiB、512 个 ZIP 条目、32 张工作表；每张最多 1000 行（含表头）、32 列。单个模板最多 999 条记录。检查异常路径、加密/压缩格式、归档边界与校验；不接收 `.xls`。预览界面仅展示前 200 行，但解析器校验所有读入行。

## 复用位置和已知限制

- 可复用组件：`apps/web/src/features/business-sheet/runtime.ts`、`runtime-model.ts`；后续人员表、评审表提供自己的字段定义、稳定 ID、编辑权限、读取和保存命令即可使用。不能直接复用颜色的字段白名单或流程规则。
- 颜色适配：`features/color-register/sheet-client.ts`、`sheet-model.ts`、`sheet-exchange.ts`、`sheet-import.tsx`、`workspace.tsx`；后端在 `apps/api/src/modules/color-register/`。
- 首版最多读取 500 条业务记录；筛选、搜索、排序和导出针对这些已加载记录。超过上限显示提示，未提供服务端翻页筛选后的完整表格加载。已有选项接口最多返回各 200 个制作单位/漆种。
- 草稿在本页内存中保留并有离开提醒，不提供刷新后的草稿恢复。样式、列宽和冻结可在当前工作簿调整，筛选/排序重建或重新打开时恢复默认设置；未持久化个人视图。
- 没有同步 Personal Sheets 整本保存、SQLite 持久层、快照恢复、通用写区域 API 或图片粘贴。Univer 核心预设保留正常文本编辑所必需的组件；公式输入、插入和派生结果不被接受为业务编辑。
- 原生 Excel/WPS 客户端的往返操作、Safari、真实移动设备触摸、完整无障碍和生产站点本轮未验证，不能由本轮 Playwright 或旧项目交付记录替代。移动宽度下保留两列冻结，其他字段需横向滚动或使用上方单元格输入栏，主要编辑场景仍是桌面。

## 运行与复现

- 本轮工作树：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree`，分支 `codex/color-catalog-sheet-integration`。原目录的用户修改保持不变。
- 用户入口：[颜色清单](http://127.0.0.1:3370/admin/color-database)。本机 `127.0.0.1` 是唯一监听地址，不供局域网访问。
- 数据库：`color_catalog_sheet_20261012`，从此前本地验收数据库隔离复制；Redis DB 4、独立对象目录。89 条来源记录只读核对，写入仅限本轮专用合成记录。
- 账户沿用本地隔离原生账号；测试账户文件为 `var/color-sheet-runtime/accounts.json`（私有，不提交），无 mock 或第三方登录。不要将该文件复制到交付文档、日志或仓库。
- 无 schema/migration 变更；现有迁移状态仍须在隔离数据库确认。
- 构建使用 Git archive 固定提交，工作树未提交内容不会进入制品。构建身份脚本仅写两处既有 generated identity 文件。没有构建容器镜像。
- 以下运行工具和私有配置已保留在本地忽略目录，命令在上述工作树执行：

```sh
python3 var/color-sheet-runtime/preview.py status
# 停止/重启只管理该工具记录且核对身份的三个本轮进程
python3 var/color-sheet-runtime/preview.py stop
python3 var/color-sheet-runtime/preview.py start /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-releases/5bc1d10e5aea498612d63fd7637107282af7b040
```

固定版本重建入口：

```sh
python3 var/color-register-runtime/build_artifact.py --worktree /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree --commit 5bc1d10e5aea498612d63fd7637107282af7b040 --execute
```

构建工具拒绝覆盖已有制品目录。数据库密码、会话密钥、账户和原始测试日志全部留在私有忽略目录；不要求访问远端。

## 审查与修复记录

- 独立后端审查：事务内权限复核、行锁/CAS、批次回滚、幂等、追加版本与审计未发现未关闭的确定 P1/P2。
- 表格命令审查：放行真实粘贴快捷键与受控填充/边框命令；`BeforeUndo/BeforeRedo` 明确转换为业务历史，避免原生快照撤销绕过冲突保护。
- 首次浏览器检查：`1cda5f3e8311559ba3623429f639343b154a0e2b` 出现缺失 `IRPCChannelService` 和动态 style 的 CSP 拒绝。后续实际双击又确认普通编辑器由公式 UI 动态注册；最终恢复完整核心预设，移除禁止输入焦点的配置，以单元格、命令和派生结果边界阻止公式成为业务变更。三份固定依赖补丁在样式插入前继承当前 document nonce。middleware/CSP 未放宽。测试画布坐标观测也补齐离屏缓存的 drawImage 传播，不调用编辑器内部写 API。
- XLSX 审查发现伪造展开大小可骗过旧 `unzipSync` 固定缓冲区。现在使用有实际输出预算的流式解压，长度/CRC 再校验，仅把验证内容重新打包后交给 ExcelJS。1 MiB 伪造长度与前缀 CRC 回归已通过，独立复核确认该路径修复；Finding Ledger 导入建议见 INDEPENDENT_REVIEW.md。
- 导入预览显示普通文件映射内容，使用相同制作单位/漆种选项；编辑、模板和 API 文本上限已对齐。
- 选区事件桥缺失改用工作簿公开订阅；首次选择同步至表格、编辑栏与详情。未知保存重试的401/403/404保留原命令；不误判已提交操作为失败。四份依赖补丁均固定于锁文件，其中三份修正动态nonce，一份修正纯文本粘贴。
- 原静态检查两次失败及后续浏览器停止/修正依据保留在 [BLOCKER_REPORT.md](BLOCKER_REPORT.md)，未禁用检查。

## 验证、身份与最终状态

运行代码提交 `5bc1d10e5aea498612d63fd7637107282af7b040`，tree `e1c40c10a8f9a4be4d791a87962dbd1659ff1104`；证据文档另行提交，不将文档 HEAD 当作运行版本。此轮 runtime commits 从 8408f527 到本提交，改动文件以 `git diff 218dbc2b73b3f946fee239b340d3aba6e382029c 5bc1d10e5aea498612d63fd7637107282af7b040` 为准。没有治理规则改动、push、main merge 或 tag 操作。

| 检查 | 结果与证据 |
| --- | --- |
| 安装 | 本轮 pnpm install 完成；最终 Git archive 制品用 frozen lockfile 安装通过。固定 Univer/样式补丁未改变后端依赖解析。 |
| lint/typecheck | 全仓通过；后续仅前端增量再次通过，最新日志 lint-desktop-toolbar.log / typecheck-desktop-toolbar.log。浏览器脚本单独严格类型检查通过。 |
| 单元/回归 | Web 80 文件、461 PASS；API 1520 PASS / 157 SKIPPED，跳过不计 PASS；shared 无测试。API 边界未随最后菜单与选区显示修正变化，按相同源码、工具及依赖范围复用。 |
| 真实 PostgreSQL | 颜色清单 21 PASS，覆盖权限、LISTED 限制、CAS、并发、幂等、原子失败、标准版本和审计。日志 postgres-final.log。 |
| 构建/Prisma | 最终不可变提交的 shared/API/Web 构建通过，Prisma schema validate 通过；隔离库 43 条 migration up to date，无本轮 migration。最终制品摘要复核匹配。 |
| Chrome 用户路径 | 最终精确本地 URL 下 4 PASS（50.4秒）；不是通过内部 facade 写值。真实双击输入、多格粘贴、复制、清空、保存后的反向撤销、排序正确 ID、刷新与原详情读回、模板下载/导回/no-op/只读错误、普通表格映射预览。 |
| 权限与冲突 | 实际原生双账号产生可见409、保留他人值；受控字段400、非法批次400整体不写、未批准账号读写403；旧快照/通用区域接口404/405。 |
| 不确定结果 | 原请求实际200落库后丢弃响应，用户逆向输入仍保留；重放401/403是明确的负向响应注入，随后真实相同操作标识重放200，无重复版本，再合法逆向保存。 |
| 数据和重启 | 来源89条 ID/版本核对保持，浏览器对来源业务字段前后哈希一致；本轮只写专用合成记录。项目27、流程任务111不增；累计合成保存审计69条含前序验证。重启后三条合成记录、审计和来源哈希完全相同。隔离库总表格97条，包括既有及本轮合成数据，不宣称97条都是原Excel来源。 |
| 布局/状态 | 主表/详情1440×900、1280×800、1024×900、390×844无页面横向溢出；每档仅1个主导航。加载、筛选空态、导入错误、保存状态、并发冲突均有实现与证据。缩放瞬时残影与加载未完成截图不作为最终视觉证据。 |
| Console/Network | 正常完整编辑路径 pageerror=0、console error=0；负向测试预期的409/401/403/网络中断单独保留。原生认证无 mock/飞书，读取/保存均有实际API请求；未把负向错误隐藏。 |
| Placeholder | 正式运行源码0；扫描原始12处均为测试断言或 getByPlaceholder 方法名（原10处+本轮2处），逐条文件/行号白名单在 runtime-evidence.json；仅测试选择器或禁止占位的负向断言。 |
| 独立审查 | 见 [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md)。后端、保存未知结果、ZIP边界、真实引擎命令/事件桥及CSP补丁分别只读复核；不代替产品验收或全仓安全许可。 |

浏览器证据：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000`。启动工具、配置及原始日志均在 ignored `var/color-sheet-runtime`，私有账户/会话不入仓。最终运行身份、摘要和各日志哈希见 [runtime-evidence.json](runtime-evidence.json)。

### 最终环境身份

- environment：local_isolated；URL：`http://127.0.0.1:3370/admin/color-database`；hostname：`127.0.0.1`；database：`color_catalog_sheet_20261012`。
- expected / API / Web runtimeCommit：`5bc1d10e5aea498612d63fd7637107282af7b040`；Git archive 源提交一致。没有远端服务器 checkout，remote commit 不适用。
- buildTime：`2026-10-12T09:09:51Z`；release：`color-register-5bc1d10e5aea`；本轮进程最后启动：`2026-10-12T09:16:03.001460+00:00`。
- Web BUILD_ID：`L3BA4qCbCnXk6qnUrLD91`；Web SHA256：`2c2c323dcb594d12a48cc11e9a13a58757d50480a7018b0266e19b6478e3ecad`；API SHA256：`db451125de63128c817af371d34ed772376a4eee86674e070e182d8515be6aef`。
- Web/API image tag、digest：未使用镜像；使用上述文件制品摘要。Nginx：未使用、未修改；本机代理指向 Web127.0.0.1:3372 / API127.0.0.1:3371。

### 真实截图

- [主表与来源记录详情1440](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/visual-1791796581799/source-main-detail-1440.png)
- [1280桌面布局](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/visual-1791796581799/source-main-detail-1280.png) / [390手机布局](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/visual-1791796581799/source-main-detail-390.png)
- [系统模板导回预览](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000/results/color-sheet-local-Syntheti-33b80--XLSX-and-responsive-detail/template-import-preview-1440.png) / [只读字段错误](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000/results/color-sheet-local-Syntheti-33b80--XLSX-and-responsive-detail/template-readonly-error-1280.png)
- [普通Excel映射预览](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000/results/color-sheet-local-Syntheti-33b80--XLSX-and-responsive-detail/ordinary-mapping-preview-only-1440.png) / [双账号版本冲突](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-sheet-runtime/browser-evidence/1791796501856308000/results/color-sheet-local-Syntheti-4c2a0-count-and-snapshot-boundary/visible-version-conflict-1440.png)

### 复验命令

```sh
python3 var/color-sheet-runtime/browser.py 5bc1d10e5aea498612d63fd7637107282af7b040 --fixture var/color-sheet-runtime/fixture.json --accounts var/color-sheet-runtime/accounts.json --evidence-root var/color-sheet-runtime/browser-evidence
python3 var/color-register-runtime/prepare.py test-exec pnpm exec vitest run src/modules/color-register/color-register.postgres.integration.spec.ts
python3 var/color-register-runtime/build_artifact.py --verify-manifest var/color-register-releases/5bc1d10e5aea498612d63fd7637107282af7b040/color-register-artifact-manifest.json
```

### 强制状态回执

| 项 | 准确状态 |
| --- | --- |
| 1 代码 | CODE_IMPLEMENTED；上述固定runtime提交 |
| 2 本地测试 | LOCAL_VERIFIED（Chrome及适用工程检查）；跳过项不算通过 |
| 3 staging URL | 未执行，无本轮staging URL |
| 4 staging runtime commit | 未执行/未核验 |
| 5 staging 用户路径 | 未执行 |
| 6 production改变 | 未改变、未访问 |
| 7 production runtime commit | 本轮未核验，不用历史提交代替 |
| 8 production用户路径 | 未执行 |
| 9 main | 未改变：41b4b166c587692e6f0fb9536dca2e1aab646c70 |
| 10 tag | 未改变，原4个tag保留 |
| 11 产品负责人 | 未取得 PRODUCT_OWNER_ACCEPTED |
| 12 未完成路由 | 本轮正式颜色清单无技术未完成项；兼容/v2别名未另跑浏览器，人员/周评/统计不在本轮范围 |
| 13 Placeholder | 运行0；12处测试白名单命中 |
| 14 当前状态 | CODE_IMPLEMENTED / LOCAL_VERIFIED / NOT_DEPLOYED_TO_PRODUCTION / AWAITING_PRODUCT_OWNER_CONFIRMATION |

```text
TASK_ID=COLOR_CATALOG_SHEET_INTEGRATION_01
IMPLEMENTATION=COMPLETE
REAL_DATA_BINDING=PASS
BUSINESS_RECORD_ROUNDTRIP=PASS
CREATE_RECORD=EXISTING_FLOW_ONLY
CLIPBOARD_BATCH=PASS
XLSX_ROUNDTRIP=PASS
PERMISSION_ENFORCEMENT=PASS
CONCURRENCY_AND_UNDO=PASS
BUILD=PASS
UI_SCREENSHOTS=本章真实截图路径
KNOWN_LIMITATIONS=每次读取至多500条；普通Excel仅映射预览；草稿与个人视图不持久化；格式刷未开放；Safari/原生Excel/WPS未验证；隔离库保留合成验收记录；生产未改变；产品负责人未确认。
```
