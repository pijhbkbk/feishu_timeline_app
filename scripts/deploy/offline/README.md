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

## 扫描器健康生命周期入口（尚待实际运行验证）

`install_scanner.py` 保留 R03 的官方数据、locale、native/maps、容量、时效和正常 pidfd 停止实现，增加正常新目标准备及阶段连接。旧失败记录不作为输入，也不修改旧 R03。当前源实现只经过本机有界检查；不能据此关闭 S1/S2 或 A15-09。

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
