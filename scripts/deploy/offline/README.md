# 离线依赖的新目标准备入口

`install_runtime_debs.py` 负责固定 R30 的 20 个 deb payload 独占提取与完整验证。它不执行 `dpkg -i`、maintainer scripts、下载、数据库访问或服务启动。范围限定 Ubuntu 24.04 ARM64、UID/GID 1100、`/home/recovery` 直属目录及已认证的精确 122 包基线和三项版本更新。

本入口替代新安装时对旧失败链的依赖。旧 R02 提取和 R03 保留树复验的回执仍是历史证据，不能复制或修改为新目标发生的事实。

## 输入和信任边界

调用者须在此程序之外核对代码、来源包、目标授权、宿主预算读取器及其依赖链。代码自行生成的摘要只标识文件，不授予执行权限。不要对现有运行前缀重复安装。

新 `INPUT` 目录只放批准的公开输入，UID 1100、禁止 group/world 写入：

- 原固定 `selection.json`（`35784a08…`）与 `payload-entries.json`（`c79a86ad…`）。前者的旧路径和观察时间仅作为来源记录；实际目的路径由新绑定确定。
- `base-update-overlay.json`（`7ce7c823…`）及其列明的全部七份公开来源证明；精确三个系统版本及当前文件内容仍实际核对，不安装系统包。
- `host-budget-policy.json`：独立核对后的完整宿主分母及读取器摘要。结构为 `kind=OFFLINE_HOST_BUDGET_SCOPE_V1`、`limit=25769803776`、`expectedRootPaths`、`reader`。`reader` 含 `entrySha256` 和 `dependencies`（每项 `name`、`sha256`）。路径必须是完整独立统计根，不遗漏 VM、缓存、工具及本任务历轮证据；集合限 4096 项、JSON 限 4 MiB。
- 执行前生成的 `budget.json`：实际 `at`、`limit`、`reader`、`scopeNarrowed=false`、`rows`（`path`、`allocatedBytes`）、`totalAllocatedBytes`。`reader` 必须与已认证 policy 完全相同，rows 的完整集合和总和必须相符。宿主包装负责真正运行并验证该读取器；仅把摘要写进 JSON 不构成执行证明。

`BASE` 是本目标已验证的原 R27 基包目录，含其实际 `INSTALL-RECEIPT.json`、固定 `dependencies/base-prerequisites.json` 和 20 个原始 deb。调用者提供该目标实际回执的完整 SHA。程序核对 R27 archive/manifest/身份/数量和目标路径，并另核固定 deb 全字节；不要求旧目标的回执摘要、boot 或失败 PID。

## 两个阶段

以下为命令结构；参数必须是已审查的实际路径及完整摘要，不能原样执行占位符。

```text
python3 -I -B install_runtime_debs.py prepare-target \
  --input INPUT --base BASE --target NEW_PREFIX --output NEW_EVIDENCE \
  --base-install-sha256 ACTUAL_BASE_RECEIPT_SHA \
  --budget-policy-sha256 REVIEWED_COMPLETE_HOST_POLICY_SHA

python3 -I -B install_runtime_debs.py install --execute \
  --input INPUT --binding-sha256 REVIEWED_NEW_TARGET_BINDING_SHA \
  --budget-sha256 FRESH_ACTUAL_BUDGET_SHA
```

`prepare-target` 只独占写入 `INPUT/target-binding.json`，采集当前 hostname/boot/平台及新路径，返回摘要供外部核对。`NEW_PREFIX`、`NEW_EVIDENCE` 必须不存在；四个目录互不相同。新绑定不能授权自己。`install` 缺少 `--execute` 时只报告 PLAN，不读取目标。

执行再次核对当前 boot 和完整绑定。宿主预算不得超过 24 GiB，预留 320 MiB；guest 执行前须至少有 1 GiB + 320 MiB。全过程维持 1 GiB 空间底线、payload 256 MiB 和证据 16 MiB 停线。超时、失败、已存在目标一律拒绝并保留，不自动删除或重试。

成功结果必须来自本次真实 20 包提取、完整树读回、134 个 ELF loader 与 9 个版本命令。canonical-first 库归属和同次 PID/root/base 匿名根验证复用最终修复，不允许未知库或系统中的同名 20 包库回退。正常 pidfd/SIGTERM 收尾保留。

若本次只验证新提取入口，可显式加 `--defer-native-checks`：仍实际检查精确基础包、20 包全部提取和完整树前后读回，但不重复 loader/版本命令。该阶段只写 `FIXED_RUNTIME_PAYLOAD_EXTRACTED_AND_READBACK_VERIFIED`，`nativeChecks=NOT_EXECUTED`、`loader=null`；不能作为原生运行准入或把旧 loader 结果改标为新执行。默认完整模式不变，后续运行仍需要相应真实证据。

## 当前验证边界

此组件已有本机边界测试以及保留的实际 loader/owner 输出的纯解析回归。临时路径测试仅模拟 Linux UID，不能证明新目标实际权限、安装或运行。新目标宿主包装、联合 app/scanner 配置与生命周期适配另行完成；本文件不是整套软件的最终 INSTALL，也不宣称 A15-09 完成。

本机目标检查：

```text
python3 -I -B scripts/deploy/offline/test_install_runtime_debs.py -v
```

## 扫描器健康生命周期入口

`install_scanner.py` 保留 R03 的官方数据、locale、native/maps、容量、时效和正常 pidfd 停止实现，增加正常新目标准备及阶段连接。旧失败记录不作为输入，也不修改旧 R03。E122 已实际完成正常 prepare/loader/import/start/verify 并接回应用，记录在原验收矩阵；此限定阶段不等于 A15-09 完成。

固定支持原 R30 的 Ubuntu ARM64、UID/GID 1100、3941 应用和精确运行时内容。`target-binding.json` 由外部明确目标并按全文 SHA 固定，包含以下三类事实：

- 固定制品：应用身份、基包/应用清单、运行时叶集合、20 包与基础系统来源、loader、两项官方非执行数据、CVD 字节和安全阈值不由新目标重新认可。
- 目标：`paths` 的 input/software/sourceSoftware/dependencies/scanner 均为 `/home/recovery` 互异直属目录；一个固定 run；外部真实 assembly/native/dependency 成功回执、budget policy、data baseline 摘要。输入与已有软件目录须独立验证；scanner 目录在 prepare 时必须不存在。
- 本次身份：`currentBootId`、PG/Redis 的实际启动回执与 owner、目标 data baseline。阶段成功 SHA 分别传入后继，不回写基础 binding，避免循环自举。

`dependencyReceipt` 必须是该目录、该 boot 的完整 `NEW_PREFIX_RUNTIME_PAYLOAD_AND_ELF_VERIFIED`，且具备134 ELF/9版本的真实结果；新 D1 payload-only 回执禁止作 native 准入。同目录与字节未变时可复用该目标已实测的依赖与最终 native 证明，记录 `priorActualLoaderReused=true`、`loaderReexecuted=false`，不必为阶段连接机械重跑。这里只读取直接成功回执；其历史审计引用不作为新的运行前置。

输入目录包含 `install_scanner.py`、`target-binding.json`、`scanner-manifest.json`、`data-baseline.json`、`official-data-source-proof.json`、`host-budget-policy.json` 和各阶段新鲜的 `budget-<SHA>.json`。`scanner-manifest.json` 固定代码、两数据文件、完整 budget policy 的真实大小/摘要，以及目标 binding SHA、确定性配置 SHA。它由外部审查传入，不因自算 SHA 自动可信。运行时清单的目标字段可以变化，但全部170叶内容必须符合固定集合。

命令形状（参数为实际全文 SHA，不是可直接执行的模板值）：

```text
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA - prepare
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA PREP_SHA loader EVENT
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA PREP_SHA import EVENT LOADER_EVENT LOADER_SHA
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA PREP_SHA start RUN INNER_IMPORT_SHA LOADER_EVENT LOADER_SHA IMPORT_EVENT IMPORT_PHASE_SHA
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA PREP_SHA verify RUN START_SHA EVENT
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA PREP_SHA observe RUN START_SHA EVENT SECONDS
python3 -I -B install_scanner.py --execute CONTENT_SHA TARGET_SHA BUDGET_SHA - stop RUN START_SHA EVENT
```

prepare 只在新根创建一次配置；loader/import/start 均绑定同一配置和准备回执。import 的 `IMPORT-RECEIPT.json` 内层 SHA 与事件 `receipt.json` 外层 SHA 分开传入，不能混用。每阶段写独占事件、失败保留、不自动重试；输出 `receipt` 是实际 JSON 文件路径。stop 只针对批准的本 run、同 boot 和实际 owner，保持可在 CVD 过期或 PG/Redis 不在线时正常停止，不强杀、不删除残留 PID 文件。

`predecessor.mode=absent` 只适用于无在用前任的目标；loader/import/start 仍实查所有进程和端口。已有实例替换使用 `own-normal-stop`，绑定四个旧 owner、其实际 app/scanner 停止回执及 `beforeStopObservation`，不能把 absence 当绕过在用服务的开关。已有 app 停止回执没有 boot 字段，所以先在同 boot、四进程仍存活时生成观察：

```text
python3 -I -B install_scanner.py --observe-predecessor SOURCE_SHA EVENT
```

这个独立只读阶段读取已外部固定的 `predecessor-source.json`（固定 kind、boot、实际 applicationStart/scannerStart 的 path/SHA），核四 owner 的 PID/tick/UID/exe/cwd/argv，并保存同 boot 观察。它不停止任何服务，不读取环境变量/秘密，也不把观察标作停止成功。之后正常停止真实前任；新 binding 引用实际观察和停止回执。新安装的 absent 分支不需要这份替换专用材料。最终 INSTALL 及应用接入仍需完成，当前文档不是完整交付入口。


## 新实例配置的首次生成

`prepare_instance.py` 为固定3941联合软件生成一次全新的隔离实例配置，支持文件为 `instance_software.py`、`instance_policy.py`。调用方在进程之外固定这三个源码文件和公开target binding，脚本默认PLAN，不以自算hash授权执行。

本轮固定复用E102已初始化的独立库及低权role；仅执行进程从批准的0600连接文件投影DATABASE_URL，保存到本实例0700/private下的0600单键输入与runtime-env。旧Redis连接不采纳，旧preview-private不读取。新Redis6381凭据、空持久化目录、TLS和应用3594/Web3595/HTTPS45474配置只在首次生成时建立；目标已存在即拒绝。普通启动或重启必须读取本实例原私有文件和原Redis数据，不能重新运行生成器、清空AOF、轮换密码或重发证书。私有文件不得进入通用包、公开回执或命令行。

输入binding固定kind/目标boot和hostname/软件与依赖路径/预算完整scope/两支持模块SHA/selection/直接成功native回执。生成前要求新鲜只读DB/低权/54迁移/无对象依赖回执、实际内存和完整磁盘预算；完整核当前app/runtime叶及实际native库字节，TLS经已认证20deb openssl与显式loader执行；不重跑134加载项。新CA仅用于本实例严格hostname验证，不改系统/浏览器信任。生成后调用本产品编译配置validator并在内存读回私有值；输出不含私有内容或摘要。

```text
python3 -I -B prepare_instance.py --execute   --binding ACTUAL_PUBLIC_BINDING --binding-sha256 REVIEWED_BINDING_SHA   --budget ACTUAL_FRESH_BUDGET --budget-sha256 REVIEWED_BUDGET_SHA
```

这一步不连接数据库或启动服务；数据库现状、对应对象目录、Redis/API/Web/代理启动及同配置重启另验。PG和已健康scanner是共享依赖，不能由新实例停止入口管理。当前配置入口有11项本机边界用例；E124已从已提交工具在真实目标生成并通过产品配置校验；E130已完成原配置启动、原管理员使用和同配置正常重启；完整INSTALL仍不据此关闭。


`instance_lifecycle.py` 将普通 `start` 与 `stop` 分开，读取已生成的本实例配置；支持模块为 `instance_processes.py` 和 `instance_scanner.py`。新四进程用独立端口/日志/run记录，PG与已健康scanner只作为依赖。正常stop需要外部固定本次实际成功start回执，核同boot/四owner，禁止原六进程，不受CVD或容量过期阻止。启动失败对捕获的Redis owner独立正常收尾。E130已完成该入口的实际start/auth/stop/restart/auth及独审；仅闭合A2限定运行链，原停止检查失败保留。

`shared_scanner_readback.py` 只调用已固定扫描器组件的只读验证链，不调用其启动窗口的失败清理，因此验证失败也不能停止共享扫描器。2026-10-28 续接已将历史配置出处与当前boot分开，当前scanner绑定V2使用新签名及实际CLEAN/EICAR，原生软件/尺寸边界仅按输入适用性复用。E126/E127已恢复原scanner和预览；A2自身普通启动及同配置重启另验。

`refresh_signatures.py` 在新独占目录执行一次官方 FreshClam 更新及三份 sigtool 验签，保留旧库，48小时按 daily 内部签发时间计算。严格CA、一次尝试、600秒、完整宿主预算、guest 1GiB底线和320MiB采样窗口保留；子树通过独占session和pidfd正常收尾，不强杀。它不启动扫描器、不修改现有配置；实际加载新库及CLEAN/EICAR另验。控制器和支持模块须由外部固定已审源码摘要；无 --execute 只输出PLAN。

普通实例启动将配置创建boot保留为历史出处，当前runtime仍校验真实boot。`resume_preview.py`仅复用原预览配置，原配置不重建；独立审查b2a消费修复和E127实际读回已成立，但不代A2或完整安装合同。


## 精确基础包更新的运行适配

A2 runtime binding 可显式携带 `baseUpdate`，包含 `result`、`metadata`、`analysis` 三个公开文件引用（各有path/bytes/sha256）。当前仅支持 E128 已认证的 Ubuntu ARM64 `libbrotli1 1.1.0-2ubuntu0.1`：固定来源、17项包payload实际读回和受影响libcurl定向loader证明；原122包/203库历史记录保持不变。只有两份确定的Brotli库允许使用新摘要，其alias、当前包版本、大小/权限/owner和其他依赖仍逐项检查。缺省不使用更新，任意后续版本或第三份库变化仍拒绝。

调用者在程序之外完成来源及差异审查后，才可把三份实际证据加入新的运行binding；程序内固定摘要只识别证据，不代替外部批准。该补充不修改E124创建binding或私有配置，不重新安装系统包，不重跑134项loader，也不扩大实际运行map清单。普通停止不读取此更新或其他启动准入条件。`nativeAdmission` 在新的实际启动结果中同时保留旧native身份与当前基础包更新身份。A2实际运行结果仍以执行Ledger/矩阵为准。


## 三个入口的同一精确更新与只读准入

D1、首次配置和签名刷新现均支持显式 `baseUpdate` 三引用，使用同一E128固定证据。缺省仍按旧版本合同核对，未知版本、不同SHA或第三份库不准入。D1保留原三包overlay，补充单列；`baseUpdateSupport`额外绑定`configurationCodeSha256`及固定旧成功`dependencyReceipt`，从本输入目录加载经外部固定的`prepare_instance.py`。只有两份确定Brotli库的当前大小/hash/root0644/精确dpkg owner/alias成立才放行，同包encoder等其他文件不获准。当前总基包版本差异4项，旧overlay的119未变仅指旧三包阶段；补充结果另记当前118未变。

`install_runtime_debs.py prepare-target`可用`--base-update`和`--base-update-sha256`加入仅含上述两字段的公开补充文件；不自动搜索。`check-base-admission --input ... --binding-sha256 ... --budget-sha256 ...`执行固定122包查询和两库owner/bytes检查，不创建target/output、不写日志、不提取或跑loader，明确返回`NOT_INSTALLED_BASE_ADMISSION_VERIFIED`。安装路径仍须独立的`install --execute`，不得把只读结果代安装。

`prepare_instance.py --check-native-admission --binding ... --binding-sha256 ...`完整核既有软件/native来源和当前203库，返回`CONFIG_NOT_GENERATED_NATIVE_ADMISSION_VERIFIED`，不读私有连接文件、不核占用中的业务端口、不生成目录/TLS/Redis。真正首次生成仍为`--execute`，新鲜DB/容量/端口检查不跳过。当前binding的boot必须是现场；可显式指定`historicalEvidenceBootId`仅绑定原成功native历史，其原软件/依赖路径和完整文件字节仍核，不能挪用给新prefix。

`refresh_signatures.py --check-admission`与真正`--execute`共用创建输出目录前的完整准入函数，核当前boot、旧配置来源、精确更新、工具/CA及新鲜完整预算，返回`REFRESH_NOT_EXECUTED_ADMISSION_VERIFIED`；不联网、不创建输出或下载。真正更新仍需一次执行、三CVD验签、48h有效期和之后实际加载/扫描。三项只读入口只证明接线，实际安装/配置/更新语义与既有结果按差异分别判断。
