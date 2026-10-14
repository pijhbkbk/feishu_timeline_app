# LIGHT_TRUCK_SHEETS_INTEGRATION_02_04 — DELIVERY

本轮已实现颜色、人员、检验和月度产量表格接入。最终源码及当前本机运行版本为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`，它仅恢复已应用migration003末尾LF并更新ledger，应用代码与68逐字节相同。不可变构建、68完整千行性能及已列分项技术验收通过；9ed源库与新隔离恢复库的全表、schema、迁移和对象只读比对通过。最终9ed新上下文只读重开先后两次FAIL：一次lazy图观察漏滚动，一次390阶段缩略图网络/并发错误；最终1791938988977234000新登录只读重开及四宽度核对已通过。SYSTEM_IME仍未验证，因此整轮ACCEPTANCE为NOT_FULLY_VERIFIED。生产未改变，产品状态为 `AWAITING_PRODUCT_OWNER_CONFIRMATION`。

## 最终任务判定

以下PASS只覆盖UI_ACCEPTANCE逐项声明的普通人员路径和I/S/R证据，系统IME明确排除，当前M1没有的旧领取/改派入口不冒称执行。历史失败、异常恢复未验证范围和Office边界保留在后文。机器可读结果见 [TASK_RESULT.json](./TASK_RESULT.json)。

- `TASK_ID=LIGHT_TRUCK_SHEETS_INTEGRATION_02_04`
- `IMPLEMENTATION=COMPLETE`
- `ACCEPTANCE=NOT_FULLY_VERIFIED`
- `SHEET_INTERACTION=PASS`
- `SHEET_PERFORMANCE=PASS`
- `IMAGE_FILE_UPLOAD=PASS`
- `IMAGE_CLIPBOARD_PASTE=PASS`
- `IMAGE_XLSX_IMPORT_EXPORT=PASS`
- `IMAGE_PERSISTENCE_AND_OWNERSHIP=PASS`
- `COLOR_CATALOG_REGRESSION=PASS`
- `PERSONNEL_BUSINESS_LINK=PASS`
- `REVIEW_FACTS_AND_STATISTICS=PASS`
- `MONTHLY_REVIEW_LINK=PASS`
- `PRODUCTION_AND_STATISTICS=PASS`
- `CROSS_MODULE_ROUNDTRIP=PASS`
- `PERMISSION_AND_CONCURRENCY=PASS`
- `SYSTEM_IME=NOT_VERIFIED`
- `OFFICE_APP_COMPATIBILITY=NOT_VERIFIED`
- `BUILD=PASS`
- `UI_EVIDENCE`：见 [UI_ACCEPTANCE.md](./UI_ACCEPTANCE.md)、[EVIDENCE_INDEX.md](./EVIDENCE_INDEX.md)，包含真实trace、截图、含图XLSX及各阶段结果。
- `KNOWN_LIMITATIONS`：系统输入法未测、Office部分通过、旧压力缩略图异常未实点重试、草稿仅当前页内存、高级Excel图形不保证原布局、恢复库未切应用登录；完整条目见TASK_RESULT.json和后文。

原始API/Web公开运行字段另存 [RUNTIME_IDENTITY.json](./RUNTIME_IDENTITY.json)，读取于2026-10-14T00:54:17Z，二者均为9ed，非仅从通过断言推导。人工查看实际截图的范围见 [ROOT_VISUAL_REVIEW.json](./ROOT_VISUAL_REVIEW.json)。runtime code commit固定为9ed；证据commit是本报告最终归档提交，交付回复与本机 `var/light-truck-sheets-02-04/final-handoff.json` 单独记录，不更改运行构建。

## 版本与环境身份

| 项目 | 实际记录 |
|---|---|
| environment / 精确URL / hostname | 本机隔离验证；`http://127.0.0.1:3380`；`127.0.0.1` |
| 最终源码 / 制品commit | `9ed0502b9e97e543dc5beea00998b5edc0bb0e67` |
| 当前启动runtime / 主要交互实测runtime | `9ed0502b9e97e543dc5beea00998b5edc0bb0e67` / `68acd102bc8f88fa7bf88aea099ccc7d74cbde28` |
| 最终source tree | `492c42d17720c1569b7d0373c68cb93ee327ae67` |
| 工作树 | `/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree` |
| 不可变制品 | 工作树下 `var/color-register-releases/9ed0502b9e97e543dc5beea00998b5edc0bb0e67`；manifest `BUILD_COMPLETE` |
| 数据库 / 对象 | `light_truck_sheets_20261013`；本轮隔离objects目录；不是生产数据 |
| release / buildTime | `color-register-9ed0502b9e97` / `2026-10-13T08:31:30Z` |
| Web / API upstream | `127.0.0.1:3382` / `127.0.0.1:3381`；同源Node代理3380；Nginx不适用 |
| Web BUILD_ID | `rFFp9MNTrCAFZTphUKHKo` |
| Web artifact SHA-256 | `37dc7bbf0ad746ea6dab6e57e5c32fcd8bcf6ea2b9cafd7f4fc08d9a926e2378`（不含.next/cache） |
| API artifact SHA-256 | `705923a607e7506e6a772ae2e1d4fff0137a7bbbd91a1cbf2de377a80011fa79` |
| shared artifact SHA-256 | `1907bc933f547407ae20051e9985a039bd273b7e0e37a706011db6a71913061a` |
| source archive SHA-256 | `855fd21e59ade6fe5efcfeba4f9de957fa15e5a8c2cc80b9ecc794579650a6fa` |
| lockfile SHA-256 | `276706a5970a0a201fe26f1fcee2af60163bb73e789336c55204b2bfff0cf279` |
| toolchain | Node24.14.0 / pnpm9.15.4；git archive，不含工作树脏文件 |
| 启动 / 实际身份 | preview记录9ed于 `2026-10-13T09:04:32.366624Z` 启动，3380代理指向3381/3382；新上下文9ed只读浏览器1791938988977234000为1 PASS/51.2s，API/Web身份核对及四路由读回通过。68历史身份保持在原证据 |
| 镜像 / remote | 本机编译制品，无镜像tag/digest；本轮本地交付remote commit不适用 |
| staging / production | 未执行远端staging或production发布；`https://timeline.all-too-well.com`未改变，本轮未核对其运行commit/用户路径 |
| main / tag / 产品确认 | main仍`41b4b166c587692e6f0fb9536dca2e1aab646c70`，本轮未改tag；未获PRODUCT_OWNER_ACCEPTED |

manifest位于制品根 `color-register-artifact-manifest.json`。其中运行启动/HTTP验证false是构建时记录，不被改写；实际运行由后续preview及浏览器请求独立证明。runtime code commit与最终证据归档commit分别记录，不能混为一项。

下文源码相对路径以业务工作树为根，证据相对路径以 `var/light-truck-sheets-02-04` 为根。89条来源颜色只读基线SHA为 `959bc8c8bbc53318f9ff743d9ed4938acb3b270230f25018b10377e0296d5961`；写入验收使用隔离合成记录，不能称新增真实生产业务。

## 项目与复用

- 业务项目：`/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree`。
- Personal Sheets 源项目：`/Users/lixiaochen/Documents/ChatGPT/在线表格`，本轮只读参考。图片 OOXML 解析注明参考版本 `15ea9714645331a7a2229967a3ba5de4badf8004`。没有将其 SQLite、IndexedDB 或整本工作簿持久化接入正式业务事实。
- 共用目录：`apps/web/src/features/business-sheet`。`canvas.tsx` / `runtime.ts` / `runtime-model.ts` 提供同一 Univer 引擎，排序筛选以稳定 ID 更换行投影，避免每次编辑和排序卸载重建；选择通过 ID/行列索引定位，不序列化整个工作簿。
- 人员、检验、产量使用同一 `record-sheet-model.ts`、`record-sheet-workspace.tsx` 与保存队列。颜色保留 `color-register/sheet-model.ts` 的标准更正规则，仅复用画布、图片和当前含图 Excel 入口，避免改写已验证的权限合同。
- `runtime-images.ts`、`drawing-preset.ts`、`use-images.ts`、`image-panel.tsx` 共用稳定记录归属、图片上传/布局队列、缩略图与原图。`record-exchange.ts`、`record-import.tsx`、`xlsx-raw-images.ts` 共用含图交换。
- Univer 固定 `1.0.4`；ExcelJS `4.4.0`、fflate `0.8.3`、fast-xml-parser `5.11.2`。安装 drawing 预设与资源适配，继续使用原生编辑、粘贴与绘图能力。pnpm 补丁涉及 Univer UI、engine-render、sheets-ui 和 sonner；样式插入沿用当前文档 nonce，没有放宽全局 CSP。最终依赖与补丁差异以 lockfile / patches 为准。跨检验层仍可能重建引擎；这里的单实例指当前模块/当前层，不承诺跨全部路由常驻。

## 业务入口与事实来源

以下 URL 均属于本机隔离环境 `http://127.0.0.1:3380`，不能代表公网站点已改变。

| 路由 | 页面入口 | 服务端事实及接口 | 业务贯通 |
|---|---|---|---|
| `/admin/color-database` | `AdminColorDatabaseR26` → `ColorRegisterWorkspace` | Color、ColorStandardVersion；`/api/color-register`、`/api/color-register/sheet` | 色板等标准更正保留历史版本与原因；新颜色仍走 `/projects/new`，不靠表格直接授予量产资格 |
| `/admin/people` | `PeopleEntry` → `PersonSheetWorkspace` | PersonProfile / Department 与明确关联的 User；`/api/persons`、`/api/persons/sheet`、`/api/persons/:id/account-link` | 独立档案不创建账号或资格；管理员在 `/admin/people/permissions` 管理原账号与业务资格，任务候选仍按有效账号资格产生 |
| `/inspections` | `InspectionsWorkspace` | InspectionActivity、Object、Occurrence、Measurement、Reading、Defect；`/api/inspections/activities`、`/:id/rows`、`/:id/batch` | 台次、测量组、角度、缺陷为真实主从记录。显式关联第 17 步某一月度目标后，提交仍经过原评审入口和原流程，不由单元格改流程状态 |
| `/production` | `ProductionSheetWorkspace` | ColorProductionFact；`/api/production-facts`、`/batch`、`/statistics`、`/sources` | 按颜色稳定 ID、基地、月份维护本系统月度总量。来源对账事实独立展示并排除在月度操作总量之外；旧项目批次数量保留 `/analytics` 入口，不混加 |

正式身份为本系统用户名/密码与 User。普通已准入成员可做其服务端允许的业务维护；账号状态、角色、团队准入、跨项目范围、已提交检验锁、审计和 CAS 均在后端判断。浏览器隐藏列、前端只读状态、模板标记均不是授权凭证。

## 字段、记录身份与更新边界

| 区域 | 稳定身份 / 版本 | 允许的直接录入 | 只读或需专门动作 |
|---|---|---|---|
| 颜色 | `Color.id` / `registerRevision`（API `revision`） | `note`；LISTED 标准字段 `boardCode`、`manufacturer`、`paintType`、`registerMonth`，需更正原因 | 名称、基地、正式编号、登记状态、来源信息只读；新颜色必须立项 |
| 人员 | `PersonProfile.id` / `revision` | 以服务器 `editableFields` 为准：姓名、岗位说明、电话、邮箱、备注；未关联档案可按权限维护部门/启用状态 | 关联账号、业务资格、来源只读。部门文本仅在授权部门名称唯一时映射 ID，否则须明确选择。关联已有账号需管理员、账号 ID/版本及原因；关联账号的部门等由专门入口受控办理 |
| 检验台次 | `InspectionOccurrence.id` / `revision`，另有活动根版本 | 对象总体结论、目视结论、处理意见、备注 | 日期、基地、对象/VIN/车型、颜色、参与人员、统计数、来源等为关联读取；新增台次需明确对象和颜色 |
| 测量组 | `InspectionMeasurement.id` / `revision` + 活动版本 | 测点、组名、仪器、方法、原始判定依据、组结论 | 所属台次、标准版本等需专门表单选择；测量组结论不替代对象总体结论 |
| 复合角度读数 | `InspectionReading.id` / `revision` + 所属 measurement 依赖版本 + 活动版本 | 连续前 10 列：测点/组名/仪器/方法（整组 4 项）与角度/L*/a*/b*/来源 ΔE/读数说明（当前读数 6 项） | 前 4 项同步同组全部已载入兄弟行；同一次粘贴对同组给出不一致父字段时整次编辑拒绝。原始依据、颜色/对象等关联列只读。空数值保持未知，不转成 0；不自动计算“合格”或放行 |
| 缺陷 | `InspectionDefect.id` / `revision` + 活动版本 | 描述、严重程度、处理意见 | 所属台次与测量组通过稳定 ID 关联；照片仍绑定对应台次 |
| 产量 | `ColorProductionFact.id` / `revision`；业务粒度为颜色 ID + 基地 ID + YYYY-MM 的月度总量 | 已有记录仅改 `quantity`；0–10 亿整数台或 `null` 未知 | 颜色、基地、月份、单位、统计口径和来源不能随编辑改绑。10→8 更正原 fact，绝不是另加 8。新增需明确颜色/基地 ID，普通表不得按名称猜测归属 |
| 图片 | `SheetImage.id`（UUID）/ `revision`；`attachmentId` 指向原件，`targetType` + `recordId` + `fieldKey` 固定归属 | 上传新图、布局/尺寸修改、按权限移除或替换 | 排序、筛选、拖动不改变所属记录；布局 API 不接受改 recordId。检验照片绑定 occurrence，选择其读数/缺陷只展示同一台次照片 |

人员、检验、产量保存以 300 ms 防抖，颜色为 350 ms；各入口使用增量脏字段和最多 50 个显示记录分批发送。每次包含稳定 operationId、行 expectedRevision；检验 mixed batch 还核对活动与关联测量组版本，服务器单次最多 200 个实体操作。不同 50 行批次不构成整次粘贴的跨批事务，界面必须显示已确认与待处理部分。保存确认只确认发送时字段版本，飞行中继续输入/撤销保留为下一次修改；失败显式重试原请求，冲突读取最新数据核对，不能无条件覆盖。

## 实际列名与字段映射

照片列是受控附件入口，不接收任意 URL 或图片二进制文本。ID、版本及关联 ID 使用专门技术列或表单选择，不把业务身份当普通可编辑单元格。

| 模块 | 当前显示列（代码字段 → 中文名） |
|---|---|
| 颜色，11列 | `name`→颜色名称；`baseName`→生产基地；`note`→备注；`boardCode`→色板编号；`manufacturer`→制作单位；`paintType`→漆种；`formalCode`→正式编号；`registerMonth`→入清单月份；`registerStatus`→清单状态；`sourceSummary`→来源；`photos`→照片 |
| 人员，11列 | `name`→姓名；`departmentName`→部门（解析为 `departmentId`）；`position`→岗位说明；`mobile`→电话；`email`→邮箱；`availability`→启用状态（解析为 `isActive`）；`accountName`→关联账号；`roles`→业务资格；`note`→备注；`photos`→照片；`sourceSummary`→导入来源 |
| 产量，9列 | `month`→业务月份；`baseName`→生产基地；`colorName`→颜色名称；`colorCode`→颜色编号；`quantity`→实际总量；`unit`→单位；`scope`→统计口径；`photos`→照片；`sourceSummary`→导入来源 |

检验各层共享12项只读关联维度：`activityDate` 检验日期、`baseName` 生产基地、`batchLabel` 批次说明、`objectCode` 车辆/样件编号、`objectKind` 对象类型、`vin` VIN、`vehicleModel` 车型、`vehicleClass` 车辆分类、`colorName` 颜色名称、`formalCode` 正式颜色编号、`boardCodes` 参照色板、`people` 参与人员；共享3项来源为 `sourceFile` 来源文件、`sourceSheet` 来源工作表、`sourceRows` 来源行号。

| 检验层 | 除共享维度、来源外的真实字段 | 直接编辑范围 |
|---|---|---|
| 台次，23列 | `overallConclusion` 对象总体结论、`visualConclusion` 目视结论、`handlingOpinion` 处理意见、`note` 备注、`groups` 测量组数、`angles` 角度读数数、`defects` 缺陷条数、`photos` 对象照片 | 前述结论、意见、备注4项；统计数只读 |
| 测量组，23列 | `pointLabel` 测点、`groupLabel` 测量组、`instrumentLabel` 仪器、`methodLabel` 方法、`originalCriteria` 原始判定依据、`conclusion` 测量组结论、`overallConclusion` 对象总体结论、`angles` 角度读数数 | 前6项；对象总体结论在台次维护 |
| 复合角度，27列 | 前10列依次为 `pointLabel` 测点（整组）、`groupLabel` 测量组（整组）、`instrumentLabel` 仪器（整组）、`methodLabel` 方法（整组）、`angleLabel` 测量角度、`lValue` L*、`aValue` a*、`bValue` b*、`deltaE` 来源ΔE、`note` 读数说明；另有 `overallConclusion`、`originalCriteria` | 前10项均为既有真实业务字段，没有为性能测试添加泛用假列。父组4项与本行6项分别保留各自实体版本 |
| 缺陷，22列 | `description` 缺陷描述、`severityLabel` 严重程度、`handlingOpinion` 处理意见、`pointLabel` 所属测点、`groupLabel` 所属测量组、`overallConclusion` 对象总体结论、`photos` 对象照片 | 描述、严重程度、处理意见3项 |

检验 Excel 还附加5个明确关联列：`objectId` 对象ID、`colorId` 颜色记录ID、`occurrenceId` 检验台次ID、`measurementId` 测量组ID、`standardVersionId` 标准版本ID。台次导出实际为30列：A:B隐藏记录ID/版本，C:Y共23个显示业务列，Z:AD为5个关联列。台次级 `measurementId` / `standardVersionId` 可以为空，但仍是实际有表头的合同列，不能在排序或验收中删掉。产量导入另提供颜色记录ID、基地ID、行类型，人员部门不按模糊名称匹配。

## 三条图片入口与存储

1. 选择记录，在“记录照片 → 添加照片”选择 PNG/JPEG，可一次多张。
2. 选择记录或照片单元格，使用正常 Cmd+V / Ctrl+V 粘贴图片剪贴板；文本粘贴继续交给原生表格处理。
3. “导入 Excel”选择含常见嵌入 PNG/JPEG 的 XLSX，先预览真实图像和记录归属，再提交。跨行、绝对锚点、缺锚点、合并区域或不唯一归属保留原始字节，须明确指定归属，不能默认为最近记录。

原件使用现有 AttachmentsService 对象存储、配额、隔离扫描与完整图片解码链，CLEAN 最终事务同时创建附件业务绑定与 SheetImage。PostgreSQL 只存元数据和关联，不存图片二进制，不为全局颜色/人员伪造项目。缩略图经授权接口读，服务端最大 640×640 WebP、512 KiB，客户端最多两个并发、有限可见缓存；原图按需访问。只在视口交集及少量缓冲范围生成 drawing，不在普通文字保存中上传图片字节。未成功图片操作不会标为整体已保存，替换先确认新图再删旧图。

单元格模式按当前行高/列宽缩放，浮动模式按所属记录单元格加偏移定位，排序后重定位。布局允许偏移 −4096 至 4096 px、宽高 16–4096 px。图片每张 1 字节至 5 MiB、最多 40 MP、非动画 PNG/JPEG，每记录最多 50 张。浏览器本地草稿/重试队列在当前页面内存中，不能据此声称浏览器退出后仍可恢复未提交草稿；已确认业务与原件由服务器持久化，离开提示保护待处理内容。

## 当前 Excel 合同与限制

| 项目 | 当前行为 |
|---|---|
| 当前四个正式导入入口 | 均走 `RecordImportDialog` / `readExchangeFile`，不是第一轮旧 preview-only 对话框 |
| 文件/ZIP | 仅 `.xlsx`；文件 ≤5 MiB、实际解压总量 ≤20 MiB、ZIP ≤512 项、工作表 ≤32；路径、压缩类型、CRC、实际输出预算和 XML 坐标预检后重新封装 verified ZIP 给 ExcelJS。拒绝加密/异常归档，不访问外部图片 URL |
| 表尺寸 | 每表最多 2000 条记录 + 1 行表头、100 列。旧颜色 `sheet-exchange.ts` 的 1000 行含表头/32 列仍有代码与测试，但不是当前含图 UI 限额，不能混写 |
| 表头与映射 | 可选择 sheet、表头行、中文字段映射；同一字段不能映射两列。导出 ID/版本技术列隐藏、业务模板和图片清单 veryHidden；隐藏和工作表保护不被信任为安全边界 |
| 更新身份 | 有 ID 必须属于当前授权读取范围且版本一致，重复 ID/非法版本/只读变更列为错误，不因 ID 失败回退新增。未变化行 no-op；缺列不改，空白默认忽略，明确勾选清空才清为 null |
| 普通颜色台账 | 无 ID 时仅在授权已读清单中“颜色名 + 基地名”唯一对应后更新；缺基地或歧义报错。不能从表格新建颜色。标准字段仍需原因 |
| 普通人员台账 | 可创建独立档案，不创建账号或资格；相同来源文件 hash/sheet/行已唯一对应时复用既有档案。相同姓名本身不合并记录 |
| 普通检验台账 | 当前层从属关系须通过明确 ID/表单选择解析。事实导入不会直接提交评审；已提交事实拒绝改写。图片导入限台次层，其他层不接受图片以免归属混淆 |
| 普通产量台账 | 新增须明确 MONTH_TOTAL/月度总量、台、YYYY-MM 和合法颜色/基地 ID；同文件重复粒度及已有月份报错。明细/小计/合计、口径不明行不能自动累加。来源对账独立展示 |
| 公式/链接 | 不执行公式、不用未经验证缓存值；公式对象、错误值、链接值以及普通以等号开头的文本进入错误处理。只提供具体业务值才可写入 |
| 常见嵌入图片 | 原始 ZIP/XML drawing 清单为准，保留 PNG/JPEG 原字节和一单元格/双单元格/绝对锚点；与 ExcelJS getImages 数量不一致明确报告。每工作簿最多 1000 图片实例，单图字节与像素限制同上 |
| 特殊对象 | DISPIMG、IMAGE 外链、WPS 特殊单元格图片、链接/矢量/组合/复杂效果等逐项提示；合法原字节尽量保留供预览与指定，不悄悄丢图。确实不支持者需明确确认排除并转手动上传，不能计为成功 |
| 分批与图片 | 文字先按50行批次确认，得到新记录服务器 ID 后逐图上传；operationId/回执在本次导入中用于核实重试。文件含已确认字节时，隐藏元数据只作为候选，还需核对服务器同一 imageId/recordId 与真实原件 hash 才作为图片 no-op |
| 导出 | 导出当前授权已载入、筛选后的记录；真实嵌入原件字节，非临时 URL。CELL 图采用适合行内的导出尺寸，FLOATING 保留偏移及尺寸；技术清单记录 imageId/recordId/hash |
| 布局兼容限制 | 导入锚点用于预览与判断归属，入库新图使用默认业务单元格布局，并不承诺完整复制 Excel 的裁剪、旋转或浮动布局。独立 OOXML/Pillow 解析和本系统往返不等于 Microsoft Excel/WPS/LibreOffice 全兼容 |
| 已载入范围 | 人员/产量最多当前 2000 行，超出显示范围提示；检验每层最多5000行，超限拒绝要求按真实活动拆分。统计端覆盖服务器查询范围，不用已加载行数冒充全量统计 |

## 本地启动、身份与持久化配置

本轮隔离 profile 的目标入口 `http://127.0.0.1:3380`，API `127.0.0.1:3381`，Web `127.0.0.1:3382`，代理保持同源 `/api`。PostgreSQL 库 `light_truck_sheets_20261013`，Redis 使用隔离 DB 5，原件目录为工作树下 `var/light-truck-sheets-02-04/objects`，扫描连接本地端口 53319。以上为本轮隔离 profile 的配置约定；当前9ed启动身份由不可变制品manifest、preview进程记录及最终只读浏览器API health/Web build-info核对绑定；68历史浏览器证据保留其实际runtime，不是仅凭端口监听判定。

运行入口是已存在的 `var/light-truck-sheets-02-04/preview.py`：`status` 只读核对；`start ABSOLUTE_BUILT_REPO` 只启动带 BUILD_COMPLETE manifest 的不可变 Web/API 生产构建；`stop` 只停止本轮记录了 PID 与进程出生信息的三个进程，保留数据库、对象和扫描器。不得把开发树当最终构建运行，也不要为重启再运行会复制数据库的 prepare.py。

配置需要 DATABASE_URL、REDIS_URL、FRONTEND_URL、OBJECT_STORAGE_PROVIDER/OBJECT_STORAGE_LOCAL_ROOT、MALWARE_SCANNER_PROVIDER/CLAMAV_HOST/CLAMAV_PORT、会话与本地认证相关配置；不把账号、密码、Cookie、Session、连接串或 private env 放进交付文档。`AUTH_MOCK_ENABLED=false`，用户通过 `/login` 原生账号登录，不依赖第三方身份。HTTP 仅限明确 loopback profile，保留 Origin/CSRF、Cookie 和扫描/配额约束；不扩大到局域网。生产域名与原3370均未由此文档证明改变。

## 本轮修复与保持的边界

- 排序筛选后编辑、详情与图片以稳定记录 ID 对齐；选择读取不扫描或序列化整个工作簿。颜色打开原生编辑器后点详情，结束编辑可能移动选区，现已在点击时捕获详情目标 ID，避免误开下一行。68完整交互原路径回归通过，历史失败保留。
- 复合角度粘贴保留父组字段的一致性校验；服务端确认相关兄弟行时依据提交时字段版本，飞行中撤销/新编辑不会被旧确认覆盖。冲突沿用 CAS，不把重试变成覆盖服务器新值。
- 检验同活动的初次/成功快照复用，切层先读活动最新元数据核对 revision；显式刷新、冲突、新增和导入后全读。0ec只读烟测证明5次切层无重复子层分页；这不等于3秒性能达标，也不承诺外部颜色/人员变更未经刷新立即显示。
- 25a千行冷/暖加载分别4947.620 / 4532.525 ms，实际未达3秒。源码定位到业务ready等待Univer的 `Steady`，其已安装1.0.4会在 `Rendered` 后固定再等3000 ms。a6a起改为业务ready等待 `Rendered`，不修改引擎生命周期计时或性能终点。68同口径千行实测冷1836.420/暖1409.240ms通过；旧25a FAIL保留于历史表。
- a6a真实2×2文本粘贴发现末尾空白未清：原依赖 `convertTextToTable` 的 `trim()` 吃掉结尾TAB。a53补丁保留TAB、首尾空格和首空列，规范CRLF且仅移除一个末尾记录换行。已安装ESM/CJS真实函数的24项针对性回归通过；68真实2×2粘贴、保存和整页重开已通过。**文件导入默认忽略空白与原生表格粘贴清空是不同合同，不能混用。**
- 颜色350ms自动保存只提交已确认单元格，不再调用finishEditing结束下一笔原生输入；显式保存/核实仍结束编辑后取快照。68两笔原生专项及50次快输已闭合，保留CAS、原因与幂等规则。
- 样式插入继承当前文档nonce；保留原生FormulaUI等编辑所需插件，按实际菜单/命令ID阻断业务不允许的格式刷或结构操作。没有为实现表格放宽CSP或服务端只读限制。

## 数据库迁移与恢复

`apps/api/prisma/schema.prisma` 是模型源。以下为本轮5份migration源码及SHA-256；应用状态、约束实际存在和恢复演练需在本轮隔离数据库另留证据，不能由文件存在推断已迁移成功。

| migration | 主要改变 | migration.sql SHA-256 |
|---|---|---|
| `202610130001_person_profiles` | 独立人员档案、部门/账号关联、版本；既有用户按原ID回填档案，不新建账号或授予角色，过长值阻断而非截断 | `10de1609f9fb3291081bb892562d1134e73c1b90d61a3692bcbbf4125be48a25` |
| `202610130002_sheet_images` | 4类表格目标与SheetImage；附件/预留projectId可空仅限受控全局表格目标，旧项目目标仍须项目；唯一附件、操作幂等、版本/布局及外键约束 | `39e12d0699f4ddd75513149410800b11ee57b506d213160dedd70100d56c86ba` |
| `202610130003_inspection_facts` | 活动、参与者、对象、台次、测量组、读数、缺陷7表；对象/结论枚举、主从外键、业务唯一性与版本 | `32452ba385087b9affad18c64d7a5ce232b02479ba16240ec4116da61b89d7ca` |
| `202610130004_sheet_import_source` | 人员档案和产量事实originalSource JSONB来源元数据 | `06cd9dfe52e4e4a2f5f9707f45211c3f36fdaa1d827397e2accf13ae9a10e041` |
| `202610130005_person_import_identity` | 人员importKey唯一约束，按来源身份去重 | `97724588c540bc8a4d09a89475685958c90c2d5d61d109c3e95ebd92cf2b3a4c` |

未手改业务表绕过migration，未把原件二进制放进数据库。审计继续落库，不覆盖历史标准版本、评审或原作者关联。备份目录0700、文件0600，源库只读导出，对象备份保留完整原字节；新库名称明确且原先不存在，脚本不drop其他数据库。

本轮恢复目标为 `light_truck_sheets_restore_20261013_xe7b2ca498d31`，已由原恢复尝试创建并完整恢复。随后对该**同一现存目标**运行只读复核，结果 [existing-restore-readonly-verification.json](/private/tmp/light-truck-sheets-backup-evidence/light_truck_sheets_restore_20261013_xe7b2ca498d31/existing-restore-readonly-verification.json) 为PASS（2026-10-13T08:40:00.812240Z–08:40:04.313699Z，JSON SHA `a1f04c4598104703e3e8823691a02602f689c8cf191e1a4cbb1adf6c73d64364`）。此复核没有再次建库/恢复，没有改源库、目标库或迁移回执。

| 恢复比对 | 实际结果 |
|---|---|
| 数据库数据 | 68个public表完整行指纹相同；源库与恢复库分别在只读快照中核对两次，期间行数据均未变 |
| schema | 252约束、304索引、880列、266枚举标签；只有 `sheet_images.sheet_images_layout_check` 的完整指定varchar数组cast表达式允许语义等价，其余严格相等 |
| 原始schema SHA | 源 `4f559c3da208616855fe9a92de33a81439d4ce137d47e283cd06f53ac67f1fe9`；恢复 `4edfafb4d3b981b8f61c5165d52abf93e81c927ea9f7d8e22af13ff74d6bf513`，明确不相同；指定等价规范化后双方为前一SHA |
| migration | 本期5个文件SHA与9ed源码及已应用回执一致，必要迁移对象与约束有效，无回滚或篡改回执 |
| 对象 | 136文件、1682771字节，全部文件SHA相等；对象清单SHA `ecfe23dc62c2d3a9484320be3c30f89936685b4b2c567c21c32f588a4d59b565` |
| 原件关联 | 112条live CLEAN引用全部存在且checksum逐项匹配，无缺checksum旧对象；SheetImage业务关系有效 |
| 数据库备份 | 1778378字节；SHA `8bfcddfb3f4c0846ac5e300d3c61eb3bf117f4b247f1f62c8b4fc14c9721cfec`；不在仓库公开备份内容 |
| 应用验证边界 | `applicationSwitchPerformed=false`、`restoredApplicationLoginTested=false`；应用未切到恢复库，不能称恢复库登录通过。随后9ed启动使用原本轮运行库，其重启持久性单列 |

完整行指纹的基线是本次复核时仍静默的源库与已恢复库。原恢复程序在早先schema门禁停止前未持久化全部导出快照指纹，因此 `originalExportedSnapshotBaselineReconstructed=false`；不声称重建了原dump时刻快照。

恢复历史保留三次不同根因：首次工具按行读取截断多行JSON（首行178字节、剩余32588字节），发生在dump/新库创建之前；修正传输协议后，前置校验发现migration003缺一个末尾LF，9ed仅恢复与DB回执一致的原8551字节，未执行DDL或改回执；之后目标实际恢复成功，原严格schema字符串比较在pg_dump重解析的数组cast写法停止。源为varchar数组整体转text[]，恢复为各元素转text，两者完整指定表达式及其他边界相同。原失败及raw SHA均保留，最终只读复核仅允许该精确等价，其余全部严格比对；这些属于恢复验证工具/源码字节一致性处理，不列为未修业务bug。

## 本机运行方法与现有业务不变项

以下命令用于本轮隔离profile；start仅应在对应制品manifest已为BUILD_COMPLETE后执行。私有 `env.json`、账号文件、会话与连接串不进入版本库或本文。普通重启不能重新执行初始化复制数据库脚本。

```sh
python3 /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/preview.py status
python3 /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/preview.py stop
python3 /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/preview.py start /Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-releases/9ed0502b9e97e543dc5beea00998b5edc0bb0e67
```

启动只接管记录了PID及出生信息的本轮进程；其他端口有进程即拒绝，不替换原3370或其他应用。数据库位于本机Docker `m1_test` 的隔离库，对象目录和Redis隔离命名保持；stop不删除持久化。原件读取仍经过授权、扫描、配额与限流。原件读取遇429按真实Retry-After恢复（1–300秒、最多2次重试），不把正常限流设为全局例外；导出等待应单列，不计入输入响应耗时。

既有颜色立项、标准更正、正式编号、岗位授权、项目团队范围、流程状态机、原月度评审提交/通过/驳回历史不由表格替代。检验事实需显式链接一个项目/月/任务才可走原第17步流程，录入结论不自动推进。产量月度总量、来源对账和旧项目量产批次数量分别展示；不能为了统计方便混加。生产域名、本机原3370、main/tag均不因本轮隔离启动发生发布变化。

## 当前技术检查与适用性

| 检查 | 实际结果 / 证据 |
|---|---|
| frozen install、shared/API/Web build | 9ed不可变manifest BUILD_COMPLETE，编译身份一致 |
| 全仓lint / typecheck | `autosave-editor-lint.log` / `autosave-editor-typecheck.log`通过 |
| Web测试 | `autosave-editor-web-tests.log`：94文件、563 PASS |
| 末尾TAB依赖回归 | 已安装ESM/CJS真实函数24 PASS；68真实UI粘贴/持久化/重开另通过 |
| API全量 | `compound-full-tests-authorized.log` 1621 PASS /185 SKIP，SKIP不计PASS；68仅颜色前端修复未改后端，按最终源码适用性报告复用 |
| 隔离PG / migration | 8个postgres日志共28项PG PASS；48份总migration均应用（包含本期5份），不是48个测试；`migrations-runtime.log`记录总数及005应用 |
| Prisma schema | `final-prisma-validate.log`有效；68没有schema或migration改动 |
| Placeholder | `final-placeholder-scan.txt`12条测试匹配（getByPlaceholder/负向断言），运行实现0；按显式测试白名单归档 |

后端最终独立适用性报告 `FINAL_9ED0502_SOURCE_APPLICABILITY.md` 及 `candidate-9ed0502-source-applicability.json` 绑定9ed对68的逐文件Git blob/mode：Web436、API执行与测试420、schema1、shared3、依赖/补丁9、工具189均完全相同；138个精选源输入仅migration003变化（137/138相同）。新五份migration源码SHA全部等于已记录DB校验和；12个复用测试日志SHA同时绑定。因而复用563Web、1621API/185SKIP、28PG和68浏览器的精确范围，不声称它们在9ed重新执行。28PG细分为persons5、person-import3、stats-snapshot1、facts8、participants3、images3、images-inspection2、command-replay3；185个SKIP保持跳过。

测试不能替代产品确认。28PG与48份迁移应用记录不替代本轮完整数据/对象备份恢复；后者单独记录。

## 真实本地验收与版本复用

| runtime / 证据目录 | 结果 | 证明范围 |
|---|---|---|
| 9ed / [final-readback-evidence/1791938988977234000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/run.log) | 1 PASS/51.2s | 新登录四业务模块与四宽度5proof；19图正常重开全解码一次、各宽全ID+首图；236请求全200、0blocked/page/console；原运行库读回，非恢复库应用登录 |
| 68 / [autosave-editor-evidence/1791878915149554000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/autosave-editor-evidence/1791878915149554000/run.log) | 1 PASS/9.3s | 两笔原生编辑：首PATCH仅第一笔、第二笔焦点/基地保持，同ID完整前后缀121→122→123；整页重开额外0写，他行/图/89来源不变 |
| 68 / [color-comparison-evidence/1791878845087386000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-comparison-evidence/1791878845087386000/run.log) | 1 PASS/47.4s | 50选择/50快输/5排序，原目标最终值正确；2合成行×11列小表，防抖合并1PATCH，不是50次保存或千行性能 |
| 68 / [interactions-evidence/1791879087619100000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/interactions-evidence/1791879087619100000/run.log) | 8 PASS/1.0m | 原生键盘、2×2中文/前导零/0/末TAB清空、填充、排序筛选隐藏行、列宽冻结、撤销、409和详情；内部含4份整页重开0额外写，不另算4个测试 |
| 68 / [images-regression-evidence/1791879174696452000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/images-regression-evidence/1791879174696452000/run.log) | 1 PASS/10.7s | T11首绑定丢响应、期间文字保存、同ID/op恢复、替换和重开原件；注入ERR_CONNECTION_RESET按预期保留 |
| 68 / [clipboard-evidence/1791879230973373000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/clipboard-evidence/1791879230973373000/run.log) | 1 PASS/55.0s | 10完整四模块循环40目的挂载、0切换业务写；同页PNG/JPEG和trusted截图粘贴、后续文字、新browser context/hash/他行/89来源保持 |
| 68 / [compound-performance-evidence/1791879554116987000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791879554116987000/run.log) | 1 PASS/3.4m | 1000×27读数、50选择/50键/5排序/5筛选/5次100×10、30图、10切换；冷1836.420/暖1409.240ms、普通保存max515.985ms；新导出30图独立核验通过 |
| a53 / [color-template-evidence/1791878099967285000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/run.log) | 1 PASS/3.3m | 同ID备注116→117、no-op、只读名称拒绝；普通name+base唯一更新117→118、缺base拒绝；15图身份/hash不变且无上传，5个原件429实际恢复 |
| a53 / [person-evidence/1791875967743046000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/run.log) | 3 PASS/19.1s | 同名档案ID、原生录入/模板/独立档案导入；关联账号权限/历史边界，未知创建响应恢复 |
| a53 / [production-evidence/1791876002772823000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/run.log) | 1 PASS/16.5s | 10/12/5总27→原fact10改8总25→模板9总26；null≠0；两图往返、旧revision拒绝、跨行PNG指定后取消0写 |
| a53 / [production-evidence/1791876019800970000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876019800970000/run.log) | 1 PASS/8.3s | 已存月总量100后，后续同范围40/60明细与重叠总量均预览拒绝、0写、原fact/总100不变 |
| a6a / [inspection-evidence/1791875015462608000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/inspection-evidence/1791875015462608000/run.log) | 3 PASS/1.0m | 2台次/4组/12读数与3图往返；明确第17步目标月原流程；同operationId未知结果恢复 |

最终9ed与68仅migration003末尾LF及ledger不同，全部应用源码逐字节相同，故以下68应用技术结果保留其实际版本按精确差异复用；9ed已启动并通过源库/恢复库/对象比对，最终只读重开/390浏览器证据单列。68相对a53只修改颜色workspace的自动保存是否结束原生编辑及回归/ledger；共享runtime、模型/保存队列、图片、Excel、后端、权限、迁移未变。a53人员/产量/模板和a6a检验按未受影响路径说明适用性，保留原runtime与原证据，不改写为68实跑。新的68原路径、交互、T11和剪贴板用于覆盖实际改变/共享边界。完整性能数字、原始5次粘贴与历史对照详见PERFORMANCE；UI响应式截图与路由矩阵分别归档。

两笔专项中原生编辑器DOM文本采样为空，中间prefix由 `T06-intermediate-visual-review.json` 的真实截图复核，不能谎称DOM取到了文本；后续完整prefix+suffix及整页服务器回读已通过。交互中的预期409、T11注入网络断开和模板原件429恢复均保留原日志，不以“console零错误”概括所有用例。

## 最终9ed正常只读重开通过；两次原失败保留

两个run均为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、`http://127.0.0.1:3380`，各自run.log均为1 FAIL，events状态为 `incomplete_or_failed`。它们是应用只读重开门禁失败，不能改称备份恢复失败；独立恢复库全表/schema/对象比对的PASS边界不变。

| 实际run | 已完成证据 | 失败位置与已知原因 |
|---|---|---|
| [1791882314279074000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791882314279074000/run.log) | 人员、检验、产量三个模块的新上下文读回proof完整，均保留原事实；blocked/pageErrors/consoleErrors为空 | 颜色照片 figure 已存在，但首个待测lazy图在视口外；脚本在正常滚动进入视口前等待img出现，20秒超时。属于测试观察漏滚动，不据此声称产品丢图 |
| [1791884341445594000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791884341445594000/run.log) | 补滚动后前三模块、两条颜色及19图重开、1440/1280/1024布局阶段已完成；该run最终仍FAIL | 390阶段两次 `ERR_NETWORK_IO_SUSPENDED`；另两个缩略图请求实际429，响应为 `DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT`、`Retry-After: 1`。两个429图ID为 `3fe439fc-57c9-48cd-91f6-4bedf4407208`、`6cc7f994-3feb-4af1-8772-53528254ca6d`。这是actor并发上限，不是120次/分钟额度，也不是导出原件60秒限流 |

第二次脚本对每个宽度按随机UUID顺序重复扫描全部19图，累计109个缩略图请求、24个唯一图片ID。这个额外访问模式如实记录，不能消除已经发生的网络错误；`ERR_NETWORK_IO_SUSPENDED` 的操作系统原因未证，不能归因为睡眠。原run未点击界面“重试图片”，没有恢复成功证据，不得将这两项429或IO错误归入已恢复PASS或全局忽略。

最终新run [1791938988977234000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/run.log) 实际为1 PASS/51.2s；[readonly-readback-events.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/results/readonly-readback-最终重启后普通员工只读重开：人员稳定记录、检验月度锁定、产量26与100、颜色和照片/readonly-readback-events.json) 的runtime为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、status为passed。新登录后人员、检验、产量、颜色及颜色响应式共5份proof完整，236个网络请求（235 GET、1次正常登录POST）全部200，businessWrites/blocked/pageErrors/consoleErrors均0，89条来源指纹保持原基线。人员稳定ID与账号边界、检验2台次/4组/12读数及原目标月锁定、产量26与100及null≠0、两条颜色值/版本/19图均重新读取且保持不变。这是原本轮运行库的重启后读回，不是恢复库应用登录。

全19张颜色照片在正常记录重开时按DOM顺序逐图进入视口并实际解码一次；1440/1280/1024/390分别保留全部19个身份元数据，并实际解码首张代表图、核对同一记录/字段/值/版本及布局。四宽度documentWidth等于viewportWidth、outerOverflow=false、canvasReady=true、主导航各1份；不是每个宽度重复解码19图。完整路径与SHA见 `final-v9-readback-summary.json`。这次PASS证明该正常重开及响应式范围，不证明旧缩略图压力异常已恢复；旧run没有实际点击“重试图片”的成功证据，OS原因仍未知。

## XLSX与图片独立核验

当前颜色文件取 [color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping)：导出前后、备注修改与只读名称负向四份系统模板各15媒体/15drawing/15图片身份项；两个普通name/base样本无图。前后导出媒体SHA多重集合与隐藏imageId/recordId/hash清单一致。

独立ZIP/XML与Pillow已解析23份明确XLSX、133媒体/133drawing，全部媒体解码通过；包含a53人员5、产量8、颜色6、千行导出1、a6a检验2，以及最终68千行导出1。结果 `XLSX_FINAL_INDEX.md`、`xlsx-final-independent-summary.json`、`xlsx-color-final-independent-summary.json` 保存每文件/媒体SHA及锚点。最终68千行台次导出为A1:AD1001、30图/30隐藏图片身份项，137544字节，SHA `c8506e02428f05a8ae547715aebd623a4f32de6881e61e56cb89b8e65958d984`；每图独立Pillow.verify通过且隐藏hash均存在真实媒体，详见 `xlsx-68-performance-independent-summary.json`。它不替换Personal使用的25a旧输入，旧a53文件仍保留原run/hash。

68剪贴板run没有XLSX。它的4份明确本地图独立Pillow.verify与文件SHA均匹配浏览器proof；截图源/实际粘贴PNG容器SHA不同，但均1070×535、RGBA SHA同 `7042509bfb2f9d7657e1307094e8987e1f909199ed3d9ddaa25a5e6825d0b94c`。结果 `clipboard-68-independent-summary.json`。原件服务器GET、新context回读属于浏览器证据，本次独立脚本没有额外访问API。

### 可直接打开的当前模板与导出证据

| 文件 | 来源 |
|---|---|
| [color-current-after.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-current-after.xlsx) | color-template-evidence/1791878099967285000 |
| [color-current-before.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-current-before.xlsx) | color-template-evidence/1791878099967285000 |
| [color-ordinary-missing-base.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-ordinary-missing-base.xlsx) | color-template-evidence/1791878099967285000 |
| [color-ordinary-name-base.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-ordinary-name-base.xlsx) | color-template-evidence/1791878099967285000 |
| [color-readonly-name.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-readonly-name.xlsx) | color-template-evidence/1791878099967285000 |
| [color-update-note.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/results/color-template-current-col-81b3a--ordinary-name-base-mapping/color-update-note.xlsx) | color-template-evidence/1791878099967285000 |
| [linked-profile.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-lin-1bb7c-ority-or-historical-records/linked-profile.xlsx) | person-evidence/1791875967743046000 |
| [people-before.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/results/person-Ordinary-worker-two-95b3b--update-and-unlinked-import/people-before.xlsx) | person-evidence/1791875967743046000 |
| [monthly-after-import-with-image.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/results/production-Ordinary-member-4f16a-o-and-image-XLSX-round-trip/monthly-after-import-with-image.xlsx) | production-evidence/1791876002772823000 |
| [inspection-with-three-photos.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/inspection-evidence/1791875015462608000/results/inspection-普通员工从-UI-创建-2-台次-4-测量组-12-角度，3-张照片、总体结论和含图模板回读/inspection-with-three-photos.xlsx) | inspection-evidence/1791875015462608000 |
| [personal-comparison-input.xlsx](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791879554116987000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/personal-comparison-input.xlsx) | compound-performance-evidence/1791879554116987000 |

文件链接指向原始只读证据，不指向临时构建/私有账号文件。正式归档中的独立JSON索引与本表保留同一原文件SHA；审查文档可复制入docs，原始XLSX无需改写。

## 历史失败与处置

| 失败证据 | 原因 / 当前处置 |
|---|---|
| 25a千行1791873579498243000 | 冷4947.620/暖4532.525ms>3s；业务ready误等Steady固定3秒。改等Rendered，a53同口径新实测通过，不从旧值减3秒伪造结果 |
| a6a交互1791874792980028000 | 结尾TAB被trim吃掉，末空白未清；实际依赖补丁与24函数回归、68真实UI/重开通过 |
| a53快输1791877984543387000 | 第33笔（索引32）文字被拆到不同基地；颜色自动保存finishEditing误结束第二笔。68专项和50快输闭合 |
| a53专项1791878443440597000 | 坐标/前置失败、0写，不算产品红测 |
| a53专项1791878569399353000 | 两笔native确定性红测：首PATCH错误存第二笔未提交prefix，118→119且基地跳行；68首body正确、焦点不跳、同ID全文/重开闭合 |
| Personal1791876977061365000 | 同规模输入/保存前缀完成；原生含图排序后snapshot400“图片行列锚点或偏移无效”。停止新写入/重跑，不扩展修原项目 |

## 未验证范围与产品边界

- SYSTEM_IME：真实系统输入法CUA两次策略拒绝后停止，NOT_VERIFIED；普通中文字符串、模拟composition或图片粘贴不替代。
- Office：Microsoft Excel16.113.4实际只读打开01284产量副本，44单元格/2picture/54×39pt及源副本SHA不变通过；检验AppleEvent超时−1712，整体OFFICE_NOT_VERIFIED（部分通过）。保留两session，不继续盲试；未验证WPS/LibreOffice或最新颜色文件原生兼容。
- Personal仅为原项目只读参考的隔离副本，千行30列30图正常UI导入、50选择/50按键/50保存前缀已测；含图排序保存400后的逐格重开未通过，不把计时marker修正称全通过。
- 全部本机结果仅证明3380所列环境。生产、main/tag未改变，未获产品负责人实际操作确认。

## 按交付规则分别回答14项

| 必答项 | 当前准确状态 |
|---|---|
| 1. 代码是否实现 | CODE_IMPLEMENTED；9ed修正迁移字节已提交，68应用源码已验证，9ed构建完成，最终9ed正常只读重开/四宽度通过 |
| 2. 本地测试是否通过 | 静态/构建、已列真实UI、68完整性能及9ed备份恢复比对通过；最终9ed正常重开/四宽度通过；两次原FAIL及压力异常未验证恢复边界保留，SYSTEM_IME与Office未完整验证 |
| 3. staging精确URL | 未执行远端staging；本机隔离入口单独记为http://127.0.0.1:3380 |
| 4. staging runtime commit | 未执行，不以本机替代 |
| 5. staging用户路径 | 未执行 |
| 6. production是否改变 | 未改变 |
| 7. production runtime commit | 本轮未核对，不猜测 |
| 8. production用户路径 | 未执行 |
| 9. main是否改变 | 本轮未改变 |
| 10. tag是否改变 | 本轮未改变 |
| 11. 产品负责人是否确认 | 未确认，AWAITING_PRODUCT_OWNER_CONFIRMATION |
| 12. 未完成路由 | 四路由实现和已列技术路径可用；全部仍等待产品确认；最终9ed正常重开已通过，SYSTEM_IME及Office边界另列 |
| 13. Placeholder数量 | 当前扫描运行实现0、测试白名单匹配12 |
| 14. 当前准确状态 | CODE_IMPLEMENTED / BUILD_COMPLETE；已列本地业务、性能、恢复及最终正常重开通过；ACCEPTANCE=NOT_FULLY_VERIFIED（SYSTEM_IME）；AWAITING_PRODUCT_OWNER_CONFIRMATION；production NOT_DEPLOYED，未授予MAIN_MERGED |
