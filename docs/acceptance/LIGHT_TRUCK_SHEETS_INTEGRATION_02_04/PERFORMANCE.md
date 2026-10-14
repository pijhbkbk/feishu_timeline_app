# LIGHT_TRUCK_SHEETS_INTEGRATION_02_04 — PERFORMANCE

**68千行技术性能用例1 PASS/3.4m。** 本次实际测量runtime `68acd102bc8f88fa7bf88aea099ccc7d74cbde28`，本机 `http://127.0.0.1:3380`。冷/暖1836.420/1409.240ms；选择/普通按键p95为43.590/54.720ms；普通保存含防抖max515.985ms。全部50/50/5/5/5、30图和10切换实际完成。历史25a加载FAIL、a53按键223.940ms与批量保存2078.705ms、Personal部分比较限制均保留，不覆盖或删掉。

最终源码及当前启动版本 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67` 相对68只恢复已应用migration003的末尾LF及更新ledger，全部应用源码/共享引擎逐字节不变。68性能证据可按该精确差异复用，仍保留runtime68，绝不改标为9ed实跑；9ed构建已BUILD_COMPLETE、源库与现存新恢复库的只读全量比对PASS，最终9ed正常只读重开1791938988977234000 1 PASS/51.2s另记DELIVERY；SYSTEM_IME仍未验证，整轮ACCEPTANCE=NOT_FULLY_VERIFIED。

本报告仅证明所列本机技术门禁。SYSTEM_IME未验证，Office部分通过、Personal含图排序400仍有边界；生产部署与产品负责人确认不由性能PASS获得。备份恢复/重启独立记录在DELIVERY。

## 最终9ed正常只读重开通过；两次原失败保留

两个run均为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、`http://127.0.0.1:3380`，各自run.log均为1 FAIL，events状态为 `incomplete_or_failed`。它们是应用只读重开门禁失败，不能改称备份恢复失败；独立恢复库全表/schema/对象比对的PASS边界不变。

| 实际run | 已完成证据 | 失败位置与已知原因 |
|---|---|---|
| [1791882314279074000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791882314279074000/run.log) | 人员、检验、产量三个模块的新上下文读回proof完整，均保留原事实；blocked/pageErrors/consoleErrors为空 | 颜色照片 figure 已存在，但首个待测lazy图在视口外；脚本在正常滚动进入视口前等待img出现，20秒超时。属于测试观察漏滚动，不据此声称产品丢图 |
| [1791884341445594000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791884341445594000/run.log) | 补滚动后前三模块、两条颜色及19图重开、1440/1280/1024布局阶段已完成；该run最终仍FAIL | 390阶段两次 `ERR_NETWORK_IO_SUSPENDED`；另两个缩略图请求实际429，响应为 `DOWNLOAD_PER_ACTOR_CONCURRENCY_LIMIT`、`Retry-After: 1`。两个429图ID为 `3fe439fc-57c9-48cd-91f6-4bedf4407208`、`6cc7f994-3feb-4af1-8772-53528254ca6d`。这是actor并发上限，不是120次/分钟额度，也不是导出原件60秒限流 |

第二次脚本对每个宽度按随机UUID顺序重复扫描全部19图，累计109个缩略图请求、24个唯一图片ID。这个额外访问模式如实记录，不能消除已经发生的网络错误；`ERR_NETWORK_IO_SUSPENDED` 的操作系统原因未证，不能归因为睡眠。原run未点击界面“重试图片”，没有恢复成功证据，不得将这两项429或IO错误归入已恢复PASS或全局忽略。

最终新run [1791938988977234000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/run.log) 实际为1 PASS/51.2s；[readonly-readback-events.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/final-readback-evidence/1791938988977234000/results/readonly-readback-最终重启后普通员工只读重开：人员稳定记录、检验月度锁定、产量26与100、颜色和照片/readonly-readback-events.json) 的runtime为 `9ed0502b9e97e543dc5beea00998b5edc0bb0e67`、status为passed。新登录后人员、检验、产量、颜色及颜色响应式共5份proof完整，236个网络请求（235 GET、1次正常登录POST）全部200，businessWrites/blocked/pageErrors/consoleErrors均0，89条来源指纹保持原基线。人员稳定ID与账号边界、检验2台次/4组/12读数及原目标月锁定、产量26与100及null≠0、两条颜色值/版本/19图均重新读取且保持不变。这是原本轮运行库的重启后读回，不是恢复库应用登录。

全19张颜色照片在正常记录重开时按DOM顺序逐图进入视口并实际解码一次；1440/1280/1024/390分别保留全部19个身份元数据，并实际解码首张代表图、核对同一记录/字段/值/版本及布局。四宽度documentWidth等于viewportWidth、outerOverflow=false、canvasReady=true、主导航各1份；不是每个宽度重复解码19图。完整路径与SHA见 `final-v9-readback-summary.json`。这次PASS证明该正常重开及响应式范围，不证明旧缩略图压力异常已恢复；旧run没有实际点击“重试图片”的成功证据，OS原因仍未知。

## 最终68同口径实测

来源 [compound-performance-evidence/1791879554116987000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/integrated-compound-performance.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791879554116987000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/integrated-compound-performance.json)，配套run.log、raw samples、阶段快照、trace和截图均保留。汇总不改变原始数据，也不从25a加载值减3秒估算。

| 指标 | n | median ms | p95 ms | max ms | 判定/边界 |
|---|---:|---:|---:|---:|---|
| 真实选择→匹配绘制/下一帧 | 50 | 42.755 | 43.590 | 45.330 | p95≤100ms |
| 普通单字符键盘→匹配绘制/下一帧 | 50 | 47.195 | 54.720 | 55.485 | p95≤100ms，非IME |
| Enter提交→画布文本 | 50 | 23.775 | 29.500 | 32.205 | 辅助指标 |
| 普通单条保存含300ms防抖 | 50 | 333.085 | 347.840 | 515.985 | 50次HTTP200；max≤2000ms |
| 普通保存请求本身 | 50 | 47.730 | 62.065 | 236.590 | 辅助指标，不替代防抖 |
| 1000行排序 | 5 | 64.295 | 65.425 | 65.425 | max≤1000ms |
| 1000行筛选 | 5 | 59.965 | 68.965 | 68.965 | max≤1000ms |
| 100×10粘贴本地画布完成 | 5 | 63.180 | 69.875 | 69.875 | max≤1000ms |
| 含图台次层滚动 | 20 | 49.845 | 50.670 | 50.750 | 真实20次wheel样本 |
| 冷导航→读数可见可编辑 | 1 | — | — | 1836.420 | ≤3000ms |
| 暖导航→读数可见可编辑 | 1 | — | — | 1409.240 | ≤3000ms |

5次粘贴每次100行×10个实际可写字段，使用新内容；每次两批各50个reading及5个去重measurement更新，结束后100行服务端逐值核对。相同父组字段不一致的输入整次拒绝。50个单条保存和10个批量请求均为真实PATCH，不以API直接写入替代UI。

| 粘贴次数 | 本地画布 ms | 全批服务端完成 ms（含防抖） | 服务端回读 |
|---|---:|---:|---|
| 1 | 69.875 | 1353.090 | 100条读数、父组一致 |
| 2 | 54.685 | 1447.590 | 100条读数、父组一致 |
| 3 | 63.415 | 1253.205 | 100条读数、父组一致 |
| 4 | 52.925 | 1370.540 | 100条读数、父组一致 |
| 5 | 63.180 | 1623.695 | 100条读数、父组一致 |

当前5次全批保存最大1623.695ms，实测均低于2秒；脚本2秒断言仅针对普通单条保存，批量明确列值，不假称拥有单独批量2秒自动门禁。a53历史第5次全批2078.705ms仍保留，不被本次结果消除。

### 冷暖资源与阶段链

| 阶段 | 冷 ms | 暖 ms |
|---|---:|---:|
| 1000读数行已可用 | 535.865 | 1295.800 |
| 引擎业务ready | 1295.310 | 1295.830 |
| 画布内容已在视口 | 1836.395 | 1409.215 |
| 当前单元格可编辑 | 1836.400 | 1409.220 |
| 主指标 | 1836.420 | 1409.240 |

冷静态资源39项，transfer2,090,875B、0项零传输；暖快照38项，transfer0、38项全零。两次资源数不同如实记录，不补成相等；导航ready时API快照58/50项，每次rows分页均43个、没有重复全层读取。终点仍包括实际点击读数层、可见内容和可编辑条件，scroll/视口等待未扣除。所有资源transfer来自实际PerformanceResourceTiming，两导航无route禁用缓存。

### 图片、主线程、切换与原件导出

30个固定imageId全部通过原生ArrowDown访问对应台次、详情缩略图自然尺寸640×400、同blob被引擎native drawImage使用；1000台次和89来源事实保持。20次wheel与逐图coverage分别记录，不能用主动fetch补齐漏图。

真实DevTools图滚动trace长1686.764ms，CrRendererMain共有646个完整RunTask，最长9.539ms，>50ms与>200ms均0。beforePhotos明确支持longtask，probe只收集duration>200ms且为空；当前输入样本也没有>200ms。该trace只覆盖滚动窗口，不能扩大成全程没有长任务；历史a53 key-42响应223.940ms不等于已证明主线程连续阻塞223ms。

10次目的业务页ready再返回检验的循环完成，navigationWrites=[]。目的页均2个live canvas，返回读数时1或2；heap used10个显式样本约96.06–212.69MiB。没有强制GC/无限时长监测，不把累计mount/removal差当遗留引擎数，不宣称已证明绝对无内存泄漏。

全run Network974项：GET913、POST1（登录）、PATCH60；HTTP200为972项，另2项导出原件429各Retry-After60秒后同精确URL200恢复（60.192/60.170秒）。原始console2项保留，unexpectedConsoleErrors/page errors/guard blocked为空。导出限流等待不混入输入延迟，不全局忽略其他429。

UI导出 `personal-comparison-input.xlsx` 新文件137544B，A1:AD1001、30媒体/30drawing/30隐藏图片身份，独立ZIP/XML/Pillow均通过，SHA `c8506e02428f05a8ae547715aebd623a4f32de6881e61e56cb89b8e65958d984`。这是68新文件；Personal比较仍使用25a旧文件，不重新运行或替换其原输入。

## 环境、规模与统计口径
业务隔离环境为 `http://127.0.0.1:3380/inspections`，数据库 `light_truck_sheets_20261013`；Personal对照为 `http://127.0.0.1:3473`，源项目 `/Users/lixiaochen/Documents/ChatGPT/在线表格`、源commit `15ea9714645331a7a2229967a3ba5de4badf8004` 的隔离副本。原项目只读，不能将Personal工作簿数据写回业务事实或原项目。

同机配置为Apple M1、8逻辑CPU、16 GiB、macOS arm64，Chrome 155.0.8059.40，视口1440×900；Univer均为1.0.4。业务和Personal的Next/React、持久化与保存策略不同，故仅能对照明确相同的输入到绘制部分，不能把差异全部归因于Univer或按一项速度计算整体提升百分比。业务为Next15.5/React19.2.6，Personal为Next16.4/React19.2.4；最终具体lockfile为准。

- 业务主测：1000条角度读数×27个实际业务显示字段，连续10个可编辑字段为4个真实测量组字段+6个读数字段；另有1000条台次×23列与绑定于台次的30张真实图片。30图滚动在台次层，不能描述成同一个27列角度网格同时含30图。
- 合成数据只用于隔离性能夹具。seed准备与操作测量分开；选择、普通键盘、排序、筛选、100×10粘贴、保存、滚动和切页均走真实UI，API只用于授权数据读取和保存结果核对，不能用直接API写入替代UI功能验收。
- 选择/普通键盘主指标捕获真实DOM输入事件，终点为匹配编辑/画布内容变化及下一帧；不把Playwright整次调用时间当输入延迟。此为浏览器可观察paint，不是物理显示器光子延迟。Enter提交到文本绘制独立列出，不能替代普通按键或系统IME。
- 冷/暖主指标从导航起到真实点击角度层后1000行、可见画布文本和可编辑输入框同时满足。保留滚动到可见区域所需时间；不是仅数据响应，也不是默认台次首屏时间。旧字段 `moduleDataReadyMs` 实为同一viewport-ready条件，不能冒充纯API完成时间。
- 100×10每次100行1000格，5次均使用新内容，保存按50个显示行分批；包括300ms防抖、后端CAS和所有批次完成，随后100条服务端读数核对。跨批不是整本事务，不把仅第一批成功当整次完成。
- 门槛保持：选择/普通键盘p95≤100ms；排序/筛选/粘贴本地完成≤1000ms；普通单条保存含防抖≤2000ms，批量保存完整列值但不附加未实现断言；冷/暖可见可编辑≤3000ms。统计小数仅四舍五入；25a主表median沿用原JSON的排序中位样本实现，小表/Personal中位数取两中项均值，避免暗中混算。
- 性能运行应独占浏览器负载。观测和scope guard只用于约束写入与取证，不注入合成ClipboardEvent、不调用内部引擎命令伪造交互、不模拟IME。

所有证据相对根为 `/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04`。完整原始samples、网络、截图和trace保留，不以本文汇总替换。

## 旧颜色小表基线与25a同路径对照
旧run：[baseline-evidence/1791858195618783000/results/baseline-Before-integratio-1e1e7-worker-interaction-baseline/baseline.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/baseline-evidence/1791858195618783000/results/baseline-Before-integratio-1e1e7-worker-interaction-baseline/baseline.json)，版本 `5bc1d10e5aea498612d63fd7637107282af7b040`，origin3370，API97条、实际筛选2行/10列，旧加载上限500。新run：[color-comparison-evidence/1791873513724044000/results/color-comparison-After-int-03313-worker-interaction-baseline/baseline.json](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-comparison-evidence/1791873513724044000/results/color-comparison-After-int-03313-worker-interaction-baseline/baseline.json)，版本 `25a944edcf85aa22ce36913299ceba7f4df4683a`，origin3380，API100条、实际筛选2行/11列，含照片入口。它们是小表对照，**不是1000×20主门禁**。

| 指标 | n | 旧基线 median / p95 / max（ms） | 25a median / p95 / max（ms） | 实际含义 |
|---|---:|---:|---:|---|
| 选择到当前单元格匹配及下一帧 | 50 | 27.585 / 31.970 / 32.555 | 20.248 / 29.835 / 33.565 | 不完全等同千行主测fresh canvas draw门禁 |
| Enter提交到目标文本绘制 | 50 | 15.280 / 25.525 / 35.395 | 14.223 / 19.755 / 20.225 | 中文采用insertText；不是普通单字符按键、更不是IME |
| 整行排序端到端 | 5 | 3536.830 / 3883.560 / 3883.560 | 31.670 / 40.220 / 40.220 | 页面标记到selectOption及画布回读，含Playwright操作和检查 |
| 第一次打开 | 1 | 2467.080 | 4304.040 | 两组都有route guard，不声称真实冷缓存 |
| 第二次打开 | 1 | 2160.025 | 4287.840 | 同上，不声称真实暖缓存 |
| 筛选 | 0 | 未测 | 未测 | 两个filters数组均为空，不补估值 |

旧canvas mounts18，新3；服务器文本读回两组成立。25a功能用例1 PASS/47.2s，console/page/guard errors为0；用例没有3秒加载断言，故其PASS不能转换为加载达标。两个打开值约4.3秒应保留。`longTasks=[]`只说明该probe收集的>200ms项为空，不代表所有长任务均为0。

## 68颜色小表原路径复验

[color-comparison-evidence/1791878845087386000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/color-comparison-evidence/1791878845087386000/run.log)，runtime `68acd102bc8f88fa7bf88aea099ccc7d74cbde28`，1 PASS/47.4s；API102条，实际测量两条合成颜色、11列。50次原生快输最终值保存到原记录，防抖合并为1个PATCH；没有误称50次逐笔保存或千行测量。

| 小表指标 | n | median ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| 选择→当前单元格匹配及下一帧 | 50 | 20.990 | 31.140 | 31.785 |
| Enter提交→文本paint | 50 | 11.347 | 19.275 | 22.030 |
| 整行排序端到端 | 5 | 31.070 | 44.280 | 44.280 |
| 第一次打开 | 1 | — | — | 1564.855 |
| 第二次打开 | 1 | — | — | 1243.765 |

此小表仍有route guard，不把两个打开值称真实冷/暖缓存；filters为空，未测筛选；mounts3、console/page/guard errors为空。中文使用insertText而非系统IME。该run与两笔原生编辑专项1791878915149554000共同闭合颜色自动保存错行；68千行完整实测已单独列于本文首节；两套数据仍保留各自真实规模和计时口径。

## 897首次千行运行：历史失败保留

证据 [compound-performance-evidence/1791870438833917000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791870438833917000/run.log)，版本 `897d71e23a49ff625def2f1c61ceb3f2140fe798`。已完成50选择、50普通按键、5排序、5筛选、5次真实100×10粘贴；冷4671.880 / 暖4790.470 ms，且最终30图片coverage仅29而失败。旧导航还包含重复四层读取，且缓存观测口径未达到后续无route实证条件，不与后续真实冷热直接宣称百分比改善。

后续诊断发现fast wheel没有保证一张应测图片实际进入视口/触发请求；修正为按稳定30个fixture ID，原生ArrowDown逐个进入对应行，等待详情真实缩略图自然尺寸及引擎实际drawImage同blob，再测独立连续滚动样本。没有将30阈值降到29，也不靠测试主动fetch/decode补齐缺图。0ec快照复用解决同活动切层的重复读取；这些改变都需新run证明，原失败证据不删除。

## 25a完整千行实测

证据目录：[compound-performance-evidence/1791873579498243000/results/compound-performance-1000--164e8--5-successful-100x10-pastes/](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791873579498243000/results/compound-performance-1000--164e8--5-successful-100x10-pastes)。主文件 `integrated-compound-performance.json`，运行日志整体 **1 FAILED**（冷、暖两个加载软断言超限）；`reading-metrics-before-photos.json`保留图片阶段前全部输入样本。本run确实完成后续图片/切换/导出，不因整体FAIL抹去已测分项，也不因分项通过抹去整体FAIL。

| 指标 | 样本数 | median ms | p95 ms | max ms | 判定 |
|---|---:|---:|---:|---:|---|
| 真实选择 → 匹配绘制/下一帧 | 50 | 40.020 | 44.405 | 48.815 | p95≤100ms |
| 普通单字符键盘 → 匹配绘制/下一帧 | 50 | 46.160 | 55.105 | 84.390 | p95≤100ms，非IME |
| Enter提交 → 画布文本 | 50 | 20.930 | 29.420 | 30.505 | 独立辅助指标 |
| 单次保存，含300ms防抖 | 50 | 334.045 | 446.500 | 1018.420 | ≤2000ms |
| 保存请求本身 | 50 | 48.050 | 164.745 | 735.800 | 辅助值，不替代含防抖指标 |
| 1000行排序 | 5 | 65.105 | 65.370 | 65.370 | ≤1000ms |
| 1000行筛选 | 5 | 63.860 | 70.660 | 70.660 | ≤1000ms |
| 100×10真实粘贴，本地画布完成 | 5 | 58.310 | 71.755 | 71.755 | ≤1000ms |
| 30图台次层滚动 | 20 | 33.725 | 50.705 | 50.910 | 样本留存；无额外臆造门槛 |
| 导航冷 → 角度可见可编辑 | 1 | — | — | 4947.620 | **FAIL >3000ms** |
| 导航暖 → 角度可见可编辑 | 1 | — | — | 4532.525 | **FAIL >3000ms** |

5次粘贴分别如下。每次产生两个50读数批次，所涉及真实测量组父字段每批去重为5个measurement更新，均经同组一致性、活动/行/父组CAS后提交。

| 次数 | 本地完成 ms | 全批保存含防抖 ms | 服务端核对 |
|---|---:|---:|---|
| 1 | 71.755 | 1578.260 | 100行新内容一致 |
| 2 | 53.045 | 1585.695 | 100行新内容一致 |
| 3 | 58.310 | 1784.260 | 100行新内容一致 |
| 4 | 57.175 | 1646.725 | 100行新内容一致 |
| 5 | 60.750 | 1734.775 | 100行新内容一致 |

图片coverage为30/30指定fixture IDs，真实授权缩略图响应、natural dimensions和引擎drawImage blob均已记录，另有20次滚动时延。`sourceUnchanged=true`、`occurrencesUnchanged=true`，navigationWrites=0；blocked、page errors、unexpected console errors均为空。完整原始console并不为空：含图导出读取30原件遇到两个精确原件URL 429，各Retry-After60秒，实际约60162ms/60153ms后相同URL200恢复，最终成功导出。它们仅归类为该导出阶段已证实恢复的限流，不全局忽略429或其它错误，导出限流耗时不混入输入指标。

10次跨模块切换均到真实目标URL、标题、无loading和挂载canvas后返回检验；目标页各2个live canvas，返回检验为1或2个，0导航业务写。原JSON的十个 `memory:{}` 来自PerformanceMemory不可枚举属性的序列化缺失，**不能据此声称heap稳定或内存无泄漏**。最终probe应明确读取usedJSHeapSize/totalJSHeapSize/jsHeapSizeLimit，保留新值而不是补旧值。观察到的>200ms longTasks数组为空；缩放/列宽在本spec标为NOT_MEASURED，不能自动计PASS。

## 25a冷/暖资源与最长等待链

该run导航前撤销Playwright route；冷先显式清HTTP缓存，暖启用缓存重复导航。每次39个 `/_next/static/` 资源：冷transferSize2,090,722B、零传输0；暖transferSize0、39个全零，encodedBodySize均2,079,022B，另保留CDP缓存命中证据。这比只设置“cold/hot”标签更具体。

| 相对navigation阶段 | 冷 ms | 暖 ms |
|---|---:|---:|
| 活动列表GET结束 | 176.810 | 126.045 |
| 初始活动详情结束 | 272.500 | 276.360 |
| 四层事实rows最后响应 | 722.060 | 674.150 |
| 读取后活动revision复核结束 | 834.685 | 694.250 |
| 角度层1000行及输入框已存在 | 846.840 | 726.290 |
| 引擎loading遮罩消失 | 4583.350 | 3995.380 |
| 视口真实文本绘制且可编辑 | 4947.595 | 4532.495 |
| 保留的主指标 | 4947.620 | 4532.525 |

每次43个rows请求（20台次+20读数+2测量组+1缺陷），总API60；已没有旧86个重复子层请求。每层首分页之后4个worker并发，不是所有分页串行。图片元数据10个100-record批次仍顺序执行（冷845.265–2821.620，暖713.865–2432.465），但图片加载不被主load await，角度canvas没有台次images，不能把整段当此次readiness promise门禁。

确定根因是共享runtime把业务ready绑到 `LifecycleStages.Steady`。已安装 `@univerjs/ui`1.0.4的 `STEADY_TIMEOUT=3e3` 在Rendered后固定延迟3秒；canvas又await该ready才移除loading。行可用到引擎ready差3736.510/3269.090ms，包括这3秒和其他构建/渲染，不能全部当引擎纯运算时间。a6a及a53仅改业务层ready为Rendered，保留引擎Steady计时和延后插件，不手动推进阶段、不改测量终点。

引擎ready至viewport还差364.245/537.115ms，harness在clean后实际scrollIntoView，因为顶部内容使表格在视口外。没有完整scroll/lifecycle逐段mark，不能擅自扣掉该段；同样不能从旧主指标直接减3000ms宣称新版本达标。连续失败后已停止无代码改变的盲跑，以独立审查、早期编辑/图片/填充回归及新固定构建的同口径复测闭合。

## Personal同规模对照：已测前缀与真实含图排序保存限制

Personal是只读参考项目的隔离副本，origin `http://127.0.0.1:3473`、source commit `15ea9714645331a7a2229967a3ba5de4badf8004`。本轮不扩展修复原Personal，不改其数据库/图片安全校验，也不删除图片或缩小排序范围绕过失败。已停止对照新增写入与重跑；集成业务自己的排序、图片归属和最终性能已另有首节68证据，不能从Personal失败反推业务通过。

输入来自25a真实UI导出的 `personal-comparison-input.xlsx`：137544字节，SHA-256 `7191bbe20bf72388ccd49e7174c2491f5ef790587331ee76d8c7a5cab0759dda`，1000条台次、30列、30嵌入图，范围A1:AD1001。30列是2个隐藏记录ID/版本 +23展示业务列 +5真实关联ID列；最后两关联列在台次层为空仍有正式表头，不是“多余样式空列”。保存与排序oracle始终覆盖30,000格及记录ID/版本/5关联ID向量。

### 历史不同原因保持区分

| run | 实際停止位置 | 性质 |
|---|---|---|
| `1791873979615557000` | 源文件preflight误预期25列，实际30列，尚未业务写入 | 脚本合同假设错误，不是产品导入失败 |
| `1791875111710447000` | 已UI导入、冷热、50选择/50普通按键/50保存；排序前置“排序提醒”未确认 | 脚本遗漏真实前置确认，不是locale变化或排序产品失败 |
| `1791876449198350000` | 已进入自定义排序A1:AD1001；`.check()`等待隐藏size0/opacity0 checkbox超时 | 脚本未点击可见label；后来改正常label点击与实际checked断言，无force |
| `1791876977061365000` | 正常确认原生排序后，计时标记未可见而超时；同时真实snapshot PUT400、UI保存失败 | 两个独立事实：不可见计时终点；以及真实含图排序后持久化被原项目校验拒绝。不能只修marker就称全通过 |

第2run已测小表保留：冷3823.300/暖3884.100ms；选择50 median42.500/p9543.600/max44.400ms；普通按键50 median44.500/p9562.800/max70.200ms。该run未完成排序、粘贴和10重开，旧404未保存URL，不能把后续run的精确URL倒填为旧run实测事实。

### 最新第4run已测前缀

证据：[personal-comparison-evidence/1791876977061365000/results/personal-comparison-Person-d22af-same-input-to-paint-samples/](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/personal-comparison-evidence/1791876977061365000/results/personal-comparison-Person-d22af-same-input-to-paint-samples) 的 `personal-partial.json`、`test-failed-1.png`、`error-context.md` 与上层run.log。轻量汇总在 `/private/tmp/light-truck-02-04-delivery-proposal/personal-1791876977061365000-partial-summary.json`，原始samples未删减。

该run正常UI导入新隔离工作簿、1000行/30列/30图及30,000格/ID核对；50次真实选择、50次普通ASCII键盘、50次自动保存全部实际完成。排序前 `verifyData` 已再次核对服务器完整30列数据。下面的50保存均为HTTP200；不将后续第51次400混进成功保存统计，也不丢弃该失败。

| 已测前缀指标 | n | median ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| 选择 → 匹配绘制/下一帧 | 50 | 43.000 | 43.800 | 44.900 |
| 普通键盘 → 匹配绘制/下一帧 | 50 | 45.200 | 59.500 | 65.200 |
| Enter提交 → 画布文本 | 50 | 21.400 | 27.300 | 30.400 |
| 保存含原项目配置防抖 | 50 | 1770.500 | 1815.400 | 2324.000 |
| 保存请求本身 | 50 | 195.100 | 248.000 | 339.000 |
| 冷导航 → 可用 | 1 | — | — | 3868.100 |
| 暖导航 → 可用 | 1 | — | — | 3868.800 |

统计遵循该probe原summary的排序中位样本定义。保存max2324ms不能写成≤2000ms全部通过；Personal的防抖/整本SQLite保存与业务300ms/50实体分批不同，保留实际条件不强行套用同因解释。冷/暖静态资源各27个：冷transfer1,943,766B、7个零传输；暖transfer0、27个全零。两阶段无route拦截、只读阶段写数0，但冷仍有7个零传输，不能称全部资源100%网络冷。

### 原生排序已确认，但保存400，停止进一步对照写入

实际操作保持完整A1:AD1001，确认不扩展，正常点击标题保护、选“车辆 / 样件编号”降序，再点击确认。截图显示排序dialog已关闭，视口位于V:AC附近与994–1001行；脚本却等待F2的 `sorted[0].objectCode` 重新可见，故 `measured(sort-0)` 没有完成。这解释计时超时，但不能证明持久化成功。

同一张截图明确显示：**“保存失败：图片行列锚点或偏移无效。本地草稿会持续保留。”** 当前界面修订51。partial中第51个保存请求为PUT `/api/v1/workbooks/7266fa70-e157-40ad-a2b3-e9c2406885b6/snapshot`，实际HTTP400、请求耗时182.200ms；前50次均200。consoleDetails和resourceFailures均保留该400，不属于favicon例外，不允许分类后吞掉。其sinceEditEnd4920.700ms沿用前一次键盘编辑时间，**不是排序保存含防抖耗时**，不作为排序性能样本。

源边界已定位：Personal `src/workbooks/service.ts:138` 的 `saveSnapshot` 在调用commit之前执行 `validateSnapshot`；后者调用 `src/media/model.ts:25` 的 `validateDrawingResources`。该文件46行对每张图片四组marker（sheetTransform及axisAlignSheetTransform各from/to）要求row/column为界内整数、rowOffset/columnOffset为非负有限数，任一不满足即返回此次错误。当前证据没有保存被拒绝POST的完整drawing资源，因此只能确认校验类别，**不能捏造具体图片ID、哪一偏移为负或断言已经确定引擎内部数值根因**。

这个排序后snapshot被拒绝发生在数据库commit之前；源码支持“不提交非法排序快照”，UI显示最后已接受修订51。失败后未另做全库/原件哈希重验，不用源码推断冒充新的重开验证。原输入XLSX、30图片源资源、该隔离工作簿和已有证据均保留，不做删除/覆盖/重导入清理；界面提示草稿保留不等于本稿已验证退出后恢复。

第4runsortSamples=0、pasteSamples=0、switchCount=0。保留已发生排序动作与保存失败，但不给排序时延补数字，也不继续试5次排序/5粘贴/10重开。最多只能形成“同规模导入及输入保存前缀对照，原Personal含图原生排序后无法确认持久化”的结论，整体 **PARTIAL / STOPPED_ON_REAL_SAVE_FAILURE**。

本次另一个console事件仍为精确 `http://127.0.0.1:3473/favicon.ico` 404；已明确单列非表格图标告警并保留原始console。它与真实workbook snapshot400必须分开，不能再笼统称“只有favicon错误”。

### 对照可比边界

Personal自由工作簿、整本SQLite与其原autoSaveMs；业务PostgreSQL实体CAS、300ms防抖、50行批次与关联校验。Personal原生排序改工作簿并保存，业务排序是稳定ID视图投影；Personal返回库重开也不是业务SPA切模块。输入是1000×23台次加技术/关系列，业务10列可写主测是1000×27角度层，两者千行规模相同但业务合同不相同。可并列共同定义的选择/普通按键样本，不能由此给总体性能输赢结论。原Personal只读作为参考，不因对照发现限制扩展本轮修复范围。

## a53已通过的历史完整千行run

[compound-performance-evidence/1791877773130224000](/Users/lixiaochen/Downloads/feishu_timeline_app/var/admin-worktree/var/light-truck-sheets-02-04/compound-performance-evidence/1791877773130224000/run.log) runtimea53，1 PASS/3.3m，全部50/50/5/5/5、30图、10切换完成。冷1461.595/暖1213.885ms；选择p9547.650/max51.750，按键p9556.235/**max223.940**，普通保存含防抖max468.420，排序max79.470、筛选max69.460、粘贴本地max67.465ms。

| 历史粘贴次数 | 本地 ms | 全批服务端 ms |
|---|---:|---:|
| 1 | 66.025 | 1397.070 |
| 2 | 57.270 | 1626.830 |
| 3 | 67.465 | 1453.460 |
| 4 | 57.760 | 1706.010 |
| 5 | 56.160 | **2078.705** |

第5次历史批量保存超过2秒；当时脚本仅有普通保存2秒门禁，不能将旧PASS写成“全部保存≤2秒”。key-42起始到commit199.510ms、commit到paint24.430ms，原样保留慢响应。历史图滚动trace1688.732ms、644个RunTask max8.139ms，仅覆盖该滚动窗口；beforePhotos支持longtask、>200ms数组为空。该历史run有2条原件429且明确恢复、没有未分类异常，不能写“从未429”。

## 68颜色自动保存闭合与40挂载补充

a53快速输入第33笔（索引32）拆写两基地，确定性旧版两笔原生红测1791878569399353000首PATCH保存第二笔未提交prefix并跳行。68只让自动定时器调用save(false)，显式保存/核实仍finishEditing；两笔专项1791878915149554000 1 PASS/9.3s，首body只含第一笔，第二笔在原格追加suffix并同ID保存/整页重开0额外写。中间prefix来自实际截图独立视觉记录，不伪称空DOM缓冲读到了文本；先前坐标前置失败与视觉marker失败另留历史，不算产品红测或完整PASS。

68连续快输1791878845087386000 1 PASS/47.4s，指标见前面小表对照。颜色修复不覆盖旧历史数据，68完整千行则另有本文首节新run。

68剪贴板1791879230973373000 1 PASS/55.0s：10完整“颜色→人员→检验→产量→颜色”循环40目的挂载、切换业务写0；每目的页2个live canvas。第2–10轮DOM人员607/检验708/产量784/颜色670稳定，首轮前两项603/706，不能说全部样本完全一样。使用小检验活动，不冒充千行40挂载。随后同页3新图PNG/JPEG/截图trusted Meta+V、普通文字、新context原件hash/解码通过；4本地图独立验证通过。

## 未验证范围

SYSTEM_IME连续两次CUA策略拒绝后停止，NOT_VERIFIED。Office生产文件实际Excel部分通过、检验超时，整体OFFICE_NOT_VERIFIED。Personal同规模前缀有效但含图sort后的snapshot400未修复，不扩展原项目、不继续写入。整轮产品负责人尚未确认；生产、main/tag未由本报告改变。
