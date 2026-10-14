# LIGHT_TRUCK_SHEETS_INTEGRATION_02_04 当前证据索引

最终源码与当前启动版本为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`，本机隔离入口 `http://127.0.0.1:3380`。9ed仅对68恢复已应用migration003的末尾LF和更新ledger；应用源码完全相同。下列既有浏览器结果按未变范围复用，保留实际runtime，不改成9ed实跑。最终9ed新上下文/四宽度读回1791938988977234000为1 PASS/51.2s；两次原FAIL保留。SYSTEM_IME仍未验证，整轮ACCEPTANCE为NOT_FULLY_VERIFIED。

## 已完成的真实浏览器证据

| 实际runtime / 范围 | 原始执行日志 | 结果 | 边界 |
|---|---|---|---|
| 9ed 最终正常只读重开 | [final-readback-evidence/1791938988977234000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/run.log) | 1 PASS / 51.2s | 四模块与四宽度5proof、19图一次全解码、四宽各全ID+首图；旧压力异常恢复未验证 |
| 68 两笔原生自动保存 | [autosave-editor-evidence/1791878915149554000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/autosave-editor-evidence/1791878915149554000/run.log) | 1 PASS / 9.3s | 首请求仅已提交第一笔；第二笔同格完整保存，整页重开0写 |
| 68 颜色50快输 | [color-comparison-evidence/1791878845087386000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-comparison-evidence/1791878845087386000/run.log) | 1 PASS / 47.4s | 50选择/50输入/5排序，正确稳定ID；2合成行×11列，不是千行 |
| 68 交互与冲突 | [interactions-evidence/1791879087619100000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/interactions-evidence/1791879087619100000/run.log) | 8 PASS / 1.0m | 含4个整页重开证据，不另加4个用例；预期409保留 |
| 68 T11不确定图片结果 | [images-regression-evidence/1791879174696452000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/images-regression-evidence/1791879174696452000/run.log) | 1 PASS / 10.7s | 实际丢响应后同ID/op恢复、期间文本保存、替换/原件重开 |
| 68 图片/剪贴板/40挂载 | [clipboard-evidence/1791879230973373000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/clipboard-evidence/1791879230973373000/run.log) | 1 PASS / 55.0s | PNG/JPEG/真实trusted截图粘贴、后续文字、新上下文；10完整循环0业务写 |
| 68 完整千行性能 | [compound-performance-evidence/1791879554116987000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791879554116987000/run.log) | 1 PASS / 3.4m | 50选择/50键/5排序/5筛选/5次100×10、30图、10切换；冷1836.420/暖1409.240ms |
| a53 颜色当前模板 | [color-template-evidence/1791878099967285000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-template-evidence/1791878099967285000/run.log) | 1 PASS / 3.3m | 15图×4系统模板不变；no-op/只读/歧义负向；5原件429按Retry-After恢复 |
| a53 人员 | [person-evidence/1791875967743046000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/person-evidence/1791875967743046000/run.log) | 3 PASS / 19.1s | 同名ID、模板/独立档案、关联账号权限、未知创建结果恢复 |
| a53 产量主流程 | [production-evidence/1791876002772823000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876002772823000/run.log) | 1 PASS / 16.5s | 总量27→25→26同fact；null≠0、两图、旧版本拒绝、跨行图片待指定 |
| a53 产量跨文件负向 | [production-evidence/1791876019800970000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/production-evidence/1791876019800970000/run.log) | 1 PASS / 8.3s | 明细/重叠总量不混加，0写且原100不变 |
| a6a 检验及原月度流程 | [inspection-evidence/1791875015462608000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/inspection-evidence/1791875015462608000/run.log) | 3 PASS / 1.0m | 2台次/4组/12角度/3图；明确目标月原流程；同op恢复 |

完整runtime：68=`68acd102bc8f88fa7bf88aea099ccc7d74cbde28`；a53=`a53e7f8dbc179f46984981b0ca4cb6d26a0324fa`；a6a=`a6a2dc67042202bbde163acfafdf825fc923f06f`。源码适用性、分项版本、字段合同及最终制品完整摘要见 DELIVERY。

## 最终9ed正常只读重开通过；两次原失败保留

两个run均为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、`http://127.0.0.1:3380`，各自run.log均为1 FAIL，events状态为 `incomplete_or_failed`。它们是应用只读重开门禁失败，不能改称备份恢复失败；独立恢复库全表/schema/对象比对的PASS边界不变。

| 实际run | 已完成证据 | 失败位置与已知原因 |
|---|---|---|
| [1791882314279074000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791882314279074000/run.log) | 人员、检验、产量三个模块的新上下文读回proof完整，均保留原事实；blocked/pageErrors/consoleErrors为空 | 颜色照片 figure 已存在，但首个待测lazy图在视口外；脚本在正常滚动进入视口前等待img出现，20秒超时。属于测试观察漏滚动，不据此声称产品丢图 |
| [1791884341445594000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791884341445594000/run.log) | 补滚动后前三模块、两条颜色及19图重开、1440/1280/1024布局阶段已完成；该run最终仍FAIL | 390阶段两次 `ERR_NETWORK_IO_SUSPENDED`；另两个缩略图请求实际429，响应为 `DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT`、`Retry-After: 1`。两个429图ID为 `3fe439fc-57c9-48cd-91f6-4bedf4407208`、`6cc7f994-3feb-4af1-8772-53528254ca6d`。这是actor并发上限，不是120次/分钟额度，也不是导出原件60秒限流 |

第二次脚本对每个宽度按随机UUID顺序重复扫描全部19图，累计109个缩略图请求、24个唯一图片ID。这个额外访问模式如实记录，不能消除已经发生的网络错误；`ERR_NETWORK_IO_SUSPENDED` 的操作系统原因未证，不能归因为睡眠。原run未点击界面“重试图片”，没有恢复成功证据，不得将这两项429或IO错误归入已恢复PASS或全局忽略。

最终新run [1791938988977234000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/run.log) 实际为1 PASS/51.2s；[readonly-readback-events.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/results/readonly-readback-最终重启后普通员工只读重开：人员稳定记录、检验月度锁定、产量26与100、颜色和照片/readonly-readback-events.json) 的runtime为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、status为passed。新登录后人员、检验、产量、颜色及颜色响应式共5份proof完整，236个网络请求（235 GET、1次正常登录POST）全部200，businessWrites/blocked/pageErrors/consoleErrors均0，89条来源指纹保持原基线。人员稳定ID与账号边界、检验2台次/4组/12读数及原目标月锁定、产量26与100及null≠0、两条颜色值/版本/19图均重新读取且保持不变。这是原本轮运行库的重启后读回，不是恢复库应用登录。

全19张颜色照片在正常记录重开时按DOM顺序逐图进入视口并实际解码一次；1440/1280/1024/390分别保留全部19个身份元数据，并实际解码首张代表图、核对同一记录/字段/值/版本及布局。四宽度documentWidth等于viewportWidth、outerOverflow=false、canvasReady=true、主导航各1份；不是每个宽度重复解码19图。完整路径与SHA见 `final-v9-readback-summary.json`。这次PASS证明该正常重开及响应式范围，不证明旧缩略图压力异常已恢复；旧run没有实际点击“重试图片”的成功证据，OS原因仍未知。

## 构建、恢复与独立文件检查

- [9ed不可变构建manifest](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/color-register-releases/9ed0502b9e97e543dc5beea00998b5edc0bb0e67/color-register-artifact-manifest.json)：BUILD_COMPLETE，Web/API编译身份一致，运行验证不由构建字段代替。
- [9ed源库与现存新恢复库只读验证](/private/tmp/light-truck-sheets-backup-evidence/light_truck_sheets_restore_20261013_xe7b2ca498d31/existing-restore-readonly-verification.json)：PASS；68表完整行、136对象/1682771字节、112 CLEAN原件引用、本期5迁移一致；schema只允许一处完整指定数组cast等价，原始SHA保留。没有再次恢复、未切恢复库应用、未验证恢复库登录，未重建原导出快照基线。
- 23个明确XLSX共133媒体/133drawing，全部独立ZIP/XML及Pillow核验通过。每个实际原文件链接、SHA和锚点见 XLSX_FINAL_INDEX.md 及三个独立汇总JSON。最终68导出是1000行、30列、30图；Personal比较保留其25a原输入，不替换。
- 68剪贴板4份明确本地图独立核验通过；截图源及实际粘贴PNG容器SHA不同、RGBA像素SHA相同。该run没有XLSX，不虚构导出。
- Web563 PASS；API1621 PASS /185 SKIP；8份隔离Postgres日志28 PASS；总48 migration已应用，包含本期5份。日志适用性和精确来源见 DELIVERY，SKIP及migration数量不冒充通过用例。

## 保留的历史与未验证边界

25a加载超过3秒FAIL、a53颜色快输错行真实FAIL及68修复、Personal含图排序400与其已测前缀均保留在 PERFORMANCE/历史索引。Personal原项目只读，不再重跑或扩展修复。SYSTEM_IME两次真实工具策略失败后停止，NOT_VERIFIED；Office产量只读打开部分通过、检验超时，整体OFFICE_NOT_VERIFIED。原始429/409/注入断网证据不删除，按明确预期范围分类。

生产未改变，main/tag未改变；本地结果不证明公网站点已更新。产品负责人尚未确认，AWAITING_PRODUCT_OWNER_CONFIRMATION。
